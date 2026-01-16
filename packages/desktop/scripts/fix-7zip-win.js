/**
 * Fixes the 7zip-bin package issue on Windows
 *
 * The 7zip-bin npm package sometimes fails to download 7za.exe on Windows.
 * This script copies the system 7-Zip installation to the expected location.
 */

const fs = require('fs');
const path = require('path');

// Only run on Windows
if (process.platform !== 'win32') {
  console.log('Not Windows, skipping 7-Zip fix');
  process.exit(0);
}

const projectRoot = path.resolve(__dirname, '..', '..', '..');
const sevenZipBinDir = path.join(projectRoot, 'node_modules', '7zip-bin', 'win', 'x64');
const sevenZipBinExe = path.join(sevenZipBinDir, '7za.exe');

// Check if 7za.exe already exists AND is valid (not empty/broken)
if (fs.existsSync(sevenZipBinExe)) {
  try {
    const stats = fs.statSync(sevenZipBinExe);
    // 7za.exe should be at least 500KB - if smaller, it's broken
    if (stats.size > 500000) {
      console.log(`7zip-bin: 7za.exe exists and valid (${Math.round(stats.size/1024)}KB), skipping fix`);
      process.exit(0);
    }
    console.log(`7zip-bin: 7za.exe exists but is broken (${stats.size} bytes), will replace`);
  } catch (err) {
    console.log(`7zip-bin: 7za.exe exists but unreadable, will replace`);
  }
}

console.log('7zip-bin: 7za.exe missing, attempting to fix...');

// Common 7-Zip installation paths
const sevenZipPaths = [
  'C:\\Program Files\\7-Zip\\7z.exe',
  'C:\\Program Files (x86)\\7-Zip\\7z.exe'
];

let systemSevenZip = null;
for (const p of sevenZipPaths) {
  if (fs.existsSync(p)) {
    systemSevenZip = p;
    break;
  }
}

if (!systemSevenZip) {
  console.error('7zip-bin fix: System 7-Zip not found!');
  console.error('');
  console.error('Please install 7-Zip from https://www.7-zip.org/');
  console.error('Or run the full build script: .\\scripts\\build-desktop.ps1');
  console.error('');
  process.exit(1);
}

console.log(`Found system 7-Zip at: ${systemSevenZip}`);

// Create the directory if it doesn't exist
try {
  fs.mkdirSync(sevenZipBinDir, { recursive: true });
} catch (err) {
  if (err.code !== 'EEXIST') {
    console.error(`Failed to create directory ${sevenZipBinDir}:`, err.message);
    process.exit(1);
  }
}

// Copy 7z.exe as 7za.exe
try {
  fs.copyFileSync(systemSevenZip, sevenZipBinExe);
  console.log(`Copied ${systemSevenZip} -> ${sevenZipBinExe}`);
} catch (err) {
  console.error('Failed to copy 7z.exe:', err.message);
  process.exit(1);
}

// Also copy 7z.dll if it exists (needed for some operations)
const systemSevenZipDir = path.dirname(systemSevenZip);
const sevenZipDll = path.join(systemSevenZipDir, '7z.dll');
const destDll = path.join(sevenZipBinDir, '7z.dll');

if (fs.existsSync(sevenZipDll)) {
  try {
    fs.copyFileSync(sevenZipDll, destDll);
    console.log(`Copied ${sevenZipDll} -> ${destDll}`);
  } catch (err) {
    // DLL is optional, don't fail
    console.warn('Warning: Could not copy 7z.dll:', err.message);
  }
}

console.log('7zip-bin fix applied successfully!');
