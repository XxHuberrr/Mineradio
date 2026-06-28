# LX Custom Source Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow Mineradio to import and run existing LX Music desktop `.js` custom-source scripts unchanged, using them as the active URL resolver for Mineradio’s existing NetEase and QQ search results.

**Architecture:** Pure protocol, metadata, storage, redaction, and song-adapter modules live under `desktop/custom-source/`. A hidden isolated Electron runtime exposes the LX 2.0.0 `globalThis.lx` bridge and forwards HTTP/crypto operations to the main process. The existing in-process HTTP server receives a resolver callback from `desktop/main.js`; the renderer calls one unified playback resolver and preserves the existing cross-platform fallback path.

**Tech Stack:** Electron 42, CommonJS Node.js, built-in `node:test`, Node HTTP/fetch/crypto/zlib APIs, existing vanilla HTML/CSS/JavaScript frontend.

---

## File Structure

Create:

- `desktop/custom-source/protocol.js` — LX constants, metadata parsing, initialization filtering, quality selection, and response validation.
- `desktop/custom-source/music-info.js` — Mineradio-to-LX platform and `MusicInfo` conversion.
- `desktop/custom-source/redact.js` — recursive secret redaction for logs.
- `desktop/custom-source/store.js` — local script metadata and script-file persistence.
- `desktop/custom-source/runtime.html` — empty hidden runtime document.
- `desktop/custom-source/runtime-preload.js` — isolated `globalThis.lx` bridge and script event dispatch.
- `desktop/custom-source/runtime.js` — hidden `BrowserWindow`, IPC, request cancellation, HTTP and crypto services.
- `desktop/custom-source/manager.js` — active-source lifecycle and playback resolution façade.
- `test/custom-source/protocol.test.js`
- `test/custom-source/music-info.test.js`
- `test/custom-source/redact.test.js`
- `test/custom-source/store.test.js`
- `test/custom-source/runtime.test.js`
- `test/custom-source/manager.test.js`
- `test/custom-source/server-route.test.js`
- `test/custom-source/playback-policy.test.js`
- `test/custom-source/fixtures/basic-source.js`
- `test/custom-source/fixtures/contract-source.js`
- `test/custom-source/fixtures/failing-source.js`
- `test/custom-source/electron-smoke.js`

Modify:

- `package.json` — test scripts and package file coverage.
- `desktop/main.js:1124-1177,1320-1368` — manager lifecycle, import dialogs, IPC handlers, and server resolver injection.
- `desktop/preload.js:3-47` — narrow custom-source management methods and status event.
- `server.js:60-70,3240-3560,4203` — injectable resolver and local `/api/custom-source/resolve` endpoint.
- `public/index.html:135-230,1960-2260,10280-10321,18189-18510,21860-22030` — source manager modal, playback resolver, prefetch path, and status rendering.
- `README.md` — local custom-source usage and trust warning.
- `PRIVACY.md` — script storage and outbound request disclosure.
- `CHANGELOG.md` — user-facing feature entry.

## Task 1: Establish Node Test Harness and LX Protocol Contract

**Files:**

- Create: `desktop/custom-source/protocol.js`
- Create: `test/custom-source/protocol.test.js`
- Modify: `package.json`

- [ ] **Step 1: Add a failing protocol test**

```js
// test/custom-source/protocol.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  LX_API_VERSION,
  parseScriptInfo,
  filterInitPayload,
  selectLxQuality,
  validateActionResponse,
} = require('../../desktop/custom-source/protocol');

test('parses LX metadata with LX length limits', () => {
  const info = parseScriptInfo(`/**
 * @name Test Source
 * @description URL resolver
 * @version 1.2.3
 * @author Mineradio
 * @homepage https://example.com/source
 */`);
  assert.equal(info.name, 'Test Source');
  assert.equal(info.version, '1.2.3');
  assert.equal(LX_API_VERSION, '2.0.0');
});

test('filters source actions and quality values to the LX contract', () => {
  const result = filterInitPayload({
    sources: {
      wy: { name: 'WY', type: 'music', actions: ['musicUrl', 'bad'], qualitys: ['128k', 'flac', 'bad'] },
      local: { name: 'Local', type: 'music', actions: ['musicUrl', 'lyric', 'pic'], qualitys: ['128k'] },
    },
  });
  assert.deepEqual(result.sources.wy.actions, ['musicUrl']);
  assert.deepEqual(result.sources.wy.qualitys, ['128k', 'flac']);
  assert.deepEqual(result.sources.local.actions, ['musicUrl', 'lyric', 'pic']);
  assert.deepEqual(result.sources.local.qualitys, []);
});

test('selects the highest declared LX quality not above the Mineradio target', () => {
  assert.equal(selectLxQuality('hires', ['128k', '320k', 'flac']), 'flac');
  assert.equal(selectLxQuality('standard', ['320k']), null);
});

test('validates URL and lyric responses', () => {
  assert.equal(validateActionResponse('musicUrl', 'https://example.com/a.mp3'), 'https://example.com/a.mp3');
  assert.throws(() => validateActionResponse('musicUrl', 'file:///tmp/a.mp3'), /INVALID_RESPONSE/);
  assert.equal(validateActionResponse('lyric', { lyric: '[00:00.00]a' }).lyric, '[00:00.00]a');
});
```

- [ ] **Step 2: Add the test command and verify failure**

Add to `package.json`:

```json
"scripts": {
  "start": "electron .",
  "test": "node --test",
  "test:custom-source-host": "electron test/custom-source/electron-smoke.js",
  "build:win": "electron-builder --win nsis",
  "build:win:dir": "electron-builder --win dir"
}
```

Run:

```powershell
npm test
```

Expected: FAIL with `Cannot find module '../../desktop/custom-source/protocol'`.

- [ ] **Step 3: Implement the protocol module**

