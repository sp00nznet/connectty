# Connectty Web Server Release Build Script
# Usage: .\scripts\build-server-release.ps1
#
# Creates a self-contained containerized release package in releases/server/
# Users can run it with a single command (run.bat or run.sh)

param(
    [switch]$Clean
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

Write-Host "=== Connectty Web Server Release Build Script ===" -ForegroundColor Cyan
Write-Host "Project root: $ProjectRoot"

Set-Location $ProjectRoot

$ReleasesDir = Join-Path $ProjectRoot "releases\server"

# Clean if requested
if ($Clean -and (Test-Path $ReleasesDir)) {
    Write-Host "`n[1/3] Cleaning releases/server..." -ForegroundColor Yellow
    Get-ChildItem $ReleasesDir -Exclude ".gitkeep" | Remove-Item -Recurse -Force
    Write-Host "  Done!" -ForegroundColor Green
} else {
    Write-Host "`n[1/3] Preparing releases/server folder..." -ForegroundColor Yellow
}

# Create releases folder if it doesn't exist
if (-not (Test-Path $ReleasesDir)) {
    New-Item -ItemType Directory -Force -Path $ReleasesDir | Out-Null
}

Write-Host "`n[2/3] Creating release package..." -ForegroundColor Yellow

# Create docker-compose.yml for release
$dockerCompose = @'
version: '3.8'

services:
  # PostgreSQL Database
  postgres:
    image: postgres:16-alpine
    container_name: connectty-db
    environment:
      POSTGRES_DB: connectty
      POSTGRES_USER: connectty
      POSTGRES_PASSWORD: ${DB_PASSWORD:-connectty_secret}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U connectty"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - connectty-network
    restart: unless-stopped

  # Connectty Server
  server:
    build:
      context: .
      dockerfile: Dockerfile.server
    container_name: connectty-server
    environment:
      NODE_ENV: production
      PORT: 3000
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: connectty
      DB_USER: connectty
      DB_PASSWORD: ${DB_PASSWORD:-connectty_secret}
      JWT_SECRET: ${JWT_SECRET:-change-this-in-production}
      JWT_EXPIRY: 24h
      MASTER_KEY: ${MASTER_KEY:-}
      AD_ENABLED: ${AD_ENABLED:-false}
      AD_URL: ${AD_URL:-}
      AD_BASE_DN: ${AD_BASE_DN:-}
      AD_DOMAIN: ${AD_DOMAIN:-}
      CORS_ORIGIN: ${CORS_ORIGIN:-*}
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - connectty-network
    restart: unless-stopped

  # Connectty Web Client
  web:
    build:
      context: .
      dockerfile: Dockerfile.web
    container_name: connectty-web
    ports:
      - "${WEB_PORT:-8080}:80"
    depends_on:
      - server
    networks:
      - connectty-network
    restart: unless-stopped

volumes:
  postgres_data:
    driver: local

networks:
  connectty-network:
    driver: bridge
'@

Set-Content -Path (Join-Path $ReleasesDir "docker-compose.yml") -Value $dockerCompose -Encoding UTF8

# Create .env.example
$envExample = @'
# Connectty Web Server Configuration
# Copy this file to .env and modify as needed

# Database password (change in production!)
DB_PASSWORD=connectty_secret

# JWT secret for authentication (change in production!)
JWT_SECRET=change-this-in-production-use-long-random-string

# Master encryption key (optional, auto-generated if not set)
MASTER_KEY=

# Web client port
WEB_PORT=8080

# Active Directory integration (optional)
AD_ENABLED=false
AD_URL=ldap://your-domain-controller:389
AD_BASE_DN=DC=yourdomain,DC=com
AD_DOMAIN=YOURDOMAIN

# CORS origin (set to your domain in production)
CORS_ORIGIN=*
'@

Set-Content -Path (Join-Path $ReleasesDir ".env.example") -Value $envExample -Encoding UTF8

# Create run.bat for Windows
$runBat = @'
@echo off
echo ============================================
echo   Connectty Web Server
echo ============================================
echo.

REM Check if Docker is installed
where docker >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: Docker is not installed or not in PATH
    echo Please install Docker Desktop from https://www.docker.com/products/docker-desktop
    pause
    exit /b 1
)

REM Check if Docker is running
docker info >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: Docker is not running
    echo Please start Docker Desktop and try again
    pause
    exit /b 1
)

REM Check if .env exists, if not copy from example
if not exist .env (
    echo Creating .env file from .env.example...
    copy .env.example .env >nul
    echo.
    echo IMPORTANT: Edit .env to change default passwords before production use!
    echo.
)

echo Starting Connectty...
echo.

REM Build and start containers
docker-compose up --build -d

if %ERRORLEVEL% equ 0 (
    echo.
    echo ============================================
    echo   Connectty is now running!
    echo.
    echo   Web Client: http://localhost:8080
    echo.
    echo   To stop:  run stop.bat
    echo   To logs:  docker-compose logs -f
    echo ============================================
) else (
    echo.
    echo ERROR: Failed to start Connectty
    echo Check the error messages above
)

pause
'@

Set-Content -Path (Join-Path $ReleasesDir "run.bat") -Value $runBat -Encoding ASCII

# Create stop.bat for Windows
$stopBat = @'
@echo off
echo Stopping Connectty...
docker-compose down
echo.
echo Connectty stopped.
pause
'@

Set-Content -Path (Join-Path $ReleasesDir "stop.bat") -Value $stopBat -Encoding ASCII

# Create run.sh for Linux/Mac
$runSh = @'
#!/bin/bash
echo "============================================"
echo "  Connectty Web Server"
echo "============================================"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "ERROR: Docker is not installed"
    echo "Please install Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo "ERROR: Docker is not running"
    echo "Please start Docker and try again"
    exit 1
