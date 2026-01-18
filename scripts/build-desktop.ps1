# Connectty Desktop Build Script for Windows
# Usage: .\scripts\build-desktop.ps1 [-Clean] [-SkipInstall]

param(
    [switch]$Clean,
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

Write-Host "=== Connectty Desktop Build Script ===" -ForegroundColor Cyan
Write-Host "Project root: $ProjectRoot"

Set-Location $ProjectRoot

# Common Node.js installation paths
$NodePaths = @(
    "$env:ProgramFiles\nodejs",
    "${env:ProgramFiles(x86)}\nodejs",
    "$env:LOCALAPPDATA\Programs\nodejs",
    "$env:APPDATA\npm",
    "C:\Program Files\nodejs"
)

# Function to find Node.js and add to PATH
function Find-NodeJS {
    foreach ($p in $NodePaths) {
        $nodePath = Join-Path $p "node.exe"
        if (Test-Path $nodePath) {
            if ($env:Path -notlike "*$p*") {
                $env:Path = "$p;$env:Path"
                Write-Host "  Added $p to PATH" -ForegroundColor Gray
            }
            return $true
        }
    }
    return $false
}

# Function to check if a command exists
function Test-Command {
    param([string]$Command)
    $null = Get-Command $Command -ErrorAction SilentlyContinue
    return $?
}

# Function to refresh PATH from registry
function Refresh-Path {
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}

# Function to download and install Node.js LTS directly
function Install-NodeJSDirect {
    Write-Host "Downloading Node.js LTS installer..." -ForegroundColor Cyan

    $nodeVersion = "22.13.1"  # LTS version
    $installerUrl = "https://nodejs.org/dist/v$nodeVersion/node-v$nodeVersion-x64.msi"
    $installerPath = "$env:TEMP\node-installer.msi"

    try {
        # Download installer
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Write-Host "  Downloading from nodejs.org..." -ForegroundColor Gray
        $webClient = New-Object System.Net.WebClient
        $webClient.DownloadFile($installerUrl, $installerPath)

        Write-Host "  Running installer (this may take a minute)..." -ForegroundColor Gray

        # Run MSI installer silently
        $process = Start-Process -FilePath "msiexec.exe" -ArgumentList "/i `"$installerPath`" /qn /norestart" -Wait -PassThru

        if ($process.ExitCode -eq 0) {
            Write-Host "Node.js v$nodeVersion installed!" -ForegroundColor Green

            # Refresh PATH and explicitly add Node.js path
            Refresh-Path

            # Add default Node.js path explicitly
            $defaultNodePath = "$env:ProgramFiles\nodejs"
            if (Test-Path $defaultNodePath) {
                if ($env:Path -notlike "*$defaultNodePath*") {
                    $env:Path = "$defaultNodePath;$env:Path"
                }
            }

            return $true
        } else {
            Write-Host "MSI installer failed with exit code: $($process.ExitCode)" -ForegroundColor Red
            return $false
        }
    } catch {
        Write-Host "Download/install failed: $_" -ForegroundColor Red
        return $false
    } finally {
        if (Test-Path $installerPath) {
            Remove-Item $installerPath -Force -ErrorAction SilentlyContinue
        }
    }
}

# Function to check if Visual Studio C++ Build Tools are installed
function Test-VCBuildTools {
    $vsWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
    if (Test-Path $vsWhere) {
        $vcTools = & $vsWhere -latest -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
        if ($vcTools) { return $true }
    }

    # Check common paths
    $paths = @(
        "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC",
        "$env:ProgramFiles\Microsoft Visual Studio\2022\Community\VC\Tools\MSVC",
        "$env:ProgramFiles\Microsoft Visual Studio\2022\Professional\VC\Tools\MSVC",
        "$env:ProgramFiles\Microsoft Visual Studio\2022\Enterprise\VC\Tools\MSVC"
    )

    foreach ($p in $paths) {
        if (Test-Path $p) { return $true }
    }
    return $false
}

# Function to check if 7-Zip is installed
function Test-7Zip {
    $paths = @(
        "C:\Program Files\7-Zip\7z.exe",
        "C:\Program Files (x86)\7-Zip\7z.exe"
    )
    foreach ($p in $paths) {
        if (Test-Path $p) { return $p }
    }
    return $null
}

# Function to install 7-Zip
function Install-7Zip {
    Write-Host "`n7-Zip not found. Installing..." -ForegroundColor Yellow

    $installerUrl = "https://www.7-zip.org/a/7z2409-x64.exe"
    $installerPath = "$env:TEMP\7z-installer.exe"

    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Write-Host "  Downloading 7-Zip..." -ForegroundColor Gray
        (New-Object System.Net.WebClient).DownloadFile($installerUrl, $installerPath)

        Write-Host "  Installing 7-Zip..." -ForegroundColor Gray
        $process = Start-Process -FilePath $installerPath -ArgumentList "/S" -Wait -PassThru

        if ($process.ExitCode -eq 0) {
            Write-Host "  7-Zip installed!" -ForegroundColor Green
            return $true
        } else {
            Write-Host "  7-Zip installer failed with exit code: $($process.ExitCode)" -ForegroundColor Red
            return $false
        }
    } catch {
        Write-Host "  Failed to install 7-Zip: $_" -ForegroundColor Red
        return $false
    } finally {
        Remove-Item $installerPath -Force -ErrorAction SilentlyContinue
    }
}

# Function to install Visual Studio Build Tools
function Install-VCBuildTools {
    Write-Host "`nVisual Studio C++ Build Tools required. Installing..." -ForegroundColor Yellow

    # Direct download - most reliable
    Write-Host "Downloading Visual Studio Build Tools installer..." -ForegroundColor Cyan
    $vsInstallerUrl = "https://aka.ms/vs/17/release/vs_BuildTools.exe"
    $vsInstallerPath = "$env:TEMP\vs_BuildTools.exe"

    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        (New-Object System.Net.WebClient).DownloadFile($vsInstallerUrl, $vsInstallerPath)

        Write-Host "Installing (this may take 5-10 minutes)..." -ForegroundColor Cyan
        $process = Start-Process -FilePath $vsInstallerPath -ArgumentList "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended" -Wait -PassThru

        if ($process.ExitCode -eq 0 -or $process.ExitCode -eq 3010) {
            Write-Host "Visual Studio Build Tools installed!" -ForegroundColor Green
            return $true
        } else {
            Write-Host "Installer exited with code: $($process.ExitCode)" -ForegroundColor Red
        }
    } catch {
        Write-Host "Failed: $_" -ForegroundColor Red
    } finally {
        Remove-Item $vsInstallerPath -Force -ErrorAction SilentlyContinue
    }

    Write-Host "`nPlease install manually from: https://visualstudio.microsoft.com/visual-cpp-build-tools/" -ForegroundColor Red
    Write-Host "Select 'Desktop development with C++' workload" -ForegroundColor Red
    return $false
}

