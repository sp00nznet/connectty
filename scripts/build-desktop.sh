#!/bin/bash
# Connectty Desktop Build Script for Linux/macOS
# Usage: ./scripts/build-desktop.sh [--clean] [--skip-install] [--platform linux|mac]

set -e

CLEAN=false
SKIP_INSTALL=false
PLATFORM="linux"

# Detect platform if not specified
if [[ "$OSTYPE" == "darwin"* ]]; then
    PLATFORM="mac"
fi

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

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to install Node.js
install_nodejs() {
    echo -e "\nNode.js/npm not found. Attempting to install..."

    # macOS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        if command_exists brew; then
            echo "Installing Node.js via Homebrew..."
            brew install node
            return 0
        else
            echo "Homebrew not found. Installing Homebrew first..."
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
            # Add to path for current session
            eval "$(/opt/homebrew/bin/brew shellenv 2>/dev/null || /usr/local/bin/brew shellenv 2>/dev/null)"
            brew install node
            return 0
        fi
    fi

    # Linux - try various package managers
    if command_exists apt-get; then
        echo "Installing Node.js via apt..."
        # Install Node.js 20.x LTS
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
        return 0
    elif command_exists dnf; then
        echo "Installing Node.js via dnf..."
        sudo dnf install -y nodejs npm
        return 0
    elif command_exists yum; then
        echo "Installing Node.js via yum..."
        curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
        sudo yum install -y nodejs
        return 0
    elif command_exists pacman; then
        echo "Installing Node.js via pacman..."
        sudo pacman -S --noconfirm nodejs npm
        return 0
    elif command_exists zypper; then
        echo "Installing Node.js via zypper..."
        sudo zypper install -y nodejs npm
        return 0
    fi

    # Fallback to nvm
    if ! command_exists nvm; then
        echo "Installing nvm..."
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    fi

    if command_exists nvm; then
        echo "Installing Node.js via nvm..."
        nvm install --lts
        nvm use --lts
        return 0
    fi

    # Manual instructions
    echo ""
    echo "Automatic installation failed. Please install Node.js manually:"
    echo "1. Visit: https://nodejs.org/"
    echo "2. Download and install the LTS version"
    echo "3. Restart your terminal"
    echo "4. Run this script again"
    exit 1
}

# Check for Node.js and npm
echo -e "\n[0/4] Checking prerequisites..."

if ! command_exists node; then
    install_nodejs
    # Reload path
    hash -r
fi

if ! command_exists npm; then
    install_nodejs
    hash -r
fi

# Display versions
echo "  Node.js: $(node --version)"
echo "  npm: $(npm --version)"

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

# Generate icons from gfx/screen.png
echo -e "\n[3/5] Generating application icons..."
if [ -f "$PROJECT_ROOT/scripts/generate-icons.sh" ]; then
    "$PROJECT_ROOT/scripts/generate-icons.sh"
    echo "  Icons generated!"
else
    echo "  Warning: generate-icons.sh not found, skipping icon generation"
fi

# Build shared package first
echo -e "\n[4/5] Building shared package..."
npm run build -w @connectty/shared
echo "  Shared package built!"

# Build desktop distribution
echo -e "\n[5/5] Building desktop distribution for $PLATFORM..."
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
