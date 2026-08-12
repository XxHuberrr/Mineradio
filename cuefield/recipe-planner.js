const { round, toNumber } = require('./cue-profile');

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, toNumber(value)));
}

function densityAt(windows, time) {
  const list = Array.isArray(windows) ? windows : [];
  const found = list.find((window) => time >= toNumber(window.start) && time < toNumber(window.end));
  if (found) return clamp(found.value);
  const nearest = list.slice().sort((a, b) => Math.abs(toNumber(a.start) - time) - Math.abs(toNumber(b.start) - time))[0];
  return nearest ? clamp(nearest.value) : 0;
}

function average(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) return 0;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function barsInRange(profile, start, end) {
  const bars = profile && Array.isArray(profile.bars) ? profile.bars : [];
  return bars.filter((bar) => toNumber(bar.end) > start && toNumber(bar.start) < end);
}

function textureAt(profile, start, end) {
  const bars = barsInRange(profile, start, end);
  return {
    energy: clamp(average(bars.map((bar) => toNumber(bar.energy, NaN)))),
    low: clamp(average(bars.map((bar) => toNumber(bar.lowDensity, NaN)))),
    body: clamp(average(bars.map((bar) => toNumber(bar.bodyDensity, NaN)))),
    snap: clamp(average(bars.map((bar) => toNumber(bar.snapDensity, NaN)))),
  };
}

function nearestCandidate(profile, role, time) {
  return (profile.candidates || [])
    .filter((candidate) => candidate && candidate.role === role && Number.isFinite(toNumber(candidate.time, NaN)))
    .sort((a, b) => Math.abs(toNumber(a.time) - time) - Math.abs(toNumber(b.time) - time))[0] || null;
}

function firstCandidate(profile, predicate) {
  return (profile.candidates || [])
    .filter((candidate) => candidate && Number.isFinite(toNumber(candidate.time, NaN)) && predicate(candidate))
    .sort((a, b) => toNumber(b.confidence) - toNumber(a.confidence) || toNumber(a.time) - toNumber(b.time))[0] || null;
}

function barLength(profile) {
  const bars = profile && Array.isArray(profile.bars) ? profile.bars : [];
  const lengths = bars
    .map((bar) => toNumber(bar.end) - toNumber(bar.start))
    .filter((length) => length > 0.6 && length < 8)
    .sort((a, b) => a - b);
  if (lengths.length) {
    const middle = Math.floor(lengths.length / 2);
    return round(lengths.length % 2 ? lengths[middle] : (lengths[middle - 1] + lengths[middle]) / 2);
  }
  return Math.max(1, toNumber(profile && profile.gridStep, 0.5) * 4);
}

function nearestDownbeat(profile, time) {
  const downbeats = profile && Array.isArray(profile.downbeats) ? profile.downbeats : [];
  const step = Math.max(0.001, toNumber(profile && profile.gridStep, 0.5));
  const nearest = downbeats.slice().sort((a, b) => Math.abs(toNumber(a.time) - time) - Math.abs(toNumber(b.time) - time))[0];
  if (!nearest) return { time, residual: step * 2, score: 0, confidence: 0 };
  const residual = Math.abs(toNumber(nearest.time) - time);
  const residualScore = clamp(1 - residual / step);
  const confidence = clamp(toNumber(nearest.confidence, 0.5));
  return {
    time: round(toNumber(nearest.time, time)),
    residual: round(residual),
    score: round(residualScore * (0.55 + confidence * 0.45)),
    confidence: round(confidence),
  };
}

function normalizedTempoPair(fromBpm, toBpm) {
  const a = Math.max(0, toNumber(fromBpm));
  const b = Math.max(0, toNumber(toBpm));
  if (!a || !b) return { fromBpm: a, toBpm: b, normalizedToBpm: b, ratio: 1, relativeDiff: 1, score: 0 };
  const options = [0.5, 1, 2].map((factor) => {
    const normalized = b * factor;
    return {
      factor,
      normalized,
      relativeDiff: Math.abs(a - normalized) / Math.max(a, normalized, 1),
    };
  }).sort((left, right) => left.relativeDiff - right.relativeDiff);
  const best = options[0];
  return {
    fromBpm: round(a, 2),
    toBpm: round(b, 2),
    normalizedToBpm: round(best.normalized, 2),
    ratio: round(best.factor, 3),
    relativeDiff: round(best.relativeDiff, 4),
    score: round(clamp(1 - best.relativeDiff / 0.08)),
  };
}