# Function to uninstall Node.js
function Uninstall-NodeJS {
    Write-Host "Removing existing Node.js installation..." -ForegroundColor Yellow

    # Try to find and run uninstaller from registry
    $uninstallKeys = @(
        "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )

    foreach ($key in $uninstallKeys) {
        Get-ItemProperty $key -ErrorAction SilentlyContinue |
            Where-Object { $_.DisplayName -like "*Node.js*" } |
            ForEach-Object {
                if ($_.UninstallString) {
                    $uninstall = $_.UninstallString -replace "msiexec.exe","" -replace "/I","/X" -replace "/i","/x"
                    Start-Process "msiexec.exe" -ArgumentList "$uninstall /qn /norestart" -Wait -ErrorAction SilentlyContinue
                }
            }
    }

    Start-Sleep -Seconds 2
}

# ============================================
# MAIN SCRIPT
# ============================================

Write-Host "`n[0/4] Checking prerequisites..." -ForegroundColor Yellow

# First, refresh PATH and try to find Node.js
Refresh-Path
$nodeFound = Find-NodeJS

# Check if node command works
if (-not $nodeFound -and -not (Test-Command "node")) {
    Write-Host "`nNode.js not found. Installing..." -ForegroundColor Yellow

    if (-not (Install-NodeJSDirect)) {
        Write-Host "Failed to install Node.js. Please install manually from https://nodejs.org/" -ForegroundColor Red
        exit 1
    }

    # Try to find it again after install
    Refresh-Path
    Find-NodeJS | Out-Null

    # Verify installation
    if (-not (Test-Command "node")) {
        Write-Host "`n============================================" -ForegroundColor Green
        Write-Host "Node.js installed successfully!" -ForegroundColor Green
        Write-Host "Please CLOSE this terminal, open a NEW one," -ForegroundColor Yellow
        Write-Host "and run this script again." -ForegroundColor Yellow
        Write-Host "============================================" -ForegroundColor Green
        exit 0
    }
}

# Get Node.js version
$nodeVersion = node --version 2>$null
if (-not $nodeVersion) {
    Write-Host "Error: node command not working. Please restart your terminal." -ForegroundColor Red
    exit 1
}

# Check Node.js version - auto-fix if Node 24+
$nodeVersionMatch = [regex]::Match($nodeVersion, 'v(\d+)\.')
if ($nodeVersionMatch.Success) {
    $nodeMajor = [int]$nodeVersionMatch.Groups[1].Value
    if ($nodeMajor -ge 24) {
        Write-Host "`nNode.js $nodeVersion detected - this version has compatibility issues." -ForegroundColor Yellow
        Write-Host "Automatically switching to Node.js LTS..." -ForegroundColor Yellow

        Uninstall-NodeJS

        if (-not (Install-NodeJSDirect)) {
            Write-Host "Failed to install Node.js LTS. Please install manually from https://nodejs.org/" -ForegroundColor Red
            exit 1
        }

        Write-Host "`n============================================" -ForegroundColor Green
        Write-Host "Node.js LTS installed!" -ForegroundColor Green
        Write-Host "Please CLOSE this terminal, open a NEW one," -ForegroundColor Yellow
        Write-Host "and run this script again." -ForegroundColor Yellow
        Write-Host "============================================" -ForegroundColor Green
        exit 0
    }
}

# Check/Install Visual Studio Build Tools
if (-not (Test-VCBuildTools)) {
    if (-not (Install-VCBuildTools)) {
        exit 1
    }
    Write-Host "`n============================================" -ForegroundColor Green
    Write-Host "Visual Studio Build Tools installed!" -ForegroundColor Green
    Write-Host "Please CLOSE this terminal, open a NEW one," -ForegroundColor Yellow
    Write-Host "and run this script again." -ForegroundColor Yellow
    Write-Host "============================================" -ForegroundColor Green
    exit 0
}

# Check/Install 7-Zip (required by electron-builder)
$sevenZipPath = Test-7Zip
if (-not $sevenZipPath) {
    if (-not (Install-7Zip)) {
        Write-Host "7-Zip is required for electron-builder. Please install from https://www.7-zip.org/" -ForegroundColor Red
        exit 1
    }
    $sevenZipPath = Test-7Zip
}

if ($sevenZipPath) {
    $env:ELECTRON_BUILDER_7Z_PATH = $sevenZipPath
    Write-Host "  7-Zip: OK ($sevenZipPath)" -ForegroundColor Green
}

# Display versions
$nodeVersion = node --version
$npmVersion = npm --version
Write-Host "  Node.js: $nodeVersion" -ForegroundColor Green
Write-Host "  npm: $npmVersion" -ForegroundColor Green
Write-Host "  VS C++ Build Tools: OK" -ForegroundColor Green

# Clean
if ($Clean) {
    Write-Host "`n[1/4] Cleaning..." -ForegroundColor Yellow
    @("node_modules", "packages\desktop\node_modules", "packages\server\node_modules", "packages\shared\node_modules", "packages\web\node_modules") | ForEach-Object {
        if (Test-Path $_) { Remove-Item -Recurse -Force $_ -ErrorAction SilentlyContinue }
    }
    Get-ChildItem -Path "packages" -Directory | ForEach-Object {
        $dist = Join-Path $_.FullName "dist"
        if (Test-Path $dist) { Remove-Item -Recurse -Force $dist -ErrorAction SilentlyContinue }
        $release = Join-Path $_.FullName "release"
        if (Test-Path $release) { Remove-Item -Recurse -Force $release -ErrorAction SilentlyContinue }
    }
    # Clear electron-builder cache
    $electronBuilderCache = Join-Path $env:LOCALAPPDATA "electron-builder\Cache"
    if (Test-Path $electronBuilderCache) {
        Write-Host "  Clearing electron-builder cache..." -ForegroundColor Gray
        Remove-Item -Recurse -Force $electronBuilderCache -ErrorAction SilentlyContinue
    }
    $electronCache = Join-Path $env:LOCALAPPDATA "electron\Cache"
    if (Test-Path $electronCache) {
        Write-Host "  Clearing electron cache..." -ForegroundColor Gray
        Remove-Item -Recurse -Force $electronCache -ErrorAction SilentlyContinue
    }
    Write-Host "  Done!" -ForegroundColor Green
} else {
    Write-Host "`n[1/4] Skipping clean (use -Clean flag)" -ForegroundColor Gray
}

# Reset package-lock.json to avoid cross-platform conflicts
Write-Host "`n[2/6] Resetting package-lock.json..." -ForegroundColor Yellow
$packageLockPath = Join-Path $ProjectRoot "package-lock.json"
if (Test-Path $packageLockPath) {
    git checkout package-lock.json 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  Reset package-lock.json to repo version" -ForegroundColor Green
    } else {
        Write-Host "  package-lock.json not tracked or no changes" -ForegroundColor Gray
    }
}

