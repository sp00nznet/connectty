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
