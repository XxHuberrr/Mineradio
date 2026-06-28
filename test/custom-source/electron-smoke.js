if (!process.versions.electron) process.exit(0);

const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { LxSourceRuntime } = require('../../desktop/custom-source/runtime');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-electron-source-'));
app.setPath('userData', userData);
app.disableHardwareAcceleration();

async function runBasic() {
  const script = fs.readFileSync(path.join(__dirname, 'fixtures/basic-source.js'), 'utf8');
  const runtime = new LxSourceRuntime({
    script,
    currentScriptInfo: { id: 'smoke', name: 'Basic Test Source', allowUpdateAlert: false },
    electron: { app, BrowserWindow, ipcMain },
  });
  try {
    const initialized = await runtime.start();
    assert.deepEqual(initialized.sources.wy.qualitys, ['128k', '320k', 'flac']);
    const url = await runtime.request({
      source: 'wy',
      action: 'musicUrl',
      info: { type: 'flac', musicInfo: { meta: { songId: 42 } } },
    });
    assert.equal(url, 'https://audio.example/42/flac.mp3');
  } finally {
    runtime.stop();
  }
}

async function createLoopbackServer() {
  const server = http.createServer((req, res) => {
    if (req.url === '/slow') {
      const timer = setTimeout(() => { if (!res.destroyed) res.end('late'); }, 30_000);
      req.once('close', () => clearTimeout(timer));
      return;
    }
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      if (req.url === '/json') {
        res.setHeader('content-type', 'application/json');
        res.end('{"ok":true}');
      } else if (req.url === '/text') {
        res.end('plain text');
      } else if (req.url === '/echo') {
        res.end(body);
      } else {
        res.statusCode = 404;
        res.end('missing');
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server;
}

async function runContract() {
  const server = await createLoopbackServer();
  const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 1024 });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const template = fs.readFileSync(path.join(__dirname, 'fixtures/contract-source.js'), 'utf8');
  const script = template
    .replace('__BASE_URL__', baseUrl)
    .replace('__PUBLIC_KEY__', JSON.stringify(publicKey.export({ type: 'spki', format: 'pem' })));
  const alerts = [];
  const runtime = new LxSourceRuntime({
    script,
    currentScriptInfo: { name: 'Contract Test Source' },
    electron: { app, BrowserWindow, ipcMain },
    onUpdateAlert: value => alerts.push(value),
  });
  try {
    const initialized = await runtime.start();
    assert.deepEqual(initialized.sources.local.actions, ['musicUrl', 'lyric', 'pic']);
    assert.equal(alerts.length, 1);
    const lyric = await runtime.request({ source: 'local', action: 'lyric', info: {} });
    assert.equal(lyric.lyric, '[00:00.00]a');
    const pic = await runtime.request({ source: 'local', action: 'pic', info: {} });
    assert.equal(pic, 'https://img.example/cover.jpg');
  } finally {
    runtime.stop();
    await new Promise(resolve => server.close(resolve));
  }
}

async function runInitTimeout() {
  const script = fs.readFileSync(path.join(__dirname, 'fixtures/timeout-source.js'), 'utf8');
  const runtime = new LxSourceRuntime({
    script,
    currentScriptInfo: { name: 'Timeout Test Source' },
    initTimeout: 50,
    electron: { app, BrowserWindow, ipcMain },
  });
  await assert.rejects(runtime.start(), /INIT_TIMEOUT/);
  assert.equal(runtime.window, null);
}

async function run() {
  await app.whenReady();
  const sentinel = new BrowserWindow({ show: false });
  try {
    await runBasic();
    await runContract();
    await runInitTimeout();
  } finally {
    sentinel.destroy();
  }
}

run().then(() => app.quit()).catch(error => {
  console.error(error);
  app.exit(1);
});
