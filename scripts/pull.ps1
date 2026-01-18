# Git pull script that handles package-lock.json conflicts
# Usage: .\scripts\pull.ps1

Write-Host "Resetting package files and pulling..." -ForegroundColor Cyan

git checkout -- package-lock.json packages/desktop/package.json 2>$null
git pull

if ($LASTEXITCODE -eq 0) {
    Write-Host "Pull successful. Running npm install..." -ForegroundColor Green
    npm install
} else {
    Write-Host "Pull failed. Check for other conflicts." -ForegroundColor Red
    exit 1
}
