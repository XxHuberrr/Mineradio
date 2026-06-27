const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isPublicAddress,
  assertSafeProxyUrl,
  safeFetch,
} = require('../lib/security/proxy-target-policy');

test('classifies private and special-purpose addresses as unsafe', () => {
  for (const address of [
    '0.0.0.0',
    '127.0.0.1',
    '10.0.0.1',
    '100.64.0.1',
    '169.254.1.1',
    '172.16.0.1',
    '192.168.1.1',
    '224.0.0.1',
    '::',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
    'fe80::1',
    'ff02::1',
  ]) {
    assert.equal(isPublicAddress(address), false, address);
  }
  assert.equal(isPublicAddress('1.1.1.1'), true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
});

test('allows the 198.18 fake-IP range used by local TUN proxies', () => {
  assert.equal(isPublicAddress('198.18.26.235'), true);
});

test('rejects invalid schemes and URL credentials', async () => {
  await assert.rejects(assertSafeProxyUrl('file:///etc/passwd'), /PROXY_TARGET_INVALID/);
  await assert.rejects(assertSafeProxyUrl('https://user:pass@media.example/song'), /PROXY_TARGET_INVALID/);
});

test('rejects localhost and literal private targets without DNS', async () => {
  await assert.rejects(assertSafeProxyUrl('http://localhost/internal'), /PROXY_TARGET_PRIVATE/);
  await assert.rejects(assertSafeProxyUrl('http://127.0.0.1/internal'), /PROXY_TARGET_PRIVATE/);
  await assert.rejects(assertSafeProxyUrl('http://[::1]/internal'), /PROXY_TARGET_PRIVATE/);
});

test('rejects a hostname when any DNS result is private', async () => {
  await assert.rejects(
    assertSafeProxyUrl('https://media.example/song.mp3', {
      lookup: async () => [
        { address: '1.1.1.1', family: 4 },
        { address: '127.0.0.1', family: 4 },
      ],
    }),
    /PROXY_TARGET_PRIVATE/,
  );
});

test('accepts a public media URL', async () => {
  const url = await assertSafeProxyUrl('https://media.example/song.mp3', {
    lookup: async () => [{ address: '1.1.1.1', family: 4 }],
  });
  assert.equal(url.href, 'https://media.example/song.mp3');
});

test('revalidates redirect destinations before following', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return {
      status: 302,
      headers: new Map([['location', 'http://127.0.0.1/internal']]),
    };
  };
  await assert.rejects(safeFetch('https://media.example/song', {}, {
    fetchImpl,
    lookup: async () => [{ address: '1.1.1.1', family: 4 }],
  }), /PROXY_TARGET_PRIVATE/);
  assert.equal(calls, 1);
});

test('follows and revalidates a public relative redirect', async () => {
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(String(url));
    if (seen.length === 1) {
      return { status: 302, headers: new Map([['location', '/final.mp3']]) };
    }
    return { status: 200, headers: new Map() };
  };
  const response = await safeFetch('https://media.example/start', {}, {
    fetchImpl,
    lookup: async () => [{ address: '1.1.1.1', family: 4 }],
  });
  assert.equal(response.status, 200);
  assert.deepEqual(seen, [
    'https://media.example/start',
    'https://media.example/final.mp3',
  ]);
});
