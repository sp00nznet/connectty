#!/usr/bin/env node
/**
 * Linux build script that automatically uses WSL on Windows.
 *
 * On Windows, the ENTIRE build process runs inside WSL because:
 * - Native node modules (node-pty, better-sqlite3) need Linux binaries
 * - fpm is a Linux tool for creating .deb packages
 * - electron-builder must run in Linux to properly package
 */

const { execSync, spawnSync } = require('child_process');
const os = require('os');
const path = require('path');

const isWindows = os.platform() === 'win32';

function log(msg, color = 'reset') {
  const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m'
  };
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function runCommand(cmd, options = {}) {
  log(`  Running: ${cmd}`, 'gray');
  try {
    execSync(cmd, { stdio: 'inherit', ...options });
    return true;
  } catch (e) {
    return false;
  }
}

function wslExec(cmd, options = {}) {
  log(`  [WSL] ${cmd}`, 'gray');
  const result = spawnSync('wsl', ['bash', '-c', cmd], {
    stdio: 'inherit',
    ...options
  });
  return result.status === 0;
}

function wslCheck(cmd) {
  const result = spawnSync('wsl', ['bash', '-c', cmd], { encoding: 'utf8' });
  return { success: result.status === 0, output: (result.stdout || '').trim() };
}

function checkWSL() {
  if (!isWindows) return false;
  try {
    const result = spawnSync('wsl', ['echo', 'wsl-ok'], { encoding: 'utf8' });
    return result.stdout && result.stdout.trim() === 'wsl-ok';
  } catch {
    return false;
  }
}

function getWSLPath(winPath) {
  // Convert C:\path\to\dir to /mnt/c/path/to/dir
  const drive = winPath.charAt(0).toLowerCase();
  const rest = winPath.slice(2).replace(/\\/g, '/');
  return `/mnt/${drive}${rest}`;
}

async function main() {
  log('=== Connectty Linux Build ===', 'cyan');

  const projectRoot = path.resolve(__dirname, '..', '..', '..');
  const desktopDir = path.resolve(__dirname, '..');

  if (isWindows) {
    log('Detected Windows - WSL is required for Linux builds', 'yellow');

    const hasWSL = checkWSL();
    log(`  WSL available: ${hasWSL}`, hasWSL ? 'green' : 'red');

    if (!hasWSL) {
      log('\nWSL is required to build .deb packages on Windows.', 'red');
      log('Install WSL: wsl --install -d Ubuntu', 'yellow');
      process.exit(1);
    }

    const wslProjectRoot = getWSLPath(projectRoot);

    // Check for node in WSL
    log('\nChecking WSL environment...', 'cyan');
    const nodeCheck = wslCheck('command -v node');
    if (!nodeCheck.success) {
      log('  Node.js not found in WSL, installing...', 'yellow');
      if (!wslExec('curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs')) {
        log('Failed to install Node.js in WSL!', 'red');
        process.exit(1);
      }
    } else {
      log(`  Node.js: ${wslCheck('node --version').output}`, 'green');
    }

    // Check for build essentials (needed for native modules)
    const gccCheck = wslCheck('command -v gcc');
    if (!gccCheck.success) {
      log('  Installing build-essential...', 'yellow');
      if (!wslExec('sudo apt-get update && sudo apt-get install -y build-essential python3')) {
        log('Failed to install build tools!', 'red');
        process.exit(1);
      }
    }

    // Check for fpm
    const fpmCheck = wslCheck('command -v fpm');
    if (!fpmCheck.success) {
      log('  Installing fpm...', 'yellow');
      if (!wslExec('sudo apt-get install -y ruby ruby-dev && sudo gem install fpm')) {
        log('Failed to install fpm!', 'red');
        process.exit(1);
      }
    } else {
      log('  fpm: installed', 'green');
    }

    // Run the ENTIRE build in WSL
    log('\nRunning full build in WSL...', 'cyan');
    log('  This includes: npm install (Linux binaries) + electron-builder', 'gray');

    // Create a build script to run in WSL
    const buildScript = `
      set -e
      cd '${wslProjectRoot}'

      echo "Installing dependencies with Linux native modules..."
      npm install

      echo "Building shared package..."
      npm run build -w @connectty/shared

      echo "Building desktop package..."
      npm run build:main -w @connectty/desktop
      npm run build:renderer -w @connectty/desktop

      echo "Running electron-builder..."
      cd packages/desktop
      npx electron-builder --linux deb
    `;

    if (!wslExec(buildScript)) {
      log('\nBuild failed!', 'red');
      process.exit(1);
    }

  } else {
    // Native Linux build
    log('Running native electron-builder...', 'cyan');
    if (!runCommand('npx electron-builder --linux deb', { cwd: desktopDir })) {
      log('Build failed!', 'red');
      process.exit(1);
    }
  }

  log('\n=== Build Complete ===', 'green');
  log('Output: packages/desktop/release/', 'cyan');
}

main().catch(err => {
  log(`Error: ${err.message}`, 'red');
  process.exit(1);
});
