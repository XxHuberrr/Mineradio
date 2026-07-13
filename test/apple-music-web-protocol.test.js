'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildCommandScript,
  normalizeCommand,
  normalizeCommandResponse,
  normalizePageEvent,
} = require('../desktop/apple-music-web-protocol');
const {
  APPLE_MUSIC_INFO_URL,
  APPLE_MUSIC_URL,
  buildBrowserUserAgent,
  classifyApplePopupUrl,
  isAllowedAppleAuthUrl,
  isAllowedAppleMusicUrl,
} = require('../desktop/apple-music-web-controller');

test('normalizes the supported command payloads', () => {
  assert.deepEqual(normalizeCommand('search', { query: '  Massive Attack  ', limit: 999 }), {
    command: 'search',
    payload: { query: 'Massive Attack', limit: 25 },
  });
  assert.deepEqual(normalizeCommand('seek', { seconds: -12 }), {
    command: 'seek',
    payload: { seconds: 0 },
  });
  assert.deepEqual(normalizeCommand('setVolume', { volume: 4 }), {
    command: 'setVolume',
    payload: { volume: 1 },
  });
});

test('rejects unknown commands and invalid song identifiers', () => {
  assert.throws(() => normalizeCommand('exportCookies', {}), /unsupported/i);
  assert.throws(() => normalizeCommand('playSong', { id: '' }), /song id/i);
  assert.throws(() => normalizeCommand('playSong', { id: 'x'.repeat(257) }), /song id/i);
});

test('embeds untrusted search text as JSON data', () => {
  const script = buildCommandScript('search', {
    query: "<script>'); globalThis.pwned = true; ('</script>",
    limit: 5,
  });

  assert.match(script, /bridge\.command/);
  assert.match(script, /globalThis\.pwned/);
  assert.doesNotMatch(script, /command\('\);/);
  assert.match(script, /\\u003c/);
});

test('page events expose only bounded non-secret fields', () => {
  const event = normalizePageEvent({
    type: 'status',
    authorized: true,
    storefrontId: 'us',
    isPlaying: false,
    audioContextState: 'running',
    spectrumActive: true,
    developerToken: 'must-not-pass',
    musicUserToken: 'must-not-pass',
    cookies: ['must-not-pass'],
  });

  assert.deepEqual(event, {
    type: 'status',
    authorized: true,
    storefrontId: 'us',
    isPlaying: false,
    audioContextState: 'running',
    spectrumActive: true,
  });
});

test('command responses and errors cannot return credentials or protected URLs', () => {
  const search = normalizeCommandResponse('search', {
    ok: true,
    developerToken: 'must-not-pass',
    songs: [{
      id: '123',
      name: 'Safe song',
      artist: 'Safe artist',
      album: 'Safe album',
      artwork: 'https://is1-ssl.mzstatic.com/image/thumb/{w}x{h}/art.jpg',
      duration: 180,
      streamUrl: 'https://protected.example/manifest.m3u8?token=secret',
      musicUserToken: 'must-not-pass',
    }],
  });
  assert.deepEqual(search, {
    ok: true,
    songs: [{
      id: '123',
      name: 'Safe song',
      artist: 'Safe artist',
      album: 'Safe album',
      artwork: 'https://is1-ssl.mzstatic.com/image/thumb/512x512/art.jpg',
      duration: 180,
    }],
  });

  assert.deepEqual(normalizeCommandResponse('play', {
    ok: false,
    error: 'https://protected.example/error?token=secret',
  }), {
    ok: false,
    error: 'APPLE_MUSIC_COMMAND_FAILED',
  });

  assert.deepEqual(normalizePageEvent({
    type: 'error',
    code: 'APPLE_MUSIC_PLAYBACK_ERROR',
    message: 'failed at https://protected.example/manifest.m3u8?token=secret',
  }), {
    type: 'error',
    code: 'APPLE_MUSIC_PLAYBACK_ERROR',
    message: 'Apple Music playback failed.',
  });
});

test('spectrum data is clamped and capped at 64 bins', () => {
  const event = normalizePageEvent({
    type: 'spectrum',
    bins: Array.from({ length: 90 }, (_, index) => index * 8 - 10),
    energy: 4,
    bass: -1,
    mid: 0.5,
    treble: Number.NaN,
  });

  assert.equal(event.bins.length, 64);
  assert.equal(event.bins[0], 0);
  assert.equal(event.bins.at(-1), 255);
  assert.equal(event.energy, 1);
  assert.equal(event.bass, 0);
  assert.equal(event.mid, 0.5);
  assert.equal(event.treble, 0);
});

test('Apple player navigation is restricted to the HTTPS music host', () => {
  assert.equal(APPLE_MUSIC_INFO_URL, 'https://www.apple.com.cn/apple-music/');
  assert.equal(APPLE_MUSIC_URL, 'https://music.apple.com/cn');
  assert.equal(isAllowedAppleMusicUrl('https://music.apple.com/us/browse'), true);
  assert.equal(isAllowedAppleMusicUrl('http://music.apple.com/us/browse'), false);
  assert.equal(isAllowedAppleMusicUrl('https://music.apple.com.evil.example/'), false);
  assert.equal(isAllowedAppleMusicUrl('https://idmsa.apple.com/'), false);
});

test('official Apple authentication windows stay inside the persistent music session', () => {
  assert.equal(isAllowedAppleAuthUrl('https://auth.music.apple.com/auth'), true);
  assert.equal(isAllowedAppleAuthUrl('https://idmsa.apple.com/appleauth/auth/authorize/signin'), true);
  assert.equal(isAllowedAppleAuthUrl('http://idmsa.apple.com/'), false);
  assert.equal(isAllowedAppleAuthUrl('https://idmsa.apple.com.evil.example/'), false);

  assert.equal(classifyApplePopupUrl('https://music.apple.com/cn/new'), 'allow');
  assert.equal(classifyApplePopupUrl('https://idmsa.apple.com/appleauth/auth/authorize/signin'), 'allow');
  assert.equal(classifyApplePopupUrl('https://www.apple.com.cn/apple-music/'), 'external');
  assert.equal(classifyApplePopupUrl('javascript:alert(1)'), 'deny');
});

test('browser user agent does not identify Electron', () => {
  const userAgent = buildBrowserUserAgent('140.0.7339.0');
  assert.match(userAgent, /Chrome\/140\.0\.7339\.0/);
  assert.doesNotMatch(userAgent, /Electron|Mineradio/i);
});
