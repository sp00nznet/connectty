# Connectty Desktop Build Script for Linux (Debian) from Windows
# Usage: .\scripts\build-desktop-linux.ps1 [-Clean] [-SkipInstall] [-AppImage]

param(
    [switch]$Clean,
    [switch]$SkipInstall,
    [switch]$AppImage  # Build AppImage instead of .deb
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
        $wslOutput = wsl --status 2>&1
        return $LASTEXITCODE -eq 0
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

# Build shared
Write-Host "`n[3/5] Building shared package..." -ForegroundColor Yellow
npm run build -w @connectty/shared
if ($LASTEXITCODE -ne 0) {
    Write-Host "Shared package build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "  Done!" -ForegroundColor Green

# Build desktop main and renderer
Write-Host "`n[4/5] Building desktop package..." -ForegroundColor Yellow
npm run build -w @connectty/desktop
if ($LASTEXITCODE -ne 0) {
    Write-Host "Desktop build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "  Done!" -ForegroundColor Green

# Build Linux distribution
Write-Host "`n[5/5] Building Linux distribution..." -ForegroundColor Yellow

if ($AppImage) {
    Write-Host "  Target: AppImage" -ForegroundColor Cyan
    $buildTarget = "--linux AppImage"
} else {
    Write-Host "  Target: Debian (.deb) + AppImage" -ForegroundColor Cyan
    $buildTarget = "--linux deb AppImage"
}

# Run electron-builder for Linux
Set-Location "$ProjectRoot\packages\desktop"
npx electron-builder $buildTarget.Split(' ')
$buildResult = $LASTEXITCODE
Set-Location $ProjectRoot

if ($buildResult -ne 0) {
    Write-Host "`nLinux build failed!" -ForegroundColor Red
    Write-Host "If .deb build fails, try running with -AppImage flag:" -ForegroundColor Yellow
    Write-Host "  .\scripts\build-desktop-linux.ps1 -AppImage" -ForegroundColor Yellow
    exit 1
}

Write-Host "`n=== BUILD COMPLETE ===" -ForegroundColor Green
Write-Host "Output: packages\desktop\release\" -ForegroundColor Cyan

if (Test-Path "packages\desktop\release") {
    Write-Host "`nFiles:"
    Get-ChildItem "packages\desktop\release" -File | Where-Object {
        $_.Extension -in @(".deb", ".AppImage", ".yml", ".yaml")
    } | ForEach-Object {
        Write-Host "  - $($_.Name)" -ForegroundColor White
    }
}

Write-Host "`nTo install on Debian/Ubuntu:" -ForegroundColor Cyan
Write-Host "  sudo dpkg -i connectty_1.0.0_amd64.deb" -ForegroundColor White
Write-Host "  sudo apt-get install -f  # Fix dependencies if needed" -ForegroundColor Gray