function pickAnchors(fromProfile, toProfile, opts = {}) {
  const sectionChoice = opts.sectionChoice || {};
  const fromCue = fromProfile.cuePoints || {};
  const toCue = toProfile.cuePoints || {};
  const maxEntryTime = Math.max(8, toNumber(opts.maxEntryTime, 32));
  const hook = firstCandidate(toProfile, (candidate) => candidate.role === 'entry' && candidate.time <= maxEntryTime && (candidate.type === 'hook' || candidate.type === 'chorus'));
  const intro = firstCandidate(toProfile, (candidate) => candidate.role === 'entry' && candidate.time <= Math.min(12, maxEntryTime) && candidate.type === 'intro');
  const rawExit = round(toNumber(sectionChoice.exit && sectionChoice.exit.time, toNumber(fromCue.outroStart, Math.max(0, fromProfile.duration - 12))));
  const rawEntry = toNumber(sectionChoice.entry && sectionChoice.entry.time, NaN);
  const boundedEntry = Number.isFinite(rawEntry) && rawEntry <= maxEntryTime
    ? rawEntry
    : toNumber(hook && hook.time, toNumber(toCue.firstStrongDownbeat, toNumber(intro && intro.time, 0)));
  const aSnap = nearestDownbeat(fromProfile, rawExit);
  const bSnap = nearestDownbeat(toProfile, Math.max(0, Math.min(maxEntryTime, boundedEntry)));
  const aExit = aSnap.residual <= Math.max(0.2, toNumber(fromProfile.gridStep, 0.5)) ? aSnap.time : rawExit;
  const bAnchor = bSnap.residual <= Math.max(0.2, toNumber(toProfile.gridStep, 0.5)) ? bSnap.time : Math.max(0, Math.min(maxEntryTime, boundedEntry));
  const bIntro = round(toNumber(intro && intro.time, 0));
  const bStart = Math.max(0, Math.min(bIntro, bAnchor));
  const bar = barLength(fromProfile);

  return {
    aExit,
    bStart: round(bStart),
    bAnchor,
    barLength: bar,
    aDownbeat: nearestDownbeat(fromProfile, aExit),
    bDownbeat: nearestDownbeat(toProfile, bAnchor),
    maxEntryTime,
  };
}

