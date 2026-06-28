const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const runtimePath = path.join(__dirname, '../../desktop/custom-source/runtime.js');

function loadRuntime() {
  return require(runtimePath);
}

class FakeIpcMain extends EventEmitter {
  constructor() {
    super();
    this.handlers = new Map();
  }

  handle(name, handler) {
    if (this.handlers.has(name)) throw new Error(`duplicate handler: ${name}`);
    this.handlers.set(name, handler);
  }

  removeHandler(name) {
    this.handlers.delete(name);
  }
}

let nextWebContentsId = 42;

class FakeWebContents extends EventEmitter {
  constructor(id = nextWebContentsId++) {
    super();
    this.id = id;
    this.audioMuted = false;
    this.sent = [];
    this.session = {
      setPermissionRequestHandler: handler => { this.permissionHandler = handler; },
      on: (name, handler) => { this.downloadHandler = { name, handler }; },
    };
  }

  send(...args) {
    this.sent.push(args);
  }

  setWindowOpenHandler(handler) {
    this.windowOpenHandler = handler;
  }

  closeDevTools() {
    this.devToolsClosed = true;
  }

  setAudioMuted(value) {
    this.audioMuted = value;
  }

  executeJavaScript(script) {
    this.executedJavaScript = script;
    return Promise.resolve();
  }
}

class FakeBrowserWindow extends EventEmitter {
  static instances = [];

  constructor(options) {
    super();
    this.options = options;
    this.webContents = new FakeWebContents();
    this.destroyed = false;
    FakeBrowserWindow.instances.push(this);
  }

  loadFile(file) {
    this.loadedFile = file;
    return Promise.resolve();
  }

  destroy() {
    this.destroyed = true;
    this.emit('closed');
  }

  isDestroyed() {
    return this.destroyed;
  }
}

function emitSync(ipcMain, channel, sender, payload) {
  const event = { sender, returnValue: undefined };
  ipcMain.emit(channel, event, payload);
  return event.returnValue;
}

test('runtime module and locked-down document exist', () => {
  assert.equal(fs.existsSync(runtimePath), true);
  const html = fs.readFileSync(path.join(__dirname, '../../desktop/custom-source/runtime.html'), 'utf8');
  assert.match(html, /default-src 'none'; script-src 'unsafe-eval'; connect-src 'none'; img-src 'none'; style-src 'none'/);
  assert.match(html, /<body><\/body>/);
});

test('normalizes LX request timeout, method, headers, and forms', () => {
  const { normalizeRequestOptions } = loadRuntime();
  const headers = { accept: 'application/json' };
  const result = normalizeRequestOptions('https://example.com/path', {
    method: 'post',
    timeout: 90000,
    headers,
    form: { a: 'b c' },
  });
  assert.equal(result.method, 'POST');
  assert.equal(result.timeout, 60000);
  assert.deepEqual(result.headers, {
    accept: 'application/json',
    'content-type': 'application/x-www-form-urlencoded',
  });
  assert.notEqual(result.headers, headers);
  assert.equal(result.body.toString(), 'a=b+c');

  const multipart = normalizeRequestOptions('http://example.com', {
    timeout: -2,
    formData: { x: 'y' },
  });
  assert.equal(multipart.timeout, 1);
  assert.equal(multipart.body.get('x'), 'y');
});

test('rejects malformed, unsafe, and oversized request URLs', () => {
  const { normalizeRequestOptions } = loadRuntime();
  for (const url of [
    'ftp://example.com',
    ' https://example.com',
    'https://',
    `https://example.com/${'x'.repeat(2048)}`,
  ]) {
    assert.throws(() => normalizeRequestOptions(url), /HTTP_FAILED/);
  }
  assert.equal(normalizeRequestOptions('https://example.com', { timeout: 'nope' }).timeout, 60000);
});

test('parses JSON and preserves text bodies', () => {
  const { parseHttpBody } = loadRuntime();
  assert.deepEqual(parseHttpBody(Buffer.from('{"ok":true}')), { ok: true });
  assert.equal(parseHttpBody(Buffer.from('plain')), 'plain');
});