```js
// desktop/custom-source/protocol.js
const LX_API_VERSION = '2.0.0';
const LX_ENV = 'desktop';
const EVENT_NAMES = Object.freeze({ request: 'request', inited: 'inited', updateAlert: 'updateAlert' });
const SOURCE_KEYS = Object.freeze(['kw', 'kg', 'tx', 'wy', 'mg', 'local']);
const QUALITY_KEYS = Object.freeze(['128k', '320k', 'flac', 'flac24bit']);
const ACTIONS = Object.freeze({
  kw: ['musicUrl'], kg: ['musicUrl'], tx: ['musicUrl'],
  wy: ['musicUrl'], mg: ['musicUrl'],
  local: ['musicUrl', 'lyric', 'pic'],
});
const META_LIMITS = Object.freeze({ name: 24, description: 36, author: 56, homepage: 1024, version: 36 });
const TARGET_QUALITY = Object.freeze({
  standard: '128k', exhigh: '320k', lossless: 'flac',
  hires: 'flac24bit', jymaster: 'flac24bit',
});

function parseScriptInfo(script) {
  const header = /^\/\*[\s\S]+?\*\//.exec(String(script || ''));
  if (!header) throw new Error('IMPORT_INVALID: 无效的自定义源文件');
  const values = {};
  for (const line of header[0].split(/\r?\n/)) {
    const match = /^\s?\*\s?@(\w+)\s(.+)$/.exec(line);
    if (match && META_LIMITS[match[1]] != null) values[match[1]] = match[2].trim();
  }
  for (const [key, limit] of Object.entries(META_LIMITS)) {
    values[key] = String(values[key] || '');
    if (values[key].length > limit) values[key] = values[key].slice(0, limit) + '...';
  }
  values.name ||= `user_api_${Date.now()}`;
  return values;
}

function filterInitPayload(payload) {
  if (!payload || typeof payload !== 'object' || !payload.sources) throw new Error('INIT_FAILED: Missing init info');
  const sources = {};
  for (const key of SOURCE_KEYS) {
    const item = payload.sources[key];
    if (!item || item.type !== 'music') continue;
    sources[key] = {
      name: String(item.name || key),
      type: 'music',
      actions: ACTIONS[key].filter(action => Array.isArray(item.actions) && item.actions.includes(action)),
      qualitys: key === 'local' ? [] : QUALITY_KEYS.filter(q => Array.isArray(item.qualitys) && item.qualitys.includes(q)),
    };
  }
  return { openDevTools: payload.openDevTools === true, sources };
}

function selectLxQuality(target, supported) {
  const desired = TARGET_QUALITY[target] || 'flac24bit';
  const max = QUALITY_KEYS.indexOf(desired);
  for (let i = max; i >= 0; i--) if (supported.includes(QUALITY_KEYS[i])) return QUALITY_KEYS[i];
  return null;
}

function validateActionResponse(action, value) {
  if (action === 'musicUrl' || action === 'pic') {
    if (typeof value !== 'string' || value.length > 2048 || !/^https?:/i.test(value)) {
      throw new Error('INVALID_RESPONSE: Expected an HTTP URL');
    }
    return value;
  }
  if (action === 'lyric') {
    if (!value || typeof value !== 'object' || typeof value.lyric !== 'string' || value.lyric.length > 51200) {
      throw new Error('INVALID_RESPONSE: Expected lyric data');
    }
    return {
      lyric: value.lyric,
      tlyric: typeof value.tlyric === 'string' && value.tlyric.length <= 5120 ? value.tlyric : null,
      rlyric: typeof value.rlyric === 'string' && value.rlyric.length <= 5120 ? value.rlyric : null,
      lxlyric: typeof value.lxlyric === 'string' && value.lxlyric.length <= 8192 ? value.lxlyric : null,
    };
  }
  throw new Error(`INVALID_RESPONSE: Unsupported action ${action}`);
}

module.exports = {
  LX_API_VERSION, LX_ENV, EVENT_NAMES, SOURCE_KEYS, QUALITY_KEYS, ACTIONS,
  parseScriptInfo, filterInitPayload, selectLxQuality, validateActionResponse,
};
```

- [ ] **Step 4: Run the protocol tests**

Run:

```powershell
node --test test/custom-source/protocol.test.js
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add package.json desktop/custom-source/protocol.js test/custom-source/protocol.test.js
git commit -m "test: define LX source protocol contract"
```

## Task 2: Implement MusicInfo Mapping and Secret Redaction

**Files:**

- Create: `desktop/custom-source/music-info.js`
- Create: `desktop/custom-source/redact.js`
- Create: `test/custom-source/music-info.test.js`
- Create: `test/custom-source/redact.test.js`

- [ ] **Step 1: Write failing adapter and redaction tests**

```js
// test/custom-source/music-info.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { toLxMusicInfo } = require('../../desktop/custom-source/music-info');

test('maps NetEase tracks to wy MusicInfo', () => {
  const info = toLxMusicInfo({ provider: 'netease', id: 123, name: 'Song', artist: 'Singer', album: 'Album', duration: 195000, cover: 'https://img' });
  assert.equal(info.source, 'wy');
  assert.equal(info.meta.songId, 123);
  assert.equal(info.songmid, 123);
  assert.equal(info.interval, '03:15');
});

test('maps QQ identifiers to tx fields and legacy aliases', () => {
  const info = toLxMusicInfo({
    provider: 'qq', id: 'mid1', qqId: 88, mid: 'mid1', mediaMid: 'media1',
    albumMid: 'album1', name: 'Song', artist: 'Singer', album: 'Album', duration: 200,
  });
  assert.equal(info.source, 'tx');
  assert.equal(info.meta.strMediaMid, 'media1');
  assert.equal(info.meta.albumMid, 'album1');
  assert.equal(info.songmid, 'mid1');
});
```

```js
// test/custom-source/redact.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { redactSecrets } = require('../../desktop/custom-source/redact');

test('redacts nested credentials without mutating input', () => {
  const input = { headers: { Authorization: 'Bearer abc', Cookie: 'a=b', Accept: 'json' }, access_token: 'secret' };
  const output = redactSecrets(input);
  assert.equal(output.headers.Authorization, '[REDACTED]');
  assert.equal(output.headers.Cookie, '[REDACTED]');
  assert.equal(output.headers.Accept, 'json');
  assert.equal(output.access_token, '[REDACTED]');
  assert.equal(input.access_token, 'secret');
});
```

