'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('the analyser reconnects when the Apple SPA replaces its audio element', () => {
  const hookSource = fs.readFileSync(path.join(__dirname, '../desktop/apple-music-web-hook.js'), 'utf8');
  const firstPlayer = { addEventListener() {} };
  const secondPlayer = { addEventListener() {} };
  let currentPlayer = firstPlayer;
  const attachedPlayers = [];

  class FakeAudioContext {
    constructor() { this.destination = {}; this.state = 'running'; }
    createMediaElementSource(player) {
      attachedPlayers.push(player);
      return { connect() {}, disconnect() {} };
    }
    createAnalyser() {
      return {
        fftSize: 0,
        smoothingTimeConstant: 0,
        frequencyBinCount: 1024,
        connect() {},
        disconnect() {},
        getByteFrequencyData() {},
      };
    }
    resume() { return Promise.resolve(); }
  }

  const musicKit = {
    addEventListener() {},
    isAuthorized: false,
    isPlaying: false,
    storefrontId: 'cn',
    currentPlaybackTime: 0,
    currentPlaybackDuration: 0,
  };
  const window = {
    location: { origin: 'https://music.apple.com' },
    MusicKit: { getInstance: () => musicKit },
    AudioContext: FakeAudioContext,
    postMessage() {},
    requestAnimationFrame() {},
  };
  const context = {
    window,
    document: {
      getElementById: () => currentPlayer,
      querySelector: () => null,
    },
    setInterval() {},
    Uint8Array,
  };

  vm.runInNewContext(hookSource, context);
  assert.deepEqual(attachedPlayers, [firstPlayer]);
  currentPlayer = secondPlayer;
  window.__mineradioAppleMusic.refresh();
  assert.deepEqual(attachedPlayers, [firstPlayer, secondPlayer]);
  currentPlayer = firstPlayer;
  window.__mineradioAppleMusic.refresh();
  assert.deepEqual(attachedPlayers, [firstPlayer, secondPlayer]);

  const descriptor = Object.getOwnPropertyDescriptor(window, '__mineradioAppleMusic');
  assert.equal(descriptor.writable, false);
  assert.equal(Object.isFrozen(window.__mineradioAppleMusic), true);
});
