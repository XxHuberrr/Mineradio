'use strict';

const SUPPORTED_COMMANDS = new Set([
  'status',
  'search',
  'playSong',
  'play',
  'pause',
  'toggle',
  'next',
  'previous',
  'seek',
  'setVolume',
]);

const SUPPORTED_EVENTS = new Set([
  'ready',
  'status',
  'now-playing',
  'playback',
  'spectrum',
  'error',
]);

const SAFE_ERROR_MESSAGES = Object.freeze({
  APPLE_MUSIC_HOOK_FAILED: 'Apple Music bridge could not be initialized.',
  APPLE_MUSIC_RENDERER_GONE: 'Apple Music renderer stopped.',
  APPLE_MUSIC_PLAYBACK_ERROR: 'Apple Music playback failed.',
  APPLE_MUSIC_ANALYSER_UNAVAILABLE: 'Apple Music audio analysis is unavailable.',
  APPLE_MUSIC_BRIDGE_NOT_READY: 'Apple Music bridge is not ready.',
  MUSICKIT_NOT_READY: 'Apple Music is not ready.',
  APPLE_MUSIC_COMMAND_INVALID: 'Apple Music command was rejected.',
  APPLE_MUSIC_COMMAND_FAILED: 'Apple Music command failed.',
  APPLE_MUSIC_OPERATION_FAILED: 'Apple Music operation failed.',
});

function clamp(value, min, max, fallback = min) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function shortText(value, maxLength = 256) {
  return String(value == null ? '' : value).trim().slice(0, maxLength);
}

function normalizeCommand(command, payload = {}) {
  const name = shortText(command, 40);
  if (!SUPPORTED_COMMANDS.has(name)) {
    throw new Error(`Unsupported Apple Music command: ${name || '(empty)'}`);
  }

  const clean = {};
  if (name === 'search') {
    clean.query = shortText(payload.query, 200);
    clean.limit = Math.round(clamp(payload.limit, 1, 25, 10));
    if (!clean.query) throw new Error('Apple Music search query is required');
  } else if (name === 'playSong') {
    clean.id = shortText(payload.id, 256);
    if (!clean.id || clean.id.length > 255) throw new Error('A valid Apple Music song id is required');
  } else if (name === 'seek') {
    clean.seconds = clamp(payload.seconds, 0, 24 * 60 * 60, 0);
  } else if (name === 'setVolume') {
    clean.volume = clamp(payload.volume, 0, 1, 1);
  }

  return { command: name, payload: clean };
}

function jsonForInlineScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function buildCommandScript(command, payload) {
  const request = normalizeCommand(command, payload);
  return `(() => {
    const bridge = window.__mineradioAppleMusic;
    if (!bridge || typeof bridge.command !== 'function') {
      return { ok: false, error: 'APPLE_MUSIC_BRIDGE_NOT_READY' };
    }
    return bridge.command(${jsonForInlineScript(request)});
  })()`;
}

function normalizeArtwork(value) {
  const url = shortText(value, 2048);
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !(
      parsed.hostname === 'mzstatic.com'
      || parsed.hostname.endsWith('.mzstatic.com')
    )) return '';
    return url.replace('{w}', '512').replace('{h}', '512');
  } catch (_) {
    return '';
  }
}

function safeErrorCode(value, fallback = 'APPLE_MUSIC_OPERATION_FAILED') {
  const code = shortText(value, 80);
  return Object.hasOwn(SAFE_ERROR_MESSAGES, code) ? code : fallback;
}

function normalizeSong(input) {
  const source = input && typeof input === 'object' ? input : {};
  const id = shortText(source.id, 256);
  if (!id || id.length > 255) return null;
  return {
    id,
    name: shortText(source.name, 512),
    artist: shortText(source.artist, 512),
    album: shortText(source.album, 512),
    artwork: normalizeArtwork(source.artwork),
    duration: clamp(source.duration, 0, 24 * 60 * 60, 0),
  };
}

function normalizeCommandResponse(command, input) {
  const name = shortText(command, 40);
  if (!SUPPORTED_COMMANDS.has(name)) {
    return { ok: false, error: 'APPLE_MUSIC_COMMAND_INVALID' };
  }
  const source = input && typeof input === 'object' ? input : {};
  if (source.ok !== true) {
    return {
      ok: false,
      error: safeErrorCode(source.error, 'APPLE_MUSIC_COMMAND_FAILED'),
    };
  }
  if (name === 'search') {
    return {
      ok: true,
      songs: (Array.isArray(source.songs) ? source.songs : [])
        .slice(0, 25)
        .map(normalizeSong)
        .filter(Boolean),
    };
  }
  if (name === 'status') {
    const status = normalizePageEvent(source.status);
    if (!status || status.type !== 'status') {
      return { ok: false, error: 'APPLE_MUSIC_COMMAND_FAILED' };
    }
    return { ok: true, status };
  }
  return { ok: true };
}

function normalizePageEvent(input) {
  const source = input && typeof input === 'object' ? input : {};
  const type = shortText(source.type, 40);
  if (!SUPPORTED_EVENTS.has(type)) return null;

  if (type === 'ready') return { type };
  if (type === 'status') {
    return {
      type,
      authorized: !!source.authorized,
      storefrontId: shortText(source.storefrontId, 16),
      isPlaying: !!source.isPlaying,
      audioContextState: shortText(source.audioContextState, 32),
      spectrumActive: !!source.spectrumActive,
    };
  }
  if (type === 'playback') {
    return {
      type,
      isPlaying: !!source.isPlaying,
      currentTime: clamp(source.currentTime, 0, 24 * 60 * 60, 0),
      duration: clamp(source.duration, 0, 24 * 60 * 60, 0),
    };
  }
  if (type === 'now-playing') {
    return {
      type,
      id: shortText(source.id, 256),
      name: shortText(source.name, 512),
      artist: shortText(source.artist, 512),
      album: shortText(source.album, 512),
      artwork: normalizeArtwork(source.artwork),
      duration: clamp(source.duration, 0, 24 * 60 * 60, 0),
    };
  }
  if (type === 'spectrum') {
    return {
      type,
      bins: (Array.isArray(source.bins) ? source.bins : [])
        .slice(0, 64)
        .map((value) => Math.round(clamp(value, 0, 255, 0))),
      energy: clamp(source.energy, 0, 1, 0),
      bass: clamp(source.bass, 0, 1, 0),
      mid: clamp(source.mid, 0, 1, 0),
      treble: clamp(source.treble, 0, 1, 0),
    };
  }
  return {
    type: 'error',
    code: safeErrorCode(source.code),
    message: SAFE_ERROR_MESSAGES[safeErrorCode(source.code)],
  };
}

module.exports = {
  SUPPORTED_COMMANDS,
  buildCommandScript,
  normalizeCommand,
  normalizeCommandResponse,
  normalizePageEvent,
};