# Install dependencies
if (-not $SkipInstall) {
    Write-Host "`n[3/6] Installing dependencies..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "npm install failed!" -ForegroundColor Red
        exit 1
    }
    Write-Host "  Done!" -ForegroundColor Green
} else {
    Write-Host "`n[3/6] Skipping npm install" -ForegroundColor Gray
}

# Fix 7zip-bin if npm failed to download 7za.exe (common Windows issue)
$sevenZipBinDir = Join-Path $ProjectRoot "node_modules\7zip-bin\win\x64"
$sevenZipBinExe = Join-Path $sevenZipBinDir "7za.exe"

if ($sevenZipPath -and (-not (Test-Path $sevenZipBinExe))) {
    Write-Host "  Fixing 7zip-bin with system 7-Zip..." -ForegroundColor Gray
    $sevenZipDir = Split-Path $sevenZipPath -Parent
    $sevenZipDll = Join-Path $sevenZipDir "7z.dll"
    New-Item -ItemType Directory -Force -Path $sevenZipBinDir | Out-Null
    Copy-Item $sevenZipPath $sevenZipBinExe -Force
    if (Test-Path $sevenZipDll) {
        Copy-Item $sevenZipDll (Join-Path $sevenZipBinDir "7z.dll") -Force
    }
}

