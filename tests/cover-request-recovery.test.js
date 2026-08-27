'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const coverSource = fs.readFileSync(path.join(root, 'public/js/modules/05-playback/01-cover-custom-map.js'), 'utf8');
const queueSource = fs.readFileSync(path.join(root, 'public/js/modules/06-lyrics/01-playlist-panel-shell.js'), 'utf8');
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

function signedCoverUrl(id, expiresAtMs) {
  const start = Math.floor((expiresAtMs - 3600000) / 1000);
  const end = Math.floor(expiresAtMs / 1000);
  return `https://covers.example/${id}.jpg?q-sign-algorithm=sha1&q-sign-time=${start}%3B${end}`;
}

function createCoverRuntime(apiJson) {
  const context = {
    console: { warn() {} },
    URL,
    Date,
    Promise,
    encodeURIComponent,
    setTimeout,
    clearTimeout,
    window: { location: { href: 'http://127.0.0.1:3000/' } },
    document: {
      getElementById() { return null; },
    },
    localStorage: {
      getItem() { return null; },
      setItem() {},
    },
    CUSTOM_COVER_STORE_KEY: 'covers',
    customCoverMap: {},
    homeDiscoverState: { loading: false },
    playQueue: [],
    currentLocalSong: null,
    apiJson,
    renderQueuePanel() {},
    saveLastPlaybackSnapshot() {},
  };
  vm.createContext(context);
  vm.runInContext(coverSource, context);
  return context;
}

test('expired AI6666 covers are refreshed once per stable song key', async () => {
  let calls = 0;
  const fresh = signedCoverUrl('fresh', Date.now() + 3600000);
  const runtime = createCoverRuntime(async () => {
    calls += 1;
    await new Promise(resolve => setTimeout(resolve, 10));
    return { song: { cover: fresh } };
  });
  const song = {
    provider: 'ai6666',
    id: 'song-1',
    ai6666Id: 'song-1',
    cover: signedCoverUrl('expired', Date.now() - 3600000),
  };
  runtime.playQueue.push(song);

  for (let i = 0; i < 8; i += 1) assert.strictEqual(runtime.songCoverSrc(song, 60), '');
  assert.strictEqual(calls, 1, 'repeat renders must share one detail refresh request');
  await new Promise(resolve => setTimeout(resolve, 30));

  const src = runtime.songCoverSrc(song, 60);
  assert.match(src, /^\/api\/cover\?url=/);
  assert.ok(decodeURIComponent(src).includes('fresh.jpg'));
  assert.strictEqual(calls, 1);
});

test('AI6666 cover refresh queue has a hard concurrency limit', async () => {
  let active = 0;
  let peak = 0;
  let calls = 0;
  const runtime = createCoverRuntime(async url => {
    calls += 1;
    active += 1;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 15));
    active -= 1;
    const id = new URL(url, 'http://127.0.0.1').searchParams.get('id');
    return { song: { cover: signedCoverUrl(id, Date.now() + 3600000) } };
  });

  for (let i = 0; i < 9; i += 1) {
    const song = { provider: 'ai6666', id: `song-${i}`, ai6666Id: `song-${i}`, cover: '' };
    runtime.playQueue.push(song);
    runtime.songCoverSrc(song, 60);
  }
  await new Promise(resolve => setTimeout(resolve, 90));

  assert.strictEqual(calls, 9);
  assert.strictEqual(peak, 3);
  assert.strictEqual(runtime.coverRefreshActiveCount, 0);
  assert.strictEqual(runtime.coverRefreshQueue.length, 0);
});

test('failed cover refreshes enter backoff instead of retrying on redraw', async () => {
  let calls = 0;
  const runtime = createCoverRuntime(async () => {
    calls += 1;
    throw new Error('upstream unavailable');
  });
  const song = { provider: 'ai6666', id: 'failed-song', ai6666Id: 'failed-song', cover: '' };
  runtime.playQueue.push(song);

  runtime.songCoverSrc(song, 60);
  await new Promise(resolve => setTimeout(resolve, 10));
  for (let i = 0; i < 8; i += 1) runtime.songCoverSrc(song, 60);
  assert.strictEqual(calls, 1);
  assert.ok(runtime.coverRefreshStateByKey['ai6666:failed-song'].retryAt > Date.now());
});

test('queue errors use the recovery handler and proxy cache does not retain failures', () => {
  assert.strictEqual((queueSource.match(/handleQueueCoverImageError\(this,/g) || []).length, 2);
  assert.ok(!queueSource.includes('onerror="this.style.opacity=0.2"'), 'queue renderers must not keep the old passive error handler');
  assert.ok(serverSource.includes("signedCover ? 'public, max-age=31536000, immutable' : 'public, max-age=86400'"));
  assert.ok(serverSource.includes("resp.ok"));
  assert.ok(serverSource.includes(": 'no-store'"));
  assert.ok(serverSource.includes("res.writeHead(500, { 'Cache-Control': 'no-store' })"));
});
