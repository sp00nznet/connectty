#!/usr/bin/env node
/**
 * Downloads gsudo for bundling with Windows builds
 * gsudo is MIT licensed and allows redistribution
 * https://github.com/gerardog/gsudo
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const GSUDO_VERSION = 'v2.5.1';
const GSUDO_URL = `https://github.com/gerardog/gsudo/releases/download/${GSUDO_VERSION}/gsudo.portable.zip`;
const RESOURCES_DIR = path.join(__dirname, '..', 'resources', 'gsudo');

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);

    const request = (url) => {
      https.get(url, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          request(response.headers.location);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: ${response.statusCode}`));
          return;
        }

        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      }).on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    };

    request(url);
  });
}

async function main() {
  console.log(`Downloading gsudo ${GSUDO_VERSION}...`);

  // Ensure resources directory exists
  if (!fs.existsSync(RESOURCES_DIR)) {
    fs.mkdirSync(RESOURCES_DIR, { recursive: true });
  }

  const zipPath = path.join(RESOURCES_DIR, 'gsudo.zip');

  try {
    // Download the zip
    await downloadFile(GSUDO_URL, zipPath);
    console.log('Downloaded gsudo.portable.zip');

    // Extract using system tools
    if (process.platform === 'win32') {
      execSync(`powershell -Command "Expand-Archive -Force '${zipPath}' '${RESOURCES_DIR}'"`, { stdio: 'inherit' });
    } else {
      execSync(`unzip -o "${zipPath}" -d "${RESOURCES_DIR}"`, { stdio: 'inherit' });
    }
    console.log('Extracted gsudo');

    // Copy x64 version to root (most common)
    const x64Dir = path.join(RESOURCES_DIR, 'x64');
    if (fs.existsSync(x64Dir)) {
      const files = fs.readdirSync(x64Dir);
      for (const file of files) {
        fs.copyFileSync(path.join(x64Dir, file), path.join(RESOURCES_DIR, file));
      }
      console.log('Copied x64 binaries to resources/gsudo/');
    }

    // Cleanup zip
    fs.unlinkSync(zipPath);

    // Create a LICENSE file noting the MIT license
    fs.writeFileSync(path.join(RESOURCES_DIR, 'LICENSE.txt'),
      `gsudo - MIT License\n` +
      `https://github.com/gerardog/gsudo\n\n` +
      `gsudo is included under the MIT License.\n` +
      `See https://github.com/gerardog/gsudo/blob/master/LICENSE.txt for full license.\n`
    );

    console.log('gsudo downloaded and ready for bundling!');

  } catch (err) {
    console.error('Failed to download gsudo:', err.message);
    console.error('You can manually download from:', GSUDO_URL);
    process.exit(1);
  }
}

main();
