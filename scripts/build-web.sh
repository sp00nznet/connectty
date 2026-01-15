#!/bin/bash
# Connectty Web Platform Build Script for Linux/macOS
# Usage: ./scripts/build-web.sh [--clean] [--skip-install] [--dev]

set -e

CLEAN=false
SKIP_INSTALL=false
DEV_MODE=false

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
        --dev)
            DEV_MODE=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--clean] [--skip-install] [--dev]"
            exit 1
            ;;
    esac
done

# Get project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "=== Connectty Web Platform Build Script ==="
echo "Project root: $PROJECT_ROOT"

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
            eval "$(/opt/homebrew/bin/brew shellenv 2>/dev/null || /usr/local/bin/brew shellenv 2>/dev/null)"
            brew install node
            return 0
        fi
    fi

    # Linux - try various package managers
    if command_exists apt-get; then
        echo "Installing Node.js via apt..."
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

    echo ""
    echo "Automatic installation failed. Please install Node.js manually:"
    echo "1. Visit: https://nodejs.org/"
    echo "2. Download and install the LTS version"
    echo "3. Restart your terminal"
    echo "4. Run this script again"
    exit 1
}

# Check for Node.js and npm
echo -e "\n[0/5] Checking prerequisites..."

if ! command_exists node; then
    install_nodejs
    hash -r
fi

if ! command_exists npm; then
    install_nodejs
    hash -r
fi

# Display versions
echo "  Node.js: $(node --version)"
echo "  npm: $(npm --version)"

# Check for native build dependencies (needed for node-pty)
echo -e "\n  Checking native build dependencies..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    if ! command_exists xcode-select; then
        echo "  Installing Xcode Command Line Tools..."
        xcode-select --install 2>/dev/null || true
    fi
    echo "  Xcode tools: OK"
else
    # Linux - check for build-essential
    if command_exists apt-get; then
        if ! dpkg -l | grep -q build-essential; then
            echo "  Installing build-essential..."
            sudo apt-get install -y build-essential python3
        fi
    elif command_exists dnf; then
        echo "  Ensuring development tools..."
        sudo dnf groupinstall -y "Development Tools" || true
    fi
    echo "  Build tools: OK"
fi

# Clean if requested
if [ "$CLEAN" = true ]; then
    echo -e "\n[1/5] Cleaning node_modules and dist..."

    rm -rf node_modules
    rm -rf packages/server/node_modules
    rm -rf packages/shared/node_modules
    rm -rf packages/web/node_modules

    # Clean dist directories
    rm -rf packages/*/dist

    echo "  Clean complete!"
else
    echo -e "\n[1/5] Skipping clean (use --clean flag to clean)"
fi

# Install dependencies
if [ "$SKIP_INSTALL" = false ]; then
    echo -e "\n[2/5] Installing dependencies..."
    npm install
    echo "  Dependencies installed!"
else
    echo -e "\n[2/5] Skipping install"
fi

# Build shared package first
echo -e "\n[3/5] Building shared package..."
npm run build -w @connectty/shared
echo "  Shared package built!"

# Build server
echo -e "\n[4/5] Building server..."
npm run build -w @connectty/server
echo "  Server built!"

# Build web client
echo -e "\n[5/5] Building web client..."
npm run build -w @connectty/web
echo "  Web client built!"

# Create distribution directory
DIST_DIR="$PROJECT_ROOT/dist/web"
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

echo -e "\n[+] Creating distribution package..."

# Copy server dist
cp -r packages/server/dist "$DIST_DIR/server"
cp packages/server/package.json "$DIST_DIR/server/"

# Copy web client dist
cp -r packages/web/dist "$DIST_DIR/public"

# Copy shared dist
mkdir -p "$DIST_DIR/shared"
cp -r packages/shared/dist "$DIST_DIR/shared/"
cp packages/shared/package.json "$DIST_DIR/shared/"

# Create production package.json
cat > "$DIST_DIR/package.json" << 'EOF'
{
  "name": "connectty-web",
  "version": "1.0.0",
  "description": "Connectty Web Platform",
  "main": "server/index.js",
  "scripts": {
    "start": "node server/index.js"
  },
  "dependencies": {}
}
EOF

# Create startup script
cat > "$DIST_DIR/start.sh" << 'EOF'
#!/bin/bash
# Connectty Web Platform Startup Script

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check for .env file
if [ ! -f ".env" ]; then
    echo "Creating default .env file..."
    cat > .env << 'ENVEOF'
# Connectty Web Platform Configuration
PORT=3000
HOST=0.0.0.0

# Database Configuration (PostgreSQL)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=connectty
DB_USER=connectty
DB_PASSWORD=connectty

# JWT Configuration
JWT_SECRET=change-this-to-a-secure-random-string
JWT_EXPIRY=24h

# CORS (comma-separated origins, or * for all)
CORS_ORIGIN=*

# Active Directory (optional)
AD_ENABLED=false
# AD_URL=ldap://your-ad-server.com
# AD_BASE_DN=DC=example,DC=com
# AD_DOMAIN=EXAMPLE
ENVEOF
    echo ""
    echo "Please edit .env with your configuration, then run this script again."
    exit 0
fi

# Install production dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing production dependencies..."
    cd server && npm install --omit=dev && cd ..
fi

echo "Starting Connectty Web Platform..."
echo "Server: http://localhost:${PORT:-3000}"
node server/index.js
EOF
chmod +x "$DIST_DIR/start.sh"

# Create systemd service file (for Linux)
cat > "$DIST_DIR/connectty.service" << 'EOF'
[Unit]
Description=Connectty Web Platform
After=network.target postgresql.service

[Service]
Type=simple
User=connectty
WorkingDirectory=/opt/connectty
EnvironmentFile=/opt/connectty/.env
ExecStart=/usr/bin/node /opt/connectty/server/index.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

echo -e "\n=== Build Complete! ==="
echo "Output: $DIST_DIR"
echo ""
echo "To run the web platform:"
echo "  1. cd $DIST_DIR"
echo "  2. ./start.sh"
echo ""
echo "For production deployment:"
echo "  1. Copy the dist/web folder to your server"
echo "  2. Configure PostgreSQL database"
echo "  3. Edit .env with your settings"
echo "  4. Install systemd service (optional)"
echo ""

# List output
if [ -d "$DIST_DIR" ]; then
    echo "Distribution contents:"
    ls -la "$DIST_DIR"
fi

# Dev mode - start the server
if [ "$DEV_MODE" = true ]; then
    echo -e "\n[DEV] Starting development servers..."
    cd "$PROJECT_ROOT"
    npm run dev:server &
    npm run dev:web
fi
