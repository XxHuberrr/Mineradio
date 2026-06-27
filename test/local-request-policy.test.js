const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  evaluateLocalRequest,
  requiredMethodFor,
} = require('../lib/security/local-request-policy');

test('allows a same-origin request to the active loopback port', () => {
  assert.deepEqual(evaluateLocalRequest({
    headers: {
      host: '127.0.0.1:34567',
      origin: 'http://127.0.0.1:34567',
      'sec-fetch-site': 'same-origin',
    },
  }, { port: 34567 }), { ok: true });
});

test('allows local diagnostics without browser origin metadata', () => {
  assert.deepEqual(evaluateLocalRequest({
    headers: { host: 'localhost:34567' },
  }, { port: 34567 }), { ok: true });
});

test('allows the active IPv6 loopback host', () => {
  assert.deepEqual(evaluateLocalRequest({
    headers: { host: '[::1]:34567', origin: 'http://[::1]:34567' },
  }, { port: 34567 }), { ok: true });
});

test('rejects a foreign browser origin', () => {
  assert.equal(evaluateLocalRequest({
    headers: { host: '127.0.0.1:34567', origin: 'https://attacker.example' },
  }, { port: 34567 }).error, 'LOCAL_API_ORIGIN_DENIED');
});

test('rejects cross-site fetch metadata even without Origin', () => {
  assert.equal(evaluateLocalRequest({
    headers: { host: '127.0.0.1:34567', 'sec-fetch-site': 'cross-site' },
  }, { port: 34567 }).error, 'LOCAL_API_CROSS_SITE_DENIED');
});

test('rejects a non-loopback Host header', () => {
  assert.equal(evaluateLocalRequest({
    headers: { host: '192.168.1.10:34567' },
  }, { port: 34567 }).error, 'LOCAL_API_HOST_DENIED');
});

test('rejects the wrong Host port', () => {
  assert.equal(evaluateLocalRequest({
    headers: { host: '127.0.0.1:3000' },
  }, { port: 34567 }).error, 'LOCAL_API_HOST_DENIED');
});

test('requires POST for state-changing routes', () => {
  for (const pathname of [
    '/api/update/download',
    '/api/update/patch',
    '/api/qq/login/cookie',
    '/api/qq/logout',
    '/api/login/cookie',
    '/api/logout',
    '/api/song/like',
    '/api/playlist/create',
    '/api/playlist/add-song',
  ]) {
    assert.equal(requiredMethodFor(pathname), 'POST', pathname);
  }
  assert.equal(requiredMethodFor('/api/search'), '');
});

test('server responses do not enable wildcard CORS', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.doesNotMatch(source, /Access-Control-Allow-Origin['"]?\s*:\s*['"]\*['"]/);
});
