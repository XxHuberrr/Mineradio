const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const FULL_STREAM_QUALITY_LIMIT_SEC = 7200;

function clamp01(v) {
  return Math.max(0, Math.min(1, Number(v) || 0));
}

function clampRange(v, min, max) {
  v = Number(v) || 0;
  return Math.max(min, Math.min(max, v));
}

function percentile(arr, p, maxSamples) {
  const len = arr ? arr.length : 0;
  if (!len) return 0.001;
  maxSamples = maxSamples || 16000;
  let sample;
  if (len <= maxSamples) {
    sample = Array.prototype.slice.call(arr);
  } else {
    sample = new Array(maxSamples);
    const step = (len - 1) / (maxSamples - 1);
    for (let i = 0; i < maxSamples; i++) sample[i] = arr[Math.min(len - 1, Math.floor(i * step))] || 0;
  }
  sample.sort((a, b) => a - b);
  return sample[Math.max(0, Math.min(sample.length - 1, Math.floor(sample.length * p)))] || 0.001;
}

function median(vals) {
  vals = vals.filter(v => Number.isFinite(v)).sort((a, b) => a - b);
  return vals.length ? vals[Math.floor(vals.length * 0.5)] : 0;
}

function makeBiquad(type, freq, q, sr) {
  freq = Math.max(8, Math.min(freq, sr * 0.45));
  const w0 = 2 * Math.PI * freq / sr;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const alpha = sin / (2 * (q || 0.707));
  let b0, b1, b2;
  if (type === 'highpass') {
    b0 = (1 + cos) * 0.5;
    b1 = -(1 + cos);
    b2 = (1 + cos) * 0.5;
  } else {
    b0 = (1 - cos) * 0.5;
    b1 = 1 - cos;
    b2 = (1 - cos) * 0.5;
  }
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  const inv = 1 / a0;
  return { b0: b0 * inv, b1: b1 * inv, b2: b2 * inv, a1: a1 * inv, a2: a2 * inv, x1: 0, x2: 0, y1: 0, y2: 0 };
}

function runBiquad(st, x) {
  const y = st.b0 * x + st.b1 * st.x1 + st.b2 * st.x2 - st.a1 * st.y1 - st.a2 * st.y2;
  st.x2 = st.x1;
  st.x1 = x;
  st.y2 = st.y1;
  st.y1 = y;
  return y;
}

