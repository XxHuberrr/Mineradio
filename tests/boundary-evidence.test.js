'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  evaluateCadenceBoundary,
  chooseEndCrossfadeDuration,
} = require('../cuefield/boundary-evidence');

// ── evaluateCadenceBoundary ───────────────────────────────────────────

test('evaluateCadenceBoundary: returns ineligible when evidence is empty', () => {
  const result = evaluateCadenceBoundary({}, {});
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.length > 0);
});

test('evaluateCadenceBoundary: eligible when all criteria met', () => {
  const result = evaluateCadenceBoundary({
    confidence: 0.85,
    audioBoundaryDistance: 0.02,
    barBoundaryDistance: 0.03,
    levelBeforeDb: -6,
    levelAfterDb: -12,
    spectralChange: 0.7,
    vocalState: 'inactive',
    sources: ['audio-envelope', 'beat-grid', 'section'],
  }, { timedVocalSection: false });
  assert.equal(result.eligible, true);
  assert.equal(result.reasons.length, 0);
  assert.equal(result.confidence, 0.85);
});

test('evaluateCadenceBoundary: audio-boundary-missing when no audio source', () => {
  const result = evaluateCadenceBoundary({
    confidence: 0.9,
    audioBoundaryDistance: 0.02,
    barBoundaryDistance: 0.02,
    levelBeforeDb: -6,
    levelAfterDb: -12,
    sources: ['lyric', 'beat-grid'],
  });
  assert.ok(result.reasons.includes('audio-boundary-missing'));
});

test('evaluateCadenceBoundary: audio-boundary-missing when distance > 0.1', () => {
  const result = evaluateCadenceBoundary({
    confidence: 0.9,
    audioBoundaryDistance: 0.15,
    barBoundaryDistance: 0.02,
    levelBeforeDb: -6,
    levelAfterDb: -12,
    sources: ['audio-envelope', 'beat-grid'],
  });
  assert.ok(result.reasons.includes('audio-boundary-missing'));
});

test('evaluateCadenceBoundary: bar-boundary-missing when no beat-grid source', () => {
  const result = evaluateCadenceBoundary({
    confidence: 0.9,
    audioBoundaryDistance: 0.02,
    barBoundaryDistance: 0.02,
    levelBeforeDb: -6,
    levelAfterDb: -12,
    sources: ['audio-envelope', 'spectral-change'],
  });
  assert.ok(result.reasons.includes('bar-boundary-missing'));
});

test('evaluateCadenceBoundary: boundary-confidence-low when confidence < 0.72', () => {
  const result = evaluateCadenceBoundary({
    confidence: 0.5,
    audioBoundaryDistance: 0.02,
    barBoundaryDistance: 0.02,
    levelBeforeDb: -6,
    levelAfterDb: -12,
    sources: ['audio-envelope', 'beat-grid', 'section'],
  });
  assert.ok(result.reasons.includes('boundary-confidence-low'));
});

test('evaluateCadenceBoundary: vocal-active rejects boundary', () => {
  const result = evaluateCadenceBoundary({
    confidence: 0.9,
    audioBoundaryDistance: 0.02,
    barBoundaryDistance: 0.02,
    levelBeforeDb: -6,
    levelAfterDb: -12,
    vocalState: 'active',
    sources: ['audio-envelope', 'beat-grid', 'section'],
  });
  assert.ok(result.reasons.includes('vocal-active'));
});

test('evaluateCadenceBoundary: vocal-state-unknown in timed section without silence', () => {
  const result = evaluateCadenceBoundary({
    confidence: 0.9,
    audioBoundaryDistance: 0.02,
    barBoundaryDistance: 0.02,
    levelBeforeDb: -6,
    levelAfterDb: -12,
    vocalState: 'unknown',
    silenceAfterMs: 50,
    silenceAfterDb: -30,
    sources: ['audio-envelope', 'beat-grid', 'section'],
  }, { timedVocalSection: true });
  assert.ok(result.reasons.includes('vocal-state-unknown'));
});

test('evaluateCadenceBoundary: vocal-state-unknown passes with sufficient silence', () => {
  const result = evaluateCadenceBoundary({
    confidence: 0.9,
    audioBoundaryDistance: 0.02,
    barBoundaryDistance: 0.02,
    levelBeforeDb: -6,
    levelAfterDb: -12,
    vocalState: 'unknown',
    silenceAfterMs: 150,
    silenceAfterDb: -50,
    sources: ['audio-envelope', 'beat-grid', 'section'],
  }, { timedVocalSection: true });
  assert.ok(!result.reasons.includes('vocal-state-unknown'));
});

test('evaluateCadenceBoundary: evidence-consensus-missing when < 2 support families', () => {
  const result = evaluateCadenceBoundary({
    confidence: 0.9,
    audioBoundaryDistance: 0.02,
    barBoundaryDistance: 0.02,
    levelBeforeDb: -6,
    levelAfterDb: -12,
    sources: ['audio-envelope'],
  });
  assert.ok(result.reasons.includes('evidence-consensus-missing'));
});

