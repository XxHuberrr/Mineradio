'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function patchFileError(code, message, cause) {
  const error = new Error(message || code);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function decodeCanonicalBase64(value) {
  const raw = String(value == null ? '' : value);
  const normalized = raw.trim();
  if (!normalized) {
    if (!raw) return Buffer.alloc(0);
    throw patchFileError('INVALID_PATCH_FILE_CONTENT', 'Patch file content is not valid base64');
  }
  if (normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw patchFileError('INVALID_PATCH_FILE_CONTENT', 'Patch file content is not valid base64');
  }
  const decoded = Buffer.from(normalized, 'base64');
  if (decoded.toString('base64') !== normalized) {
    throw patchFileError('INVALID_PATCH_FILE_CONTENT', 'Patch file content is not canonical base64');
  }
  return decoded;
}

function decodePatchFile(file) {
  if (!file || typeof file !== 'object') throw patchFileError('INVALID_PATCH_FILE', 'Patch file entry is invalid');
  if (typeof file.contentBase64 === 'string') return decodeCanonicalBase64(file.contentBase64);
  if (typeof file.content !== 'string') throw patchFileError('INVALID_PATCH_FILE_CONTENT', 'Patch file content is missing');
  const encoding = String(file.encoding || 'utf8').trim().toLowerCase();
  if (encoding === 'base64') return decodeCanonicalBase64(file.content);
  if (encoding !== 'utf8' && encoding !== 'utf-8') {
    throw patchFileError('INVALID_PATCH_FILE_ENCODING', 'Patch file encoding must be utf8 or base64');
  }
  return Buffer.from(file.content, 'utf8');
}