fi

# Check if docker-compose is available (either standalone or plugin)
if command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
elif docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
else
    echo "ERROR: docker-compose is not installed"
    echo "Please install docker-compose: https://docs.docker.com/compose/install/"
    exit 1
fi

# Check if .env exists, if not copy from example
if [ ! -f .env ]; then
    echo "Creating .env file from .env.example..."
    cp .env.example .env
    echo ""
    echo "IMPORTANT: Edit .env to change default passwords before production use!"
    echo ""
fi

echo "Starting Connectty..."
echo ""

# Build and start containers
$COMPOSE_CMD up --build -d

if [ $? -eq 0 ]; then
    echo ""
    echo "============================================"
    echo "  Connectty is now running!"
    echo ""
    echo "  Web Client: http://localhost:8080"
    echo ""
    echo "  To stop:  ./stop.sh"
    echo "  To logs:  $COMPOSE_CMD logs -f"
    echo "============================================"
else
    echo ""
    echo "ERROR: Failed to start Connectty"
    echo "Check the error messages above"
fi
'@

Set-Content -Path (Join-Path $ReleasesDir "run.sh") -Value ($runSh -replace "`r`n", "`n") -Encoding UTF8 -NoNewline

# Create stop.sh for Linux/Mac
$stopSh = @'
#!/bin/bash
echo "Stopping Connectty..."

if command -v docker-compose &> /dev/null; then
    docker-compose down
elif docker compose version &> /dev/null; then
    docker compose down
fi

echo ""
echo "Connectty stopped."
'@

Set-Content -Path (Join-Path $ReleasesDir "stop.sh") -Value ($stopSh -replace "`r`n", "`n") -Encoding UTF8 -NoNewline

Write-Host "  Done!" -ForegroundColor Green

Write-Host "`n[3/3] Copying source files..." -ForegroundColor Yellow

# Copy necessary source files for Docker build
$SourceItems = @(
    @{ From = "package.json"; To = "package.json" },
    @{ From = "package-lock.json"; To = "package-lock.json" },
    @{ From = "packages\shared"; To = "packages\shared" },
    @{ From = "packages\server"; To = "packages\server" },
    @{ From = "packages\web"; To = "packages\web" }
)

foreach ($item in $SourceItems) {
    $src = Join-Path $ProjectRoot $item.From
    $dst = Join-Path $ReleasesDir $item.To

    if (Test-Path $src) {
        if (Test-Path $src -PathType Container) {
            # It's a directory - copy it
            if (Test-Path $dst) { Remove-Item -Recurse -Force $dst }
            Copy-Item -Recurse $src $dst
            # Remove node_modules and dist from copied directories
            Get-ChildItem -Path $dst -Include "node_modules","dist" -Recurse -Directory | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
        } else {
            # It's a file
            Copy-Item $src $dst -Force
        }
    }
}

# Rename Dockerfiles for release
Copy-Item (Join-Path $ProjectRoot "packages\server\Dockerfile") (Join-Path $ReleasesDir "Dockerfile.server") -Force
Copy-Item (Join-Path $ProjectRoot "packages\web\Dockerfile") (Join-Path $ReleasesDir "Dockerfile.web") -Force

# Update Dockerfile paths in release versions
$serverDockerfile = Get-Content (Join-Path $ReleasesDir "Dockerfile.server") -Raw
$serverDockerfile = $serverDockerfile -replace "packages/shared", "packages/shared"
Set-Content -Path (Join-Path $ReleasesDir "Dockerfile.server") -Value $serverDockerfile -Encoding UTF8

$webDockerfile = Get-Content (Join-Path $ReleasesDir "Dockerfile.web") -Raw
$webDockerfile = $webDockerfile -replace "packages/shared", "packages/shared"
Set-Content -Path (Join-Path $ReleasesDir "Dockerfile.web") -Value $webDockerfile -Encoding UTF8

# Create README
$readme = @'
# Connectty Web Server

A containerized web-based SSH/RDP connection manager.

## Quick Start

### Windows
```
run.bat
```

### Linux/Mac
```
chmod +x run.sh stop.sh
./run.sh
```

## Requirements

- Docker Desktop (Windows/Mac) or Docker Engine (Linux)
- docker-compose

## Configuration

1. Copy `.env.example` to `.env`
2. Edit `.env` to change default passwords (important for production!)
3. Run the start script

## Access

After starting, access the web client at: http://localhost:8080

## Stopping

### Windows
```
stop.bat
```

### Linux/Mac
```
./stop.sh
```

## Data Persistence

Database data is stored in a Docker volume (`postgres_data`) and persists across restarts.

To completely reset (WARNING: deletes all data):
```
docker-compose down -v
```
'@

Set-Content -Path (Join-Path $ReleasesDir "README.md") -Value $readme -Encoding UTF8

Write-Host "  Done!" -ForegroundColor Green

Write-Host "`n=== BUILD COMPLETE ===" -ForegroundColor Green
Write-Host "Output: releases\server\" -ForegroundColor Cyan
Write-Host "`nRelease contents:" -ForegroundColor White
Get-ChildItem $ReleasesDir -File | ForEach-Object { Write-Host "  - $($_.Name)" }
Get-ChildItem $ReleasesDir -Directory | ForEach-Object { Write-Host "  - $($_.Name)\" }

Write-Host "`nTo run:" -ForegroundColor Cyan
Write-Host "  cd releases\server" -ForegroundColor White
Write-Host "  run.bat  (Windows)" -ForegroundColor White
Write-Host "  ./run.sh (Linux/Mac)" -ForegroundColor White