test('evaluateCadenceBoundary: post-boundary-energy-continues when level drop < 3dB', () => {
  const result = evaluateCadenceBoundary({
    confidence: 0.9,
    audioBoundaryDistance: 0.02,
    barBoundaryDistance: 0.02,
    levelBeforeDb: -6,
    levelAfterDb: -7,
    sources: ['audio-envelope', 'beat-grid'],
  });
  assert.ok(result.reasons.includes('post-boundary-energy-continues'));
});

test('evaluateCadenceBoundary: strong section change overrides low level drop', () => {
  const result = evaluateCadenceBoundary({
    confidence: 0.9,
    audioBoundaryDistance: 0.02,
    barBoundaryDistance: 0.02,
    levelBeforeDb: -6,
    levelAfterDb: -7,
    spectralChange: 0.7,
    sources: ['audio-envelope', 'beat-grid', 'section'],
  });
  assert.ok(!result.reasons.includes('post-boundary-energy-continues'));
});

test('evaluateCadenceBoundary: confidence is clamped to [0, 1]', () => {
  const result = evaluateCadenceBoundary({
    confidence: 1.5,
    audioBoundaryDistance: 0.02,
    barBoundaryDistance: 0.02,
    levelBeforeDb: -6,
    levelAfterDb: -12,
    sources: ['audio-envelope', 'beat-grid', 'section'],
  });
  assert.equal(result.confidence, 1);
});

test('evaluateCadenceBoundary: null confidence yields 0', () => {
  const result = evaluateCadenceBoundary({ confidence: null });
  assert.equal(result.confidence, 0);
});

test('evaluateCadenceBoundary: reasons deduplicated and capped at 8', () => {
  const result = evaluateCadenceBoundary({});
  assert.ok(result.reasons.length <= 8);
  // Verify no duplicates
  assert.equal(result.reasons.length, new Set(result.reasons).size);
});

// ── chooseEndCrossfadeDuration ────────────────────────────────────────

test('chooseEndCrossfadeDuration: background-safe returns >= 0.8s', () => {
  const result = chooseEndCrossfadeDuration({
    fromAvailable: 5,
    toDuration: 5,
    fromVocalState: 'inactive',
    toVocalState: 'inactive',
  });
  assert.ok(result >= 0.8);
});

test('chooseEndCrossfadeDuration: foreground-unsafe caps at 1.6s', () => {
  const result = chooseEndCrossfadeDuration({
    fromAvailable: 10,
    toDuration: 10,
    fromVocalState: 'active',
    toVocalState: 'inactive',
    requestedDuration: 5,
  });
  assert.ok(result <= 1.6);
});

test('chooseEndCrossfadeDuration: never returns below MIN_CROSSFADE_SEC (0.05)', () => {
  const result = chooseEndCrossfadeDuration({
    fromAvailable: 0,
    toDuration: 0,
  });
  assert.ok(result >= 0.05, `Expected >= 0.05, got ${result}`);
});

test('chooseEndCrossfadeDuration: zero fromAvailable yields MIN_CROSSFADE_SEC', () => {
  const result = chooseEndCrossfadeDuration({
    fromAvailable: 0,
    toDuration: 5,
    fromVocalState: 'inactive',
    toVocalState: 'inactive',
  });
  assert.equal(result, 0.05);
});

test('chooseEndCrossfadeDuration: zero toDuration yields MIN_CROSSFADE_SEC', () => {
  const result = chooseEndCrossfadeDuration({
    fromAvailable: 5,
    toDuration: 0,
    fromVocalState: 'inactive',
    toVocalState: 'inactive',
  });
  assert.equal(result, 0.05);
});

test('chooseEndCrossfadeDuration: respects fromAvailable constraint', () => {
  const result = chooseEndCrossfadeDuration({
    fromAvailable: 0.5,
    toDuration: 5,
    fromVocalState: 'inactive',
    toVocalState: 'inactive',
  });
  assert.equal(result, 0.5);
});

test('chooseEndCrossfadeDuration: respects toDuration constraint', () => {
  const result = chooseEndCrossfadeDuration({
    fromAvailable: 5,
    toDuration: 0.3,
    fromVocalState: 'inactive',
    toVocalState: 'inactive',
  });
  assert.equal(result, 0.3);
});

test('chooseEndCrossfadeDuration: background default is 2s', () => {
  const result = chooseEndCrossfadeDuration({
    fromAvailable: 10,
    toDuration: 10,
    fromVocalState: 'inactive',
    toVocalState: 'inactive',
  });
  assert.equal(result, 2);
});

test('chooseEndCrossfadeDuration: foreground default is 0.8s', () => {
  const result = chooseEndCrossfadeDuration({
    fromAvailable: 10,
    toDuration: 10,
    fromVocalState: 'active',
    toVocalState: 'active',
  });
  assert.equal(result, 0.8);
});

test('chooseEndCrossfadeDuration: handles null/undefined options gracefully', () => {
  const result = chooseEndCrossfadeDuration();
  assert.ok(result >= 0.05);
  assert.ok(typeof result === 'number');
});

test('chooseEndCrossfadeDuration: requestedDuration respected within bounds', () => {
  const result = chooseEndCrossfadeDuration({
    fromAvailable: 10,
    toDuration: 10,
    fromVocalState: 'inactive',
    toVocalState: 'inactive',
    requestedDuration: 1.5,
  });
  assert.equal(result, 1.5);
});