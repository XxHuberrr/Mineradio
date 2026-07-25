function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(toNumber(value) * factor) / factor;
}

function average(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) return 0;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function beatEnergy(beat) {
  if (!beat) return 0;
  return Math.max(
    toNumber(beat.impact),
    toNumber(beat.strength),
    toNumber(beat.body),
    toNumber(beat.snap),
    toNumber(beat.low),
  );
}

function normalizeBeats(beats) {
  return (Array.isArray(beats) ? beats : [])
    .map((beat, index) => ({
      ...beat,
      index,
      time: round(beat && beat.time),
      low: toNumber(beat && beat.low),
      body: toNumber(beat && beat.body),
      snap: toNumber(beat && beat.snap),
      impact: toNumber(beat && beat.impact, toNumber(beat && beat.strength)),
      confidence: toNumber(beat && beat.confidence, 0.5),
    }))
    .filter((beat) => Number.isFinite(beat.time))
    .sort((a, b) => a.time - b.time);
}

function inferGridStep(map, beats) {
  const explicit = toNumber(map && map.gridStep, 0);
  if (explicit > 0) return explicit;
  const deltas = [];
  for (let i = 1; i < beats.length; i += 1) {
    const delta = beats[i].time - beats[i - 1].time;
    if (delta > 0 && delta < 4) deltas.push(delta);
  }
  return round(average(deltas), 3) || 0.5;
}

function isDownbeat(beat, index, hasExplicitMeter) {
  if (!beat) return false;
  if (beat.downbeat === true || beat.phrase === true) return true;
  if (String(beat.combo || '').toLowerCase() === 'downbeat') return true;
  return !hasExplicitMeter && index % 4 === 0;
}

function beatsInRange(beats, start, end) {
  return beats.filter((beat) => beat.time >= start && beat.time < end);
}

function buildBars(beats, downbeats, gridStep, duration) {
  return downbeats.map((downbeat, index) => {
    const next = downbeats[index + 1];
    const start = downbeat.time;
    const end = Math.min(duration, next ? next.time : start + gridStep * 4);
    const window = beatsInRange(beats, start, end > start ? end : start + gridStep * 4);
    return {
      index,
      start: round(start),
      end: round(end > start ? end : start + gridStep * 4),
      energy: round(average(window.map(beatEnergy))),
      lowDensity: round(average(window.map((beat) => beat.low))),
      bodyDensity: round(average(window.map((beat) => beat.body))),
      snapDensity: round(average(window.map((beat) => beat.snap))),
      beatStability: round(window.length ? window.filter((beat) => beat.confidence >= 0.75).length / window.length : 0),
    };
  });
}

function buildPhrases(bars, duration) {
  const phrases = [];
  for (let i = 0; i < bars.length; i += 8) {
    const start = bars[i];
    if (!start) continue;
    const end = bars[Math.min(i + 8, bars.length) - 1];
    phrases.push({
      index: phrases.length,
      start: start.start,
      end: end ? end.end : duration,
      bars: end ? end.index - start.index + 1 : 1,
      energy: round(average(bars.slice(i, i + 8).map((bar) => bar.energy))),
    });
  }
  return phrases;
}

function lyricActivityAt(windows, start, end) {
  const overlap = (Array.isArray(windows) ? windows : []).reduce((sum, window) => {
    const left = Math.max(start, toNumber(window && window.start));
    const right = Math.min(end, toNumber(window && window.end));
    return sum + Math.max(0, right - left);
  }, 0);
  return end > start ? Math.max(0, Math.min(1, overlap / (end - start))) : 0;
}

