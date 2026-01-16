# Connectty Version Bump Script
# Usage: .\scripts\bump-version.ps1 [-Major] [-Minor] [-Patch] [-Build] [-Set "1.0.0.0"]
#
# Examples:
#   .\scripts\bump-version.ps1              # Increments build number (1.0.0.0 -> 1.0.0.1)
#   .\scripts\bump-version.ps1 -Build       # Same as above
#   .\scripts\bump-version.ps1 -Patch       # Increments patch (1.0.0.5 -> 1.0.1.0)
#   .\scripts\bump-version.ps1 -Minor       # Increments minor (1.0.5.3 -> 1.1.0.0)
#   .\scripts\bump-version.ps1 -Major       # Increments major (1.5.3.2 -> 2.0.0.0)
#   .\scripts\bump-version.ps1 -Set "2.0.0.0"  # Sets specific version

param(
    [switch]$Major,
    [switch]$Minor,
    [switch]$Patch,
    [switch]$Build,
    [string]$Set
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

Set-Location $ProjectRoot

# Read current version
$versionFile = Join-Path $ProjectRoot "version.json"
if (-not (Test-Path $versionFile)) {
    Write-Host "Creating version.json..." -ForegroundColor Yellow
    $versionData = @{
        version = "1.0.0.0"
        major = 1
        minor = 0
        patch = 0
        build = 0
    }
} else {
    $versionData = Get-Content $versionFile | ConvertFrom-Json
}

$oldVersion = $versionData.version
Write-Host "Current version: $oldVersion" -ForegroundColor Cyan

# Determine new version
if ($Set) {
    # Parse and validate the set version
    $parts = $Set -split '\.'
    if ($parts.Count -ne 4) {
        Write-Host "Error: Version must be in format X.X.X.X (e.g., 1.0.0.0)" -ForegroundColor Red
        exit 1
    }
    $versionData.major = [int]$parts[0]
    $versionData.minor = [int]$parts[1]
    $versionData.patch = [int]$parts[2]
    $versionData.build = [int]$parts[3]
} elseif ($Major) {
    $versionData.major = [int]$versionData.major + 1
    $versionData.minor = 0
    $versionData.patch = 0
    $versionData.build = 0
} elseif ($Minor) {
    $versionData.minor = [int]$versionData.minor + 1
    $versionData.patch = 0
    $versionData.build = 0
} elseif ($Patch) {
    $versionData.patch = [int]$versionData.patch + 1
    $versionData.build = 0
} else {
    # Default: increment build
    $versionData.build = [int]$versionData.build + 1
}

# Construct new version string
$newVersion = "$($versionData.major).$($versionData.minor).$($versionData.patch).$($versionData.build)"
$versionData.version = $newVersion

# npm semver version (3-part)
$npmVersion = "$($versionData.major).$($versionData.minor).$($versionData.patch)"

Write-Host "New version: $newVersion" -ForegroundColor Green

# Save version.json
$versionData | ConvertTo-Json | Set-Content $versionFile -Encoding UTF8
Write-Host "  Updated version.json" -ForegroundColor Gray

# Update all package.json files
$packageFiles = @(
    "package.json",
    "packages\shared\package.json",
    "packages\desktop\package.json",
    "packages\server\package.json",
    "packages\web\package.json"
)

foreach ($file in $packageFiles) {
    $filePath = Join-Path $ProjectRoot $file
    if (Test-Path $filePath) {
        $content = Get-Content $filePath -Raw | ConvertFrom-Json
        $content.version = $npmVersion
        $content | ConvertTo-Json -Depth 10 | Set-Content $filePath -Encoding UTF8
        Write-Host "  Updated $file" -ForegroundColor Gray
    }
}

# Update internal dependency versions in package.json files
$dependencyPackages = @(
    "packages\desktop\package.json",
    "packages\server\package.json",
    "packages\web\package.json"
)

foreach ($file in $dependencyPackages) {
    $filePath = Join-Path $ProjectRoot $file
    if (Test-Path $filePath) {
        $content = Get-Content $filePath -Raw
        # Update @connectty/shared dependency version
        $content = $content -replace '"@connectty/shared":\s*"[^"]*"', "`"@connectty/shared`": `"$npmVersion`""
        Set-Content $filePath -Value $content -Encoding UTF8
    }
}

Write-Host "`n=== VERSION UPDATED ===" -ForegroundColor Green
Write-Host "Full version:  $newVersion" -ForegroundColor White
Write-Host "npm version:   $npmVersion" -ForegroundColor White
Write-Host "`nRemember to commit and push the version changes!" -ForegroundColor Yellow