- [ ] **Step 2: Verify failure**

Run:

```powershell
node --test test/custom-source/music-info.test.js test/custom-source/redact.test.js
```

Expected: FAIL because both modules are missing.

- [ ] **Step 3: Implement the adapter**

```js
// desktop/custom-source/music-info.js
function platformKey(song) {
  const provider = String(song?.provider || song?.source || '').toLowerCase();
  if (provider === 'qq' || provider === 'tx') return 'tx';
  if (provider === 'netease' || provider === 'wy') return 'wy';
  return null;
}

function formatInterval(raw) {
  let seconds = Number(raw) || 0;
  if (seconds > 10000) seconds /= 1000;
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function toLxMusicInfo(song) {
  const source = platformKey(song);
  if (!source) throw new Error('SOURCE_UNSUPPORTED: Unknown Mineradio provider');
  const songId = source === 'tx' ? (song.mid || song.songmid || song.id) : song.id;
  if (songId == null || songId === '') throw new Error('SOURCE_UNSUPPORTED: Missing song id');
  const albumId = song.albumMid || song.albumId || '';
  const meta = {
    songId,
    albumName: String(song.album || ''),
    albumId,
    picUrl: song.cover || null,
    qualitys: [],
    _qualitys: {},
  };
  if (source === 'tx') {
    meta.strMediaMid = String(song.mediaMid || song.media_mid || song.strMediaMid || songId);
    meta.id = Number(song.qqId || song.songId || 0) || undefined;
    meta.albumMid = String(song.albumMid || song.album_mid || albumId);
  }
  return {
    id: String(song.id ?? songId),
    name: String(song.name || song.title || ''),
    singer: String(song.artist || ''),
    source,
    interval: formatInterval(song.duration || song.dt || song.interval),
    meta,
    songmid: songId,
    albumId,
    strMediaMid: meta.strMediaMid || '',
    copyrightId: '',
    hash: '',
  };
}

module.exports = { platformKey, formatInterval, toLxMusicInfo };
```

- [ ] **Step 4: Implement recursive redaction**

```js
// desktop/custom-source/redact.js
const SECRET_KEY = /^(cookie|set-cookie|authorization|proxy-authorization)$|token|secret|api[-_]?key/i;

function redactSecrets(value, seen = new WeakSet()) {
  if (Array.isArray(value)) return value.map(item => redactSecrets(item, seen));
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = SECRET_KEY.test(key) ? '[REDACTED]' : redactSecrets(item, seen);
  }
  return out;
}

module.exports = { redactSecrets };
```

- [ ] **Step 5: Run tests and commit**

Run:

```powershell
node --test test/custom-source/music-info.test.js test/custom-source/redact.test.js
```

Expected: 3 tests PASS.

```powershell
git add desktop/custom-source/music-info.js desktop/custom-source/redact.js test/custom-source/music-info.test.js test/custom-source/redact.test.js
git commit -m "feat: map Mineradio tracks to LX source data"
```

## Task 3: Persist Imported Scripts Outside the Repository

**Files:**

- Create: `desktop/custom-source/store.js`
- Create: `test/custom-source/store.test.js`

- [ ] **Step 1: Write failing store tests**

```js
// test/custom-source/store.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CustomSourceStore } = require('../../desktop/custom-source/store');

test('imports, lists, activates, replaces, and removes scripts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-source-'));
  const store = new CustomSourceStore(root);
  const first = store.importScript('/tmp/a.js', '/**\\n * @name A\\n * @version 1\\n */\\nvoid 0');
  assert.equal(store.list()[0].name, 'A');
  store.setActive(first.id);
  assert.equal(store.getActive().id, first.id);
  store.replaceScript(first.id, '/**\\n * @name A\\n * @version 2\\n */\\nvoid 0');
  assert.equal(store.get(first.id).version, '2');
  store.remove(first.id);
  assert.deepEqual(store.list(), []);
});

test('rejects identical content', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-source-'));
  const store = new CustomSourceStore(root);
  const script = '/**\\n * @name A\\n */\\nvoid 0';
  store.importScript('a.js', script);
  assert.throws(() => store.importScript('b.js', script), /duplicate/i);
});
```

- [ ] **Step 2: Verify failure**

Run:

```powershell
node --test test/custom-source/store.test.js
```

Expected: FAIL because `CustomSourceStore` is missing.

- [ ] **Step 3: Implement atomic user-data storage**

Implement `CustomSourceStore` with:

```js
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseScriptInfo } = require('./protocol');

class CustomSourceStore {
  constructor(rootDir) {
    this.rootDir = rootDir;
    this.scriptDir = path.join(rootDir, 'scripts');
    this.indexFile = path.join(rootDir, 'sources.json');
    fs.mkdirSync(this.scriptDir, { recursive: true });
    this.state = this.#readState();
  }

  #readState() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.indexFile, 'utf8'));
      return { activeId: parsed.activeId || '', items: Array.isArray(parsed.items) ? parsed.items : [] };
    } catch {
      return { activeId: '', items: [] };
    }
  }

  #save() {
    const temp = `${this.indexFile}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(this.state, null, 2), 'utf8');
    fs.renameSync(temp, this.indexFile);
  }

  #hash(script) {
    return crypto.createHash('sha256').update(script).digest('hex');
  }

  importScript(originalPath, script) {
    const hash = this.#hash(script);
    if (this.state.items.some(item => item.hash === hash)) throw new Error('IMPORT_INVALID: duplicate script');
    const id = `user_api_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const item = { id, ...parseScriptInfo(script), originalPath: String(originalPath || ''), hash, allowUpdateAlert: true, status: 'idle', message: '' };
    fs.writeFileSync(path.join(this.scriptDir, `${id}.js`), script, 'utf8');
    this.state.items.push(item);
    this.#save();
    return { ...item };
  }

  list() { return this.state.items.map(item => ({ ...item, active: item.id === this.state.activeId })); }
  get(id) { const item = this.state.items.find(value => value.id === id); return item ? { ...item } : null; }
  getScript(id) { return fs.readFileSync(path.join(this.scriptDir, `${id}.js`), 'utf8'); }
  getActive() { return this.get(this.state.activeId); }
  setActive(id) { if (id && !this.get(id)) throw new Error('SOURCE_NOT_FOUND'); this.state.activeId = id || ''; this.#save(); }
  setStatus(id, status, message, sources) {
    const item = this.state.items.find(value => value.id === id);
    if (!item) return;
    Object.assign(item, { status, message: String(message || ''), sources: sources || item.sources || {} });
    this.#save();
  }
  setAllowUpdateAlert(id, enable) {
    const item = this.state.items.find(value => value.id === id);
    if (!item) throw new Error('SOURCE_NOT_FOUND');
    item.allowUpdateAlert = !!enable;
    this.#save();
  }
  replaceScript(id, script) {
    const item = this.state.items.find(value => value.id === id);
    if (!item) throw new Error('SOURCE_NOT_FOUND');
    const info = parseScriptInfo(script);
    const hash = this.#hash(script);
    fs.writeFileSync(path.join(this.scriptDir, `${id}.js.next`), script, 'utf8');
    fs.renameSync(path.join(this.scriptDir, `${id}.js.next`), path.join(this.scriptDir, `${id}.js`));
    Object.assign(item, info, { hash, status: 'idle', message: '' });
    this.#save();
    return { ...item };
  }
  remove(id) {
    this.state.items = this.state.items.filter(item => item.id !== id);
    if (this.state.activeId === id) this.state.activeId = '';
    fs.rmSync(path.join(this.scriptDir, `${id}.js`), { force: true });
    this.#save();
  }
}

module.exports = { CustomSourceStore };
```

- [ ] **Step 4: Run tests and commit**

Run:

```powershell
node --test test/custom-source/store.test.js
```

Expected: 2 tests PASS.

```powershell
git add desktop/custom-source/store.js test/custom-source/store.test.js
git commit -m "feat: persist custom sources in user data"
```

## Task 4: Build the Isolated LX Runtime

**Files:**

- Create: `desktop/custom-source/runtime.html`
- Create: `desktop/custom-source/runtime-preload.js`
- Create: `desktop/custom-source/runtime.js`
- Create: `test/custom-source/runtime.test.js`
- Create: `test/custom-source/fixtures/basic-source.js`
- Create: `test/custom-source/fixtures/failing-source.js`

- [ ] **Step 1: Add runtime fixtures and failing contract tests**

```js
// test/custom-source/fixtures/basic-source.js
/**
 * @name Basic Test Source
 * @version 1.0.0
 */
const { EVENT_NAMES, on, send } = globalThis.lx;
on(EVENT_NAMES.request, ({ action, info }) => {
  if (action !== 'musicUrl') return Promise.reject(new Error('unsupported'));
  return Promise.resolve(`https://audio.example/${info.musicInfo.meta.songId}/${info.type}.mp3`);
});
send(EVENT_NAMES.inited, {
  sources: {
    wy: { name: 'WY', type: 'music', actions: ['musicUrl'], qualitys: ['128k', '320k', 'flac'] },
    tx: { name: 'TX', type: 'music', actions: ['musicUrl'], qualitys: ['128k'] },
  },
});
```

```js
// test/custom-source/fixtures/failing-source.js
/**
 * @name Failing Test Source
 */
throw new Error('fixture init failure');
```

```js
// test/custom-source/runtime.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeRequestOptions, parseHttpBody } = require('../../desktop/custom-source/runtime');

test('normalizes LX request timeout and method', () => {
  const result = normalizeRequestOptions('https://example.com', { method: 'post', timeout: 90000, form: { a: 'b' } });
  assert.equal(result.method, 'POST');
  assert.equal(result.timeout, 60000);
  assert.equal(result.body.toString(), 'a=b');
});