function buildBeatMapFromLowEnergy(lowEnergy, hitEnergy, hopSec, durationSec) {
  const nFrames = Math.min(lowEnergy.length, hitEnergy.length);
  if (nFrames < 20) {
    return {
      kicks: [],
      beats: [],
      pulseBeats: [],
      cameraBeats: [],
      duration: durationSec || 0,
      visualBeatCount: 0,
      tempoSource: 'podcast-dj-server-empty',
      analyzedAt: Date.now(),
    };
  }

  function bandAt(arr, idx) {
    idx = Math.max(0, Math.min(nFrames - 1, idx | 0));
    const a = arr[Math.max(0, idx - 1)] || 0;
    const b = arr[idx] || 0;
    const c = arr[Math.min(nFrames - 1, idx + 1)] || 0;
    return (a + b * 2 + c) * 0.25;
  }

  const lowFloor = Math.max(0.0004, percentile(lowEnergy, 0.22));
  const lowMid = Math.max(lowFloor + 0.0002, percentile(lowEnergy, 0.58));
  const lowRef = Math.max(lowMid + 0.0002, percentile(lowEnergy, 0.86));
  const lowCeil = Math.max(lowRef + 0.0004, percentile(lowEnergy, 0.96));
  const hitRef = Math.max(0.0004, percentile(hitEnergy, 0.86));

  const onset = new Float32Array(nFrames);
  for (let i = 4; i < nFrames; i++) {
    const prev = lowEnergy[i - 1] * 0.62 + lowEnergy[i - 2] * 0.28 + lowEnergy[i - 3] * 0.10;
    const lowRise = Math.max(0, lowEnergy[i] - prev);
    const wideRise = Math.max(0, (lowEnergy[i] + lowEnergy[i - 1]) * 0.5 - (lowEnergy[i - 3] + lowEnergy[i - 4]) * 0.5);
    const peakRise = Math.max(0, hitEnergy[i] - hitEnergy[i - 2] * 0.84);
    onset[i] = lowRise * 1.72 + wideRise * 0.86 + peakRise * 0.10;
  }

  const winN = Math.max(52, Math.round(0.82 / hopSec));
  const minFrameGap = Math.max(18, Math.round(0.215 / hopSec));
  const candidates = [];
  let sumO = 0;
  let sqO = 0;
  for (let i = 0; i < winN; i++) {
    const o = onset[i] || 0;
    sumO += o;
    sqO += o * o;
  }
  for (let f = winN + 4; f < nFrames - 4; f++) {
    const mean = sumO / winN;
    const std = Math.sqrt(Math.max(0, sqO / winN - mean * mean));
    const th = mean + std * 1.66 + lowRef * 0.0038;
    const o = onset[f];
    if (o > th && o >= onset[f - 1] && o > onset[f + 1]) {
      let peakF = f;
      let peakScore = o + lowEnergy[f] * 0.10;
      for (let pf = f - 2; pf <= f + 3; pf++) {
        const ps = (onset[pf] || 0) + (lowEnergy[pf] || 0) * 0.10;
        if (ps > peakScore) {
          peakScore = ps;
          peakF = pf;
        }
      }
      const lowTone = Math.min(2.6, bandAt(lowEnergy, peakF) / lowRef);
      const hitTone = Math.min(2.6, bandAt(hitEnergy, peakF) / hitRef);
      const lowRel = clamp01((bandAt(lowEnergy, peakF) - lowFloor) / Math.max(0.0001, lowCeil - lowFloor));
      const score = (o - th) / Math.max(0.0006, std + mean * 0.38 + lowRef * 0.012);
      if (score > 0.16 && (lowTone > 0.32 || lowRel > 0.22 || hitTone > 0.52)) {
        const cand = {
          frame: peakF,
          time: peakF * hopSec,
          score,
          lowTone,
          hitTone,
          lowRel,
          raw: o,
        };
        cand.power = cand.score * 0.56 + Math.pow(clamp01((cand.lowTone - 0.22) / 1.42), 0.82) * 0.34 + Math.min(1.5, cand.hitTone) * 0.08 + cand.lowRel * 0.10;
        const last = candidates[candidates.length - 1];
        if (last && cand.frame - last.frame < minFrameGap) {
          if (cand.power > last.power) candidates[candidates.length - 1] = cand;
        } else {
          candidates.push(cand);
        }
      }
    }
    const old = onset[f - winN] || 0;
    const next = onset[f] || 0;
    sumO += next - old;
    sqO += next * next - old * old;
  }

  if (!candidates.length) {
    return {
      kicks: [],
      beats: [],
      pulseBeats: [],
      cameraBeats: [],
      duration: durationSec || nFrames * hopSec,
      visualBeatCount: 0,
      tempoSource: 'podcast-dj-server-empty',
      analyzedAt: Date.now(),
    };
  }

  const powers = candidates.map(c => c.power);
  const p30 = percentile(powers, 0.30);
  const p50 = percentile(powers, 0.50);
  const p90 = Math.max(p50 + 0.001, percentile(powers, 0.90));
  const p96 = Math.max(p90 + 0.001, percentile(powers, 0.965));
  let strong = candidates.filter(c => c.power >= p50 && c.lowTone > 0.34);
  if (strong.length < 16) strong = candidates.slice();

  function estimateStep(list) {
    if (!list || list.length < 3) return 0;
    const bin = 0.006;
    const hist = {};
    const medGaps = [];
    for (let ai = 0; ai < list.length; ai++) {
      for (let bi = ai + 1; bi < list.length && bi < ai + 10; bi++) {
        const rawGap = list[bi].time - list[ai].time;
        if (rawGap < 0.24) continue;
        if (rawGap > 2.55) break;
        for (let div = 1; div <= 6; div++) {
          const g = rawGap / div;
          if (g < 0.31) break;
          if (g > 0.86) continue;
          const weight = Math.sqrt(Math.max(0.001, list[ai].power * list[bi].power)) / Math.sqrt((bi - ai) * div);
          const key = Math.round(g / bin);
          hist[key] = (hist[key] || 0) + weight;
          medGaps.push(g);
        }
      }
    }
    let bestKey = null;
    let bestScore = 0;
    Object.keys(hist).forEach(k => {
      const key = parseInt(k, 10);
      const score = (hist[key] || 0) + (hist[key - 1] || 0) * 0.72 + (hist[key + 1] || 0) * 0.72;
      if (score > bestScore) {
        bestScore = score;
        bestKey = key;
      }
    });
    if (bestKey != null) return bestKey * bin;
    return median(medGaps);
  }

  let globalStep = estimateStep(strong) || estimateStep(candidates) || 0.50;
  globalStep = clampRange(globalStep, 0.32, 0.86);

  function nearestCandidate(center, windowSec, startIdx) {
    let best = null;
    let bestScore = -Infinity;
    let j = startIdx || 0;
    while (j < candidates.length && candidates[j].time < center - windowSec) j++;
    for (let ni = j; ni < candidates.length && candidates[ni].time <= center + windowSec; ni++) {
      const dist = Math.abs(candidates[ni].time - center);
      const score = candidates[ni].power * (1 - dist / Math.max(0.001, windowSec) * 0.42);
      if (score > bestScore) {
        best = candidates[ni];
        bestScore = score;
      }
    }
    return best;
  }

  function scorePhase(anchorTime, step) {
    let start = anchorTime;
    while (start - step > 0.05) start -= step;
    const end = Math.min(durationSec || nFrames * hopSec, 180);
    const win = Math.max(0.055, Math.min(0.125, step * 0.18));
    let score = 0;
    let count = 0;
    let cursor = 0;
    for (let gt = start; gt < end; gt += step) {
      while (cursor < candidates.length && candidates[cursor].time < gt - win) cursor++;
      let bestScore = 0;
      for (let pi = cursor; pi < candidates.length && candidates[pi].time <= gt + win; pi++) {
        const dist = Math.abs(candidates[pi].time - gt);
        const s = candidates[pi].power * (1 - dist / win * 0.44);
        if (s > bestScore) bestScore = s;
      }
      score += bestScore ? bestScore : -p30 * 0.08;
      count++;
    }
    return count ? score / count : -Infinity;
  }

  let phaseSource = strong.filter(c => c.time < Math.min(durationSec || nFrames * hopSec, 180)).slice(0, 72);
  if (!phaseSource.length) phaseSource = strong.slice(0, 1);
  let bestAnchor = phaseSource[0] ? phaseSource[0].time : 0;
  let bestAnchorScore = -Infinity;
  for (let i = 0; i < phaseSource.length; i++) {
    const score = scorePhase(phaseSource[i].time, globalStep);
    if (score > bestAnchorScore) {
      bestAnchorScore = score;
      bestAnchor = phaseSource[i].time;
    }
  }
  const halfStep = globalStep * 0.5;
  if (halfStep >= 0.31) {
    const halfScore = scorePhase(bestAnchor, halfStep);
    if (halfScore > bestAnchorScore * 1.04) globalStep = halfStep;
  }
  let anchor = bestAnchor;
  while (anchor - globalStep > 0.05) anchor -= globalStep;

  const duration = durationSec || nFrames * hopSec;
  const sectionLen = duration > 3600 ? 96 : 72;
  const sectionCount = Math.max(1, Math.ceil(duration / sectionLen));
  const sectionSteps = [];
  for (let si = 0; si < sectionCount; si++) {
    const t0 = si * sectionLen;
    const t1 = Math.min(duration, t0 + sectionLen);
    const seg = strong.filter(c => c.time >= t0 && c.time < t1);
    const prevStep = sectionSteps.length ? sectionSteps[sectionSteps.length - 1] : globalStep;
    let localStep = estimateStep(seg) || prevStep || globalStep;
    if (prevStep) localStep = clampRange(localStep, prevStep * 0.94, prevStep * 1.06);
    if (globalStep) localStep = clampRange(localStep, globalStep * 0.86, globalStep * 1.14);
    sectionSteps.push(prevStep ? (localStep * 0.30 + prevStep * 0.70) : localStep);
  }
  function stepAt(time) {
    const idx = Math.max(0, Math.min(sectionSteps.length - 1, Math.floor(time / sectionLen)));
    return sectionSteps[idx] || globalStep || 0.50;
  }

  const beats = [];
  let gridIndex = 0;
  let cursorIdx = 0;
  for (let gridT = anchor; gridT < duration - 0.04;) {
    const localStep = stepAt(gridT) || globalStep || 0.50;
    const winSec = Math.max(0.060, Math.min(0.135, localStep * 0.20));
    while (cursorIdx < candidates.length && candidates[cursorIdx].time < gridT - winSec) cursorIdx++;
    const bestCand = nearestCandidate(gridT, winSec, cursorIdx);
    const gf = Math.max(0, Math.min(nFrames - 1, Math.round(gridT / hopSec)));
    const gridLow = bandAt(lowEnergy, gf);
    const gridHit = bandAt(hitEnergy, gf);
    const gridLowTone = Math.min(2.6, gridLow / lowRef);
    const gridHitTone = Math.min(2.6, gridHit / hitRef);
    const lowTone = bestCand ? Math.max(gridLowTone * 0.62, bestCand.lowTone) : gridLowTone;
    const hitTone = bestCand ? Math.max(gridHitTone * 0.62, bestCand.hitTone) : gridHitTone;
    const distPenalty = bestCand ? (1 - Math.min(1, Math.abs(bestCand.time - gridT) / winSec) * 0.26) : 0.54;
    const basePower = bestCand ? bestCand.power * distPenalty : (gridLowTone * 0.25 + gridHitTone * 0.06);
    const powerRel = clamp01((basePower - p30 * 0.78) / Math.max(0.001, p96 - p30 * 0.78));
    const lowRel = clamp01((gridLow - lowFloor) / Math.max(0.0001, lowCeil - lowFloor));
    const kickRel = clamp01(powerRel * 0.74 + lowRel * 0.22 + clamp01((hitTone - 0.26) / 1.70) * 0.04);
    const softGrid = (!bestCand && lowRel < 0.20) || kickRel < 0.16;
    const slot = gridIndex % 4;
    let combo = slot === 0 ? 'downbeat' : (slot === 1 ? 'push' : (slot === 2 ? 'drop' : 'rebound'));
    if (kickRel > 0.84 && combo !== 'downbeat') combo = 'accent';
    const visualRel = kickRel > 0.76 ? 0.76 + (kickRel - 0.76) * 0.52 : kickRel;
    const downLift = combo === 'downbeat' ? (visualRel > 0.18 ? (0.016 + visualRel * 0.036) : visualRel * 0.028) : 0;
    const sectionGate = clamp01((kickRel - 0.10) / 0.58);
    let impact = Math.max(0.020, Math.min(0.88, 0.022 + Math.pow(visualRel, 1.62) * 0.86 + downLift));
    let strength = Math.max(0.12, Math.min(0.93, 0.13 + Math.pow(visualRel, 1.12) * 0.68 + downLift * 0.70));
    if (softGrid) {
      const softMul = combo === 'downbeat' ? 0.48 : 0.30;
      impact *= softMul;
      strength *= 0.58 + sectionGate * 0.22;
    }
    const timingPull = bestCand ? (0.24 + clamp01((kickRel - 0.25) / 0.65) * 0.46) : 0;
    const sourceTime = bestCand ? (gridT * (1 - timingPull) + bestCand.time * timingPull) : gridT;
    const cameraActive = impact >= 0.13 || (combo === 'downbeat' && kickRel >= 0.14) || (bestCand && kickRel >= 0.18);
    const lowMix = Math.max(0.42, Math.min(0.90, 0.52 + visualRel * 0.32 + lowTone * 0.035 - (combo === 'accent' ? 0.10 : 0)));
    const bodyMix = Math.max(0.035, Math.min(0.54, 0.060 + visualRel * 0.12 + (combo === 'push' ? 0.18 : 0) + (combo === 'drop' ? 0.24 : 0)));
    const snapMix = Math.max(0.015, Math.min(0.62, 0.026 + (combo === 'accent' ? 0.40 : 0) + (combo === 'rebound' ? 0.08 : 0) + visualRel * 0.038));
    beats.push({
      time: sourceTime,
      strength,
      confidence: Math.max(0.44, Math.min(0.99, 0.46 + kickRel * 0.43 + (bestCand ? 0.08 : -0.03))),
      impact,
      primary: cameraActive,
      camera: cameraActive,
      pulse: impact > 0.16 || (combo === 'downbeat' && kickRel >= 0.18),
      tone: 'podcast-dj-server-low-grid',
      low: lowMix,
      body: bodyMix,
      snap: snapMix,
      mass: Math.max(0.36, Math.min(0.94, lowMix * 0.72 + Math.pow(visualRel, 1.22) * 0.24)),
      sharpness: Math.max(0.03, Math.min(0.28, snapMix * 1.18)),
      combo,
      step: localStep,
      index: beats.length,
      dj: true,
      grid: true,
      kickOnly: true,
      server: true,
    });
    gridIndex++;
    gridT += localStep;
  }

  const cameraBeats = beats.filter(b => b.camera !== false);
  const pulseBeats = beats
    .filter(b => b.pulse !== false && (b.impact >= 0.16 || b.combo === 'downbeat'))
    .map(b => ({ time: b.time, strength: b.strength, impact: b.impact, combo: b.combo, low: b.low, body: b.body, snap: b.snap, dj: true }));

  return {
    kicks: beats.map(b => b.time),
    beats,
    pulseBeats,
    cameraBeats,
    gridStep: globalStep,
    sectionSteps,
    tempoSource: 'podcast-dj-server-low-offline',
    duration,
    visualBeatCount: cameraBeats.length,
    analyzedAt: Date.now(),
    debug: {
      candidates: candidates.length,
      hopSec,
      lowRef,
      step: globalStep,
    },
  };
}