function commonScores(fromProfile, toProfile, anchors) {
  const aEnergy = densityAt(fromProfile.windows && fromProfile.windows.energy, anchors.aExit);
  const bEnergy = densityAt(toProfile.windows && toProfile.windows.energy, anchors.bAnchor);
  const aBass = densityAt(fromProfile.windows && fromProfile.windows.bass, anchors.aExit);
  const bBass = densityAt(toProfile.windows && toProfile.windows.bass, anchors.bStart);
  const tempo = normalizedTempoPair(fromProfile.bpm, toProfile.bpm);
  const aGridConfidence = clamp(toNumber(fromProfile.dataConfidence, 0));
  const bGridConfidence = clamp(toNumber(toProfile.dataConfidence, 0));
  const gridConfidence = Math.min(aGridConfidence, bGridConfidence);
  const beatScore = clamp(average([
    toNumber(anchors.aDownbeat && anchors.aDownbeat.score, 0),
    toNumber(anchors.bDownbeat && anchors.bDownbeat.score, 0),
    toNumber(fromProfile.downbeatStability, 0),
    toNumber(toProfile.downbeatStability, 0),
  ]));
  const energyScore = 1 - Math.min(1, Math.abs(aEnergy - bEnergy) / 0.65);
  const bassScore = 1 - Math.min(1, Math.max(0, aBass + bBass - 0.88) / 0.7);
  const bpmScore = tempo.score;
  const outroTexture = textureAt(fromProfile, anchors.aExit, toNumber(fromProfile.duration, anchors.aExit) + 0.001);
  const introTexture = textureAt(toProfile, anchors.bStart, anchors.bStart + 12);
  const exitCandidate = nearestCandidate(fromProfile, 'exit', anchors.aExit);
  const outroLengthScore = clamp((toNumber(fromProfile.duration) - anchors.aExit) / 16);
  const outroConfidence = clamp(exitCandidate && exitCandidate.confidence, 0, 1);
  const outroCompleteness = clamp(outroLengthScore * 0.45 + outroConfidence * 0.35 + (1 - outroTexture.energy) * 0.2);
  const bIntroAggression = clamp(introTexture.energy * 0.55 + introTexture.low * 0.25 + introTexture.snap * 0.2);
  const styleTextureDistance = clamp(average([
    Math.abs(outroTexture.energy - introTexture.energy),
    Math.abs(outroTexture.low - introTexture.low),
    Math.abs(outroTexture.body - introTexture.body),
    Math.abs(outroTexture.snap - introTexture.snap),
  ]) / 0.7);
  const aVocal = densityAt(fromProfile.windows && fromProfile.windows.vocal, Math.max(0, anchors.aExit - 2));
  const bVocal = densityAt(toProfile.windows && toProfile.windows.vocal, Math.max(0, anchors.bAnchor - 2));
  const vocalOverlapRisk = clamp(aVocal * bVocal);
  const mixConfidence = clamp(
    gridConfidence * 0.28
    + beatScore * 0.22
    + bpmScore * 0.18
    + energyScore * 0.14
    + bassScore * 0.08
    + outroCompleteness * 0.10
    - vocalOverlapRisk * 0.22
  );

  return {
    aEnergy,
    bEnergy,
    aBass,
    bBass,
    beatScore,
    energyScore,
    bassScore,
    bpmScore,
    outroCompleteness,
    bIntroAggression,
    styleTextureDistance,
    aVocal,
    bVocal,
    vocalOverlapRisk,
    gridConfidence,
    mixConfidence,
    tempo,
  };
}

function baseCandidate(recipe, score, confidence, reason, risks, anchors, timeline) {
  return {
    recipe,
    score: round(score),
    confidence: round(confidence),
    reason,
    risks,
    anchors,
    timeline,
  };
}

function makeLongBlend(anchors, scores) {
  const lead = 8;
  const score = 0.28 + scores.beatScore * 0.28 + scores.energyScore * 0.18 + scores.bassScore * 0.18 + scores.bpmScore * 0.08;
  const risks = [];
  if (scores.bassScore < 0.45) risks.push('bass overlap needs eq');
  return baseCandidate(
    'intro-outro-long-blend',
    score,
    Math.min(0.9, score + 0.04),
    ['A outro supports longer bed', 'B intro can enter before anchor'],
    risks,
    { ...anchors, lead },
    [
      { t: -lead, deck: 'B', op: 'play', at: anchors.bStart, volume: 0 },
      { t: -lead, deck: 'B', op: 'volume', value: 0.58, duration: 5200 },
      { t: -4.5, deck: 'B', op: 'filter', type: 'highpass', value: 650, duration: 2600 },
      { t: -3.2, deck: 'A', op: 'bass', value: 0.38, duration: 2200 },
      { t: -1.2, deck: 'B', op: 'bass', value: 0.82, duration: 1400 },
      { t: 0, deck: 'B', op: 'filter', type: 'none', value: 0, duration: 900 },
      { t: 0.8, deck: 'A', op: 'volume', value: 0, duration: 1600 },
      { t: 2.6, deck: 'B', op: 'handoff' },
    ],
  );
}