# Sync version
Write-Host "`n[4/6] Syncing version..." -ForegroundColor Yellow
$versionFile = Join-Path $ProjectRoot "version.json"
if (Test-Path $versionFile) {
    $versionData = Get-Content $versionFile | ConvertFrom-Json
    $fullVersion = $versionData.version
    Write-Host "  Version: $fullVersion" -ForegroundColor Cyan
    node (Join-Path $ProjectRoot "scripts\sync-version.js")
} else {
    Write-Host "  Warning: version.json not found, using package.json version" -ForegroundColor Yellow
    $fullVersion = "1.0.0.0"
}

# Build shared
Write-Host "`n[5/6] Building shared package..." -ForegroundColor Yellow
Set-Location (Join-Path $ProjectRoot "packages\shared")
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    Set-Location $ProjectRoot
    exit 1
}
Set-Location $ProjectRoot
Write-Host "  Done!" -ForegroundColor Green

# Build desktop
Write-Host "`n[6/6] Building Windows distribution..." -ForegroundColor Yellow
Set-Location (Join-Path $ProjectRoot "packages\desktop")
npm run dist:win
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    Set-Location $ProjectRoot
    exit 1
}
Set-Location $ProjectRoot

# Copy final binaries to releases folder
Write-Host "`nCopying to releases folder..." -ForegroundColor Yellow
$ReleasesDir = Join-Path $ProjectRoot "releases"
if (-not (Test-Path $ReleasesDir)) {
    New-Item -ItemType Directory -Force -Path $ReleasesDir | Out-Null
}

$SourceDir = Join-Path $ProjectRoot "packages\desktop\release"
$CopiedFiles = @()

if (Test-Path $SourceDir) {
    # Copy Windows binaries (exe files and blockmap)
    Get-ChildItem $SourceDir -File | Where-Object {
        $_.Extension -in @(".exe", ".blockmap") -or $_.Name -like "*.exe.blockmap"
    } | ForEach-Object {
        $destPath = Join-Path $ReleasesDir $_.Name
        Copy-Item $_.FullName $destPath -Force
        $CopiedFiles += $_.Name
    }
}

Write-Host "`n=== BUILD COMPLETE ===" -ForegroundColor Green
Write-Host "Output: releases\" -ForegroundColor Cyan

if ($CopiedFiles.Count -gt 0) {
    Write-Host "`nWindows Release Files:"
    $CopiedFiles | ForEach-Object { Write-Host "  - $_" -ForegroundColor White }
} else {
    Write-Host "`nNo files were copied to releases folder" -ForegroundColor Yellow
}
