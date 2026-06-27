const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isSafeExternalUrl,
  isTrustedLoginUrl,
} = require('../lib/security/external-url-policy');

test('allows only HTTP and HTTPS external URLs', () => {
  assert.equal(isSafeExternalUrl('https://example.com/path'), true);
  assert.equal(isSafeExternalUrl('http://example.com/path'), true);
  assert.equal(isSafeExternalUrl('javascript:alert(1)'), false);
  assert.equal(isSafeExternalUrl('data:text/html,test'), false);
  assert.equal(isSafeExternalUrl('file:///tmp/test'), false);
  assert.equal(isSafeExternalUrl('not a url'), false);
});

test('matches trusted login hosts without accepting lookalikes', () => {
  assert.equal(isTrustedLoginUrl('https://y.qq.com/n/ryqq/profile', ['qq.com']), true);
  assert.equal(isTrustedLoginUrl('https://xui.ptlogin2.qq.com/login', ['qq.com']), true);
  assert.equal(isTrustedLoginUrl('https://music.163.com/login', ['163.com']), true);
  assert.equal(isTrustedLoginUrl('https://qq.com.attacker.example/', ['qq.com']), false);
  assert.equal(isTrustedLoginUrl('https://evilqq.com/', ['qq.com']), false);
  assert.equal(isTrustedLoginUrl('javascript:alert(1)', ['qq.com']), false);
});