async function decodePodcastDjEnergyRange(audioUrl, opts) {
  opts = opts || {};
  const { MPEGDecoder } = await import('mpg123-decoder');
  const decoder = new MPEGDecoder({ enableGapless: false });
  await decoder.ready;

  const durationHint = Math.max(0, Number(opts.durationSec) || 0);
  const hopSec = durationHint > 4200 ? 0.0125 : 0.010;
  const lowEnergy = [];
  const hitEnergy = [];
  let hp = null;
  let lp = null;
  let effectiveSr = 0;
  let sampleStep = 1;
  let hopSize = 0;
  let frameSum = 0;
  let framePeak = 0;
  let frameCount = 0;
  let effectiveSamples = 0;
  let chunks = 0;
  let decodedSamples = 0;
  const limitSec = Math.max(0, Number(opts.limitSec) || 0);

  function initFilters(sampleRate) {
    if (effectiveSr) return;
    sampleStep = sampleRate >= 44100 ? 4 : (sampleRate >= 32000 ? 3 : 2);
    effectiveSr = sampleRate / sampleStep;
    hopSize = Math.max(80, Math.floor(effectiveSr * hopSec));
    hp = makeBiquad('highpass', 32, 0.72, effectiveSr);
    lp = makeBiquad('lowpass', 178, 0.82, effectiveSr);
  }

  function pushFrame() {
    const count = Math.max(1, frameCount);
    lowEnergy.push(Math.sqrt(frameSum / count));
    hitEnergy.push(framePeak);
    frameSum = 0;
    framePeak = 0;
    frameCount = 0;
  }

  function processDecoded(result) {
    if (!result || !result.samplesDecoded || !result.channelData || !result.channelData.length) return;
    const sr = result.sampleRate || 44100;
    initFilters(sr);
    const left = result.channelData[0];
    const right = result.channelData[1];
    const n = Math.min(result.samplesDecoded, left ? left.length : 0, right ? right.length : (left ? left.length : 0));
    decodedSamples += n;
    for (let i = 0; i < n; i += sampleStep) {
      const x = right ? ((left[i] || 0) + (right[i] || 0)) * 0.5 : (left[i] || 0);
      const y = runBiquad(lp, runBiquad(hp, x));
      const ay = Math.abs(y);
      frameSum += y * y;
      if (ay > framePeak) framePeak = ay;
      frameCount++;
      effectiveSamples++;
      if (frameCount >= hopSize) pushFrame();
    }
  }

  try {
    const headers = {
      'User-Agent': opts.userAgent || DEFAULT_UA,
      'Referer': 'https://music.163.com/',
    };
    if (opts.range) headers.Range = opts.range;
    const resp = await fetch(audioUrl, { headers });
    if (!resp.ok && resp.status !== 206) throw new Error('Audio fetch failed: ' + resp.status);
    if (!resp.body) throw new Error('Audio response has no body');
    const reader = resp.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || !value.length) continue;
      chunks++;
      processDecoded(decoder.decode(value instanceof Uint8Array ? value : new Uint8Array(value)));
      if (limitSec && effectiveSr && effectiveSamples / effectiveSr >= limitSec) {
        try { await reader.cancel(); } catch (e) {}
        break;
      }
      if (chunks % 12 === 0) await new Promise(resolve => setImmediate(resolve));
    }
    processDecoded(decoder.decode(new Uint8Array(0)));
    if (frameCount > 0) pushFrame();
  } finally {
    decoder.free();
  }

  return {
    lowEnergy,
    hitEnergy,
    hopSec,
    duration: effectiveSr ? effectiveSamples / effectiveSr : 0,
    decode: {
      chunks,
      decodedSamples,
      sampleRate: effectiveSr ? effectiveSr * sampleStep : 0,
      effectiveSampleRate: effectiveSr,
      frames: lowEnergy.length,
    },
  };
}

