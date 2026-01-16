# Connectty Release Packaging Script
# Creates distributable archives for all platforms
# Usage: .\scripts\package-releases.ps1

param(
    [switch]$SkipServer
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

Write-Host "=== Connectty Release Packaging ===" -ForegroundColor Cyan
Write-Host "Project root: $ProjectRoot"

Set-Location $ProjectRoot

# Get version
$versionFile = Join-Path $ProjectRoot "version.json"
if (Test-Path $versionFile) {
    $versionData = Get-Content $versionFile | ConvertFrom-Json
    $version = $versionData.version
} else {
    $version = "1.0.0"
}
Write-Host "Version: $version" -ForegroundColor Cyan

$ReleasesDir = Join-Path $ProjectRoot "releases"
$DesktopReleaseDir = Join-Path $ProjectRoot "packages\desktop\release"

# Ensure releases directory exists
if (-not (Test-Path $ReleasesDir)) {
    New-Item -ItemType Directory -Force -Path $ReleasesDir | Out-Null
}

# Function to create zip
function Create-Zip {
    param(
        [string]$SourcePath,
        [string]$DestZip
    )

    if (Test-Path $DestZip) {
        Remove-Item $DestZip -Force
    }

    Compress-Archive -Path $SourcePath -DestinationPath $DestZip -Force
    return Test-Path $DestZip
}

# Function to create tar.gz using WSL or 7zip
function Create-TarGz {
    param(
        [string]$SourcePath,
        [string]$DestTarGz,
        [string]$BaseName
    )

    if (Test-Path $DestTarGz) {
        Remove-Item $DestTarGz -Force
    }

    # Try WSL first
    $hasWSL = $false
    try {
        $wslCheck = wsl echo "ok" 2>&1
        $hasWSL = ($wslCheck -eq "ok")
    } catch {
        $hasWSL = $false
    }

    if ($hasWSL) {
        $wslSource = "/mnt/" + $SourcePath.Substring(0,1).ToLower() + $SourcePath.Substring(2).Replace('\', '/')
        $wslDest = "/mnt/" + $DestTarGz.Substring(0,1).ToLower() + $DestTarGz.Substring(2).Replace('\', '/')
        $parentDir = Split-Path $SourcePath -Parent
        $wslParent = "/mnt/" + $parentDir.Substring(0,1).ToLower() + $parentDir.Substring(2).Replace('\', '/')

        wsl bash -c "cd '$wslParent' && tar -czvf '$wslDest' '$BaseName'"
        return Test-Path $DestTarGz
    }

    # Fallback: use 7-Zip if available
    $sevenZip = "C:\Program Files\7-Zip\7z.exe"
    if (Test-Path $sevenZip) {
        $tarFile = $DestTarGz -replace '\.gz$', ''
        & $sevenZip a -ttar $tarFile $SourcePath
        & $sevenZip a -tgzip $DestTarGz $tarFile
        Remove-Item $tarFile -Force -ErrorAction SilentlyContinue
        return Test-Path $DestTarGz
    }

    Write-Host "  Warning: Neither WSL nor 7-Zip available for tar.gz creation" -ForegroundColor Yellow
    return $false
}

$PackagedFiles = @()

# Package Windows Standalone
Write-Host "`n[1/4] Packaging Windows Standalone..." -ForegroundColor Yellow
$standaloneExe = Get-ChildItem $ReleasesDir -Filter "Connectty-*-win-x64.exe" | Select-Object -First 1
if ($standaloneExe) {
    $zipName = "Connectty-$version-windows-standalone.zip"
    $zipPath = Join-Path $ReleasesDir $zipName
    if (Create-Zip -SourcePath $standaloneExe.FullName -DestZip $zipPath) {
        Write-Host "  Created: $zipName" -ForegroundColor Green
        $PackagedFiles += $zipName
    }
} else {
    Write-Host "  Skipped: No standalone exe found" -ForegroundColor Gray
}

# Package Windows Setup
Write-Host "`n[2/4] Packaging Windows Setup..." -ForegroundColor Yellow
$setupExe = Get-ChildItem $ReleasesDir -Filter "Connectty-Setup-*.exe" | Select-Object -First 1
if ($setupExe) {
    $zipName = "Connectty-$version-windows-setup.zip"
    $zipPath = Join-Path $ReleasesDir $zipName
    if (Create-Zip -SourcePath $setupExe.FullName -DestZip $zipPath) {
        Write-Host "  Created: $zipName" -ForegroundColor Green
        $PackagedFiles += $zipName
    }
} else {
    Write-Host "  Skipped: No setup exe found" -ForegroundColor Gray
}

# Package Linux .deb
Write-Host "`n[3/4] Packaging Linux .deb..." -ForegroundColor Yellow
$debFile = Get-ChildItem $ReleasesDir -Filter "*.deb" | Select-Object -First 1
if (-not $debFile) {
    $debFile = Get-ChildItem $DesktopReleaseDir -Filter "*.deb" -ErrorAction SilentlyContinue | Select-Object -First 1
}
if ($debFile) {
    # Copy to releases if not already there
    $destDeb = Join-Path $ReleasesDir $debFile.Name
    if ($debFile.DirectoryName -ne $ReleasesDir) {
        Copy-Item $debFile.FullName $destDeb -Force
    }

    $tarGzName = "Connectty-$version-linux-amd64.tar.gz"
    $tarGzPath = Join-Path $ReleasesDir $tarGzName
    if (Create-TarGz -SourcePath $destDeb -DestTarGz $tarGzPath -BaseName $debFile.Name) {
        Write-Host "  Created: $tarGzName" -ForegroundColor Green
        $PackagedFiles += $tarGzName
    }
} else {
    Write-Host "  Skipped: No .deb file found" -ForegroundColor Gray
}

# Package Server
Write-Host "`n[4/4] Packaging Server..." -ForegroundColor Yellow
if (-not $SkipServer) {
    $serverDir = Join-Path $ProjectRoot "packages\server"
    $serverDistDir = Join-Path $serverDir "dist"

    # Build server if not built
    if (-not (Test-Path $serverDistDir)) {
        Write-Host "  Building server..." -ForegroundColor Gray
        npm run build -w @connectty/server
    }

    if (Test-Path $serverDistDir) {
        # Create a temp folder with server files
        $serverPackageDir = Join-Path $ReleasesDir "connectty-server-$version"
        if (Test-Path $serverPackageDir) {
            Remove-Item $serverPackageDir -Recurse -Force
        }
        New-Item -ItemType Directory -Force -Path $serverPackageDir | Out-Null

        # Copy server files
        Copy-Item (Join-Path $serverDir "dist") (Join-Path $serverPackageDir "dist") -Recurse
        Copy-Item (Join-Path $serverDir "package.json") $serverPackageDir

        # Copy shared dist if exists
        $sharedDistDir = Join-Path $ProjectRoot "packages\shared\dist"
        if (Test-Path $sharedDistDir) {
            $serverSharedDir = Join-Path $serverPackageDir "node_modules\@connectty\shared"
            New-Item -ItemType Directory -Force -Path $serverSharedDir | Out-Null
            Copy-Item $sharedDistDir (Join-Path $serverSharedDir "dist") -Recurse
            Copy-Item (Join-Path $ProjectRoot "packages\shared\package.json") $serverSharedDir
        }

        # Create README for server
        @"
# Connectty Server v$version

## Installation

1. Install dependencies:
   npm install --omit=dev

2. Start the server:
   node dist/index.js

## Configuration

Set environment variables or create a .env file:
- PORT: Server port (default: 3000)
- HOST: Server host (default: 0.0.0.0)

## Requirements

- Node.js 18+
"@ | Set-Content (Join-Path $serverPackageDir "README.md")

        $tarGzName = "connectty-server-$version.tar.gz"
        $tarGzPath = Join-Path $ReleasesDir $tarGzName
        if (Create-TarGz -SourcePath $serverPackageDir -DestTarGz $tarGzPath -BaseName "connectty-server-$version") {
            Write-Host "  Created: $tarGzName" -ForegroundColor Green
            $PackagedFiles += $tarGzName
        }

        # Cleanup temp folder
        Remove-Item $serverPackageDir -Recurse -Force -ErrorAction SilentlyContinue
    } else {
        Write-Host "  Skipped: Server not built" -ForegroundColor Gray
    }
} else {
    Write-Host "  Skipped: -SkipServer flag" -ForegroundColor Gray
}

Write-Host "`n=== PACKAGING COMPLETE ===" -ForegroundColor Green
Write-Host "Output: releases\" -ForegroundColor Cyan

if ($PackagedFiles.Count -gt 0) {
    Write-Host "`nPackaged Files:"
    $PackagedFiles | ForEach-Object { Write-Host "  - $_" -ForegroundColor White }
}

# List all files in releases
Write-Host "`nAll Release Files:"
Get-ChildItem $ReleasesDir -File | ForEach-Object {
    $size = "{0:N2} MB" -f ($_.Length / 1MB)
    Write-Host "  - $($_.Name) ($size)" -ForegroundColor White
}
