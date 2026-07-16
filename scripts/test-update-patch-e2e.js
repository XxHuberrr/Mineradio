'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { once } = require('events');
const { canonicalJson, PATCH_ENVELOPE_TYPE, PATCH_PAYLOAD_TYPE } = require('../update-signature');

const root = path.resolve(__dirname, '..');
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-update-patch-e2e-'));
const targetRelative = `public/mineradio-e2e-${process.pid}-${Date.now()}/resource.txt`;
const targetPath = path.join(root, ...targetRelative.split('/'));
const targetDirectory = path.dirname(targetPath);
const manifestPath = path.join(workspace, 'manifest.json');
const updateRoot = path.join(workspace, 'updates');
const backupRoot = path.join(workspace, 'backups');
const oldContent = 'resource before signed patch\n';
const newContent = 'resource after verified signed patch\n';
const keyId = 'e2e-release-key';
const serverChildren = new Set();
let assetMode = 'tampered';
let assetRequests = 0;

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function signPayload(payload, privateKey) {
  return {
    type: PATCH_ENVELOPE_TYPE,
    payload,
    signature: {
      algorithm: 'ed25519',
      keyId,
      value: crypto.sign(null, Buffer.from(canonicalJson(payload), 'utf8'), privateKey).toString('base64'),
    },
  };
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const holder = net.createServer();
    holder.unref();
    holder.once('error', reject);
    holder.listen(0, '127.0.0.1', () => {
      const address = holder.address();
      holder.close(error => error ? reject(error) : resolve(address.port));
    });
  });
}

function requestJson(url) {
  return fetch(url, { headers: { 'Sec-Fetch-Site': 'same-origin' } }).then(async response => {
    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch (_) { body = { raw: text }; }
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}: ${text}`);
      error.response = body;
      throw error;
    }
    return body;
  });
}

async function waitForApi(baseUrl, child, logs) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`Mineradio server exited early (${child.exitCode})\n${logs.join('')}`);
    try {
      const info = await requestJson(`${baseUrl}/api/app/version`);
      if (info && info.version === '1.1.1') return info;
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for Mineradio server\n${logs.join('')}`);
}

async function stopServer(child) {
  if (!child || child.exitCode != null) return;
  child.kill('SIGTERM');
  await Promise.race([
    once(child, 'exit'),
    new Promise(resolve => setTimeout(resolve, 5000)),
  ]);
  if (child.exitCode == null) child.kill('SIGKILL');
  serverChildren.delete(child);
}

async function startMineradioServer(port, publicPem) {
  const logs = [];
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      COOKIE_FILE: path.join(workspace, `.cookie-${port}`),
      QQ_COOKIE_FILE: path.join(workspace, `.qq-cookie-${port}`),
      MINERADIO_VERSION: '1.1.1',
      MINERADIO_UPDATE_DIR: updateRoot,
      MINERADIO_UPDATE_DOWNLOAD_DIR: path.join(updateRoot, 'downloads'),
      MINERADIO_PATCH_BACKUP_DIR: backupRoot,
      MINERADIO_UPDATE_MANIFEST_FILE: manifestPath,
      MINERADIO_UPDATE_MIRRORS: 'disabled-for-local-e2e',
      MINERADIO_UPDATE_PATCH_SIGNING_KEYS: JSON.stringify({ [keyId]: publicPem }),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverChildren.add(child);
  child.stdout.on('data', chunk => logs.push(chunk.toString()));
  child.stderr.on('data', chunk => logs.push(chunk.toString()));
  const baseUrl = `http://127.0.0.1:${port}`;
  const info = await waitForApi(baseUrl, child, logs);
  assert.strictEqual(info.update.patchSigningConfigured, true);
  return { child, baseUrl, logs };
}

