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

# Function to check if a command exists
function Test-Command {
    param([string]$Command)
    $null = Get-Command $Command -ErrorAction SilentlyContinue
    return $?
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
        $webClient = New-Object System.Net.WebClient
        $webClient.DownloadFile($installerUrl, $installerPath)

        Write-Host "Installing Node.js v$nodeVersion (this may take a minute)..." -ForegroundColor Cyan

        # Run MSI installer silently
        $process = Start-Process -FilePath "msiexec.exe" -ArgumentList "/i `"$installerPath`" /qn /norestart" -Wait -PassThru

        if ($process.ExitCode -eq 0) {
            # Refresh PATH
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
            Write-Host "Node.js v$nodeVersion installed successfully!" -ForegroundColor Green
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

# Function to install Node.js - tries multiple methods
function Install-NodeJS {
    param([switch]$Force)

    $message = if ($Force) { "Installing Node.js LTS to replace incompatible version..." } else { "Node.js/npm not found. Installing..." }
    Write-Host "`n$message" -ForegroundColor Yellow

    # Try winget first (Windows 10/11)
    if (Test-Command "winget") {
        Write-Host "Trying winget..." -ForegroundColor Gray
        $result = winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements 2>&1
        if ($LASTEXITCODE -eq 0) {
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
            Write-Host "Node.js installed via winget!" -ForegroundColor Green
            return $true
        }
    }

    # Try chocolatey
    if (Test-Command "choco") {
        Write-Host "Trying Chocolatey..." -ForegroundColor Gray
        choco install nodejs-lts -y 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
            Write-Host "Node.js installed via Chocolatey!" -ForegroundColor Green
            return $true
        }
    }

    # Direct download as fallback
    Write-Host "Package managers unavailable, downloading directly..." -ForegroundColor Gray
    return Install-NodeJSDirect
}

# Function to uninstall Node.js
function Uninstall-NodeJS {
    Write-Host "Removing existing Node.js installation..." -ForegroundColor Yellow

    # Try winget
    if (Test-Command "winget") {
        winget uninstall OpenJS.NodeJS 2>&1 | Out-Null
        winget uninstall "Node.js" 2>&1 | Out-Null
    }

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

    # Clean up PATH references to nodejs
    Start-Sleep -Seconds 2
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
        "${env:ProgramFiles}\Microsoft Visual Studio\2022\Community\VC\Tools\MSVC",
        "${env:ProgramFiles}\Microsoft Visual Studio\2022\Professional\VC\Tools\MSVC",
        "${env:ProgramFiles}\Microsoft Visual Studio\2022\Enterprise\VC\Tools\MSVC"
    )

    foreach ($p in $paths) {
        if (Test-Path $p) { return $true }
    }
    return $false
}

# Function to install Visual Studio Build Tools
function Install-VCBuildTools {
    Write-Host "`nVisual Studio C++ Build Tools required. Installing..." -ForegroundColor Yellow

    # Try winget
    if (Test-Command "winget") {
        Write-Host "Installing via winget (this may take 5-10 minutes)..." -ForegroundColor Cyan
        winget install Microsoft.VisualStudio.2022.BuildTools --accept-package-agreements --accept-source-agreements --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended" 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Visual Studio Build Tools installed!" -ForegroundColor Green
            return $true
        }
    }

    # Try chocolatey
    if (Test-Command "choco") {
        Write-Host "Installing via Chocolatey..." -ForegroundColor Cyan
        choco install visualstudio2022buildtools visualstudio2022-workload-vctools -y 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Visual Studio Build Tools installed!" -ForegroundColor Green
            return $true
        }
    }

    # Direct download
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

# ============================================
# MAIN SCRIPT
# ============================================

Write-Host "`n[0/4] Checking prerequisites..." -ForegroundColor Yellow

$needsRestart = $false

# Check/Install Node.js
if (-not (Test-Command "node")) {
    if (-not (Install-NodeJS)) {
        Write-Host "Failed to install Node.js. Please install manually from https://nodejs.org/" -ForegroundColor Red
        exit 1
    }
    $needsRestart = $true
}

# Check Node.js version - auto-fix if Node 24+
$nodeVersion = node --version 2>$null
if ($nodeVersion) {
    $nodeVersionMatch = [regex]::Match($nodeVersion, 'v(\d+)\.')
    if ($nodeVersionMatch.Success) {
        $nodeMajor = [int]$nodeVersionMatch.Groups[1].Value
        if ($nodeMajor -ge 24) {
            Write-Host "`nNode.js $nodeVersion detected - this version has compatibility issues." -ForegroundColor Yellow
            Write-Host "Automatically switching to Node.js LTS..." -ForegroundColor Yellow

            Uninstall-NodeJS

            if (-not (Install-NodeJS -Force)) {
                Write-Host "Failed to install Node.js LTS. Please install manually from https://nodejs.org/" -ForegroundColor Red
                exit 1
            }
            $needsRestart = $true
        }
    }
}

# Check/Install Visual Studio Build Tools
if (-not (Test-VCBuildTools)) {
    if (-not (Install-VCBuildTools)) {
        exit 1
    }
    $needsRestart = $true
}

if ($needsRestart) {
    Write-Host "`n============================================" -ForegroundColor Green
    Write-Host "Prerequisites installed successfully!" -ForegroundColor Green
    Write-Host "Please RESTART your terminal and run this script again." -ForegroundColor Yellow
    Write-Host "============================================" -ForegroundColor Green
    exit 0
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
    }
    Write-Host "  Done!" -ForegroundColor Green
} else {
    Write-Host "`n[1/4] Skipping clean (use -Clean flag)" -ForegroundColor Gray
}

# Install dependencies
if (-not $SkipInstall) {
    Write-Host "`n[2/4] Installing dependencies..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "npm install failed!" -ForegroundColor Red
        exit 1
    }
    Write-Host "  Done!" -ForegroundColor Green
} else {
    Write-Host "`n[2/4] Skipping npm install" -ForegroundColor Gray
}

# Build shared
Write-Host "`n[3/4] Building shared package..." -ForegroundColor Yellow
npm run build -w @connectty/shared
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "  Done!" -ForegroundColor Green

# Build desktop
Write-Host "`n[4/4] Building Windows distribution..." -ForegroundColor Yellow
npm run dist:win -w @connectty/desktop
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== BUILD COMPLETE ===" -ForegroundColor Green
Write-Host "Output: packages\desktop\release\" -ForegroundColor Cyan

if (Test-Path "packages\desktop\release") {
    Write-Host "`nFiles:"
    Get-ChildItem "packages\desktop\release" -File | ForEach-Object { Write-Host "  - $($_.Name)" }
}