test('parses JSON and preserves text bodies', () => {
  assert.deepEqual(parseHttpBody(Buffer.from('{"ok":true}')), { ok: true });
  assert.equal(parseHttpBody(Buffer.from('plain')), 'plain');
});
```

- [ ] **Step 2: Verify failure**

Run:

```powershell
node --test test/custom-source/runtime.test.js
```

Expected: FAIL because the runtime module is missing.

- [ ] **Step 3: Create the empty runtime document**

```html
<!-- desktop/custom-source/runtime.html -->
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-eval'; connect-src 'none'; img-src 'none'; style-src 'none'">
</head>
<body></body>
</html>
```

- [ ] **Step 4: Implement runtime request helpers**

In `desktop/custom-source/runtime.js`, export and test:

```js
function normalizeRequestOptions(url, options = {}) {
  if (!/^https?:\/\//i.test(url) || String(url).length > 2048) throw new Error('HTTP_FAILED: Invalid URL');
  const timeout = Math.min(Math.max(Number(options.timeout) || 60000, 1), 60000);
  const method = String(options.method || 'GET').toUpperCase();
  const headers = { ...(options.headers || {}) };
  let body = options.body;
  if (options.form) {
    body = new URLSearchParams(options.form);
    headers['content-type'] ||= 'application/x-www-form-urlencoded';
  } else if (options.formData) {
    const form = new FormData();
    for (const [key, value] of Object.entries(options.formData)) form.append(key, value);
    body = form;
  }
  return { url, method, timeout, headers, body };
}

function parseHttpBody(raw) {
  const text = Buffer.from(raw).toString();
  try { return JSON.parse(text); } catch { return text; }
}
```

Add `LxSourceRuntime` that:

- creates a hidden `BrowserWindow`;
- uses `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`;
- blocks navigation, popups, downloads, permissions, webviews, media, and DevTools in packaged builds;
- accepts only IPC messages whose `event.sender.id` equals its runtime `webContents.id`;
- services HTTP with `fetch` and `AbortController`;
- services synchronous `md5`, AES, RSA and random-byte calls through a sender-checked `ipcMain.on`/`event.returnValue` handler;
- services zlib through sender-checked `ipcMain.handle`;
- tracks request keys and rejects them after 20 seconds;
- rejects initialization after 10 seconds;
- destroys the window and aborts all HTTP operations on stop.

- [ ] **Step 5: Implement the preload compatibility bridge**

`desktop/custom-source/runtime-preload.js` must expose exactly:

```js
const runtimeArg = process.argv.find(value => value.startsWith('--mineradio-lx-runtime-id='));
const runtimeId = runtimeArg ? runtimeArg.split('=').slice(1).join('=') : '';
const bootstrap = ipcRenderer.sendSync('mineradio-lx-bootstrap', { runtimeId });
const currentScriptInfo = bootstrap.currentScriptInfo;

contextBridge.exposeInMainWorld('lx', {
  version: '2.0.0',
  env: 'desktop',
  EVENT_NAMES: { request: 'request', inited: 'inited', updateAlert: 'updateAlert' },
  currentScriptInfo,
  request(url, options, callback) {
    const requestId = `http_${Date.now()}_${Math.random()}`;
    ipcRenderer.invoke('mineradio-lx-http', { runtimeId, requestId, url, options })
      .then(result => callback(null, result.response, result.body))
      .catch(error => callback(error, null, null));
    return () => ipcRenderer.send('mineradio-lx-http-cancel', { runtimeId, requestId });
  },
  on(eventName, handler) {
    if (eventName !== 'request') return Promise.reject(new Error(`The event is not supported: ${eventName}`));
    requestHandler = handler;
    return Promise.resolve();
  },
  send(eventName, data) {
    if (eventName === 'inited') return ipcRenderer.invoke('mineradio-lx-inited', { runtimeId, data });
    if (eventName === 'updateAlert') return ipcRenderer.invoke('mineradio-lx-update-alert', { runtimeId, data });
    return Promise.reject(new Error(`The event is not supported: ${eventName}`));
  },
  utils: createLxUtils(ipcRenderer, runtimeId),
});
```

The preload listens for `mineradio-lx-request`, invokes the registered handler, and responds with `mineradio-lx-response`. It reports `error` and `unhandledrejection` before initialization. It receives the script only after the page loads and executes it with indirect `eval`, keeping Node globals outside the page world.

`runtime.js` passes only `--mineradio-lx-runtime-id=<random-id>` through `additionalArguments`. The sender-checked synchronous bootstrap handler returns `currentScriptInfo`; the raw script is then delivered to that same `webContents` after `did-finish-load`. This avoids placing script contents or credentials on the process command line.

- [ ] **Step 6: Run pure runtime tests**

Run:

```powershell
node --test test/custom-source/runtime.test.js
```

Expected: 2 tests PASS.

- [ ] **Step 7: Commit**

```powershell
git add desktop/custom-source/runtime.html desktop/custom-source/runtime-preload.js desktop/custom-source/runtime.js test/custom-source/runtime.test.js test/custom-source/fixtures
git commit -m "feat: add isolated LX source runtime"
```

## Task 5: Add the Source Manager and Lifecycle Tests

**Files:**

- Create: `desktop/custom-source/manager.js`
- Create: `test/custom-source/manager.test.js`

- [ ] **Step 1: Write failing manager tests with an injected runtime**

```js
// test/custom-source/manager.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { CustomSourceManager } = require('../../desktop/custom-source/manager');

function fakeStore(active) {
  return {
    list: () => active ? [{ ...active, active: true }] : [],
    getActive: () => active,
    getScript: () => '/** @name Fake */',
    setStatus: () => {},
    setActive: () => {},
  };
}

test('resolves a supported track through the active runtime', async () => {
  const active = { id: 'a', sources: { wy: { actions: ['musicUrl'], qualitys: ['128k', 'flac'] } } };
  const runtime = { start: async () => active.sources, request: async payload => `https://audio/${payload.info.type}.mp3`, stop: async () => {} };
  const manager = new CustomSourceManager({ store: fakeStore(active), runtimeFactory: () => runtime });
  await manager.startActive();
  const result = await manager.resolveMusicUrl({ provider: 'netease', id: 1, name: 'A', artist: 'B' }, 'hires');
  assert.equal(result.handled, true);
  assert.equal(result.level, 'lossless');
  assert.equal(result.url, 'https://audio/flac.mp3');
});

test('returns inactive without invoking built-in policy', async () => {
  const manager = new CustomSourceManager({ store: fakeStore(null), runtimeFactory: () => { throw new Error('unused'); } });
  assert.deepEqual(await manager.resolveMusicUrl({ provider: 'netease', id: 1 }, 'standard'), { active: false, handled: false });
});
```

- [ ] **Step 2: Verify failure**

Run:

```powershell
node --test test/custom-source/manager.test.js
```

Expected: FAIL because `CustomSourceManager` is missing.

- [ ] **Step 3: Implement manager behavior**

`CustomSourceManager` must expose:

```js
class CustomSourceManager extends EventEmitter {
  constructor({ store, runtimeFactory, userDataPath, app, BrowserWindow, ipcMain })
  async startActive()
  async activate(id)
  async deactivate()
  async importScript(filePath, script)
  async replaceScript(id, script)
  async remove(id)
  setAllowUpdateAlert(id, enabled)
  list()
  getStatus()
  async resolveMusicUrl(song, mineradioQuality, signal)
  async dispose()
}
```

`resolveMusicUrl` uses:

```js
const lxSong = toLxMusicInfo(song);
const sourceInfo = this.sources[lxSong.source];
if (!sourceInfo || !sourceInfo.actions.includes('musicUrl')) {
  return { active: true, handled: true, url: '', reason: 'source_unsupported', error: 'SOURCE_UNSUPPORTED' };
}
const lxQuality = selectLxQuality(mineradioQuality, sourceInfo.qualitys);
if (!lxQuality) {
  return { active: true, handled: true, url: '', reason: 'quality_unsupported', error: 'QUALITY_UNSUPPORTED' };
}
const url = validateActionResponse('musicUrl', await this.runtime.request({
  source: lxSong.source,
  action: 'musicUrl',
  info: { type: lxQuality, musicInfo: lxSong },
}, signal));
return {
  active: true,
  handled: true,
  provider: 'lx-custom-source',
  source: lxSong.source,
  url,
  level: ({ '128k': 'standard', '320k': 'exhigh', flac: 'lossless', flac24bit: 'hires' })[lxQuality],
  lxQuality,
};
```

Activation starts the candidate runtime before stopping the current runtime. If candidate initialization fails, keep the old active source and old store state.

`replaceScript(id, script)` follows the same transaction: start the replacement in a temporary runtime, persist it only after successful `inited`, then atomically swap runtimes. If validation fails, destroy the temporary runtime and leave the old script file, metadata, and active runtime unchanged.

- [ ] **Step 4: Run tests and commit**

Run:

```powershell
node --test test/custom-source/manager.test.js
```

Expected: 2 tests PASS.

```powershell
git add desktop/custom-source/manager.js test/custom-source/manager.test.js
git commit -m "feat: manage active LX custom source"
```

## Task 6: Wire Manager, IPC, and Local HTTP Resolver

**Files:**

- Modify: `desktop/main.js:1124-1177,1320-1368`
- Modify: `desktop/preload.js:3-47`
- Modify: `server.js:60-70,3240-3560,4203`
- Create: `test/custom-source/server-route.test.js`

- [ ] **Step 1: Add a failing server resolver test**

Refactor `server.js` so importing it still returns the server, then test the injected resolver without external network:

```js
// test/custom-source/server-route.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

test('POST /api/custom-source/resolve delegates to the injected resolver', async () => {
  process.env.PORT = '0';
  process.env.HOST = '127.0.0.1';
  const server = require('../../server');
  server.setCustomSourceResolver(async ({ song, quality }) => ({
    active: true, handled: true, url: `https://audio/${song.id}.mp3`, level: quality,
  }));
  await new Promise(resolve => server.listening ? resolve() : server.once('listening', resolve));
  const port = server.address().port;
  const body = JSON.stringify({ song: { provider: 'netease', id: 42 }, quality: 'standard' });
  const result = await new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: '/api/custom-source/resolve', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, res => {
      let text = '';
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve(JSON.parse(text)));
    });
    req.on('error', reject);
    req.end(body);
  });
  assert.equal(result.url, 'https://audio/42.mp3');
  await new Promise(resolve => server.close(resolve));
});
```

- [ ] **Step 2: Verify failure**

Run:

```powershell
node --test test/custom-source/server-route.test.js
```

Expected: FAIL because `setCustomSourceResolver` is missing.

- [ ] **Step 3: Add the injectable resolver route**

In `server.js`:

```js
let customSourceResolver = null;

