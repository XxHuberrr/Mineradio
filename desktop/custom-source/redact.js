const SECRET_KEY = /^(cookie|set-cookie|authorization|proxy-authorization|password|passwd|pwd|credentials?)$|token|secret|api[-_]?key/i;

function redactSecrets(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);
  if (Array.isArray(value)) return value.map(item => redactSecrets(item, seen));
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = SECRET_KEY.test(key) ? '[REDACTED]' : redactSecrets(item, seen);
  }
  return out;
}

module.exports = { redactSecrets };
