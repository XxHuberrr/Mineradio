'use strict';

function parseHttpUrl(value) {
  try {
    const parsed = new URL(String(value));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed : null;
  } catch (error) {
    return null;
  }
}

function isSafeExternalUrl(value) {
  return !!parseHttpUrl(value);
}

function isTrustedLoginUrl(value, allowedDomains) {
  const parsed = parseHttpUrl(value);
  if (!parsed || !Array.isArray(allowedDomains)) return false;
  const hostname = parsed.hostname.toLowerCase();
  return allowedDomains.some((domain) => {
    const normalized = String(domain).toLowerCase();
    return hostname === normalized || hostname.endsWith(`.${normalized}`);
  });
}

module.exports = {
  isSafeExternalUrl,
  isTrustedLoginUrl,
};