if (pn === '/api/custom-source/resolve' && req.method === 'POST') {
  try {
    const body = await readRequestBody(req);
    if (!customSourceResolver) {
      sendJSON(res, { active: false, handled: false });
      return;
    }
    const controller = new AbortController();
    req.once('close', () => controller.abort());
    const result = await customSourceResolver({
      song: body.song || {},
      quality: String(body.quality || 'hires'),
      signal: controller.signal,
    });
    sendJSON(res, result || { active: false, handled: false });
  } catch (error) {
    sendJSON(res, { active: true, handled: true, url: '', error: error.message || 'CUSTOM_SOURCE_FAILED' }, 502);
  }
  return;
}
```

Before export:

```js
server.setCustomSourceResolver = resolver => {
  customSourceResolver = typeof resolver === 'function' ? resolver : null;
};
```

- [ ] **Step 4: Initialize the manager before the main window**

In `desktop/main.js`, create the store under:

```js
path.join(app.getPath('userData'), 'custom-sources')
```

After requiring `server.js`:

```js
customSourceManager = new CustomSourceManager({ userDataPath: app.getPath('userData'), app, BrowserWindow, ipcMain });
await customSourceManager.startActive();
localServer.setCustomSourceResolver(payload => customSourceManager.resolveMusicUrl(payload.song, payload.quality, payload.signal));
```

Dispose it in the existing app shutdown path.

- [ ] **Step 5: Add narrow management IPC**

Register:

```text
mineradio-custom-source-list
mineradio-custom-source-import
mineradio-custom-source-replace
mineradio-custom-source-activate
mineradio-custom-source-deactivate
mineradio-custom-source-remove
mineradio-custom-source-set-update-alert
```

The import handler uses `dialog.showOpenDialog` with `filters: [{ name: 'JavaScript 音源', extensions: ['js'] }]`, reads UTF-8 text, asks the manager to validate it, and returns the refreshed public list without raw script content.

The replace handler receives an existing script ID, opens the same `.js` picker, and calls the manager's transactional `replaceScript`. It never overwrites the stored file before the candidate runtime initializes.

Expose matching preload methods:

```js
listCustomSources: () => ipcRenderer.invoke('mineradio-custom-source-list'),
importCustomSource: () => ipcRenderer.invoke('mineradio-custom-source-import'),
replaceCustomSource: id => ipcRenderer.invoke('mineradio-custom-source-replace', String(id || '')),
activateCustomSource: id => ipcRenderer.invoke('mineradio-custom-source-activate', String(id || '')),
deactivateCustomSource: () => ipcRenderer.invoke('mineradio-custom-source-deactivate'),
removeCustomSource: id => ipcRenderer.invoke('mineradio-custom-source-remove', String(id || '')),
setCustomSourceUpdateAlert: (id, enabled) => ipcRenderer.invoke('mineradio-custom-source-set-update-alert', String(id || ''), !!enabled),
onCustomSourceStatus: callback => {
  const listener = (_event, value) => callback(value);
  ipcRenderer.on('mineradio-custom-source-status', listener);
  return () => ipcRenderer.removeListener('mineradio-custom-source-status', listener);
},
```

- [ ] **Step 6: Run route and syntax checks**

Run:

```powershell
node --test test/custom-source/server-route.test.js
node --check server.js
node --check desktop/main.js
node --check desktop/preload.js
```

Expected: test PASS and all syntax checks exit 0.

- [ ] **Step 7: Commit**

```powershell
git add desktop/main.js desktop/preload.js server.js test/custom-source/server-route.test.js
git commit -m "feat: expose LX source management and resolver"
```

## Task 7: Add the Custom Source Management UI

**Files:**

- Modify: `public/index.html:135-230,1960-2260,21860-22030`

- [ ] **Step 1: Add the source-manager entry and modal markup**

Add a compact “音源” button beside the existing hotkey/settings controls. Add a glass modal containing:

```html
<div id="custom-source-modal" class="modal-mask" aria-hidden="true">
  <section class="custom-source-dialog" role="dialog" aria-modal="true" aria-labelledby="custom-source-title">
    <header>
      <div>
        <div id="custom-source-title" class="custom-source-title">洛雪自定义音源</div>
        <div class="custom-source-sub">兼容 LX Music Desktop 2.0.0 · 一次启用一个脚本</div>
      </div>
      <button type="button" onclick="closeCustomSourceModal()">×</button>
    </header>
    <div class="custom-source-warning">第三方脚本可以向网络发送歌曲信息。仅导入你信任的脚本。</div>
    <div id="custom-source-list"></div>
    <footer>
      <button type="button" onclick="importCustomSource()">导入 .js 音源</button>
      <button type="button" onclick="deactivateCustomSource()">停用音源</button>
    </footer>
  </section>
