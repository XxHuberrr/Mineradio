'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const {
  discoverQishuiClientDataRoots,
  discoverQishuiCookieStores,
  qishuiCookieStoreLayout,
  qishuiCookieStoreSessionPath,
  qishuiDiscoveryErrorCode,
} = require('../desktop/qishui-local-session-discovery');

function touch(filePath, value = '') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
}

function normalized(value) {
  return path.resolve(value).toLowerCase();
}

function namedFunctionSource(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start < 0) return '';
  const bodyStart = source.indexOf('{', start + marker.length);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return '';
}

function run() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-qishui-local-'));
  try {
    const roaming = path.join(root, 'AppData', 'Roaming');
    const local = path.join(root, 'AppData', 'Local');
    const sodaRoot = path.join(roaming, 'SodaMusic');
    const lunaRoot = path.join(roaming, 'luna_pc');
    const packageRoot = path.join(local, 'Packages', 'ByteDance.SodaMusic_123abc');
    const portableRoot = path.join(root, 'Portable', 'Soda Music', 'User Data');
    const unrelatedRoot = path.join(roaming, 'UnrelatedPlayer');

    const sodaCookieDb = path.join(sodaRoot, 'Network', 'Cookies');
    const partitionCookieDb = path.join(lunaRoot, 'Partitions', 'account-a', 'Network', 'Cookies');
    const packageCookieDb = path.join(packageRoot, 'LocalCache', 'Roaming', 'SodaMusic', 'Default', 'Network', 'Cookies');
    const portableCookieDb = path.join(portableRoot, 'Profile 2', 'Network', 'Cookies');
    const cacheDecoy = path.join(sodaRoot, 'Cache', 'archived', 'Network', 'Cookies');
    const unrelatedCookieDb = path.join(unrelatedRoot, 'Network', 'Cookies');
    [sodaCookieDb, partitionCookieDb, packageCookieDb, portableCookieDb, cacheDecoy, unrelatedCookieDb]
      .forEach(file => touch(file, 'SQLite format 3\0'));

    const roots = discoverQishuiClientDataRoots({
      appDataPath: roaming,
      localAppDataPath: local,
      homePath: root,
      explicitDirs: [portableRoot],
    });
    const rootPaths = new Set(roots.map(item => normalized(item.path)));
    assert(rootPaths.has(normalized(sodaRoot)), 'Roaming SodaMusic data must be discovered');
    assert(rootPaths.has(normalized(lunaRoot)), 'legacy luna_pc data must be discovered');
    assert(rootPaths.has(normalized(packageRoot)), 'Microsoft Store/package data must be discovered');
    assert(rootPaths.has(normalized(portableRoot)), 'explicit portable data must remain supported');
    assert(!rootPaths.has(normalized(unrelatedRoot)), 'unrelated AppData applications must not be scanned');

    const allStores = roots.flatMap(candidate => discoverQishuiCookieStores(candidate).stores);
    const storePaths = new Set(allStores.map(store => normalized(store.cookieDbPath)));
    assert(storePaths.has(normalized(sodaCookieDb)), 'root Network/Cookies must be found');
    assert(storePaths.has(normalized(partitionCookieDb)), 'partition Network/Cookies must be found');
    assert(storePaths.has(normalized(packageCookieDb)), 'packaged Default/Network/Cookies must be found');
    assert(storePaths.has(normalized(portableCookieDb)), 'Profile */Network/Cookies must be found');
    assert(!storePaths.has(normalized(cacheDecoy)), 'cache directories must stay outside the credential scan');
    assert(!storePaths.has(normalized(unrelatedCookieDb)), 'unrelated application cookies must stay outside the scan');

    assert.strictEqual(qishuiCookieStoreLayout('Network/Cookies'), 'electron-root');
    assert.strictEqual(qishuiCookieStoreLayout('Partitions/account-a/Network/Cookies'), 'electron-partition');
    assert.strictEqual(qishuiCookieStoreLayout('Default/Network/Cookies'), 'chromium-default');
    assert.strictEqual(qishuiCookieStoreLayout('Profile 2/Network/Cookies'), 'chromium-profile');
    assert.strictEqual(qishuiCookieStoreSessionPath(sodaCookieDb), sodaRoot);
    assert.strictEqual(qishuiCookieStoreSessionPath(partitionCookieDb), path.dirname(path.dirname(partitionCookieDb)));
    assert.strictEqual(qishuiDiscoveryErrorCode(Object.assign(new Error('busy'), { code: 'EBUSY' })), 'locked');
    assert.strictEqual(qishuiDiscoveryErrorCode(Object.assign(new Error('denied'), { code: 'EACCES' })), 'access-denied');

    const exactFileRoots = discoverQishuiClientDataRoots({
      appDataPath: roaming,
      localAppDataPath: local,
      homePath: root,
      explicitDirs: [portableCookieDb],
    });
    const exactFile = exactFileRoots.find(item => normalized(item.path) === normalized(portableCookieDb));
    assert(exactFile, 'an explicit Cookies database path must be accepted');
    const exactScan = discoverQishuiCookieStores(exactFile);
    assert.strictEqual(exactScan.stores.length, 1);
    assert.strictEqual(normalized(exactScan.stores[0].cookieDbPath), normalized(portableCookieDb));

    const main = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'main.js'), 'utf8');
    assert(main.includes('discoverQishuiClientDataRoots'));
    assert(main.includes('discoverQishuiCookieStores'));
    assert(main.includes('localSessionDiagnostics: imported.diagnostics || null'));
    assert(main.includes("mode: 'sodamusic-local-session'"));
    assert(main.includes("console.log('[QishuiLocalSession]', JSON.stringify(diagnostics))"));

    const migrationListStart = main.indexOf('const APP_OWNED_MIGRATION_FILES');
    const migrationListEnd = main.indexOf('];', migrationListStart);
    const migrationList = main.slice(migrationListStart, migrationListEnd);
    assert(migrationList.includes("'.kugou-cookie'"), 'the real Kugou login cookie must still migrate');
    assert(!migrationList.includes("'.kugou-vip-evidence.json'"), 'deprecated playback evidence must never migrate');
    assert(main.includes('function removeDeprecatedKugouVipEvidenceFiles()'));
    assert(main.includes("{ label: 'stable-user-data', file: path.join(STABLE_USER_DATA_PATH, fileName) }"));
    assert(main.includes("{ label: 'legacy-resource-dir', file: path.join(__dirname, '..', fileName) }"));
    assert(main.indexOf('removeDeprecatedKugouVipEvidenceFiles();') < main.indexOf('migrateMisplacedAppOwnedFiles();'));
    assert(!main.includes('process.env.KUGOU_VIP_EVIDENCE_FILE ='));

    const stableUserData = path.join(root, 'Mineradio-userData');
    const legacyDesktopDir = path.join(root, 'legacy-app', 'desktop');
    const legacyResourceDir = path.dirname(legacyDesktopDir);
    [stableUserData, legacyResourceDir].forEach(dir => {
      touch(path.join(dir, '.kugou-vip-evidence.json'), '{"legacy":true}');
      touch(path.join(dir, '.kugou-cookie'), 'keep-real-login-cookie');
    });
    const cleanupSource = namedFunctionSource(main, 'removeDeprecatedKugouVipEvidenceFiles');
    assert(cleanupSource, 'deprecated evidence cleanup function must be extractable');
    const cleanupSandbox = {
      fs,
      path,
      STABLE_USER_DATA_PATH: stableUserData,
      __dirname: legacyDesktopDir,
      console: { log() {}, warn() {} },
    };
    vm.runInNewContext(`${cleanupSource}\nthis.cleanup = removeDeprecatedKugouVipEvidenceFiles;`, cleanupSandbox);
    cleanupSandbox.cleanup();
    [stableUserData, legacyResourceDir].forEach(dir => {
      assert.strictEqual(fs.existsSync(path.join(dir, '.kugou-vip-evidence.json')), false);
      assert.strictEqual(fs.readFileSync(path.join(dir, '.kugou-cookie'), 'utf8'), 'keep-real-login-cookie');
    });

    console.log('[OK] Packaged SodaMusic session discovery and deprecated Kugou evidence cleanup verified.');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

run();
