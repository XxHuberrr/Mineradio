const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CustomSourceStore } = require('../../desktop/custom-source/store');

test('initializes an empty index file on construction', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-source-'));
  new CustomSourceStore(root);
  const indexFile = path.join(root, 'sources.json');
  assert.equal(fs.existsSync(indexFile), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(indexFile, 'utf8')), { activeId: '', items: [] });
});

test('propagates non-ENOENT index read errors without overwriting the index', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-source-'));
  const indexFile = path.join(root, 'sources.json');
  const original = JSON.stringify({ activeId: '', items: [] });
  fs.writeFileSync(indexFile, original, 'utf8');
  const originalReadFileSync = fs.readFileSync;

  try {
    fs.readFileSync = function readFileSync(file, options) {
      if (String(file) === indexFile) {
        const error = new Error('access denied');
        error.code = 'EACCES';
        throw error;
      }
      return originalReadFileSync.apply(this, arguments);
    };

    assert.throws(() => new CustomSourceStore(root), /access denied/);
  } finally {
    fs.readFileSync = originalReadFileSync;
  }

  assert.equal(fs.readFileSync(indexFile, 'utf8'), original);
});

test('backs up invalid index before initializing defaults', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-source-'));
  const invalid = '{not json';
  fs.writeFileSync(path.join(root, 'sources.json'), invalid, 'utf8');
  const store = new CustomSourceStore(root);
  assert.deepEqual(store.list(), []);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'sources.json'), 'utf8')), { activeId: '', items: [] });
  const backups = fs.readdirSync(root).filter(name => name.startsWith('sources.json.corrupt'));
  assert.equal(backups.length, 1);
  assert.equal(fs.readFileSync(path.join(root, backups[0]), 'utf8'), invalid);
});

test('backs up schema-invalid index before initializing defaults', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-source-'));
  const invalid = JSON.stringify({ activeId: { bad: true }, items: [1] });
  fs.writeFileSync(path.join(root, 'sources.json'), invalid, 'utf8');
  const store = new CustomSourceStore(root);
  assert.deepEqual(store.list(), []);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'sources.json'), 'utf8')), { activeId: '', items: [] });
  const backups = fs.readdirSync(root).filter(name => name.startsWith('sources.json.corrupt'));
  assert.equal(backups.length, 1);
  assert.equal(fs.readFileSync(path.join(root, backups[0]), 'utf8'), invalid);
});

test('backs up and resets an index whose only invalid field is activeId', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-source-'));
  const invalid = JSON.stringify({ activeId: { bad: true }, items: [] });
  fs.writeFileSync(path.join(root, 'sources.json'), invalid, 'utf8');

  const store = new CustomSourceStore(root);

  assert.deepEqual(store.list(), []);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'sources.json'), 'utf8')), { activeId: '', items: [] });
  const backups = fs.readdirSync(root).filter(name => name.startsWith('sources.json.corrupt'));
  assert.equal(backups.length, 1);
  assert.equal(fs.readFileSync(path.join(root, backups[0]), 'utf8'), invalid);
});

test('keeps status sources isolated from caller and returned copies', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-source-'));
  const store = new CustomSourceStore(root);
  const first = store.importScript('a.js', '/**\n * @name A\n */\nvoid 0');
  const sources = { platforms: { tx: true }, list: ['a'] };
  store.setStatus(first.id, 'ready', '', sources);

  sources.platforms.tx = false;
  sources.list.push('b');
  assert.deepEqual(store.get(first.id).sources, { platforms: { tx: true }, list: ['a'] });

  const fromGet = store.get(first.id);
  fromGet.sources.platforms.tx = false;
  fromGet.sources.list.push('b');
  assert.deepEqual(store.get(first.id).sources, { platforms: { tx: true }, list: ['a'] });

  const fromList = store.list()[0];
  fromList.sources.platforms.tx = false;
  fromList.sources.list.push('b');
  assert.deepEqual(store.get(first.id).sources, { platforms: { tx: true }, list: ['a'] });
});

