'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ENCRYPTED_COOKIE_PREFIX, createCookieStore } = require('../cookie-storage');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-cookie-test-'));
const silentLogger = { warn() {} };
const fakeSafeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: value => Buffer.from('encrypted:' + value, 'utf8'),
  decryptString: buffer => {
    const value = buffer.toString('utf8');
    if (!value.startsWith('encrypted:')) throw new Error('invalid encrypted payload');
    return value.slice('encrypted:'.length);
  },
};

try {
  const encryptedPath = path.join(tempRoot, '.cookie');
  const encryptedStore = createCookieStore(encryptedPath, {
    safeStorage: fakeSafeStorage,
    electronRuntime: true,
    logger: silentLogger,
  });
  const cookie = 'MUSIC_U=secret-token; __csrf=csrf-token';
  const writeResult = encryptedStore.write(cookie);
  const encryptedFile = fs.readFileSync(encryptedPath, 'utf8');
  assert.strictEqual(writeResult.encrypted, true);
  assert.ok(encryptedFile.startsWith(ENCRYPTED_COOKIE_PREFIX));
  assert.strictEqual(encryptedFile.includes('secret-token'), false);
  assert.strictEqual(encryptedStore.read(), cookie);
  if (process.platform !== 'win32') {
    assert.strictEqual(fs.statSync(encryptedPath).mode & 0o777, 0o600);
  }

  const legacyPath = path.join(tempRoot, '.qq-cookie');
  fs.writeFileSync(legacyPath, 'uin=10001; qm_keyst=legacy-key\n');
  const legacyStore = createCookieStore(legacyPath, {
    safeStorage: fakeSafeStorage,
    electronRuntime: true,
    logger: silentLogger,
  });
  assert.strictEqual(legacyStore.read(), 'uin=10001; qm_keyst=legacy-key');
  assert.ok(fs.readFileSync(legacyPath, 'utf8').startsWith(ENCRYPTED_COOKIE_PREFIX));

  encryptedStore.write('');
  assert.strictEqual(fs.existsSync(encryptedPath), false);

  const standalonePath = path.join(tempRoot, '.standalone-cookie');
  const standaloneStore = createCookieStore(standalonePath, {
    safeStorage: null,
    electronRuntime: false,
    logger: silentLogger,
  });
  standaloneStore.write('MUSIC_U=standalone');
  assert.strictEqual(standaloneStore.read(), 'MUSIC_U=standalone');
  assert.strictEqual(fs.readFileSync(standalonePath, 'utf8').trim(), 'MUSIC_U=standalone');

  const Module = require('module');
  const originalModuleLoad = Module._load;
  let standaloneElectronLoadAttempted = false;
  Module._load = function(request, parent, isMain) {
    if (request === 'electron') {
      standaloneElectronLoadAttempted = true;
      return { safeStorage: fakeSafeStorage };
    }
    return originalModuleLoad.call(this, request, parent, isMain);
  };
  try {
    createCookieStore(path.join(tempRoot, '.auto-standalone-cookie'), {
      electronRuntime: false,
      logger: silentLogger,
    });
  } finally {
    Module._load = originalModuleLoad;
  }
  assert.strictEqual(
    standaloneElectronLoadAttempted,
    false,
    'Standalone Node mode must not load the Electron package'
  );

  const unavailableStore = createCookieStore(path.join(tempRoot, '.unavailable-cookie'), {
    safeStorage: null,
    electronRuntime: true,
    logger: silentLogger,
  });
  assert.throws(
    () => unavailableStore.write('MUSIC_U=must-not-be-plaintext'),
    error => error && error.code === 'COOKIE_ENCRYPTION_UNAVAILABLE'
  );

  const corruptPath = path.join(tempRoot, '.corrupt-cookie');
  fs.writeFileSync(corruptPath, ENCRYPTED_COOKIE_PREFIX + 'not-valid-encrypted-data\n');
  const corruptStore = createCookieStore(corruptPath, {
    safeStorage: fakeSafeStorage,
    electronRuntime: true,
    logger: silentLogger,
  });
  assert.strictEqual(corruptStore.read(), '');

  console.log('[cookie-test] Encryption, migration, permissions and fallback passed.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