test('creates a hidden sandbox and blocks renderer escape surfaces', async () => {
  FakeBrowserWindow.instances.length = 0;
  const { LxSourceRuntime } = loadRuntime();
  const ipcMain = new FakeIpcMain();
  const runtime = new LxSourceRuntime({
    script: 'globalThis.marker = true',
    currentScriptInfo: { name: 'test' },
    electron: { BrowserWindow: FakeBrowserWindow, ipcMain, app: { isPackaged: true } },
  });
  const started = runtime.start();
  const win = FakeBrowserWindow.instances[0];
  assert.equal(win.options.show, false);
  assert.deepEqual(
    {
      nodeIntegration: win.options.webPreferences.nodeIntegration,
      contextIsolation: win.options.webPreferences.contextIsolation,
      sandbox: win.options.webPreferences.sandbox,
      devTools: win.options.webPreferences.devTools,
    },
    { nodeIntegration: false, contextIsolation: true, sandbox: true, devTools: false },
  );
  assert.equal(win.webContents.audioMuted, true);
  assert.equal(win.options.webPreferences.partition, `mineradio-lx-${runtime.runtimeId}`);
  assert.equal(win.options.webPreferences.partition.startsWith('persist:'), false);
  assert.equal(win.options.webPreferences.additionalArguments.length, 1);
  assert.match(win.options.webPreferences.additionalArguments[0], /^--mineradio-lx-runtime-id=[\w-]+$/);
  for (const eventName of ['will-navigate', 'will-redirect', 'will-attach-webview']) {
    const event = { prevented: false, preventDefault() { this.prevented = true; } };
    win.webContents.emit(eventName, event);
    assert.equal(event.prevented, true, `${eventName} was not blocked`);
  }
  assert.doesNotThrow(() => win.webContents.emit('media-started-playing'));
  assert.equal(win.webContents.audioMuted, true);
  assert.match(win.webContents.executedJavaScript, /pause\(\)/);
  assert.deepEqual(win.webContents.windowOpenHandler(), { action: 'deny' });
  let permission;
  win.webContents.permissionHandler(win.webContents, 'camera', value => { permission = value; });
  assert.equal(permission, false);
  const downloadEvent = { preventDefault() { this.prevented = true; } };
  win.webContents.downloadHandler.handler(downloadEvent);
  assert.equal(downloadEvent.prevented, true);
  win.webContents.emit('devtools-opened');
  assert.equal(win.webContents.devToolsClosed, true);

  win.webContents.emit('did-finish-load');
  assert.deepEqual(win.webContents.sent.at(-1), ['mineradio-lx-script', {
    runtimeId: runtime.runtimeId,
    script: 'globalThis.marker = true',
  }]);
  runtime.stop();
  await assert.rejects(started, /stopped/i);
});

test('keeps DevTools available in non-packaged runtime windows for diagnostics', async () => {
  FakeBrowserWindow.instances.length = 0;
  const { LxSourceRuntime } = loadRuntime();
  const ipcMain = new FakeIpcMain();
  const runtime = new LxSourceRuntime({
    script: 'x',
    currentScriptInfo: {},
    electron: { BrowserWindow: FakeBrowserWindow, ipcMain, app: { isPackaged: false } },
  });
  const started = runtime.start();
  const win = FakeBrowserWindow.instances[0];
  assert.equal(win.options.webPreferences.devTools, true);
  runtime.stop();
  await assert.rejects(started, /stopped/i);
});

test('sender-checks bootstrap and shares IPC handlers without collisions', async () => {
  FakeBrowserWindow.instances.length = 0;
  const { LxSourceRuntime } = loadRuntime();
  const ipcMain = new FakeIpcMain();
  const electron = { BrowserWindow: FakeBrowserWindow, ipcMain, app: { isPackaged: false } };
  const first = new LxSourceRuntime({
    script: 'one',
    currentScriptInfo: { name: 'one', author: 'tester', rawScript: 'must-not-cross-bootstrap' },
    electron,
  });
  const second = new LxSourceRuntime({
    script: 'two',
    currentScriptInfo: { name: 'two' },
    electron,
  });
  const firstStart = first.start();
  const secondStart = second.start();
  const [firstWindow, secondWindow] = FakeBrowserWindow.instances;

  assert.deepEqual(emitSync(ipcMain, 'mineradio-lx-bootstrap', firstWindow.webContents, {
    runtimeId: first.runtimeId,
  }), { currentScriptInfo: { name: 'one', author: 'tester' } });
  assert.deepEqual(emitSync(ipcMain, 'mineradio-lx-bootstrap', secondWindow.webContents, {
    runtimeId: first.runtimeId,
  }), { error: 'UNAUTHORIZED' });
  assert.equal([...ipcMain.handlers.keys()].filter(name => name === 'mineradio-lx-http').length, 1);

  first.stop();
  assert.equal(ipcMain.handlers.has('mineradio-lx-http'), true);
  second.stop();
  assert.equal(ipcMain.handlers.has('mineradio-lx-http'), false);
  await assert.rejects(firstStart, /stopped/i);
  await assert.rejects(secondStart, /stopped/i);
});

