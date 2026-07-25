'use strict';

const fs = require('fs');
const path = require('path');

const QISHUI_CLIENT_NAME_PATTERN = /(?:soda[\s._-]*music|qishui|qi[\s._-]*shui|luna(?:[\s._-]*(?:music|pc))?|汽水)/i;
const QISHUI_KNOWN_DATA_DIR_NAMES = [
  'SodaMusic',
  'Soda Music',
  'QishuiMusic',
  'Qishui Music',
  'Qishui',
  'LunaMusic',
  'Luna Music',
  'LunaPC',
  'luna_pc',
  'com.bytedance.sodamusic',
  'com.bytedance.luna',
  'com.luna.music',
];
const QISHUI_VENDOR_DIR_NAMES = [
  'ByteDance',
  'Bytedance',
  'Douyin',
];
const QISHUI_COOKIE_SCAN_SKIP_DIRS = new Set([
  'cache',
  'code cache',
  'gpucache',
  'shadercache',
  'grshadercache',
  'dawncache',
  'dawngraphitecache',
  'dawnwebgpucache',
  'media cache',
  'blob_storage',
  'crashpad',
  'logs',
  'log',
  'temp',
  'tmp',
  'service worker',
  'indexeddb',
  'local storage',
  'session storage',
  'webstorage',
  'video decode stats',
]);

function qishuiPathKey(value) {
  return path.resolve(String(value || '.')).replace(/[\\/]+$/, '').toLowerCase();
}

function safeDirectoryEntries(dirPath, fsImpl = fs) {
  try {
    return fsImpl.readdirSync(dirPath, { withFileTypes: true });
  } catch (_) {
    return [];
  }
}

function qishuiPathExists(value, fsImpl = fs) {
  try {
    return fsImpl.existsSync(value);
  } catch (_) {
    return false;
  }
}