async function waitForPatch(baseUrl, id, logs) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const job = await requestJson(`${baseUrl}/api/update/patch/status?id=${encodeURIComponent(id)}`).catch(error => error.response || null);
    if (job && (job.status === 'ready' || job.status === 'error')) return job;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for patch job ${id}\n${logs.join('')}`);
}

function findFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const output = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...findFiles(full));
    else output.push(full);
  }
  return output;
}

async function run() {
  fs.mkdirSync(targetDirectory, { recursive: true });
  fs.writeFileSync(targetPath, oldContent, 'utf8');

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
  const payload = {
    type: PATCH_PAYLOAD_TYPE,
    from: '1.1.1',
    to: '1.1.2',
    restartRequired: true,
    files: [{
      path: targetRelative,
      sha256: sha256(Buffer.from(newContent)),
      contentBase64: Buffer.from(newContent).toString('base64'),
    }],
  };
  const signedEnvelope = signPayload(payload, privateKey);
  const tamperedEnvelope = JSON.parse(JSON.stringify(signedEnvelope));
  tamperedEnvelope.payload.files[0].contentBase64 = Buffer.from('tampered content\n').toString('base64');
  const signedRaw = Buffer.from(JSON.stringify(signedEnvelope));
  const tamperedRaw = Buffer.from(JSON.stringify(tamperedEnvelope));

  const assetServer = http.createServer((req, res) => {
    assetRequests += 1;
    const body = assetMode === 'valid' ? signedRaw : tamperedRaw;
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Length': body.length,
    });
    res.end(body);
  });
  assetServer.listen(0, '127.0.0.1');
  await once(assetServer, 'listening');
  const assetPort = assetServer.address().port;
  const patchUrl = `http://127.0.0.1:${assetPort}/signed.patch.json`;

  function writeManifest(raw) {
    fs.writeFileSync(manifestPath, JSON.stringify({
      latestVersion: '1.1.2',
      updateAvailable: true,
      release: {
        version: '1.1.2',
        patch: {
          name: 'Mineradio-1.1.1-to-1.1.2.patch.json',
          from: '1.1.1',
          to: '1.1.2',
          size: raw.length,
          sha256: sha256(raw),
          downloadUrl: patchUrl,
        },
      },
    }), 'utf8');
  }

  let first;
  let second;
  try {
    writeManifest(tamperedRaw);
    const firstPort = await reservePort();
    first = await startMineradioServer(firstPort, publicPem);

    const rejectedStart = await requestJson(`${first.baseUrl}/api/update/patch`);
    const rejected = await waitForPatch(first.baseUrl, rejectedStart.id, first.logs);
    assert.strictEqual(rejected.status, 'error');
    assert.strictEqual(rejected.error, 'PATCH_SIGNATURE_INVALID');
    assert.strictEqual(fs.readFileSync(targetPath, 'utf8'), oldContent, 'Invalid signature must not change the target');

    assetMode = 'valid';
    writeManifest(signedRaw);
    const acceptedStart = await requestJson(`${first.baseUrl}/api/update/patch`);
    const accepted = await waitForPatch(first.baseUrl, acceptedStart.id, first.logs);
    assert.strictEqual(accepted.status, 'ready', first.logs.join(''));
    assert.strictEqual(accepted.version, '1.1.2');
    assert.strictEqual(accepted.restartRequired, true);
    assert.strictEqual(fs.readFileSync(targetPath, 'utf8'), newContent);
    assert.ok(assetRequests >= 2, 'Patch package must be downloaded over HTTP');

    const backupFiles = findFiles(backupRoot);
    assert.ok(
      backupFiles.some(file => fs.readFileSync(file, 'utf8') === oldContent),
      'Original resource must be backed up before replacement'
    );

    await stopServer(first.child);
    first = null;

    const secondPort = await reservePort();
    second = await startMineradioServer(secondPort, publicPem);
    const restarted = await requestJson(`${second.baseUrl}/api/app/version`);
    assert.strictEqual(restarted.version, '1.1.1');
    assert.strictEqual(restarted.update.patchSigningConfigured, true);
    assert.strictEqual(fs.readFileSync(targetPath, 'utf8'), newContent, 'Applied resource must survive server restart');

    console.log('[update-patch-e2e-test] HTTP download, signature rejection, verified apply, backup and restart persistence passed.');
  } finally {
    if (first) await stopServer(first.child);
    if (second) await stopServer(second.child);
    assetServer.close();
    await once(assetServer, 'close').catch(() => {});
  }
}

run().catch(error => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
}).finally(async () => {
  for (const child of Array.from(serverChildren)) await stopServer(child);
  try { fs.rmSync(targetDirectory, { recursive: true, force: true }); } catch (_) {}
  try { fs.rmSync(workspace, { recursive: true, force: true }); } catch (_) {}
});