function makeFilteredPickup(anchors, scores) {
  const lead = 4;
  const bStart = Math.max(0, anchors.bAnchor - lead);
  const score = 0.34 + scores.beatScore * 0.3 + scores.energyScore * 0.18 + scores.bassScore * 0.12 + scores.bpmScore * 0.06;
  const risks = [];
  if (scores.energyScore < 0.35) risks.push('noticeable energy change');
  return baseCandidate(
    'filtered-pickup',
    score,
    Math.min(0.92, score + 0.05),
    ['B pickup is filtered before downbeat', 'A low end clears before handoff'],
    risks,
    { ...anchors, bStart: round(bStart), lead },
    [
      { t: -lead, deck: 'B', op: 'play', at: round(bStart), volume: 0 },
      { t: -lead, deck: 'B', op: 'filter', type: 'highpass', value: 900, duration: 1800 },
      { t: -3.6, deck: 'B', op: 'volume', value: 0.72, duration: 2600 },
      { t: -2.2, deck: 'A', op: 'bass', value: 0.35, duration: 1300 },
      { t: -0.4, deck: 'B', op: 'bass', value: 0.8, duration: 900 },
      { t: 0, deck: 'B', op: 'filter', type: 'none', value: 0, duration: 900 },
      { t: 1.1, deck: 'A', op: 'volume', value: 0, duration: 1000 },
      { t: 2.2, deck: 'B', op: 'handoff' },
    ],
  );
}

function makeBassHandoff(anchors, scores) {
  const lead = 5.2;
  const score = 0.3 + scores.beatScore * 0.28 + scores.bassScore * 0.24 + scores.energyScore * 0.12 + scores.bpmScore * 0.06;
  const risks = [];
  if (scores.aBass > 0.65 && scores.bBass > 0.55) risks.push('requires bass swap');
  return baseCandidate(
    'bass-eq-handoff',
    score,
    Math.min(0.88, score + 0.03),
    ['bass is exchanged instead of stacked', 'handoff lands near downbeat'],
    risks,
    { ...anchors, lead },
    [
      { t: -lead, deck: 'B', op: 'play', at: anchors.bStart, volume: 0 },
      { t: -lead, deck: 'B', op: 'bass', value: 0.15, duration: 0 },
      { t: -4.8, deck: 'B', op: 'volume', value: 0.68, duration: 2600 },
      { t: -2.6, deck: 'A', op: 'bass', value: 0.18, duration: 1800 },
      { t: -1, deck: 'B', op: 'bass', value: 0.92, duration: 1100 },
      { t: 0.3, deck: 'A', op: 'volume', value: 0, duration: 1200 },
      { t: 1.8, deck: 'B', op: 'handoff' },
    ],
  );
}

function makeQuickFade(anchors, scores) {
  const lead = 2.6;
  const score = 0.24 + scores.beatScore * 0.32 + scores.energyScore * 0.16 + scores.bpmScore * 0.1;
  return baseCandidate(
    'quick-safe-fade',
    score,
    Math.min(0.78, score),
    ['fallback when longer overlap is risky'],
    ['short transition'],
    { ...anchors, lead },
    [
      { t: -lead, deck: 'B', op: 'play', at: anchors.bAnchor, volume: 0 },
      { t: -lead, deck: 'B', op: 'volume', value: 0.76, duration: 1800 },
      { t: -0.6, deck: 'A', op: 'volume', value: 0.2, duration: 800 },
      { t: 0.3, deck: 'A', op: 'volume', value: 0, duration: 600 },
      { t: 1, deck: 'B', op: 'handoff' },
    ],
  );
}

