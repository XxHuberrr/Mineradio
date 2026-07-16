'use strict';

const assert = require('assert');
const {
  assertSafeProxyUrl,
  isBlockedIpAddress,
  isTrustedLocalApiRequest,
} = require('../server-security');

function request(headers) {
  return { headers };
}

assert.strictEqual(isTrustedLocalApiRequest(request({
  host: '127.0.0.1:3000',
  origin: 'http://127.0.0.1:3000',
  'sec-fetch-site': 'same-origin',
})), true);
assert.strictEqual(isTrustedLocalApiRequest(request({
  host: '127.0.0.1:3000',
  origin: 'https://example.com',
  'sec-fetch-site': 'cross-site',
})), false);
assert.strictEqual(isTrustedLocalApiRequest(request({ host: '192.168.1.8:3000' })), false);

assert.strictEqual(isBlockedIpAddress('10.0.0.1'), true);
assert.strictEqual(isBlockedIpAddress('127.0.0.1'), true);
assert.strictEqual(isBlockedIpAddress('169.254.169.254'), true);
assert.strictEqual(isBlockedIpAddress('192.168.1.1'), true);
assert.strictEqual(isBlockedIpAddress('::1'), true);
assert.strictEqual(isBlockedIpAddress('::ffff:127.0.0.1'), true);
assert.strictEqual(isBlockedIpAddress('::ffff:7f00:1'), true);
assert.strictEqual(isBlockedIpAddress('fc00::1'), true);
assert.strictEqual(isBlockedIpAddress('93.184.216.34'), false);
assert.strictEqual(isBlockedIpAddress('2606:2800:220:1:248:1893:25c8:1946'), false);

async function expectBlocked(url) {
  await assert.rejects(
    assertSafeProxyUrl(url),
    error => error && error.code === 'UNSAFE_PROXY_URL'
  );
}

(async () => {
  await assertSafeProxyUrl('https://93.184.216.34/audio.mp3');
  await expectBlocked('http://127.0.0.1:3000/');
  await expectBlocked('http://10.0.0.1/file');
  await expectBlocked('http://[::1]/file');
  await expectBlocked('http://[::ffff:7f00:1]/file');

  const originalFetch = global.fetch;
  global.fetch = async () => ({
    status: 302,
    headers: { get: name => name.toLowerCase() === 'location' ? 'http://127.0.0.1/private' : null },
    body: { cancel: async () => {} },
  });
  try {
    const { fetchPublicResource } = require('../server-security');
    await assert.rejects(
      fetchPublicResource('https://93.184.216.34/redirect'),
      error => error && error.code === 'UNSAFE_PROXY_URL'
    );
  } finally {
    global.fetch = originalFetch;
  }

  console.log('[security-test] Local API and proxy guards passed.');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
