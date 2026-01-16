# Connectty Desktop Build Script for macOS (cross-compile from Windows)
# Usage: .\scripts\build-desktop-macos.ps1 [-Clean] [-SkipInstall]
#
# Note: Cross-compiling to macOS from Windows has limitations.
# For best results, build on a Mac or use a CI service.

param(
    [switch]$Clean,
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

Write-Host "=== Connectty Desktop Build Script (macOS) ===" -ForegroundColor Cyan
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

# ============================================
# MAIN SCRIPT
# ============================================

Write-Host "`n[0/6] Checking prerequisites..." -ForegroundColor Yellow

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

# Warn about cross-compilation limitations
Write-Host "`n  Note: Cross-compiling to macOS from Windows creates unsigned builds." -ForegroundColor Yellow
Write-Host "  The .dmg/.zip will work but users may see security warnings." -ForegroundColor Yellow
Write-Host "  For signed builds, use a Mac or CI service with Apple certificates." -ForegroundColor Yellow

# Clean
if ($Clean) {
    Write-Host "`n[1/6] Cleaning..." -ForegroundColor Yellow
    @("node_modules", "packages\desktop\node_modules", "packages\server\node_modules", "packages\shared\node_modules", "packages\web\node_modules") | ForEach-Object {
        if (Test-Path $_) { Remove-Item -Recurse -Force $_ -ErrorAction SilentlyContinue }
    }
    Get-ChildItem -Path "packages" -Directory | ForEach-Object {
        $dist = Join-Path $_.FullName "dist"
        if (Test-Path $dist) { Remove-Item -Recurse -Force $dist -ErrorAction SilentlyContinue }
    }
    Write-Host "  Done!" -ForegroundColor Green
} else {
    Write-Host "`n[1/6] Skipping clean (use -Clean flag)" -ForegroundColor Gray
}

# Install dependencies
if (-not $SkipInstall) {
    Write-Host "`n[2/6] Installing dependencies..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "npm install failed!" -ForegroundColor Red
        exit 1
    }
    Write-Host "  Done!" -ForegroundColor Green
} else {
    Write-Host "`n[2/6] Skipping npm install" -ForegroundColor Gray
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
Write-Host "`n[3/6] Building shared package..." -ForegroundColor Yellow
npm run build -w @connectty/shared
if ($LASTEXITCODE -ne 0) {
    Write-Host "Shared package build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "  Done!" -ForegroundColor Green

# Build desktop main and renderer
Write-Host "`n[4/6] Building desktop package..." -ForegroundColor Yellow
npm run build -w @connectty/desktop
if ($LASTEXITCODE -ne 0) {
    Write-Host "Desktop build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "  Done!" -ForegroundColor Green

# Build macOS distribution
Write-Host "`n[5/6] Building macOS distribution..." -ForegroundColor Yellow
Write-Host "  Target: DMG + ZIP (x64 and arm64)" -ForegroundColor Cyan

# Run electron-builder for macOS
Set-Location "$ProjectRoot\packages\desktop"
npx electron-builder --mac dmg zip --x64 --arm64
$buildResult = $LASTEXITCODE
Set-Location $ProjectRoot

if ($buildResult -ne 0) {
    Write-Host "`nmacOS build failed!" -ForegroundColor Red
    Write-Host "Cross-compilation issues are common. Consider building on a Mac." -ForegroundColor Yellow
    exit 1
}

# Copy final binaries to releases folder
Write-Host "`n[6/6] Copying to releases folder..." -ForegroundColor Yellow
$ReleasesDir = Join-Path $ProjectRoot "releases"
if (-not (Test-Path $ReleasesDir)) {
    New-Item -ItemType Directory -Force -Path $ReleasesDir | Out-Null
}

$SourceDir = Join-Path $ProjectRoot "packages\desktop\release"
$CopiedFiles = @()

if (Test-Path $SourceDir) {
    # Copy macOS binaries (.dmg, .zip for mac)
    Get-ChildItem $SourceDir -File | Where-Object {
        ($_.Extension -eq ".dmg") -or
        ($_.Extension -eq ".zip" -and $_.Name -match "mac|darwin")
    } | ForEach-Object {
        $destPath = Join-Path $ReleasesDir $_.Name
        Copy-Item $_.FullName $destPath -Force
        $CopiedFiles += $_.Name
    }
}

Write-Host "`n=== BUILD COMPLETE ===" -ForegroundColor Green
Write-Host "Output: releases\" -ForegroundColor Cyan

if ($CopiedFiles.Count -gt 0) {
    Write-Host "`nmacOS Release Files:"
    $CopiedFiles | ForEach-Object { Write-Host "  - $_" -ForegroundColor White }
} else {
    Write-Host "`nNo files were copied to releases folder" -ForegroundColor Yellow
}

Write-Host "`nTo install on macOS:" -ForegroundColor Cyan
Write-Host "  1. Open the .dmg file" -ForegroundColor White
Write-Host "  2. Drag Connectty to Applications" -ForegroundColor White
Write-Host "  3. Right-click and select 'Open' (first time only, for unsigned builds)" -ForegroundColor Gray
