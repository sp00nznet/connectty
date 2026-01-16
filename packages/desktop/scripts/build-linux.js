#!/usr/bin/env node
/**
 * Linux build script that automatically uses WSL on Windows
 * and installs fpm if needed.
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

function checkWSL() {
  if (!isWindows) return false;
  try {
    const result = spawnSync('wsl', ['echo', 'wsl-ok'], { encoding: 'utf8' });
    return result.stdout && result.stdout.trim() === 'wsl-ok';
  } catch {
    return false;
  }
}

function checkFpmInWSL() {
  try {
    const result = spawnSync('wsl', ['bash', '-c', 'command -v fpm'], { encoding: 'utf8' });
    return result.status === 0 && result.stdout && result.stdout.trim().length > 0;
  } catch {
    return false;
  }
}

function installFpmInWSL() {
  log('Installing fpm prerequisites in WSL...', 'yellow');

  // Install Ruby and build tools
  log('  Installing ruby, ruby-dev, build-essential...', 'gray');
  const aptResult = spawnSync('wsl', ['bash', '-c', 'sudo apt-get update && sudo apt-get install -y ruby ruby-dev build-essential'], {
    stdio: 'inherit'
  });

  if (aptResult.status !== 0) {
    log('Failed to install Ruby prerequisites!', 'red');
    return false;
  }

  // Install fpm via gem
  log('  Installing fpm via gem...', 'gray');
  const gemResult = spawnSync('wsl', ['bash', '-c', 'sudo gem install fpm'], {
    stdio: 'inherit'
  });

  if (gemResult.status !== 0) {
    log('Failed to install fpm!', 'red');
    return false;
  }

  log('fpm installed successfully!', 'green');
  return true;
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
    log('Detected Windows - checking for WSL...', 'yellow');

    const hasWSL = checkWSL();
    log(`  WSL available: ${hasWSL}`, hasWSL ? 'green' : 'red');

    if (!hasWSL) {
      log('\nWSL is required to build .deb packages on Windows.', 'red');
      log('Please install WSL: wsl --install -d Ubuntu', 'yellow');
      process.exit(1);
    }

    // Check for fpm
    log('Checking for fpm in WSL...', 'yellow');
    const hasFpm = checkFpmInWSL();

    if (!hasFpm) {
      log('  fpm not found, installing...', 'yellow');
      if (!installFpmInWSL()) {
        process.exit(1);
      }
    } else {
      log('  fpm is available', 'green');
    }

    // Build using WSL
    log('\nBuilding in WSL...', 'cyan');
    const wslPath = getWSLPath(desktopDir);

    const buildResult = spawnSync('wsl', [
      'bash', '-c',
      `cd '${wslPath}' && npx electron-builder --linux deb`
    ], {
      stdio: 'inherit',
      cwd: desktopDir
    });

    if (buildResult.status !== 0) {
      log('\nBuild failed!', 'red');
      process.exit(1);
    }

  } else {
    // Native Linux/Mac build
    log('Running native electron-builder...', 'cyan');
    if (!runCommand('npx electron-builder --linux deb', { cwd: desktopDir })) {
      log('Build failed!', 'red');
      process.exit(1);
    }
  }

  log('\n=== Build Complete ===', 'green');
}

main().catch(err => {
  log(`Error: ${err.message}`, 'red');
  process.exit(1);
});
