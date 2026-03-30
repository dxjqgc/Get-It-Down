param(
    [string]$Configuration = "Release",
    [string]$RuntimeIdentifier = "win-x64",
    [string]$NodeVersion = "",
    [string]$NodeDownloadBases = "",
    [int]$DownloadTimeoutSec = 60,
    [int]$DownloadRetriesPerMirror = 2,
    [switch]$SkipBuild,
    [switch]$SkipNodeModulesCopy,
    [switch]$SkipNodeBundle
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Write-Step([string]$Message) {
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Resolve-NodeDownloadBases([string]$RequestedBases) {
    if (-not [string]::IsNullOrWhiteSpace($RequestedBases)) {
        return $RequestedBases -split "[,;]" | ForEach-Object { $_.Trim() } | Where-Object { $_ }
    }

    if (-not [string]::IsNullOrWhiteSpace($env:NODE_DOWNLOAD_BASES)) {
        return $env:NODE_DOWNLOAD_BASES -split "[,;]" | ForEach-Object { $_.Trim() } | Where-Object { $_ }
    }

    return @(
        "https://npmmirror.com/mirrors/node",
        "https://mirrors.aliyun.com/nodejs-release",
        "https://mirrors.cloud.tencent.com/nodejs-release",
        "https://nodejs.org/dist"
    )
}

function Download-FromMirrors(
    [string[]]$MirrorBases,
    [string]$Version,
    [string]$ArchiveName,
    [string]$OutFile,
    [int]$TimeoutSec,
    [int]$RetriesPerMirror
) {
    $errors = New-Object System.Collections.Generic.List[string]

    foreach ($base in $MirrorBases) {
        $normalizedBase = $base.TrimEnd('/')
        $url = "$normalizedBase/v$Version/$ArchiveName"

        for ($attempt = 1; $attempt -le $RetriesPerMirror; $attempt++) {
            Write-Host "Downloading: $url (attempt $attempt/$RetriesPerMirror, timeout ${TimeoutSec}s)"
            try {
                if (Test-Path $OutFile) {
                    Remove-Item -Path $OutFile -Force
                }

                Invoke-WebRequest -Uri $url -OutFile $OutFile -TimeoutSec $TimeoutSec
                if ((Get-Item $OutFile).Length -le 0) {
                    throw "Downloaded archive is empty."
                }
                return
            }
            catch {
                $message = $_.Exception.Message
                $errors.Add("$url (attempt $attempt): $message")
                if ($attempt -lt $RetriesPerMirror) {
                    Start-Sleep -Seconds ([Math]::Min(12, 2 * $attempt))
                }
            }
        }
    }

    throw "Failed to download Node archive. Errors:`n$($errors -join "`n")"
}

function Install-MinimalRuntimeDependencies([string]$ServerPackagePath, [string]$RuntimeRoot) {
    if (-not (Test-Path $ServerPackagePath)) {
        throw "Missing server package file: $ServerPackagePath"
    }

    $serverPackage = Get-Content -Path $ServerPackagePath -Raw | ConvertFrom-Json
    if ($null -eq $serverPackage.dependencies -or $serverPackage.dependencies.PSObject.Properties.Count -eq 0) {
        throw "No server runtime dependencies found in $ServerPackagePath"
    }

    $runtimePackage = [ordered]@{
        name = "get-it-done-runtime"
        private = $true
        type = "module"
        dependencies = [ordered]@{}
    }

    foreach ($dependency in $serverPackage.dependencies.PSObject.Properties) {
        $runtimePackage.dependencies[$dependency.Name] = [string]$dependency.Value
    }

    $runtimePackagePath = Join-Path $RuntimeRoot "package.json"
    $runtimePackage | ConvertTo-Json -Depth 20 | Set-Content -Path $runtimePackagePath -Encoding UTF8

    Push-Location $RuntimeRoot
    try {
        $env:NPM_CONFIG_UPDATE_NOTIFIER = "false"
        $env:NPM_CONFIG_FUND = "false"
        $env:NPM_CONFIG_AUDIT = "false"
        & npm install --omit=dev --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) {
            throw "npm install failed with exit code $LASTEXITCODE"
        }
    }
    finally {
        Pop-Location
    }
}

function Resolve-NodeVersion([string]$RequestedVersion) {
    if (-not [string]::IsNullOrWhiteSpace($RequestedVersion)) {
        return $RequestedVersion.Trim().TrimStart('v')
    }

    try {
        $localVersion = (& node -p "process.version" 2>$null).Trim()
        if (-not [string]::IsNullOrWhiteSpace($localVersion)) {
            return $localVersion.TrimStart('v')
        }
    }
    catch {
        # fallback to remote lookup
    }

    try {
        $index = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json"
        $latestLts = $index | Where-Object { $_.lts } | Select-Object -First 1
        if ($null -ne $latestLts -and -not [string]::IsNullOrWhiteSpace($latestLts.version)) {
            return $latestLts.version.TrimStart('v')
        }
    }
    catch {
        throw "Cannot resolve Node version automatically. Please pass -NodeVersion (example: 22.14.0)."
    }

    throw "Cannot resolve Node version automatically. Please pass -NodeVersion."
}

function Resolve-NodeArch([string]$Rid) {
    switch ($Rid) {
        "win-x64" { return "win-x64" }
        "win-x86" { return "win-x86" }
        "win-arm64" { return "win-arm64" }
        default { throw "Unsupported RuntimeIdentifier '$Rid'. Use one of: win-x64, win-x86, win-arm64." }
    }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$desktopProject = Join-Path $repoRoot "desktop-webview2\GetItDown.Desktop\GetItDown.Desktop.csproj"
$outputRoot = Join-Path $repoRoot "desktop-webview2\dist\GetItDownDesktop"

$serverDistSource = Join-Path $repoRoot "server\dist"
$serverPackageSource = Join-Path $repoRoot "server\package.json"
$webDistSource = Join-Path $repoRoot "web\dist"
$envSource = Join-Path $repoRoot ".env"
$serverDataSource = Join-Path $repoRoot "server\data"

Write-Step "Preparing output directory"
if (Test-Path $outputRoot) {
    Remove-Item -Path $outputRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null

if (-not $SkipBuild) {
    Write-Step "Building server/web artifacts"
    Push-Location $repoRoot
    try {
        npm run build
    }
    finally {
        Pop-Location
    }
}

if (-not (Test-Path (Join-Path $serverDistSource "index.js")) -or -not (Test-Path (Join-Path $webDistSource "index.html"))) {
    throw "Missing build artifacts. Ensure server/dist/index.js and web/dist/index.html exist."
}

Write-Step "Publishing desktop shell"
dotnet publish $desktopProject -c $Configuration -r $RuntimeIdentifier --self-contained true -o $outputRoot
if ($LASTEXITCODE -ne 0) {
    throw "dotnet publish failed with exit code $LASTEXITCODE"
}

Write-Step "Copying runtime app assets"
Copy-Item -Path $serverDistSource -Destination (Join-Path $outputRoot "server\dist") -Recurse -Force
Copy-Item -Path $webDistSource -Destination (Join-Path $outputRoot "web\dist") -Recurse -Force

if (Test-Path $envSource) {
    Copy-Item -Path $envSource -Destination (Join-Path $outputRoot ".env") -Force
}

if (Test-Path $serverDataSource) {
    Copy-Item -Path $serverDataSource -Destination (Join-Path $outputRoot "server\data") -Recurse -Force
}

if (-not $SkipNodeModulesCopy) {
    Write-Step "Installing minimal runtime dependencies (server only)"
    Install-MinimalRuntimeDependencies -ServerPackagePath $serverPackageSource -RuntimeRoot $outputRoot
}

if (-not $SkipNodeBundle) {
    $arch = Resolve-NodeArch $RuntimeIdentifier
    $version = Resolve-NodeVersion $NodeVersion
    $mirrorBases = Resolve-NodeDownloadBases $NodeDownloadBases
    $nodeFolderName = "node-v$version-$arch"
    $archiveName = "$nodeFolderName.zip"

    $tempRoot = Join-Path $outputRoot "runtime\.tmp"
    $archivePath = Join-Path $tempRoot $archiveName
    $extractPath = Join-Path $tempRoot "extract"
    $runtimeTarget = Join-Path $outputRoot "runtime\node"

    Write-Step "Downloading portable Node.js v$version"
    New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
    Download-FromMirrors `
        -MirrorBases $mirrorBases `
        -Version $version `
        -ArchiveName $archiveName `
        -OutFile $archivePath `
        -TimeoutSec $DownloadTimeoutSec `
        -RetriesPerMirror $DownloadRetriesPerMirror

    Write-Step "Extracting Node.js runtime"
    if (Test-Path $extractPath) {
        Remove-Item -Path $extractPath -Recurse -Force
    }
    Expand-Archive -Path $archivePath -DestinationPath $extractPath -Force

    if (Test-Path $runtimeTarget) {
        Remove-Item -Path $runtimeTarget -Recurse -Force
    }
    New-Item -ItemType Directory -Path (Split-Path -Parent $runtimeTarget) -Force | Out-Null
    Copy-Item -Path (Join-Path $extractPath $nodeFolderName) -Destination $runtimeTarget -Recurse -Force

    Remove-Item -Path $tempRoot -Recurse -Force
}

Write-Step "Portable package ready"
Write-Host "Output: $outputRoot" -ForegroundColor Green
Write-Host "Run:   $outputRoot\\GetItDown.Desktop.exe" -ForegroundColor Green

$portableZip = Join-Path (Split-Path -Parent $outputRoot) "GetItDownDesktop-portable.zip"
Write-Step "Creating portable zip"
if (Test-Path $portableZip) {
    Remove-Item -Path $portableZip -Force
}
Compress-Archive -Path (Join-Path $outputRoot "*") -DestinationPath $portableZip -CompressionLevel Optimal
Write-Host "Zip:   $portableZip" -ForegroundColor Green
