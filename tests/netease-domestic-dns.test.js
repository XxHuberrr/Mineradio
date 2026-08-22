'use strict';

// 回归测试：加速器劫持 UDP 53 DNS 时，网易云域名被解析到海外(香港)节点
// (overseasv4.music.ntes53.netease.com)，导致播放接口地区受限。
// server.js 必须用 HTTPS DoH（国内递归）解析网易云域名并注入
// axios(NeteaseCloudMusicApi) 与 undici(音频/封面/探针) 的 lookup。

const assert = require('assert');
const dns = require('dns');
const path = require('path');

const OVERSEAS_NODE_IPS = new Set(['103.135.240.77', '103.135.240.78']);

process.env.PORT = '0';
process.env.HOST = '127.0.0.1';
process.env.COOKIE_FILE = path.join(require('os').tmpdir(), 'mineradio-test-cookie-' + process.pid + '-dns');

const server = require('../server.js');
const { domesticLookup, resolveNeteaseViaDoH, NETEASE_DOMAIN_RE, dohCache } = server.__neteaseDomesticDns;

function lookupPromise(lookup, hostname, opts) {
  return new Promise((resolve, reject) => {
    lookup(hostname, opts || {}, (err, address, family) => {
      if (err) reject(err);
      else resolve({ address, family });
    });
  });
}

async function testDoHReturnsDomesticNode() {
  const ips = await resolveNeteaseViaDoH('music.163.com');
  assert.ok(Array.isArray(ips) && ips.length > 0, 'DoH must resolve music.163.com, got: ' + JSON.stringify(ips));
  for (const ip of ips) {
    assert.ok(/^\d+\.\d+\.\d+\.\d+$/.test(ip), 'DoH answer must be a valid IPv4: ' + ip);
    assert.ok(!OVERSEAS_NODE_IPS.has(ip), 'DoH must not return the overseas (HK) node: ' + ip);
  }
}

async function testDoHCacheWorks() {
  dohCache.clear();
  const first = await resolveNeteaseViaDoH('p1.music.126.net');
  assert.ok(first.length > 0, 'DoH must resolve p1.music.126.net, got: ' + JSON.stringify(first));
  const cached = dohCache.get('p1.music.126.net');
  assert.ok(cached && cached.ips.length > 0 && cached.expiresAt > Date.now(), 'DoH result must be cached with TTL');
}

async function testLookupInjection() {
  const axios = require('axios');
  assert.strictEqual(axios.defaults.lookup, domesticLookup, 'axios defaults must carry domesticLookup (NeteaseCloudMusicApi)');

  const undici = require('undici');
  const dispatcher = undici.getGlobalDispatcher();
  const optionsSymbol = Object.getOwnPropertySymbols(dispatcher).find((s) => s.toString() === 'Symbol(options)');
  assert.ok(optionsSymbol, 'undici dispatcher must expose its internal options symbol');
  const internalOptions = dispatcher[optionsSymbol] || {};
  assert.ok(
    internalOptions.connect && typeof internalOptions.connect.lookup === 'function',
    'global undici dispatcher must carry a lookup in connect options (audio/cover/probe fetch)'
  );
  assert.strictEqual(
    internalOptions.connect.lookup,
    domesticLookup,
    'undici connect.lookup must be domesticLookup itself'
  );
}

async function testLookupDomesticHost() {
  const resolved = await lookupPromise(domesticLookup, 'music.163.com');
  assert.ok(/^\d+\.\d+\.\d+\.\d+$/.test(resolved.address), 'domesticLookup must return an IPv4 for music.163.com');
  assert.ok(!OVERSEAS_NODE_IPS.has(resolved.address), 'domesticLookup must not return the overseas node');
}

async function testLookupForeignHostFallsBackToSystem() {
  const resolved = await lookupPromise(domesticLookup, 'localhost');
  assert.ok(
    ['127.0.0.1', '::1'].includes(resolved.address),
    'non-Netease hosts must use system lookup, got: ' + resolved.address
  );
}

async function testDomainMatcher() {
  assert.ok(NETEASE_DOMAIN_RE.test('music.163.com'), 'music.163.com must match');
  assert.ok(NETEASE_DOMAIN_RE.test('interface.music.163.com'), 'interface.music.163.com must match');
  assert.ok(NETEASE_DOMAIN_RE.test('m701.music.126.net'), 'audio CDN host must match');
  assert.ok(NETEASE_DOMAIN_RE.test('p1.music.126.net'), 'cover CDN host must match');
  assert.ok(NETEASE_DOMAIN_RE.test('music.163.com.163jiasu.com'), '163jiasu CNAME must match');
  assert.ok(!NETEASE_DOMAIN_RE.test('example.com'), 'example.com must not match');
  assert.ok(!NETEASE_DOMAIN_RE.test('qq.com'), 'qq.com must not match');
}

(async () => {
  await new Promise((resolve) => server.once('listening', resolve));

  // Diagnostic: show the hijack contrast in test output
  await new Promise((resolve) => dns.resolve4('music.163.com', (err, addrs) => {
    console.log('[DomesticDNS-test] system DNS resolves music.163.com ->', err ? err.code : (addrs || []).join(', '));
    resolve();
  }));
  const dohIps = await resolveNeteaseViaDoH('music.163.com');
  console.log('[DomesticDNS-test] DoH resolves music.163.com ->', dohIps.join(', '));

  await testDoHReturnsDomesticNode();
  await testDoHCacheWorks();
  await testLookupInjection();
  await testLookupDomesticHost();
  await testLookupForeignHostFallsBackToSystem();
  await testDomainMatcher();

  server.close();
  console.log('netease-domestic-dns: all checks passed');
  process.exit(0);
})().catch((err) => {
  console.error('netease-domestic-dns: FAILED —', err.message);
  process.exit(1);
});
