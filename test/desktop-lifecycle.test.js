const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'main.js'), 'utf8');

test('main process imports and applies external URL policy', () => {
  assert.match(source, /require\(['"]\.\.\/lib\/security\/external-url-policy['"]\)/);
  assert.match(source, /isTrustedLoginUrl\(url, QQ_LOGIN_DOMAINS\)/);
  assert.match(source, /isTrustedLoginUrl\(url, NETEASE_LOGIN_DOMAINS\)/);
  assert.match(source, /openSafeExternalUrl\(url\)/);
  assert.equal((source.match(/shell\.openExternal\(/g) || []).length, 1);
});

test('desktop lyrics window close stops its mouse poller', () => {
  const closedHandler = source.match(/desktopLyricsWindow\.on\('closed', \(\) => \{([\s\S]*?)\n  \}\);/);
  assert.ok(closedHandler);
  assert.match(closedHandler[1], /stopDesktopLyricsMousePoller\(\)/);
});
