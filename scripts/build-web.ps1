# Connectty Web Platform Build Script for Windows
# Usage: .\scripts\build-web.ps1 [-Clean] [-SkipInstall] [-Dev]

param(
    [switch]$Clean,
    [switch]$SkipInstall,
    [switch]$Dev
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

Write-Host "=== Connectty Web Platform Build Script ===" -ForegroundColor Cyan
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
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Write-Host "  Downloading from nodejs.org..." -ForegroundColor Gray
        $webClient = New-Object System.Net.WebClient
        $webClient.DownloadFile($installerUrl, $installerPath)

        Write-Host "  Running installer (this may take a minute)..." -ForegroundColor Gray

        $process = Start-Process -FilePath "msiexec.exe" -ArgumentList "/i `"$installerPath`" /qn /norestart" -Wait -PassThru

        if ($process.ExitCode -eq 0) {
            Write-Host "Node.js v$nodeVersion installed!" -ForegroundColor Green
            Refresh-Path

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

# Function to install Visual Studio Build Tools
function Install-VCBuildTools {
    Write-Host "`nVisual Studio C++ Build Tools required for node-pty. Installing..." -ForegroundColor Yellow

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

# ============================================
# MAIN SCRIPT
# ============================================

Write-Host "`n[0/5] Checking prerequisites..." -ForegroundColor Yellow

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

    Refresh-Path
    Find-NodeJS | Out-Null

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

# Check/Install Visual Studio Build Tools (required for node-pty)
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

# Display versions
$nodeVersion = node --version
$npmVersion = npm --version
Write-Host "  Node.js: $nodeVersion" -ForegroundColor Green
Write-Host "  npm: $npmVersion" -ForegroundColor Green
Write-Host "  VS C++ Build Tools: OK" -ForegroundColor Green

# Clean
if ($Clean) {
    Write-Host "`n[1/5] Cleaning..." -ForegroundColor Yellow
    @("node_modules", "packages\server\node_modules", "packages\shared\node_modules", "packages\web\node_modules") | ForEach-Object {
        if (Test-Path $_) { Remove-Item -Recurse -Force $_ -ErrorAction SilentlyContinue }
    }
    Get-ChildItem -Path "packages" -Directory | ForEach-Object {
        $dist = Join-Path $_.FullName "dist"
        if (Test-Path $dist) { Remove-Item -Recurse -Force $dist -ErrorAction SilentlyContinue }
    }
    Write-Host "  Done!" -ForegroundColor Green
} else {
    Write-Host "`n[1/5] Skipping clean (use -Clean flag)" -ForegroundColor Gray
}

# Install dependencies
if (-not $SkipInstall) {
    Write-Host "`n[2/5] Installing dependencies..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "npm install failed!" -ForegroundColor Red
        exit 1
    }
    Write-Host "  Done!" -ForegroundColor Green
} else {
    Write-Host "`n[2/5] Skipping npm install" -ForegroundColor Gray
}