function buildWindows(beats, duration, vocalWindows, size = 8) {
  const energy = [];
  const bass = [];
  const vocal = [];
  for (let start = 0; start < duration; start += size) {
    const end = Math.min(duration, start + size);
    const window = beatsInRange(beats, start, end);
    energy.push({ start: round(start), end: round(end), value: round(average(window.map(beatEnergy))) });
    bass.push({ start: round(start), end: round(end), value: round(average(window.map((beat) => beat.low))) });
    vocal.push({ start: round(start), end: round(end), value: round(lyricActivityAt(vocalWindows, start, end)) });
  }
  return { energy, bass, vocal };
}

function bestCandidate(candidates, predicate, fallback = null) {
  return (candidates || [])
    .filter((candidate) => candidate && Number.isFinite(toNumber(candidate.time, NaN)) && predicate(candidate))
    .sort((a, b) => toNumber(b.confidence) - toNumber(a.confidence) || toNumber(a.time) - toNumber(b.time))[0] || fallback;
}

function buildCuePoints(candidates, downbeats, bars, duration) {
  const intro = bestCandidate(candidates, (candidate) => (
    candidate.role === 'entry' && (candidate.type === 'intro' || candidate.time <= 24)
  )) || bestCandidate(candidates, (candidate) => candidate.role === 'entry');
  const outro = bestCandidate(candidates, (candidate) => (
    candidate.role === 'exit' && (candidate.type === 'outro' || candidate.type === 'release')
  )) || bestCandidate(candidates, (candidate) => candidate.role === 'exit');
  const averageEnergy = average(bars.map((bar) => bar.energy));
  const firstStrong = bars.find((bar) => bar.energy >= averageEnergy * 0.95) || bars[0];
  const lastExit = (candidates || [])
    .filter((candidate) => candidate && candidate.role === 'exit')
    .sort((a, b) => toNumber(b.time) - toNumber(a.time))[0];

  return {
    introStart: round(intro ? intro.time : (downbeats[0] ? downbeats[0].time : 0)),
    introEnd: round(firstStrong ? Math.max(firstStrong.start, intro ? intro.time : 0) : Math.min(16, duration)),
    firstStrongDownbeat: round(firstStrong ? firstStrong.start : (downbeats[0] ? downbeats[0].time : 0)),
    outroStart: round(outro ? outro.time : Math.max(0, duration - 16)),
    outroEnd: round(duration),
    lastSafePhraseEnd: round(lastExit ? lastExit.time : Math.max(0, duration - 8)),
  };
}

function buildCueProfile(input = {}) {
  const map = input.map || {};
  const track = input.track || {};
  const beats = normalizeBeats(map.beats || map.cameraBeats || []);
  const gridStep = inferGridStep(map, beats);
  const duration = round(Math.max(
    toNumber(track.duration),
    toNumber(map.duration),
    beats.length ? beats[beats.length - 1].time + gridStep : 0,
  ));
  const hasExplicitMeter = beats.some((beat) => beat.downbeat === true || beat.phrase === true || !!String(beat.combo || ''));
  const downbeats = beats
    .filter((beat, index) => isDownbeat(beat, index, hasExplicitMeter))
    .map((beat) => ({ time: beat.time, confidence: beat.confidence, energy: round(beatEnergy(beat)) }));
  const bars = buildBars(beats, downbeats, gridStep, duration);

  return {
    track,
    duration,
    bpm: gridStep > 0 ? round(60 / gridStep, 2) : 0,
    gridStep,
    beats,
    downbeats,
    bars,
    phrases: buildPhrases(bars, duration),
    cuePoints: buildCuePoints(input.candidates || [], downbeats, bars, duration),
    windows: buildWindows(beats, duration, input.vocalWindows || map.vocalWindows),
    candidates: Array.isArray(input.candidates) ? input.candidates.slice() : [],
    tempoStability: toNumber(map.tempoStability, 0),
    beatConfidence: toNumber(map.beatConfidence, 0),
    downbeatStability: toNumber(map.downbeatStability, 0),
    dataConfidence: toNumber(map.dataConfidence, 0),
  };
}

module.exports = {
  buildCueProfile,
  toNumber,
  round,
};
