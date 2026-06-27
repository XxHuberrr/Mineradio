const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

const POST_ROUTES = new Set([
  '/api/update/download',
  '/api/update/patch',
  '/api/qq/login/cookie',
  '/api/qq/logout',
  '/api/login/cookie',
  '/api/logout',
  '/api/song/like',
  '/api/playlist/create',
  '/api/playlist/add-song',
]);

function headerValue(headers, name) {
  const value = headers && headers[name];
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

function normalizeHostname(value) {
  return String(value || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
}

function parseAuthority(value) {
  try {
    const url = new URL(`http://${String(value || '').trim()}`);
    return {
      hostname: normalizeHostname(url.hostname),
      port: url.port,
    };
  } catch (_) {
    return null;
  }
}

function authorityAllowed(authority, port) {
  return !!authority
    && LOOPBACK_HOSTS.has(authority.hostname)
    && authority.port === String(port);
}

function evaluateLocalRequest(req, options = {}) {
  const headers = (req && req.headers) || {};
  const port = Number(options.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, error: 'LOCAL_API_CONFIG_INVALID' };
  }

  const host = parseAuthority(headerValue(headers, 'host'));
  if (!authorityAllowed(host, port)) {
    return { ok: false, error: 'LOCAL_API_HOST_DENIED' };
  }

  const fetchSite = headerValue(headers, 'sec-fetch-site').trim().toLowerCase();
  if (fetchSite === 'cross-site') {
    return { ok: false, error: 'LOCAL_API_CROSS_SITE_DENIED' };
  }

  const originValue = headerValue(headers, 'origin').trim();
  if (originValue) {
    let origin;
    try {
      const parsed = new URL(originValue);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('invalid origin');
      origin = {
        hostname: normalizeHostname(parsed.hostname),
        port: parsed.port || (parsed.protocol === 'https:' ? '443' : '80'),
      };
    } catch (_) {
      return { ok: false, error: 'LOCAL_API_ORIGIN_DENIED' };
    }
    if (!authorityAllowed(origin, port)) {
      return { ok: false, error: 'LOCAL_API_ORIGIN_DENIED' };
    }
  }

  return { ok: true };
}

function requiredMethodFor(pathname) {
  return POST_ROUTES.has(String(pathname || '')) ? 'POST' : '';
}

module.exports = {
  evaluateLocalRequest,
  requiredMethodFor,
};
