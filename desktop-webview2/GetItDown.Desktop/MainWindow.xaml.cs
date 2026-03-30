using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Net;
using System.Net.Sockets;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;

namespace GetItDown.Desktop;

public partial class MainWindow : Window
{
    private static readonly TimeSpan BackendBootTimeout = TimeSpan.FromSeconds(20);
    private static readonly TimeSpan HealthCheckInterval = TimeSpan.FromMilliseconds(500);
    private readonly HttpClient _httpClient = new();
    private readonly Queue<string> _backendLogTail = new();
    private Process? _backendProcess;
    private string? _repoRoot;
    private int _backendPort = 26666;
    private bool _starting;

    public MainWindow()
    {
        InitializeComponent();
        Loaded += MainWindow_OnLoaded;
        Closing += MainWindow_OnClosing;
    }

    private async void MainWindow_OnLoaded(object sender, RoutedEventArgs e)
    {
        await LaunchAsync();
    }

    private async void RetryButton_OnClick(object sender, RoutedEventArgs e)
    {
        await LaunchAsync();
    }

    private async Task LaunchAsync()
    {
        if (_starting)
        {
            return;
        }

        _starting = true;
        SetStatus("Preparing desktop shell...", false);

        try
        {
            _repoRoot = FindRepoRoot();
            _backendPort = ResolveBackendPort(_repoRoot);

            await AppWebView.EnsureCoreWebView2Async();

            if (!await IsBackendHealthyAsync())
            {
                EnsureBuildArtifacts(_repoRoot);
                if (!IsPortAvailable(_backendPort))
                {
                    throw new InvalidOperationException(
                        $"Port {_backendPort} is already in use, but /api/health is unreachable. " +
                        "Stop the conflicting process or change PORT in .env.");
                }

                StartBackend(_repoRoot, _backendPort);
                await WaitForBackendAsync(BackendBootTimeout);
            }

            var appUri = BuildServerUri("/");
            AppWebView.Source = appUri;
            SetStatus($"Connected to {appUri}", false);
        }
        catch (Exception ex)
        {
            SetStatus(ex.Message, true);
            ShowErrorPage(ex.Message);
        }
        finally
        {
            _starting = false;
        }
    }

    private void MainWindow_OnClosing(object? sender, CancelEventArgs e)
    {
        if (_backendProcess == null)
        {
            return;
        }

        try
        {
            if (!_backendProcess.HasExited)
            {
                _backendProcess.Kill();
            }
        }
        catch
        {
            // Ignore shutdown cleanup errors.
        }
        finally
        {
            _backendProcess.Dispose();
            _backendProcess = null;
        }
    }