test('setActive rolls back its in-memory mutation when saving fails', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-source-'));
  const store = new CustomSourceStore(root);
  const first = store.importScript('a.js', '/**\n * @name A\n */\nvoid 0');
  const indexFile = path.join(root, 'sources.json');
  const originalRenameSync = fs.renameSync;

  try {
    fs.renameSync = function renameSync(from, to) {
      if (String(to) === indexFile) throw new Error('save failed');
      return originalRenameSync.apply(this, arguments);
    };
    assert.throws(() => store.setActive(first.id), /save failed/);
  } finally {
    fs.renameSync = originalRenameSync;
  }

  assert.equal(store.getActive(), null);
});

test('setStatus rolls back its in-memory mutation when saving fails', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-source-'));
  const store = new CustomSourceStore(root);
  const first = store.importScript('a.js', '/**\n * @name A\n */\nvoid 0');
  const before = store.get(first.id);
  const indexFile = path.join(root, 'sources.json');
  const originalRenameSync = fs.renameSync;

  try {
    fs.renameSync = function renameSync(from, to) {
      if (String(to) === indexFile) throw new Error('save failed');
      return originalRenameSync.apply(this, arguments);
    };
    assert.throws(() => store.setStatus(first.id, 'ready', 'changed', { tx: true }), /save failed/);
  } finally {
    fs.renameSync = originalRenameSync;
  }

  assert.deepEqual(store.get(first.id), before);
});

test('setAllowUpdateAlert rolls back its in-memory mutation when saving fails', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-source-'));
  const store = new CustomSourceStore(root);
  const first = store.importScript('a.js', '/**\n * @name A\n */\nvoid 0');
  const indexFile = path.join(root, 'sources.json');
  const originalRenameSync = fs.renameSync;

  try {
    fs.renameSync = function renameSync(from, to) {
      if (String(to) === indexFile) throw new Error('save failed');
      return originalRenameSync.apply(this, arguments);
    };
    assert.throws(() => store.setAllowUpdateAlert(first.id, false), /save failed/);
  } finally {
    fs.renameSync = originalRenameSync;
  }

  assert.equal(store.get(first.id).allowUpdateAlert, true);
});

test('imports scripts through a temporary file rename', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-source-'));
  const store = new CustomSourceStore(root);
  const script = '/**\n * @name A\n */\nvoid 0';
  const scriptWrites = [];
  const renames = [];
  const originalWriteFileSync = fs.writeFileSync;
  const originalRenameSync = fs.renameSync;

  try {
    fs.writeFileSync = function writeFileSync(file, data, options) {
      if (data === script) scriptWrites.push(path.basename(String(file)));
      return originalWriteFileSync.apply(this, arguments);
    };
    fs.renameSync = function renameSync(from, to) {
      renames.push([path.basename(String(from)), path.basename(String(to))]);
      return originalRenameSync.apply(this, arguments);
    };

    const imported = store.importScript('a.js', script);
    assert.equal(scriptWrites.length, 1);
    assert.notEqual(scriptWrites[0], `${imported.id}.js`);
    assert.equal(renames.some(([from, to]) => from !== `${imported.id}.js` && to === `${imported.id}.js`), true);
  } finally {
    fs.writeFileSync = originalWriteFileSync;
    fs.renameSync = originalRenameSync;
  }
});

