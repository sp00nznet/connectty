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

# Function to install Node.js using winget or chocolatey
function Install-NodeJS {
    Write-Host "`nNode.js/npm not found. Attempting to install..." -ForegroundColor Yellow

    # Try winget first (Windows 10/11)
    if (Test-Command "winget") {
        Write-Host "Installing Node.js via winget..." -ForegroundColor Cyan
        winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Node.js installed successfully!" -ForegroundColor Green
            Write-Host "Please restart your terminal and run this script again." -ForegroundColor Yellow
            exit 0
        }
    }

    # Try chocolatey
    if (Test-Command "choco") {
        Write-Host "Installing Node.js via Chocolatey..." -ForegroundColor Cyan
        choco install nodejs-lts -y
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Node.js installed successfully!" -ForegroundColor Green
            Write-Host "Please restart your terminal and run this script again." -ForegroundColor Yellow
            exit 0
        }
    }

    # Manual installation instructions
    Write-Host "`nAutomatic installation failed. Please install Node.js manually:" -ForegroundColor Red
    Write-Host "1. Download from: https://nodejs.org/" -ForegroundColor White
    Write-Host "2. Run the installer and ensure 'Add to PATH' is checked" -ForegroundColor White
    Write-Host "3. Restart your terminal" -ForegroundColor White
    Write-Host "4. Run this script again" -ForegroundColor White
    exit 1
}

# Check for Node.js and npm
Write-Host "`n[0/4] Checking prerequisites..." -ForegroundColor Yellow

if (-not (Test-Command "node")) {
    Install-NodeJS
}

if (-not (Test-Command "npm")) {
    Install-NodeJS
}

# Display versions
$nodeVersion = node --version
$npmVersion = npm --version
Write-Host "  Node.js: $nodeVersion" -ForegroundColor Green
Write-Host "  npm: $npmVersion" -ForegroundColor Green

# Clean node_modules if requested or if there are issues
if ($Clean) {
    Write-Host "`n[1/4] Cleaning node_modules..." -ForegroundColor Yellow

    $dirs = @(
        "node_modules",
        "packages\desktop\node_modules",
        "packages\server\node_modules",
        "packages\shared\node_modules",
        "packages\web\node_modules"
    )

    foreach ($dir in $dirs) {
        if (Test-Path $dir) {
            Write-Host "  Removing $dir"
            Remove-Item -Recurse -Force $dir
        }
    }

    # Also clean dist directories
    Write-Host "  Cleaning dist directories..."
    Get-ChildItem -Path "packages" -Directory | ForEach-Object {
        $distPath = Join-Path $_.FullName "dist"
        if (Test-Path $distPath) {
            Remove-Item -Recurse -Force $distPath
        }
    }

    Write-Host "  Clean complete!" -ForegroundColor Green
} else {
    Write-Host "`n[1/4] Skipping clean (use -Clean flag to clean)" -ForegroundColor Gray
}

# Install dependencies
if (-not $SkipInstall) {
    Write-Host "`n[2/4] Installing dependencies..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to install dependencies!" -ForegroundColor Red
        exit 1
    }
    Write-Host "  Dependencies installed!" -ForegroundColor Green
} else {
    Write-Host "`n[2/4] Skipping install (use without -SkipInstall to install)" -ForegroundColor Gray
}

# Build shared package first (dependency for desktop)
Write-Host "`n[3/4] Building shared package..." -ForegroundColor Yellow
npm run build -w @connectty/shared
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to build shared package!" -ForegroundColor Red
    exit 1
}
Write-Host "  Shared package built!" -ForegroundColor Green

# Build desktop distribution
Write-Host "`n[4/4] Building desktop distribution for Windows..." -ForegroundColor Yellow
npm run dist:win -w @connectty/desktop
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to build desktop distribution!" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== Build Complete! ===" -ForegroundColor Green
Write-Host "Output: packages\desktop\release\" -ForegroundColor Cyan

# List the output files
$releaseDir = "packages\desktop\release"
if (Test-Path $releaseDir) {
    Write-Host "`nGenerated files:"
    Get-ChildItem -Path $releaseDir -File | ForEach-Object {
        Write-Host "  - $($_.Name)" -ForegroundColor White
    }
}
