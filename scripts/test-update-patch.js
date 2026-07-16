'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createPatchFileApplier } = require('../update-patch');

function sha256(value) {
  return crypto.createHash('sha256').update(Buffer.from(value)).digest('hex');
}

function textFile(relativePath, content) {
  return {
    path: relativePath,
    content,
    encoding: 'utf8',
    sha256: sha256(content),
  };
}

function errorCode(code) {
  return error => error && error.code === code;
}

function withWorkspace(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-update-patch-'));
  const appRoot = path.join(root, 'app');
  const backupRoot = path.join(root, 'backups');
  fs.mkdirSync(path.join(appRoot, 'public'), { recursive: true });
  const applier = createPatchFileApplier({
    rootDir: appRoot,
    backupRoot,
    maxFileBytes: 1024 * 1024,
    allowedRoots: ['public', 'desktop', 'build'],
    allowedFiles: ['server.js', 'update-patch.js'],
  });
  try {
    run({ root, appRoot, backupRoot, applier });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

withWorkspace(({ appRoot, backupRoot, applier }) => {
  fs.writeFileSync(path.join(appRoot, 'server.js'), 'old server');
  const changed = applier.applyFiles('patch-success', [
    textFile('server.js', 'new server'),
    textFile('public/new.txt', 'new resource'),
  ]);
  assert.deepStrictEqual(changed, ['server.js', 'public/new.txt']);
  assert.strictEqual(fs.readFileSync(path.join(appRoot, 'server.js'), 'utf8'), 'new server');
  assert.strictEqual(fs.readFileSync(path.join(appRoot, 'public/new.txt'), 'utf8'), 'new resource');
  assert.strictEqual(fs.readFileSync(path.join(backupRoot, 'patch-success', 'server.js'), 'utf8'), 'old server');
});

withWorkspace(({ appRoot, applier }) => {
  fs.writeFileSync(path.join(appRoot, 'server.js'), 'old server');
  const malformed = textFile('public/bad.txt', 'bad resource');
  malformed.sha256 = '00'.repeat(32);
  assert.throws(() => applier.applyFiles('patch-preflight', [
    textFile('server.js', 'new server'),
    malformed,
  ]), errorCode('PATCH_HASH_MISMATCH'));
  assert.strictEqual(fs.readFileSync(path.join(appRoot, 'server.js'), 'utf8'), 'old server');
  assert.strictEqual(fs.existsSync(path.join(appRoot, 'public/bad.txt')), false);
});

withWorkspace(({ appRoot, applier }) => {
  fs.writeFileSync(path.join(appRoot, 'server.js'), 'old server');
  assert.throws(() => applier.applyFiles('patch-duplicate', [
    textFile('server.js', 'first'),
    textFile('server.js', 'second'),
  ]), errorCode('PATCH_DUPLICATE_FILE'));
  assert.strictEqual(fs.readFileSync(path.join(appRoot, 'server.js'), 'utf8'), 'old server');
});

withWorkspace(({ appRoot, applier }) => {
  fs.writeFileSync(path.join(appRoot, 'server.js'), 'old server');
  const originalRenameSync = fs.renameSync;
  let failure;
  fs.renameSync = (source, target) => {
    if (source.endsWith('.mineradio-patch') && target.endsWith(path.join('public', 'blocked.txt'))) {
      const error = new Error('simulated write failure');
      error.code = 'EACCES';
      throw error;
    }
    return originalRenameSync(source, target);
  };
  try {
    applier.applyFiles('patch-rollback', [
      textFile('server.js', 'new server'),
      textFile('public/new.txt', 'temporary resource'),
      textFile('public/blocked.txt', 'cannot finish this write'),
    ]);
  } catch (error) {
    failure = error;
  } finally {
    fs.renameSync = originalRenameSync;
  }
  assert.ok(failure, 'Filesystem failure should reject the patch');
  assert.strictEqual(failure.patchRolledBack, true);
  assert.strictEqual(fs.readFileSync(path.join(appRoot, 'server.js'), 'utf8'), 'old server');
  assert.strictEqual(fs.existsSync(path.join(appRoot, 'public/new.txt')), false);
  assert.strictEqual(fs.existsSync(path.join(appRoot, 'public/blocked.txt')), false);
});

withWorkspace(({ appRoot, applier }) => {
  fs.writeFileSync(path.join(appRoot, 'server.js'), 'old server');
  const originalRenameSync = fs.renameSync;
  let failure;
  fs.renameSync = (source, target) => {
    const isPatchFailure = source.endsWith('.mineradio-patch') && target.endsWith(path.join('public', 'blocked.txt'));
    const isRestoreFailure = source.endsWith('.mineradio-restore') && target.endsWith('server.js');
    if (isPatchFailure || isRestoreFailure) {
      const error = new Error('simulated rollback failure');
      error.code = 'EACCES';
      throw error;
    }
    return originalRenameSync(source, target);
  };
  try {
    applier.applyFiles('patch-rollback-failed', [
      textFile('server.js', 'new server'),
      textFile('public/blocked.txt', 'cannot finish this write'),
    ]);
  } catch (error) {
    failure = error;
  } finally {
    fs.renameSync = originalRenameSync;
  }
  assert.ok(failure, 'Incomplete rollback should reject the patch');
  assert.strictEqual(failure.code, 'PATCH_ROLLBACK_FAILED');
  assert.strictEqual(fs.readFileSync(path.join(appRoot, 'server.js'), 'utf8'), 'new server');
});

withWorkspace(({ root, appRoot, applier }) => {
  const outsideRoot = path.join(root, 'outside');
  const outsideFile = path.join(outsideRoot, 'escape.txt');
  fs.mkdirSync(outsideRoot, { recursive: true });
  fs.writeFileSync(outsideFile, 'outside sentinel');
  fs.symlinkSync(outsideRoot, path.join(appRoot, 'public', 'linked'), process.platform === 'win32' ? 'junction' : 'dir');

  assert.throws(() => applier.applyFiles('patch-symlink-preflight', [
    textFile('public/linked/escape.txt', 'malicious overwrite'),
  ]), errorCode('INVALID_PATCH_FILE_PATH'));
  assert.strictEqual(fs.readFileSync(outsideFile, 'utf8'), 'outside sentinel');
});

withWorkspace(({ root, appRoot, applier }) => {
  const outsideRoot = path.join(root, 'outside-race');
  const outsideFile = path.join(outsideRoot, 'escape.txt');
  const lateDirectory = path.join(appRoot, 'public', 'late');
  fs.mkdirSync(outsideRoot, { recursive: true });
  fs.mkdirSync(lateDirectory, { recursive: true });
  fs.writeFileSync(outsideFile, 'outside sentinel');
  fs.writeFileSync(path.join(appRoot, 'server.js'), 'old server');

  const originalRenameSync = fs.renameSync;
  let failure;
  let pathSwapped = false;
  fs.renameSync = (source, target) => {
    const result = originalRenameSync(source, target);
    if (!pathSwapped && source.endsWith('.mineradio-patch') && target === path.join(appRoot, 'server.js')) {
      fs.rmSync(lateDirectory, { recursive: true, force: true });
      fs.symlinkSync(outsideRoot, lateDirectory, process.platform === 'win32' ? 'junction' : 'dir');
      pathSwapped = true;
    }
    return result;
  };
  try {
    applier.applyFiles('patch-symlink-race', [
      textFile('server.js', 'new server'),
      textFile('public/late/escape.txt', 'malicious overwrite'),
    ]);
  } catch (error) {
    failure = error;
  } finally {
    fs.renameSync = originalRenameSync;
  }

  assert.ok(failure, 'A path replaced with a symlink after preflight should reject the patch');
  assert.strictEqual(failure.code, 'INVALID_PATCH_FILE_PATH');
  assert.strictEqual(failure.patchRolledBack, true);
  assert.strictEqual(fs.readFileSync(path.join(appRoot, 'server.js'), 'utf8'), 'old server');
  assert.strictEqual(fs.readFileSync(outsideFile, 'utf8'), 'outside sentinel');
});

withWorkspace(({ appRoot, applier }) => {
  const lateTarget = path.join(appRoot, 'public', 'late', 'new.txt');
  fs.mkdirSync(path.dirname(lateTarget), { recursive: true });
  fs.writeFileSync(path.join(appRoot, 'server.js'), 'old server');

  const originalRenameSync = fs.renameSync;
  let failure;
  let targetCreated = false;
  fs.renameSync = (source, target) => {
    const result = originalRenameSync(source, target);
    if (!targetCreated && source.endsWith('.mineradio-patch') && target === path.join(appRoot, 'server.js')) {
      fs.writeFileSync(lateTarget, 'concurrent local change');
      targetCreated = true;
    }
    return result;
  };
  try {
    applier.applyFiles('patch-target-race', [
      textFile('server.js', 'new server'),
      textFile('public/late/new.txt', 'patch content'),
    ]);
  } catch (error) {
    failure = error;
  } finally {
    fs.renameSync = originalRenameSync;
  }

  assert.ok(failure, 'A regular file created after preflight should reject the patch');
  assert.strictEqual(failure.code, 'PATCH_TARGET_CHANGED');
  assert.strictEqual(failure.patchRolledBack, true);
  assert.strictEqual(fs.readFileSync(path.join(appRoot, 'server.js'), 'utf8'), 'old server');
  assert.strictEqual(fs.readFileSync(lateTarget, 'utf8'), 'concurrent local change');
});

withWorkspace(({ appRoot, applier }) => {
  const originalRenameSync = fs.renameSync;
  let failure;
  fs.renameSync = (source, target) => {
    if (source.endsWith('.mineradio-patch') && target.endsWith(path.join('public', 'blocked.txt'))) {
      const error = new Error('simulated write failure after directory creation');
      error.code = 'EACCES';
      throw error;
    }
    return originalRenameSync(source, target);
  };
  try {
    applier.applyFiles('patch-directory-rollback', [
      textFile('public/generated/deep/new.txt', 'temporary resource'),
      textFile('public/blocked.txt', 'cannot finish this write'),
    ]);
  } catch (error) {
    failure = error;
  } finally {
    fs.renameSync = originalRenameSync;
  }

  assert.ok(failure, 'Filesystem failure should reject a patch that created directories');
  assert.strictEqual(failure.patchRolledBack, true);
  assert.strictEqual(fs.existsSync(path.join(appRoot, 'public', 'generated')), false);
});

withWorkspace(({ appRoot, applier }) => {
  const originalRenameSync = fs.renameSync;
  const preservedFile = path.join(appRoot, 'public', 'generated', 'preserved.txt');
  let failure;
  fs.renameSync = (source, target) => {
    if (source.endsWith('.mineradio-patch') && target.endsWith(path.join('public', 'blocked.txt'))) {
      fs.writeFileSync(preservedFile, 'unrelated content');
      const error = new Error('simulated failure with a non-empty created directory');
      error.code = 'EACCES';
      throw error;
    }
    return originalRenameSync(source, target);
  };
  try {
    applier.applyFiles('patch-non-empty-directory-rollback', [
      textFile('public/generated/deep/new.txt', 'temporary resource'),
      textFile('public/blocked.txt', 'cannot finish this write'),
    ]);
  } catch (error) {
    failure = error;
  } finally {
    fs.renameSync = originalRenameSync;
  }

  assert.ok(failure, 'Filesystem failure should still reject the patch');
  assert.notStrictEqual(failure.code, 'PATCH_ROLLBACK_FAILED');
  assert.strictEqual(fs.readFileSync(preservedFile, 'utf8'), 'unrelated content');
  assert.strictEqual(fs.existsSync(path.join(appRoot, 'public', 'generated', 'deep')), false);
});

withWorkspace(({ appRoot, applier }) => {
  const originalRenameSync = fs.renameSync;
  const originalRmdirSync = fs.rmdirSync;
  let failure;
  fs.renameSync = (source, target) => {
    if (source.endsWith('.mineradio-patch') && target.endsWith(path.join('public', 'blocked.txt'))) {
      const error = new Error('simulated write failure before directory rollback');
      error.code = 'EACCES';
      throw error;
    }
    return originalRenameSync(source, target);
  };
  fs.rmdirSync = target => {
    if (target.endsWith(path.join('public', 'generated'))) {
      const error = new Error('simulated directory rollback failure');
      error.code = 'EACCES';
      throw error;
    }
    return originalRmdirSync(target);
  };
  try {
    applier.applyFiles('patch-directory-rollback-failed', [
      textFile('public/generated/deep/new.txt', 'temporary resource'),
      textFile('public/blocked.txt', 'cannot finish this write'),
    ]);
  } catch (error) {
    failure = error;
  } finally {
    fs.renameSync = originalRenameSync;
    fs.rmdirSync = originalRmdirSync;
  }

  assert.ok(failure, 'Directory cleanup failure should reject the rollback');
  assert.strictEqual(failure.code, 'PATCH_ROLLBACK_FAILED');
  assert.strictEqual(fs.existsSync(path.join(appRoot, 'public', 'generated')), true);
});

withWorkspace(({ appRoot, applier }) => {
  assert.throws(() => applier.prepareFiles([{ path: '../server.js', content: 'bad' }]), errorCode('INVALID_PATCH_FILE_PATH'));
  assert.throws(() => applier.prepareFiles([{ path: '/public/file.txt', content: 'bad' }]), errorCode('INVALID_PATCH_FILE_PATH'));
  assert.throws(() => applier.prepareFiles([{ path: 'public/file.txt ', content: 'bad' }]), errorCode('INVALID_PATCH_FILE_PATH'));
  fs.mkdirSync(path.join(appRoot, 'public', 'directory-target'));
  assert.throws(() => applier.prepareFiles([{ path: 'public/directory-target', content: 'bad' }]), errorCode('INVALID_PATCH_FILE_PATH'));
  assert.throws(() => applier.prepareFiles([{ path: 'public/tool.exe', content: 'bad' }]), errorCode('INVALID_PATCH_FILE_PATH'));
  assert.throws(() => applier.prepareFiles([{ path: 'public/file.txt.mineradio-patch', content: 'bad' }]), errorCode('INVALID_PATCH_FILE_PATH'));
  assert.throws(() => applier.prepareFiles([{ path: 'public/file.txt.mineradio-restore', content: 'bad' }]), errorCode('INVALID_PATCH_FILE_PATH'));
  assert.throws(() => applier.prepareFiles([{ path: 'public/CON.txt', content: 'bad' }]), errorCode('INVALID_PATCH_FILE_PATH'));
  assert.throws(() => applier.prepareFiles([{ path: 'public/trailing. ', content: 'bad' }]), errorCode('INVALID_PATCH_FILE_PATH'));
  assert.throws(() => applier.prepareFiles([
    textFile('public/Case.txt', 'first'),
    textFile('public/case.txt', 'second'),
  ]), errorCode('PATCH_DUPLICATE_FILE'));
  assert.deepStrictEqual(applier.prepareFiles([{ path: 'public/empty.bin', contentBase64: '' }])[0].content, Buffer.alloc(0));
  assert.throws(() => applier.prepareFiles([{ path: 'public/data.bin', contentBase64: 'not-base64' }]), errorCode('INVALID_PATCH_FILE_CONTENT'));
  assert.throws(() => applier.prepareFiles([{ path: 'public/data.txt', content: 'bad', encoding: 'latin1' }]), errorCode('INVALID_PATCH_FILE_ENCODING'));
});

const packageJson = require('../package.json');
assert.ok(packageJson.build.files.includes('update-patch.js'), 'Packaged app must include update-patch.js');
assert.match(packageJson.scripts.check, /scripts\/test-update-patch\.js/, 'npm run check must include patch transaction tests');
const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
assert.match(serverSource, /PATCH_ALLOWED_FILES = new Set\(\[[^\]]*'update-patch\.js'/, 'Quick patches must be able to update update-patch.js');

console.log('[update-patch-test] Preflight, real-path confinement, rollback cleanup and packaging guards passed.');
