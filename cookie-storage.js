'use strict';

const fs = require('fs');
const path = require('path');

const ENCRYPTED_COOKIE_PREFIX = 'MINERADIO_SAFE_STORAGE_V1:';

function loadElectronSafeStorage() {
  try {
    const electron = require('electron');
    return electron && electron.safeStorage ? electron.safeStorage : null;
  } catch (_) {
    return null;
  }
}

function encryptionAvailable(safeStorage) {
  try {
    return !!(safeStorage
      && typeof safeStorage.isEncryptionAvailable === 'function'
      && safeStorage.isEncryptionAvailable()
      && typeof safeStorage.encryptString === 'function'
      && typeof safeStorage.decryptString === 'function');
  } catch (_) {
    return false;
  }
}

function secureAtomicWrite(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(temporaryPath, content, { encoding: 'utf8', mode: 0o600, flag: 'w' });
    try { fs.chmodSync(temporaryPath, 0o600); } catch (_) {}
    try {
      fs.renameSync(temporaryPath, filePath);
    } catch (error) {
      if (!['EEXIST', 'EPERM'].includes(error.code)) throw error;
      try { fs.unlinkSync(filePath); } catch (unlinkError) {
        if (unlinkError.code !== 'ENOENT') throw unlinkError;
      }
      fs.renameSync(temporaryPath, filePath);
    }
    try { fs.chmodSync(filePath, 0o600); } catch (_) {}
  } finally {
    try { fs.unlinkSync(temporaryPath); } catch (_) {}
  }
}

function createCookieStore(filePath, options) {
  options = options || {};
  const hasExplicitSafeStorage = Object.prototype.hasOwnProperty.call(options, 'safeStorage');
  const safeStorage = hasExplicitSafeStorage ? options.safeStorage : loadElectronSafeStorage();
  const electronRuntime = Object.prototype.hasOwnProperty.call(options, 'electronRuntime')
    ? !!options.electronRuntime
    : !!process.versions.electron;
  const logger = options.logger || console;
  const label = options.label || path.basename(filePath);

  function warn(message, error) {
    if (!logger || typeof logger.warn !== 'function') return;
    logger.warn(`[CookieStorage] ${label}: ${message}${error && error.message ? ` (${error.message})` : ''}`);
  }

  function write(value) {
    const normalized = String(value || '').trim();
    if (!normalized) {
      try { fs.unlinkSync(filePath); } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      return { encrypted: false, removed: true };
    }

    if (encryptionAvailable(safeStorage)) {
      const encrypted = safeStorage.encryptString(normalized);
      const payload = ENCRYPTED_COOKIE_PREFIX + Buffer.from(encrypted).toString('base64') + '\n';
      secureAtomicWrite(filePath, payload);
      return { encrypted: true, removed: false };
    }

    if (electronRuntime) {
      const error = new Error('Electron safeStorage encryption is unavailable');
      error.code = 'COOKIE_ENCRYPTION_UNAVAILABLE';
      throw error;
    }

    secureAtomicWrite(filePath, normalized + '\n');
    return { encrypted: false, removed: false };
  }

  function read() {
    let raw;
    try {
      raw = fs.readFileSync(filePath, 'utf8').trim();
    } catch (error) {
      if (error.code !== 'ENOENT') warn('read failed', error);
      return '';
    }
    if (!raw) return '';

    if (raw.startsWith(ENCRYPTED_COOKIE_PREFIX)) {
      if (!encryptionAvailable(safeStorage)) {
        warn('encrypted cookie cannot be decrypted because safeStorage is unavailable');
        return '';
      }
      try {
        const encoded = raw.slice(ENCRYPTED_COOKIE_PREFIX.length).trim();
        if (!encoded) throw new Error('Encrypted cookie payload is empty');
        return String(safeStorage.decryptString(Buffer.from(encoded, 'base64')) || '').trim();
      } catch (error) {
        warn('decrypt failed', error);
        return '';
      }
    }

    if (encryptionAvailable(safeStorage)) {
      try {
        write(raw);
      } catch (error) {
        warn('plaintext migration failed', error);
      }
    }
    return raw;
  }

  return {
    filePath,
    read,
    write,
  };
}

module.exports = {
  ENCRYPTED_COOKIE_PREFIX,
  createCookieStore,
};