function resolveQishuiCandidatePath(value, homePath) {
  const raw = String(value || '').trim().replace(/^(["'])(.*)\1$/, '$2');
  if (!raw) return '';
  const expanded = raw.replace(/^~(?=\\|\/|$)/, String(homePath || ''));
  return path.resolve(expanded);
}

function qishuiRootHint(fullPath, appDataPath, localAppDataPath, kind) {
  const resolved = path.resolve(fullPath);
  const bases = [
    ['Roaming', appDataPath],
    ['Local', localAppDataPath],
  ];
  for (const [label, base] of bases) {
    if (!base) continue;
    const relative = path.relative(path.resolve(base), resolved);
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
      return `${label}/${relative.replace(/\\/g, '/')}`;
    }
    if (!relative) return label;
  }
  const leaf = path.basename(resolved) || 'custom';
  return `${kind === 'explicit' ? 'Explicit' : 'Detected'}/${leaf}`;
}

function discoverQishuiClientDataRoots(options = {}) {
  const fsImpl = options.fsImpl || fs;
  const appDataPath = resolveQishuiCandidatePath(options.appDataPath, options.homePath);
  const localAppDataPath = resolveQishuiCandidatePath(options.localAppDataPath, options.homePath);
  const homePath = resolveQishuiCandidatePath(options.homePath || process.env.USERPROFILE || process.env.HOME || '.', '');
  const explicitDirs = Array.isArray(options.explicitDirs) ? options.explicitDirs : [];
  const candidates = [];
  const seen = new Map();

  const add = (value, kind, extra = {}) => {
    const resolved = resolveQishuiCandidatePath(value, homePath);
    if (!resolved) return;
    const key = qishuiPathKey(resolved);
    const exists = qishuiPathExists(resolved, fsImpl);
    const next = {
      path: resolved,
      kind: String(kind || 'detected'),
      hint: qishuiRootHint(resolved, appDataPath, localAppDataPath, kind),
      explicit: kind === 'explicit',
      exists,
      ...extra,
    };
    if (seen.has(key)) {
      const index = seen.get(key);
      const previous = candidates[index];
      if ((!previous.exists && exists) || (!previous.explicit && next.explicit)) {
        candidates[index] = Object.assign({}, previous, next, {
          explicit: previous.explicit || next.explicit,
        });
      }
      return;
    }
    seen.set(key, candidates.length);
    candidates.push(next);
  };

  explicitDirs.forEach(value => add(value, 'explicit'));

  const addKnownAndDetected = (basePath, baseKind) => {
    if (!basePath) return;
    QISHUI_KNOWN_DATA_DIR_NAMES.forEach(name => add(path.join(basePath, name), `${baseKind}-known`));
    safeDirectoryEntries(basePath, fsImpl).forEach(entry => {
      if (!entry || !entry.isDirectory() || entry.isSymbolicLink()) return;
      if (QISHUI_CLIENT_NAME_PATTERN.test(entry.name)) add(path.join(basePath, entry.name), `${baseKind}-detected`);
    });

    QISHUI_VENDOR_DIR_NAMES.forEach(vendorName => {
      const vendorPath = path.join(basePath, vendorName);
      safeDirectoryEntries(vendorPath, fsImpl).forEach(entry => {
        if (!entry || !entry.isDirectory() || entry.isSymbolicLink()) return;
        if (QISHUI_CLIENT_NAME_PATTERN.test(entry.name)) {
          add(path.join(vendorPath, entry.name), `${baseKind}-vendor`);
        }
      });
    });
  };

  addKnownAndDetected(appDataPath, 'roaming');
  addKnownAndDetected(localAppDataPath, 'local');

  if (localAppDataPath) {
    const packagesPath = path.join(localAppDataPath, 'Packages');
    safeDirectoryEntries(packagesPath, fsImpl).forEach(entry => {
      if (!entry || !entry.isDirectory() || entry.isSymbolicLink()) return;
      if (QISHUI_CLIENT_NAME_PATTERN.test(entry.name)) {
        add(path.join(packagesPath, entry.name), 'windows-package');
      }
    });
  }

  return candidates;
}

function qishuiCookieStoreSessionPath(databasePath) {
  const parent = path.dirname(databasePath);
  return path.basename(parent).toLowerCase() === 'network'
    ? path.dirname(parent)
    : parent;
}

function qishuiCookieStoreLayout(relativePath) {
  const normalized = String(relativePath || '').replace(/\\/g, '/');
  if (/^(?:\.\/)?Network\/Cookies$/i.test(normalized)) return 'electron-root';
  if (/(?:^|\/)Partitions\/[^/]+\/Network\/Cookies$/i.test(normalized)) return 'electron-partition';
  if (/(?:^|\/)Default\/Network\/Cookies$/i.test(normalized)) return 'chromium-default';
  if (/(?:^|\/)Profile [^/]+\/Network\/Cookies$/i.test(normalized)) return 'chromium-profile';
  if (/(?:^|\/)User Data\/Network\/Cookies$/i.test(normalized)) return 'nested-user-data';
  if (/(?:^|\/)Cookies$/i.test(normalized) && !/Network\/Cookies$/i.test(normalized)) return 'legacy-cookie-store';
  return 'nested-cookie-store';
}

function discoverQishuiCookieStores(rootCandidate, options = {}) {
  const fsImpl = options.fsImpl || fs;
  const maxDepth = Math.max(1, Math.min(12, Number(options.maxDepth) || 7));
  const maxDirectories = Math.max(8, Math.min(4096, Number(options.maxDirectories) || 512));
  const maxStores = Math.max(1, Math.min(128, Number(options.maxStores) || 32));
  const root = typeof rootCandidate === 'string'
    ? { path: path.resolve(rootCandidate), kind: 'detected', hint: `Detected/${path.basename(rootCandidate)}` }
    : Object.assign({}, rootCandidate || {});
  root.path = path.resolve(String(root.path || '.'));
  const result = {
    stores: [],
    rootExists: false,
    scannedDirectories: 0,
    truncated: false,
    errorCode: '',
  };

  let rootStat;
  try {
    rootStat = fsImpl.statSync(root.path);
    result.rootExists = true;
  } catch (error) {
    result.errorCode = qishuiDiscoveryErrorCode(error);
    return result;
  }

  const addStore = (databasePath, depth) => {
    if (result.stores.length >= maxStores) {
      result.truncated = true;
      return;
    }
    let stat = null;
    try {
      stat = fsImpl.statSync(databasePath);
      if (!stat.isFile()) return;
    } catch (_) {
      return;
    }
    const key = qishuiPathKey(databasePath);
    if (result.stores.some(store => qishuiPathKey(store.cookieDbPath) === key)) return;
    const relativePath = rootStat.isFile()
      ? path.basename(databasePath)
      : (path.relative(root.path, databasePath) || path.basename(databasePath));
    result.stores.push({
      cookieDbPath: path.resolve(databasePath),
      sessionPath: qishuiCookieStoreSessionPath(databasePath),
      rootPath: root.path,
      rootKind: String(root.kind || 'detected'),
      rootHint: String(root.hint || `Detected/${path.basename(root.path)}`),
      relativePath: relativePath.replace(/\\/g, '/'),
      layout: qishuiCookieStoreLayout(relativePath),
      depth,
      mtimeMs: Number(stat.mtimeMs || 0),
    });
  };

  if (rootStat.isFile()) {
    if (path.basename(root.path).toLowerCase() === 'cookies') addStore(root.path, 0);
    return result;
  }
  if (!rootStat.isDirectory()) return result;

  const queue = [{ dirPath: root.path, depth: 0 }];
  const visited = new Set();
  while (queue.length && result.scannedDirectories < maxDirectories && result.stores.length < maxStores) {
    const current = queue.shift();
    const currentKey = qishuiPathKey(current.dirPath);
    if (visited.has(currentKey)) continue;
    visited.add(currentKey);
    result.scannedDirectories += 1;

    for (const entry of safeDirectoryEntries(current.dirPath, fsImpl)) {
      if (!entry || entry.isSymbolicLink()) continue;
      const entryPath = path.join(current.dirPath, entry.name);
      if (entry.isFile() && entry.name.toLowerCase() === 'cookies') {
        addStore(entryPath, current.depth);
        continue;
      }
      if (!entry.isDirectory() || current.depth >= maxDepth) continue;
      if (QISHUI_COOKIE_SCAN_SKIP_DIRS.has(entry.name.toLowerCase())) continue;
      queue.push({ dirPath: entryPath, depth: current.depth + 1 });
    }
  }

  if (queue.length || result.stores.length >= maxStores) result.truncated = true;
  result.stores.sort((left, right) =>
    (right.mtimeMs - left.mtimeMs) ||
    (left.depth - right.depth) ||
    left.relativePath.localeCompare(right.relativePath)
  );
  return result;
}

function qishuiDiscoveryErrorCode(error) {
  const code = String(error && error.code || '').trim().toUpperCase();
  if (code === 'ENOENT') return 'not-found';
  if (code === 'EACCES' || code === 'EPERM') return 'access-denied';
  if (code === 'EBUSY' || code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED') return 'locked';
  if (code) return code.toLowerCase();
  const message = String(error && error.message || error || '');
  if (/used by another process|locked|busy|另一个程序正在使用|进程无法访问/i.test(message)) return 'locked';
  if (/access.*denied|permission|无法访问|拒绝访问/i.test(message)) return 'access-denied';
  return message ? 'read-error' : '';
}

module.exports = {
  QISHUI_CLIENT_NAME_PATTERN,
  QISHUI_KNOWN_DATA_DIR_NAMES,
  discoverQishuiClientDataRoots,
  discoverQishuiCookieStores,
  qishuiCookieStoreSessionPath,
  qishuiCookieStoreLayout,
  qishuiDiscoveryErrorCode,
};