test('services sender-checked crypto and zlib operations', async () => {
  FakeBrowserWindow.instances.length = 0;
  const { LxSourceRuntime } = loadRuntime();
  const ipcMain = new FakeIpcMain();
  const runtime = new LxSourceRuntime({
    script: 'x',
    currentScriptInfo: {},
    electron: { BrowserWindow: FakeBrowserWindow, ipcMain, app: { isPackaged: false } },
  });
  const started = runtime.start();
  const win = FakeBrowserWindow.instances[0];
  const md5 = emitSync(ipcMain, 'mineradio-lx-crypto', win.webContents, {
    runtimeId: runtime.runtimeId,
    operation: 'md5',
    args: ['abc'],
  });
  assert.equal(md5, '900150983cd24fb0d6963f7d28e17f72');
  assert.deepEqual(emitSync(ipcMain, 'mineradio-lx-crypto', { id: 99 }, {
    runtimeId: runtime.runtimeId,
    operation: 'randomBytes',
    args: [4],
  }), { error: 'UNAUTHORIZED' });

  const compressed = await ipcMain.handlers.get('mineradio-lx-zlib')(
    { sender: win.webContents },
    { runtimeId: runtime.runtimeId, operation: 'deflate', data: Buffer.from('hello') },
  );
  const inflated = await ipcMain.handlers.get('mineradio-lx-zlib')(
    { sender: win.webContents },
    { runtimeId: runtime.runtimeId, operation: 'inflate', data: compressed },
  );
  assert.equal(Buffer.from(inflated).toString(), 'hello');
  runtime.stop();
  await assert.rejects(started, /stopped/i);
});

test('rejects initialization immediately when the source sends invalid metadata', async () => {
  FakeBrowserWindow.instances.length = 0;
  const { LxSourceRuntime } = loadRuntime();
  const ipcMain = new FakeIpcMain();
  const runtime = new LxSourceRuntime({
    script: 'x',
    currentScriptInfo: {},
    electron: { BrowserWindow: FakeBrowserWindow, ipcMain, app: { isPackaged: false } },
  });
  const started = runtime.start();
  const win = FakeBrowserWindow.instances[0];
  await assert.rejects(
    ipcMain.handlers.get('mineradio-lx-inited')(
      { sender: win.webContents },
      { runtimeId: runtime.runtimeId, data: { sources: null } },
    ),
    /INIT_FAILED/,
  );
  await assert.rejects(
    Promise.race([
      started,
      new Promise((_, reject) => setTimeout(() => reject(new Error('still pending')), 50)),
    ]),
    error => error.message !== 'still pending',
  );
  assert.equal(runtime.window, null);
  assert.equal(win.destroyed, true);
  assert.equal(ipcMain.handlers.size, 0);
  assert.equal(ipcMain.listenerCount('mineradio-lx-bootstrap'), 0);
});

test('tears down the runtime when preload reports an initialization error', async () => {
  FakeBrowserWindow.instances.length = 0;
  const { LxSourceRuntime } = loadRuntime();
  const ipcMain = new FakeIpcMain();
  const runtime = new LxSourceRuntime({
    script: 'x',
    currentScriptInfo: {},
    electron: { BrowserWindow: FakeBrowserWindow, ipcMain, app: { isPackaged: false } },
  });
  const started = runtime.start();
  const win = FakeBrowserWindow.instances[0];
  ipcMain.emit('mineradio-lx-init-error', { sender: win.webContents }, {
    runtimeId: runtime.runtimeId,
    error: 'fixture init failure',
  });
  await assert.rejects(started, /fixture init failure/);
  assert.equal(runtime.window, null);
  assert.equal(win.destroyed, true);
  assert.equal(ipcMain.handlers.size, 0);
  assert.equal(ipcMain.listenerCount('mineradio-lx-bootstrap'), 0);
});

test('cleans up shared IPC when BrowserWindow creation fails', async () => {
  const { LxSourceRuntime } = loadRuntime();
  const ipcMain = new FakeIpcMain();
  class FailingBrowserWindow {
    constructor() {
      throw new Error('window failed');
    }
  }
  const runtime = new LxSourceRuntime({
    script: 'x',
    currentScriptInfo: {},
    electron: { BrowserWindow: FailingBrowserWindow, ipcMain, app: { isPackaged: false } },
  });
  await assert.rejects(runtime.start(), /window failed/);
  assert.equal(ipcMain.handlers.size, 0);
  assert.equal(ipcMain.listenerCount('mineradio-lx-bootstrap'), 0);
});

test('cleans up the window and IPC when loading the runtime document fails', async () => {
  class LoadFailBrowserWindow extends FakeBrowserWindow {
    loadFile() {
      return Promise.reject(new Error('load failed'));
    }
  }
  const { LxSourceRuntime } = loadRuntime();
  const ipcMain = new FakeIpcMain();
  const runtime = new LxSourceRuntime({
    script: 'x',
    currentScriptInfo: {},
    electron: { BrowserWindow: LoadFailBrowserWindow, ipcMain, app: { isPackaged: false } },
  });
  await assert.rejects(runtime.start(), /load failed/);
  assert.equal(ipcMain.handlers.size, 0);
  assert.equal(runtime.window, null);
});