function makeSafetyLongBlend(anchors, scores, sectionChoice = {}) {
  const lead = 12;
  const bStart = round(Math.max(0, anchors.bStart));
  const score = 0.48
    + scores.bpmScore * 0.08
    + scores.beatScore * 0.05
    + scores.outroCompleteness * 0.08
    - scores.bIntroAggression * 0.04
    - scores.styleTextureDistance * 0.03;
  const tier = sectionChoice.evaluation && sectionChoice.evaluation.tier || '';
  const risks = ['safety fallback'];
  if (tier === 'reject') risks.push('masked rejected pair');
  if (scores.bassScore < 0.5) risks.push('bass protected');
  if (scores.bIntroAggression > 0.68) risks.push('intro aggression masked');
  if (scores.styleTextureDistance > 0.45) risks.push('texture distance masked');
  return baseCandidate(
    'safety-long-blend',
    score,
    0.72,
    [
      'universal conservative blend for weak or rejected pairs',
      'B enters from intro or low-density start instead of hook',
      'low end is delayed to avoid bass collision',
    ],
    risks,
    { ...anchors, bStart, lead, safetyFallback: true },
    [
      { t: -lead, deck: 'B', op: 'play', at: bStart, volume: 0 },
      { t: -lead, deck: 'B', op: 'bass', value: 0.08, duration: 0 },
      { t: -lead, deck: 'B', op: 'filter', type: 'highpass', value: 1200, duration: 0 },
      { t: -lead, deck: 'B', op: 'volume', value: 0.24, duration: 2600 },
      { t: -9.2, deck: 'A', op: 'filter', type: 'highpass', value: 420, duration: 3200 },
      { t: -8.2, deck: 'A', op: 'bass', value: 0.55, duration: 2800 },
      { t: -6.4, deck: 'B', op: 'volume', value: 0.46, duration: 3600 },
      { t: -4.2, deck: 'B', op: 'filter', type: 'highpass', value: 520, duration: 2600 },
      { t: -3.4, deck: 'A', op: 'bass', value: 0.18, duration: 2400 },
      { t: -2.4, deck: 'B', op: 'volume', value: 0.74, duration: 2200 },
      { t: -1.1, deck: 'B', op: 'bass', value: 0.72, duration: 1800 },
      { t: 0, deck: 'B', op: 'filter', type: 'none', value: 0, duration: 1600 },
      { t: 0.4, deck: 'A', op: 'volume', value: 0.16, duration: 2400 },
      { t: 2.9, deck: 'A', op: 'volume', value: 0, duration: 900 },
      { t: 3.8, deck: 'B', op: 'bass', value: 1, duration: 1600 },
      { t: 4.8, deck: 'B', op: 'handoff' },
    ],
  );
}

function makeAnchorAlignedBeatmix(fromProfile, toProfile, anchors, scores, sectionChoice = {}) {
  const twoBars = scores.tempo.relativeDiff <= 0.015;
  const requestedFade = Math.max(1.8, toNumber(fromProfile.gridStep, 0.5) * 4 * (twoBars ? 2 : 1));
  const fadeSec = round(Math.min(7.5, requestedFade));
  const anchorLead = round(Math.min(fadeSec / 2, Math.max(0, anchors.bAnchor)));
  const bStart = round(Math.max(0, anchors.bAnchor - anchorLead));
  const endOffset = round(fadeSec - anchorLead);
  const warmupSec = 0.75;
  const preparedStart = round(Math.max(0, bStart - warmupSec));
  const actualWarmup = round(Math.min(warmupSec, bStart));
  const risks = [];
  if (scores.vocalOverlapRisk > 0.26) risks.push('vocal overlap guarded');
  if (scores.bassScore < 0.6) risks.push('bass overlap guarded');
  if (scores.tempo.relativeDiff > 0.015) risks.push('one-bar no-stretch limit');
  return {
    ...baseCandidate(
      'anchor-aligned-beatmix',
      scores.mixConfidence,
      scores.mixConfidence,
      ['A/B anchors are scheduled on their own downbeats', twoBars ? 'two-bar high-confidence blend' : 'one-bar tempo-safe blend'],
      risks,
      { ...anchors, bStart: preparedStart, bFadeStart: bStart, anchorLead, warmupSec: actualWarmup, lead: anchorLead + actualWarmup },
      [
        { t: -anchorLead - actualWarmup, deck: 'B', op: 'play', at: preparedStart, volume: 0 },
        { t: -anchorLead, deck: 'AB', op: 'crossfade', value: 1, duration: Math.round(fadeSec * 1000) },
        { t: endOffset, deck: 'B', op: 'handoff' },
      ],
    ),
    mixType: 'beatmix',
    fadeSec,
    anchorLead,
    warmupSec: actualWarmup,
    fadeStartA: round(anchors.aExit - anchorLead),
    bFadeStart: bStart,
    exit: { ...(sectionChoice.exit || {}), role: 'exit', time: anchors.aExit },
    entry: { ...(sectionChoice.entry || {}), role: 'entry', time: anchors.bAnchor },
  };
}

