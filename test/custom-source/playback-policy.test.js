const test = require('node:test');
const assert = require('node:assert/strict');
const { customSourcePolicy } = require('../../desktop/custom-source/protocol');

test('custom source is authoritative while active', () => {
  assert.equal(customSourcePolicy({ active: false, handled: false }), 'builtin');
  assert.equal(customSourcePolicy({ active: true, handled: true, url: 'https://audio.example/a.mp3' }), 'custom');
  assert.equal(customSourcePolicy({ active: true, handled: true, url: '' }), 'fallback');
});