async function analyzePodcastDjIntro(audioUrl, opts) {
  opts = opts || {};
  if (!audioUrl || !/^https?:\/\//i.test(audioUrl)) throw new Error('Invalid audio url');
  const requestedDuration = Math.max(0, Number(opts.durationSec) || 0);
  const introSec = clampRange(Number(opts.introSec) || 180, 90, 240);
  const decoded = await decodePodcastDjEnergyRange(audioUrl, {
    durationSec: introSec,
    userAgent: opts.userAgent,
    limitSec: introSec + 8,
  });
  const frameLimit = Math.max(1, Math.min(decoded.lowEnergy.length, Math.ceil((introSec + 2) / Math.max(0.001, decoded.hopSec || 0.010))));
  const lowEnergy = decoded.lowEnergy.slice(0, frameLimit);
  const hitEnergy = decoded.hitEnergy.slice(0, frameLimit);
  const mapDuration = Math.min(introSec, lowEnergy.length * decoded.hopSec);
  const map = buildBeatMapFromLowEnergy(lowEnergy, hitEnergy, decoded.hopSec, mapDuration);
  map.partial = true;
  map.partialUntilSec = mapDuration;
  map.fullDuration = requestedDuration || 0;
  map.tempoSource = 'podcast-dj-server-intro-offline';
  map.decode = Object.assign({}, decoded.decode || {}, {
    intro: true,
    requestedDurationSec: requestedDuration,
    effectiveDurationSec: decoded.duration,
    partialUntilSec: mapDuration,
  });
  map.debug = Object.assign({}, map.debug || {}, {
    intro: true,
    partialUntilSec: mapDuration,
  });
  return map;
}

async function analyzePodcastDjRangeSamples(audioUrl, opts) {
  opts = opts || {};
  const duration = Math.max(0, Number(opts.durationSec) || 0);
  if (!duration) throw new Error('Long podcast analysis needs duration');

  let contentLength = 0;
  try {
    const head = await fetch(audioUrl, {
      method: 'HEAD',
      headers: {
        'User-Agent': opts.userAgent || DEFAULT_UA,
        'Referer': 'https://music.163.com/',
      },
    });
    contentLength = Number(head.headers.get('content-length') || 0) || 0;
  } catch (err) {
    contentLength = 0;
  }
  if (!contentLength) {
    return analyzePodcastDjStreamFull(audioUrl, opts);
  }

  const sampleCount = duration > 14400 ? 12 : (duration > 9000 ? 10 : 8);
  const sampleStarts = [];
  for (let i = 0; i < sampleCount; i++) {
    const pos = sampleCount === 1 ? 0 : i / (sampleCount - 1);
    const shaped = i === 0 ? 0 : (i === sampleCount - 1 ? 0.88 : 0.08 + pos * 0.80);
    sampleStarts.push(duration * shaped);
  }
  const sampleWindow = duration > 14400 ? 82 : (duration > 9000 ? 88 : 96);
  const sampleMaps = [];
  let totalChunks = 0;
  let totalDecoded = 0;

  for (let i = 0; i < sampleStarts.length; i++) {
    const targetTime = Math.max(0, Math.min(duration - sampleWindow, sampleStarts[i]));
    const bytePerSec = contentLength / Math.max(1, duration);
    const prerollBytes = i === 0 ? 0 : Math.min(384 * 1024, Math.floor(bytePerSec * 4));
    const startByte = Math.max(0, Math.floor(targetTime * bytePerSec) - prerollBytes);
    const windowBytes = Math.max(768 * 1024, Math.floor(sampleWindow * bytePerSec) + prerollBytes + 128 * 1024);
    const endByte = Math.min(contentLength - 1, startByte + windowBytes);
    const approxOffset = startByte / contentLength * duration;
    const decoded = await decodePodcastDjEnergyRange(audioUrl, {
      durationSec: sampleWindow,
      userAgent: opts.userAgent,
      range: 'bytes=' + startByte + '-' + endByte,
    });
    totalChunks += decoded.decode.chunks || 0;
    totalDecoded += decoded.decode.decodedSamples || 0;
    const map = buildBeatMapFromLowEnergy(decoded.lowEnergy, decoded.hitEnergy, decoded.hopSec, decoded.duration || sampleWindow);
    if (map && map.visualBeatCount >= 8 && map.gridStep) {
      sampleMaps.push({ offset: approxOffset, map });
    }
  }

  if (!sampleMaps.length) {
    return {
      kicks: [],
      beats: [],
      pulseBeats: [],
      cameraBeats: [],
      duration,
      visualBeatCount: 0,
      tempoSource: 'podcast-dj-server-range-empty',
      analyzedAt: Date.now(),
    };
  }

  function phaseFromMap(map, baseStep) {
    const step = clampRange(baseStep || map.gridStep || 0.50, 0.32, 0.86);
    const beats = (map.cameraBeats && map.cameraBeats.length ? map.cameraBeats : (map.beats || []))
      .filter(b => b && Number.isFinite(b.time) && b.time > 0.35);
    if (!beats.length) return { phase: 0, step };
    let sx = 0;
    let sy = 0;
    let total = 0;
    for (let i = 0; i < beats.length; i++) {
      const b = beats[i];
      const impact = b.impact == null ? (b.strength || 0.3) : b.impact;
      const w = 0.20 + Math.pow(Math.max(0, impact), 1.45);
      const phase = ((b.time % step) + step) % step;
      const angle = phase / step * Math.PI * 2;
      sx += Math.cos(angle) * w;
      sy += Math.sin(angle) * w;
      total += w;
    }
    if (total <= 0) return { phase: ((beats[0].time % step) + step) % step, step };
    let angle = Math.atan2(sy / total, sx / total);
    if (angle < 0) angle += Math.PI * 2;
    return { phase: angle / (Math.PI * 2) * step, step };
  }

  const stepVotes = [];
  sampleMaps.forEach(s => {
    const w = Math.max(1, Math.min(16, Math.round((s.map.visualBeatCount || 0) / 16)));
    for (let i = 0; i < w; i++) stepVotes.push(s.map.gridStep);
  });
  let globalStep = clampRange(median(stepVotes) || sampleMaps[0].map.gridStep || 0.50, 0.32, 0.86);
  const firstMap = sampleMaps[0].map;
  const firstBeat = (firstMap.cameraBeats || firstMap.beats || [])[0];
  let anchor = (firstBeat && firstBeat.time ? firstBeat.time : 0);
  while (anchor - globalStep > 0.05) anchor -= globalStep;

  const profiles = sampleMaps.map(s => {
    const beats = s.map.cameraBeats || s.map.beats || [];
    const impacts = beats.map(b => b.impact == null ? b.strength : b.impact).filter(v => Number.isFinite(v));
    const activeImpacts = impacts.filter(v => v >= 0.10);
    const avgImpact = activeImpacts.length ? activeImpacts.reduce((a, b) => a + b, 0) / activeImpacts.length : 0.16;
    const hiImpact = impacts.length ? percentile(impacts, 0.90, 4000) : Math.max(0.55, avgImpact);
    const activity = beats.length / Math.max(20, s.map.duration || 20);
    const phaseInfo = phaseFromMap(s.map, globalStep);
    return {
      time: s.offset,
      avg: clampRange(avgImpact * clampRange(activity / 1.65, 0.38, 1.05), 0.08, 0.72),
      hi: clampRange(hiImpact, 0.18, 0.96),
      activity: clampRange(activity / 1.65, 0.18, 1.12),
      step: globalStep,
      anchor: s.offset + (phaseInfo.phase || 0),
    };
  }).sort((a, b) => a.time - b.time);

  function profileAt(time) {
    if (profiles.length === 1) return profiles[0];
    let prev = profiles[0];
    let next = profiles[profiles.length - 1];
    for (let i = 0; i < profiles.length; i++) {
      if (profiles[i].time <= time) prev = profiles[i];
      if (profiles[i].time >= time) { next = profiles[i]; break; }
    }
    if (prev === next) return prev;
    const mix = clamp01((time - prev.time) / Math.max(1, next.time - prev.time));
    return {
      time,
      avg: prev.avg + (next.avg - prev.avg) * mix,
      hi: prev.hi + (next.hi - prev.hi) * mix,
      activity: prev.activity + (next.activity - prev.activity) * mix,
      step: prev.step + (next.step - prev.step) * mix,
    };
  }

  const beats = [];
  let gridIndex = 0;
  function pushRangeBeat(t, stepOverride) {
    const p = profileAt(t);
    const slot = gridIndex % 4;
    let combo = slot === 0 ? 'downbeat' : (slot === 1 ? 'push' : (slot === 2 ? 'drop' : 'rebound'));
    const sectionEnergy = clamp01((p.avg - 0.055) / 0.54) * clampRange(p.activity || 0.5, 0.30, 1.10);
    const motion = (Math.sin(gridIndex * 1.618 + p.avg * 9.7) * 0.5 + Math.sin(gridIndex * 0.317) * 0.28) * (0.08 + sectionEnergy * 0.17);
    const rel = clamp01(0.12 + sectionEnergy * 0.70 + motion + (combo === 'downbeat' ? 0.060 : 0));
    if (rel > 0.82 && combo !== 'downbeat') combo = 'accent';
    const visualRel = rel > 0.78 ? 0.78 + (rel - 0.78) * 0.50 : rel;
    const comboLift = combo === 'downbeat' ? 0.10 * sectionEnergy : (combo === 'drop' ? 0.050 * sectionEnergy : (combo === 'accent' ? 0.075 * sectionEnergy : 0));
    const impact = clampRange(0.026 + Math.pow(visualRel, 1.48) * (0.42 + p.hi * 0.34) + comboLift, 0.020, 0.90);
    const strength = clampRange(0.15 + Math.pow(visualRel, 1.02) * 0.66 + comboLift * 0.68, 0.12, 0.93);
    const cameraActive = impact >= 0.105 || (combo === 'downbeat' && sectionEnergy >= 0.16);
    const low = clampRange(0.50 + visualRel * 0.32 + (combo === 'downbeat' ? 0.050 * sectionEnergy : 0) - (combo === 'accent' ? 0.12 : 0), 0.42, 0.90);
    const body = clampRange(0.06 + visualRel * 0.15 + (combo === 'push' ? 0.22 * sectionEnergy : 0) + (combo === 'drop' ? 0.30 * sectionEnergy : 0), 0.045, 0.56);
    const snap = clampRange(0.025 + visualRel * 0.035 + (combo === 'accent' ? 0.40 * sectionEnergy : 0) + (combo === 'rebound' ? 0.12 * sectionEnergy : 0), 0.02, 0.62);
    beats.push({
      time: t,
      strength,
      confidence: 0.68 + visualRel * 0.22,
      impact,
      primary: cameraActive,
      camera: cameraActive,
      pulse: impact > 0.16 || (combo === 'downbeat' && sectionEnergy >= 0.24),
      tone: 'podcast-dj-server-range-grid',
      low,
      body,
      snap,
      mass: clampRange(low * 0.72 + Math.pow(visualRel, 1.22) * 0.24, 0.36, 0.94),
      sharpness: combo === 'accent' ? 0.20 : 0.08,
      combo,
      step: stepOverride || p.step || globalStep,
      index: beats.length,
      dj: true,
      grid: true,
      kickOnly: true,
      server: true,
      sampled: true,
    });
    gridIndex++;
  }
  for (let si = 0; si < profiles.length; si++) {
    const p = profiles[si];
    const start = si === 0 ? 0 : (profiles[si - 1].time + p.time) * 0.5;
    const end = si === profiles.length - 1 ? duration : (p.time + profiles[si + 1].time) * 0.5;
    const localStep = globalStep;
    let t = Number.isFinite(p.anchor) ? p.anchor : anchor;
    while (t - localStep > start) t -= localStep;
    while (t < start) t += localStep;
    for (; t < end - 0.04; t += localStep) pushRangeBeat(t, localStep);
  }

  const cameraBeats = beats.filter(b => b.camera !== false);
  const pulseBeats = beats
    .filter(b => b.pulse !== false && (b.impact >= 0.16 || b.combo === 'downbeat'))
    .map(b => ({ time: b.time, strength: b.strength, impact: b.impact, combo: b.combo, low: b.low, body: b.body, snap: b.snap, dj: true }));

  return {
    kicks: beats.map(b => b.time),
    beats,
    pulseBeats,
    cameraBeats,
    gridStep: globalStep,
    sectionSteps: profiles.map(p => p.step),
    tempoSource: 'podcast-dj-server-range-offline',
    duration,
    visualBeatCount: cameraBeats.length,
    analyzedAt: Date.now(),
    debug: {
      rangeSampled: true,
      samples: sampleMaps.length,
      profiles,
      contentLength,
      decode: { chunks: totalChunks, decodedSamples: totalDecoded },
    },
  };
}

async function analyzePodcastDjStream(audioUrl, opts) {
  opts = opts || {};
  if (!audioUrl || !/^https?:\/\//i.test(audioUrl)) throw new Error('Invalid audio url');
  const durationSec = Math.max(0, Number(opts.durationSec) || 0);
  if (durationSec > 3300 && durationSec <= FULL_STREAM_QUALITY_LIMIT_SEC) {
    try {
      const map = await analyzePodcastDjStreamFull(audioUrl, Object.assign({}, opts, { preferQualityFullStream: true }));
      map.debug = Object.assign({}, map.debug || {}, { fullStreamQuality: true, requestedDurationSec: durationSec });
      return map;
    } catch (err) {
      console.warn('[PodcastDjBeatmap] full-stream quality path failed, falling back to range:', err && err.message ? err.message : err);
      return analyzePodcastDjRangeSamples(audioUrl, opts);
    }
  }
  if (durationSec > FULL_STREAM_QUALITY_LIMIT_SEC) {
    return analyzePodcastDjRangeSamples(audioUrl, opts);
  }
  return analyzePodcastDjStreamFull(audioUrl, opts);
}

async function analyzePodcastDjStreamFull(audioUrl, opts) {
  opts = opts || {};
  const { MPEGDecoder } = await import('mpg123-decoder');
  const decoder = new MPEGDecoder({ enableGapless: false });
  await decoder.ready;

  const durationHint = Math.max(0, Number(opts.durationSec) || 0);
  const hopSec = durationHint > 9000 ? 0.0125 : 0.010;
  const lowEnergy = [];
  const hitEnergy = [];
  let hp = null;
  let lp = null;
  let effectiveSr = 0;
  let sampleStep = 1;
  let hopSize = 0;
  let frameSum = 0;
  let framePeak = 0;
  let frameCount = 0;
  let effectiveSamples = 0;
  let chunks = 0;
  let decodedSamples = 0;

  function initFilters(sampleRate) {
    if (effectiveSr) return;
    sampleStep = sampleRate >= 44100 ? 4 : (sampleRate >= 32000 ? 3 : 2);
    effectiveSr = sampleRate / sampleStep;
    hopSize = Math.max(80, Math.floor(effectiveSr * hopSec));
    hp = makeBiquad('highpass', 32, 0.72, effectiveSr);
    lp = makeBiquad('lowpass', 178, 0.82, effectiveSr);
  }

  function pushFrame() {
    const count = Math.max(1, frameCount);
    lowEnergy.push(Math.sqrt(frameSum / count));
    hitEnergy.push(framePeak);
    frameSum = 0;
    framePeak = 0;
    frameCount = 0;
  }

  function processDecoded(result) {
    if (!result || !result.samplesDecoded || !result.channelData || !result.channelData.length) return;
    const sr = result.sampleRate || 44100;
    initFilters(sr);
    const left = result.channelData[0];
    const right = result.channelData[1];
    const n = Math.min(result.samplesDecoded, left ? left.length : 0, right ? right.length : (left ? left.length : 0));
    decodedSamples += n;
    for (let i = 0; i < n; i += sampleStep) {
      const x = right ? ((left[i] || 0) + (right[i] || 0)) * 0.5 : (left[i] || 0);
      const y = runBiquad(lp, runBiquad(hp, x));
      const ay = Math.abs(y);
      frameSum += y * y;
      if (ay > framePeak) framePeak = ay;
      frameCount++;
      effectiveSamples++;
      if (frameCount >= hopSize) pushFrame();
    }
  }

  try {
    const resp = await fetch(audioUrl, {
      headers: {
        'User-Agent': opts.userAgent || DEFAULT_UA,
        'Referer': 'https://music.163.com/',
      },
    });
    if (!resp.ok || !resp.body) throw new Error('Audio fetch failed: ' + resp.status);
    const reader = resp.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || !value.length) continue;
      chunks++;
      processDecoded(decoder.decode(value instanceof Uint8Array ? value : new Uint8Array(value)));
      if (chunks % 12 === 0) await new Promise(resolve => setImmediate(resolve));
    }
    const tail = decoder.decode(new Uint8Array(0));
    processDecoded(tail);
    if (frameCount > 0) pushFrame();
  } finally {
    decoder.free();
  }

  const effectiveDuration = effectiveSr ? effectiveSamples / effectiveSr : 0;
  const duration = effectiveDuration || durationHint;
  const map = buildBeatMapFromLowEnergy(lowEnergy, hitEnergy, hopSec, duration);
  map.decode = {
    chunks,
    decodedSamples,
    sampleRate: effectiveSr ? effectiveSr * sampleStep : 0,
    effectiveSampleRate: effectiveSr,
    frames: lowEnergy.length,
    requestedDurationSec: durationHint,
    effectiveDurationSec: effectiveDuration,
    fullStreamQuality: !!opts.preferQualityFullStream,
  };
  return map;
}

module.exports = {
  analyzePodcastDjStream,
  analyzePodcastDjIntro,
  buildBeatMapFromLowEnergy,
};