function makeSimpleCrossfade(fromProfile, toProfile, scores) {
  const energyGap = Math.abs(scores.aEnergy - scores.bEnergy);
  const fadeSec = round(Math.max(0.9, Math.min(2.4, 1.65 + (1 - energyGap) * 0.45 - scores.vocalOverlapRisk * 0.4)));
  const exitTime = round(Math.max(fadeSec + 0.2, toNumber(fromProfile.duration, fadeSec + 0.2)));
  const warmupSec = 0.7;
  return {
    ...baseCandidate(
      'simple-crossfade',
      0.72,
      0.9,
      ['low-confidence pairs keep the natural tail', 'short fade avoids forced beat or phrase matching'],
      ['analysis fallback'],
      { aExit: exitTime, bStart: 0, bFadeStart: 0, bAnchor: 0, lead: fadeSec + warmupSec, anchorLead: 0, warmupSec },
      [
        { t: -fadeSec - warmupSec, deck: 'B', op: 'play', at: 0, volume: 0 },
        { t: -fadeSec, deck: 'AB', op: 'crossfade', value: 1, duration: Math.round(fadeSec * 1000) },
        { t: 0, deck: 'B', op: 'handoff' },
      ],
    ),
    mixType: 'crossfade',
    fadeSec,
    anchorLead: 0,
    warmupSec,
    fadeStartA: round(exitTime - fadeSec),
    bFadeStart: 0,
    exit: { type: 'natural-tail', role: 'exit', time: exitTime, confidence: 1 },
    entry: { type: 'track-start', role: 'entry', time: 0, confidence: 1 },
  };
}

function planRecipeCandidates(fromProfile, toProfile, opts = {}) {
  const anchors = pickAnchors(fromProfile || {}, toProfile || {}, opts);
  const scores = commonScores(fromProfile || {}, toProfile || {}, anchors);
  const sectionRisks = opts.sectionChoice && opts.sectionChoice.evaluation && opts.sectionChoice.evaluation.risks || [];
  const hardRisk = sectionRisks.includes('closed outgoing phrase')
    || sectionRisks.includes('near closed outgoing phrase');
  const anchorCandidate = makeAnchorAlignedBeatmix(fromProfile || {}, toProfile || {}, anchors, scores, opts.sectionChoice);
  const simpleCandidate = makeSimpleCrossfade(fromProfile || {}, toProfile || {}, scores);
  const exitTail = Math.max(0, toNumber(fromProfile && fromProfile.duration) - anchors.aExit);
  const anchorEligible = !hardRisk
    && anchors.bAnchor >= 1
    && anchors.bAnchor <= anchors.maxEntryTime
    && scores.gridConfidence >= 0.62
    && scores.beatScore >= 0.64
    && scores.mixConfidence >= 0.64
    && scores.tempo.relativeDiff <= 0.03
    && scores.vocalOverlapRisk <= 0.42
    && exitTail + anchorCandidate.anchorLead >= anchorCandidate.fadeSec - 0.15;
  const candidates = [anchorCandidate, simpleCandidate];
  const chosen = anchorEligible ? anchorCandidate : simpleCandidate;

  return {
    chosen,
    candidates,
    diagnostics: {
      aEnergy: round(scores.aEnergy),
      bEnergy: round(scores.bEnergy),
      aBass: round(scores.aBass),
      bBass: round(scores.bBass),
      beatScore: round(scores.beatScore),
      energyScore: round(scores.energyScore),
      bassScore: round(scores.bassScore),
      bpmScore: round(scores.bpmScore),
      outroCompleteness: round(scores.outroCompleteness),
      bIntroAggression: round(scores.bIntroAggression),
      styleTextureDistance: round(scores.styleTextureDistance),
      gridConfidence: round(scores.gridConfidence),
      mixConfidence: round(scores.mixConfidence),
      vocalOverlapRisk: round(scores.vocalOverlapRisk),
      tempoRelativeDiff: round(scores.tempo.relativeDiff, 4),
      tempoRatio: round(scores.tempo.ratio),
      anchorEligible,
      fallbackReason: anchorEligible ? '' : (
        hardRisk ? 'section-risk'
          : (scores.tempo.relativeDiff > 0.03 ? 'tempo-mismatch'
            : (scores.gridConfidence < 0.62 ? 'low-grid-confidence'
              : (scores.beatScore < 0.64 ? 'low-anchor-confidence'
                : (scores.vocalOverlapRisk > 0.42 ? 'vocal-overlap' : 'low-mix-confidence'))))
      ),
    },
  };
}

module.exports = {
  planRecipeCandidates,
};
