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
const WEB_PUBLIC_DIR = path.join(PROJECT_ROOT, 'packages', 'web', 'public');

console.log('=== Icon Generation Script ===');
console.log(`Source: ${SOURCE_ICON}`);
console.log(`Target (desktop): ${ASSETS_DIR}`);
console.log(`Target (web): ${WEB_PUBLIC_DIR}`);

// Check if source exists
if (!fs.existsSync(SOURCE_ICON)) {
  console.error(`Error: Source icon not found at ${SOURCE_ICON}`);
  process.exit(1);
}

// Create directories if they don't exist
if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
}
if (!fs.existsSync(WEB_PUBLIC_DIR)) {
  fs.mkdirSync(WEB_PUBLIC_DIR, { recursive: true });
}

async function generateIcons() {
  const iconPng = path.join(ASSETS_DIR, 'icon.png');
  const iconIco = path.join(ASSETS_DIR, 'icon.ico');
  const webIconPng = path.join(WEB_PUBLIC_DIR, 'icon.png');

  // Try to use sharp for image processing
  let sharp;
  try {
    sharp = require('sharp');
    console.log('Using sharp for image processing...');
  } catch (e) {
    console.log('sharp not available, using direct copy...');
    sharp = null;
  }

  if (sharp) {
    // Process icon with sharp - add a light background to fix transparency issues on Windows taskbar
    console.log('Processing icon with background for Windows compatibility...');

    // Create a version with solid background for ICO (fixes black bar on taskbar)
    const processedIconPath = path.join(ASSETS_DIR, 'icon-processed.png');
    await sharp(SOURCE_ICON)
      .flatten({ background: { r: 240, g: 240, b: 240 } }) // Light gray background
      .resize(256, 256, { fit: 'contain', background: { r: 240, g: 240, b: 240 } })
      .png()
      .toFile(processedIconPath);

    // Copy original (with transparency) for PNG uses
    await sharp(SOURCE_ICON)
      .resize(256, 256, { fit: 'contain' })
      .png()
      .toFile(iconPng);
    console.log(`  Created: ${iconPng}`);

    // Copy to web public
    fs.copyFileSync(iconPng, webIconPng);
    console.log(`  Created: ${webIconPng}`);

    // Generate ICO using the processed (with background) version
    await generateIcoFromPng(processedIconPath, iconIco, sharp);

    // Clean up processed file
    fs.unlinkSync(processedIconPath);
  } else {
    // Fallback: direct copy
    console.log('Copying source icon to desktop assets...');
    fs.copyFileSync(SOURCE_ICON, iconPng);
    console.log(`  Created: ${iconPng}`);

    console.log('Copying source icon to web public...');
    fs.copyFileSync(SOURCE_ICON, webIconPng);
    console.log(`  Created: ${webIconPng}`);

    // Try to generate ICO without sharp
    await generateIcoFromPng(iconPng, iconIco, null);
  }

  console.log('');
  console.log('=== Icon Generation Complete ===');
  console.log('Generated icons:');
  fs.readdirSync(ASSETS_DIR)
    .filter(f => f.startsWith('icon.'))
    .forEach(f => {
      const stat = fs.statSync(path.join(ASSETS_DIR, f));
      console.log(`  ${f} (${stat.size} bytes)`);
    });
}

async function generateIcoFromPng(pngPath, icoPath, sharp) {
  // Method 1: Try png-to-ico npm package
  try {
    const pngToIco = require('png-to-ico');

    if (sharp) {
      // Generate multiple sizes for better ICO quality
      const sizes = [256, 128, 64, 48, 32, 24, 16];
      const tempDir = path.join(ASSETS_DIR, 'temp-ico');

      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const pngFiles = [];
      for (const size of sizes) {
        const tempFile = path.join(tempDir, `icon-${size}.png`);
        await sharp(pngPath)
          .resize(size, size, { fit: 'contain', background: { r: 240, g: 240, b: 240 } })
          .flatten({ background: { r: 240, g: 240, b: 240 } })
          .png()
          .toFile(tempFile);
        pngFiles.push(tempFile);
      }

      // Generate ICO from multiple sizes
      const buffer = await pngToIco(pngFiles);
      fs.writeFileSync(icoPath, buffer);
      console.log(`  Created: ${icoPath} (multi-resolution ICO)`);

      // Cleanup temp files
      for (const file of pngFiles) {
        fs.unlinkSync(file);
      }
      fs.rmdirSync(tempDir);
    } else {
      // Single file ICO
      const buffer = await pngToIco(pngPath);
      fs.writeFileSync(icoPath, buffer);
      console.log(`  Created: ${icoPath} (using png-to-ico)`);
    }
    return true;
  } catch (e) {
    // png-to-ico not available, try other methods
  }

  // Method 2: Try ImageMagick (convert/magick)
  try {
    execSync(`magick "${pngPath}" -define icon:auto-resize=256,128,96,64,48,32,24,16 "${icoPath}"`, { stdio: 'pipe' });
    console.log(`  Created: ${icoPath} (using ImageMagick 7)`);
    return true;
  } catch (e) {
    // Ignore
  }

  try {
    execSync(`convert "${pngPath}" -define icon:auto-resize=256,128,96,64,48,32,24,16 "${icoPath}"`, { stdio: 'pipe' });
    console.log(`  Created: ${icoPath} (using ImageMagick 6)`);
    return true;
  } catch (e) {
    // Ignore
  }

  // Fallback: Copy PNG as ICO (electron-builder will handle conversion)
  console.log('Warning: No ICO converter found. Copying PNG as icon.ico');
  console.log('  electron-builder will handle the conversion during build');
  fs.copyFileSync(pngPath, icoPath);
  return false;
}

// Run the async function
generateIcons().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