test('HTTP service parses responses, supports cancellation, and aborts on stop', async () => {
  FakeBrowserWindow.instances.length = 0;
  const { LxSourceRuntime } = loadRuntime();
  const ipcMain = new FakeIpcMain();
  const signals = [];
  const runtime = new LxSourceRuntime({
    script: 'x',
    currentScriptInfo: {},
    fetchImpl: async (_url, options) => {
      signals.push(options.signal);
      if (signals.length === 1) {
        return {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'content-type': 'application/json' }),
          arrayBuffer: async () => Buffer.from('{"ok":true}'),
        };
      }
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
      });
    },
    electron: { BrowserWindow: FakeBrowserWindow, ipcMain, app: { isPackaged: false } },
  });
  const started = runtime.start();
  const win = FakeBrowserWindow.instances[0];
  const http = ipcMain.handlers.get('mineradio-lx-http');
  const result = await http({ sender: win.webContents }, {
    runtimeId: runtime.runtimeId,
    requestId: 'first',
    url: 'https://example.com',
    options: {},
  });
  assert.deepEqual(result.body, { ok: true });
  assert.equal(result.response.statusCode, 200);

  const pending = http({ sender: win.webContents }, {
    runtimeId: runtime.runtimeId,
    requestId: 'second',
    url: 'https://example.com',
    options: {},
  });
  ipcMain.emit('mineradio-lx-http-cancel', { sender: win.webContents }, {
    runtimeId: runtime.runtimeId,
    requestId: 'second',
  });
  await assert.rejects(pending);
  runtime.stop();
  assert.equal(signals.every(signal => signal.aborted || signals.indexOf(signal) === 0), true);
  await assert.rejects(started, /stopped/i);
});

test('HTTP service rejects oversized responses before buffering untrusted bodies', async () => {
  FakeBrowserWindow.instances.length = 0;
  const { LxSourceRuntime } = loadRuntime();
  const ipcMain = new FakeIpcMain();
  const runtime = new LxSourceRuntime({
    script: 'x',
    currentScriptInfo: {},
    fetchImpl: async () => ({
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-length': String(25 * 1024 * 1024) }),
      arrayBuffer: async () => {
        throw new Error('must not buffer oversized response');
      },
    }),
    electron: { BrowserWindow: FakeBrowserWindow, ipcMain, app: { isPackaged: false } },
  });
  const started = runtime.start();
  const win = FakeBrowserWindow.instances[0];
  await assert.rejects(
    ipcMain.handlers.get('mineradio-lx-http')(
      { sender: win.webContents },
      { runtimeId: runtime.runtimeId, requestId: 'large', url: 'https://example.com', options: {} },
    ),
    /HTTP_FAILED: Response too large/,
  );
  runtime.stop();
  await assert.rejects(started, /stopped/i);
});

test('zlib bridge rejects oversized input and output', async () => {
  FakeBrowserWindow.instances.length = 0;
  const { LxSourceRuntime } = loadRuntime();
  const ipcMain = new FakeIpcMain();
  const runtime = new LxSourceRuntime({
    script: 'x',
    currentScriptInfo: {},
    electron: { BrowserWindow: FakeBrowserWindow, ipcMain, app: { isPackaged: false } },
  });
  const started = runtime.start();
  const win = FakeBrowserWindow.instances[0];
  const zlibHandler = ipcMain.handlers.get('mineradio-lx-zlib');
  await assert.rejects(
    zlibHandler(
      { sender: win.webContents },
      { runtimeId: runtime.runtimeId, operation: 'deflate', data: Buffer.alloc(2 * 1024 * 1024 + 1) },
    ),
    /ZLIB_FAILED: Input too large/,
  );
  const bomb = require('node:zlib').deflateSync(Buffer.alloc(8 * 1024 * 1024 + 1));
  await assert.rejects(
    zlibHandler(
      { sender: win.webContents },
      { runtimeId: runtime.runtimeId, operation: 'inflate', data: bomb },
    ),
    /ZLIB_FAILED: Output too large/,
  );
  runtime.stop();
  await assert.rejects(started, /stopped/i);
});

test('preload defines the exact LX v2 bridge and indirect script evaluation', () => {
  const preload = fs.readFileSync(path.join(__dirname, '../../desktop/custom-source/runtime-preload.js'), 'utf8');
  assert.match(preload, /version:\s*['"]2\.0\.0['"]/);
  assert.match(preload, /env:\s*['"]desktop['"]/);
  assert.match(preload, /mineradio-lx-bootstrap/);
  assert.match(preload, /mineradio-lx-request/);
  assert.match(preload, /mineradio-lx-response/);
  assert.match(preload, /mineradio-lx-script/);
  assert.match(preload, /\(0,\s*eval\)/);
  assert.doesNotMatch(preload, /require\(['"]node:(fs|path|child_process)/);
});
