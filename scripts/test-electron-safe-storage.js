'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const electron = require('electron');
const { ENCRYPTED_COOKIE_PREFIX, createCookieStore } = require('../cookie-storage');

if (!electron || !electron.app || !electron.safeStorage) {
  throw new Error('This test must run in the Electron main process');
}

const { app, safeStorage } = electron;
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-electron-safe-storage-'));
const userData = path.join(workspace, 'user-data');
const cookiePath = path.join(workspace, '.cookie');

app.disableHardwareAcceleration();
app.setPath('userData', userData);

async function run() {
  assert.strictEqual(process.platform, 'win32', 'DPAPI integration test must run on Windows');
  await app.whenReady();

  assert.strictEqual(
    safeStorage.isEncryptionAvailable(),
    true,
    'Electron safeStorage encryption must be available on the Windows runner'
  );

  const store = createCookieStore(cookiePath, {
    safeStorage,
    electronRuntime: true,
    label: 'windows-dpapi-test',
    logger: { warn() {} },
  });
  const cookie = 'MUSIC_U=dpapi-integration-secret; __csrf=test-token';

  const writeResult = store.write(cookie);
  assert.deepStrictEqual(writeResult, { encrypted: true, removed: false });
  const encryptedRaw = fs.readFileSync(cookiePath, 'utf8').trim();
  assert.ok(encryptedRaw.startsWith(ENCRYPTED_COOKIE_PREFIX));
  assert.ok(!encryptedRaw.includes(cookie), 'Encrypted cookie file must not contain plaintext');
  assert.strictEqual(store.read(), cookie);

  const legacyCookie = 'MUSIC_U=legacy-plaintext-cookie; __csrf=legacy-token';
  fs.writeFileSync(cookiePath, legacyCookie + '\n', 'utf8');
  assert.strictEqual(store.read(), legacyCookie, 'Legacy plaintext cookie must remain readable during migration');
  const migratedRaw = fs.readFileSync(cookiePath, 'utf8').trim();
  assert.ok(migratedRaw.startsWith(ENCRYPTED_COOKIE_PREFIX), 'Legacy cookie must migrate to safeStorage');
  assert.ok(!migratedRaw.includes(legacyCookie), 'Migrated cookie file must not retain plaintext');
  assert.strictEqual(store.read(), legacyCookie);

  assert.deepStrictEqual(store.write(''), { encrypted: false, removed: true });
  assert.strictEqual(fs.existsSync(cookiePath), false, 'Logout must remove the encrypted cookie file');

  console.log('[electron-safe-storage-test] Windows Electron safeStorage/DPAPI write, read, migration and removal passed.');
}

run().then(() => {
  try { fs.rmSync(workspace, { recursive: true, force: true }); } catch (_) {}
  app.quit();
}).catch(error => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
  try { fs.rmSync(workspace, { recursive: true, force: true }); } catch (_) {}
  app.quit();
});
