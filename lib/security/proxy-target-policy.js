const dns = require('node:dns/promises');
const net = require('node:net');

const blockedAddresses = new net.BlockList();

for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  // 198.18.0.0/15 is intentionally allowed for Clash/TUN fake-IP DNS.
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
]) {
  blockedAddresses.addSubnet(address, prefix, 'ipv4');
}

for (const [address, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001:10::', 28],
  ['2001:20::', 28],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
]) {
  blockedAddresses.addSubnet(address, prefix, 'ipv6');
}

function stripIpv6Brackets(value) {
  return String(value || '').trim().replace(/^\[|\]$/g, '');
}

function isPublicAddress(value) {
  const address = stripIpv6Brackets(value);
  const family = net.isIP(address);
  if (family === 4) return !blockedAddresses.check(address, 'ipv4');
  if (family === 6) return !blockedAddresses.check(address, 'ipv6');
  return false;
}

async function assertSafeProxyUrl(input, options = {}) {
  let url;
  try {
    url = input instanceof URL ? new URL(input.href) : new URL(String(input || ''));
  } catch (_) {
    throw new Error('PROXY_TARGET_INVALID');
  }

  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) {
    throw new Error('PROXY_TARGET_INVALID');
  }

  const hostname = stripIpv6Brackets(url.hostname).toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new Error('PROXY_TARGET_PRIVATE');
  }

  let addresses;
  if (net.isIP(hostname)) {
    addresses = [{ address: hostname }];
  } else {
    const lookup = options.lookup || dns.lookup;
    try {
      addresses = await lookup(hostname, { all: true, verbatim: true });
    } catch (_) {
      throw new Error('PROXY_TARGET_DNS_FAILED');
    }
  }

  if (!Array.isArray(addresses)) addresses = [addresses];
  if (!addresses.length || addresses.some(item => !isPublicAddress(item && item.address))) {
    throw new Error('PROXY_TARGET_PRIVATE');
  }

  return url;
}

async function safeFetch(input, fetchOptions = {}, policyOptions = {}) {
  const fetchImpl = policyOptions.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('PROXY_FETCH_UNAVAILABLE');
  const maxRedirects = Number.isInteger(policyOptions.maxRedirects) ? policyOptions.maxRedirects : 5;
  let current = input;

  for (let redirects = 0; redirects <= maxRedirects; redirects++) {
    const url = await assertSafeProxyUrl(current, policyOptions);
    const response = await fetchImpl(url.href, { ...fetchOptions, redirect: 'manual' });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    if (redirects === maxRedirects) throw new Error('PROXY_TOO_MANY_REDIRECTS');
    const location = response.headers && response.headers.get && response.headers.get('location');
    if (!location) throw new Error('PROXY_REDIRECT_INVALID');
    current = new URL(location, url);
  }

  throw new Error('PROXY_TOO_MANY_REDIRECTS');
}

module.exports = {
  isPublicAddress,
  assertSafeProxyUrl,
  safeFetch,
};