# Build shared
Write-Host "`n[3/5] Building shared package..." -ForegroundColor Yellow
npm run build -w @connectty/shared
if ($LASTEXITCODE -ne 0) {
    Write-Host "Shared build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "  Done!" -ForegroundColor Green

# Build server
Write-Host "`n[4/5] Building server..." -ForegroundColor Yellow
npm run build -w @connectty/server
if ($LASTEXITCODE -ne 0) {
    Write-Host "Server build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "  Done!" -ForegroundColor Green

# Build web client
Write-Host "`n[5/5] Building web client..." -ForegroundColor Yellow
npm run build -w @connectty/web
if ($LASTEXITCODE -ne 0) {
    Write-Host "Web client build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "  Done!" -ForegroundColor Green

# Create distribution directory
$DistDir = Join-Path $ProjectRoot "dist\web"
if (Test-Path $DistDir) {
    Remove-Item -Recurse -Force $DistDir
}
New-Item -ItemType Directory -Force -Path $DistDir | Out-Null

Write-Host "`n[+] Creating distribution package..." -ForegroundColor Yellow

# Copy server dist
Copy-Item -Recurse "packages\server\dist" "$DistDir\server"
Copy-Item "packages\server\package.json" "$DistDir\server\"

# Copy web client dist
Copy-Item -Recurse "packages\web\dist" "$DistDir\public"

# Copy shared dist
New-Item -ItemType Directory -Force -Path "$DistDir\shared" | Out-Null
Copy-Item -Recurse "packages\shared\dist" "$DistDir\shared\"
Copy-Item "packages\shared\package.json" "$DistDir\shared\"

# Create production package.json
$packageJson = @"
{
  "name": "connectty-web",
  "version": "1.0.0",
  "description": "Connectty Web Platform",
  "main": "server/index.js",
  "scripts": {
    "start": "node server/index.js"
  },
  "dependencies": {}
}
"@
Set-Content -Path "$DistDir\package.json" -Value $packageJson

# Create startup batch file
$startBat = @"
@echo off
REM Connectty Web Platform Startup Script

cd /d "%~dp0"

if not exist ".env" (
    echo Creating default .env file...
    (
        echo # Connectty Web Platform Configuration
        echo PORT=3000
        echo HOST=0.0.0.0
        echo.
        echo # Database Configuration ^(PostgreSQL^)
        echo DB_HOST=localhost
        echo DB_PORT=5432
        echo DB_NAME=connectty
        echo DB_USER=connectty
        echo DB_PASSWORD=connectty
        echo.
        echo # JWT Configuration
        echo JWT_SECRET=change-this-to-a-secure-random-string
        echo JWT_EXPIRY=24h
        echo.
        echo # CORS ^(comma-separated origins, or * for all^)
        echo CORS_ORIGIN=*
        echo.
        echo # Active Directory ^(optional^)
        echo AD_ENABLED=false
    ) > .env
    echo.
    echo Please edit .env with your configuration, then run this script again.
    pause
    exit /b
)

if not exist "node_modules" (
    echo Installing production dependencies...
    cd server
    call npm install --omit=dev
    cd ..
)

echo Starting Connectty Web Platform...
echo Server: http://localhost:3000
node server\index.js
"@
Set-Content -Path "$DistDir\start.bat" -Value $startBat

# Create PowerShell startup script
$startPs1 = @'
# Connectty Web Platform Startup Script

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

if (-not (Test-Path ".env")) {
    Write-Host "Creating default .env file..."
    @"
# Connectty Web Platform Configuration
PORT=3000
HOST=0.0.0.0

# Database Configuration (PostgreSQL)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=connectty
DB_USER=connectty
DB_PASSWORD=connectty

# JWT Configuration
JWT_SECRET=change-this-to-a-secure-random-string
JWT_EXPIRY=24h

# CORS (comma-separated origins, or * for all)
CORS_ORIGIN=*

# Active Directory (optional)
AD_ENABLED=false
"@ | Set-Content ".env"
    Write-Host ""
    Write-Host "Please edit .env with your configuration, then run this script again."
    exit
}

if (-not (Test-Path "node_modules")) {
    Write-Host "Installing production dependencies..."
    Set-Location server
    npm install --omit=dev
    Set-Location ..
}

Write-Host "Starting Connectty Web Platform..."
Write-Host "Server: http://localhost:$($env:PORT ?? 3000)"
node server\index.js
'@
Set-Content -Path "$DistDir\start.ps1" -Value $startPs1

Write-Host "`n=== BUILD COMPLETE ===" -ForegroundColor Green
Write-Host "Output: $DistDir" -ForegroundColor Cyan
Write-Host ""
Write-Host "To run the web platform:"
Write-Host "  1. cd $DistDir"
Write-Host "  2. .\start.bat  (or .\start.ps1)"
Write-Host ""
Write-Host "For production deployment:"
Write-Host "  1. Copy the dist\web folder to your server"
Write-Host "  2. Configure PostgreSQL database"
Write-Host "  3. Edit .env with your settings"
Write-Host ""

if (Test-Path $DistDir) {
    Write-Host "Distribution contents:"
    Get-ChildItem $DistDir | ForEach-Object { Write-Host "  - $($_.Name)" }
}

# Dev mode - start the servers
if ($Dev) {
    Write-Host "`n[DEV] Starting development servers..." -ForegroundColor Cyan
    Set-Location $ProjectRoot
    Start-Process -FilePath "npm" -ArgumentList "run dev:server" -NoNewWindow
    npm run dev:web
}
