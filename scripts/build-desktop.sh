#!/bin/bash
# Connectty Desktop Build Script for Linux/macOS
# Usage: ./scripts/build-desktop.sh [--clean] [--skip-install] [--platform linux|mac]

set -e

CLEAN=false
SKIP_INSTALL=false
PLATFORM="linux"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --clean)
            CLEAN=true
            shift
            ;;
        --skip-install)
            SKIP_INSTALL=true
            shift
            ;;
        --platform)
            PLATFORM="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--clean] [--skip-install] [--platform linux|mac]"
            exit 1
            ;;
    esac
done

# Get project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "=== Connectty Desktop Build Script ==="
echo "Project root: $PROJECT_ROOT"
echo "Platform: $PLATFORM"

cd "$PROJECT_ROOT"

# Clean if requested
if [ "$CLEAN" = true ]; then
    echo -e "\n[1/4] Cleaning node_modules..."

    rm -rf node_modules
    rm -rf packages/desktop/node_modules
    rm -rf packages/server/node_modules
    rm -rf packages/shared/node_modules
    rm -rf packages/web/node_modules

    # Clean dist directories
    echo "  Cleaning dist directories..."
    rm -rf packages/*/dist

    echo "  Clean complete!"
else
    echo -e "\n[1/4] Skipping clean (use --clean flag to clean)"
fi

# Install dependencies
if [ "$SKIP_INSTALL" = false ]; then
    echo -e "\n[2/4] Installing dependencies..."
    npm install
    echo "  Dependencies installed!"
else
    echo -e "\n[2/4] Skipping install"
fi

# Build shared package first
echo -e "\n[3/4] Building shared package..."
npm run build -w @connectty/shared
echo "  Shared package built!"

# Build desktop distribution
echo -e "\n[4/4] Building desktop distribution for $PLATFORM..."
if [ "$PLATFORM" = "mac" ]; then
    npm run dist -w @connectty/desktop -- --mac
elif [ "$PLATFORM" = "linux" ]; then
    npm run dist:linux -w @connectty/desktop
else
    echo "Unknown platform: $PLATFORM"
    exit 1
fi

echo -e "\n=== Build Complete! ==="
echo "Output: packages/desktop/release/"

# List output files
if [ -d "packages/desktop/release" ]; then
    echo -e "\nGenerated files:"
    ls -la packages/desktop/release/
fi
