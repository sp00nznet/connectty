#!/usr/bin/env node
/**
 * Sync version from version.json to all package.json files
 * Run this before building to ensure versions are in sync
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const versionFile = path.join(rootDir, 'version.json');

// Read version.json
let versionData;
try {
  versionData = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
} catch (e) {
  console.error('Error reading version.json:', e.message);
  process.exit(1);
}

const fullVersion = versionData.version; // 1.0.0.0
const npmVersion = `${versionData.major}.${versionData.minor}.${versionData.patch}`; // 1.0.0

console.log(`Syncing version: ${fullVersion} (npm: ${npmVersion})`);

// Package.json files to update
const packageFiles = [
  'package.json',
  'packages/shared/package.json',
  'packages/desktop/package.json',
  'packages/server/package.json',
  'packages/web/package.json'
];

// Update each package.json
packageFiles.forEach(file => {
  const filePath = path.join(rootDir, file);
  if (fs.existsSync(filePath)) {
    const pkg = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    pkg.version = npmVersion;

    // Update @connectty/shared dependency if present
    if (pkg.dependencies && pkg.dependencies['@connectty/shared']) {
      pkg.dependencies['@connectty/shared'] = npmVersion;
    }

    fs.writeFileSync(filePath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    console.log(`  Updated ${file}`);
  }
});

// Output version for use in build scripts
console.log(`\nVersion sync complete!`);
console.log(`Full version: ${fullVersion}`);
console.log(`npm version: ${npmVersion}`);

// Export for use by other scripts
module.exports = { fullVersion, npmVersion, versionData };
