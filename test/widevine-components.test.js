'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createWidevineComponentsInitializer } = require('../desktop/widevine-components');

test('Widevine initialization is lazy and shared by all callers', async () => {
  let whenReadyCalls = 0;
  let release;
  const ready = new Promise((resolve) => { release = resolve; });
  const components = {
    whenReady: () => {
      whenReadyCalls += 1;
      return ready;
    },
    status: () => ({ widevine: { title: 'Widevine', version: '1.2.3', status: 'ready' } }),
  };
  const messages = [];
  const ensureReady = createWidevineComponentsInitializer(components, {
    log: (message) => messages.push(message),
    warn: (message) => messages.push(message),
  });

  assert.equal(whenReadyCalls, 0);
  const first = ensureReady();
  const second = ensureReady();
  assert.equal(first, second);
  assert.equal(whenReadyCalls, 1);

  release();
  const result = await first;
  assert.equal(result.ok, true);
  assert.equal(result.cdm.version, '1.2.3');
  assert.match(messages[0], /Widevine CDM ready/);
});

test('Widevine initialization degrades cleanly on stock Electron', async () => {
  const warnings = [];
  const ensureReady = createWidevineComponentsInitializer(null, {
    log: () => {},
    warn: (message) => warnings.push(message),
  });

  assert.deepEqual(await ensureReady(), { ok: false, unavailable: true });
  assert.match(warnings[0], /unavailable/i);
});

test('Widevine initialization can retry after a transient failure', async () => {
  let attempts = 0;
  const components = {
    whenReady: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('temporary failure');
    },
    status: () => ({ widevine: { title: 'Widevine', version: '1.2.3', status: 'ready' } }),
  };
  const ensureReady = createWidevineComponentsInitializer(components, {
    log() {},
    warn() {},
  });

  assert.equal((await ensureReady()).ok, false);
  assert.equal((await ensureReady()).ok, true);
  assert.equal(attempts, 2);
});