    private async Task<bool> IsBackendHealthyAsync()
    {
        try
        {
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
            using var response = await _httpClient.GetAsync(BuildServerUri("/api/health"), cts.Token);
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    private async Task WaitForBackendAsync(TimeSpan timeout)
    {
        var deadline = DateTime.UtcNow + timeout;
        SetStatus("Starting local backend service...", false);

        while (DateTime.UtcNow < deadline)
        {
            if (_backendProcess is { HasExited: true })
            {
                throw BuildBackendStartFailureException();
            }

            if (await IsBackendHealthyAsync())
            {
                return;
            }

            await Task.Delay(HealthCheckInterval);
        }

        throw new InvalidOperationException(
            $"Backend failed to start on port {_backendPort} within {timeout.TotalSeconds:0} seconds.");
    }

    private void StartBackend(string repoRoot, int port)
    {
        if (_backendProcess is { HasExited: false })
        {
            return;
        }

        var serverEntry = Path.Combine(repoRoot, "server", "dist", "index.js");
        var nodeExecutable = ResolveNodeExecutable(repoRoot);
        var processStart = new ProcessStartInfo
        {
            FileName = nodeExecutable,
            Arguments = $"\"{serverEntry}\"",
            WorkingDirectory = repoRoot,
            UseShellExecute = false,
            RedirectStandardError = true,
            RedirectStandardOutput = true,
            CreateNoWindow = true
        };

        processStart.EnvironmentVariables["PORT"] = port.ToString();

        try
        {
            _backendProcess = Process.Start(processStart)
                ?? throw new InvalidOperationException("Failed to create backend process.");
            _backendProcess.OutputDataReceived += (_, args) =>
            {
                if (!string.IsNullOrWhiteSpace(args.Data))
                {
                    AppendBackendLog(args.Data);
                    Debug.WriteLine($"[server] {args.Data}");
                }
            };
            _backendProcess.ErrorDataReceived += (_, args) =>
            {
                if (!string.IsNullOrWhiteSpace(args.Data))
                {
                    AppendBackendLog(args.Data);
                    Debug.WriteLine($"[server:error] {args.Data}");
                }
            };
            _backendProcess.BeginOutputReadLine();
            _backendProcess.BeginErrorReadLine();
        }
        catch (Win32Exception)
        {
            throw new InvalidOperationException(
                $"Cannot start Node.js from '{nodeExecutable}'. " +
                "Install Node.js globally or use a portable package with bundled runtime.");
        }
    }

    private static string FindRepoRoot()
    {
        foreach (var origin in new[] { Directory.GetCurrentDirectory(), AppContext.BaseDirectory })
        {
            var current = Path.GetFullPath(origin);
            for (var depth = 0; depth < 10; depth += 1)
            {
                if (LooksLikeRepoRoot(current))
                {
                    return current;
                }

                var parent = Directory.GetParent(current);
                if (parent == null)
                {
                    break;
                }

                current = parent.FullName;
            }
        }

        throw new InvalidOperationException(
            "Cannot locate runtime root. Run inside repository or use packaged desktop output.");
    }

    private static bool LooksLikeRepoRoot(string path)
    {
        var hasFolders = Directory.Exists(Path.Combine(path, "server"))
            && Directory.Exists(Path.Combine(path, "web"));
        if (!hasFolders)
        {
            return false;
        }

        var hasSourceRepo = File.Exists(Path.Combine(path, "package.json"));
        var hasBuiltArtifacts = File.Exists(Path.Combine(path, "server", "dist", "index.js"))
            && File.Exists(Path.Combine(path, "web", "dist", "index.html"));

        return hasSourceRepo || hasBuiltArtifacts;
    }

    private static int ResolveBackendPort(string repoRoot)
    {
        const int defaultPort = 26666;
        var envFile = Path.Combine(repoRoot, ".env");
        if (!File.Exists(envFile))
        {
            return defaultPort;
        }

        foreach (var rawLine in File.ReadLines(envFile))
        {
            var line = rawLine.Trim();
            if (string.IsNullOrWhiteSpace(line) || line.StartsWith("#"))
            {
                continue;
            }

            var separatorIndex = line.IndexOf('=');
            if (separatorIndex <= 0)
            {
                continue;
            }

            var key = line.Substring(0, separatorIndex).Trim();
            if (!key.Equals("PORT", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var value = line.Substring(separatorIndex + 1).Trim().Trim('"', '\'');
            if (int.TryParse(value, out var port) && port is > 0 and <= 65535)
            {
                return port;
            }
        }

        return defaultPort;
    }

    private static void EnsureBuildArtifacts(string repoRoot)
    {
        var serverDistEntry = Path.Combine(repoRoot, "server", "dist", "index.js");
        var webDistIndex = Path.Combine(repoRoot, "web", "dist", "index.html");

        if (File.Exists(serverDistEntry) && File.Exists(webDistIndex))
        {
            return;
        }

        throw new InvalidOperationException(
            "Build artifacts are missing. Run `npm run build` in repo, " +
            "or re-run desktop portable packaging.");
    }

    private static string ResolveNodeExecutable(string repoRoot)
    {
        var bundledNode = Path.Combine(repoRoot, "runtime", "node", "node.exe");
        if (File.Exists(bundledNode))
        {
            return bundledNode;
        }

        return "node";
    }

    private static bool IsPortAvailable(int port)
    {
        return CanBind(IPAddress.Loopback, port) && CanBind(IPAddress.IPv6Loopback, port);
    }

    private static bool CanBind(IPAddress address, int port)
    {
        try
        {
            using var socket = new Socket(address.AddressFamily, SocketType.Stream, ProtocolType.Tcp);
            socket.Bind(new IPEndPoint(address, port));
            return true;
        }
        catch (SocketException)
        {
            return false;
        }
    }

    private void AppendBackendLog(string message)
    {
        lock (_backendLogTail)
        {
            _backendLogTail.Enqueue(message);
            while (_backendLogTail.Count > 8)
            {
                _backendLogTail.Dequeue();
            }
        }
    }

    private InvalidOperationException BuildBackendStartFailureException()
    {
        var message = $"Backend process exited unexpectedly (code: {_backendProcess?.ExitCode}).";
        string[] lines;

        lock (_backendLogTail)
        {
            lines = _backendLogTail.ToArray();
        }

        if (lines.Length > 0)
        {
            message += $"{Environment.NewLine}Recent logs:{Environment.NewLine}{string.Join(Environment.NewLine, lines)}";
        }

        return new InvalidOperationException(message);
    }

    private Uri BuildServerUri(string path)
    {
        return new Uri($"http://127.0.0.1:{_backendPort}{path}");
    }

    private void SetStatus(string message, bool showRetry)
    {
        StatusTextBlock.Text = message;
        RetryButton.Visibility = showRetry ? Visibility.Visible : Visibility.Collapsed;
    }

    private void ShowErrorPage(string message)
    {
        if (AppWebView.CoreWebView2 == null)
        {
            return;
        }

        var safeMessage = System.Net.WebUtility.HtmlEncode(message);
        AppWebView.NavigateToString($@"
<!DOCTYPE html>
<html lang=""en"">
  <head>
    <meta charset=""utf-8"" />
    <title>GetItDone Desktop</title>
    <style>
      body {{
        margin: 0;
        font-family: Segoe UI, sans-serif;
        background: #0f172a;
        color: #e2e8f0;
        display: grid;
        min-height: 100vh;
        place-items: center;
      }}
      .card {{
        max-width: 760px;
        background: #111827;
        border: 1px solid #374151;
        border-radius: 14px;
        padding: 24px;
      }}
      code {{
        background: #1f2937;
        color: #93c5fd;
        padding: 2px 6px;
        border-radius: 6px;
      }}
    </style>
  </head>
  <body>
    <div class=""card"">
      <h2>Failed to launch GetItDone</h2>
      <p>{safeMessage}</p>
      <p>Try commands at repo root:</p>
      <p><code>npm install</code> and <code>npm run build</code></p>
    </div>
  </body>
</html>");
    }
}
