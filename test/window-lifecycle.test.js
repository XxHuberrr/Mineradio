'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  closeAppleMusicWithMainWindow,
  shouldCreateMainWindow,
} = require('../desktop/window-lifecycle');

test('Apple Music closes with the Mineradio main window', () => {
  let closeCalls = 0;
  closeAppleMusicWithMainWindow({ close: () => { closeCalls += 1; } });
  closeAppleMusicWithMainWindow(null);
  assert.equal(closeCalls, 1);
});

test('Dock activation depends on the main window, not unrelated child windows', () => {
  assert.equal(shouldCreateMainWindow(null), true);
  assert.equal(shouldCreateMainWindow({ isDestroyed: () => true }), true);
  assert.equal(shouldCreateMainWindow({ isDestroyed: () => false }), false);
});
