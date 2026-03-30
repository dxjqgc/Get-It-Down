#!/usr/bin/env node

const { spawnSync } = require("child_process");
const path = require("path");

function normalizePathPrefix(input) {
  if (!input) {
    return input;
  }

  return input.startsWith("\\\\?\\") ? input.slice(4) : input;
}

function resolveRepoRoot() {
  const pkgJsonPath = normalizePathPrefix(process.env.npm_package_json || "");
  if (pkgJsonPath) {
    return path.dirname(pkgJsonPath);
  }

  return normalizePathPrefix(process.cwd());
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: false
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  process.exit(result.status ?? 1);
}

const action = process.argv[2];
const root = resolveRepoRoot();
const desktopProject = path.join(root, "desktop-webview2", "GetItDown.Desktop", "GetItDown.Desktop.csproj");
const portableScript = path.join(root, "desktop-webview2", "scripts", "publish-portable.ps1");

switch (action) {
  case "build":
    run("dotnet", ["build", desktopProject], root);
    break;
  case "run":
    run("dotnet", ["run", "--project", desktopProject], root);
    break;
  case "publish":
    run(
      "dotnet",
      ["publish", desktopProject, "-c", "Release", "-r", "win-x64", "--self-contained", "true"],
      root
    );
    break;
  case "portable":
    run("pwsh", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", portableScript], root);
    break;
  default:
    console.error("Usage: node scripts/desktop-command.cjs <build|run|publish|portable>");
    process.exit(1);
}