test('replaceScript stages the replacement at the exact .js.next path', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-source-'));
  const store = new CustomSourceStore(root);
  const first = store.importScript('a.js', '/**\n * @name A\n * @version 1\n */\nvoid 0');
  const replacement = '/**\n * @name A\n * @version 2\n */\nvoid 0';
  const scriptWrites = [];
  const renames = [];
  const originalWriteFileSync = fs.writeFileSync;
  const originalRenameSync = fs.renameSync;

  try {
    fs.writeFileSync = function writeFileSync(file, data, options) {
      if (data === replacement) scriptWrites.push(path.basename(String(file)));
      return originalWriteFileSync.apply(this, arguments);
    };
    fs.renameSync = function renameSync(from, to) {
      renames.push([path.basename(String(from)), path.basename(String(to))]);
      return originalRenameSync.apply(this, arguments);
    };

    store.replaceScript(first.id, replacement);

    assert.deepEqual(scriptWrites, [`${first.id}.js.next`]);
    assert.equal(renames.some(([from, to]) => from === `${first.id}.js.next` && to === `${first.id}.js`), true);
  } finally {
    fs.writeFileSync = originalWriteFileSync;
    fs.renameSync = originalRenameSync;
  }
});

test('replaceScript restores in-memory metadata and script file when index save fails', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-source-'));
  const store = new CustomSourceStore(root);
  const firstScript = '/**\n * @name A\n * @version 1\n */\nvoid 0';
  const secondScript = '/**\n * @name A\n * @version 2\n */\nvoid 0';
  const first = store.importScript('a.js', firstScript);
  const originalRenameSync = fs.renameSync;

  try {
    fs.renameSync = function renameSync(from, to) {
      if (String(to) === path.join(root, 'sources.json')) throw new Error('save failed');
      return originalRenameSync.apply(this, arguments);
    };
    assert.throws(() => store.replaceScript(first.id, secondScript), /save failed/);
  } finally {
    fs.renameSync = originalRenameSync;
  }

  assert.equal(store.get(first.id).version, '1');
  assert.equal(store.getScript(first.id), firstScript);
});

test('replaceScript restores the old script by rename when writes keep failing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-source-'));
  const store = new CustomSourceStore(root);
  const firstScript = '/**\n * @name A\n * @version 1\n */\nvoid 0';
  const secondScript = '/**\n * @name A\n * @version 2\n */\nvoid 0';
  const first = store.importScript('a.js', firstScript);
  const originalWriteFileSync = fs.writeFileSync;
  let writes = 0;

  try {
    fs.writeFileSync = function writeFileSync(file, data, options) {
      writes += 1;
      if (writes > 1) {
        const error = new Error('disk full');
        error.code = 'ENOSPC';
        throw error;
      }
      assert.equal(path.basename(String(file)), `${first.id}.js.next`);
      return originalWriteFileSync.apply(this, arguments);
    };

    assert.throws(() => store.replaceScript(first.id, secondScript), /disk full/);
  } finally {
    fs.writeFileSync = originalWriteFileSync;
  }

  assert.equal(writes, 2);
  assert.equal(store.get(first.id).version, '1');
  assert.equal(store.getScript(first.id), firstScript);
});

test('replaceScript succeeds when committed backup cleanup gets EPERM', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-source-'));
  const store = new CustomSourceStore(root);
  const firstScript = '/**\n * @name A\n * @version 1\n */\nvoid 0';
  const secondScript = '/**\n * @name A\n * @version 2\n */\nvoid 0';
  const first = store.importScript('a.js', firstScript);
  const previousPath = path.join(root, 'scripts', `${first.id}.js.previous`);
  const originalRmSync = fs.rmSync;
  let result;

  try {
    fs.rmSync = function rmSync(file, options) {
      if (String(file) === previousPath && fs.existsSync(previousPath)) {
        const error = new Error('cleanup denied');
        error.code = 'EPERM';
        throw error;
      }
      return originalRmSync.apply(this, arguments);
    };

    assert.doesNotThrow(() => {
      result = store.replaceScript(first.id, secondScript);
    });
  } finally {
    fs.rmSync = originalRmSync;
  }

  assert.equal(result.version, '2');
  assert.equal(store.get(first.id).version, '2');
  assert.equal(store.getScript(first.id), secondScript);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'sources.json'), 'utf8')).items[0].version, '2');
  assert.equal(fs.existsSync(previousPath), true);
});

