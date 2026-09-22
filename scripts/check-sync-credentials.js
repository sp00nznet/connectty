/**
 * Self-check for the cloud-sync OAuth credential store (Settings > Sync Accounts >
 * Credentials). Needs a built main process and Electron's node ABI - better-sqlite3
 * is compiled against it:
 *
 *   npm run build:main -w @connectty/desktop
 *   ELECTRON_RUN_AS_NODE=1 npx electron scripts/check-sync-credentials.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { DatabaseService } = require('../packages/desktop/dist/main/database.js');

const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'connectty-check-')), 'check.db');
const db = new DatabaseService(dbPath);

assert.strictEqual(db.getOAuthCredentials(), null, 'starts unset');

db.setOAuthCredentials({
  githubClientId: 'Ov23liEXAMPLE', githubClientSecret: 'gh-secret',
  googleClientId: '123.apps.googleusercontent.com', googleClientSecret: 'goog-secret',
});
const stored = db.getOAuthCredentials();
assert.strictEqual(stored.githubClientId, 'Ov23liEXAMPLE');
assert.strictEqual(stored.googleClientSecret, 'goog-secret');

// The secrets are the whole point of encrypting the row - they must not be readable.
const row = new Database(dbPath).prepare("SELECT value FROM settings WHERE key='oauth_credentials'").get();
assert.ok(!JSON.stringify(row).includes('secret'), 'client secret stored in cleartext');

// A cleared field is removed rather than stored as an empty string...
db.setOAuthCredentials({ githubClientId: 'Ov23liEXAMPLE', githubClientSecret: '', googleClientId: '', googleClientSecret: '' });
assert.deepStrictEqual(db.getOAuthCredentials(), { githubClientId: 'Ov23liEXAMPLE' });

// ...and clearing all of them drops the row, so "not configured" stays one state.
db.setOAuthCredentials({ githubClientId: '', githubClientSecret: '', googleClientId: '', googleClientSecret: '' });
assert.strictEqual(db.getOAuthCredentials(), null, 'cleared');

db.close();
console.log('OK: credential round trip, encryption at rest, blank handling');
