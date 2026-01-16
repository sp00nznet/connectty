#!/usr/bin/env node
/**
 * Generate application icons from gfx/screen.png
 * Cross-platform script that works on Windows, macOS, and Linux
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SOURCE_ICON = path.join(PROJECT_ROOT, 'gfx', 'screen.png');
const ASSETS_DIR = path.join(PROJECT_ROOT, 'packages', 'desktop', 'assets');

console.log('=== Icon Generation Script ===');
console.log(`Source: ${SOURCE_ICON}`);
console.log(`Target: ${ASSETS_DIR}`);

// Check if source exists
if (!fs.existsSync(SOURCE_ICON)) {
  console.error(`Error: Source icon not found at ${SOURCE_ICON}`);
  process.exit(1);
}

// Create assets directory if it doesn't exist
if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
}

// Copy source to icon.png
console.log('Copying source icon to icon.png...');
fs.copyFileSync(SOURCE_ICON, path.join(ASSETS_DIR, 'icon.png'));
console.log(`  Created: ${path.join(ASSETS_DIR, 'icon.png')}`);

// Try to generate ICO using various methods
function generateIco() {
  const iconPng = path.join(ASSETS_DIR, 'icon.png');
  const iconIco = path.join(ASSETS_DIR, 'icon.ico');

  // Method 1: Try ImageMagick (convert/magick)
  try {
    // Try 'magick' first (ImageMagick 7)
    execSync(`magick "${iconPng}" -define icon:auto-resize=256,128,96,64,48,32,24,16 "${iconIco}"`, { stdio: 'pipe' });
    console.log('Generated icon.ico using ImageMagick 7');
    return true;
  } catch (e) {
    // Ignore
  }

  try {
    // Try 'convert' (ImageMagick 6)
    execSync(`convert "${iconPng}" -define icon:auto-resize=256,128,96,64,48,32,24,16 "${iconIco}"`, { stdio: 'pipe' });
    console.log('Generated icon.ico using ImageMagick 6');
    return true;
  } catch (e) {
    // Ignore
  }

  // Method 2: On Windows, try png-to-ico npm package if available
  try {
    const pngToIco = require('png-to-ico');
    const buffer = pngToIco(iconPng);
    fs.writeFileSync(iconIco, buffer);
    console.log('Generated icon.ico using png-to-ico');
    return true;
  } catch (e) {
    // Ignore - package not installed
  }

  // Fallback: Copy PNG as ICO (electron-builder will handle conversion)
  console.log('Warning: No ICO converter found. Copying PNG as icon.ico');
  console.log('  electron-builder will handle the conversion during build');
  fs.copyFileSync(iconPng, iconIco);
  return false;
}

generateIco();

console.log('');
console.log('=== Icon Generation Complete ===');
console.log('Generated icons:');
fs.readdirSync(ASSETS_DIR)
  .filter(f => f.startsWith('icon.'))
  .forEach(f => {
    const stat = fs.statSync(path.join(ASSETS_DIR, f));
    console.log(`  ${f} (${stat.size} bytes)`);
  });
