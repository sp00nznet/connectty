# Connectty Desktop Build Script for Linux (Debian) from Windows
# Usage: .\scripts\build-desktop-linux.ps1 [-Clean] [-SkipInstall] [-AppImage]
#
# By default, builds .deb only (works without admin privileges)
# Use -AppImage to build AppImage (requires admin or Developer Mode)

param(
    [switch]$Clean,
    [switch]$SkipInstall,
    [switch]$AppImage  # Build AppImage instead of .deb (requires admin)
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

Write-Host "=== Connectty Desktop Build Script (Linux/Debian) ===" -ForegroundColor Cyan
Write-Host "Project root: $ProjectRoot"

Set-Location $ProjectRoot

# Use system 7-Zip if available
$sevenZipPath = "C:\Program Files\7-Zip\7z.exe"
if (Test-Path $sevenZipPath) {
    $env:ELECTRON_BUILDER_7Z_PATH = $sevenZipPath
    Write-Host "Using system 7-Zip" -ForegroundColor Gray
}

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

# Function to check if WSL is available
function Test-WSL {
    try {
        # Use a simple command to verify WSL actually works
        $wslOutput = wsl echo "wsl-ok" 2>&1
        return ($wslOutput -eq "wsl-ok")
    } catch {
        return $false
    }
}

# Function to check if Docker is available
function Test-Docker {
    try {
        $dockerOutput = docker --version 2>&1
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
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
    Write-Host "`nNode.js not found. Please run build-desktop.ps1 first to install prerequisites." -ForegroundColor Red
    exit 1
}

# Get Node.js version
$nodeVersion = node --version 2>$null
if (-not $nodeVersion) {
    Write-Host "Error: node command not working. Please restart your terminal." -ForegroundColor Red
    exit 1
}

$npmVersion = npm --version
Write-Host "  Node.js: $nodeVersion" -ForegroundColor Green
Write-Host "  npm: $npmVersion" -ForegroundColor Green

# Check cross-compilation capabilities
$hasWSL = Test-WSL
$hasDocker = Test-Docker

if ($hasWSL) {
    Write-Host "  WSL: Available" -ForegroundColor Green
} else {
    Write-Host "  WSL: Not available" -ForegroundColor Yellow
}

if ($hasDocker) {
    Write-Host "  Docker: Available" -ForegroundColor Green
} else {
    Write-Host "  Docker: Not available" -ForegroundColor Yellow
}

# Warn about cross-compilation limitations
if (-not $hasWSL -and -not $hasDocker) {
    Write-Host "`n  Note: Building .deb packages on Windows works best with WSL or Docker." -ForegroundColor Yellow
    Write-Host "  AppImage builds are more reliable for cross-compilation." -ForegroundColor Yellow
    Write-Host "  Use -AppImage flag if you encounter issues with .deb builds." -ForegroundColor Yellow
}

# Clean
if ($Clean) {
    Write-Host "`n[1/5] Cleaning..." -ForegroundColor Yellow
    @("node_modules", "packages\desktop\node_modules", "packages\server\node_modules", "packages\shared\node_modules", "packages\web\node_modules") | ForEach-Object {
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

# Fix 7zip-bin if system 7-Zip is available
$sevenZipExe = "C:\Program Files\7-Zip\7z.exe"
$sevenZipDll = "C:\Program Files\7-Zip\7z.dll"
$sevenZipBinDir = Join-Path $ProjectRoot "node_modules\7zip-bin\win\x64"
$sevenZipBinExe = Join-Path $sevenZipBinDir "7za.exe"

if ((Test-Path $sevenZipExe) -and (-not (Test-Path $sevenZipBinExe))) {
    Write-Host "  Fixing 7zip-bin with system 7-Zip..." -ForegroundColor Gray
    New-Item -ItemType Directory -Force -Path $sevenZipBinDir | Out-Null
    Copy-Item $sevenZipExe $sevenZipBinExe -Force
    if (Test-Path $sevenZipDll) {
        Copy-Item $sevenZipDll (Join-Path $sevenZipBinDir "7z.dll") -Force
    }
}

# Sync version
Write-Host "`n[3/6] Syncing version..." -ForegroundColor Yellow
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
Write-Host "`n[4/6] Building shared package..." -ForegroundColor Yellow
npm run build -w @connectty/shared
if ($LASTEXITCODE -ne 0) {
    Write-Host "Shared package build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "  Done!" -ForegroundColor Green

# Build desktop main and renderer
Write-Host "`n[5/6] Building desktop package..." -ForegroundColor Yellow
npm run build -w @connectty/desktop
if ($LASTEXITCODE -ne 0) {
    Write-Host "Desktop build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "  Done!" -ForegroundColor Green

# Build Linux distribution
Write-Host "`n[6/6] Building Linux distribution..." -ForegroundColor Yellow

if ($AppImage) {
    Write-Host "  Target: AppImage only" -ForegroundColor Cyan
    Write-Host "  Note: AppImage requires admin privileges or Developer Mode on Windows" -ForegroundColor Yellow
    $buildTarget = "AppImage"
} else {
    Write-Host "  Target: Debian (.deb)" -ForegroundColor Cyan
    $buildTarget = "deb"
}

# Check if WSL is available (required for .deb builds on Windows)
$hasWSL = Test-WSL
Write-Host "  WSL detected: $hasWSL" -ForegroundColor Gray

# Run electron-builder for Linux
Set-Location "$ProjectRoot\packages\desktop"
$buildResult = 1

if ($hasWSL -and -not $AppImage) {
    # Use WSL for .deb builds (fpm not available on Windows)
    Write-Host "  Using WSL for .deb build..." -ForegroundColor Green

    # Convert Windows path to WSL path
    $wslPath = "/mnt/" + $ProjectRoot.Substring(0,1).ToLower() + $ProjectRoot.Substring(2).Replace('\', '/')

    # Check if fpm is installed in WSL, install if not
    Write-Host "  Checking for fpm in WSL..." -ForegroundColor Gray
    $fpmCheck = wsl bash -c "command -v fpm" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  fpm not found, installing prerequisites in WSL..." -ForegroundColor Yellow

        # Install Ruby and build tools
        Write-Host "    Installing ruby, ruby-dev, build-essential..." -ForegroundColor Gray
        wsl bash -c "sudo apt-get update && sudo apt-get install -y ruby ruby-dev build-essential"
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Failed to install Ruby prerequisites in WSL!" -ForegroundColor Red
            Write-Host "Please run manually: wsl sudo apt-get install -y ruby ruby-dev build-essential" -ForegroundColor Yellow
            exit 1
        }

        # Install fpm via gem
        Write-Host "    Installing fpm via gem..." -ForegroundColor Gray
        wsl bash -c "sudo gem install fpm"
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Failed to install fpm in WSL!" -ForegroundColor Red
            Write-Host "Please run manually: wsl sudo gem install fpm" -ForegroundColor Yellow
            exit 1
        }

        Write-Host "  fpm installed successfully!" -ForegroundColor Green
    } else {
        Write-Host "  fpm is already installed" -ForegroundColor Green
    }

    # Run electron-builder entirely in WSL
    # Use --noprofile --norc to avoid loading Windows PATH, then set clean Linux PATH
    Write-Host "  Running electron-builder in WSL (this may take a while)..." -ForegroundColor Gray
    $wslCmd = "export PATH=/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin; cd $wslPath/packages/desktop && npx electron-builder --linux $buildTarget"
    wsl bash --noprofile --norc -c $wslCmd
    $buildResult = $LASTEXITCODE
} else {
    # Try native build (will likely fail for .deb without fpm)
    npx electron-builder --linux $buildTarget
    $buildResult = $LASTEXITCODE
}

Set-Location $ProjectRoot

if ($buildResult -ne 0) {
    Write-Host "`nLinux build failed!" -ForegroundColor Red
    Write-Host "`nThe .deb build requires 'fpm' which isn't available on Windows natively." -ForegroundColor Yellow
    Write-Host "`nSolutions:" -ForegroundColor Yellow
    Write-Host "  1. Install WSL with Ubuntu and ensure npm is installed:" -ForegroundColor White
    Write-Host "     wsl --install -d Ubuntu" -ForegroundColor Gray
    Write-Host "     # Then in WSL: sudo apt update && sudo apt install -y nodejs npm ruby ruby-dev build-essential" -ForegroundColor Gray
    Write-Host "     # And: sudo gem install fpm" -ForegroundColor Gray
    Write-Host "  2. Build manually in WSL:" -ForegroundColor White
    Write-Host "     wsl -d Ubuntu" -ForegroundColor Gray
    Write-Host "     cd /mnt/c/connectty && npm run dist:linux -w @connectty/desktop" -ForegroundColor Gray
    exit 1
}

# Copy final binaries to releases folder
Write-Host "`n[7/7] Copying to releases folder..." -ForegroundColor Yellow
$ReleasesDir = Join-Path $ProjectRoot "releases"
if (-not (Test-Path $ReleasesDir)) {
    New-Item -ItemType Directory -Force -Path $ReleasesDir | Out-Null
}

$SourceDir = Join-Path $ProjectRoot "packages\desktop\release"
$CopiedFiles = @()

if (Test-Path $SourceDir) {
    # Copy Linux binaries (.deb, .AppImage)
    Get-ChildItem $SourceDir -File | Where-Object {
        $_.Extension -in @(".deb", ".AppImage")
    } | ForEach-Object {
        $destPath = Join-Path $ReleasesDir $_.Name
        Copy-Item $_.FullName $destPath -Force
        $CopiedFiles += $_.Name
    }
}

Write-Host "`n=== BUILD COMPLETE ===" -ForegroundColor Green
Write-Host "Output: releases\" -ForegroundColor Cyan

if ($CopiedFiles.Count -gt 0) {
    Write-Host "`nLinux Release Files:"
    $CopiedFiles | ForEach-Object { Write-Host "  - $_" -ForegroundColor White }
} else {
    Write-Host "`nNo files were copied to releases folder" -ForegroundColor Yellow
}

Write-Host "`nTo install on Debian/Ubuntu:" -ForegroundColor Cyan
Write-Host "  sudo dpkg -i releases/connectty_1.0.0_amd64.deb" -ForegroundColor White
Write-Host "  sudo apt-get install -f  # Fix dependencies if needed" -ForegroundColor Gray