function createPatchFileApplier(options) {
  const config = options || {};
  const rootDir = path.resolve(config.rootDir || '.');
  const rootRealPath = fs.realpathSync(rootDir);
  const backupRoot = path.resolve(config.backupRoot || path.join(rootDir, 'updates', 'backups', 'patches'));
  const maxFileBytes = Number(config.maxFileBytes) > 0 ? Number(config.maxFileBytes) : 12 * 1024 * 1024;
  const allowedRoots = new Set(Array.from(config.allowedRoots || []).map(value => String(value)));
  const allowedFiles = new Set(Array.from(config.allowedFiles || []).map(value => String(value).replace(/\\/g, '/')));

  function safeRelativePath(value) {
    const rel = String(value || '').replace(/\\/g, '/');
    if (!rel || rel !== rel.trim() || rel.startsWith('/') || rel.includes('\0')) return '';
    const parts = rel.split('/').filter(Boolean);
    const reservedWindowsName = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
    if (!parts.length || parts.some(part => (
      part === '..'
      || part === '.'
      || /[<>:"|?*\x00-\x1F]/.test(part)
      || /[. ]$/.test(part)
      || reservedWindowsName.test(part)
    ))) return '';
    const normalized = parts.join('/');
    if (/\.mineradio-(?:patch|restore)$/i.test(normalized)) return '';
    if (allowedFiles.has(normalized)) return normalized;
    if (!allowedRoots.has(parts[0])) return '';
    if (/\.(exe|dll|node|msi|bat|cmd|ps1|pfx|pem|key)$/i.test(normalized)) return '';
    return normalized;
  }

  function targetPath(relativePath) {
    const target = path.resolve(rootDir, relativePath);
    if (target !== rootDir && !target.startsWith(rootDir + path.sep)) return null;
    return target;
  }

  function samePath(left, right) {
    if (process.platform === 'win32') return left.toLowerCase() === right.toLowerCase();
    return left === right;
  }

  function isWithinRealRoot(candidate) {
    const relative = path.relative(rootRealPath, candidate);
    return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
  }

  function invalidFilesystemPath(relativePath, message, cause) {
    return patchFileError(
      'INVALID_PATCH_FILE_PATH',
      message + ': ' + relativePath,
      cause
    );
  }

  function assertStableRoot(relativePath) {
    let currentRoot;
    try {
      currentRoot = fs.realpathSync(rootDir);
    } catch (error) {
      throw invalidFilesystemPath(relativePath, 'Patch root is unavailable', error);
    }
    if (!samePath(currentRoot, rootRealPath)) {
      throw invalidFilesystemPath(relativePath, 'Patch root changed after initialization');
    }
  }

  function inspectFilesystemPath(relativePath, finalType) {
    const target = targetPath(relativePath);
    if (!target) throw invalidFilesystemPath(relativePath, 'Patch path escapes the application root');
    assertStableRoot(relativePath);

    const parts = String(relativePath).split('/').filter(Boolean);
    let current = rootDir;
    for (let index = 0; index < parts.length; index += 1) {
      current = path.join(current, parts[index]);
      let stats;
      try {
        stats = fs.lstatSync(current);
      } catch (error) {
        if (error && error.code === 'ENOENT') return { target, exists: false, stats: null };
        throw error;
      }

      if (stats.isSymbolicLink()) {
        throw invalidFilesystemPath(relativePath, 'Patch path contains a symbolic link or directory junction');
      }
      const isFinal = index === parts.length - 1;
      if (!isFinal && !stats.isDirectory()) {
        throw invalidFilesystemPath(relativePath, 'Patch path contains a non-directory component');
      }
      if (isFinal && finalType === 'file' && !stats.isFile()) {
        throw invalidFilesystemPath(relativePath, 'Patch target is not a regular file');
      }

      let realPath;
      try {
        realPath = fs.realpathSync(current);
      } catch (error) {
        throw invalidFilesystemPath(relativePath, 'Patch path could not be resolved', error);
      }
      if (!isWithinRealRoot(realPath)) {
        throw invalidFilesystemPath(relativePath, 'Patch path resolves outside the application root');
      }
    }
    return { target, exists: true, stats: fs.lstatSync(target) };
  }

  function targetSnapshot(state) {
    if (!state.exists) return { exists: false };
    return {
      exists: true,
      dev: state.stats.dev,
      ino: state.stats.ino,
      size: state.stats.size,
      mtimeMs: state.stats.mtimeMs,
    };
  }

  function assertTargetUnchanged(expected, currentState, relativePath, stage) {
    const current = targetSnapshot(currentState);
    if (
      expected.exists !== current.exists
      || (expected.exists && (
        expected.dev !== current.dev
        || expected.ino !== current.ino
        || expected.size !== current.size
        || expected.mtimeMs !== current.mtimeMs
      ))
    ) {
      throw patchFileError('PATCH_TARGET_CHANGED', 'Patch target changed ' + stage + ': ' + relativePath);
    }
  }

  function ensureTargetParent(relativePath, createdDirectories) {
    assertStableRoot(relativePath);
    const parts = String(relativePath).split('/').filter(Boolean).slice(0, -1);
    let currentRelative = '';
    parts.forEach(part => {
      currentRelative = currentRelative ? currentRelative + '/' + part : part;
      const current = targetPath(currentRelative);
      let stats;
      try {
        stats = fs.lstatSync(current);
      } catch (error) {
        if (!error || error.code !== 'ENOENT') throw error;
        assertStableRoot(relativePath);
        fs.mkdirSync(current);
        createdDirectories.add(currentRelative);
        stats = fs.lstatSync(current);
      }
      if (stats.isSymbolicLink() || !stats.isDirectory()) {
        throw invalidFilesystemPath(relativePath, 'Patch parent is not a safe directory');
      }
      const realPath = fs.realpathSync(current);
      if (!isWithinRealRoot(realPath)) {
        throw invalidFilesystemPath(relativePath, 'Patch parent resolves outside the application root');
      }
    });
  }

  function removeManagedFile(relativePath) {
    const state = inspectFilesystemPath(relativePath, 'file');
    if (state.exists) fs.rmSync(state.target, { force: true });
  }

  function removeCreatedDirectories(createdDirectories, rollbackErrors) {
    Array.from(createdDirectories)
      .sort((left, right) => right.split('/').length - left.split('/').length)
      .forEach(relativePath => {
        try {
          const state = inspectFilesystemPath(relativePath, 'directory');
          if (!state.exists) return;
          if (state.stats.isSymbolicLink() || !state.stats.isDirectory()) {
            throw invalidFilesystemPath(relativePath, 'Created patch path is no longer a directory');
          }
          fs.rmdirSync(state.target);
        } catch (error) {
          if (error && (error.code === 'ENOENT' || error.code === 'ENOTEMPTY' || error.code === 'EEXIST')) return;
          rollbackErrors.push(relativePath + ': ' + (error.message || error));
        }
      });
  }

  function prepareFiles(files) {
    if (!Array.isArray(files) || !files.length) throw patchFileError('PATCH_EMPTY', 'Patch contains no files');
    const seen = new Set();
    return files.map(file => {
      const relativePath = safeRelativePath(file && (file.path || file.name));
      const target = relativePath ? targetPath(relativePath) : null;
      if (!relativePath || !target) throw patchFileError('INVALID_PATCH_FILE_PATH', 'Patch file path is not allowed');
      const initialTargetState = inspectFilesystemPath(relativePath, 'file');
      const collisionKey = relativePath.toLowerCase();
      if (seen.has(collisionKey)) throw patchFileError('PATCH_DUPLICATE_FILE', 'Patch contains a duplicate file path: ' + relativePath);
      seen.add(collisionKey);

      const content = decodePatchFile(file);
      if (content.length > maxFileBytes) throw patchFileError('PATCH_FILE_TOO_LARGE', 'Patch file is too large: ' + relativePath);
      const expectedHash = String(file.sha256 || '').trim().toLowerCase();
      const actualHash = sha256Hex(content);
      if (expectedHash && !/^[a-f0-9]{64}$/.test(expectedHash)) {
        throw patchFileError('PATCH_HASH_INVALID', 'Patch file hash is invalid: ' + relativePath);
      }
      if (expectedHash && expectedHash !== actualHash) {
        throw patchFileError('PATCH_HASH_MISMATCH', 'Patch file hash mismatch: ' + relativePath);
      }
      return { relativePath, target, content, actualHash, initialTarget: targetSnapshot(initialTargetState) };
    });
  }

  function applyFiles(jobId, files) {
    const normalizedJobId = String(jobId || '').trim();
    if (!/^[A-Za-z0-9._-]{1,160}$/.test(normalizedJobId)) {
      throw patchFileError('PATCH_JOB_ID_INVALID', 'Patch job id is invalid');
    }

    const prepared = prepareFiles(files);
    const journal = [];
    const createdDirectories = new Set();
    try {
      prepared.forEach(entry => {
        const backup = path.join(backupRoot, normalizedJobId, entry.relativePath);
        const temporaryRelativePath = entry.relativePath + '.mineradio-patch';
        const temporary = entry.target + '.mineradio-patch';
        const targetState = inspectFilesystemPath(entry.relativePath, 'file');
        assertTargetUnchanged(entry.initialTarget, targetState, entry.relativePath, 'after preflight');
        const existed = targetState.exists;
        const mode = existed ? targetState.stats.mode : null;
        const record = {
          ...entry,
          backup,
          temporary,
          temporaryRelativePath,
          existed,
          mode,
          targetReplaced: false,
        };
        journal.push(record);

        if (existed) {
          fs.mkdirSync(path.dirname(backup), { recursive: true });
          fs.copyFileSync(entry.target, backup);
        }
        ensureTargetParent(entry.relativePath, createdDirectories);
        const beforeWrite = inspectFilesystemPath(entry.relativePath, 'file');
        assertTargetUnchanged(entry.initialTarget, beforeWrite, entry.relativePath, 'during application');
        removeManagedFile(temporaryRelativePath);
        fs.writeFileSync(temporary, entry.content, { flag: 'wx' });
        if (mode != null) fs.chmodSync(temporary, mode);
        inspectFilesystemPath(temporaryRelativePath, 'file');
        if (sha256Hex(fs.readFileSync(temporary)) !== entry.actualHash) {
          throw patchFileError('PATCH_WRITE_VERIFY_FAILED', 'Patch write verification failed: ' + entry.relativePath);
        }
        const beforeRename = inspectFilesystemPath(entry.relativePath, 'file');
        assertTargetUnchanged(entry.initialTarget, beforeRename, entry.relativePath, 'before replacement');
        fs.renameSync(temporary, entry.target);
        record.targetReplaced = true;
      });
      return prepared.map(entry => entry.relativePath);
    } catch (error) {
      const rollbackNeeded = journal.some(record => record.targetReplaced) || createdDirectories.size > 0;
      const rollbackErrors = [];
      journal.slice().reverse().forEach(record => {
        try {
          removeManagedFile(record.temporaryRelativePath);
          if (!record.targetReplaced) return;
          inspectFilesystemPath(record.relativePath, 'file');
          if (record.existed) {
            const restoreRelativePath = record.relativePath + '.mineradio-restore';
            const restoreTemporary = record.target + '.mineradio-restore';
            removeManagedFile(restoreRelativePath);
            fs.copyFileSync(record.backup, restoreTemporary, fs.constants.COPYFILE_EXCL);
            if (record.mode != null) fs.chmodSync(restoreTemporary, record.mode);
            inspectFilesystemPath(restoreRelativePath, 'file');
            inspectFilesystemPath(record.relativePath, 'file');
            fs.renameSync(restoreTemporary, record.target);
          } else {
            removeManagedFile(record.relativePath);
          }
        } catch (rollbackError) {
          rollbackErrors.push(record.relativePath + ': ' + (rollbackError.message || rollbackError));
        }
      });
      removeCreatedDirectories(createdDirectories, rollbackErrors);
      if (rollbackErrors.length) {
        throw patchFileError(
          'PATCH_ROLLBACK_FAILED',
          'Patch failed and rollback was incomplete: ' + rollbackErrors.join('; '),
          error
        );
      }
      error.patchRolledBack = rollbackNeeded;
      throw error;
    }
  }

  return {
    applyFiles,
    prepareFiles,
    safeRelativePath,
  };
}

module.exports = {
  createPatchFileApplier,
};
