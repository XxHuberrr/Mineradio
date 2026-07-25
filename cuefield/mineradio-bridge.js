const { analyzeSectionCandidates, chooseTransitionCandidates } = require('./section-candidates');
const { normalizeMineradioBeatMap } = require('./adapter-mineradio');
const { buildCueProfile } = require('./cue-profile');
const { parseLrc } = require('./lrc-anchors');
const { planRecipeCandidates } = require('./recipe-planner');

function toTrack(entry, fallbackKey) {
  const meta = entry && entry.meta || {};
  return {
    id: entry && entry.key || fallbackKey || '',
    title: meta.title || entry && entry.title || fallbackKey || '',
    artist: meta.artist || entry && entry.artist || '',
    duration: entry && entry.map && entry.map.duration || 0,
  };
}

function entryFromCache(readBeatMapCache, key) {
  const entry = readBeatMapCache(key);
  if (!entry || !entry.map) {
    const err = new Error(`BEATMAP_CACHE_MISS:${key}`);
    err.code = 'BEATMAP_CACHE_MISS';
    throw err;
  }
  return entry;
}

function parseMaybeLrc(value) {
  return value ? parseLrc(String(value)) : [];
}

function normalizedFixture(entry, key) {
  const track = toTrack(entry, key);
  const analysis = normalizeMineradioBeatMap(track, entry.map || {});
  return {
    track,
    map: {
      ...(entry.map || {}),
      duration: analysis.track.duration,
      gridStep: analysis.analysis.gridStep,
      beats: analysis.analysis.beats,
      tempoStability: analysis.analysis.tempoStability,
      beatConfidence: analysis.analysis.beatConfidence,
      downbeatStability: analysis.analysis.downbeatStability,
      dataConfidence: analysis.analysis.dataConfidence,
    },
  };
}

function addFallbackEntry(analysis, map) {
  if ((analysis.candidates || []).some((candidate) => candidate.role === 'entry')) return analysis;
  const beats = map && Array.isArray(map.beats) ? map.beats : [];
  const firstDownbeat = beats.find((beat) => (
    beat
    && Number.isFinite(Number(beat.time))
    && Number(beat.time) <= 8
    && (beat.downbeat || beat.phrase || String(beat.combo || '') === 'downbeat')
  ));
  const time = firstDownbeat ? Math.max(0, Number(firstDownbeat.time) || 0) : 0;
  analysis.candidates.push({
    type: 'intro',
    role: 'entry',
    time,
    confidence: firstDownbeat ? 0.58 : 0.44,
    text: '',
    energyBefore: 0,
    energyAfter: 0.42,
    lowDensity: 0.36,
    vocalDensity: 0,
    beatStability: 0.72,
  });
  return analysis;
}

function lyricActivityWindows(lines, duration) {
  const usable = (Array.isArray(lines) ? lines : [])
    .filter((line) => line && Number.isFinite(Number(line.time)) && String(line.text || '').trim())
    .sort((a, b) => Number(a.time) - Number(b.time));
  return usable.map((line, index) => {
    const start = Math.max(0, Number(line.time) || 0);
    const nextTime = index + 1 < usable.length ? Number(usable[index + 1].time) : start + 4.8;
    const end = Math.min(
      Math.max(start + 1.2, Number(duration) || start + 6),
      Math.max(start + 1.2, Math.min(start + 6, Number.isFinite(nextTime) ? nextTime : start + 4.8)),
    );
    return { start, end };
  }).filter((window) => window.end > window.start);
}

function analyzeCacheEntry(entry, key, lrcText) {
  const fixture = normalizedFixture(entry, key);
  const lrcLines = parseMaybeLrc(lrcText);
  const analysis = analyzeSectionCandidates({
    fixture,
    lrcLines,
  });
  const withFallback = addFallbackEntry(analysis, fixture.map);
  const vocalWindows = lyricActivityWindows(lrcLines, withFallback.duration);
  return {
    ...withFallback,
    vocalWindows,
    cueProfile: buildCueProfile({
      track: withFallback.track,
      map: fixture.map,
      candidates: withFallback.candidates,
      vocalWindows,
    }),
  };
}

function planCuefieldTransitionFromCache(opts = {}) {
  const readBeatMapCache = opts.readBeatMapCache;
  if (typeof readBeatMapCache !== 'function') throw new Error('READ_BEATMAP_CACHE_REQUIRED');
  const fromKey = String(opts.fromKey || '').trim();
  const toKey = String(opts.toKey || '').trim();
  if (!fromKey || !toKey) throw new Error('CUEFIELD_CACHE_KEYS_REQUIRED');

  const fromEntry = entryFromCache(readBeatMapCache, fromKey);
  const toEntry = entryFromCache(readBeatMapCache, toKey);
  const from = analyzeCacheEntry(fromEntry, fromKey, opts.fromLrc);
  const to = analyzeCacheEntry(toEntry, toKey, opts.toLrc);
  const maxEntryTime = Math.max(8, Math.min(32, Number(opts.maxEntryTime) || 32));
  const sectionChoice = chooseTransitionCandidates(from, to, { exitBias: opts.exitBias || 'late', maxEntryTime });
  const recipePlan = planRecipeCandidates(from.cueProfile, to.cueProfile, {
    sectionChoice,
    maxEntryTime,
  });
  const chosen = {
    ...sectionChoice,
    exit: recipePlan.chosen.exit || sectionChoice.exit,
    entry: recipePlan.chosen.entry || sectionChoice.entry,
    transitionRecipe: recipePlan.chosen.recipe,
    timeline: recipePlan.chosen.timeline,
    recipeCandidate: recipePlan.chosen,
    mixType: recipePlan.chosen.mixType || '',
    mixConfidence: recipePlan.diagnostics.mixConfidence,
  };

  return {
    ok: true,
    from,
    to,
    chosen,
    candidates: recipePlan.candidates,
    diagnostics: recipePlan.diagnostics,
  };
}

module.exports = {
  planCuefieldTransitionFromCache,
};
