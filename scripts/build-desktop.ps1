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

# Function to check if running as administrator
function Test-Administrator {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Function to install Node.js using winget or chocolatey
function Install-NodeJS {
    Write-Host "`nNode.js/npm not found. Attempting to install..." -ForegroundColor Yellow

    # Try winget first (Windows 10/11)
    if (Test-Command "winget") {
        Write-Host "Installing Node.js LTS via winget..." -ForegroundColor Cyan
        winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Node.js installed successfully!" -ForegroundColor Green
            # Refresh PATH
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
            return $true
        }
    }

    # Try chocolatey
    if (Test-Command "choco") {
        Write-Host "Installing Node.js via Chocolatey..." -ForegroundColor Cyan
        choco install nodejs-lts -y
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Node.js installed successfully!" -ForegroundColor Green
            # Refresh PATH
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
            return $true
        }
    }

    # Manual installation instructions
    Write-Host "`nAutomatic installation failed. Please install Node.js manually:" -ForegroundColor Red
    Write-Host "1. Download from: https://nodejs.org/" -ForegroundColor White
    Write-Host "2. Run the installer and ensure 'Add to PATH' is checked" -ForegroundColor White
    Write-Host "3. Restart your terminal" -ForegroundColor White
    Write-Host "4. Run this script again" -ForegroundColor White
    return $false
}

# Function to check if Visual Studio C++ Build Tools are installed
function Test-VCBuildTools {
    # Check for cl.exe in common locations
    $vsWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
    if (Test-Path $vsWhere) {
        $vcTools = & $vsWhere -latest -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
        if ($vcTools) {
            return $true
        }
    }

    # Also check if windows-build-tools or build tools are available via npm config
    $buildToolsPath = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\BuildTools"
    $communityPath = "${env:ProgramFiles}\Microsoft Visual Studio\2022\Community"

    # Check for VC tools in BuildTools
    if (Test-Path "$buildToolsPath\VC\Tools\MSVC") {
        return $true
    }

    # Check for VC tools in Community
    if (Test-Path "$communityPath\VC\Tools\MSVC") {
        return $true
    }

    return $false
}

# Function to install Visual Studio Build Tools
function Install-VCBuildTools {
    Write-Host "`nVisual Studio C++ Build Tools not found." -ForegroundColor Yellow
    Write-Host "These are required to compile native Node.js modules (better-sqlite3)." -ForegroundColor Yellow

    # Try winget first
    if (Test-Command "winget") {
        Write-Host "`nInstalling Visual Studio Build Tools via winget..." -ForegroundColor Cyan
        Write-Host "This may take several minutes..." -ForegroundColor Gray

        # Install VS Build Tools with C++ workload
        winget install Microsoft.VisualStudio.2022.BuildTools --accept-package-agreements --accept-source-agreements --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"

        if ($LASTEXITCODE -eq 0) {
            Write-Host "Visual Studio Build Tools installed successfully!" -ForegroundColor Green
            return $true
        }
    }

    # Try chocolatey
    if (Test-Command "choco") {
        Write-Host "`nInstalling Visual Studio Build Tools via Chocolatey..." -ForegroundColor Cyan
        choco install visualstudio2022buildtools visualstudio2022-workload-vctools -y
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Visual Studio Build Tools installed successfully!" -ForegroundColor Green
            return $true
        }
    }

    # Manual instructions
    Write-Host "`n============================================================" -ForegroundColor Red
    Write-Host "MANUAL INSTALLATION REQUIRED" -ForegroundColor Red
    Write-Host "============================================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Visual Studio Build Tools with C++ support:" -ForegroundColor White
    Write-Host ""
    Write-Host "Option 1 - Visual Studio Build Tools (Recommended):" -ForegroundColor Cyan
    Write-Host "  1. Download from: https://visualstudio.microsoft.com/visual-cpp-build-tools/" -ForegroundColor White
    Write-Host "  2. Run the installer" -ForegroundColor White
    Write-Host "  3. Select 'Desktop development with C++' workload" -ForegroundColor White
    Write-Host "  4. Click Install" -ForegroundColor White
    Write-Host ""
    Write-Host "Option 2 - If you have Visual Studio 2022 installed:" -ForegroundColor Cyan
    Write-Host "  1. Open Visual Studio Installer" -ForegroundColor White
    Write-Host "  2. Click 'Modify' on your VS installation" -ForegroundColor White
    Write-Host "  3. Check 'Desktop development with C++' workload" -ForegroundColor White
    Write-Host "  4. Click 'Modify' to install" -ForegroundColor White
    Write-Host ""
    Write-Host "After installation, restart your terminal and run this script again." -ForegroundColor Yellow
    Write-Host "============================================================" -ForegroundColor Red
    return $false
}

# Check for Node.js and npm
Write-Host "`n[0/4] Checking prerequisites..." -ForegroundColor Yellow

$needsRestart = $false

# Check Node.js
if (-not (Test-Command "node")) {
    if (-not (Install-NodeJS)) {
        exit 1
    }
    $needsRestart = $true
}

# Check npm
if (-not (Test-Command "npm")) {
    if (-not (Install-NodeJS)) {
        exit 1
    }
    $needsRestart = $true
}

# Check for Visual Studio C++ Build Tools
if (-not (Test-VCBuildTools)) {
    if (-not (Install-VCBuildTools)) {
        exit 1
    }
    $needsRestart = $true
}

if ($needsRestart) {
    Write-Host "`nPrerequisites were installed. Please restart your terminal and run this script again." -ForegroundColor Yellow
    exit 0
}

# Display versions
$nodeVersion = node --version
$npmVersion = npm --version
Write-Host "  Node.js: $nodeVersion" -ForegroundColor Green
Write-Host "  npm: $npmVersion" -ForegroundColor Green
Write-Host "  Visual Studio C++ Build Tools: Installed" -ForegroundColor Green

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
            Remove-Item -Recurse -Force $dir -ErrorAction SilentlyContinue
        }
    }

    # Also clean dist directories
    Write-Host "  Cleaning dist directories..."
    Get-ChildItem -Path "packages" -Directory | ForEach-Object {
        $distPath = Join-Path $_.FullName "dist"
        if (Test-Path $distPath) {
            Remove-Item -Recurse -Force $distPath -ErrorAction SilentlyContinue
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
        Write-Host ""
        Write-Host "If you see errors about 'node-gyp' or 'better-sqlite3', you may need to:" -ForegroundColor Yellow
        Write-Host "  1. Install Visual Studio Build Tools with C++ workload" -ForegroundColor White
        Write-Host "  2. Run: npm config set msvs_version 2022" -ForegroundColor White
        Write-Host "  3. Try again with: .\scripts\build-desktop.ps1 -Clean" -ForegroundColor White
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