</div>
```

- [ ] **Step 2: Implement UI state and rendering**

Add:

```js
var customSourceState = { items: [], activeId: '', loading: false };

async function refreshCustomSources() {
  var api = window.desktopWindow;
  if (!api || typeof api.listCustomSources !== 'function') return;
  var result = await api.listCustomSources();
  customSourceState.items = result && result.items || [];
  customSourceState.activeId = result && result.activeId || '';
  renderCustomSourceList();
}

function customSourceStatusText(item) {
  if (item.status === 'ready') return '已就绪';
  if (item.status === 'starting') return '初始化中';
  if (item.status === 'failed') return item.message || '初始化失败';
  return '未启用';
}
```

Render text with `textContent`, not `innerHTML`, for all script-controlled metadata. Buttons invoke activate, replace/update, remove, and update-alert methods. Import confirmation repeats the outbound-network warning before opening the file dialog. The replace/update button invokes `replaceCustomSource(item.id)` and preserves the old version if validation fails.

- [ ] **Step 3: Handle live status events**

At startup:

```js
if (window.desktopWindow && typeof window.desktopWindow.onCustomSourceStatus === 'function') {
  window.desktopWindow.onCustomSourceStatus(function(status) {
    refreshCustomSources();
    if (status && status.error) showToast('音源错误: ' + status.error);
  });
}
```

- [ ] **Step 4: Validate UI statically**

Run:

```powershell
node -e "const fs=require('fs');const s=fs.readFileSync('public/index.html','utf8');for(const id of ['custom-source-modal','custom-source-list'])if(!s.includes('id=\"'+id+'\"'))throw new Error(id)"
git diff --check
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```powershell
git add public/index.html
git commit -m "feat: add custom source manager UI"
```

## Task 8: Route Playback and Beat Prefetch Through the Active Script

**Files:**

- Modify: `public/index.html:10280-10321,18170-18510`
- Create: `test/custom-source/playback-policy.test.js`

- [ ] **Step 1: Extract and test playback policy**

Create a small pure function in `desktop/custom-source/protocol.js`:

```js
function customSourcePolicy(result) {
  if (!result || result.active !== true) return 'builtin';
  if (result.url) return 'custom';
  return 'fallback';
}
```

Test:

```js
test('custom source is authoritative while active', () => {
  assert.equal(customSourcePolicy({ active: false, handled: false }), 'builtin');
  assert.equal(customSourcePolicy({ active: true, handled: true, url: 'https://a' }), 'custom');
  assert.equal(customSourcePolicy({ active: true, handled: true, url: '' }), 'fallback');
});
```

Run:

```powershell
node --test test/custom-source/playback-policy.test.js
```

Expected before implementation: FAIL; after export: PASS.

- [ ] **Step 2: Add one renderer playback resolver**

In `public/index.html`:

```js
async function resolveOnlinePlaybackData(song, requestedQuality) {
  var custom = await apiJson('/api/custom-source/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ song: song, quality: requestedQuality })
  });
  if (custom && custom.active) return custom;
  var isQQ = songProviderKey(song) === 'qq';
  var qualityParam = '&quality=' + encodeURIComponent(requestedQuality);
  return isQQ
    ? apiJson('/api/qq/song/url?mid=' + encodeURIComponent(song.mid || song.songmid || song.id || '') + '&mediaMid=' + encodeURIComponent(song.mediaMid || song.media_mid || '') + qualityParam)
    : apiJson('/api/song/url?id=' + encodeURIComponent(song.id) + qualityParam);
}
```

Replace both direct URL branches in `fetchBeatPrefetchAudioUrl` and `playQueueAt` with this function.

- [ ] **Step 3: Preserve authoritative failure and cross-source fallback**

When an active script returns no URL:

- do not call the built-in URL endpoint for that same track;
- pass its `reason` and `error` into `tryAutoPlaybackFallback`;
- preserve `trackSwitchToken` cancellation;
- let the alternate QQ/NetEase search produce a new song object;
- call `playQueueAt` again so the script receives the alternate platform key.

For script URL load errors, call `tryAutoPlaybackFallback` before skipping the queue item. Do not show NetEase/QQ login prompts for `provider: 'lx-custom-source'`.

- [ ] **Step 4: Run full tests and syntax checks**

Run:

```powershell
npm test
node --check server.js
node --check desktop/main.js
git diff --check
```

Expected: all tests PASS and checks exit 0.

- [ ] **Step 5: Commit**

```powershell
git add desktop/custom-source/protocol.js public/index.html test/custom-source/playback-policy.test.js
git commit -m "feat: resolve playback through active LX source"
```

## Task 9: Add Electron Contract Smoke Test

**Files:**

- Create: `test/custom-source/electron-smoke.js`
- Modify: `desktop/custom-source/runtime.js`

- [ ] **Step 1: Write the smoke harness**

The harness must:

