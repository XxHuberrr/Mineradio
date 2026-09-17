'use strict';

const { round } = require('./cue-profile');

// ── Named constants (replaces magic numbers) ──────────────────────────
const BOUNDARY_DISTANCE_LIMIT_SEC = 0.1;
const MIN_CONFIDENCE = 0.72;
const SILENCE_AFTER_MS_FLOOR = 120;
const SILENCE_AFTER_DB_CEILING = -45;
const LEVEL_DROP_DB_FLOOR = 3;
const SPECTRAL_CHANGE_FLOOR = 0.65;
const MAX_REASONS = 8;

const CROSSFADE_FOREGROUND_MIN = 0.8;
const CROSSFADE_FOREGROUND_MAX = 1.6;
const CROSSFADE_FOREGROUND_DEFAULT = 0.8;
const CROSSFADE_BACKGROUND_MIN = 0.8;
const CROSSFADE_BACKGROUND_MAX = 3;
const CROSSFADE_BACKGROUND_DEFAULT = 2;
const MIN_CROSSFADE_SEC = 0.05;

// ── Vocal-state helpers ───────────────────────────────────────────────
const KNOWN_VOCAL_STATES = new Set(['ended', 'active', 'unknown', 'inactive']);

function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

// ── Source-family lookup (Map for O(1) lookup) ────────────────────────
const SOURCE_FAMILY_MAP = new Map([
  ['lyric', 'lyric'], ['lyrics', 'lyric'], ['lrc', 'lyric'],
  ['audio-envelope', 'audio-envelope'], ['rms', 'audio-envelope'], ['level', 'audio-envelope'],
  ['spectral-change', 'spectral-change'], ['spectrum', 'spectral-change'],
  ['beat-grid', 'beat-grid'], ['bar', 'beat-grid'], ['downbeat', 'beat-grid'],
  ['section', 'section'], ['structure', 'section'],
  ['stem', 'stem'], ['vocal-stem', 'stem'], ['accompaniment-stem', 'stem'],
]);

function sourceFamily(value) {
  const source = String(value || '').trim().toLowerCase();
  return SOURCE_FAMILY_MAP.get(source) || '';
}

function evidenceFamilies(value) {
  return Array.from(new Set((Array.isArray(value) ? value : [])
    .map(sourceFamily)
    .filter(Boolean)));
}

function normalizedVocalState(value) {
  const state = String(value || '').trim().toLowerCase();
  return KNOWN_VOCAL_STATES.has(state) ? state : 'unknown';
}

// ── Cadence boundary evaluation ────────────────────────────────────────
function evaluateCadenceBoundary(evidence = {}, context = {}) {
  const reasons = [];
  const confidence = finiteOrNull(evidence.confidence);
  const audioDistance = finiteOrNull(evidence.audioBoundaryDistance);
  const barDistance = finiteOrNull(evidence.barBoundaryDistance);
  const before = finiteOrNull(evidence.levelBeforeDb);
  const after = finiteOrNull(evidence.levelAfterDb);
  const spectralChange = finiteOrNull(evidence.spectralChange);
  const silenceAfterMs = finiteOrNull(evidence.silenceAfterMs);
  const silenceAfterDb = finiteOrNull(evidence.silenceAfterDb);
  const vocalState = normalizedVocalState(evidence.vocalState);
  const families = evidenceFamilies(evidence.sources);
  const supportFamilies = families.filter((family) => family !== 'lyric');
  const hasAudio = families.some((family) => (
    family === 'audio-envelope' || family === 'spectral-change' || family === 'stem'
  ));
  const hasBar = families.includes('beat-grid');

  if (!hasAudio || audioDistance === null || audioDistance > BOUNDARY_DISTANCE_LIMIT_SEC) {
    reasons.push('audio-boundary-missing');
  }
  if (!hasBar || barDistance === null || barDistance > BOUNDARY_DISTANCE_LIMIT_SEC) {
    reasons.push('bar-boundary-missing');
  }
  if (supportFamilies.length < 2) reasons.push('evidence-consensus-missing');
  if (confidence === null || confidence < MIN_CONFIDENCE) reasons.push('boundary-confidence-low');
  if (vocalState === 'active') reasons.push('vocal-active');
  if (vocalState === 'unknown' && context.timedVocalSection === true) {
    const measuredSilence = silenceAfterMs !== null
      && silenceAfterMs >= SILENCE_AFTER_MS_FLOOR
      && silenceAfterDb !== null
      && silenceAfterDb <= SILENCE_AFTER_DB_CEILING;
    if (!measuredSilence) reasons.push('vocal-state-unknown');
  }

  const levelDrop = before === null || after === null ? null : before - after;
  const strongSectionChange = spectralChange !== null
    && spectralChange >= SPECTRAL_CHANGE_FLOOR
    && families.includes('section');
  if (levelDrop === null || (levelDrop < LEVEL_DROP_DB_FLOOR && !strongSectionChange)) {
    reasons.push('post-boundary-energy-continues');
  }

  return {
    eligible: reasons.length === 0,
    confidence: confidence === null ? 0 : round(Math.max(0, Math.min(1, confidence))),
    reasons: Array.from(new Set(reasons)).slice(0, MAX_REASONS),
  };
}

// ── Crossfade duration calculation ────────────────────────────────────
function chooseEndCrossfadeDuration(options = {}) {
  const fromAvailable = Math.max(0, finiteOrNull(options.fromAvailable) || 0);
  const toDuration = Math.max(0, finiteOrNull(options.toDuration) || 0);
  const fromVocalState = normalizedVocalState(options.fromVocalState);
  const toVocalState = normalizedVocalState(options.toVocalState);
  const foregroundSafe = fromVocalState === 'inactive' && toVocalState === 'inactive';
  const requested = finiteOrNull(options.requestedDuration);
  const target = foregroundSafe
    ? Math.max(CROSSFADE_BACKGROUND_MIN, Math.min(CROSSFADE_BACKGROUND_MAX, requested === null ? CROSSFADE_BACKGROUND_DEFAULT : requested))
    : Math.max(CROSSFADE_FOREGROUND_MIN, Math.min(CROSSFADE_FOREGROUND_MAX, requested === null ? CROSSFADE_FOREGROUND_DEFAULT : requested));
  return Math.max(MIN_CROSSFADE_SEC, round(Math.min(target, fromAvailable, toDuration)));
}

module.exports = {
  evaluateCadenceBoundary,
  chooseEndCrossfadeDuration,
};