test('imports, lists, activates, replaces, and removes scripts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-source-'));
  const store = new CustomSourceStore(root);
  const first = store.importScript('/tmp/a.js', '/**\n * @name A\n * @version 1\n */\nvoid 0');
  assert.equal(store.list()[0].name, 'A');
  store.setActive(first.id);
  assert.equal(store.getActive().id, first.id);
  store.replaceScript(first.id, '/**\n * @name A\n * @version 2\n */\nvoid 0');
  assert.equal(store.get(first.id).version, '2');
  store.remove(first.id);
  assert.deepEqual(store.list(), []);
});

test('remove rejects unknown and traversal ids without deleting files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-source-'));
  const store = new CustomSourceStore(root);
  const victim = path.join(root, 'victim.js');
  fs.writeFileSync(victim, 'keep me', 'utf8');

  assert.throws(() => store.remove('../victim'), /SOURCE_NOT_FOUND/);
  assert.equal(fs.readFileSync(victim, 'utf8'), 'keep me');
  assert.throws(() => store.remove('missing'), /SOURCE_NOT_FOUND/);
});

test('remove cannot escape scripts through a traversal id loaded from the index', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-source-'));
  const victim = path.join(root, 'victim.js');
  fs.writeFileSync(victim, 'keep me', 'utf8');
  fs.writeFileSync(
    path.join(root, 'sources.json'),
    JSON.stringify({ activeId: '', items: [{ id: '../victim' }] }),
    'utf8',
  );
  const store = new CustomSourceStore(root);

  assert.throws(() => store.remove('../victim'), /SOURCE_NOT_FOUND/);
  assert.equal(fs.readFileSync(victim, 'utf8'), 'keep me');
});

test('remove restores memory, index, and script when saving the index fails', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-source-'));
  const store = new CustomSourceStore(root);
  const script = '/**\n * @name A\n */\nvoid 0';
  const first = store.importScript('a.js', script);
  store.setActive(first.id);
  const indexFile = path.join(root, 'sources.json');
  const originalIndex = fs.readFileSync(indexFile, 'utf8');
  const originalRenameSync = fs.renameSync;

  try {
    fs.renameSync = function renameSync(from, to) {
      if (String(to) === indexFile) throw new Error('save failed');
      return originalRenameSync.apply(this, arguments);
    };
    assert.throws(() => store.remove(first.id), /save failed/);
  } finally {
    fs.renameSync = originalRenameSync;
  }

  assert.equal(store.get(first.id).id, first.id);
  assert.equal(store.getActive().id, first.id);
  assert.equal(fs.readFileSync(indexFile, 'utf8'), originalIndex);
  assert.equal(store.getScript(first.id), script);
});

test('remove succeeds when committed backup cleanup gets EPERM', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-source-'));
  const store = new CustomSourceStore(root);
  const first = store.importScript('a.js', '/**\n * @name A\n */\nvoid 0');
  store.setActive(first.id);
  const scriptPath = path.join(root, 'scripts', `${first.id}.js`);
  const removePath = `${scriptPath}.remove`;
  const originalRmSync = fs.rmSync;

  try {
    fs.rmSync = function rmSync(file, options) {
      if (String(file) === removePath && fs.existsSync(removePath)) {
        const error = new Error('cleanup denied');
        error.code = 'EPERM';
        throw error;
      }
      return originalRmSync.apply(this, arguments);
    };

    assert.doesNotThrow(() => store.remove(first.id));
  } finally {
    fs.rmSync = originalRmSync;
  }

  assert.equal(store.get(first.id), null);
  assert.equal(store.getActive(), null);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'sources.json'), 'utf8')), { activeId: '', items: [] });
  assert.equal(fs.existsSync(scriptPath), false);
  assert.equal(fs.existsSync(removePath), true);
});

test('rejects identical content', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-source-'));
  const store = new CustomSourceStore(root);
  const script = '/**\n * @name A\n */\nvoid 0';
  store.importScript('a.js', script);
  assert.throws(() => store.importScript('b.js', script), /duplicate/i);
});
