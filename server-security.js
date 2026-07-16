'use strict';

const dns = require('dns').promises;
const net = require('net');

const SAFE_COVER_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/bmp',
]);
const MAX_PROXY_REDIRECTS = 5;

function isLoopbackHostname(hostname) {
  const value = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  return value === 'localhost' || value.endsWith('.localhost') || value === '127.0.0.1' || value === '::1';
}

function isTrustedLocalApiRequest(req) {
  const host = String(req.headers.host || '').trim();
  try {
    const target = new URL('http://' + host);
    if (!isLoopbackHostname(target.hostname)) return false;
  } catch (_) {
    return false;
  }

  const fetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return false;

  const origin = String(req.headers.origin || '').trim();
  if (origin) {
    try {
      const parsed = new URL(origin);
      if (parsed.protocol !== 'http:' || parsed.host !== host) return false;
    } catch (_) {
      return false;
    }
  }
  return true;
}

function normalizeIpAddress(value) {
  let ip = String(value || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  const zoneIndex = ip.indexOf('%');
  if (zoneIndex >= 0) ip = ip.slice(0, zoneIndex);
  if (ip.startsWith('::ffff:')) {
    const mapped = ip.slice(7);
    if (net.isIPv4(mapped)) return mapped;
  }
  return ip;
}

function isBlockedIpAddress(value) {
  const ip = normalizeIpAddress(value);
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    const [a, b] = parts;
    return a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 0)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19))
      || a >= 224;
  }
  if (net.isIPv6(ip)) {
    return ip.startsWith('::')
      || ip.startsWith('fc')
      || ip.startsWith('fd')
      || ip.startsWith('fe')
      || ip.startsWith('ff')
      || ip.startsWith('2001:db8:');
  }
  return true;
}

async function assertSafeProxyUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || ''));
  } catch (_) {
    throw Object.assign(new Error('Invalid proxy url'), { code: 'INVALID_PROXY_URL' });
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw Object.assign(new Error('Unsupported proxy url'), { code: 'INVALID_PROXY_URL' });
  }
  if (isLoopbackHostname(parsed.hostname)) {
    throw Object.assign(new Error('Local proxy targets are blocked'), { code: 'UNSAFE_PROXY_URL' });
  }

  const directIp = normalizeIpAddress(parsed.hostname);
  if (net.isIP(directIp)) {
    if (isBlockedIpAddress(directIp)) {
      throw Object.assign(new Error('Private proxy targets are blocked'), { code: 'UNSAFE_PROXY_URL' });
    }
    return parsed;
  }

  let addresses;
  try {
    addresses = await dns.lookup(parsed.hostname, { all: true, verbatim: true });
  } catch (_) {
    throw Object.assign(new Error('Proxy host lookup failed'), { code: 'PROXY_DNS_FAILED' });
  }
  if (!addresses.length || addresses.some(item => isBlockedIpAddress(item.address))) {
    throw Object.assign(new Error('Private proxy targets are blocked'), { code: 'UNSAFE_PROXY_URL' });
  }
  return parsed;
}

async function fetchPublicResource(value, options) {
  let current = await assertSafeProxyUrl(value);
  for (let redirectCount = 0; redirectCount <= MAX_PROXY_REDIRECTS; redirectCount += 1) {
    const response = await fetch(current, { ...(options || {}), redirect: 'manual' });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location');
    if (!location) return response;
    if (response.body && typeof response.body.cancel === 'function') await response.body.cancel().catch(() => {});
    if (redirectCount === MAX_PROXY_REDIRECTS) {
      throw Object.assign(new Error('Too many proxy redirects'), { code: 'PROXY_REDIRECT_LIMIT' });
    }
    current = await assertSafeProxyUrl(new URL(location, current));
  }
  throw Object.assign(new Error('Too many proxy redirects'), { code: 'PROXY_REDIRECT_LIMIT' });
}

module.exports = {
  SAFE_COVER_CONTENT_TYPES,
  assertSafeProxyUrl,
  fetchPublicResource,
  isBlockedIpAddress,
  isTrustedLocalApiRequest,
};
