/**
 * Wrapper for electron-builder on Windows that sets ELECTRON_BUILDER_7Z_PATH
 * to bypass the broken 7zip-bin package entirely.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Find system 7-Zip
const sevenZipPaths = [
  'C:\\Program Files\\7-Zip\\7z.exe',
  'C:\\Program Files (x86)\\7-Zip\\7z.exe'
];

let sevenZipPath = null;
for (const p of sevenZipPaths) {
  if (fs.existsSync(p)) {
    sevenZipPath = p;
    break;
  }
}

if (sevenZipPath) {
  process.env.ELECTRON_BUILDER_7Z_PATH = sevenZipPath;
  console.log(`Using system 7-Zip: ${sevenZipPath}`);
}

// Run electron-builder with all arguments passed through
const args = ['--win', ...process.argv.slice(2)];
console.log(`Running: electron-builder ${args.join(' ')}`);

const electronBuilder = spawn('npx', ['electron-builder', ...args], {
  stdio: 'inherit',
  shell: true,
  env: process.env
});

electronBuilder.on('close', (code) => {
  process.exit(code);
});