```js
const { app, BrowserWindow, ipcMain } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { LxSourceRuntime } = require('../../desktop/custom-source/runtime');

app.whenReady().then(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-electron-source-'));
  app.setPath('userData', userData);
  const script = fs.readFileSync(path.join(__dirname, 'fixtures/basic-source.js'), 'utf8');
  const runtime = new LxSourceRuntime({ BrowserWindow, ipcMain, app, packaged: false });
  const sources = await runtime.start({
    id: 'smoke',
    name: 'Basic Test Source',
    script,
    allowUpdateAlert: false,
  });
  assert.deepEqual(sources.wy.qualitys, ['128k', '320k', 'flac']);
  const url = await runtime.request({
    source: 'wy',
    action: 'musicUrl',
    info: { type: 'flac', musicInfo: { meta: { songId: 42 } } },
  });
  assert.equal(url, 'https://audio.example/42/flac.mp3');
  await runtime.stop();
  app.quit();
}).catch(error => {
  console.error(error);
  app.exit(1);
});
```

- [ ] **Step 2: Run the host smoke test**

Run:

```powershell
npm run test:custom-source-host
```

Expected: exit 0 with no visible window.

- [ ] **Step 3: Add isolation assertions**

Add a fixture that attempts:

```js
if (typeof require !== 'undefined' || typeof process !== 'undefined') throw new Error('sandbox escape');
```

It must initialize successfully, proving the page world cannot access Node globals. Add a fixture that never calls `inited`; the runtime must reject with `INIT_TIMEOUT`.

Add `test/custom-source/fixtures/contract-source.js`. During initialization it must:

```js
const { utils } = globalThis.lx;
const abc = utils.buffer.from('abc');
if (utils.buffer.bufToString(abc, 'utf8') !== 'abc') throw new Error('buffer contract');
if (utils.crypto.md5('abc') !== '900150983cd24fb0d6963f7d28e17f72') throw new Error('md5 contract');
if (utils.crypto.randomBytes(16).length !== 16) throw new Error('random contract');
const zipped = await utils.zlib.deflate(abc);
const unzipped = await utils.zlib.inflate(zipped);
if (utils.buffer.bufToString(unzipped, 'utf8') !== 'abc') throw new Error('zlib contract');
```

The fixture must also call AES with a fixed 16-byte key/IV and assert that the result is non-empty, call RSA with the smoke harness's fixed 1024-bit public key and assert a 128-byte result, then register `request` and send `inited`.

The smoke harness starts a loopback HTTP server with:

- `/json` returning `{"ok":true}`;
- `/echo` returning the submitted body;
- `/slow` waiting 30 seconds unless the client cancels.

It passes the loopback base URL to the fixture as non-secret bootstrap data. Assert `lx.request` handles JSON, text, `body`, `form`, `formData`, a 60-second timeout cap, and cancellation of `/slow`. Add a `local` fixture source and assert `lyric` returns `{ lyric, tlyric, rlyric, lxlyric }` while `pic` returns an HTTP URL. Send `updateAlert` twice and assert the first reaches the manager while the second rejects.

- [ ] **Step 4: Re-run smoke and commit**

Run:

```powershell
npm run test:custom-source-host
```

Expected: all smoke assertions pass and the process exits 0.

```powershell
git add test/custom-source/electron-smoke.js test/custom-source/fixtures desktop/custom-source/runtime.js
git commit -m "test: verify LX runtime contract in Electron"
```

## Task 10: Document, Package, and Perform End-to-End Verification

**Files:**

- Modify: `README.md`
- Modify: `PRIVACY.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`

- [ ] **Step 1: Document supported behavior**

Add to README:

- import path: “音源 → 导入 `.js` 音源”;
- compatibility target: LX Music Desktop custom-source API 2.0.0;
- Mineradio search remains NetEase/QQ;
- one active script at a time;
- scripts are not bundled or synced;
- only import trusted scripts;
- disabling the script restores built-in playback resolution.

Add to `PRIVACY.md`:

- storage location is Electron `userData/custom-sources`;
- raw scripts stay local;
- scripts may send song metadata and script-owned credentials to arbitrary HTTP/HTTPS services;
- Mineradio cookies and account sessions are not injected into script requests;
- logs redact common secret fields.

Add a concise entry at the top of `CHANGELOG.md`.

- [ ] **Step 2: Ensure package inclusion is explicit**

Confirm `package.json` includes:

```json
"desktop/**/*"
```

and excludes tests from packaged output. No user script or `custom-sources` directory may exist under the repository or `dist`.

- [ ] **Step 3: Run complete automated verification**

Run:

```powershell
npm test
npm run test:custom-source-host
node --check server.js
node --check desktop/main.js
node --check desktop/preload.js
git diff --check
```

Expected: all tests PASS and all checks exit 0.

- [ ] **Step 4: Build the unpacked Windows app**

Run:

```powershell
npm run build:win:dir
```

Expected: `dist/win-unpacked/Mineradio.exe` exists and build exits 0.

- [ ] **Step 5: Perform manual acceptance checks**

Launch the unpacked app and verify:

1. Import `test/custom-source/fixtures/basic-source.js`.
2. The modal shows name, version, `wy`/`tx`, supported quality, and “已就绪”.
3. A NetEase result invokes `wy`; a QQ result invokes `tx`.
4. Changing Mineradio quality changes the LX `info.type` selection.
5. Disabling the source restores current built-in NetEase/QQ behavior.
6. Switching tracks while a script request is pending cannot replace the new track.
7. A failing script leaves the previous source active.
8. No hidden window, permission dialog, popup, download, or DevTools appears.
9. Existing lyrics, progress, beat analysis, movie camera, and 3D playlist shelf continue working.
10. `git status --short` and `dist` contain no imported user source script or credential.

- [ ] **Step 6: Commit documentation and verification adjustments**

```powershell
git add README.md PRIVACY.md CHANGELOG.md package.json
git commit -m "docs: explain LX custom source support"
```

- [ ] **Step 7: Final evidence**

Run:

```powershell
git status --short
git log --oneline -10
```

Expected: clean worktree and the task commits visible in order.
