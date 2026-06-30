// ============================================================
//  Mineradio — 04-shelf3d.js
// ============================================================

// ============================================================
//  离线节拍预解析 (v7.2)
//    流程: fetch 完整音频 → OfflineAudioContext.decodeAudioData
//          → 低通滤波 (只保留 60-150Hz, 即 kick 频段)
//          → 短时能量曲线 → 自适应阈值检测峰值
//          → 输出 kick 时间戳数组 (单位: 秒)
//    优点: 完全规避人声干扰; 预先准备好节奏表
//    缺点: 每首歌首次要 1-3 秒
// ============================================================
function medianGap(times, minGap, maxGap) {
  if (!times || times.length < 2) return 0;
  var gaps = [];
  for (var i = 1; i < times.length; i++) {
    var gap = times[i] - times[i - 1];
    if (gap >= minGap && gap <= maxGap) gaps.push(gap);
  }
  gaps.sort(function(a,b){ return a - b; });
  return gaps.length ? gaps[Math.floor(gaps.length * 0.5)] : 0;
}

function normalizeMusicTempoBeats(times, duration) {
  if (!times || !times.length) return [];
  var sorted = times
    .filter(function(t){ return isFinite(t) && t >= 0.05 && (!duration || t < duration - 0.05); })
    .sort(function(a,b){ return a - b; });
  if (sorted.length < 4) return sorted;
  var gap = medianGap(sorted, 0.20, 1.20);
  var minMainGap = gap && gap < 0.42 ? Math.min(0.44, gap * 1.65) : 0.36;
  var out = [];
  var last = -10;
  for (var i = 0; i < sorted.length; i++) {
    if (sorted[i] - last >= minMainGap) {
      out.push(sorted[i]);
      last = sorted[i];
    }
  }
  return out;
}

function estimateTempoPhaseOffset(tempoBeats, beatCandidates, step, duration) {
  if (!tempoBeats || tempoBeats.length < 8 || !beatCandidates || beatCandidates.length < 4 || !step) return 0;
  var maxOffset = Math.min(0.26, Math.max(0.12, step * 0.58));
  var binSize = 0.025;
  var bins = {};
  var samples = [];
  var totalWeight = 0;
  var ti = 0;
  for (var i = 0; i < beatCandidates.length; i++) {
    var b = beatCandidates[i];
    if (!b || !isFinite(b.time)) continue;
    if (duration && (b.time < 1.0 || b.time > duration - 0.5)) continue;
    var strength = Math.max(0, Math.min(1, b.strength || 0));
    if (!b.camera && strength < 0.54) continue;
    if (b.low != null && b.low < 0.18 && strength < 0.66) continue;
    while (ti < tempoBeats.length - 1 && Math.abs(tempoBeats[ti + 1] - b.time) <= Math.abs(tempoBeats[ti] - b.time)) ti++;
    var base = tempoBeats[ti];
    var offset = b.time - base;
    if (!isFinite(offset) || Math.abs(offset) > maxOffset) continue;
    var weight = 0.20 + strength * strength * 1.35;
    if (b.primary) weight *= 1.35;
    if (b.camera) weight *= 1.18;
    if (b.mass != null) weight *= 0.82 + Math.max(0, Math.min(1, b.mass)) * 0.42;
    if (Math.abs(offset) < 0.025) weight *= 0.72;
    var key = Math.round(offset / binSize);
    bins[key] = (bins[key] || 0) + weight;
    samples.push({ offset: offset, weight: weight, key: key });
    totalWeight += weight;
  }
  if (samples.length < 4 || totalWeight <= 0) return 0;
  var bestKey = null;
  var bestWeight = 0;
  Object.keys(bins).forEach(function(k){
    var key = parseInt(k, 10);
    var w = (bins[key] || 0) + (bins[key - 1] || 0) * 0.72 + (bins[key + 1] || 0) * 0.72;
    if (w > bestWeight) {
      bestWeight = w;
      bestKey = key;
    }
  });
  if (bestKey == null || bestWeight < totalWeight * 0.26) return 0;
  var sum = 0;
  var wsum = 0;
  for (var si = 0; si < samples.length; si++) {
    var s = samples[si];
    if (Math.abs(s.key - bestKey) <= 1) {
      sum += s.offset * s.weight;
      wsum += s.weight;
    }
  }
  if (wsum <= 0) return 0;
  var offsetOut = sum / wsum;
  return Math.abs(offsetOut) >= 0.045 ? Math.max(-maxOffset, Math.min(maxOffset, offsetOut)) : 0;
}

var musicTempoLoadPromise = null;
function ensureMusicTempo() {
  if (window.MusicTempo) return Promise.resolve(window.MusicTempo);
  if (musicTempoLoadPromise) return musicTempoLoadPromise;
  musicTempoLoadPromise = fetch('/vendor/music-tempo.min.js')
    .then(function(resp){
      if (!resp.ok) throw new Error('music-tempo load failed: ' + resp.status);
      return resp.text();
    })
    .then(function(code){
      (0, eval)(code);
      return window.MusicTempo || null;
    })
    .catch(function(err){
      console.warn('music-tempo dynamic load failed:', err);
      return null;
    });
  return musicTempoLoadPromise;
}

var musicTempoWorkerUrl = null;
function getMusicTempoWorkerUrl() {
  if (musicTempoWorkerUrl) return musicTempoWorkerUrl;
  var code = [
    'self.onmessage=function(e){',
    'var d=e.data||{};',
    'try{',
    'importScripts(d.scriptUrl||"/vendor/music-tempo.min.js");',
    'var C=self.MusicTempo||(typeof MusicTempo!=="undefined"?MusicTempo:null);',
    'if(!C)throw new Error("MusicTempo unavailable");',
    'var mono=new Float32Array(d.mono);',
    'var mt=new C(mono,{bufferSize:2048,hopSize:Math.max(128,Math.round(d.sampleRate*0.010)),timeStep:0.010,minBeatInterval:0.36,maxBeatInterval:0.95,expiryTime:8});',
    'self.postMessage({ok:true,tempo:mt.tempo||0,beats:mt.beats||[]});',
    '}catch(err){self.postMessage({ok:false,error:(err&&err.message)||String(err)});}',
    '};'
  ].join('');
  musicTempoWorkerUrl = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
  return musicTempoWorkerUrl;
}

async function analyzeMusicTempoInWorker(buffer, token) {
  if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') return null;
  try {
    showBeatChip('后台锁定电影主拍…');
    await yieldToIdle(isHiddenForBackgroundOptimization() ? 20 : 180);
    if (token !== beatMapToken) return null;
    var channels = buffer.numberOfChannels;
    var len = buffer.length;
    var mono = new Float32Array(len);
    var chDataList = [];
    for (var ch = 0; ch < channels; ch++) chDataList.push(buffer.getChannelData(ch));
    var chScale = 1 / Math.max(1, channels);
    var monoChunk = Math.max(4096, Math.floor(buffer.sampleRate * 0.70));
    for (var monoStart = 0; monoStart < len; monoStart += monoChunk) {
      var monoEnd = Math.min(len, monoStart + monoChunk);
      for (var mi = monoStart; mi < monoEnd; mi++) {
        var sum = 0;
        for (var ci = 0; ci < channels; ci++) sum += chDataList[ci][mi] * chScale;
        mono[mi] = sum;
      }
      if ((monoStart / monoChunk) % 2 === 1) {
        await yieldToIdle(isHiddenForBackgroundOptimization() ? 10 : 60);
        if (token !== beatMapToken) return null;
      }
    }
    var worker = new Worker(getMusicTempoWorkerUrl());
    return await new Promise(function(resolve) {
      var done = false;
      var timer = setTimeout(function(){
        if (done) return;
        done = true;
        worker.terminate();
        resolve(null);
      }, 16000);
      worker.onmessage = function(ev) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        worker.terminate();
        var data = ev.data || {};
        if (!data.ok) {
          console.warn('music-tempo worker failed:', data.error);
          resolve(null);
          return;
        }
        resolve(data);
      };
      worker.onerror = function(err) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        worker.terminate();
        console.warn('music-tempo worker error:', err && err.message ? err.message : err);
        resolve(null);
      };
      worker.postMessage({
        mono: mono.buffer,
        sampleRate: buffer.sampleRate,
        scriptUrl: location.origin + '/vendor/music-tempo.min.js'
      }, [mono.buffer]);
    });
  } catch (err) {
    console.warn('music-tempo worker setup failed:', err);
    return null;
  }
}

function scheduleBeatAnalysis(songId, audioUrl, token, song) {
  if (!songId || !audioUrl) return;
  if (djMode.active) {
    cancelBeatAnalysisTimer();
    beatAnalysisStartedAt = 0;
    hideBeatChip();
    return;
  }
  cancelBeatAnalysisTimer();
  beatAnalysisStartedAt = 0;
  hideBeatChip();
  beatAnalysisTimer = setTimeout(function waitForQuietStart(){
    beatAnalysisTimer = null;
    if (token !== beatMapToken || !audio || audio.paused) return;
    var current = audio.currentTime || 0;
    if (current < beatAnalysisConfig.minPlaybackSec) {
      beatAnalysisTimer = setTimeout(waitForQuietStart, Math.max(500, (beatAnalysisConfig.minPlaybackSec - current) * 1000));
      return;
    }
    var startAnalysis = async function(){
      if (token !== beatMapToken || !audio || audio.paused || beatMapCache[songId]) return;
      var diskMap = await readBeatDiskCache(songId);
      if (diskMap) {
        applyBeatMapCacheForCurrent(songId, diskMap, token, 'D盘节拍缓存命中:');
        return;
      }
      if (token !== beatMapToken || !audio || audio.paused || beatMapCache[songId]) return;
      if (beatMapBusy) {
        beatAnalysisTimer = setTimeout(function(){
          beatAnalysisTimer = null;
          scheduleAnalysisTask(startAnalysis, 260);
        }, 420);
        return;
      }
      beatAnalysisStartedAt = performance.now();
      analyzeAudioBeats(audioUrl, null, token, {
        skipMusicTempo: beatAnalysisConfig.skipMusicTempoWhilePlaying && !audio.paused,
        background: true,
        song: song || null
      }).then(function(map){
        if (token !== beatMapToken || !map) return;
        smoothBeatMapHandoff(songId, map, token, song || null);
      }).catch(function(err){
        console.warn('scheduled beat analysis failed:', err);
        hideBeatChip();
      });
    };
    scheduleAnalysisTask(startAnalysis, beatAnalysisConfig.idleTimeout);
  }, beatAnalysisConfig.delayMs);
}

function beatMapSongKey(song) {
  if (!song) return '';
  if (song.type === 'local' && song.localKey) return 'local:' + song.localKey;
  if (songProviderKey(song) === 'qq') return 'qq:' + (song.mid || song.songmid || song.id || (song.name + '|' + song.artist));
  if (song.id != null && song.id !== '') return 'song:' + song.id;
  return '';
}

function localBeatDiskKey(localKey, mode) {
  if (!localKey) return '';
  return 'local:' + localKey + ':' + (mode === 'dj' ? 'dj' : 'mr');
}

function updateBeatDiskCacheStatus(data) {
  if (!data) return;
  beatDiskCacheStatus.checked = true;
  beatDiskCacheStatus.enabled = !!data.enabled || data.mode === 'disk';
  beatDiskCacheStatus.mode = data.mode || (beatDiskCacheStatus.enabled ? 'disk' : 'memory-only');
  beatDiskCacheStatus.reason = data.reason || '';
  if (!beatDiskCacheStatus.enabled && !beatDiskCacheNoticeLogged) {
    beatDiskCacheNoticeLogged = true;
    console.log('节拍磁盘缓存不可用，已降级为本次运行内存缓存:', beatDiskCacheStatus.reason || 'unknown');
  }
}

async function ensureBeatDiskCacheStatus() {
  if (beatDiskCacheStatus.checked) return beatDiskCacheStatus;
  try {
    updateBeatDiskCacheStatus(await apiJson('/api/beatmap/cache/status?t=' + Date.now()));
  } catch (e) {
    updateBeatDiskCacheStatus({ enabled:false, mode:'memory-only', reason:'STATUS_FAILED' });
  }
  return beatDiskCacheStatus;
}

async function readBeatDiskCache(key) {
  if (!key || beatMapCache[key]) return beatMapCache[key] || null;
  var st = await ensureBeatDiskCacheStatus();
  if (!st.enabled) return null;
  try {
    var r = await apiJson('/api/beatmap/cache?key=' + encodeURIComponent(key) + '&t=' + Date.now());
    if (r && r.enabled === false) updateBeatDiskCacheStatus(r);
    if (!r || !r.hit || !r.map) return null;
    var map = unpackLocalBeatMap(r.map);
    if (!map) return null;
    beatMapCache[key] = map;
    return map;
  } catch (e) {
    console.warn('beat disk cache read failed:', e);
    return null;
  }
}

async function writeBeatDiskCache(key, map, song, mode) {
  if (!key || !map) return false;
  var st = await ensureBeatDiskCacheStatus();
  if (!st.enabled) return false;
  try {
    var packed = packLocalBeatMap(map);
    if (!packed) return false;
    var r = await apiJson('/api/beatmap/cache', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: key,
        mode: mode || 'mr',
        provider: songProviderKey(song),
        title: song && song.name,
        artist: song && song.artist,
        map: packed
      })
    });
    if (r && r.enabled === false) updateBeatDiskCacheStatus(r);
    return !!(r && r.ok);
  } catch (e) {
    console.warn('beat disk cache write failed:', e);
    return false;
  }
}

function isBeatPrefetchCandidate(song) {
  if (!song || isPodcastSong(song) || song.type === 'local' || song.localUrl) return false;
  return !!beatMapSongKey(song);
}

function findNextBeatPrefetchIndex(fromIdx, seen) {
  if (!playQueue.length) return -1;
  seen = seen || {};
  var total = playQueue.length;
  for (var step = 1; step < total; step++) {
    var idx = (fromIdx + step + total) % total;
    if (idx === currentIdx) continue;
    var song = playQueue[idx];
    if (!isBeatPrefetchCandidate(song)) continue;
    var key = beatMapSongKey(song);
    if (!key || beatMapCache[key] || seen[key]) continue;
    return idx;
  }
  return -1;
}

function normalizeBeatPrefetchState(state) {
  state = state || {};
  return {
    keys: Object.assign({}, state.keys || state),
    count: Math.max(0, Number(state.count) || 0)
  };
}

async function fetchBeatPrefetchAudioUrl(song) {
  if (!song) return null;
  var isQQ = songProviderKey(song) === 'qq';
  var requestedQuality = normalizePlaybackQuality(playbackQuality);
  if (!isQQ && requestedQuality === 'jymaster' && !hasProviderSvip('netease', loginStatus)) requestedQuality = 'hires';
  if (isQQ && qqPlaybackQualityCeiling && (requestedQuality === 'jymaster' || requestedQuality === 'hires' || requestedQuality === 'lossless')) requestedQuality = qqPlaybackQualityCeiling;
  var qualityParam = '&quality=' + encodeURIComponent(requestedQuality);
  var data = isQQ
    ? await apiJson('/api/qq/song/url?mid=' + encodeURIComponent(song.mid || song.songmid || song.id || '') + '&mediaMid=' + encodeURIComponent(song.mediaMid || song.media_mid || '') + qualityParam)
    : await apiJson('/api/song/url?id=' + encodeURIComponent(song.id) + qualityParam);
  if (!data || !data.url || data.trial) return null;
  return '/api/audio?url=' + encodeURIComponent(data.url);
}

function scheduleQueueBeatPrefetch(fromIdx, delayMs, state) {
  cancelBeatPrefetchTimer();
  if (!playQueue.length || beatPrefetchBusy || localBeatAnalysis.active) return;
  var prefetchState = normalizeBeatPrefetchState(state);
  if (prefetchState.count >= BEAT_PREFETCH_LIMIT) return;
  var token = beatMapToken;
  var seq = ++beatPrefetchToken;
  var startIdx = isFinite(fromIdx) ? fromIdx : currentIdx;
  var waitMs = delayMs == null ? 1800 : delayMs;
  if (typeof isRenderInteractionActive === 'function' && isRenderInteractionActive()) waitMs = Math.max(waitMs, 2200);
  beatPrefetchTimer = setTimeout(function(){
    beatPrefetchTimer = null;
    runQueueBeatPrefetch(startIdx, token, seq, prefetchState);
  }, waitMs);
}

async function runQueueBeatPrefetch(fromIdx, token, seq, state) {
  if (token !== beatMapToken || seq !== beatPrefetchToken || beatPrefetchBusy || !playQueue.length) return;
  if (audio && audio.paused) return;
  state = normalizeBeatPrefetchState(state);
  if (state.count >= BEAT_PREFETCH_LIMIT) return;
  var idx = findNextBeatPrefetchIndex(fromIdx, state.keys);
  if (idx < 0) return;
  var song = hydrateCustomCover(playQueue[idx]);
  var key = beatMapSongKey(song);
  if (!key) return;
  state.keys[key] = true;
  state.count++;
  beatPrefetchBusy = true;
  beatPrefetchLastKey = key;
  try {
    if (token !== beatMapToken || seq !== beatPrefetchToken) return;
    var diskMap = await readBeatDiskCache(key);
    if (diskMap) {
      console.log('队列节奏D盘缓存命中:', song.name || key, diskMap.visualBeatCount || 0);
      return;
    }
    var audioUrl = await fetchBeatPrefetchAudioUrl(song);
    if (token !== beatMapToken || seq !== beatPrefetchToken || !audioUrl || beatMapCache[key]) return;
    while (typeof isRenderInteractionActive === 'function' && isRenderInteractionActive() && token === beatMapToken && seq === beatPrefetchToken) {
      await yieldToIdle(isHiddenForBackgroundOptimization() ? 30 : 320);
    }
    if (token !== beatMapToken || seq !== beatPrefetchToken || beatMapCache[key]) return;
    while (beatMapBusy && token === beatMapToken && seq === beatPrefetchToken) {
      await yieldToIdle(isHiddenForBackgroundOptimization() ? 30 : 240);
    }
    if (token !== beatMapToken || seq !== beatPrefetchToken || beatMapCache[key]) return;
    var map = await analyzeAudioBeats(audioUrl, null, token, {
      background: true,
      prefetch: true,
      song: song
    });
    if (token !== beatMapToken || seq !== beatPrefetchToken || !map) return;
    beatMapCache[key] = map;
    writeBeatDiskCache(key, map, song, 'mr');
    console.log('队列节奏预热完成:', song.name || key, map.visualBeatCount || 0);
  } catch (err) {
    console.warn('queue beat prefetch failed:', err && err.message ? err.message : err);
  } finally {
    beatPrefetchBusy = false;
    if (state.count < BEAT_PREFETCH_LIMIT && token === beatMapToken && seq === beatPrefetchToken && playQueue.length && !(audio && audio.paused)) {
      scheduleQueueBeatPrefetch(idx, 1600, state);
    }
  }
}

async function analyzeAudioBeats(audioUrl, durationSec, token, options) {
  options = options || {};
  var analysisProfile = cinemaAnalysisProfileForSong(options.song);
  var softGrooveAnalysis = !!(analysisProfile && analysisProfile.softGroove);
  try {
    beatMapBusy = true;
    if (options.prefetch) showBeatChip('预热下一首节奏…');
    else if (options.background) showBeatChip('后台缓冲节奏…');
    await yieldToIdle(beatAnalysisYieldMs(options, 140, 760));
    if (token !== beatMapToken) { hideBeatChip(); beatMapBusy = false; return null; }
    showBeatChip('正在分析节奏…');
    var resp = await fetch(audioUrl);
    if (token !== beatMapToken) { hideBeatChip(); return null; }
    var ab = await resp.arrayBuffer();
    if (token !== beatMapToken) { hideBeatChip(); return null; }

    // 用临时 AudioContext 解码 (我们不能复用 audioCtx 因为它可能 closed)
    var TmpCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!TmpCtx) { hideBeatChip(); return null; }
    var DecodeCtx = window.AudioContext || window.webkitAudioContext;
    var dc = new DecodeCtx();
    var buffer = await new Promise(function(resolve, reject){
      dc.decodeAudioData(ab.slice(0), resolve, reject);
    }).catch(function(e){ console.warn('decode failed:', e); return null; });
    dc.close && dc.close();
    if (!buffer) { hideBeatChip(); return null; }
    if (token !== beatMapToken) { hideBeatChip(); return null; }

    var musicTempoBeats = [];
    var musicTempoGridStep = 0;
    var musicTempoTask = options.skipMusicTempo ? Promise.resolve(null) : analyzeMusicTempoInWorker(buffer, token);

    // 用 OfflineAudioContext 分离低频重鼓 / 中频鼓身 / 高频敲击感.
    var sr = buffer.sampleRate;
    async function renderBand(hpFreq, lpFreq) {
      var off = new TmpCtx(1, buffer.length, sr);
      var src = off.createBufferSource(); src.buffer = buffer;
      var node = src;
      if (hpFreq) {
        var hp = off.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = Math.min(hpFreq, sr * 0.45);
        hp.Q.value = 0.85;
        node.connect(hp);
        node = hp;
      }
      if (lpFreq) {
        var lp = off.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = Math.min(lpFreq, sr * 0.45);
        lp.Q.value = 0.9;
        node.connect(lp);
        node = lp;
      }
      node.connect(off.destination);
      src.start(0);
      var renderedBand = await off.startRendering();
      if (token !== beatMapToken) return null;
      await yieldToIdle(beatAnalysisYieldMs(options, 110, 620));
      return renderedBand.getChannelData(0);
    }
    var bands = [];
    bands.push(await renderBand(38, 155));
    if (token !== beatMapToken || !bands[0]) { hideBeatChip(); return null; }
    bands.push(await renderBand(130, 420));
    if (token !== beatMapToken || !bands[1]) { hideBeatChip(); return null; }
    bands.push(await renderBand(420, 2600));
    if (token !== beatMapToken || !bands[2]) { hideBeatChip(); return null; }
    bands.push(await renderBand(1800, 9000));
    if (token !== beatMapToken) { hideBeatChip(); return null; }
    var lowPcm = bands[0];
    var bodyPcm = bands[1];
    var vocalPcm = bands[2];
    var snapPcm = bands[3];

    // 帧化能量 (10ms 窗口)
    var winSize = Math.floor(sr * 0.010);
    async function makeFrameEnergy(pcm) {
      var frames = Math.floor(pcm.length / winSize);
      var out = new Float32Array(frames);
      for (var f = 0; f < frames; f++) {
        var s = 0;
        var off2 = f * winSize;
        for (var i = 0; i < winSize; i++) {
          var v = pcm[off2 + i];
          s += v * v;
        }
        out[f] = Math.sqrt(s / winSize);
        if (f > 0 && f % 520 === 0) {
          await yieldToPaint();
          if (token !== beatMapToken) return null;
        }
      }
      return out;
    }
    var frameBands = [];
    frameBands.push(await makeFrameEnergy(lowPcm));
    await yieldToIdle(beatAnalysisYieldMs(options, 90, 520));
    frameBands.push(await makeFrameEnergy(bodyPcm));
    await yieldToIdle(beatAnalysisYieldMs(options, 90, 520));
    frameBands.push(await makeFrameEnergy(vocalPcm));
    await yieldToIdle(beatAnalysisYieldMs(options, 90, 520));
    frameBands.push(await makeFrameEnergy(snapPcm));
    if (token !== beatMapToken || !frameBands[0] || !frameBands[1] || !frameBands[2] || !frameBands[3]) { hideBeatChip(); return null; }
    var energy = frameBands[0];
    var bodyEnergy = frameBands[1];
    var vocalEnergy = frameBands[2];
    var snapEnergy = frameBands[3];
    var nFrames = Math.min(energy.length, bodyEnergy.length, vocalEnergy.length, snapEnergy.length);
    function percentile(arr, p) {
      var copy = Array.prototype.slice.call(arr).sort(function(a,b){ return a-b; });
      return copy.length ? copy[Math.floor(copy.length * p)] : 0.001;
    }
    function bandAt(arr, f) {
      var a = arr[Math.max(0, f - 1)] || 0;
      var b = arr[f] || 0;
      var c = arr[Math.min(nFrames - 1, f + 1)] || 0;
      return (a + b * 2 + c) * 0.25;
    }
    var lowRef = Math.max(0.0008, percentile(energy, 0.86));
    var bodyRef = Math.max(0.0008, percentile(bodyEnergy, 0.86));
    var vocalRef = Math.max(0.0008, percentile(vocalEnergy, 0.86));
    var snapRef = Math.max(0.0008, percentile(snapEnergy, 0.86));

    // 计算 onset (能量正向差分), 然后取峰
    function makeOnset(arr) {
      var out = new Float32Array(nFrames);
      for (var oi = 1; oi < nFrames; oi++) {
        out[oi] = Math.max(0, arr[oi] - arr[oi - 1]);
      }
      return out;
    }
    var onset = makeOnset(energy);
    var bodyOnset = makeOnset(bodyEnergy);
    var vocalOnset = makeOnset(vocalEnergy);
    var snapOnset = makeOnset(snapEnergy);
    var lowOnsetRef = Math.max(0.00025, percentile(onset, 0.88));
    var bodyOnsetRef = Math.max(0.00025, percentile(bodyOnset, 0.88));
    var vocalOnsetRef = Math.max(0.00025, percentile(vocalOnset, 0.88));
    var snapOnsetRef = Math.max(0.00025, percentile(snapOnset, 0.88));

    function softGrooveFrameScore(frame) {
      var sf = Math.max(0, Math.min(nFrames - 1, Math.round(frame)));
      var lowTone = Math.min(2.2, bandAt(energy, sf) / lowRef);
      var bodyTone = Math.min(2.2, bandAt(bodyEnergy, sf) / bodyRef);
      var vocalTone = Math.min(2.2, bandAt(vocalEnergy, sf) / vocalRef);
      var snapTone = Math.min(2.2, bandAt(snapEnergy, sf) / snapRef);
      var lowRise = Math.min(2.6, (onset[sf] || 0) / lowOnsetRef);
      var bodyRise = Math.min(2.6, (bodyOnset[sf] || 0) / bodyOnsetRef);
      var vocalRise = Math.min(2.6, (vocalOnset[sf] || 0) / vocalOnsetRef);
      var snapRise = Math.min(2.6, (snapOnset[sf] || 0) / snapOnsetRef);
      var drumRise = lowRise * 0.52 + bodyRise * 0.42 + snapRise * 0.08;
      var drumTone = lowTone * 0.24 + bodyTone * 0.22 + snapTone * 0.05;
      var vocalLeak = Math.max(0, vocalRise + vocalTone * 0.30 - (lowRise + bodyRise) * 0.54 - 0.18);
      return Math.max(0, drumRise + drumTone - vocalLeak * 0.18);
    }

    function bestSoftGrooveFrameNear(time, radiusSec) {
      var center = Math.max(0, Math.min(nFrames - 1, Math.round(time / 0.010)));
      var radius = Math.max(1, Math.round(Math.max(0.010, radiusSec || 0.040) / 0.010));
      var base = softGrooveFrameScore(center);
      var bestFrame = center;
      var bestScore = base;
      for (var sf = Math.max(0, center - radius); sf <= Math.min(nFrames - 1, center + radius); sf++) {
        var dist = Math.abs(sf - center) / Math.max(1, radius);
        var score = softGrooveFrameScore(sf) * (1 - dist * 0.16);
        if (score > bestScore) {
          bestScore = score;
          bestFrame = sf;
        }
      }
      return { frame: bestFrame, time: bestFrame * 0.010, score: bestScore, base: base };
    }

    function scoreSoftGrooveTempoOffset(times, offset, step) {
      if (!times || !times.length) return 0;
      var total = 0;
      var weightTotal = 0;
      var localRadius = Math.min(0.026, Math.max(0.014, (step || 0.55) * 0.045));
      var stride = times.length > 720 ? 2 : 1;
      for (var si = 0; si < times.length; si += stride) {
        var t = times[si] + offset;
        if (!isFinite(t) || t < 1.0 || t > buffer.duration - 0.40) continue;
        var slot = si % 4;
        var slotWeight = slot === 0 ? 1.22 : (slot === 2 ? 1.06 : 0.88);
        var point = bestSoftGrooveFrameNear(t, localRadius);
        total += point.score * slotWeight;
        weightTotal += slotWeight;
      }
      return weightTotal > 0 ? total / weightTotal : 0;
    }

    function estimateSoftGrooveTempoOffset(times, step) {
      if (!softGrooveAnalysis || !times || times.length < 8 || !step) return 0;
      var maxOffset = Math.min(0.20, Math.max(0.075, step * 0.32));
      var baseScore = scoreSoftGrooveTempoOffset(times, 0, step);
      var bestOffset = 0;
      var bestScore = baseScore;
      for (var off = -maxOffset; off <= maxOffset + 0.0001; off += 0.010) {
        var score = scoreSoftGrooveTempoOffset(times, off, step);
        if (score > bestScore) {
          bestScore = score;
          bestOffset = off;
        }
      }
      if (Math.abs(bestOffset) < 0.014) return 0;
      return bestScore > baseScore * 1.055 ? Math.max(-maxOffset, Math.min(maxOffset, bestOffset)) : 0;
    }

    function refineSoftGrooveBeatTime(time, step) {
      if (!softGrooveAnalysis || !analysisProfile.localRefine) return { time: time, score: 0, base: 0 };
      var radius = Math.min(0.058, Math.max(0.024, (step || 0.55) * 0.095));
      var point = bestSoftGrooveFrameNear(time, radius);
      if (Math.abs(point.time - time) < 0.011) return { time: time, score: point.score, base: point.base };
      if (point.score < point.base * 1.045) return { time: time, score: point.score, base: point.base };
      return { time: point.time, score: point.score, base: point.base };
    }

    function thinSoftGrooveCameraBeats(events, step, duration) {
      if (!analysisProfile.sparseCamera || !events || events.length < 6) return events || [];
      step = Math.max(0.001, step || medianGap(events.map(function(b){ return b.time; }), 0.30, 1.20) || 0.82);
      function moodScore(b) {
        if (!b) return 0;
        return (b.grooveEvidence || 0) * 0.56 + (b.impact || 0) * 0.34 + (b.strength || 0) * 0.18 + (b.low || 0) * 0.10 + (b.body || 0) * 0.08;
      }
      function eventPercentile(rows, p) {
        var vals = rows.map(function(row){ return row.score; }).sort(function(a,b){ return a-b; });
        return vals.length ? vals[Math.min(vals.length - 1, Math.floor(vals.length * p))] : 0;
      }
      function medianNumber(vals) {
        vals = vals.filter(function(v){ return isFinite(v); }).sort(function(a,b){ return a-b; });
        return vals.length ? vals[Math.floor(vals.length * 0.5)] : 0;
      }
      function cloneSparseBeat(b, score, accent, tag) {
        var out = Object.assign({}, b);
        out.primary = true;
        out.camera = true;
        out.pulse = true;
        out.sparse = true;
        out.tone = tag || 'sunset-groove';
        out.impact = clampRange((out.impact || out.strength || 0.30) * (accent ? 0.76 : 0.66) + score * 0.07, 0.18, accent ? 0.58 : 0.50);
        out.strength = clampRange((out.strength || 0.34) * (accent ? 0.76 : 0.68) + score * 0.055, 0.30, accent ? 0.64 : 0.56);
        out.mass = clampRange((out.mass || 0.48) * 0.78, 0.28, 0.60);
        out.sharpness = clampRange((out.sharpness || 0.10) * 0.66, 0.05, 0.32);
        out._sparseScore = score;
        return out;
      }
      function findBestEventNear(time, radius) {
        var best = null;
        var bestScore = -1;
        radius = radius || 0.20;
        for (var i = 0; i < events.length; i++) {
          var b = events[i];
          if (!b || !isFinite(b.time)) continue;
          var dist = Math.abs(b.time - time);
          if (dist > radius) continue;
          var score = moodScore(b) * (1 - dist / radius * 0.18);
          if (score > bestScore) {
            best = b;
            bestScore = score;
          }
        }
        return best ? { beat: best, score: Math.max(0, bestScore) } : null;
      }
      function buildBeatFromFrame(time, score, tag) {
        var f = Math.max(0, Math.min(nFrames - 1, Math.round(time / 0.010)));
        var lowTone = Math.min(2.0, bandAt(energy, f) / lowRef);
        var bodyTone = Math.min(2.0, bandAt(bodyEnergy, f) / bodyRef);
        var snapTone = Math.min(2.0, bandAt(snapEnergy, f) / snapRef);
        var toneTotal = Math.max(0.001, lowTone + bodyTone * 0.72 + snapTone * 0.58);
        var lowMix = lowTone / toneTotal;
        var bodyMix = (bodyTone * 0.72) / toneTotal;
        var snapMix = (snapTone * 0.58) / toneTotal;
        return {
          time: time,
          strength: clampRange(0.30 + score * 0.055, 0.30, 0.52),
          confidence: clampRange(0.46 + score * 0.08, 0.46, 0.66),
          primary: true,
          camera: true,
          pulse: true,
          sparse: true,
          tone: tag || 'sunset-pattern',
          impact: clampRange(0.18 + score * 0.060, 0.18, 0.48),
          low: Math.max(0.22, Math.min(0.74, lowMix)),
          body: bodyMix,
          snap: snapMix,
          mass: Math.max(0.30, Math.min(0.58, lowMix * 0.58 + bodyMix * 0.20)),
          sharpness: Math.max(0.05, Math.min(0.28, snapMix * 0.72))
        };
      }
      function learnIntroPattern() {
        if (!analysisProfile.introPattern) return null;
        var introEnd = Math.min(duration || 34, 34);
        var rows = events.filter(function(b){ return b && isFinite(b.time) && b.time >= 1.2 && b.time <= introEnd; })
          .map(function(b){ return { beat: b, score: moodScore(b) }; });
        if (rows.length < 6) return null;
        var scoreFloor = Math.max(0.34, eventPercentile(rows, 0.58));
        var hits = [];
        var minIntroGap = 1.08;
        rows.forEach(function(row){
          if (row.score < scoreFloor && !(row.beat && (row.beat.low || 0) > 0.42 && row.score > scoreFloor * 0.78)) return;
          var last = hits[hits.length - 1];
          if (last && row.beat.time - last.beat.time < minIntroGap) {
            if (row.score > last.score) hits[hits.length - 1] = row;
          } else {
            hits.push(row);
          }
        });
        if (hits.length < 5) return null;
        var gaps = [];
        for (var hi = 1; hi < hits.length; hi++) {
          var gap = hits[hi].beat.time - hits[hi - 1].beat.time;
          if (gap >= 1.18 && gap <= 2.45) gaps.push(gap);
        }
        if (gaps.length < 4) return null;
        var firstGaps = gaps.slice(0, Math.min(8, gaps.length));
        var evenGaps = [];
        var oddGaps = [];
        for (var gi = 0; gi < firstGaps.length; gi++) {
          (gi % 2 === 0 ? evenGaps : oddGaps).push(firstGaps[gi]);
        }
        var evenGap = medianNumber(evenGaps);
        var oddGap = medianNumber(oddGaps);
        var patternGaps;
        if (evenGap && oddGap && Math.abs(evenGap - oddGap) > 0.16) {
          patternGaps = [evenGap, oddGap].map(function(v){ return clampRange(v, 1.30, 2.22); });
        } else {
          patternGaps = [clampRange(medianNumber(firstGaps), 1.42, 2.12)];
        }
        var refScore = Math.max(0.35, eventPercentile(hits, 0.50));
        return {
          anchor: hits[0].beat.time,
          gaps: patternGaps,
          refScore: refScore,
          introHitCount: hits.length,
          introTimes: hits.slice(0, 10).map(function(row){ return row.beat.time; })
        };
      }
      function buildIntroPatternBeats() {
        var pattern = learnIntroPattern();
        if (!pattern) return null;
        var selected = [];
        var t = pattern.anchor;
        var gi = 0;
        var avgGap = pattern.gaps.reduce(function(a,b){ return a + b; }, 0) / Math.max(1, pattern.gaps.length);
        var refineRadius = Math.min(0.22, Math.max(0.14, avgGap * 0.10));
        var findRadius = Math.min(0.26, Math.max(0.18, avgGap * 0.13));
        while (t < (duration || 0) - 0.55) {
          var point = bestSoftGrooveFrameNear(t, refineRadius);
          var refinedTime = Math.abs(point.time - t) <= refineRadius ? point.time : t;
          var match = findBestEventNear(refinedTime, findRadius) || findBestEventNear(t, findRadius);
          var score = match ? match.score : Math.max(0.26, (point.score || 0) / Math.max(1.0, pattern.refScore * 2.2));
          var accent = (gi % pattern.gaps.length) === 0;
          var beat = match ? cloneSparseBeat(match.beat, score, accent, 'sunset-intro-pattern') : buildBeatFromFrame(refinedTime, score, 'sunset-intro-pattern');
          beat.time = refinedTime;
          beat.index = gi;
          beat.combo = accent ? 'downbeat' : 'rebound';
          beat.introPattern = true;
          selected.push(beat);
          t += pattern.gaps[gi % pattern.gaps.length];
          gi++;
          if (gi > 800) break;
        }
        for (var si = 0; si < selected.length; si++) delete selected[si]._sparseScore;
        console.log('soft-groove intro pattern camera:', selected.length, 'gaps:', pattern.gaps.map(function(v){ return v.toFixed(2); }).join('/'), 'anchor:', pattern.anchor.toFixed(2), 'introHits:', pattern.introHitCount);
        return selected.length >= 8 ? selected : null;
      }
      var introPatternBeats = buildIntroPatternBeats();
      if (introPatternBeats && introPatternBeats.length >= 8) return introPatternBeats;

      var railStep = step;
      while (railStep < 1.35) railStep *= 2;
      railStep = clampRange(railStep, 1.42, 2.12);
      var railMultiple = Math.max(1, Math.round(railStep / step));
      if (railMultiple < 2 && step < 1.20) railMultiple = 2;
      var phaseScores = new Array(railMultiple);
      for (var pi = 0; pi < phaseScores.length; pi++) phaseScores[pi] = 0;
      for (var ei = 0; ei < events.length; ei++) {
        var ev = events[ei];
        if (!ev || !isFinite(ev.time)) continue;
        if (ev.time < 1.0 || (duration && ev.time > duration - 0.65)) continue;
        var phase = Math.abs((ev.index == null ? ei : ev.index) % railMultiple);
        var earlyWeight = ev.time < 70 ? 1.18 : (ev.time < 205 ? 1.0 : 0.94);
        phaseScores[phase] += moodScore(ev) * earlyWeight;
      }
      var bestPhase = 0;
      for (var ps = 1; ps < phaseScores.length; ps++) {
        if (phaseScores[ps] > phaseScores[bestPhase]) bestPhase = ps;
      }
      var selected = [];
      var minGap = Math.max(1.12, railStep * 0.68);
      function pushSparse(b, score, accent) {
        if (!b || score < 0.28) return;
        var copy = cloneSparseBeat(b, score, accent, 'sunset-groove');
        copy.combo = selected.length % 2 === 0 ? 'downbeat' : 'rebound';
        var last = selected[selected.length - 1];
        if (last && copy.time - last.time < minGap) {
          if (score > (last._sparseScore || 0) + 0.05) selected[selected.length - 1] = copy;
          return;
        }
        selected.push(copy);
      }
      for (var si = 0; si < events.length; si++) {
        var b = events[si];
        if (!b || !isFinite(b.time)) continue;
        var idx = b.index == null ? si : b.index;
        var score = moodScore(b);
        var onRail = Math.abs(idx % railMultiple) === bestPhase;
        if (onRail) {
          pushSparse(b, score, false);
        } else if (score >= 0.82 && (!selected.length || b.time - selected[selected.length - 1].time >= minGap * 1.18)) {
          pushSparse(b, score, true);
        }
      }
      for (var ci = 0; ci < selected.length; ci++) {
        delete selected[ci]._sparseScore;
      }
      var minExpected = duration ? Math.max(16, Math.floor(duration / 3.2)) : 16;
      if (selected.length < minExpected) {
        var fallback = events.filter(function(b){ return b && b.camera !== false && b.pulse !== false; });
        selected = [];
        for (var fi = 0; fi < fallback.length; fi++) pushSparse(fallback[fi], moodScore(fallback[fi]), false);
        for (var di = 0; di < selected.length; di++) delete selected[di]._sparseScore;
      }
      console.log('soft-groove sparse camera:', selected.length, 'of', events.length, 'railStep:', railStep.toFixed(2), 'phase:', bestPhase + '/' + railMultiple);
      return selected.length >= 4 ? selected : events.filter(function(b){ return b && b.camera !== false; });
    }

    // 自适应阈值: 滑动均值 + 标准差, 输出带强度的 beat 事件.
    var winN = 50;  // 0.5 秒
    var candidates = [];
    var lastKickFrame = -winN;
    var minIntervalFrames = 12;  // 120ms, 粒子可响应较密集的低频瞬态.
    for (var f = winN; f < nFrames - 5; f++) {
      var sum = 0, sqSum = 0;
      for (var k = f - winN; k < f; k++) { sum += onset[k]; sqSum += onset[k] * onset[k]; }
      var mean = sum / winN;
      var std = Math.sqrt(Math.max(0, sqSum / winN - mean * mean));
      var thresh = mean + std * 2.35 + 0.0045;
      if (onset[f] > thresh && onset[f] > onset[f-1] && onset[f] >= onset[f+1]) {
        if (f - lastKickFrame >= minIntervalFrames) {
          var localScore = (onset[f] - thresh) / Math.max(0.006, std + mean * 0.35);
          candidates.push({
            frame: f,
            time: f * 0.010,
            raw: onset[f],
            score: localScore,
            lowTone: Math.min(2.0, bandAt(energy, f) / lowRef),
            bodyTone: Math.min(2.0, bandAt(bodyEnergy, f) / bodyRef),
            vocalTone: Math.min(2.0, bandAt(vocalEnergy, f) / vocalRef),
            snapTone: Math.min(2.0, bandAt(snapEnergy, f) / snapRef)
          });
          lastKickFrame = f;
        }
      }
      if (f > winN && f % 900 === 0) {
        await yieldToPaint();
        if (token !== beatMapToken) { hideBeatChip(); return null; }
      }
    }

    var scores = candidates.map(function(b){ return b.score; }).sort(function(a,b){ return a-b; });
    var p75 = scores.length ? scores[Math.floor(scores.length * 0.75)] : 1;
    var p92 = scores.length ? scores[Math.floor(scores.length * 0.92)] : Math.max(1, p75);
    var strongTimes = [];
    var beats = candidates.map(function(b, i){
      var strength = Math.max(0.18, Math.min(1, (b.score - p75 * 0.36) / Math.max(0.001, p92 - p75 * 0.36)));
      var lowDominance = b.lowTone / Math.max(0.001, b.vocalTone * 0.84 + b.bodyTone * 0.36 + b.snapTone * 0.10);
      var toneTotal = Math.max(0.001, b.lowTone + b.bodyTone * 0.72 + b.snapTone * 0.58);
      var lowMix = b.lowTone / toneTotal;
      var bodyMix = (b.bodyTone * 0.72) / toneTotal;
      var snapMix = (b.snapTone * 0.58) / toneTotal;
      var drumLike = b.lowTone > 0.38 && (lowMix > 0.42 || lowDominance > 0.72);
      if (strength > 0.55 && drumLike) strongTimes.push(b.time);
      var sharpness = Math.max(0.08, Math.min(1, snapMix * 1.55 + strength * 0.10));
      var mass = Math.max(0.25, Math.min(1, lowMix * 0.72 + bodyMix * 0.36 + strength * 0.20));
      var tone = snapMix > 0.34 && b.snapTone > 0.55 ? 'snap' : (bodyMix > 0.36 && b.bodyTone > 0.55 ? 'body' : (lowMix > 0.55 ? 'deep' : 'mixed'));
      return {
        time: b.time,
        strength: strength,
        confidence: Math.max(0.22, Math.min(1, b.score / Math.max(0.001, p92))),
        primary: drumLike && strength >= 0.50,
        camera: drumLike && strength >= 0.42,
        tone: tone,
        low: lowMix,
        body: bodyMix,
        snap: snapMix,
        mass: mass,
        sharpness: sharpness,
        index: i
      };
    });

    var gaps = [];
    for (var gi = 1; gi < strongTimes.length; gi++) {
      var gap = strongTimes[gi] - strongTimes[gi - 1];
      if (gap >= 0.26 && gap <= 0.86) gaps.push(gap);
    }
    gaps.sort(function(a,b){ return a-b; });
    var gridStep = gaps.length ? gaps[Math.floor(gaps.length * 0.5)] : 0;
    var cameraBeats = beats.filter(function(b){ return b.camera; });
    if (gridStep > 0) {
      for (var bi = 0; bi < beats.length; bi++) {
        var prevGap = bi > 0 ? beats[bi].time - beats[bi - 1].time : gridStep;
        var nextGap = bi < beats.length - 1 ? beats[bi + 1].time - beats[bi].time : gridStep;
        var gridLike = Math.abs(prevGap - gridStep) < gridStep * 0.32 || Math.abs(nextGap - gridStep) < gridStep * 0.32;
        beats[bi].primary = beats[bi].camera && beats[bi].strength >= (gridLike ? 0.42 : 0.58);
      }
      if (gridStep >= 0.38 && gridStep <= 0.88 && strongTimes.length >= 4) {
        var anchor = strongTimes[0];
        while (anchor - gridStep > 0.20) anchor -= gridStep;
        var gridBeats = [];
        var windowSec = Math.min(0.18, gridStep * 0.30);
        for (var gt = anchor; gt < buffer.duration - 0.05; gt += gridStep) {
          var best = null;
          var bestDist = windowSec;
          for (var ci = 0; ci < beats.length; ci++) {
            var dist = Math.abs(beats[ci].time - gt);
            if (dist < bestDist) {
              best = beats[ci];
              bestDist = dist;
            }
          }
          if (best && best.camera) {
            best.primary = true;
            best.strength = Math.max(best.strength, 0.54);
            best.confidence = Math.max(best.confidence, 0.58);
            gridBeats.push(best);
          } else {
            var gf = Math.max(0, Math.min(nFrames - 1, Math.round(gt / 0.010)));
            var lowTone = Math.min(2.0, bandAt(energy, gf) / lowRef);
            var bodyTone = Math.min(2.0, bandAt(bodyEnergy, gf) / bodyRef);
            var vocalTone = Math.min(2.0, bandAt(vocalEnergy, gf) / vocalRef);
            var snapTone = Math.min(2.0, bandAt(snapEnergy, gf) / snapRef);
            var lowDominance = lowTone / Math.max(0.001, vocalTone * 0.84 + bodyTone * 0.36 + snapTone * 0.10);
            var toneTotal = Math.max(0.001, lowTone + bodyTone * 0.72 + snapTone * 0.58);
            var lowMix = lowTone / toneTotal;
            var bodyMix = (bodyTone * 0.72) / toneTotal;
            var snapMix = (snapTone * 0.58) / toneTotal;
            if (lowTone <= 0.38 || (lowMix <= 0.42 && lowDominance <= 0.72)) continue;
            gridBeats.push({
              time: gt,
              strength: 0.53,
              confidence: 0.60,
              primary: true,
              ghost: true,
              tone: 'grid',
              low: lowMix,
              body: bodyMix,
              snap: snapMix,
              mass: Math.max(0.35, Math.min(0.82, lowMix * 0.72 + bodyMix * 0.36 + 0.16)),
              sharpness: Math.max(0.08, Math.min(0.65, snapMix * 1.25)),
              index: gridBeats.length
            });
          }
        }
        cameraBeats = gridBeats;
      }
    }

    var musicTempoResult = await musicTempoTask;
    if (token !== beatMapToken) { hideBeatChip(); return null; }
    if (musicTempoResult && musicTempoResult.beats && musicTempoResult.beats.length) {
      musicTempoBeats = normalizeMusicTempoBeats(musicTempoResult.beats || [], buffer.duration);
      musicTempoGridStep = medianGap(musicTempoBeats, 0.36, 1.00);
      console.log('music-tempo worker:', musicTempoResult.tempo, 'bpm, beats:', musicTempoBeats.length, 'step:', musicTempoGridStep);
    }

    if (musicTempoBeats.length >= 4) {
      var musicTempoPhaseOffset = estimateTempoPhaseOffset(musicTempoBeats, beats, musicTempoGridStep || gridStep, buffer.duration);
      if (musicTempoPhaseOffset) {
        musicTempoBeats = musicTempoBeats.map(function(t){ return t + musicTempoPhaseOffset; })
          .filter(function(t){ return isFinite(t) && t >= 0.05 && t < buffer.duration - 0.05; });
        console.log('music-tempo phase correction:', musicTempoPhaseOffset.toFixed(3), 's');
      }
      if (analysisProfile.phaseScan) {
        var softGroovePhaseOffset = estimateSoftGrooveTempoOffset(musicTempoBeats, musicTempoGridStep || gridStep);
        if (softGroovePhaseOffset) {
          musicTempoBeats = musicTempoBeats.map(function(t){ return t + softGroovePhaseOffset; })
            .filter(function(t){ return isFinite(t) && t >= 0.05 && t < buffer.duration - 0.05; });
          console.log('soft-groove phase correction:', softGroovePhaseOffset.toFixed(3), 's');
        }
      }
      var tempoCameraBeats = [];
      var tempoWindow = Math.min(0.16, Math.max(0.095, (musicTempoGridStep || 0.60) * 0.24));
      var tempoMetrics = [];
      for (var ti = 0; ti < musicTempoBeats.length; ti++) {
        var mtTime = musicTempoBeats[ti];
        var refinedPoint = refineSoftGrooveBeatTime(mtTime, musicTempoGridStep || gridStep);
        var metricTime = refinedPoint.time;
        var nearest = null;
        var nearestDist = tempoWindow;
        for (var nb = 0; nb < beats.length; nb++) {
          var nd = Math.abs(beats[nb].time - metricTime);
          if (nd < nearestDist) {
            nearest = beats[nb];
            nearestDist = nd;
          }
        }
        var mf = Math.max(0, Math.min(nFrames - 1, Math.round(metricTime / 0.010)));
        var mtLowTone = Math.min(2.0, bandAt(energy, mf) / lowRef);
        var mtBodyTone = Math.min(2.0, bandAt(bodyEnergy, mf) / bodyRef);
        var mtVocalTone = Math.min(2.0, bandAt(vocalEnergy, mf) / vocalRef);
        var mtSnapTone = Math.min(2.0, bandAt(snapEnergy, mf) / snapRef);
        var mtLowRise = Math.min(2.5, (onset[mf] || 0) / lowOnsetRef);
        var mtBodyRise = Math.min(2.5, (bodyOnset[mf] || 0) / bodyOnsetRef);
        var mtVocalRise = Math.min(2.5, (vocalOnset[mf] || 0) / vocalOnsetRef);
        var mtSnapRise = Math.min(2.5, (snapOnset[mf] || 0) / snapOnsetRef);
        var mtLowDominance = mtLowTone / Math.max(0.001, mtVocalTone * 0.84 + mtBodyTone * 0.36 + mtSnapTone * 0.10);
        var mtToneTotal = Math.max(0.001, mtLowTone + mtBodyTone * 0.72 + mtSnapTone * 0.58);
        var mtLowMix = mtLowTone / mtToneTotal;
        var mtBodyMix = (mtBodyTone * 0.72) / mtToneTotal;
        var mtSnapMix = (mtSnapTone * 0.58) / mtToneTotal;
        var mtPower = mtLowTone * 0.44 + mtBodyTone * 0.16 + mtSnapTone * 0.08 + Math.min(1.8, mtLowDominance) * 0.16 + (nearest ? nearest.strength * 0.46 : 0);
        if (softGrooveAnalysis) {
          var vocalLeak = Math.max(0, mtVocalRise + mtVocalTone * 0.22 - (mtLowRise + mtBodyRise) * 0.50 - 0.14);
          mtPower = mtLowTone * 0.26 + mtBodyTone * 0.24 + mtLowRise * 0.34 + mtBodyRise * 0.32 + mtSnapRise * 0.06 + Math.min(1.7, mtLowDominance) * 0.10 + (nearest ? nearest.strength * 0.30 : 0) - vocalLeak * 0.16;
        }
        tempoMetrics.push({
          time: metricTime,
          gridTime: mtTime,
          nearest: nearest,
          lowTone: mtLowTone,
          bodyTone: mtBodyTone,
          snapTone: mtSnapTone,
          lowRise: mtLowRise,
          bodyRise: mtBodyRise,
          snapRise: mtSnapRise,
          lowDominance: mtLowDominance,
          lowMix: mtLowMix,
          bodyMix: mtBodyMix,
          snapMix: mtSnapMix,
          power: mtPower,
          softScore: refinedPoint.score || 0,
          index: ti
        });
      }
      var tempoPowers = tempoMetrics.map(function(m){ return m.power; });
      var tempoLowTones = tempoMetrics.map(function(m){ return m.lowTone; });
      var tempoBodyTones = tempoMetrics.map(function(m){ return m.bodyTone; });
      var tempoSnapTones = tempoMetrics.map(function(m){ return m.snapTone; });
      var tempoLowRises = tempoMetrics.map(function(m){ return m.lowRise || 0; });
      var tempoBodyRises = tempoMetrics.map(function(m){ return m.bodyRise || 0; });
      var tempoSnapRises = tempoMetrics.map(function(m){ return m.snapRise || 0; });
      var powerFloor = Math.max(0.001, percentile(tempoPowers, 0.25));
      var powerCeil = Math.max(powerFloor + 0.001, percentile(tempoPowers, 0.90));
      var lowFloor = Math.max(0.001, percentile(tempoLowTones, 0.25));
      var lowCeil = Math.max(lowFloor + 0.001, percentile(tempoLowTones, 0.88));
      var bodyFloor = Math.max(0.001, percentile(tempoBodyTones, 0.25));
      var bodyCeil = Math.max(bodyFloor + 0.001, percentile(tempoBodyTones, 0.90));
      var snapFloor = Math.max(0.001, percentile(tempoSnapTones, 0.25));
      var snapCeil = Math.max(snapFloor + 0.001, percentile(tempoSnapTones, 0.90));
      var lowRiseFloor = Math.max(0.001, percentile(tempoLowRises, 0.25));
      var lowRiseCeil = Math.max(lowRiseFloor + 0.001, percentile(tempoLowRises, 0.90));
      var bodyRiseFloor = Math.max(0.001, percentile(tempoBodyRises, 0.25));
      var bodyRiseCeil = Math.max(bodyRiseFloor + 0.001, percentile(tempoBodyRises, 0.90));
      var snapRiseFloor = Math.max(0.001, percentile(tempoSnapRises, 0.25));
      var snapRiseCeil = Math.max(snapRiseFloor + 0.001, percentile(tempoSnapRises, 0.90));
      for (var tm = 0; tm < tempoMetrics.length; tm++) {
        var m = tempoMetrics[tm];
        var mtSlot = m.index % 4;
        var powerRel = clamp01((m.power - powerFloor) / (powerCeil - powerFloor));
        var lowRel = clamp01((m.lowTone - lowFloor) / (lowCeil - lowFloor));
        var bodyRel = clamp01((m.bodyTone - bodyFloor) / (bodyCeil - bodyFloor));
        var snapRel = clamp01((m.snapTone - snapFloor) / (snapCeil - snapFloor));
        var lowRiseRel = clamp01(((m.lowRise || 0) - lowRiseFloor) / (lowRiseCeil - lowRiseFloor));
        var bodyRiseRel = clamp01(((m.bodyRise || 0) - bodyRiseFloor) / (bodyRiseCeil - bodyRiseFloor));
        var snapRiseRel = clamp01(((m.snapRise || 0) - snapRiseFloor) / (snapRiseCeil - snapRiseFloor));
        var mtImpact = clamp01(powerRel * 0.50 + lowRel * 0.24 + bodyRel * 0.18 + snapRel * 0.08);
        if (m.nearest) mtImpact = Math.max(mtImpact, Math.min(1, m.nearest.strength * 0.58 + (m.nearest.primary ? 0.08 : 0)));
        if (softGrooveAnalysis) {
          mtImpact = clamp01(powerRel * 0.34 + lowRel * 0.18 + bodyRel * 0.18 + lowRiseRel * 0.24 + bodyRiseRel * 0.24 + snapRiseRel * 0.04);
          if (m.nearest) mtImpact = Math.max(mtImpact, Math.min(0.72, m.nearest.strength * 0.42 + (m.nearest.primary ? 0.06 : 0)));
        }
        var activeCamera = mtImpact >= 0.20 || (mtSlot === 0 && mtImpact >= 0.15 && (lowRel > 0.20 || bodyRel > 0.26));
        var activePulse = mtImpact >= 0.24 || (mtSlot === 0 && mtImpact >= 0.18);
        var grooveEvidence = lowRiseRel * 0.52 + bodyRiseRel * 0.48 + lowRel * 0.20 + bodyRel * 0.18;
        if (softGrooveAnalysis) {
          activeCamera = mtImpact >= 0.19 || (mtSlot === 0 && mtImpact >= 0.135 && grooveEvidence >= 0.32);
          activePulse = mtImpact >= 0.23 || (mtSlot === 0 && mtImpact >= 0.165 && grooveEvidence >= 0.28);
        }
        var downbeatLift = activeCamera ? (mtSlot === 0 ? 0.14 : (mtSlot === 2 ? 0.06 : 0)) : 0;
        var mtStrength = 0.26 + powerRel * 0.23 + lowRel * 0.10 + bodyRel * 0.08 + snapRel * 0.04 + downbeatLift;
        if (m.nearest) mtStrength = Math.max(mtStrength, 0.42 + m.nearest.strength * 0.28);
        if (mtSlot === 0 && activeCamera) mtStrength = Math.max(mtStrength, 0.54 + mtImpact * 0.16);
        if (!activeCamera) mtStrength = Math.min(mtStrength, 0.36);
        if (softGrooveAnalysis) {
          mtStrength = 0.24 + powerRel * 0.18 + lowRel * 0.08 + bodyRel * 0.08 + lowRiseRel * 0.13 + bodyRiseRel * 0.12 + downbeatLift * 0.90;
          if (m.nearest) mtStrength = Math.max(mtStrength, 0.36 + m.nearest.strength * 0.22);
          if (mtSlot === 0 && activeCamera) mtStrength = Math.max(mtStrength, 0.50 + mtImpact * 0.15);
          if (mtSlot === 2 && activeCamera) mtStrength = Math.max(mtStrength, 0.43 + mtImpact * 0.10);
          if (!activeCamera) mtStrength = Math.min(mtStrength, 0.34);
          mtStrength = Math.max(0.28, Math.min(0.76, mtStrength));
        } else {
          mtStrength = Math.max(0.30, Math.min(0.82, mtStrength));
        }
        var lowForCamera = Math.max(0.22, Math.min(0.78, m.lowMix * 0.82 + lowRel * 0.18));
        tempoCameraBeats.push({
          time: m.time,
          strength: mtStrength,
          confidence: m.nearest ? Math.max(0.60, m.nearest.confidence || 0) : Math.max(0.52, 0.48 + powerRel * 0.28),
          primary: activeCamera,
          camera: activeCamera,
          pulse: activePulse,
          impact: mtImpact,
          tone: 'music-tempo',
          grooveEvidence: grooveEvidence,
          low: lowForCamera,
          body: m.bodyMix,
          snap: m.snapMix,
          mass: Math.max(0.35, Math.min(0.86, lowForCamera * 0.68 + m.bodyMix * 0.24 + mtStrength * 0.16)),
          sharpness: Math.max(0.08, Math.min(0.65, m.snapMix * 1.18)),
          combo: mtSlot === 0 ? 'downbeat' : (mtSlot === 1 ? 'push' : (mtSlot === 2 ? 'drop' : 'rebound')),
          index: m.index
        });
      }
      if (tempoCameraBeats.length >= 4) {
        if (analysisProfile.sparseCamera) {
          tempoCameraBeats = thinSoftGrooveCameraBeats(tempoCameraBeats, musicTempoGridStep || gridStep, buffer.duration);
        }
        cameraBeats = tempoCameraBeats;
        gridStep = musicTempoGridStep || gridStep;
      }
    }

    var kicks = beats.map(function(b){ return b.time; });
    var visualBeatCount = 0;
    var pulseBeats = cameraBeats.filter(function(b){
      if (typeof b === 'number') {
        visualBeatCount++;
        return true;
      }
      var active = b.primary !== false && b.camera !== false && b.pulse !== false;
      if (active) visualBeatCount++;
      return active && (b.strength >= 0.38 || (b.impact || 0) >= 0.20);
    }).map(function(b){
      if (typeof b === 'number') return { time: b, strength: 0.42, impact: 0.42 };
      return {
        time: b.time,
        strength: b.strength,
        impact: b.impact == null ? b.strength : b.impact,
        combo: b.combo,
        low: b.low,
        body: b.body,
        snap: b.snap
      };
    });
    await yieldToPaint();
    if (token !== beatMapToken) { hideBeatChip(); return null; }
    if (options.prefetch) hideBeatChip();
    else showBeatChip('节奏缓冲中…');
    return { kicks: kicks, beats: beats, pulseBeats: pulseBeats, cameraBeats: cameraBeats, gridStep: gridStep, tempoSource: musicTempoBeats.length >= 4 ? 'music-tempo' : 'local', analysisProfile: analysisProfile.id || 'default', duration: buffer.duration, visualBeatCount: visualBeatCount, analyzedAt: Date.now() };
  } catch (e) {
    console.warn('beat analysis failed:', e);
    hideBeatChip();
    return null;
  } finally {
    beatMapBusy = false;
  }
}

function schedulePodcastDjAnalysis(songKey, audioUrl, token, durationSec) {
  cancelDjBeatAnalysisTimer();
  if (!songKey || !audioUrl) return;
  djBeatAnalysisTimer = setTimeout(function waitForDjStart(){
    djBeatAnalysisTimer = null;
    if (token !== djBeatMapToken || !djMode.active || djMode.songKey !== songKey || djBeatMapCache[songKey]) return;
    var startAnalysis = function(){
      if (token !== djBeatMapToken || !djMode.active || djMode.songKey !== songKey || djBeatMapCache[songKey]) return;
      if (djBeatMapBusy) {
        djBeatAnalysisTimer = setTimeout(waitForDjStart, 900);
        return;
      }
      if (/^https?:\/\//i.test(audioUrl || '') && (durationSec <= 0 || durationSec > 3300)) {
        analyzePodcastDjIntroBeats(audioUrl, token, durationSec).then(function(map){
          if (token !== djBeatMapToken || !map) return;
          smoothPodcastDjIntroHandoff(songKey, map, token);
        }).catch(function(err){
          console.warn('podcast DJ intro beat analysis failed:', err);
        });
      }
      analyzePodcastDjBeats(audioUrl, token, durationSec).then(function(map){
        if (token !== djBeatMapToken || !map) return;
        smoothPodcastDjMapHandoff(songKey, map, token);
      }).catch(function(err){
        console.warn('podcast DJ beat analysis failed:', err);
        hideBeatChip();
      });
    };
    scheduleAnalysisTask(startAnalysis, 900);
  }, 900);
}

async function analyzePodcastDjIntroBeats(audioUrl, token, durationSec) {
  if (!/^https?:\/\//i.test(audioUrl || '')) return null;
  if (token !== djBeatMapToken || !djMode.active) return null;
  var introResp = await fetch('/api/podcast/dj-beatmap?url=' + encodeURIComponent(audioUrl) + '&duration=' + encodeURIComponent(durationSec || 0) + '&intro=180');
  if (token !== djBeatMapToken || !djMode.active) return null;
  var introData = await introResp.json().catch(function(){ return null; });
  if (introResp.ok && introData && introData.ok && introData.map && introData.map.cameraBeats && introData.map.cameraBeats.length >= 4) {
    return introData.map;
  }
  return null;
}

async function buildPodcastDjLowOnlyBeatMap(buffer, token) {
  if (!buffer) return null;
  var sr = buffer.sampleRate || 44100;
  var duration = buffer.duration || (buffer.length / sr) || 0;
  var hopSec = duration > 4200 ? 0.0125 : 0.010;
  var hopSize = Math.max(256, Math.floor(sr * hopSec));
  var nFrames = Math.max(1, Math.floor(buffer.length / hopSize));
  var lowEnergy = new Float32Array(nFrames);
  var hitEnergy = new Float32Array(nFrames);
  var channels = Math.max(1, buffer.numberOfChannels || 1);
  var ch0 = buffer.getChannelData(0);
  var ch1 = channels > 1 ? buffer.getChannelData(1) : null;
  var chList = null;
  if (channels > 2) {
    chList = [];
    for (var ch = 0; ch < channels; ch++) chList.push(buffer.getChannelData(ch));
  }
  function makeBiquad(type, freq, q) {
    freq = Math.max(8, Math.min(freq, sr * 0.45));
    var w0 = 2 * Math.PI * freq / sr;
    var cos = Math.cos(w0);
    var sin = Math.sin(w0);
    var alpha = sin / (2 * (q || 0.707));
    var b0, b1, b2, a0, a1, a2;
    if (type === 'highpass') {
      b0 = (1 + cos) * 0.5;
      b1 = -(1 + cos);
      b2 = (1 + cos) * 0.5;
    } else {
      b0 = (1 - cos) * 0.5;
      b1 = 1 - cos;
      b2 = (1 - cos) * 0.5;
    }
    a0 = 1 + alpha;
    a1 = -2 * cos;
    a2 = 1 - alpha;
    var inv = 1 / a0;
    return { b0:b0 * inv, b1:b1 * inv, b2:b2 * inv, a1:a1 * inv, a2:a2 * inv, x1:0, x2:0, y1:0, y2:0 };
  }
  function runBiquad(st, x) {
    var y = st.b0 * x + st.b1 * st.x1 + st.b2 * st.x2 - st.a1 * st.y1 - st.a2 * st.y2;
    st.x2 = st.x1; st.x1 = x; st.y2 = st.y1; st.y1 = y;
    return y;
  }
  var hp = makeBiquad('highpass', 32, 0.72);
  var lp = makeBiquad('lowpass', 178, 0.82);
  showBeatChip('DJ kick scan 0%');
  for (var f = 0; f < nFrames; f++) {
    var start = f * hopSize;
    var end = Math.min(buffer.length, start + hopSize);
    var sum = 0;
    var peak = 0;
    for (var i = start; i < end; i++) {
      var x;
      if (chList) {
        x = 0;
        for (var ci = 0; ci < channels; ci++) x += chList[ci][i];
        x /= channels;
      } else if (ch1) {
        x = (ch0[i] + ch1[i]) * 0.5;
      } else {
        x = ch0[i];
      }
      var y = runBiquad(lp, runBiquad(hp, x || 0));
      var ay = Math.abs(y);
      sum += y * y;
      if (ay > peak) peak = ay;
    }
    var count = Math.max(1, end - start);
    lowEnergy[f] = Math.sqrt(sum / count);
    hitEnergy[f] = peak;
    if (f > 0 && f % 720 === 0) {
      if (f % 4320 === 0) showBeatChip('DJ kick scan ' + Math.min(99, Math.round(f / nFrames * 100)) + '%');
      await yieldToPaint();
      if (token !== djBeatMapToken || !djMode.active) { hideBeatChip(); return null; }
    }
  }
  if (token !== djBeatMapToken || !djMode.active) { hideBeatChip(); return null; }

  function percentile(arr, p, maxSamples) {
    var len = arr ? arr.length : 0;
    if (!len) return 0.001;
    maxSamples = maxSamples || 14000;
    var sample;
    if (len <= maxSamples) {
      sample = Array.prototype.slice.call(arr);
    } else {
      sample = new Array(maxSamples);
      var step = (len - 1) / (maxSamples - 1);
      for (var si = 0; si < maxSamples; si++) sample[si] = arr[Math.min(len - 1, Math.floor(si * step))] || 0;
    }
    sample.sort(function(a,b){ return a - b; });
    return sample[Math.max(0, Math.min(sample.length - 1, Math.floor(sample.length * p)))] || 0.001;
  }
  function bandAt(arr, idx) {
    idx = Math.max(0, Math.min(nFrames - 1, idx | 0));
    var a = arr[Math.max(0, idx - 1)] || 0;
    var b = arr[idx] || 0;
    var c = arr[Math.min(nFrames - 1, idx + 1)] || 0;
    return (a + b * 2 + c) * 0.25;
  }
  function median(vals) {
    vals = vals.filter(function(v){ return isFinite(v); }).sort(function(a,b){ return a - b; });
    return vals.length ? vals[Math.floor(vals.length * 0.5)] : 0;
  }
  var lowFloor = Math.max(0.0004, percentile(lowEnergy, 0.22));
  var lowMid = Math.max(lowFloor + 0.0002, percentile(lowEnergy, 0.58));
  var lowRef = Math.max(lowMid + 0.0002, percentile(lowEnergy, 0.86));
  var lowCeil = Math.max(lowRef + 0.0004, percentile(lowEnergy, 0.96));
  var hitRef = Math.max(0.0004, percentile(hitEnergy, 0.86));

  showBeatChip('DJ locking kick grid...');
  var onset = new Float32Array(nFrames);
  for (var oi = 4; oi < nFrames; oi++) {
    var prev = lowEnergy[oi - 1] * 0.62 + lowEnergy[oi - 2] * 0.28 + lowEnergy[oi - 3] * 0.10;
    var lowRise = Math.max(0, lowEnergy[oi] - prev);
    var wideRise = Math.max(0, (lowEnergy[oi] + lowEnergy[oi - 1]) * 0.5 - (lowEnergy[oi - 3] + lowEnergy[oi - 4]) * 0.5);
    var peakRise = Math.max(0, hitEnergy[oi] - hitEnergy[oi - 2] * 0.84);
    onset[oi] = lowRise * 1.72 + wideRise * 0.86 + peakRise * 0.10;
  }

  var winN = Math.max(52, Math.round(0.82 / hopSec));
  var minFrameGap = Math.max(18, Math.round(0.215 / hopSec));
  var candidates = [];
  var sumO = 0, sqO = 0;
  for (var wi = 0; wi < winN; wi++) { var ow = onset[wi] || 0; sumO += ow; sqO += ow * ow; }
  for (var cf = winN + 4; cf < nFrames - 4; cf++) {
    var mean = sumO / winN;
    var std = Math.sqrt(Math.max(0, sqO / winN - mean * mean));
    var th = mean + std * 1.66 + lowRef * 0.0038;
    var o = onset[cf];
    if (o > th && o >= onset[cf - 1] && o > onset[cf + 1]) {
      var peakF = cf;
      var peakScore = o + lowEnergy[cf] * 0.10;
      for (var pf = cf - 2; pf <= cf + 3; pf++) {
        var ps = (onset[pf] || 0) + (lowEnergy[pf] || 0) * 0.10;
        if (ps > peakScore) { peakScore = ps; peakF = pf; }
      }
      var lowTone = Math.min(2.6, bandAt(lowEnergy, peakF) / lowRef);
      var hitTone = Math.min(2.6, bandAt(hitEnergy, peakF) / hitRef);
      var lowRel = clamp01((bandAt(lowEnergy, peakF) - lowFloor) / Math.max(0.0001, lowCeil - lowFloor));
      var score = (o - th) / Math.max(0.0006, std + mean * 0.38 + lowRef * 0.012);
      if (score > 0.16 && (lowTone > 0.32 || lowRel > 0.22 || hitTone > 0.52)) {
        var cand = {
          frame: peakF,
          time: peakF * hopSec,
          score: score,
          lowTone: lowTone,
          hitTone: hitTone,
          lowRel: lowRel,
          raw: o
        };
        cand.power = cand.score * 0.56 + Math.pow(clamp01((cand.lowTone - 0.22) / 1.42), 0.82) * 0.34 + Math.min(1.5, cand.hitTone) * 0.08 + cand.lowRel * 0.10;
        var last = candidates[candidates.length - 1];
        if (last && cand.frame - last.frame < minFrameGap) {
          if (cand.power > last.power) candidates[candidates.length - 1] = cand;
        } else {
          candidates.push(cand);
        }
      }
    }
    var old = onset[cf - winN] || 0;
    var next = onset[cf] || 0;
    sumO += next - old;
    sqO += next * next - old * old;
    if (cf > winN && cf % 3600 === 0) {
      await yieldToPaint();
      if (token !== djBeatMapToken || !djMode.active) { hideBeatChip(); return null; }
    }
  }
  if (!candidates.length) {
    return { kicks: [], beats: [], pulseBeats: [], cameraBeats: [], duration: duration, visualBeatCount: 0, tempoSource: 'podcast-dj-low-empty', analyzedAt: Date.now() };
  }

  var powers = candidates.map(function(c){ return c.power; });
  var p30 = percentile(powers, 0.30);
  var p50 = percentile(powers, 0.50);
  var p90 = Math.max(p50 + 0.001, percentile(powers, 0.90));
  var p96 = Math.max(p90 + 0.001, percentile(powers, 0.965));
  var strong = candidates.filter(function(c){ return c.power >= p50 && c.lowTone > 0.34; });
  if (strong.length < 16) strong = candidates.slice();
  function estimateStep(list) {
    if (!list || list.length < 3) return 0;
    var bin = 0.006;
    var hist = {};
    var medGaps = [];
    var minStep = 0.31;
    var maxStep = 0.86;
    for (var ai = 0; ai < list.length; ai++) {
      for (var bi = ai + 1; bi < list.length && bi < ai + 10; bi++) {
        var rawGap = list[bi].time - list[ai].time;
        if (rawGap < 0.24) continue;
        if (rawGap > 2.55) break;
        for (var div = 1; div <= 6; div++) {
          var g = rawGap / div;
          if (g < minStep) break;
          if (g > maxStep) continue;
          var weight = Math.sqrt(Math.max(0.001, list[ai].power * list[bi].power)) / Math.sqrt((bi - ai) * div);
          var key = Math.round(g / bin);
          hist[key] = (hist[key] || 0) + weight;
          medGaps.push(g);
        }
      }
    }
    var bestKey = null, bestScore = 0;
    Object.keys(hist).forEach(function(k){
      var key = parseInt(k, 10);
      var score = (hist[key] || 0) + (hist[key - 1] || 0) * 0.72 + (hist[key + 1] || 0) * 0.72;
      if (score > bestScore) { bestScore = score; bestKey = key; }
    });
    if (bestKey != null) return bestKey * bin;
    return median(medGaps);
  }
  var globalStep = estimateStep(strong) || estimateStep(candidates) || 0.50;
  globalStep = clampRange(globalStep, 0.32, 0.86);

  function nearestCandidate(center, windowSec, startIdx) {
    var best = null;
    var bestScore = -Infinity;
    var j = startIdx || 0;
    while (j < candidates.length && candidates[j].time < center - windowSec) j++;
    for (var ni = j; ni < candidates.length && candidates[ni].time <= center + windowSec; ni++) {
      var dist = Math.abs(candidates[ni].time - center);
      var score = candidates[ni].power * (1 - dist / Math.max(0.001, windowSec) * 0.42);
      if (score > bestScore) { best = candidates[ni]; bestScore = score; }
    }
    return best;
  }
  function scorePhase(anchorTime, step) {
    var start = anchorTime;
    while (start - step > 0.05) start -= step;
    var end = Math.min(duration, 180);
    var win = Math.max(0.055, Math.min(0.125, step * 0.18));
    var score = 0, count = 0, cursor = 0;
    for (var gt = start; gt < end; gt += step) {
      while (cursor < candidates.length && candidates[cursor].time < gt - win) cursor++;
      var best = null, bestScore = 0;
      for (var pi = cursor; pi < candidates.length && candidates[pi].time <= gt + win; pi++) {
        var dist = Math.abs(candidates[pi].time - gt);
        var s = candidates[pi].power * (1 - dist / win * 0.44);
        if (s > bestScore) { bestScore = s; best = candidates[pi]; }
      }
      score += best ? bestScore : -p30 * 0.08;
      count++;
    }
    return count ? score / count : -Infinity;
  }
  var phaseSource = strong.filter(function(c){ return c.time < Math.min(duration, 180); }).slice(0, 72);
  if (!phaseSource.length) phaseSource = strong.slice(0, 1);
  var bestAnchor = phaseSource[0] ? phaseSource[0].time : 0;
  var bestAnchorScore = -Infinity;
  for (var pa = 0; pa < phaseSource.length; pa++) {
    var sc = scorePhase(phaseSource[pa].time, globalStep);
    if (sc > bestAnchorScore) { bestAnchorScore = sc; bestAnchor = phaseSource[pa].time; }
  }
  var halfStep = globalStep * 0.5;
  if (halfStep >= 0.31) {
    var halfScore = scorePhase(bestAnchor, halfStep);
    if (halfScore > bestAnchorScore * 1.04) globalStep = halfStep;
  }
  var anchor = bestAnchor;
  while (anchor - globalStep > 0.05) anchor -= globalStep;

  var sectionLen = duration > 3600 ? 96 : 72;
  var sectionCount = Math.max(1, Math.ceil(duration / sectionLen));
  var sectionSteps = [];
  for (var secIdx = 0; secIdx < sectionCount; secIdx++) {
    var t0 = secIdx * sectionLen, t1 = Math.min(duration, t0 + sectionLen);
    var seg = strong.filter(function(c){ return c.time >= t0 && c.time < t1; });
    var prevStep = sectionSteps.length ? sectionSteps[sectionSteps.length - 1] : globalStep;
    var localStep = estimateStep(seg) || prevStep || globalStep;
    if (prevStep) localStep = clampRange(localStep, prevStep * 0.94, prevStep * 1.06);
    if (globalStep) localStep = clampRange(localStep, globalStep * 0.86, globalStep * 1.14);
    var blended = prevStep ? (localStep * 0.30 + prevStep * 0.70) : localStep;
    sectionSteps.push(blended || globalStep);
  }
  function stepAt(time) {
    var idx = Math.max(0, Math.min(sectionSteps.length - 1, Math.floor(time / sectionLen)));
    return sectionSteps[idx] || globalStep || 0.50;
  }

  var beats = [];
  var gridIndex = 0;
  var cursorIdx = 0;
  for (var gridT = anchor; gridT < duration - 0.04; ) {
    var localStep2 = stepAt(gridT) || globalStep || 0.50;
    var winSec = Math.max(0.060, Math.min(0.135, localStep2 * 0.20));
    while (cursorIdx < candidates.length && candidates[cursorIdx].time < gridT - winSec) cursorIdx++;
    var bestCand = nearestCandidate(gridT, winSec, cursorIdx);
    var gf = Math.max(0, Math.min(nFrames - 1, Math.round(gridT / hopSec)));
    var gridLow = bandAt(lowEnergy, gf);
    var gridHit = bandAt(hitEnergy, gf);
    var gridLowTone = Math.min(2.6, gridLow / lowRef);
    var gridHitTone = Math.min(2.6, gridHit / hitRef);
    var lowTone2 = bestCand ? Math.max(gridLowTone * 0.62, bestCand.lowTone) : gridLowTone;
    var hitTone2 = bestCand ? Math.max(gridHitTone * 0.62, bestCand.hitTone) : gridHitTone;
    var distPenalty = bestCand ? (1 - Math.min(1, Math.abs(bestCand.time - gridT) / winSec) * 0.26) : 0.54;
    var basePower = bestCand ? bestCand.power * distPenalty : (gridLowTone * 0.25 + gridHitTone * 0.06);
    var powerRel = clamp01((basePower - p30 * 0.78) / Math.max(0.001, p96 - p30 * 0.78));
    var lowRel2 = clamp01((gridLow - lowFloor) / Math.max(0.0001, lowCeil - lowFloor));
    var kickRel = clamp01(powerRel * 0.74 + lowRel2 * 0.22 + clamp01((hitTone2 - 0.26) / 1.70) * 0.04);
    var softGrid = (!bestCand && lowRel2 < 0.20) || kickRel < 0.16;
    var slot = gridIndex % 4;
    var combo = slot === 0 ? 'downbeat' : (slot === 1 ? 'push' : (slot === 2 ? 'drop' : 'rebound'));
    if (kickRel > 0.84 && combo !== 'downbeat') combo = 'accent';
    var visualRel = kickRel > 0.76 ? 0.76 + (kickRel - 0.76) * 0.52 : kickRel;
    var downLift = combo === 'downbeat' ? (visualRel > 0.18 ? (0.016 + visualRel * 0.036) : visualRel * 0.028) : 0;
    var sectionGate = clamp01((kickRel - 0.10) / 0.58);
    var impact = Math.max(0.020, Math.min(0.88, 0.022 + Math.pow(visualRel, 1.62) * 0.86 + downLift));
    var strength = Math.max(0.12, Math.min(0.93, 0.13 + Math.pow(visualRel, 1.12) * 0.68 + downLift * 0.70));
    if (softGrid) {
      var softMul = combo === 'downbeat' ? 0.48 : 0.30;
      impact *= softMul;
      strength *= 0.58 + sectionGate * 0.22;
    }
    var timingPull = bestCand ? (0.24 + clamp01((kickRel - 0.25) / 0.65) * 0.46) : 0;
    var sourceTime = bestCand ? (gridT * (1 - timingPull) + bestCand.time * timingPull) : gridT;
    var cameraActive = impact >= 0.13 || (combo === 'downbeat' && kickRel >= 0.14) || (bestCand && kickRel >= 0.18);
    var lowMix = Math.max(0.42, Math.min(0.90, 0.52 + visualRel * 0.32 + lowTone2 * 0.035 - (combo === 'accent' ? 0.10 : 0)));
    var bodyMix = Math.max(0.035, Math.min(0.54, 0.060 + visualRel * 0.12 + (combo === 'push' ? 0.18 : 0) + (combo === 'drop' ? 0.24 : 0)));
    var snapMix = Math.max(0.015, Math.min(0.62, 0.026 + (combo === 'accent' ? 0.40 : 0) + (combo === 'rebound' ? 0.08 : 0) + visualRel * 0.038));
    beats.push({
      time: sourceTime,
      strength: strength,
      confidence: Math.max(0.44, Math.min(0.99, 0.46 + kickRel * 0.43 + (bestCand ? 0.08 : -0.03))),
      impact: impact,
      primary: cameraActive,
      camera: cameraActive,
      pulse: impact > 0.16 || (combo === 'downbeat' && kickRel >= 0.18),
      tone: 'podcast-dj-low-grid',
      low: lowMix,
      body: bodyMix,
      snap: snapMix,
      mass: Math.max(0.36, Math.min(0.94, lowMix * 0.72 + Math.pow(visualRel, 1.22) * 0.24)),
      sharpness: Math.max(0.03, Math.min(0.28, snapMix * 1.18)),
      combo: combo,
      step: localStep2,
      index: beats.length,
      dj: true,
      grid: true,
      kickOnly: true
    });
    gridIndex++;
    gridT += localStep2;
    if (gridIndex > 0 && gridIndex % 1800 === 0) {
      await yieldToPaint();
      if (token !== djBeatMapToken || !djMode.active) { hideBeatChip(); return null; }
    }
  }

  var cameraBeats = beats.filter(function(b){ return b.camera !== false; });
  var pulseBeats = beats.filter(function(b){ return b.pulse !== false && (b.impact >= 0.16 || b.combo === 'downbeat'); }).map(function(b){
    return { time: b.time, strength: b.strength, impact: b.impact, combo: b.combo, low: b.low, body: b.body, snap: b.snap, dj: true };
  });
  console.log('podcast DJ low-only beatmap:', Math.round(duration) + 's', 'step:', globalStep.toFixed(3), 'candidates:', candidates.length, 'beats:', beats.length);
  return {
    kicks: beats.map(function(b){ return b.time; }),
    beats: beats,
    pulseBeats: pulseBeats,
    cameraBeats: cameraBeats,
    gridStep: globalStep,
    sectionSteps: sectionSteps,
    tempoSource: 'podcast-dj-low-offline',
    duration: duration,
    visualBeatCount: cameraBeats.length,
    analyzedAt: Date.now()
  };
}

async function analyzePodcastDjBeats(audioUrl, token, durationSec) {
  try {
    djBeatMapBusy = true;
    showBeatChip('DJ 离线锁拍…');
    await yieldToIdle(520);
    if (token !== djBeatMapToken || !djMode.active) { hideBeatChip(); return null; }
    durationSec = Math.max(0, Number(durationSec) || 0);
    var preferServerAnalysis = /^https?:\/\//i.test(audioUrl || '') && (durationSec <= 0 || durationSec > 3300);
    if (preferServerAnalysis) {
      showBeatChip('DJ 长播客后端锁拍...');
      var serverResp = await fetch('/api/podcast/dj-beatmap?url=' + encodeURIComponent(audioUrl) + '&duration=' + encodeURIComponent(durationSec));
      if (token !== djBeatMapToken || !djMode.active) { hideBeatChip(); return null; }
      var serverData = await serverResp.json().catch(function(){ return null; });
      if (serverResp.ok && serverData && serverData.ok && serverData.map) return serverData.map;
      console.warn('podcast DJ server analysis failed:', serverData && serverData.error);
      hideBeatChip();
      if (durationSec <= 0 || durationSec > 3300) return null;
    }
    var fetchAudioUrl = /^https?:\/\//i.test(audioUrl || '') ? ('/api/audio?url=' + encodeURIComponent(audioUrl)) : audioUrl;
    var resp = await fetch(fetchAudioUrl);
    if (token !== djBeatMapToken || !djMode.active) { hideBeatChip(); return null; }
    var ab = await resp.arrayBuffer();
    if (token !== djBeatMapToken || !djMode.active) { hideBeatChip(); return null; }

    showBeatChip('DJ 解码音频…');
    var TmpCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    var DecodeCtx = window.AudioContext || window.webkitAudioContext;
    if (!DecodeCtx) { hideBeatChip(); return null; }
    var dc = new DecodeCtx();
    var buffer = await new Promise(function(resolve, reject){
      dc.decodeAudioData(ab, resolve, reject);
    }).catch(function(e){ console.warn('podcast DJ decode failed:', e); return null; });
    ab = null;
    dc.close && dc.close();
    if (!buffer || token !== djBeatMapToken || !djMode.active) { hideBeatChip(); return null; }
    return await buildPodcastDjLowOnlyBeatMap(buffer, token);

    var sr = buffer.sampleRate;
    async function renderDjBand(hpFreq, lpFreq, label) {
      showBeatChip('DJ 分离' + label + '…');
      var off = new TmpCtx(1, buffer.length, sr);
      var src = off.createBufferSource();
      src.buffer = buffer;
      var node = src;
      if (hpFreq) {
        var hp = off.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = Math.min(hpFreq, sr * 0.45);
        hp.Q.value = 0.78;
        node.connect(hp);
        node = hp;
      }
      if (lpFreq) {
        var lp = off.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = Math.min(lpFreq, sr * 0.45);
        lp.Q.value = 0.86;
        node.connect(lp);
        node = lp;
      }
      node.connect(off.destination);
      src.start(0);
      var rendered = await off.startRendering();
      if (token !== djBeatMapToken || !djMode.active) return null;
      await yieldToIdle(280);
      return rendered.getChannelData(0);
    }

    var lowPcm = await renderDjBand(34, 170, '低频');
    if (!lowPcm) { hideBeatChip(); return null; }
    var bodyPcm = await renderDjBand(150, 560, '鼓身');
    if (!bodyPcm) { hideBeatChip(); return null; }
    var snapPcm = await renderDjBand(1700, 9200, '高频');
    if (!snapPcm) { hideBeatChip(); return null; }

    var hopSec = 0.012;
    var hopSize = Math.max(256, Math.floor(sr * hopSec));
    async function makeEnergy(pcm, label) {
      showBeatChip('DJ 读取' + label + '…');
      var frames = Math.floor(pcm.length / hopSize);
      var out = new Float32Array(frames);
      for (var f = 0; f < frames; f++) {
        var sum = 0;
        var off2 = f * hopSize;
        for (var i = 0; i < hopSize; i++) {
          var v = pcm[off2 + i] || 0;
          sum += v * v;
        }
        out[f] = Math.sqrt(sum / hopSize);
        if (f > 0 && f % 1800 === 0) {
          await yieldToPaint();
          if (token !== djBeatMapToken || !djMode.active) return null;
        }
      }
      return out;
    }

    var lowEnergy = await makeEnergy(lowPcm, '低频');
    var bodyEnergy = await makeEnergy(bodyPcm, '鼓身');
    var snapEnergy = await makeEnergy(snapPcm, '高频');
    if (!lowEnergy || !bodyEnergy || !snapEnergy || token !== djBeatMapToken || !djMode.active) { hideBeatChip(); return null; }

    var nFrames = Math.min(lowEnergy.length, bodyEnergy.length, snapEnergy.length);
    function percentile(arr, p) {
      var copy = Array.prototype.slice.call(arr).sort(function(a,b){ return a-b; });
      return copy.length ? copy[Math.max(0, Math.min(copy.length - 1, Math.floor(copy.length * p)))] : 0.001;
    }
    function bandAt(arr, f) {
      var a = arr[Math.max(0, f - 1)] || 0;
      var b = arr[f] || 0;
      var c = arr[Math.min(nFrames - 1, f + 1)] || 0;
      return (a + b * 2 + c) * 0.25;
    }
    function median(vals) {
      vals = vals.filter(function(v){ return isFinite(v); }).sort(function(a,b){ return a-b; });
      return vals.length ? vals[Math.floor(vals.length * 0.5)] : 0;
    }
    var lowRef = Math.max(0.0008, percentile(lowEnergy, 0.86));
    var bodyRef = Math.max(0.0008, percentile(bodyEnergy, 0.84));
    var snapRef = Math.max(0.0008, percentile(snapEnergy, 0.84));

    showBeatChip('DJ 计算主拍…');
    var onset = new Float32Array(nFrames);
    for (var oi = 2; oi < nFrames; oi++) {
      var lowRise = Math.max(0, lowEnergy[oi] - lowEnergy[oi - 1]);
      var lowWide = Math.max(0, lowEnergy[oi] - lowEnergy[oi - 2]);
      var bodyRise = Math.max(0, bodyEnergy[oi] - bodyEnergy[oi - 1]);
      var snapRise = Math.max(0, snapEnergy[oi] - snapEnergy[oi - 1]);
      onset[oi] = lowRise * 1.52 + lowWide * 0.58 + bodyRise * 0.16 + snapRise * 0.035;
    }

    var winN = Math.max(44, Math.round(0.78 / hopSec));
    var minFrameGap = Math.max(18, Math.round(0.215 / hopSec));
    var candidates = [];
    var lastFrame = -minFrameGap;
    var sum = 0, sq = 0;
    for (var wi = 0; wi < winN; wi++) { sum += onset[wi] || 0; sq += (onset[wi] || 0) * (onset[wi] || 0); }
    for (var f2 = winN + 1; f2 < nFrames - 2; f2++) {
      var mean = sum / winN;
      var std = Math.sqrt(Math.max(0, sq / winN - mean * mean));
      var th = mean + std * 1.90 + lowRef * 0.006;
      var o = onset[f2];
      if (o > th && o >= onset[f2 - 1] && o > onset[f2 + 1] && f2 - lastFrame >= minFrameGap) {
        var lowTone = Math.min(2.2, bandAt(lowEnergy, f2) / lowRef);
        var bodyTone = Math.min(2.2, bandAt(bodyEnergy, f2) / bodyRef);
        var snapTone = Math.min(2.2, bandAt(snapEnergy, f2) / snapRef);
        var lowDom = lowTone / Math.max(0.001, bodyTone * 0.46 + snapTone * 0.18);
        var score = (o - th) / Math.max(0.0008, std + mean * 0.42);
        var kickLike = lowTone > 0.42 && (lowDom > 0.92 || lowTone > 0.82);
        if (kickLike && score > 0.28) {
          candidates.push({
            frame: f2,
            time: f2 * hopSec,
            score: score,
            lowTone: lowTone,
            bodyTone: bodyTone,
            snapTone: snapTone,
            lowDom: lowDom,
            raw: o
          });
          lastFrame = f2;
        }
      }
      var old = onset[f2 - winN] || 0;
      var next = onset[f2] || 0;
      sum += next - old;
      sq += next * next - old * old;
      if (f2 > winN && f2 % 2200 === 0) {
        await yieldToPaint();
        if (token !== djBeatMapToken || !djMode.active) { hideBeatChip(); return null; }
      }
    }

    if (!candidates.length) {
      hideBeatChip();
      return { kicks: [], beats: [], pulseBeats: [], cameraBeats: [], duration: buffer.duration, visualBeatCount: 0, tempoSource: 'podcast-dj-empty', analyzedAt: Date.now() };
    }

    var strong = candidates.filter(function(c){ return c.score > 0.52 && c.lowTone > 0.52; });
    if (strong.length < 8) strong = candidates.slice();
    var allGaps = [];
    for (var gi = 1; gi < strong.length; gi++) {
      var g = strong[gi].time - strong[gi - 1].time;
      while (g > 0.94) g *= 0.5;
      while (g < 0.30) g *= 2.0;
      if (g >= 0.30 && g <= 0.94) allGaps.push(g);
    }
    var globalStep = median(allGaps) || 0.50;
    var sectionLen = 48;
    var sectionCount = Math.max(1, Math.ceil(buffer.duration / sectionLen));
    var sectionSteps = [];
    for (var si = 0; si < sectionCount; si++) {
      var t0 = si * sectionLen, t1 = t0 + sectionLen;
      var seg = strong.filter(function(c){ return c.time >= t0 && c.time < t1; });
      var gaps = [];
      for (var sg = 1; sg < seg.length; sg++) {
        var gap = seg[sg].time - seg[sg - 1].time;
        while (gap > 0.94) gap *= 0.5;
        while (gap < 0.30) gap *= 2.0;
        if (gap >= 0.30 && gap <= 0.94) gaps.push(gap);
      }
      var prevSectionStep = sectionSteps.length ? sectionSteps[sectionSteps.length - 1] : globalStep;
      var step = median(gaps) || prevSectionStep || globalStep;
      if (globalStep) step = clampRange(step, globalStep * 0.90, globalStep * 1.10);
      if (prevSectionStep && Math.abs(step - prevSectionStep) / prevSectionStep > 0.08) {
        step = step * 0.28 + prevSectionStep * 0.72;
      } else if (prevSectionStep) {
        step = step * 0.42 + prevSectionStep * 0.58;
      }
      sectionSteps.push(step || globalStep);
    }
    function stepAt(time) {
      var idx = Math.max(0, Math.min(sectionSteps.length - 1, Math.floor(time / sectionLen)));
      return sectionSteps[idx] || globalStep || 0.50;
    }

    var powers = candidates.map(function(c){
      c.power = c.score * 0.50 + c.lowTone * 0.26 + Math.min(1.8, c.lowDom) * 0.16 + c.bodyTone * 0.06 + c.snapTone * 0.02;
      return c.power;
    });
    var p35 = percentile(powers, 0.35);
    var p50 = percentile(powers, 0.50);
    var p90 = Math.max(p50 + 0.001, percentile(powers, 0.90));
    var phaseSource = strong.length ? strong : candidates;
    var phaseCandidates = phaseSource.filter(function(c){ return c.time < Math.min(buffer.duration, 120); }).slice(0, 56);
    if (!phaseCandidates.length) phaseCandidates = phaseSource.slice(0, 1);
    function nearestCandidate(center, windowSec, startIdx) {
      var best = null;
      var bestScore = -Infinity;
      var j = startIdx || 0;
      while (j < candidates.length && candidates[j].time < center - windowSec) j++;
      for (var ni = j; ni < candidates.length && candidates[ni].time <= center + windowSec; ni++) {
        var dist = Math.abs(candidates[ni].time - center);
        var score = candidates[ni].power * (1 - dist / Math.max(0.001, windowSec) * 0.48);
        if (score > bestScore) {
          best = candidates[ni];
          bestScore = score;
        }
      }
      return best;
    }
    function scorePhase(anchorTime) {
      var step = globalStep || 0.50;
      var start = anchorTime;
      while (start - step > 0.05) start -= step;
      var end = Math.min(buffer.duration, 132);
      var win = Math.max(0.060, Math.min(0.130, step * 0.18));
      var score = 0, count = 0, cursor = 0;
      for (var gt = start; gt < end; gt += step) {
        while (cursor < candidates.length && candidates[cursor].time < gt - win) cursor++;
        var best = null, bestScore = 0;
        for (var pi = cursor; pi < candidates.length && candidates[pi].time <= gt + win; pi++) {
          var dist = Math.abs(candidates[pi].time - gt);
          var s = candidates[pi].power * (1 - dist / win * 0.45);
          if (s > bestScore) { bestScore = s; best = candidates[pi]; }
        }
        if (best) score += bestScore;
        else score -= p35 * 0.10;
        count++;
      }
      return count ? score / count : -Infinity;
    }
    var bestAnchor = phaseCandidates[0] ? phaseCandidates[0].time : 0;
    var bestAnchorScore = -Infinity;
    for (var pa = 0; pa < phaseCandidates.length; pa++) {
      var sc = scorePhase(phaseCandidates[pa].time);
      if (sc > bestAnchorScore) {
        bestAnchorScore = sc;
        bestAnchor = phaseCandidates[pa].time;
      }
    }
    var anchor = bestAnchor;
    while (anchor - (globalStep || 0.50) > 0.05) anchor -= (globalStep || 0.50);

    var beats = [];
    var gridIndex = 0;
    var cursorIdx = 0;
    for (var gridT = anchor; gridT < buffer.duration - 0.05; ) {
      var localStep = stepAt(gridT) || globalStep || 0.50;
      var winSec = Math.max(0.070, Math.min(0.145, localStep * 0.22));
      while (cursorIdx < candidates.length && candidates[cursorIdx].time < gridT - winSec) cursorIdx++;
      var bestCand = nearestCandidate(gridT, winSec, cursorIdx);
      var gf = Math.max(0, Math.min(nFrames - 1, Math.round(gridT / hopSec)));
      var gridLowTone = Math.min(2.2, bandAt(lowEnergy, gf) / lowRef);
      var gridBodyTone = Math.min(2.2, bandAt(bodyEnergy, gf) / bodyRef);
      var gridSnapTone = Math.min(2.2, bandAt(snapEnergy, gf) / snapRef);
      var sourceTime = bestCand ? (gridT * 0.38 + bestCand.time * 0.62) : gridT;
      var powerBase = bestCand ? bestCand.power : (gridLowTone * 0.22 + gridBodyTone * 0.04 + gridSnapTone * 0.02);
      var distPenalty = bestCand ? (1 - Math.min(1, Math.abs(bestCand.time - gridT) / winSec) * 0.30) : 0.58;
      var powerRel = clamp01(((powerBase * distPenalty) - p35 * 0.78) / Math.max(0.001, p90 - p35 * 0.78));
      var lowTone2 = bestCand ? Math.max(gridLowTone * 0.55, bestCand.lowTone) : gridLowTone;
      var bodyTone2 = bestCand ? Math.max(gridBodyTone * 0.50, bestCand.bodyTone) : gridBodyTone;
      var snapTone2 = bestCand ? Math.max(gridSnapTone * 0.50, bestCand.snapTone) : gridSnapTone;
      var toneTotal = Math.max(0.001, lowTone2 + bodyTone2 * 0.72 + snapTone2 * 0.48);
      var lowMix = lowTone2 / toneTotal;
      var bodyMix = (bodyTone2 * 0.72) / toneTotal;
      var snapMix = (snapTone2 * 0.48) / toneTotal;
      var comboSlot = gridIndex % 4;
      var combo = comboSlot === 0 ? 'downbeat' : (comboSlot === 1 ? 'push' : (comboSlot === 2 ? 'drop' : 'rebound'));
      if (powerRel > 0.86 && combo !== 'downbeat') combo = 'accent';
      var weakGrid = !bestCand && gridLowTone < 0.50 && powerRel < 0.24;
      if (!weakGrid || comboSlot === 0 || powerRel > 0.18) {
        var downLift = combo === 'downbeat' ? 0.06 : 0;
        var strength = Math.max(0.18, Math.min(0.94, 0.20 + Math.pow(powerRel, 1.22) * 0.54 + lowMix * 0.08 + downLift));
        var impact = Math.max(0.10, Math.min(0.96, Math.pow(powerRel, 1.36) * 0.82 + lowMix * 0.12 + downLift));
        beats.push({
          time: sourceTime,
          strength: strength,
          confidence: Math.max(0.46, Math.min(0.98, 0.50 + powerRel * 0.38 + lowMix * 0.10 - (bestCand ? 0 : 0.10))),
          impact: impact,
          primary: true,
          camera: true,
          pulse: impact > 0.18 || combo === 'downbeat',
          tone: 'podcast-dj-grid',
          low: Math.max(0.24, Math.min(0.90, lowMix * 0.78 + powerRel * 0.18)),
          body: Math.max(0.03, Math.min(0.60, bodyMix)),
          snap: Math.max(0.02, Math.min(0.50, snapMix)),
          mass: Math.max(0.28, Math.min(0.96, lowMix * 0.74 + Math.pow(powerRel, 1.25) * 0.24)),
          sharpness: Math.max(0.03, Math.min(0.62, snapMix * 1.10)),
          combo: combo,
          step: localStep,
          index: beats.length,
          dj: true,
          grid: true
        });
      }
      gridIndex++;
      gridT += localStep;
      if (gridIndex > 0 && gridIndex % 1800 === 0) {
        await yieldToPaint();
        if (token !== djBeatMapToken || !djMode.active) { hideBeatChip(); return null; }
      }
    }

    var pulseBeats = beats.filter(function(b){ return b.strength >= 0.38 || b.combo === 'downbeat'; }).map(function(b){
      return { time: b.time, strength: b.strength, impact: b.impact, combo: b.combo, low: b.low, body: b.body, snap: b.snap, dj: true };
    });
    await yieldToPaint();
    if (token !== djBeatMapToken || !djMode.active) { hideBeatChip(); return null; }
    return {
      kicks: beats.map(function(b){ return b.time; }),
      beats: beats,
      pulseBeats: pulseBeats,
      cameraBeats: beats,
      gridStep: globalStep,
      sectionSteps: sectionSteps,
      tempoSource: 'podcast-dj-offline',
      duration: buffer.duration,
      visualBeatCount: beats.length,
      analyzedAt: Date.now()
    };
  } catch (err) {
    console.warn('podcast DJ analysis failed:', err);
    hideBeatChip();
    return null;
  } finally {
    djBeatMapBusy = false;
  }
}

function applyPodcastDjProfileFromMap(map) {
  if (!map || !djMode.active) return;
  var density = (map.cameraBeats || []).length / Math.max(20, map.duration || 20);
  cinemaTrackProfile.density = density;
  var target = 0.82 + clamp01((density - 1.25) / 1.8) * 0.16;
  target = clampRange(target, 0.76, 1.10);
  cinemaTrackProfile.target = target;
  cinemaTrackProfile.scale += (target - cinemaTrackProfile.scale) * 0.34;
}

function smoothPodcastDjMapHandoff(songKey, map, token) {
  if (!map) return;
  showBeatChip('DJ 锁拍完成…');
  var apply = function() {
    if (token !== djBeatMapToken || !djMode.active || djMode.songKey !== songKey) return;
    djBeatMapCache[songKey] = map;
    currentDjBeatMap = map;
    applyPodcastDjProfileFromMap(map);
    syncPodcastDjMapCursor(audio ? audio.currentTime : 0, true);
    notifyDesktopLyricsBeatMapReady();
    hideBeatChip();
    showToast('DJ 离线锁拍完成: ' + (map.visualBeatCount || 0) + ' 个主拍');
  };
  scheduleVisualApply(apply, 260, 360);
}

function smoothPodcastDjIntroHandoff(songKey, map, token) {
  if (!map || !map.partial) return;
  if (currentDjBeatMap && !currentDjBeatMap.partial) return;
  var apply = function() {
    if (token !== djBeatMapToken || !djMode.active || djMode.songKey !== songKey) return;
    if (currentDjBeatMap && !currentDjBeatMap.partial) return;
    currentDjBeatMap = map;
    applyPodcastDjProfileFromMap(map);
    syncPodcastDjMapCursor(audio ? audio.currentTime : 0, true);
    notifyDesktopLyricsBeatMapReady();
    showBeatChip('DJ 开头已锁拍，全曲继续分析…');
  };
  scheduleVisualApply(apply, 0, 240);
}

function showBeatChip(text) {
  document.getElementById('beat-text').textContent = text || '分析节奏…';
  document.getElementById('beat-chip').classList.add('show');
  if (localBeatAnalysis && localBeatAnalysis.active) setLocalBeatStatus(text || '分析中...', 'warn');
}
function hideBeatChip() {
  document.getElementById('beat-chip').classList.remove('show');
}

function localBeatRound(v, scale) {
  v = Number(v);
  if (!isFinite(v)) return 0;
  scale = scale || 1000;
  return Math.round(v * scale) / scale;
}
function packLocalBeatEvent(ev) {
  if (typeof ev === 'number') return [localBeatRound(ev, 1000), 0.42, 0.72, 0.42, 0.62, 0.22, 0.16, 0, 7, 0.62, 0.12, 0];
  ev = ev || {};
  var comboIdx = Math.max(0, LOCAL_BEAT_COMBOS.indexOf(ev.combo || ''));
  var flags = 0;
  if (ev.primary !== false) flags |= 1;
  if (ev.camera !== false) flags |= 2;
  if (ev.pulse !== false) flags |= 4;
  if (ev.dj) flags |= 8;
  if (ev.grid) flags |= 16;
  if (ev.kickOnly) flags |= 32;
  return [
    localBeatRound(ev.time, 1000),
    localBeatRound(ev.strength == null ? 0.42 : ev.strength, 1000),
    localBeatRound(ev.confidence == null ? 0.72 : ev.confidence, 1000),
    localBeatRound(ev.impact == null ? (ev.strength == null ? 0.42 : ev.strength) : ev.impact, 1000),
    localBeatRound(ev.low == null ? 0.62 : ev.low, 1000),
    localBeatRound(ev.body == null ? 0.22 : ev.body, 1000),
    localBeatRound(ev.snap == null ? 0.16 : ev.snap, 1000),
    comboIdx,
    flags,
    localBeatRound(ev.mass == null ? 0.62 : ev.mass, 1000),
    localBeatRound(ev.sharpness == null ? 0.12 : ev.sharpness, 1000),
    localBeatRound(ev.step || 0, 1000)
  ];
}
function unpackLocalBeatEvent(row) {
  if (typeof row === 'number') return row;
  if (!Array.isArray(row)) return row;
  var flags = row[8] || 0;
  return {
    time: row[0] || 0,
    strength: row[1] == null ? 0.42 : row[1],
    confidence: row[2] == null ? 0.72 : row[2],
    impact: row[3] == null ? (row[1] || 0.42) : row[3],
    low: row[4] == null ? 0.62 : row[4],
    body: row[5] == null ? 0.22 : row[5],
    snap: row[6] == null ? 0.16 : row[6],
    combo: LOCAL_BEAT_COMBOS[row[7] || 0] || undefined,
    primary: !!(flags & 1),
    camera: !!(flags & 2),
    pulse: !!(flags & 4),
    dj: !!(flags & 8),
    grid: !!(flags & 16),
    kickOnly: !!(flags & 32),
    mass: row[9] == null ? 0.62 : row[9],
    sharpness: row[10] == null ? 0.12 : row[10],
    step: row[11] || 0
  };
}
function packLocalBeatMap(map) {
  if (!map) return null;
  var camera = (map.cameraBeats || map.beats || map.kicks || []).map(packLocalBeatEvent);
  var pulse = (map.pulseBeats || map.kicks || []).map(packLocalBeatEvent);
  return {
    v: 1,
    duration: localBeatRound(map.duration || 0, 1000),
    gridStep: localBeatRound(map.gridStep || 0, 1000),
    sectionSteps: (map.sectionSteps || []).map(function(v){ return localBeatRound(v, 1000); }),
    tempoSource: map.tempoSource || 'local',
    visualBeatCount: map.visualBeatCount || camera.length,
    analyzedAt: map.analyzedAt || Date.now(),
    partial: !!map.partial,
    partialUntilSec: map.partialUntilSec || 0,
    cameraBeats: camera,
    pulseBeats: pulse
  };
}
function unpackLocalBeatMap(stored) {
  if (!stored) return null;
  if (stored.v && stored.v !== 1 && stored.v !== 2) return stored;
  var camera = (stored.cameraBeats || []).map(unpackLocalBeatEvent);
  var pulse = (stored.pulseBeats || []).map(unpackLocalBeatEvent);
  return {
    kicks: camera.map(function(b){ return typeof b === 'number' ? b : b.time; }),
    beats: camera,
    pulseBeats: pulse,
    cameraBeats: camera,
    gridStep: stored.gridStep || 0,
    sectionSteps: stored.sectionSteps || [],
    tempoSource: stored.tempoSource || 'local',
    duration: stored.duration || 0,
    visualBeatCount: stored.visualBeatCount || camera.length,
    analyzedAt: stored.analyzedAt || Date.now(),
    partial: !!stored.partial,
    partialUntilSec: stored.partialUntilSec || 0
  };
}
function readLocalBeatPrefs() {
  try { return JSON.parse(localStorage.getItem(LOCAL_BEAT_PREF_STORE_KEY) || '{}') || {}; }
  catch (e) { return {}; }
}
function saveLocalBeatPrefs() {
  try { localStorage.setItem(LOCAL_BEAT_PREF_STORE_KEY, JSON.stringify(localBeatMapPrefs || {})); } catch (e) {}
}
function readLocalBeatMapCache() {
  var out = {};
  try {
    var raw = JSON.parse(localStorage.getItem(LOCAL_BEATMAP_STORE_KEY) || '{}') || {};
    Object.keys(raw).forEach(function(key){
      var entry = raw[key] || {};
      out[key] = { updatedAt: entry.updatedAt || 0 };
      if (entry.mr) out[key].mr = unpackLocalBeatMap(entry.mr);
      if (entry.dj) out[key].dj = unpackLocalBeatMap(entry.dj);
    });
  } catch (e) {
    out = {};
  }
  return out;
}
function packLocalBeatCache(maxEntries) {
  var entries = Object.keys(localBeatMapCache || {}).map(function(key){
    var entry = localBeatMapCache[key] || {};
    return { key:key, updatedAt: entry.updatedAt || 0, entry:entry };
  }).sort(function(a,b){ return b.updatedAt - a.updatedAt; });
  if (maxEntries) entries = entries.slice(0, maxEntries);
  var packed = {};
  entries.forEach(function(item){
    packed[item.key] = { updatedAt: item.entry.updatedAt || Date.now() };
    if (item.entry.mr) packed[item.key].mr = packLocalBeatMap(item.entry.mr);
    if (item.entry.dj) packed[item.key].dj = packLocalBeatMap(item.entry.dj);
  });
  return packed;
}
function saveLocalBeatMapCache() {
  var attempts = [12, 8, 5, 3];
  for (var i = 0; i < attempts.length; i++) {
    try {
      localStorage.setItem(LOCAL_BEATMAP_STORE_KEY, JSON.stringify(packLocalBeatCache(attempts[i])));
      return true;
    } catch (e) {}
  }
  return false;
}
function getLocalBeatEntry(localKey, mode) {
  var entry = localKey && localBeatMapCache ? localBeatMapCache[localKey] : null;
  return entry && entry[mode] ? entry[mode] : null;
}
function storeLocalBeatEntry(localKey, mode, map, song, opts) {
  if (!localKey || !map) return;
  opts = opts || {};
  var entry = localBeatMapCache[localKey] || {};
  entry[mode] = map;
  entry.updatedAt = Date.now();
  localBeatMapCache[localKey] = entry;
  localBeatMapPrefs[localKey] = mode;
  saveLocalBeatPrefs();
  saveLocalBeatMapCache();
  if (!opts.skipDisk) writeBeatDiskCache(localBeatDiskKey(localKey, mode), map, song || { type:'local', localKey:localKey }, mode);
}
function setLocalBeatStatus(text, tone) {
  var el = document.getElementById('local-beat-status');
  if (!el) return;
  el.textContent = text || '';
  el.classList.toggle('warn', tone === 'warn');
  el.classList.toggle('fail', tone === 'fail');
}

function localBeatVisualCount(map) {
  return map ? (map.visualBeatCount || (map.cameraBeats && map.cameraBeats.length) || (map.beats && map.beats.length) || 0) : 0;
}
function setLocalBeatPreference(localKey, mode) {
  if (!localKey) return;
  localBeatMapPrefs[localKey] = mode === 'dj' ? 'dj' : 'mr';
  saveLocalBeatPrefs();
}
function applyLocalBeatMap(song, mode, map, fromCache) {
  if (!song || !song.localKey || !map) return false;
  mode = mode === 'dj' ? 'dj' : 'mr';
  song.localBeatMode = mode;
  setLocalBeatPreference(song.localKey, mode);
  if (mode === 'dj') {
    setDjModeActive(true, song);
    currentBeatMap = null;
    beatMapNextIdx = 0;
    currentDjBeatMap = map;
    djBeatMapCache[djSongKey(song)] = map;
    applyPodcastDjProfileFromMap(map);
    syncPodcastDjMapCursor(audio ? audio.currentTime : 0, true);
    maybeAnnounceDjMode();
  } else {
    setDjModeActive(false, song);
    currentBeatMap = map;
    beatMapCache['local:' + song.localKey] = map;
    applyCinemaProfileFromBeatMap(map);
    syncBeatMapPlaybackCursor(audio ? audio.currentTime : 0, true);
  }
  hideBeatChip();
  notifyDesktopLyricsBeatMapReady();
  if (fromCache) showToast((mode === 'dj' ? 'DJ' : 'MR') + ' 本地节奏缓存已载入');
  return true;
}
function prepareLocalBeatAnalysis(song, audioUrl) {
  if (!song || !song.localKey || !audioUrl) return;
  var preferred = localBeatMapPrefs[song.localKey] === 'dj' ? 'dj' : 'mr';
  var cached = getLocalBeatEntry(song.localKey, preferred) ||
    getLocalBeatEntry(song.localKey, preferred === 'dj' ? 'mr' : 'dj');
  if (cached) {
    applyLocalBeatMap(song, cached === getLocalBeatEntry(song.localKey, 'dj') ? 'dj' : 'mr', cached, true);
    return;
  }
  var diskToken = trackSwitchToken;
  (async function(){
    var firstMode = preferred;
    var secondMode = preferred === 'dj' ? 'mr' : 'dj';
    var firstMap = await readBeatDiskCache(localBeatDiskKey(song.localKey, firstMode));
    var mode = firstMap ? firstMode : secondMode;
    var map = firstMap || await readBeatDiskCache(localBeatDiskKey(song.localKey, secondMode));
    if (diskToken !== trackSwitchToken || !currentLocalSong || currentLocalSong.localKey !== song.localKey) return;
    if (map) {
      storeLocalBeatEntry(song.localKey, mode, map, song, { skipDisk:true });
      applyLocalBeatMap(song, mode, map, true);
      return;
    }
    openLocalBeatModal(song, audioUrl);
  })().catch(function(){
    if (diskToken === trackSwitchToken && currentLocalSong && currentLocalSong.localKey === song.localKey) openLocalBeatModal(song, audioUrl);
  });
}
function openLocalBeatModal(song, audioUrl) {
  if (immersiveMode) setImmersiveMode(false);
  localBeatAnalysis.song = song || currentLocalSong;
  localBeatAnalysis.audioUrl = audioUrl || (audio && audio.src) || '';
  localBeatAnalysis.mode = (localBeatAnalysis.song && localBeatMapPrefs[localBeatAnalysis.song.localKey] === 'dj') ? 'dj' : 'mr';
  localBeatAnalysis.active = false;
  setLocalBeatStatus('', '');
  updateLocalBeatModal();
  openGsapModal(document.getElementById('local-beat-modal'));
}
function closeLocalBeatModal() {
  if (localBeatAnalysis.active) return;
  closeGsapModal(document.getElementById('local-beat-modal'));
}
function selectLocalBeatMode(mode) {
  if (localBeatAnalysis.active) return;
  localBeatAnalysis.mode = mode === 'dj' ? 'dj' : 'mr';
  updateLocalBeatModal();
}
function updateLocalBeatModal() {
  var song = localBeatAnalysis.song || currentLocalSong || {};
  var mode = localBeatAnalysis.mode === 'dj' ? 'dj' : 'mr';
  var modal = document.querySelector('#local-beat-modal .local-beat-modal');
  if (modal) modal.classList.toggle('analyzing', !!localBeatAnalysis.active);
  var title = document.getElementById('local-beat-title');
  var sub = document.getElementById('local-beat-sub');
  if (title) title.textContent = song.name || '本地歌曲';
  if (sub) {
    var cachedBits = [];
    if (song.localKey && getLocalBeatEntry(song.localKey, 'mr')) cachedBits.push('MR 已缓存');
    if (song.localKey && getLocalBeatEntry(song.localKey, 'dj')) cachedBits.push('DJ 已缓存');
    sub.textContent = cachedBits.length ? cachedBits.join(' / ') : '选择一种电影视角分析方式';
  }
  var mr = document.getElementById('local-beat-tab-mr');
  var dj = document.getElementById('local-beat-tab-dj');
  if (mr) mr.classList.toggle('active', mode === 'mr');
  if (dj) dj.classList.toggle('active', mode === 'dj');
  var desc = document.getElementById('local-beat-desc');
  if (desc) desc.textContent = mode === 'dj'
    ? '适合 DJ、长混音或鼓点密集的本地音频，会使用更稳定的低频锁拍并进入 DJ 视觉驱动。'
    : '适合普通歌曲和日常播放，会沿用 Mineradio 电影视角的综合节奏分析。';
  var start = document.getElementById('local-beat-start-btn');
  var cancel = document.getElementById('local-beat-cancel-btn');
  var later = document.getElementById('local-beat-later-btn');
  if (start) {
    start.disabled = !!localBeatAnalysis.active;
    start.textContent = getLocalBeatEntry(song.localKey, mode) ? '使用缓存' : '开始分析';
  }
  if (cancel) cancel.style.display = localBeatAnalysis.active ? '' : 'none';
  if (later) later.style.display = localBeatAnalysis.active ? 'none' : '';
}
function cancelLocalBeatAnalysis() {
  if (!localBeatAnalysis.active) {
    closeLocalBeatModal();
    return;
  }
  localBeatAnalysis.active = false;
  localBeatAnalysis.token++;
  beatMapToken++;
  djBeatMapToken++;
  beatMapBusy = false;
  djBeatMapBusy = false;
  cancelBeatAnalysisTimer();
  cancelDjBeatAnalysisTimer();
  hideBeatChip();
  if (localBeatAnalysis.mode === 'dj') setDjModeActive(false, localBeatAnalysis.song || currentLocalSong);
  setLocalBeatStatus('已取消分析', 'fail');
  updateLocalBeatModal();
}
async function startLocalBeatAnalysis(mode) {
  var song = localBeatAnalysis.song || currentLocalSong;
  var audioUrl = localBeatAnalysis.audioUrl || (song && song.localUrl) || (audio && audio.src) || '';
  mode = mode || localBeatAnalysis.mode;
  mode = mode === 'dj' ? 'dj' : 'mr';
  if (!song || !song.localKey || !audioUrl || localBeatAnalysis.active) return;
  var cached = getLocalBeatEntry(song.localKey, mode);
  if (cached) {
    applyLocalBeatMap(song, mode, cached, true);
    closeGsapModal(document.getElementById('local-beat-modal'));
    return;
  }
  localBeatAnalysis.active = true;
  localBeatAnalysis.mode = mode;
  localBeatAnalysis.token++;
  var localToken = localBeatAnalysis.token;
  updateLocalBeatModal();
  setLocalBeatStatus((mode === 'dj' ? 'DJ' : 'MR') + ' 分析准备中...', 'warn');
  try {
    var map = null;
    if (mode === 'dj') {
      setDjModeActive(true, song);
      djBeatMapToken++;
      resetDjBeatMapState();
      currentBeatMap = null;
      resetBeatCameraSync(audio ? audio.currentTime : 0);
      var djToken = djBeatMapToken;
      map = await analyzePodcastDjBeats(audioUrl, djToken, audio && isFinite(audio.duration) ? audio.duration : 0);
      if (localToken !== localBeatAnalysis.token || djToken !== djBeatMapToken) return;
      if (!map) throw new Error('DJ analysis returned empty map');
    } else {
      setDjModeActive(false, song);
      beatMapToken++;
      currentBeatMap = null;
      beatMapNextIdx = 0;
      resetBeatCameraSync(audio ? audio.currentTime : 0);
      var mrToken = beatMapToken;
      map = await analyzeAudioBeats(audioUrl, audio && isFinite(audio.duration) ? audio.duration : 0, mrToken, { background:false, song: song });
      if (localToken !== localBeatAnalysis.token || mrToken !== beatMapToken) return;
      if (!map) throw new Error('MR analysis returned empty map');
    }
    storeLocalBeatEntry(song.localKey, mode, map, song);
    applyLocalBeatMap(song, mode, map, false);
    localBeatAnalysis.active = false;
    setLocalBeatStatus((mode === 'dj' ? 'DJ' : 'MR') + ' 分析完成: ' + localBeatVisualCount(map) + ' 个主拍');
    updateLocalBeatModal();
    showToast((mode === 'dj' ? 'DJ' : 'MR') + ' 本地节奏分析完成');
    setTimeout(function(){
      if (!localBeatAnalysis.active) closeGsapModal(document.getElementById('local-beat-modal'));
    }, 900);
  } catch (err) {
    console.warn('local beat analysis failed:', err);
    localBeatAnalysis.active = false;
    hideBeatChip();
    if (mode === 'dj') setDjModeActive(false, song);
    setLocalBeatStatus('分析失败，请换另一种模式重试', 'fail');
    updateLocalBeatModal();
    showToast('本地节奏分析失败');
  }
}

function smoothBeatMapHandoff(songId, map, token, song) {
  if (!map) return;
  showBeatChip('节奏缓冲中…');
  var wait = Math.max(260, Math.min(720, 340 + (beatPulse + beatCam.punch) * 260));
  var apply = function() {
    if (token !== beatMapToken) return;
    beatMapCache[songId] = map;
    currentBeatMap = map;
    applyCinemaProfileFromBeatMap(map);
    var t = audio ? audio.currentTime : 0;
    syncBeatMapPlaybackCursor(t, true);
    hideBeatChip();
    notifyDesktopLyricsBeatMapReady();
    showToast('节奏分析完成: ' + (map.visualBeatCount || (map.cameraBeats && map.cameraBeats.length) || 0) + ' 个视觉主拍');
    writeBeatDiskCache(songId, map, song, 'mr');
    scheduleQueueBeatPrefetch(currentIdx, 1000);
  };
  scheduleVisualApply(apply, wait, 460);
}

function applyBeatMapCacheForCurrent(songId, map, token, message) {
  if (!songId || !map || token !== beatMapToken) return false;
  beatMapCache[songId] = map;
  currentBeatMap = map;
  applyCinemaProfileFromBeatMap(map);
  syncBeatMapPlaybackCursor(audio ? audio.currentTime : 0, true);
  hideBeatChip();
  notifyDesktopLyricsBeatMapReady();
  if (message) console.log(message, songId, map.visualBeatCount || 0);
  scheduleQueueBeatPrefetch(currentIdx, 1000);
  return true;
}

// 每帧调用 — 按 beatMap 触发预演鼓点
function syncBeatMapPlaybackCursor(t, preserveVisualState) {
  if (djMode.active) {
    syncPodcastDjMapCursor(t, preserveVisualState);
    return;
  }
  t = isFinite(t) ? t : 0;
  beatMapNextIdx = 0;
  var pulseEvents = currentBeatMap && (currentBeatMap.pulseBeats || currentBeatMap.kicks);
  if (pulseEvents) {
    while (beatMapNextIdx < pulseEvents.length && beatEventTime(pulseEvents[beatMapNextIdx]) < t) beatMapNextIdx++;
  }
  if (preserveVisualState) alignBeatCameraCursorToTime(t);
  else syncBeatCameraToTime(t);
}

function syncPodcastDjMapCursor(t, preserveVisualState) {
  t = isFinite(t) ? t : 0;
  djBeatMapNextIdx = 0;
  djBeatPulseNextIdx = 0;
  if (currentDjBeatMap) {
    var beatEvents = currentDjBeatMap.cameraBeats || currentDjBeatMap.beats || currentDjBeatMap.kicks || [];
    var camSyncTime = Math.max(0, t - 0.025);
    while (djBeatMapNextIdx < beatEvents.length && beatEventTime(beatEvents[djBeatMapNextIdx]) < camSyncTime) djBeatMapNextIdx++;
    var pulseEvents = currentDjBeatMap.pulseBeats || currentDjBeatMap.kicks || [];
    var pulseSyncTime = Math.max(0, t - 0.035);
    while (djBeatPulseNextIdx < pulseEvents.length && beatEventTime(pulseEvents[djBeatPulseNextIdx]) < pulseSyncTime) djBeatPulseNextIdx++;
  }
  if (!preserveVisualState) resetBeatCameraSync(t);
}

function tickPodcastDjBeatMap() {
  if (!djMode.active || !currentDjBeatMap || !audio || audio.paused) return;
  var t = audio.currentTime || 0;
  if (currentDjBeatMap.partialUntilSec && t > currentDjBeatMap.partialUntilSec + beatCam.lookahead) return;
  var beatEvents = currentDjBeatMap.cameraBeats || currentDjBeatMap.beats || currentDjBeatMap.kicks || [];
  var pulseEvents = currentDjBeatMap.pulseBeats || currentDjBeatMap.kicks || [];
  while (djBeatMapNextIdx < beatEvents.length) {
    var beat = beatEvents[djBeatMapNextIdx];
    var beatTime = beatEventTime(beat);
    if (beatTime > t + beatCam.lookahead) break;
    scheduleBeatCamera(beat, 'djmap');
    djBeatMapNextIdx++;
  }
  while (djBeatPulseNextIdx < pulseEvents.length && beatEventTime(pulseEvents[djBeatPulseNextIdx]) <= t) {
    triggerScheduledBeat(pulseEvents[djBeatPulseNextIdx]);
    djBeatPulseNextIdx++;
  }
}

function tickBeatMap() {
  if (djMode.active) return;
  if (!currentBeatMap || !audio || audio.paused) return;
  var t = audio.currentTime;
  var beatEvents = currentBeatMap.cameraBeats || currentBeatMap.beats || currentBeatMap.kicks || [];
  var pulseEvents = currentBeatMap.pulseBeats || currentBeatMap.kicks || [];
  var gridTimingLocked = currentBeatMap.tempoSource === 'music-tempo' && beatEvents.length >= 4;
  var liveFreshWindow = Math.max(0.50, rtBeat.tempoGap ? rtBeat.tempoGap * 1.18 : 0.50);
  var realtimeHasLock = rtBeat.lastHitAt > 0 && (t - rtBeat.lastHitAt) < liveFreshWindow;
  while (beatCam.nextIdx < beatEvents.length) {
    var beat = beatEvents[beatCam.nextIdx];
    var beatTime = typeof beat === 'number' ? beat : beat.time;
    if (beatTime > t + beatCam.lookahead) break;
    if (gridTimingLocked || !realtimeHasLock) scheduleBeatCamera(beat, 'map');
    beatCam.nextIdx++;
  }
  while (beatMapNextIdx < pulseEvents.length && beatEventTime(pulseEvents[beatMapNextIdx]) <= t) {
    // 触发预演冲击
    if (gridTimingLocked || !realtimeHasLock) triggerScheduledBeat(pulseEvents[beatMapNextIdx]);
    beatMapNextIdx++;
  }
}

function triggerScheduledBeat(beat) {
  var strength = typeof beat === 'number' ? 0.42 : Math.max(0, Math.min(1, beat && beat.strength != null ? beat.strength : 0.42));
  var impact = typeof beat === 'number' ? strength : Math.max(0, Math.min(1, beat && beat.impact != null ? beat.impact : strength));
  if (impact < 0.18 && strength < 0.52) return;
  if ((cinemaTrackProfile.scale || 1) < 0.52 && impact < 0.46 && strength < 0.74) return;
  var body = typeof beat === 'number' ? 0 : Math.max(0, Math.min(1, beat && beat.body != null ? beat.body : 0));
  var combo = typeof beat === 'number' ? null : beat && beat.combo;
  var comboLift = combo === 'downbeat' ? 0.08 : (combo === 'drop' ? 0.04 : 0);
  var dynScale = cameraDynamicsScale(0.88 + impact * 0.16);
  var djPulse = beat && beat.dj;
  var pulse = (0.14 + strength * 0.46 + impact * 0.18 + body * 0.08 + comboLift) * dynScale;
  if (djPulse) pulse = (0.12 + strength * 0.50 + impact * 0.28 + comboLift * 0.70) * clampRange(dynScale, 0.78, 1.18);
  pulse = Math.min(djPulse ? 0.92 : 0.78, pulse);
  scheduledBeatPulse = Math.max(scheduledBeatPulse, pulse);
  scheduledBeatFlag = true;
}
var scheduledBeatPulse = 0;
var scheduledBeatFlag = false;

function showAIDepthChip(text) {
  document.getElementById('ai-depth-text').textContent = text || 'AI 深度估计…';
  document.getElementById('ai-depth-chip').classList.add('show');
}
function hideAIDepthChip() {
  document.getElementById('ai-depth-chip').classList.remove('show');
}

function loadCoverFromUrl(directUrl, opts) {
  opts = opts || {};
  if (!directUrl || typeof directUrl !== 'string' || !/^https?:\/\//i.test(directUrl)) {
    if (!coverApplyStillCurrent(opts)) return;
    currentCoverSource = null;
    coverProcessToken++;
    uniforms.uHasCover.value = 0; setCoverDepthState(0, 0, 1);
    resetFloatColorsToIdle();
    document.getElementById('album-bg').classList.remove('visible');
    document.getElementById('thumb-cover').removeAttribute('src');
    setControlCoverSrc('');
    return;
  }
  document.getElementById('album-bg').style.backgroundImage = "url(" + directUrl + ")";
  document.getElementById('album-bg').classList.add('visible');
  var proxiedUrl = coverProxySrc(directUrl);
  if (!proxiedUrl) {
    uniforms.uHasCover.value = 0; setCoverDepthState(0, 0, 1);
    resetFloatColorsToIdle();
    setControlCoverSrc('');
    return;
  }
  var img = new Image(); img.crossOrigin = 'anonymous'; img.decoding = 'async';
  img.onload = function() {
    if (!coverApplyStillCurrent(opts)) return;
    var size = coverTextureSizeForResolution(fx.coverResolution);
    var cv = document.createElement('canvas'); cv.width = cv.height = size;
    var cx = cv.getContext('2d');
    var iw = img.naturalWidth, ih = img.naturalHeight, s = Math.min(iw, ih);
    cx.drawImage(img, (iw-s)/2, (ih-s)/2, s, s, 0, 0, size, size);
    applyCoverCanvas(cv, proxiedUrl || directUrl, Object.assign({}, opts, { coverKey: directUrl || proxiedUrl || '', coverSourceKind: 'url', coverSource: directUrl }));
  };
  img.onerror = function() {
    var img2 = new Image(); img2.crossOrigin = 'anonymous'; img2.decoding = 'async';
    img2.onload = function() {
      if (!coverApplyStillCurrent(opts)) return;
      var size = coverTextureSizeForResolution(fx.coverResolution);
      var cv = document.createElement('canvas'); cv.width = cv.height = size;
      cv.getContext('2d').drawImage(img2, 0, 0, size, size);
      applyCoverCanvas(cv, directUrl, Object.assign({}, opts, { coverKey: directUrl || '', coverSourceKind: 'url', coverSource: directUrl }));
    };
    img2.onerror = function() {
      if (!coverApplyStillCurrent(opts)) return;
      currentCoverSource = null;
      uniforms.uHasCover.value = 0; setCoverDepthState(0, 0, 1);
      resetFloatColorsToIdle();
      setControlCoverSrc('');
    };
    img2.src = directUrl;
  };
  img.src = proxiedUrl;
}

function setAlbumBackground(src) {
  var bg = document.getElementById('album-bg');
  if (!bg) return;
  if (!src) {
    bg.classList.remove('visible');
    bg.style.backgroundImage = '';
    return;
  }
  bg.style.backgroundImage = "url(" + src + ")";
  bg.classList.add('visible');
}

function makeSquareCoverCanvas(img, size, crop) {
  size = size || 512;
  var cv = document.createElement('canvas');
  cv.width = cv.height = size;
  var cx = cv.getContext('2d');
  cx.clearRect(0, 0, size, size);
  var iw = img.naturalWidth || img.width;
  var ih = img.naturalHeight || img.height;
  if (crop) {
    cx.drawImage(img, crop.sx, crop.sy, crop.sSize, crop.sSize, 0, 0, size, size);
  } else {
    var s = Math.min(iw, ih);
    cx.drawImage(img, (iw - s) / 2, (ih - s) / 2, s, s, 0, 0, size, size);
  }
  return cv;
}

function coverCanvasToDataUrl(cv) {
  try {
    var webp = cv.toDataURL('image/webp', 0.88);
    if (/^data:image\/webp/i.test(webp)) return webp;
  } catch (e) {}
  return cv.toDataURL('image/jpeg', 0.88);
}

function applyCoverDataUrl(dataUrl, opts) {
  opts = opts || {};
  if (!dataUrl) return;
  var img = new Image();
  img.decoding = 'async';
  img.onload = function() {
    if (!coverApplyStillCurrent(opts)) return;
    var cv = makeSquareCoverCanvas(img, coverTextureSizeForResolution(fx.coverResolution));
    setAlbumBackground(dataUrl);
    applyCoverCanvas(cv, dataUrl, Object.assign({}, opts, { coverSourceKind: 'data', coverSource: dataUrl }));
  };
  img.src = dataUrl;
}

function commitCustomCoverCanvas(cv, opts) {
  var out = document.createElement('canvas');
  out.width = out.height = 512;
  out.getContext('2d').drawImage(cv, 0, 0, 512, 512);
  setCustomCoverForCurrent(coverCanvasToDataUrl(out), opts);
}

function loadCoverFromFile(file, opts) {
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      var iw = img.naturalWidth || img.width;
      var ih = img.naturalHeight || img.height;
      if (Math.abs(iw - ih) <= 1) {
        commitCustomCoverCanvas(makeSquareCoverCanvas(img, 512), opts);
      } else {
        openCoverCropModal(img, e.target.result);
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function bindCoverCropModal() {
  if (coverCropBound) return;
  coverCropBound = true;
  var stage = document.getElementById('cover-crop-stage');
  var zoom = document.getElementById('cover-crop-zoom');
  if (!stage || !zoom) return;
  stage.addEventListener('pointerdown', function(e) {
    if (!coverCropState) return;
    e.preventDefault();
    coverCropState.dragging = true;
    coverCropState.lastX = e.clientX;
    coverCropState.lastY = e.clientY;
    stage.classList.add('dragging');
    if (stage.setPointerCapture) {
      try { stage.setPointerCapture(e.pointerId); } catch (err) {}
    }
  });
  stage.addEventListener('pointermove', function(e) {
    if (!coverCropState || !coverCropState.dragging) return;
    e.preventDefault();
    var dx = e.clientX - coverCropState.lastX;
    var dy = e.clientY - coverCropState.lastY;
    coverCropState.lastX = e.clientX;
    coverCropState.lastY = e.clientY;
    coverCropState.x += dx;
    coverCropState.y += dy;
    updateCoverCropTransform();
  });
  function stopDrag() {
    if (!coverCropState) return;
    coverCropState.dragging = false;
    stage.classList.remove('dragging');
  }
  stage.addEventListener('pointerup', stopDrag);
  stage.addEventListener('pointercancel', stopDrag);
  stage.addEventListener('wheel', function(e) {
    if (!coverCropState) return;
    e.preventDefault();
    var next = coverCropState.scaleFactor + (e.deltaY < 0 ? 0.10 : -0.10);
    coverCropState.scaleFactor = Math.max(1, Math.min(3.2, next));
    zoom.value = coverCropState.scaleFactor;
    updateCoverCropTransform();
  }, { passive: false });
  zoom.addEventListener('input', function() {
    if (!coverCropState) return;
    coverCropState.scaleFactor = Math.max(1, Math.min(3.2, parseFloat(zoom.value) || 1));
    updateCoverCropTransform();
  });
}

function openCoverCropModal(img, dataUrl) {
  bindCoverCropModal();
  var modal = document.getElementById('cover-crop-modal');
  var stage = document.getElementById('cover-crop-stage');
  var imgEl = document.getElementById('cover-crop-img');
  var zoom = document.getElementById('cover-crop-zoom');
  if (!modal || !stage || !imgEl || !zoom) return;
  imgEl.src = dataUrl;
  zoom.value = '1';
  coverCropState = {
    img: img,
    dataUrl: dataUrl,
    naturalW: img.naturalWidth || img.width,
    naturalH: img.naturalHeight || img.height,
    stageSize: 0,
    baseScale: 1,
    scaleFactor: 1,
    x: 0,
    y: 0,
    dragging: false,
    lastX: 0,
    lastY: 0
  };
  openGsapModal(modal);
  requestAnimationFrame(function(){
    initCoverCropGeometry();
    pulseCoverCropStage();
  });
}

function initCoverCropGeometry() {
  if (!coverCropState) return;
  var stage = document.getElementById('cover-crop-stage');
  var rect = stage ? stage.getBoundingClientRect() : null;
  var size = rect ? Math.max(220, Math.round(rect.width)) : 312;
  coverCropState.stageSize = size;
  coverCropState.baseScale = size / Math.min(coverCropState.naturalW, coverCropState.naturalH);
  coverCropState.x = 0;
  coverCropState.y = 0;
  updateCoverCropTransform();
}

function clampCoverCropPan() {
  if (!coverCropState) return;
  var s = coverCropState.baseScale * coverCropState.scaleFactor;
  var rw = coverCropState.naturalW * s;
  var rh = coverCropState.naturalH * s;
  var maxX = Math.max(0, (rw - coverCropState.stageSize) / 2);
  var maxY = Math.max(0, (rh - coverCropState.stageSize) / 2);
  coverCropState.x = Math.max(-maxX, Math.min(maxX, coverCropState.x));
  coverCropState.y = Math.max(-maxY, Math.min(maxY, coverCropState.y));
}

function updateCoverCropTransform() {
  if (!coverCropState) return;
  clampCoverCropPan();
  var imgEl = document.getElementById('cover-crop-img');
  if (!imgEl) return;
  var baseW = coverCropState.naturalW * coverCropState.baseScale;
  var baseH = coverCropState.naturalH * coverCropState.baseScale;
  imgEl.style.width = baseW + 'px';
  imgEl.style.height = baseH + 'px';
  imgEl.style.transform = 'translate(-50%, -50%) translate(' + coverCropState.x + 'px,' + coverCropState.y + 'px) scale(' + coverCropState.scaleFactor + ')';
  drawCoverCropPreview();
}

function currentCoverCropRect() {
  if (!coverCropState) return null;
  var s = coverCropState.baseScale * coverCropState.scaleFactor;
  var rw = coverCropState.naturalW * s;
  var rh = coverCropState.naturalH * s;
  var left = coverCropState.stageSize / 2 - rw / 2 + coverCropState.x;
  var top = coverCropState.stageSize / 2 - rh / 2 + coverCropState.y;
  var sx = (0 - left) / s;
  var sy = (0 - top) / s;
  var sSize = coverCropState.stageSize / s;
  sx = Math.max(0, Math.min(coverCropState.naturalW - sSize, sx));
  sy = Math.max(0, Math.min(coverCropState.naturalH - sSize, sy));
  return { sx: sx, sy: sy, sSize: sSize };
}

function drawCoverCropPreview() {
  if (!coverCropState) return;
  var preview = document.getElementById('cover-crop-preview');
  var crop = currentCoverCropRect();
  if (!preview || !crop) return;
  var ctx = preview.getContext('2d');
  ctx.clearRect(0, 0, preview.width, preview.height);
  ctx.drawImage(coverCropState.img, crop.sx, crop.sy, crop.sSize, crop.sSize, 0, 0, preview.width, preview.height);
}

function pulseCoverCropStage() {
  var stage = document.getElementById('cover-crop-stage');
  if (!stage || !window.gsap) return;
  window.gsap.fromTo(stage, { scale: 0.985 }, { scale: 1, duration: 0.72, ease: 'expo.out', overwrite: true });
}

function closeCoverCropModal() {
  var modal = document.getElementById('cover-crop-modal');
  closeGsapModal(modal, function(){
    var imgEl = document.getElementById('cover-crop-img');
    if (imgEl) imgEl.removeAttribute('src');
    coverCropState = null;
  });
}

function commitCoverCrop() {
  if (!coverCropState) return;
  var crop = currentCoverCropRect();
  if (!crop) return;
  var cv = makeSquareCoverCanvas(coverCropState.img, 512, crop);
  commitCustomCoverCanvas(cv);
  closeCoverCropModal();
}

// ============================================================
//  3D 歌单架 — 双模式 (off / side / stage)
//   - side:   现版本精修, 右侧 5 张卡微角度堆叠
//   - stage:  弧形排列, 居中, 有倒影, 当前卡片"呼吸+光环"
//             卡片间粒子穿梭, 切歌时飞出动画
// ============================================================
var shelfPinnedOpen = false;
var shelfManager = null;
var shelfOpenAnimAt = -10;
var shelfHoverCue = { target: 0, value: 0, x: 0, y: 0, lastAt: 0, enteredAt: 0, zoneActive: false, guide: false };
var shelfVisibility = 0;  // 0..1, 侧栏自动隐藏的整体透明度系数
function isPortraitShelfViewport() {
  return innerHeight > innerWidth * 1.08;
}
function shelfLayoutProfile() {
  var portrait = isPortraitShelfViewport();
  var narrow = !portrait && innerWidth < 980;
  var skullShelf = shouldUseSkullSafeShelfCamera();
  var detailScale = portrait ? clampRange(innerWidth / 820, 0.70, 0.86) : (narrow ? 0.92 : 1.04);
  var shelfCtl = shelfSettings();
  return {
    portrait: portrait,
    narrow: narrow,
    sideX: (skullShelf ? (portrait ? 0.22 : (narrow ? 0.46 : 0.76)) : (portrait ? 1.56 : (narrow ? 2.48 : 3.18))) + shelfCtl.x,
    sideY: (skullShelf ? (portrait ? -0.22 : (narrow ? -0.30 : -0.34)) : 0) + shelfCtl.y,
    sideXStep: skullShelf ? (portrait ? 0.018 : 0.034) : (portrait ? 0.018 : 0.040),
    sideYStep: skullShelf ? (portrait ? 0.46 : 0.62) : (portrait ? 0.52 : 0.68),
    sideZ: (skullShelf ? (portrait ? 0.86 : 0.92) : (portrait ? 0.78 : 0.86)) + shelfCtl.z,
    sideZStep: skullShelf ? (portrait ? 0.108 : 0.158) : (portrait ? 0.118 : 0.170),
    sideEntryX: skullShelf ? (portrait ? 0.30 : 0.50) : (portrait ? 0.38 : 0.82),
    sideDetailShift: skullShelf ? (portrait ? 0.00 : 0.00) : (portrait ? 0.38 : 0.82),
    sideScale: (skullShelf ? (portrait ? 0.84 : (narrow ? 1.04 : 1.22)) : (portrait ? 0.70 : (narrow ? 0.86 : 1))) * shelfCtl.size,
    sideRotY: (skullShelf ? (portrait ? -0.085 : -0.190) : (portrait ? 0.12 : 0.28)) + shelfCtl.angle,
    sideRotX: skullShelf ? (portrait ? 0.018 : 0.030) : (portrait ? 0.022 : 0.042),
    stageX: shelfCtl.x,
    stageXStep: portrait ? 0.92 : (narrow ? 1.22 : 1.55),
    stageY: (portrait ? -2.46 : -2.20) + shelfCtl.y,
    stageZ: (portrait ? 0.84 : 1.0) + shelfCtl.z,
    stageScale: (portrait ? 0.72 : (narrow ? 0.86 : 1)) * shelfCtl.size,
    detail: {
      x: (skullShelf ? (portrait ? 0.16 : (narrow ? 0.40 : 0.64)) : (portrait ? 0.38 : (narrow ? 0.96 : 1.28))) + shelfCtl.x * 0.62,
      y: (skullShelf ? (portrait ? -0.40 : -0.68) : (portrait ? 0.10 : 0.18)) + shelfCtl.y * 0.55,
      z: (skullShelf ? (portrait ? 1.10 : 1.22) : (portrait ? 1.28 : 1.36)) + shelfCtl.z * 0.45,
      rx: skullShelf ? (portrait ? 0.006 : 0.014) : (portrait ? -0.004 : -0.008),
      ry: (skullShelf ? (portrait ? -0.070 : -0.165) : (portrait ? 0.00 : 0.020)) + shelfCtl.angle * 0.55,
      scale: (skullShelf ? detailScale * (portrait ? 0.88 : 1.02) : detailScale) * shelfCtl.size,
      rowStep: skullShelf ? (portrait ? 0.37 : 0.43) : (portrait ? 0.36 : 0.42),
      rowScale: skullShelf ? (portrait ? 0.90 : 1.02) : (portrait ? 0.88 : (narrow ? 0.96 : 1.00))
    }
  };
}
function shelfHotZoneWidth() {
  var ratio = isPortraitShelfViewport() ? 0.26 : 0.18;
  return Math.min(isPortraitShelfViewport() ? 280 : 360, Math.max(148, innerWidth * ratio));
}
function shelfPreviewUseZoneWidth() {
  return Math.min(820, Math.max(shelfHotZoneWidth(), innerWidth * 0.56));
}
function shelfWheelZoneWidth() {
  var portrait = isPortraitShelfViewport();
  var ratioWidth = innerWidth * (portrait ? 0.24 : 0.18);
  return Math.min(portrait ? 280 : 360, Math.max(shelfHotZoneWidth(), ratioWidth));
}
function isShelfClickZone(e) {
  var edge = shelfPinnedOpen ? Math.min(390, Math.max(210, innerWidth * 0.22)) : shelfHotZoneWidth();
  return e.clientX > innerWidth - edge && e.clientY > 130 && e.clientY < innerHeight - 150;
}
function isShelfPreviewUseZone(e) {
  var edge = shelfPreviewUseZoneWidth();
  return e.clientX > innerWidth - edge && e.clientY > 96 && e.clientY < innerHeight - 96;
}
function isShelfWheelZone(e) {
  var edge = shelfWheelZoneWidth();
  return e.clientX > innerWidth - edge && e.clientY > 116 && e.clientY < innerHeight - 116;
}
function canUseSideShelfWithoutPinnedOpen() {
  return !!shelfAlwaysVisible();
}
function shelfPreviewIsVisible() {
  return shelfHoverCue.guide || shelfHoverCue.zoneActive || shelfHoverCue.target > 0 || shelfHoverCue.value > 0.10 || shelfVisibility > 0.12;
}
function shelfAutoHiddenInputReady() {
  if (shelfPinnedOpen || shelfAlwaysVisible()) return true;
  if (shelfManager && shelfManager.hasOpenContent && shelfManager.hasOpenContent()) return true;
  return !!(shelfHoverCue.guide || shelfHoverCue.zoneActive || shelfHoverCue.value > 0.18 || shelfVisibility > 0.16);
}
function canShowShelfHoverCueAt(e) {
  if (!e) return false;
  if (!shelfHoverCue.guide) return false;
  if (document.body.classList.contains('splash-active')) return false;
  if (visualGuideActive || emptyHomeActive || homeForcedOpen) return false;
  if (!shelfManager || !shelfManager.getMode || shelfManager.getMode() !== 'side') return false;
  if (shelfPinnedOpen) return false;
  if (shelfManager.hasOpenContent && shelfManager.hasOpenContent()) return false;
  if (isPointerOverUi(e)) return false;
  if (isShelfClickZone(e)) return true;
  return shelfPreviewIsVisible() && isShelfPreviewUseZone(e);
}
function shelfCueRect() {
  var w = shelfHotZoneWidth();
  var top = Math.max(136, innerHeight * 0.22);
  var h = Math.min(390, innerHeight - top - 142);
  return { left: innerWidth - w, top: top, width: w, height: h, right: innerWidth, bottom: top + h };
}
function shelfCueCenter() {
  var r = shelfCueRect();
  return { x: r.left + r.width * 0.58, y: r.top + r.height * 0.50 };
}
function setShelfGuideCueActive(on) {
  shelfHoverCue.guide = !!on;
  if (on) {
    var c = shelfCueCenter();
    shelfHoverCue.target = 1;
    shelfHoverCue.value = Math.max(shelfHoverCue.value, 0.72);
    shelfHoverCue.x = c.x;
    shelfHoverCue.y = c.y;
    shelfHoverCue.lastAt = performance.now();
  } else {
    shelfHoverCue.target = 0;
  }
}
function updateShelfHoverCueFromPointer(e) {
  if (!e) {
    if (!shelfHoverCue.guide) shelfHoverCue.target = 0;
    shelfHoverCue.zoneActive = false;
    shelfHoverCue.enteredAt = 0;
    return;
  }
  var active = false;
  var inZone = canShowShelfHoverCueAt(e);
  if (inZone && !shelfHoverCue.zoneActive) {
    shelfHoverCue.zoneActive = true;
    shelfHoverCue.enteredAt = performance.now();
  } else if (!inZone) {
    shelfHoverCue.zoneActive = false;
    shelfHoverCue.enteredAt = 0;
  }
  active = inZone;
  if (!shelfHoverCue.guide) shelfHoverCue.target = active ? 1 : 0;
  shelfHoverCue.x = e.clientX;
  shelfHoverCue.y = e.clientY;
  shelfHoverCue.lastAt = performance.now();
}
function tickShelfHoverCue(dt) {
  if (!shelfHoverCue.guide && shelfHoverCue.zoneActive) {
    var heldPointer = { clientX: shelfHoverCue.x, clientY: shelfHoverCue.y };
    if (canShowShelfHoverCueAt(heldPointer)) {
      if (performance.now() - shelfHoverCue.enteredAt > 260) shelfHoverCue.target = 1;
    } else {
      shelfHoverCue.zoneActive = false;
      shelfHoverCue.enteredAt = 0;
      shelfHoverCue.target = 0;
    }
  }
  if (!shelfHoverCue.guide && !shelfHoverCue.zoneActive && performance.now() - shelfHoverCue.lastAt > 650) shelfHoverCue.target = 0;
  var target = shelfHoverCue.guide ? 1 : shelfHoverCue.target;
  var rate = target > shelfHoverCue.value ? 0.12 : 0.10;
  shelfHoverCue.value += (target - shelfHoverCue.value) * Math.min(1, rate * Math.max(1, dt * 60));
  if (shelfHoverCue.value < 0.006 && !target) shelfHoverCue.value = 0;
  return shelfHoverCue.value;
}
function setShelfPinnedOpen(open, immediate) {
  var nextOpen = !!open;
  if (nextOpen && typeof suppressBottomControlsForShelf === 'function') suppressBottomControlsForShelf(980);
  if (nextOpen && !shelfPinnedOpen) {
    var nowT = uniforms && uniforms.uTime ? uniforms.uTime.value : performance.now() / 1000;
    var previewVisible = shelfHoverCue.guide || shelfHoverCue.value > 0.28 || shelfVisibility > 0.20;
    shelfOpenAnimAt = previewVisible ? nowT - 0.62 : nowT;
    shelfHoverCue.target = 0;
    shelfHoverCue.zoneActive = false;
    shelfHoverCue.enteredAt = 0;
  }
  shelfPinnedOpen = nextOpen;
  var hint = document.getElementById('hint');
  if (hint) hint.classList.toggle('shelf-hidden', shelfPinnedOpen || !!(shelfManager && shelfManager.hasOpenContent && shelfManager.hasOpenContent()));
  if (nextOpen && typeof setPeek === 'function') setPeek(document.getElementById('search-area'), false, 'search');
  if (typeof updateEmptyHomeVisibility === 'function') updateEmptyHomeVisibility({ forceLoad: false });
  if (shelfManager && shelfManager.hasOpenContent && shelfManager.hasOpenContent()) return;
  if (typeof setFocusZone === 'function') setFocusZone(shelfPinnedOpen ? 'shelf-side' : null, immediate);
}
function clearShelfPreviewOnPointerExit() {
  if (!shelfManager || !shelfManager.getMode || shelfManager.getMode() !== 'side') return;
  var hasContent = shelfManager.hasOpenContent && shelfManager.hasOpenContent();
  updateShelfHoverCueFromPointer(null);
  shelfHoverCue.target = 0;
  shelfHoverCue.value = 0;
  shelfHoverCue.zoneActive = false;
  shelfHoverCue.enteredAt = 0;
  if (typeof setShelfHoverTabVisible === 'function') setShelfHoverTabVisible(false);
  if (shelfManager && shelfManager.clearSelected) shelfManager.clearSelected();
  if (hasContent && shelfManager.closeContent) safeShelfCloseContent('shelf-mode-reset');
  if (shelfPinnedOpen) setShelfPinnedOpen(false, true);
  shelfVisibility = 0;
  if (typeof setFocusZone === 'function') setFocusZone(null, true);
}
function suppressShelfPreviewForPlaybackSwitch() {
  if (!shelfManager || !shelfManager.getMode || shelfManager.getMode() !== 'side') return;
  if (shelfPinnedOpen || (shelfManager.hasOpenContent && shelfManager.hasOpenContent())) return;
  updateShelfHoverCueFromPointer(null);
  shelfHoverCue.target = 0;
  shelfHoverCue.value = 0;
  shelfHoverCue.zoneActive = false;
  shelfHoverCue.enteredAt = 0;
  shelfHoverCue.guide = false;
  shelfVisibility = 0;
  if (typeof setShelfHoverTabVisible === 'function') setShelfHoverTabVisible(false);
  if (shelfManager && shelfManager.clearSelected) shelfManager.clearSelected();
  if (typeof setFocusZone === 'function') setFocusZone(null, true);
}
function makeShelfManager() {
  var group = null;
  var cards = [];          // [{canvas, ctx, texture, mesh, item, index, slot}]
  var allItems = [];
  var renderedStart = -1;
  var SHELF_VISIBLE_RADIUS = 5;
  var SHELF_MAX_RENDER = SHELF_VISIBLE_RADIUS * 2 + 1;
  var shelfPane = 'mine';       // mine | fav
  var collectionReveal = 0;     // 滚轮阻尼累积，用于打开/返回收藏歌单
  var paneMemory = { mine:0, fav:0 };
  var paneSwitchAt = -10;
  var paneSwitchDir = 1;
  var mode = 'side';
  var lastSig = '';
  var lastUpdate = 0;
  var lastCardRedrawAt = -10;
  var lastCardPulseBucket = -1;
  var cardBuildQueue = null;
  var selectedIdx = -1;

  // v7.2 PSP 风格状态
  var centerIdx = 0;          // 当前居中卡片 index (在 items 数组中的位置)
  var centerTarget = 0;       // 目标 centerIdx (插值)
  var centerSmooth = 0;       // 当前实际 centerIdx 平滑值
  var openCardIdx = -1;       // 已打开内容框的卡片 (-1 表示无)
  var contentList = null;     // 二级 PSP 滚动列表 manager
  var connectorParticles = null;
  var floorMirror = null;

  // 一次性返回完整 items 数组 (不只 5 张, 全部参与 PSP 滚动)
  function splitPlaylists() {
    var mine = [], fav = [];
    userPlaylists.forEach(function(pl) {
      (pl.subscribed ? fav : mine).push(pl);
    });
    return { mine: mine, fav: fav };
  }

  function shelfShowsPodcasts() {
    return !fx || fx.shelfShowPodcasts !== false;
  }

  function shelfMergesCollections() {
    return !!(fx && fx.shelfMergeCollections === true);
  }

  function activePlaylists() {
    var panes = splitPlaylists();
    if (shelfMergesCollections()) return panes.mine.concat(panes.fav);
    var source = (shelfPane === 'fav') ? panes.fav : panes.mine;
    if (!source.length && shelfPane === 'mine' && panes.fav.length) source = panes.fav;
    if (!source.length && shelfPane === 'fav' && panes.mine.length) source = panes.mine;
    return source;
  }

  function currentItems() {
    if (hasAnyPlatformLogin() && (userPlaylists.length || myPodcastCollections.length)) {
      var source = activePlaylists();
      var items = source.map(function(pl){
        var provider = pl.provider === 'qq' ? 'qq' : 'netease';
        var sourceLabel = provider === 'qq' ? 'QQ' : 'NE';
        return { type:'playlist', title: pl.name, sub:sourceLabel + ' · ' + (pl.trackCount||0)+' 首 · 播放 '+compactCount(pl.playCount||0),
          cover: pl.cover || '', tag: pl.subscribed ? '收藏歌单' : '我的歌单', playlistId: (provider === 'qq' ? 'qq:' : '') + pl.id, provider: provider };
      });
      if (shelfShowsPodcasts() && (shelfPane === 'mine' || shelfMergesCollections()) && myPodcastCollections.length) {
        myPodcastCollections.forEach(function(pc){
          items.push({ type:'podcastCollection', title: pc.title, sub:(pc.count || 0) + ' items', cover: pc.cover || '', tag:'我的播客', podcastKey: pc.key, itemType: pc.itemType });
        });
      }
      if (items.length) return items;
    }
    if (playQueue.length) {
      return playQueue.map(function(song, idx){
        return { type:'queue', title: song.name, sub: song.artist || '未知歌手',
          cover: songCoverSrc(song, 360), tag: idx === currentIdx ? '正在播放' : ('#' + (idx+1)), queueIndex: idx };
      });
    }
    return [];
  }

  function makeRoundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  }
  function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    var chars = String(text || '').split('');
    var line = '', lines = [];
    for (var i = 0; i < chars.length; i++) {
      var test = line + chars[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line); line = chars[i];
        if (lines.length >= maxLines - 1) break;
      } else line = test;
    }
    if (line && lines.length < maxLines) lines.push(line);
    for (var j = 0; j < lines.length; j++) ctx.fillText(lines[j], x, y + j * lineHeight);
  }
  function cardDrawSignature(card, item) {
    item = item || {};
    var rec = item.cover ? playlistCoverCache[item.cover] : null;
    var coverState = item.cover ? (rec && rec.loaded ? 'ready' : (rec && rec.failed ? 'fail' : 'wait')) : 'none';
    var pulseBucket = card && card.isCenter ? Math.round((bass + beatPulse * 0.85) * 6) : 0;
    return [
      item.type || '', item.title || '', item.sub || '', item.tag || '',
      item.playlistId || '', item.podcastKey || '', item.queueIndex == null ? '' : item.queueIndex,
      item.cover || '', coverState, card && card.isCenter ? 1 : 0, card && card.selected ? 1 : 0,
      card && card.dofBucket == null ? -1 : card.dofBucket, pulseBucket, shelfAccentHex(), shelfSettings().bgOpacity
    ].join('|');
  }

  function drawCard(card, item) {
    item = item || card.item || {};
    var nextDrawKey = cardDrawSignature(card, item);
    if (card.drawKey === nextDrawKey) return;
    card.drawKey = nextDrawKey;
    var cv = card.canvas, ctx = card.ctx;
    var W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    var pad = 18;
    var isNow = item.type === 'queue' && item.tag === '正在播放';
    var shelfLook = shelfSettings();

    // 卡片底
    makeRoundRect(ctx, pad, pad, W - pad*2, H - pad*2, 32);
    ctx.fillStyle = 'rgba(0,0,0,' + shelfLook.bgOpacity.toFixed(3) + ')'; ctx.fill();
    var grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, 'rgba(255,255,255,0.10)');
    grad.addColorStop(1, 'rgba(255,255,255,0.018)');
    ctx.fillStyle = grad; ctx.fill();

    if (isNow) {
      ctx.strokeStyle = shelfAccentRgba(0.72);
      ctx.lineWidth = 1.8 + Math.sin(uniforms.uTime.value * 3) * 0.28 + bass * 1.2;
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 1.1;
    }
    ctx.stroke();

    if (card.selected) {
      ctx.save();
      makeRoundRect(ctx, pad + 2, pad + 2, W - pad*2 - 4, H - pad*2 - 4, 30);
      ctx.shadowColor = shelfAccentRgba(0.58);
      ctx.shadowBlur = 18;
      ctx.strokeStyle = shelfAccentRgba(0.72);
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.restore();
    }

    // 大封面方块
    var coverSize = H - pad*2 - 8;
    var cx = pad + 6, cy = pad + 4;
    makeRoundRect(ctx, cx, cy, coverSize, coverSize, 26);
    ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill();
    if (item.cover) {
      var rec = playlistCoverCache[item.cover];
      if (rec && rec.loaded && rec.img) {
        ctx.save(); makeRoundRect(ctx, cx, cy, coverSize, coverSize, 26); ctx.clip();
        ctx.drawImage(rec.img, cx, cy, coverSize, coverSize); ctx.restore();
      } else if (!rec || (!rec.loading && !rec.failed)) {
        requestPlaylistCover(item.cover, function(){ drawCard(card, item); });
      }
    }

    // 文本区
    var tx = pad + coverSize + 32;
    ctx.font = '700 17px Inter, Arial';
    ctx.fillStyle = isNow ? shelfAccentRgba(0.92) : 'rgba(255,255,255,0.92)';
    ctx.fillText(item.tag || '', tx, pad + 36);

    ctx.font = '700 30px Inter, Arial';
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    wrapText(ctx, item.title || '', tx, pad + 78, W - tx - pad - 14, 36, 2);

    ctx.font = '400 17px Inter, Arial';
    ctx.fillStyle = 'rgba(255,255,255,0.52)';
    wrapText(ctx, item.sub || '', tx, pad + 156, W - tx - pad - 14, 24, 2);

    // 律动进度条
    ctx.strokeStyle = isNow ? shelfAccentRgba(0.90) : 'rgba(255,255,255,0.30)';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(tx, H - pad - 22);
    ctx.lineTo(tx + Math.min(260, 80 + bass * 320), H - pad - 22);
    ctx.stroke();

    if (card.isCenter) {
      var actionY = H - pad - 78;
      if (item.type === 'playlist') {
        makeRoundRect(ctx, tx, actionY, 138, 38, 18);
        var playGrad = ctx.createLinearGradient(tx, actionY, tx + 138, actionY + 38);
        playGrad.addColorStop(0, 'rgba(255,255,255,0.88)');
        playGrad.addColorStop(0.55, shelfAccentRgba(0.94));
        playGrad.addColorStop(1, shelfAccentRgba(0.58));
        ctx.fillStyle = playGrad; ctx.fill();
        ctx.strokeStyle = shelfAccentRgba(0.44);
        ctx.lineWidth = 1.1; ctx.stroke();
        ctx.font = '800 14px Inter, "Microsoft YaHei", Arial';
        ctx.fillStyle = readableInkForHex(shelfAccentHex());
        ctx.fillText('▶ 播放歌单', tx + 25, actionY + 24);

        makeRoundRect(ctx, tx + 150, actionY, 104, 38, 18);
        ctx.fillStyle = 'rgba(255,255,255,0.055)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.14)';
        ctx.lineWidth = 1.1; ctx.stroke();
        ctx.font = '700 14px Inter, "Microsoft YaHei", Arial';
        ctx.fillStyle = 'rgba(255,255,255,0.78)';
        ctx.fillText('详情', tx + 184, actionY + 24);
      } else if (item.type === 'queue') {
        ctx.font = '600 14px Inter, "Microsoft YaHei", Arial';
        ctx.fillStyle = shelfAccentRgba(0.84);
        ctx.fillText('点击播放', tx, actionY + 25);
      }
    }

    var dof = card.dofBlur || 0;
    if (dof > 0.12) {
      makeRoundRect(ctx, pad, pad, W - pad*2, H - pad*2, 32);
      ctx.fillStyle = 'rgba(0,0,0,' + Math.min(0.28, dof * 0.18).toFixed(3) + ')';
      ctx.fill();
    }

    card.texture.needsUpdate = true;
  }

  function buildOneCard(item, i) {
    var cv = document.createElement('canvas');
    cv.width = 720; cv.height = 360;
    var ctx = cv.getContext('2d');
    var tx = new THREE.CanvasTexture(cv);
    tx.minFilter = THREE.LinearFilter; tx.magFilter = THREE.LinearFilter;
    tx.generateMipmaps = false;
    var mat = new THREE.MeshBasicMaterial({ map: tx, transparent: true, opacity: 0.96, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
    var geo = new THREE.PlaneGeometry(2.05, 1.025, 1, 1);
    var mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 50 + i;
    mesh.userData.action = item.type === 'playlist'
      ? { kind:'loadPlaylist', playlistId: item.playlistId, title: item.title }
      : (item.type === 'podcastCollection'
        ? { kind:'loadPlaylist', playlistId: 'podcast:' + item.podcastKey, title: item.title }
        : (item.type === 'queue' ? { kind:'playQueue', index: item.queueIndex } : { kind:'empty' }));
    group.add(mesh);
    var card = { canvas: cv, ctx: ctx, texture: tx, mesh: mesh, item: item, index: i, isCenter: false, selected: i === selectedIdx, floatMix: 0, fxPulse: 0, dofBlur: 0, dofBucket: -1, drawKey: '' };
    return card;
  }

  function warmTextureUpload(tex) {
    if (!tex || !renderer || typeof renderer.initTexture !== 'function') return;
    try { renderer.initTexture(tex); } catch (e) {}
  }

  function cancelCardBuildQueue() {
    if (!cardBuildQueue) return;
    cardBuildQueue.cancelled = true;
    if (cardBuildQueue.raf) cancelAnimationFrame(cardBuildQueue.raf);
    cardBuildQueue = null;
  }

  function disposeRenderedCards() {
    cancelCardBuildQueue();
    while (group && group.children.length) {
      var ch = group.children.pop();
      if (ch.material) { if (ch.material.map) ch.material.map.dispose(); ch.material.dispose(); }
      if (ch.geometry) ch.geometry.dispose();
    }
    cards = [];
    renderedStart = -1;
  }

  function scheduleQueuedCardBuild(job) {
    function step(deadline) {
      if (!job || job.cancelled || cardBuildQueue !== job || !group) return;
      var started = performance.now();
      var built = 0;
      while (job.next <= job.end && built < 2 && performance.now() - started < 7) {
        var card = buildOneCard(allItems[job.next], job.next);
        cards.push(card);
        drawCard(card, card.item);
        warmTextureUpload(card.texture);
        job.next += 1;
        built += 1;
      }
      if (job.next <= job.end) {
        if (window.requestIdleCallback) {
          requestIdleCallback(step, { timeout: 180 });
        } else {
          job.raf = requestAnimationFrame(step);
        }
      } else {
        cardBuildQueue = null;
      }
    }
    if (window.requestIdleCallback) requestIdleCallback(step, { timeout: 180 });
    else job.raf = requestAnimationFrame(step);
  }

  function syncRenderedWindow(force, asyncBuild) {
    if (!group) return;
    var total = allItems.length;
    if (!total) { disposeRenderedCards(); return; }
    var center = Math.round(centerTarget);
    var start = Math.max(0, center - SHELF_VISIBLE_RADIUS);
    var end = Math.min(total - 1, start + SHELF_MAX_RENDER - 1);
    start = Math.max(0, end - SHELF_MAX_RENDER + 1);
    if (!force && start === renderedStart && cards.length === (end - start + 1)) {
      cards.forEach(function(c) {
        var nextItem = allItems[c.index] || c.item;
        if (c.item !== nextItem) {
          c.item = nextItem;
          c.drawKey = '';
          drawCard(c, c.item);
        }
      });
      return;
    }
    disposeRenderedCards();
    renderedStart = start;
    if (asyncBuild) {
      cardBuildQueue = { start:start, end:end, next:start, cancelled:false, raf:0 };
      scheduleQueuedCardBuild(cardBuildQueue);
      return;
    }
    for (var itemIdx = start; itemIdx <= end; itemIdx++) {
      var card = buildOneCard(allItems[itemIdx], itemIdx);
      cards.push(card);
      drawCard(card, card.item);
    }
  }

  function rebuild(asyncCards) {
    if (!group) return;
    disposeRenderedCards();
    if (connectorParticles) {
      if (connectorParticles.parent) connectorParticles.parent.remove(connectorParticles);
      if (connectorParticles.geometry) connectorParticles.geometry.dispose();
      if (connectorParticles.material) connectorParticles.material.dispose();
      connectorParticles = null;
    }
    if (floorMirror) {
      if (floorMirror.parent) floorMirror.parent.remove(floorMirror);
      if (floorMirror.geometry) floorMirror.geometry.dispose();
      if (floorMirror.material) floorMirror.material.dispose();
      floorMirror = null;
    }
    allItems = currentItems();
    lastSig = sig(allItems);
    lastCardRedrawAt = -10;
    lastCardPulseBucket = -1;
    // center 起始 = currentIdx (如果是 queue), 否则 0
    if (allItems.length && allItems[0].type === 'queue' && currentIdx >= 0) {
      centerTarget = Math.min(allItems.length - 1, currentIdx);
      centerSmooth = centerTarget;
      centerIdx = centerTarget;
    } else if (centerTarget >= allItems.length) {
      centerTarget = Math.max(0, allItems.length - 1);
      centerSmooth = centerTarget;
    }
    if (selectedIdx >= allItems.length) selectedIdx = -1;
    syncRenderedWindow(true, !!asyncCards);
    if (mode === 'stage') {
      createStageExtras();
    }
  }

  // ====================================================
  //  PSP 弧形布局: 以 centerSmooth 为基准, 卡片绕弧排列
  //  i 距离 center 越远 → 越靠后, 越小, 越淡
  // ====================================================
  function placeCard(card, i, totalCards, modeIs) {
    var delta = card.index - centerSmooth;     // 正=下方, 负=上方
    var absD = Math.abs(delta);
    // 隐藏太远的卡 (>4 全隐藏)
    if (absD > SHELF_VISIBLE_RADIUS + 0.5) { card.mesh.visible = false; return; }
    card.mesh.visible = true;
    card.mesh.renderOrder = 60 + Math.round((SHELF_VISIBLE_RADIUS + 1 - Math.min(absD, SHELF_VISIBLE_RADIUS + 1)) * 10);
    var parX = pointerParallax.x || 0;
    var parY = pointerParallax.y || 0;
    var parWeight = Math.max(0, 1 - absD * 0.16);
    var pulse = card.fxPulse || 0;
    var layout = shelfLayoutProfile();
    var shelfLook = shelfSettings();
    var nextDof = Math.max(0, Math.min(1, (absD - 0.45) / 3.2));
    var nextDofBucket = Math.round(nextDof * 5);
    if (card.dofBucket !== nextDofBucket) {
      card.dofBucket = nextDofBucket;
      card.dofBlur = nextDof;
      drawCard(card, card.item);
    }

    if (modeIs === 'side') {
      // 右侧 3D 架: 恢复更靠近、更斜切的打开姿态，让卡片有真正的前后层次。
      var detailOpenSide = contentList && contentList.isOpen();
      var nowT = uniforms.uTime.value;
      var hoverBreath = (!shelfPinnedOpen && !detailOpenSide) ? shelfVisibility : 0;
      var passiveAlways = shelfAlwaysVisible() && !shelfPinnedOpen && !detailOpenSide;
      var liftTarget = card.selected && !detailOpenSide ? 1 : 0;
      var liftRate = liftTarget > (card.floatMix || 0) ? 0.20 : 0.13;
      card.floatMix = (card.floatMix || 0) + (liftTarget - (card.floatMix || 0)) * liftRate;
      if (!liftTarget && card.floatMix < 0.004) card.floatMix = 0;
      var lift = card.floatMix || 0;
      var sideLayer = Math.max(0, SHELF_VISIBLE_RADIUS + 1 - Math.min(absD, SHELF_VISIBLE_RADIUS + 1));
      card.mesh.renderOrder = passiveAlways
        ? (30 + Math.round(sideLayer * 1.1) + Math.round(lift * 96))
        : (60 + Math.round(sideLayer * 10) + Math.round(lift * 70));
      var breathPulse = hoverBreath * (0.5 + 0.5 * Math.sin(nowT * 1.22 + card.index * 0.74));
      var revealRaw = Math.max(0, Math.min(1, (nowT - shelfOpenAnimAt - absD * 0.035) / 0.62));
      var reveal = revealRaw * revealRaw * (3 - 2 * revealRaw);
      var entry = (1 - reveal) * (0.82 + absD * 0.075);
      var paneRaw = Math.max(0, Math.min(1, (nowT - paneSwitchAt - absD * 0.030) / 0.72));
      var paneEase = 1 - paneRaw * paneRaw * (3 - 2 * paneRaw);
      var wallpaperShelfPose = shouldUseWallpaperSafeShelfCamera();
      var skullShelfPose = shouldUseSkullSafeShelfCamera();
      var safeShelfPose = wallpaperShelfPose || skullShelfPose;
      var px = layout.sideX + absD * layout.sideXStep - (detailOpenSide ? layout.sideDetailShift : 0) + entry * layout.sideEntryX;
      var py = (layout.sideY || 0) - delta * layout.sideYStep + (1 - reveal) * (delta < 0 ? -0.18 : 0.18);
      var pz = layout.sideZ - absD * layout.sideZStep - (1 - reveal) * 0.20;
      px += paneEase * paneSwitchDir * 0.60;
      py += paneEase * (delta < 0 ? -0.16 : 0.16);
      pz -= paneEase * 0.22;
      px += parX * 0.060 * parWeight;
      py += parY * 0.046 * parWeight;
      pz += (parY * 0.026 - parX * 0.028) * parWeight;
      py += Math.sin(nowT * 0.92 + card.index * 0.64) * 0.052 * hoverBreath * Math.max(0.20, parWeight);
      pz += Math.cos(nowT * 0.78 + card.index * 0.52) * 0.030 * hoverBreath * parWeight;
      if (lift > 0.001) {
        px -= lift * (skullShelfPose ? 0.035 : (layout.portrait ? 0.065 : 0.145));
        py += lift * (skullShelfPose ? 0.045 : (layout.portrait ? 0.075 : 0.105));
        pz += lift * (skullShelfPose ? 0.080 : 0.220);
      }
      var scale = (absD < 0.5 ? 1.12 : Math.max(0.55, 1.04 - absD * 0.14)) * (0.88 + reveal * 0.12) * (1 + pulse * 0.056 + breathPulse * 0.026 + lift * (skullShelfPose ? 0.045 : 0.075)) * layout.sideScale;
      if (wallpaperShelfPose) scale *= 1.22;
      else if (skullShelfPose) scale *= 1.04;
      card.mesh.position.set(px, py, pz);
      if (skullShelfPose && camera) {
        card.mesh.quaternion.copy(camera.quaternion);
        card.mesh.rotateX(layout.sideRotX - delta * 0.008 - parY * 0.004 * parWeight);
        card.mesh.rotateY(layout.sideRotY + (1 - reveal) * 0.012 + parX * 0.006 * parWeight);
      } else {
        var safeRotY = wallpaperShelfPose ? 0.12 : layout.sideRotY;
        var safeEntryRotY = wallpaperShelfPose ? 0.05 : 0.16;
        card.mesh.rotation.y = (safeShelfPose ? safeRotY : layout.sideRotY) + (1 - reveal) * safeEntryRotY + parX * (safeShelfPose ? 0.014 : 0.038) * parWeight;
        var safeRotX = wallpaperShelfPose ? 0.020 : layout.sideRotX;
        card.mesh.rotation.x = -delta * (safeShelfPose ? safeRotX : layout.sideRotX) - parY * (safeShelfPose ? 0.010 : 0.024) * parWeight;
      }
      card.mesh.scale.setScalar(scale);
      var disabledByDetail = detailOpenSide;
      var opacity = absD < 0.5 ? 1.0 : Math.max(0.22, 1.0 - absD * 0.30);
      if (disabledByDetail) {
        opacity *= card.index === openCardIdx ? 0.16 : 0.08;
        card.mesh.material.color.setScalar(card.index === openCardIdx ? 0.42 : 0.25);
      } else {
        if (passiveAlways) opacity *= 0.92 + lift * 0.08;
        card.mesh.material.color.setScalar(passiveAlways ? (0.96 + lift * 0.04) : 1);
      }
      // v8: 自动隐藏 — shelf 不在 focus 区时整体淡化
      card.mesh.material.opacity = Math.min(1, opacity * (shelfVisibility != null ? shelfVisibility : 1) * reveal * (1 - paneEase * 0.24) + pulse * 0.10 * reveal + breathPulse * 0.035) * shelfLook.opacity;
      setCardCenter(card, absD < 0.5);
    } else {
      // 舞台 PSP: 水平展开 + center 突出, dock 在底部
      var pxStage = (layout.stageX || 0) + delta * layout.stageXStep;
      var pyStage = layout.stageY;
      var pzStage = absD < 0.5 ? layout.stageZ : (layout.stageZ - Math.min(2.0, absD) * 0.55);
      var paneRawS = Math.max(0, Math.min(1, (uniforms.uTime.value - paneSwitchAt - absD * 0.030) / 0.72));
      var paneEaseS = 1 - paneRawS * paneRawS * (3 - 2 * paneRawS);
      pxStage += paneEaseS * paneSwitchDir * 0.80;
      pzStage -= paneEaseS * 0.28;
      pxStage += parX * 0.110 * parWeight;
      pyStage += parY * 0.060 * parWeight;
      pzStage += (parY * 0.040 - parX * 0.035) * parWeight;
      var scaleS = (absD < 0.5 ? 1.20 : Math.max(0.45, 1.0 - absD * 0.22)) * (1 + pulse * 0.060) * layout.stageScale;
      card.mesh.position.set(pxStage, pyStage, pzStage);
      card.mesh.rotation.y = -delta * 0.22 + parX * 0.050 * parWeight;
      card.mesh.rotation.x = 0.10 - absD * 0.04 - parY * 0.028 * parWeight;
      card.mesh.scale.setScalar(scaleS);
      var disabledStage = contentList && contentList.isOpen();
      var opS = absD < 0.5 ? 1.0 : Math.max(0.18, 1.0 - absD * 0.32);
      if (disabledStage) {
        opS *= card.index === openCardIdx ? 0.16 : 0.08;
        card.mesh.material.color.setScalar(card.index === openCardIdx ? 0.42 : 0.25);
      } else {
        card.mesh.material.color.setScalar(1);
      }
      card.mesh.material.opacity = Math.min(1, opS * (shelfVisibility != null ? shelfVisibility : 1) * (1 - paneEaseS * 0.24) + pulse * 0.10) * shelfLook.opacity;
      setCardCenter(card, absD < 0.5);
    }
  }

  function setCardCenter(card, isCenter) {
    if (card.isCenter !== isCenter) {
      card.isCenter = isCenter;
      drawCard(card, card.item);
    } else {
      card.isCenter = isCenter;
    }
  }

  function playPlaylistCard(card) {
    if (!card || !card.mesh || !card.mesh.userData) return false;
    var action = card.mesh.userData.action;
    if (!action || action.kind !== 'loadPlaylist' || !action.playlistId) return false;
    if (String(action.playlistId).indexOf('podcast:') === 0) return false;
    pulseCard(card, 1.05);
    if (contentList && contentList.isOpen && contentList.isOpen()) contentList.close();
    openCardIdx = -1;
    setShelfPinnedOpen(false, true);
    if (typeof setFocusZone === 'function') setFocusZone(null, true);
    loadPlaylistIntoQueueById(action.playlistId, true, action.title || (card.item && card.item.title) || '');
    return true;
  }

  function pulseCard(card, amount) {
    if (!card) return;
    pulseObjectValue(card, 'fxPulse', amount || 1, 0.46);
  }

  function createStageExtras() {
    if (!group) return;
    var pcount = 80;
    var pgeo = new THREE.BufferGeometry();
    var ppos = new Float32Array(pcount * 3);
    var pcol = new Float32Array(pcount * 3);
    var prnd = new Float32Array(pcount);
    for (var i = 0; i < pcount; i++) {
      ppos[i*3] = (Math.random() - 0.5) * 6;
      ppos[i*3+1] = (Math.random() - 0.5) * 1.2 + 0.3;
      ppos[i*3+2] = 1.0 + Math.random() * 1.5;
      pcol[i*3] = 0.56; pcol[i*3+1] = 0.91; pcol[i*3+2] = 1.0;
      prnd[i] = Math.random();
    }
    pgeo.setAttribute('position', new THREE.BufferAttribute(ppos, 3));
    pgeo.setAttribute('aColor',   new THREE.BufferAttribute(pcol, 3));
    pgeo.setAttribute('aRand',    new THREE.BufferAttribute(prnd, 1));
    var pmat = new THREE.ShaderMaterial({
      uniforms:{ uTime: uniforms.uTime, uPixel: uniforms.uPixel, uDotTex: uniforms.uDotTex },
      vertexShader:`precision highp float; uniform float uTime, uPixel; attribute vec3 aColor; attribute float aRand;
varying vec3 vC; varying float vA;
void main(){
  vec3 p = position;
  p.x += sin(uTime * 0.4 + aRand * 6.0) * 1.5;
  p.y += sin(uTime * 0.6 + aRand * 4.0) * 0.2;
  p.z += cos(uTime * 0.5 + aRand * 5.0) * 0.4;
  vC = aColor; vA = 0.4 + 0.4 * sin(uTime * 1.5 + aRand * 7.0);
  vec4 m = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = 4.0 * uPixel;
  gl_Position = projectionMatrix * m;
}`,
      fragmentShader:`precision highp float; uniform sampler2D uDotTex;
varying vec3 vC; varying float vA;
void main(){ vec4 t = texture2D(uDotTex, gl_PointCoord); if (t.a < 0.02) discard; gl_FragColor = vec4(vC, t.a * vA); }`,
      transparent:true, depthWrite:false, blending: THREE.AdditiveBlending,
    });
    connectorParticles = new THREE.Points(pgeo, pmat);
    connectorParticles.frustumCulled = false;
    connectorParticles.renderOrder = 49;
    connectorParticles.position.set(0, -2.2, 0);
    if (group.parent) group.parent.add(connectorParticles); else scene.add(connectorParticles);
    // 底部地面反射
    var mGeo = new THREE.PlaneGeometry(10, 1.8);
    var mCanvas = document.createElement('canvas'); mCanvas.width = 256; mCanvas.height = 64;
    var mctx = mCanvas.getContext('2d');
    var mg = mctx.createLinearGradient(0, 0, 0, 64);
    mg.addColorStop(0, 'rgba(255,255,255,0.07)'); mg.addColorStop(1, 'rgba(255,255,255,0)');
    mctx.fillStyle = mg; mctx.fillRect(0, 0, 256, 64);
    var mTex = new THREE.CanvasTexture(mCanvas);
    mTex.generateMipmaps = false;
    var mMat = new THREE.MeshBasicMaterial({ map: mTex, transparent:true, depthWrite:false, opacity:0.55 });
    floorMirror = new THREE.Mesh(mGeo, mMat);
    floorMirror.position.set(0, -2.85, 0.4);
    floorMirror.rotation.x = -Math.PI / 2;
    if (group.parent) group.parent.add(floorMirror); else scene.add(floorMirror);
  }

  function sig(items) {
    if (hasAnyPlatformLogin() && (userPlaylists.length || myPodcastCollections.length)) {
      var source = activePlaylists();
      items = items || currentItems();
      var sampleItems = items.slice(0, 3).concat(items.slice(Math.max(3, items.length - 3)));
      return [
        'platform',
        shelfPane,
        shelfMergesCollections() ? 1 : 0,
        shelfShowsPodcasts() ? 1 : 0,
        source.length,
        myPodcastCollections.length,
        sampleItems.map(function(it){
          return [it.type || '', it.playlistId || '', it.podcastKey || '', it.title || '', it.sub || '', it.tag || ''].join('|');
        }).join('||')
      ].join('::');
    }
    items = items || playQueue.map(function(song, idx){
      return { type:'queue', title: song.name, queueIndex: idx };
    });
    var sample = items.slice(0, 3).concat(items.slice(Math.max(3, items.length - 3)));
    return ['queue', items.length, currentIdx, sample.map(function(it){ return [it.type, it.playlistId||'', it.queueIndex||'', it.title||''].join('|'); }).join('||')].join('::');
  }

  function switchPane(nextPane) {
    if (shelfMergesCollections()) return false;
    if (nextPane === shelfPane) return false;
    paneMemory[shelfPane] = Math.max(0, Math.round(centerTarget));
    shelfPane = nextPane;
    collectionReveal = 0;
    var targetList = activePlaylists();
    var remembered = paneMemory[nextPane] || 0;
    centerTarget = Math.max(0, Math.min(Math.max(0, targetList.length - 1), remembered));
    centerSmooth = centerTarget + (nextPane === 'fav' ? 1.85 : -1.85);
    centerIdx = centerTarget;
    paneSwitchAt = uniforms.uTime.value;
    paneSwitchDir = nextPane === 'fav' ? 1 : -1;
    shelfOpenAnimAt = uniforms.uTime.value;
    if (contentList) contentList.close();
    selectedIdx = Math.round(centerTarget);
    playShelfSelectTick(paneSwitchDir, 'card');
    rebuild();
    showToast(nextPane === 'fav' ? '收藏歌单' : '我的歌单');
    return true;
  }

  function applySelectedIndex(idx) {
    idx = idx == null || idx < 0 ? -1 : Math.round(idx);
    selectedIdx = idx;
    cards.forEach(function(c) {
      var next = c.index === selectedIdx;
      if (c.selected !== next) {
        c.selected = next;
        drawCard(c, c.item);
      }
    });
  }

  function step(direction) {
    if (!allItems.length) return;
    var panes = splitPlaylists();
    var atEnd = centerTarget >= allItems.length - 1 && direction > 0;
    var atStart = centerTarget <= 0 && direction < 0;
    if (!shelfMergesCollections()) {
      if (hasAnyPlatformLogin() && userPlaylists.length && shelfPane === 'mine' && atEnd && panes.fav.length) {
        collectionReveal += Math.min(1.5, Math.abs(direction));
        if (collectionReveal >= 3) switchPane('fav');
        return;
      }
      if (hasAnyPlatformLogin() && userPlaylists.length && shelfPane === 'fav' && atStart && panes.mine.length) {
        collectionReveal += Math.min(1.5, Math.abs(direction));
        if (collectionReveal >= 3) switchPane('mine');
        return;
      }
    }
    collectionReveal = 0;
    var prevTarget = Math.round(centerTarget);
    centerTarget = Math.max(0, Math.min(allItems.length - 1, centerTarget + direction));
    var nextTarget = Math.round(centerTarget);
    paneMemory[shelfPane] = Math.max(0, Math.round(centerTarget));
    syncRenderedWindow(false);
    applySelectedIndex(nextTarget);
    if (nextTarget !== prevTarget) playShelfSelectTick(direction, 'card');
    pulseCard(cards.find(function(c){ return c.index === nextTarget; }), 0.55);
  }

  function screenHitCard(card, sx, sy, pad) {
    if (!card || !card.mesh || !card.mesh.visible || !group || !group.visible) return null;
    var params = card.mesh.geometry && card.mesh.geometry.parameters || {};
    var hw = (params.width || 1.7) / 2;
    var hh = (params.height || 0.85) / 2;
    var pts = [
      new THREE.Vector3(-hw, -hh, 0),
      new THREE.Vector3( hw, -hh, 0),
      new THREE.Vector3( hw,  hh, 0),
      new THREE.Vector3(-hw,  hh, 0),
    ];
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    card.mesh.updateMatrixWorld(true);
    for (var i = 0; i < pts.length; i++) {
      pts[i].applyMatrix4(card.mesh.matrixWorld).project(camera);
      var x = (pts[i].x + 1) * innerWidth / 2;
      var y = (1 - pts[i].y) * innerHeight / 2;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    pad = pad == null ? 28 : pad;
    if (sx < minX - pad || sx > maxX + pad || sy < minY - pad || sy > maxY + pad) return null;
    var u = clampRange((sx - minX) / Math.max(1, maxX - minX), 0, 1);
    var v = 1 - clampRange((sy - minY) / Math.max(1, maxY - minY), 0, 1);
    return { x: u, y: v };
  }

  function pickCardAtScreen(sx, sy, pad) {
    if (!cards.length || !group || !group.visible) return null;
    var ordered = cards.slice().sort(function(a, b){ return (b.mesh.renderOrder || 0) - (a.mesh.renderOrder || 0); });
    for (var i = 0; i < ordered.length; i++) {
      var uv = screenHitCard(ordered[i], sx, sy, pad == null ? 72 : pad);
      if (uv) return { card: ordered[i], uv: uv, screenPick: true };
    }
    return null;
  }

  return {
    setMode: function(m) {
      if (m === mode && group) return;
      mode = m;
      if (m === 'off') {
        if (group) { scene.remove(group); cards.forEach(function(c){ c.texture.dispose(); c.mesh.material.dispose(); c.mesh.geometry.dispose(); }); }
        if (connectorParticles) { scene.remove(connectorParticles); connectorParticles.geometry.dispose(); connectorParticles.material.dispose(); connectorParticles = null; }
        if (floorMirror) { scene.remove(floorMirror); floorMirror.geometry.dispose(); floorMirror.material.dispose(); floorMirror = null; }
        group = null; cards = [];
        if (contentList) contentList.close();
        return;
      }
      if (!group) {
        group = new THREE.Group();
        group.renderOrder = 50;
        scene.add(group);
      }
      var asyncCards = mode === 'side' && document.body.classList.contains('splash-active');
      rebuild(asyncCards);
    },
    getMode: function(){ return mode; },
    update: function(dt) {
      if (!group) return;
      // PSP 滚动平滑
      centerSmooth += (centerTarget - centerSmooth) * 0.16;
      if (Math.abs(centerSmooth - centerTarget) < 0.001) centerSmooth = centerTarget;
      var px = pointerParallax.x, py = pointerParallax.y;
      var appRevealed = !document.body.classList.contains('splash-active');
      var cueVis = tickShelfHoverCue(dt);
      // v8: shelf 自动可见度 — 启动页期间不显示；侧栏只在右侧停留时淡入。
      var targetVis;
      if (!appRevealed) {
        targetVis = 0;
      } else if (mode === 'side') {
        var contentOpen = contentList && contentList.isOpen();
        if (!allItems.length && !contentOpen) targetVis = 0;
        else targetVis = (contentOpen || shelfPinnedOpen || shelfAlwaysVisible()) ? 1.0 : (cueVis > 0.01 ? Math.max(0.16, cueVis * 0.88) : 0);
      } else {
        targetVis = allItems.length ? 1.0 : 0;
      }
      shelfVisibility += (targetVis - shelfVisibility) * (targetVis > shelfVisibility ? 0.22 : 0.18);
      if (shelfVisibility < 0.01 && targetVis === 0) shelfVisibility = 0;
      group.visible = appRevealed && (mode !== 'side' || shelfVisibility > 0) && (allItems.length > 0 || (contentList && contentList.isOpen()));
      if (connectorParticles) connectorParticles.visible = group.visible && mode === 'stage';
      if (floorMirror) floorMirror.visible = group.visible && mode === 'stage';
      if (mode === 'side') {
        var passiveAlwaysGroup = shelfAlwaysVisible() && !shelfPinnedOpen && !(contentList && contentList.isOpen());
        var liftedCardActive = passiveAlwaysGroup && cards.some(function(c){ return c.selected || (c.floatMix || 0) > 0.025; });
        group.renderOrder = passiveAlwaysGroup && !liftedCardActive ? 30 : 50;
        group.position.set(0, 0, 0);
        var bindToCover = shelfAlwaysVisible() && particles && particles.rotation && !(contentList && contentList.isOpen());
        if (bindToCover) {
          group.rotation.x += ((particles.rotation.x - py * 0.010) - group.rotation.x) * 0.075;
          group.rotation.y += ((particles.rotation.y + px * 0.018) - group.rotation.y) * 0.075;
          group.rotation.z += (particles.rotation.z - group.rotation.z) * 0.075;
        } else {
          group.rotation.y += ((px * 0.018) - group.rotation.y) * 0.045;
          group.rotation.x += ((-py * 0.010) - group.rotation.x) * 0.045;
          group.rotation.z += (0 - group.rotation.z) * 0.045;
        }
      } else {
        group.renderOrder = 50;
        var t = uniforms.uTime.value;
        group.position.y = Math.sin(t * 0.3) * 0.04;
        group.position.x = px * 0.10;
        group.rotation.y = px * 0.025;
        group.rotation.x = -py * 0.012;
      }
      for (var i = 0; i < cards.length; i++) {
        placeCard(cards[i], i, cards.length, mode);
      }
      // 内容更新 (节流)
      if (uniforms.uTime.value - lastUpdate > 0.8) {
        lastUpdate = uniforms.uTime.value;
        var nextSig = sig();
        if (nextSig !== lastSig) rebuild();
        else {
          var pulseBucket = Math.round((bass + beatPulse * 0.85) * 10);
          var redrawInterval = playing ? 1.35 : 4.0;
          if (pulseBucket !== lastCardPulseBucket || uniforms.uTime.value - lastCardRedrawAt > redrawInterval) {
            lastCardPulseBucket = pulseBucket;
            lastCardRedrawAt = uniforms.uTime.value;
            cards.forEach(function(c){
              c.item = allItems[c.index] || c.item;
              c.isCenter = Math.abs(c.index - centerSmooth) < 0.5;
              if (c.isCenter || c.dofBucket <= 1 || c.index === currentIdx) drawCard(c, c.item);
            });
          }
        }
      }
      // 二级内容框 update
      if (contentList) contentList.update(dt);
    },
    onCoverChange: function() {
      if (group && mode !== 'off' && uniforms.uTime.value - lastUpdate > 0.2) {
        lastUpdate = uniforms.uTime.value;
        rebuild();
      }
    },
    rebuild: rebuild,
    refreshTheme: function() {
      cards.forEach(function(c) {
        c.drawKey = '';
        drawCard(c, c.item);
      });
      if (contentList && contentList.refreshTheme) contentList.refreshTheme();
    },
    raycastCards: function(raycaster) {
      if (!group || !group.visible || !cards.length) return null;
      var visibleMeshes = cards.filter(function(c){ return c.mesh.visible; }).map(function(c){ return c.mesh; });
      var hits = raycaster.intersectObjects(visibleMeshes, false);
      if (!hits.length) return null;
      var card = cards.find(function(c){ return c.mesh === hits[0].object; });
      return { card: card, point: hits[0].point, uv: hits[0].uv };
    },
    pickCardAtScreen: pickCardAtScreen,
    // PSP 步进
    next: function() { step(1); },
    prev: function() { step(-1); },
    scrollBy: function(d) { step(d); },
    getCenterIdx: function() { return Math.round(centerSmooth); },
    getCardAt: function(idx) { return cards.find(function(c){ return c.index === idx; }); },
    getCards: function() { return cards; },
    playPlaylistAt: function(idx) {
      return playPlaylistCard(cards.find(function(c){ return c.index === idx; }));
    },
    clearSelected: function() {
      applySelectedIndex(-1);
    },
    setSelected: function(idx) {
      applySelectedIndex(idx);
    },
    triggerAction: function(action) {
      if (!action) return;
      var card = cards.find(function(c) { return c.mesh.userData.action === action; });
      pulseCard(card, action.kind === 'loadPlaylist' ? 1.0 : 0.70);
      if (action.kind === 'playQueue') {
        playQueueAt(action.index);
      } else if (action.kind === 'loadPlaylist') {
        if (!contentList) contentList = makeContentListManager();
        openCardIdx = card ? card.index : -1;
        contentList.open(action.playlistId, action.title || (card && card.item.title), card);
        setShelfPinnedOpen(true, true);
        if (typeof updateEmptyHomeVisibility === 'function') updateEmptyHomeVisibility({ forceLoad: false });
        if (typeof setFocusZone === 'function') setFocusZone('shelf-detail', true);
      } else if (action.kind === 'empty') {
        togglePlaylistPanel(true);
      }
    },
    // 二级内容框 open/close
    openContent: function(cardIdx) {
      var card = cards.find(function(c){ return c.index === cardIdx; });
      if (!card) return;
      var action = card.mesh.userData.action;
      if (!action) return;
      pulseCard(card, 1.0);
      // queue 类型 → 直接播放, 不需要内容框
      if (action.kind === 'playQueue') {
        playQueueAt(action.index);
        return;
      }
      if (action.kind === 'loadPlaylist') {
        if (!contentList) contentList = makeContentListManager();
        openCardIdx = card.index;
        contentList.open(action.playlistId, action.title || card.item.title, card);
        setShelfPinnedOpen(true, true);
        if (typeof updateEmptyHomeVisibility === 'function') updateEmptyHomeVisibility({ forceLoad: false });
        if (typeof setFocusZone === 'function') setFocusZone('shelf-detail', true);
      }
      if (action.kind === 'empty') togglePlaylistPanel(true);
    },
    closeContent: function() {
      openCardIdx = -1;
      if (contentList) contentList.close();
      var hint = document.getElementById('hint');
      if (hint) hint.classList.toggle('shelf-hidden', shelfPinnedOpen);
      if (typeof setFocusZone === 'function') setFocusZone(shelfPinnedOpen ? 'shelf-side' : null, true);
      if (typeof updateEmptyHomeVisibility === 'function') updateEmptyHomeVisibility({ forceLoad: false });
    },
    hasOpenContent: function() { return contentList && contentList.isOpen(); },
    getContentList: function() { return contentList; },
    getOpenContentIndex: function() { return openCardIdx; },
    canInteract: function() { return mode !== 'off' && allItems.length > 0; }
  };
}
shelfManager = makeShelfManager();
function safeShelfRebuild(reason, asyncCards) {
  if (!shelfManager || typeof shelfManager.rebuild !== 'function') return false;
  try {
    shelfManager.rebuild(asyncCards);
    return true;
  } catch (e) {
    console.warn('[ShelfRebuild]', reason || 'unknown', e);
    return false;
  }
}
var deferredShelfRebuild = { raf: 0, reason: '', asyncCards: true, token: 0 };
function scheduleShelfRebuild(reason, asyncCards) {
  deferredShelfRebuild.reason = reason || deferredShelfRebuild.reason || 'deferred';
  deferredShelfRebuild.asyncCards = asyncCards !== false;
  deferredShelfRebuild.token += 1;
  var token = deferredShelfRebuild.token;
  if (deferredShelfRebuild.raf) cancelAnimationFrame(deferredShelfRebuild.raf);
  deferredShelfRebuild.raf = requestAnimationFrame(function(){
    deferredShelfRebuild.raf = 0;
    scheduleUiWarmTask(function(){
      if (token !== deferredShelfRebuild.token) return;
      safeShelfRebuild(deferredShelfRebuild.reason, deferredShelfRebuild.asyncCards);
    }, 260);
  });
}
function safeShelfCloseContent(reason) {
  if (!shelfManager || typeof shelfManager.closeContent !== 'function') return false;
  try {
    shelfManager.closeContent();
    return true;
  } catch (e) {
    console.warn('[ShelfCloseContent]', reason || 'unknown', e);
    return false;
  }
}
function isPlaylistPanelVisibleForRender() {
  var panel = document.getElementById('playlist-panel');
  var panelOpen = panel && (panel.classList.contains('show') || panel.classList.contains('peek') || panel.classList.contains('pinned'));
  return !!(panelOpen || miniQueueOpen);
}
function safeRenderQueuePanel(reason, opts) {
  opts = opts || {};
  if (!isPlaylistPanelVisibleForRender() && opts.deferWhenHidden !== false) {
    queuePanelDirty = true;
    return true;
  }
  try {
    renderQueuePanel(opts);
    queuePanelDirty = false;
    return true;
  } catch (e) {
    console.warn('[QueuePanelRender]', reason || 'unknown', e);
    return false;
  }
}
function flushDeferredQueuePanel(reason) {
  if (!queuePanelDirty) return;
  safeRenderQueuePanel(reason || 'flush-deferred-queue', { animate: false, scrollCurrent: miniQueueOpen, deferWhenHidden: false });
}
function safeSwitchPlaylistTab(tab, reason) {
  try {
    switchPlaylistTab(tab);
    return true;
  } catch (e) {
    console.warn('[PlaylistTabSwitch]', reason || tab || 'unknown', e);
    return false;
  }
}
window.addEventListener('blur', clearShelfPreviewOnPointerExit);
document.addEventListener('mouseleave', clearShelfPreviewOnPointerExit);
document.addEventListener('mouseout', function(e) {
  if (!e.relatedTarget && !e.toElement) clearShelfPreviewOnPointerExit();
});

// ============================================================
//  二级内容框 (歌单内的歌曲列表) — 同样 PSP 风格滚动
// ============================================================
function makeContentListManager() {
  var group = null;
  var rows = [];           // 每行一张卡 (歌曲)
  var panel = null;
  var allTracks = [];
  var renderedStart = -1;
  var CONTENT_VISIBLE_RADIUS = 5;
  var CONTENT_MAX_RENDER = CONTENT_VISIBLE_RADIUS * 2 + 1;
  var open = false;
  var centerTarget = 0, centerSmooth = 0;
  var playlistTitle = '';
  var contentKind = 'playlist';
  var sourceCard = null;
  var requestToken = 0;
  var openAnimAt = -10;
  var rowAnimAt = -10;
  var panelDirty = true, rowsDirty = true;
  var panelDrawAt = -10, rowDrawAt = -10;
  var LOADING_ANIM_INTERVAL = 1 / 30;
  var DETAIL_BASE = { x: 1.28, y: 0.18, z: 1.36, rx: -0.008, ry: 0.020 };
  function detailLayout() {
    return shelfLayoutProfile().detail || DETAIL_BASE;
  }

  function makeRoundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  }
  function ellipsize(ctx, text, maxWidth) {
    text = String(text || '');
    if (ctx.measureText(text).width <= maxWidth) return text;
    var out = text;
    while (out.length > 1 && ctx.measureText(out + '...').width > maxWidth) out = out.slice(0, -1);
    return out + '...';
  }
  function canvasAccent(alpha, fallback) {
    return shelfAccentRgba(alpha, fallback);
  }

  function ensurePanel() {
    if (panel || !group) return;
    var cv = document.createElement('canvas');
    cv.width = 900; cv.height = 1024;
    var tx = new THREE.CanvasTexture(cv);
    tx.minFilter = THREE.LinearFilter; tx.magFilter = THREE.LinearFilter;
    tx.generateMipmaps = false;
    var mat = new THREE.MeshBasicMaterial({ map:tx, transparent:true, opacity:0.86, depthWrite:false, depthTest:false, side:THREE.DoubleSide });
    var geo = new THREE.PlaneGeometry(2.62, 3.02, 1, 1);
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(-0.02, 0.0, 0.20);
    mesh.renderOrder = 232;
    group.add(mesh);
    panel = { canvas:cv, texture:tx, mesh:mesh };
  }

  function drawPanel() {
    ensurePanel();
    if (!panel) return;
    var ctx = panel.canvas.getContext('2d');
    var W = panel.canvas.width, H = panel.canvas.height;
    ctx.clearRect(0, 0, W, H);
    makeRoundRect(ctx, 24, 28, W - 48, H - 56, 34);
    var bg = ctx.createLinearGradient(0, 0, W, H);
    var panelBgAlpha = shelfSettings().bgOpacity;
    bg.addColorStop(0, 'rgba(0,0,0,' + Math.min(0.98, panelBgAlpha + 0.02).toFixed(3) + ')');
    bg.addColorStop(0.42, 'rgba(0,0,0,' + panelBgAlpha.toFixed(3) + ')');
    bg.addColorStop(1, 'rgba(0,0,0,' + Math.max(0.20, panelBgAlpha - 0.04).toFixed(3) + ')');
    ctx.fillStyle = bg; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.font = '800 38px Inter, "Microsoft YaHei", Arial';
    ctx.fillStyle = 'rgba(255,246,220,0.94)';
    ctx.fillText(ellipsize(ctx, playlistTitle || '歌单详情', W - 310), 72, 92);
    ctx.font = '500 18px Inter, "Microsoft YaHei", Arial';
    ctx.fillStyle = canvasAccent(0.62);
    var playableCount = allTracks.filter(function(song){ return song && song.id && song.type !== 'podcast-radio'; }).length;
    var contentCount = allTracks.filter(function(song){ return song && song.id; }).length;
    var isLoading = allTracks.length === 1 && isLoadingLabel(allTracks[0] && allTracks[0].name);
    var countLabel = contentKind === 'podcast'
      ? (contentCount ? (contentCount + ' 项播客内容') : (isLoading ? '正在载入' : '暂无播客内容'))
      : (playableCount ? (playableCount + ' 首歌曲') : (isLoading ? '正在载入' : '暂无可播放歌曲'));
    ctx.fillText(countLabel, 74, 128);
    var coverUrl = sourceCard && sourceCard.item && sourceCard.item.cover;
    var coverSize = 96, coverX = W - 172, coverY = 56;
    makeRoundRect(ctx, coverX, coverY, coverSize, coverSize, 22);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();
    if (coverUrl) {
      var coverRec = playlistCoverCache[coverUrl];
      if (coverRec && coverRec.loaded && coverRec.img) {
        ctx.save();
        makeRoundRect(ctx, coverX, coverY, coverSize, coverSize, 22);
        ctx.clip();
        ctx.drawImage(coverRec.img, coverX, coverY, coverSize, coverSize);
        ctx.restore();
      } else if (!coverRec || (!coverRec.loading && !coverRec.failed)) {
        requestPlaylistCover(coverUrl, function(){ drawPanel(); });
      }
    }
    var sweep = (Math.sin((uniforms.uTime.value || 0) * 1.7) + 1) * 0.5;
    var shine = ctx.createLinearGradient(70, 154, W - 80, 154);
    shine.addColorStop(0, canvasAccent(0));
    shine.addColorStop(Math.max(0.01, sweep * 0.72), canvasAccent(0.14));
    shine.addColorStop(Math.min(0.99, sweep * 0.72 + 0.14), canvasAccent(0.56));
    shine.addColorStop(1, canvasAccent(0));
    ctx.fillStyle = shine;
    ctx.fillRect(72, 154, W - 144, 2);
    panel.texture.needsUpdate = true;
  }

  function disposePanelObject(targetPanel) {
    if (!targetPanel) return;
    if (targetPanel.mesh && targetPanel.mesh.parent) targetPanel.mesh.parent.remove(targetPanel.mesh);
    if (targetPanel.texture) targetPanel.texture.dispose();
    if (targetPanel.mesh && targetPanel.mesh.material) targetPanel.mesh.material.dispose();
    if (targetPanel.mesh && targetPanel.mesh.geometry) targetPanel.mesh.geometry.dispose();
  }

  function disposePanel() {
    disposePanelObject(panel);
    panel = null;
  }

  function isLoadingLabel(text) {
    return /加载中|正在载入/.test(String(text || ''));
  }

  function isLoadingContent() {
    return allTracks.length === 1 && isLoadingLabel(allTracks[0] && allTracks[0].name);
  }

  function drawPanelIfNeeded(force, nowT) {
    nowT = nowT == null ? (uniforms.uTime.value || 0) : nowT;
    if (!force && !panelDirty && (!isLoadingContent() || nowT - panelDrawAt < LOADING_ANIM_INTERVAL)) return;
    drawPanel();
    panelDirty = false;
    panelDrawAt = nowT;
  }

  function drawRow(row, song, isCenter) {
    var cv = row.canvas, ctx = cv.getContext('2d');
    var W = cv.width, H = cv.height;
    var isPodcastRadio = !!(song && song.type === 'podcast-radio');
    var playable = !!(song && song.id && !isPodcastRadio);
    var actionReady = playable || isPodcastRadio;
    ctx.clearRect(0, 0, W, H);
    makeRoundRect(ctx, 14, 10, W - 28, H - 20, 22);
    var rowGrad = ctx.createLinearGradient(0, 0, W, H);
    var rowBgAlpha = shelfSettings().bgOpacity;
    var centerRowBgAlpha = isCenter ? Math.max(rowBgAlpha, 0.92) : rowBgAlpha;
    if (isCenter) {
      rowGrad.addColorStop(0, 'rgba(8,14,24,' + Math.min(0.985, centerRowBgAlpha + 0.040).toFixed(3) + ')');
      rowGrad.addColorStop(0.48, 'rgba(0,0,0,' + Math.min(0.985, centerRowBgAlpha + 0.030).toFixed(3) + ')');
      rowGrad.addColorStop(1, 'rgba(0,0,0,' + Math.min(0.98, centerRowBgAlpha + 0.015).toFixed(3) + ')');
    } else {
      rowGrad.addColorStop(0, 'rgba(16,16,20,' + Math.max(0.20, rowBgAlpha - 0.02).toFixed(3) + ')');
      rowGrad.addColorStop(1, 'rgba(0,0,0,' + Math.max(0.20, rowBgAlpha - 0.04).toFixed(3) + ')');
    }
    if (isCenter) {
      ctx.shadowColor = canvasAccent(0.20);
      ctx.shadowBlur = 18;
    }
    ctx.fillStyle = rowGrad;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = isCenter ? canvasAccent(0.48) : 'rgba(255,255,255,0.10)';
    ctx.lineWidth = isCenter ? 1.6 : 1;
    ctx.stroke();
    ctx.font = '700 18px Inter, Arial';
    ctx.fillStyle = isCenter ? canvasAccent(0.95) : 'rgba(255,255,255,0.34)';
    var n = String(row.index + 1);
    if (n.length < 2) n = '0' + n;
    ctx.fillText(n, 32, 52);
    var coverSize = 54;
    var coverX = 84;
    var coverY = H/2 - coverSize/2;
    var songCover = songCoverSrc(song, 80);
    var hasSongCover = !!songCover;
    if (actionReady || hasSongCover) {
      makeRoundRect(ctx, coverX, coverY, coverSize, coverSize, 13);
      ctx.fillStyle = isCenter ? canvasAccent(0.12) : 'rgba(255,255,255,0.07)';
      ctx.fill();
      if (hasSongCover) {
        var songCoverRec = playlistCoverCache[songCover];
        if (songCoverRec && songCoverRec.loaded && songCoverRec.img) {
          ctx.save();
          makeRoundRect(ctx, coverX, coverY, coverSize, coverSize, 13);
          ctx.clip();
          ctx.drawImage(songCoverRec.img, coverX, coverY, coverSize, coverSize);
          ctx.restore();
        } else if (!songCoverRec || (!songCoverRec.loading && !songCoverRec.failed)) {
          requestPlaylistCover(songCover, function(){
            if (row && row.mesh && row.mesh.parent) drawRow(row, row.song, !!row.lastCenter);
          });
        }
      }
    }
    // 标题
    var textX = (actionReady || hasSongCover) ? 154 : 82;
    var btnW = 104, btnH = 48, btnX = W - 144, btnY = H/2 - btnH/2;
    var miniBtn = 44, likeX = btnX - 156, collectX = btnX - 104, nextX = btnX - 52;
    var textMax = actionReady && isCenter ? (isPodcastRadio ? btnX - textX - 24 : likeX - textX - 24) : W - textX - 42;
    var loadingRow = !playable && isLoadingLabel(song && song.name);
    if (loadingRow) {
      ctx.font = '700 22px Inter, "Microsoft YaHei", Arial';
      ctx.fillStyle = 'rgba(255,247,224,0.88)';
      ctx.fillText('正在载入歌单', textX, 42);
      var phase = ((uniforms.uTime.value || 0) * 0.85) % 1;
      for (var sk = 0; sk < 3; sk++) {
        var barY = 58 + sk * 13;
        var barW = sk === 0 ? 330 : (sk === 1 ? 250 : 180);
        makeRoundRect(ctx, textX, barY, barW, 7, 4);
        var skGrad = ctx.createLinearGradient(textX, barY, textX + barW, barY);
        var hot = (phase + sk * 0.14) % 1;
        skGrad.addColorStop(0, 'rgba(255,255,255,0.08)');
        skGrad.addColorStop(Math.max(0, hot - 0.18), canvasAccent(0.10));
        skGrad.addColorStop(Math.min(0.99, hot), canvasAccent(0.34));
        skGrad.addColorStop(1, 'rgba(255,255,255,0.08)');
        ctx.fillStyle = skGrad; ctx.fill();
      }
      row.texture.needsUpdate = true;
      return;
    }
    ctx.font = isCenter ? '800 24px Inter, "Microsoft YaHei", Arial' : '600 20px Inter, "Microsoft YaHei", Arial';
    ctx.fillStyle = isCenter ? 'rgba(255,247,224,0.96)' : 'rgba(255,255,255,0.80)';
    ctx.fillText(ellipsize(ctx, song.name || '', textMax), textX, 44);
    ctx.font = '500 15px Inter, "Microsoft YaHei", Arial';
    ctx.fillStyle = isCenter ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.64)';
    ctx.fillText(ellipsize(ctx, song.artist || '', textMax), textX, 72);
    // center 行右侧显示红心/收藏/播放按钮
    if (isCenter && actionReady) {
      if (!isPodcastRadio) {
      var liked = isSongLiked(song);
      makeRoundRect(ctx, likeX, btnY + 2, miniBtn, btnH - 4, 15);
      ctx.fillStyle = liked ? 'rgba(255,122,144,0.18)' : 'rgba(255,255,255,0.075)';
      ctx.fill();
      ctx.strokeStyle = liked ? 'rgba(255,122,144,0.52)' : 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 1.1;
      ctx.stroke();
      drawCanvasHeart(ctx, likeX + miniBtn / 2, btnY + 26, 20, liked ? '#ff7a90' : 'rgba(255,255,255,0.76)');

      makeRoundRect(ctx, collectX, btnY + 2, miniBtn, btnH - 4, 15);
      var collectGrad = ctx.createLinearGradient(collectX, btnY + 2, collectX + miniBtn, btnY + btnH);
      collectGrad.addColorStop(0, 'rgba(255,255,255,0.080)');
      collectGrad.addColorStop(1, canvasAccent(0.075));
      ctx.fillStyle = collectGrad;
      ctx.fill();
      ctx.strokeStyle = canvasAccent(0.22);
      ctx.lineWidth = 1.1;
      ctx.stroke();
      var collectCx = collectX + miniBtn / 2;
      var collectCy = btnY + btnH / 2;
      ctx.strokeStyle = canvasAccent(0.72);
      ctx.lineWidth = 2.35;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(collectCx - 11, collectCy + 1);
      ctx.lineTo(collectCx - 11, collectCy + 12);
      ctx.lineTo(collectCx + 11, collectCy + 12);
      ctx.lineTo(collectCx + 11, collectCy + 1);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(collectCx, collectCy - 9);
      ctx.lineTo(collectCx, collectCy + 5);
      ctx.moveTo(collectCx - 7, collectCy - 2);
      ctx.lineTo(collectCx + 7, collectCy - 2);
      ctx.stroke();

      makeRoundRect(ctx, nextX, btnY + 2, miniBtn, btnH - 4, 15);
      var nextGrad = ctx.createLinearGradient(nextX, btnY + 2, nextX + miniBtn, btnY + btnH);
      nextGrad.addColorStop(0, 'rgba(255,255,255,0.082)');
      nextGrad.addColorStop(0.62, 'rgba(255,255,255,0.045)');
      nextGrad.addColorStop(1, canvasAccent(0.055));
      ctx.fillStyle = nextGrad;
      ctx.fill();
      ctx.strokeStyle = canvasAccent(0.24);
      ctx.lineWidth = 1.1;
      ctx.stroke();
      var nextCx = nextX + miniBtn / 2;
      var nextCy = btnY + btnH / 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.90)';
      ctx.lineWidth = 2.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(nextCx, nextCy - 8);
      ctx.lineTo(nextCx, nextCy + 8);
      ctx.moveTo(nextCx - 8, nextCy);
      ctx.lineTo(nextCx + 8, nextCy);
      ctx.stroke();
      }

      makeRoundRect(ctx, btnX, btnY, btnW, btnH, 18);
      var btnGrad = ctx.createLinearGradient(btnX, btnY, btnX + btnW, btnY + btnH);
      btnGrad.addColorStop(0, 'rgba(255,255,255,0.88)');
      btnGrad.addColorStop(0.56, canvasAccent(0.94));
      btnGrad.addColorStop(1, canvasAccent(0.58));
      ctx.fillStyle = btnGrad; ctx.fill();
      ctx.strokeStyle = canvasAccent(0.42);
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.font = '700 15px Inter, Arial';
      ctx.fillStyle = readableInkForHex(shelfAccentHex());
      ctx.fillText('播放', btnX + 36, btnY + 29);
    }
    row.texture.needsUpdate = true;
  }

  function place(row, i) {
    var delta = row.index - centerSmooth;
    var absD = Math.abs(delta);
    if (absD > CONTENT_VISIBLE_RADIUS + 0.5) { row.mesh.visible = false; return; }
    row.mesh.visible = true;
    row.mesh.renderOrder = 240 + Math.round((CONTENT_VISIBLE_RADIUS + 1 - Math.min(absD, CONTENT_VISIBLE_RADIUS + 1)) * 14);
    var nowT = uniforms.uTime.value;
    var revealRaw = Math.max(0, Math.min(1, (nowT - rowAnimAt - absD * 0.040) / 0.72));
    var reveal = revealRaw * revealRaw * (3 - 2 * revealRaw);
    var parX = pointerParallax.x || 0;
    var parY = pointerParallax.y || 0;
    var parWeight = Math.max(0, 1 - absD * 0.12);
    var pulse = row.fxPulse || 0;
    var settle = group && group.userData ? (group.userData.rowSettle || 0) : 0;
    var layout = detailLayout();
    var shelfLook = shelfSettings();
    var skullDetail = shouldUseSkullSafeShelfCamera();
    var rowBaseX = skullDetail ? 0.22 : -0.04;
    var rowSpreadX = skullDetail ? 0.030 : 0.014;
    var rowIntroX = skullDetail ? 0.58 : 0.38;
    var rowCenterZ = skullDetail ? 0.62 : 0.62;
    var rowBackZ = skullDetail ? 0.58 : 0.58;
    var rowDepthStep = skullDetail ? 0.046 : 0.048;
    var px = rowBaseX + absD * rowSpreadX + (1 - reveal) * (rowIntroX + absD * rowSpreadX);
    var py = -delta * layout.rowStep + (1 - reveal) * (0.20 + (delta < 0 ? -0.10 : 0.10));
    var pz = (absD < 0.5 ? rowCenterZ : (rowBackZ - absD * rowDepthStep)) - (1 - reveal) * (skullDetail ? 0.10 : 0.16);
    px += settle * ((skullDetail ? 0.11 : 0.12) + absD * (skullDetail ? 0.010 : 0.012));
    py += settle * (delta < 0 ? -0.08 : 0.08);
    pz -= settle * (skullDetail ? 0.045 : 0.08);
    px += parX * (skullDetail ? 0.022 : 0.026) * parWeight;
    py += parY * (skullDetail ? 0.024 : 0.036) * parWeight;
    pz += (parY * (skullDetail ? 0.014 : 0.024) - parX * (skullDetail ? 0.010 : 0.020)) * parWeight;
    var scale = (absD < 0.5 ? 1.00 : Math.max(0.66, 0.94 - absD * 0.070)) * (0.90 + reveal * 0.10) * (1 + pulse * 0.052) * (1 - settle * 0.025) * layout.rowScale;
    row.mesh.position.set(px, py, pz);
    row.mesh.scale.setScalar(scale);
    var rowOpacityBase = Math.min(1, (absD < 0.5 ? 1.0 : Math.max(0.34, 1.0 - absD * 0.12)) * reveal + pulse * 0.14);
    var rowOpacityScale = absD < 0.5 ? Math.max(0.94, shelfLook.opacity) : shelfLook.opacity;
    row.mesh.material.opacity = Math.min(1, rowOpacityBase * rowOpacityScale);
    row.mesh.rotation.y = (skullDetail ? -0.070 : 0.10) + (1 - reveal) * (skullDetail ? 0.018 : 0.052) + parX * (skullDetail ? 0.010 : 0.018) * parWeight;
    row.mesh.rotation.x = (skullDetail ? 0.010 : 0) - delta * (skullDetail ? 0.010 : 0.022) - parY * (skullDetail ? 0.006 : 0.014) * parWeight;
  }

  function disposeRowList(rowList) {
    while (rowList.length) {
      var row = rowList.pop();
      if (row.mesh && row.mesh.parent) row.mesh.parent.remove(row.mesh);
      if (row.mesh && row.mesh.material) {
        if (row.mesh.material.map) row.mesh.material.map.dispose();
        row.mesh.material.dispose();
      }
      if (row.mesh && row.mesh.geometry) row.mesh.geometry.dispose();
    }
  }

  function disposeRows() {
    disposeRowList(rows);
    renderedStart = -1;
  }

  function disposeCapturedDetail(targetGroup, targetRows, targetPanel) {
    if (targetGroup && targetGroup.parent) targetGroup.parent.remove(targetGroup);
    disposeRowList(targetRows || []);
    disposePanelObject(targetPanel);
  }

  function startRowsLoadedIntro() {
    rowAnimAt = uniforms.uTime.value;
    panelDirty = true;
    rowsDirty = true;
    if (!group || !group.userData) return;
    group.userData.rowSettle = 1;
    if (window.gsap) {
      window.gsap.killTweensOf(group.userData, 'rowSettle');
      window.gsap.to(group.userData, { rowSettle: 0, duration: 0.76, ease: 'expo.out' });
    } else {
      group.userData.rowSettle = 0;
    }
  }

  function syncRenderedRows(force) {
    if (!group) return;
    var nowT = uniforms.uTime.value || 0;
    var refreshLoading = isLoadingContent() && nowT - rowDrawAt >= LOADING_ANIM_INTERVAL;
    drawPanelIfNeeded(force || refreshLoading, nowT);
    var total = allTracks.length;
    if (!total) { disposeRows(); return; }
    var center = Math.round(centerTarget);
    var start = Math.max(0, center - CONTENT_VISIBLE_RADIUS);
    var end = Math.min(total - 1, start + CONTENT_MAX_RENDER - 1);
    start = Math.max(0, end - CONTENT_MAX_RENDER + 1);
    if (!force && start === renderedStart && rows.length === (end - start + 1)) {
      rows.forEach(function(row) { row.song = allTracks[row.index] || row.song; });
      if (rowsDirty || refreshLoading) {
        rows.forEach(function(row) {
          var isCenter = Math.abs(row.index - centerSmooth) < 0.5;
          drawRow(row, row.song, isCenter);
          row.lastCenter = isCenter;
        });
        rowsDirty = false;
        rowDrawAt = nowT;
      }
      return;
    }
    disposeRows();
    renderedStart = start;
    for (var idx = start; idx <= end; idx++) {
      var row = makeRow(allTracks[idx], idx);
      rows.push(row);
      drawRow(row, row.song, idx === Math.round(centerSmooth));
      row.lastCenter = idx === Math.round(centerSmooth);
    }
    rowsDirty = false;
    rowDrawAt = nowT;
  }

  return {
    isOpen: function() { return open; },
    refreshTheme: function() {
      panelDirty = true;
      rowsDirty = true;
      if (!open || !group) return;
      drawPanelIfNeeded(true);
      syncRenderedRows(true);
    },
    open: async function(playlistId, title, fromCard) {
      open = true;
      playlistTitle = title;
      sourceCard = fromCard;
      var token = ++requestToken;
      openAnimAt = uniforms.uTime.value;
      rowAnimAt = openAnimAt;
      centerTarget = 0;
      centerSmooth = 0;
      panelDirty = true;
      rowsDirty = true;
      panelDrawAt = -10;
      rowDrawAt = -10;
      if (!group) {
        group = new THREE.Group();
        scene.add(group);
      }
      var openLayout = detailLayout();
      var openSkullDetail = shouldUseSkullSafeShelfCamera();
      var openDynamicDetail = !openSkullDetail && shouldUseShelfDynamicCamera('shelf-detail') && camera;
      var openCoverRx = particles && particles.rotation ? particles.rotation.x : 0;
      var openCoverRy = particles && particles.rotation ? particles.rotation.y : 0;
      var openCoverRz = particles && particles.rotation ? particles.rotation.z : 0;
      group.userData.detailIntro = 1;
      group.position.set(openLayout.x + (openSkullDetail ? 0.10 : 0.16), openLayout.y - (openSkullDetail ? 0.02 : 0.024), openLayout.z - (openSkullDetail ? 0.05 : 0.070));
      if ((openSkullDetail || openDynamicDetail) && camera) {
        group.quaternion.copy(camera.quaternion);
        group.rotateX(openLayout.rx);
        group.rotateY(openLayout.ry + (openSkullDetail ? 0.014 : 0.018));
      } else {
        group.rotation.y = openCoverRy * 0.82 + openLayout.ry + 0.018;
        group.rotation.x = openCoverRx * 0.72 + openLayout.rx;
        group.rotation.z = openCoverRz * 0.70;
      }
      group.scale.setScalar(openLayout.scale * 0.965);
      if (window.gsap) {
        window.gsap.killTweensOf(group.userData);
        window.gsap.to(group.userData, { detailIntro: 0, duration: 0.48, ease: 'power3.out' });
      } else {
        group.userData.detailIntro = 0;
      }
      try {
        drawPanelIfNeeded(true);
        // 清旧
        disposeRows();
        // loading 行
        allTracks = [{ name: '加载中…', artist: '' }];
        panelDirty = true;
        rowsDirty = true;
        syncRenderedRows(true);
      } catch (renderLoadingErr) {
        console.warn('[ShelfContentLoadingRender]', playlistId, renderLoadingErr);
      }
      var podcastCollectionKey = String(playlistId || '').indexOf('podcast:') === 0 ? String(playlistId).slice(8) : '';
      var qqPlaylistId = String(playlistId || '').indexOf('qq:') === 0 ? String(playlistId).slice(3) : '';
      contentKind = podcastCollectionKey ? 'podcast' : 'playlist';
      // 拉取歌单/播客集合
      var r = null;
      try {
        r = podcastCollectionKey
          ? await apiJson('/api/podcast/my/items?key=' + encodeURIComponent(podcastCollectionKey) + '&limit=36')
          : (qqPlaylistId
            ? await apiJson('/api/qq/playlist/tracks?id=' + encodeURIComponent(qqPlaylistId))
            : await apiJson('/api/playlist/tracks?id=' + encodeURIComponent(playlistId)));
      } catch (e) {
        if (!open || token !== requestToken) return;
        console.warn('[ShelfContentLoadApi]', playlistId, e);
        try {
          allTracks = [{ name: '歌单加载失败', artist: '' }];
          panelDirty = true;
          rowsDirty = true;
          startRowsLoadedIntro();
          syncRenderedRows(true);
        } catch (renderErrorErr) {
          console.warn('[ShelfContentErrorRender]', playlistId, renderErrorErr);
        }
        showToast('歌单加载失败');
        return;
      }
      if (!open || token !== requestToken) return;
      try {
        // 清 loading
        disposeRows();
        var tracks = podcastCollectionKey ? (r.items || []) : (r.tracks || []);
        if (!tracks.length) {
          allTracks = [{ name: podcastCollectionKey ? '播客为空' : '歌单为空', artist: '' }];
          panelDirty = true;
          rowsDirty = true;
          startRowsLoadedIntro();
          syncRenderedRows(true);
          return;
        }
        allTracks = tracks;
        centerTarget = 0; centerSmooth = 0;
        panelDirty = true;
        rowsDirty = true;
        startRowsLoadedIntro();
        syncRenderedRows(true);
      } catch (renderReadyErr) {
        console.warn('[ShelfContentReadyRender]', playlistId, renderReadyErr);
        showToast('歌单已载入，3D列表刷新失败');
      }
    },
    close: function() {
      open = false;
      requestToken++;
      var targetGroup = group;
      var targetRows = rows.slice();
      var targetPanel = panel;
      group = null;
      rows = [];
      panel = null;
      renderedStart = -1;
      allTracks = [];
      contentKind = 'playlist';
      sourceCard = null;
      panelDirty = true;
      rowsDirty = true;
      panelDrawAt = -10;
      rowDrawAt = -10;
      if (!targetGroup) return;
      var materials = targetRows.map(function(row){ return row.mesh && row.mesh.material; }).filter(Boolean);
      if (targetPanel && targetPanel.mesh && targetPanel.mesh.material) materials.push(targetPanel.mesh.material);
      if (window.gsap) {
        window.gsap.killTweensOf(targetGroup.position);
        window.gsap.killTweensOf(targetGroup.scale);
        window.gsap.to(targetGroup.scale, { x: 0.965, y: 0.965, z: 0.965, duration: 0.18, ease: 'power2.in' });
        window.gsap.to(targetGroup.position, {
          x: targetGroup.position.x + 0.18,
          y: targetGroup.position.y - 0.02,
          z: targetGroup.position.z - 0.10,
          duration: 0.18,
          ease: 'power2.in'
        });
        var finishClose = function(){ disposeCapturedDetail(targetGroup, targetRows, targetPanel); };
        if (materials.length) {
          window.gsap.to(materials, {
            opacity: 0,
            duration: 0.16,
            ease: 'power2.in',
            onComplete: finishClose
          });
        } else {
          window.gsap.delayedCall(0.18, finishClose);
        }
      } else {
        disposeCapturedDetail(targetGroup, targetRows, targetPanel);
      }
    },
    update: function(dt) {
      if (!group || !open) return;
      var intro = group.userData.detailIntro || 0;
      var parX = pointerParallax.x || 0;
      var parY = pointerParallax.y || 0;
      var layout = detailLayout();
      var skullDetail = shouldUseSkullSafeShelfCamera();
      var dynamicDetail = !skullDetail && shouldUseShelfDynamicCamera('shelf-detail') && camera;
      var coverBoundDetail = !skullDetail && !dynamicDetail && particles && particles.rotation;
      var coverBindX = coverBoundDetail ? particles.rotation.y * 0.18 : 0;
      var coverBindY = coverBoundDetail ? particles.rotation.x * -0.16 : 0;
      var coverBindZ = coverBoundDetail ? Math.abs(particles.rotation.y) * 0.030 : 0;
      group.position.set(
        layout.x + coverBindX + intro * (skullDetail ? 0.10 : 0.16) + parX * (skullDetail ? 0.024 : 0.030),
        layout.y + coverBindY - intro * (skullDetail ? 0.02 : 0.024) + parY * (skullDetail ? 0.026 : 0.026),
        layout.z + coverBindZ - intro * (skullDetail ? 0.05 : 0.070) + parY * (skullDetail ? 0.014 : 0.016) - parX * (skullDetail ? 0.010 : 0.010)
      );
      if (skullDetail && camera) {
        group.quaternion.copy(camera.quaternion);
        group.rotateX(layout.rx - parY * 0.004);
        group.rotateY(layout.ry + intro * 0.004 + parX * 0.004);
      } else if (dynamicDetail) {
        group.quaternion.copy(camera.quaternion);
        group.rotateX(layout.rx - parY * 0.006);
        group.rotateY(layout.ry + intro * 0.012 + parX * 0.008);
      } else {
        var coverRx = particles && particles.rotation ? particles.rotation.x : 0;
        var coverRy = particles && particles.rotation ? particles.rotation.y : 0;
        var coverRz = particles && particles.rotation ? particles.rotation.z : 0;
        group.rotation.x += ((coverRx * 0.72 + layout.rx - parY * 0.010) - group.rotation.x) * 0.16;
        group.rotation.y += ((coverRy * 0.82 + layout.ry + intro * 0.018 + parX * 0.014) - group.rotation.y) * 0.16;
        group.rotation.z += ((coverRz * 0.70) - group.rotation.z) * 0.14;
      }
      group.scale.setScalar(layout.scale * (1 - intro * (skullDetail ? 0.020 : 0.035)));
      centerSmooth += (centerTarget - centerSmooth) * 0.18;
      if (Math.abs(centerSmooth - centerTarget) < 0.001) centerSmooth = centerTarget;
      syncRenderedRows(false);
      if (panel && panel.mesh) {
        var pr = Math.max(0, Math.min(1, (uniforms.uTime.value - openAnimAt) / 0.72));
        pr = pr * pr * (3 - 2 * pr);
        panel.mesh.material.opacity = 0.86 * pr * shelfSettings().opacity;
      }
      for (var i = 0; i < rows.length; i++) {
        place(rows[i], i);
        var isC = Math.abs(rows[i].index - centerSmooth) < 0.5;
        if (rows[i].lastCenter !== isC) {
          rows[i].lastCenter = isC;
          drawRow(rows[i], rows[i].song, isC);
        }
      }
    },
    next: function() {
      if (allTracks.length) {
        var prevTarget = Math.round(centerTarget);
        centerTarget = Math.min(allTracks.length - 1, centerTarget + 1);
        var nextTarget = Math.round(centerTarget);
        syncRenderedRows(false);
        if (nextTarget !== prevTarget) playShelfSelectTick(1, 'row');
        pulseObjectValue(rows.find(function(r){ return r.index === nextTarget; }), 'fxPulse', 0.48, 0.36);
      }
    },
    prev: function() {
      if (allTracks.length) {
        var prevTarget = Math.round(centerTarget);
        centerTarget = Math.max(0, centerTarget - 1);
        var nextTarget = Math.round(centerTarget);
        syncRenderedRows(false);
        if (nextTarget !== prevTarget) playShelfSelectTick(-1, 'row');
        pulseObjectValue(rows.find(function(r){ return r.index === nextTarget; }), 'fxPulse', 0.48, 0.36);
      }
    },
    scrollBy: function(d) {
      if (allTracks.length) {
        var prevTarget = Math.round(centerTarget);
        centerTarget = Math.max(0, Math.min(allTracks.length - 1, centerTarget + d));
        var nextTarget = Math.round(centerTarget);
        syncRenderedRows(false);
        if (nextTarget !== prevTarget) playShelfSelectTick(d, 'row');
        pulseObjectValue(rows.find(function(r){ return r.index === nextTarget; }), 'fxPulse', 0.48, 0.36);
      }
    },
    getRows: function() { return rows; },
    getCenterIdx: function() { return Math.round(centerSmooth); },
    pulseRow: function(row, amount) {
      if (!row) return;
      pulseObjectValue(row, 'fxPulse', amount || 1, 0.42);
    },
    raycastRows: function(rc) {
      if (!rows.length) return null;
      var vm = rows.filter(function(r){return r.mesh.visible;}).map(function(r){return r.mesh;});
      var hits = rc.intersectObjects(vm, false);
      if (!hits.length) return null;
      var row = rows.find(function(r){ return r.mesh === hits[0].object; });
      return { row: row, uv: hits[0].uv };
    },
    pickRowAtScreen: function(sx, sy) {
      if (!rows.length || !open) return null;
      var ordered = rows.filter(function(r){ return r.mesh && r.mesh.visible; }).sort(function(a, b){
        return (b.mesh.renderOrder || 0) - (a.mesh.renderOrder || 0);
      });
      for (var ri = 0; ri < ordered.length; ri++) {
        var row = ordered[ri];
        var params = row.mesh.geometry && row.mesh.geometry.parameters || {};
        var hw = (params.width || 2.50) / 2;
        var hh = (params.height || 0.36) / 2;
        var pts = [
          new THREE.Vector3(-hw, -hh, 0),
          new THREE.Vector3( hw, -hh, 0),
          new THREE.Vector3( hw,  hh, 0),
          new THREE.Vector3(-hw,  hh, 0),
        ];
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        row.mesh.updateMatrixWorld(true);
        for (var pi = 0; pi < pts.length; pi++) {
          pts[pi].applyMatrix4(row.mesh.matrixWorld).project(camera);
          var x = (pts[pi].x + 1) * innerWidth / 2;
          var y = (1 - pts[pi].y) * innerHeight / 2;
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
        var padX = 24, padY = 16;
        if (sx < minX - padX || sx > maxX + padX || sy < minY - padY || sy > maxY + padY) continue;
        var u = clampRange((sx - minX) / Math.max(1, maxX - minX), 0, 1);
        var v = 1 - clampRange((sy - minY) / Math.max(1, maxY - minY), 0, 1);
        return { row: row, uv: { x: u, y: v }, screenPick: true };
      }
      return null;
    },
    raycastPanel: function(rc) {
      if (!panel || !panel.mesh) return null;
      var hits = rc.intersectObject(panel.mesh, false);
      return hits && hits.length ? hits[0] : null;
    },
    screenContainsPanel: function(sx, sy) {
      if (!panel || !panel.mesh || !open) return false;
      var params = panel.mesh.geometry && panel.mesh.geometry.parameters || {};
      var hw = (params.width || 2.62) / 2;
      var hh = (params.height || 3.02) / 2;
      var pts = [
        new THREE.Vector3(-hw, -hh, 0),
        new THREE.Vector3( hw, -hh, 0),
        new THREE.Vector3( hw,  hh, 0),
        new THREE.Vector3(-hw,  hh, 0),
      ];
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      panel.mesh.updateMatrixWorld(true);
      for (var pi = 0; pi < pts.length; pi++) {
        pts[pi].applyMatrix4(panel.mesh.matrixWorld).project(camera);
        var x = (pts[pi].x + 1) * innerWidth / 2;
        var y = (1 - pts[pi].y) * innerHeight / 2;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
      var pad = 42;
      return sx >= minX - pad && sx <= maxX + pad && sy >= minY - pad && sy <= maxY + pad;
    },
    rowActionAtScreen: function(row, sx, sy) {
      if (!row || !row.mesh || !row.mesh.visible) return null;
      var song = row.song || {};
      var isCenter = Math.abs(row.index - Math.round(centerSmooth)) < 0.5;
      if (!isCenter || !((song && song.id) || song.type === 'podcast-radio')) return null;
      var params = row.mesh.geometry && row.mesh.geometry.parameters || {};
      var hw = (params.width || 2.50) / 2;
      var hh = (params.height || 0.36) / 2;
      var corners = [
        new THREE.Vector3(-hw, -hh, 0),
        new THREE.Vector3( hw, -hh, 0),
        new THREE.Vector3( hw,  hh, 0),
        new THREE.Vector3(-hw,  hh, 0),
      ];
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      row.mesh.updateMatrixWorld(true);
      for (var i = 0; i < corners.length; i++) {
        corners[i].applyMatrix4(row.mesh.matrixWorld).project(camera);
        var x = (corners[i].x + 1) * innerWidth / 2;
        var y = (1 - corners[i].y) * innerHeight / 2;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
      var w = Math.max(1, maxX - minX);
      var h = Math.max(1, maxY - minY);
      var u = clampRange((sx - minX) / w, 0, 1);
      var v = clampRange((sy - minY) / h, 0, 1);
      if (u > 0.60 && u < 0.68 && v > 0.12 && v < 0.88) return 'like';
      if (u >= 0.68 && u < 0.75 && v > 0.12 && v < 0.88) return 'collect';
      if (u >= 0.75 && u < 0.82 && v > 0.12 && v < 0.88) return 'next';
      if (u >= 0.82 && v > 0.10 && v < 0.90) return 'play';
      return null;
    },
    playRow: function(row) {
      // 把整个歌单导入队列, 从这首开始播
      pulseObjectValue(row, 'fxPulse', 1.0, 0.34);
      var idx = row.index;
      if (idx < 0) return;
      if (row.song && row.song.type === 'podcast-radio') {
        loadPodcastRadioIntoQueue(row.song.id || row.song.radioId, true, row.song.name || playlistTitle);
        var smRadio = shelfManager;
        if (smRadio) safeShelfCloseContent('content-play-podcast-radio');
        return;
      }
      var playIndex = allTracks.slice(0, idx + 1).filter(function(song){ return song && song.id; }).length - 1;
      var allSongs = allTracks.filter(function(song){ return song && song.id; }).map(function(song){
        return cloneSong(song);
      });
      if (!allSongs.length || playIndex < 0) return;
      playQueue = allSongs;
      currentIdx = playIndex;
      safeRenderQueuePanel('content-play-row');
      safeShelfRebuild('content-play-row');
      forcePlaybackControlsInteractive();
      playQueueAt(playIndex, { preserveHomeState: true }).catch(function(e){
        console.warn('[ContentPlayRow]', e);
      });
      // 关闭内容框
      var sm = shelfManager;
      if (sm) safeShelfCloseContent('content-play-row');
    }
  };

  function makeRow(song, i) {
    var cv = document.createElement('canvas');
    cv.width = 800; cv.height = 104;
    var ctx = cv.getContext('2d');
    var tx = new THREE.CanvasTexture(cv);
    tx.minFilter = THREE.LinearFilter; tx.magFilter = THREE.LinearFilter;
    tx.generateMipmaps = false;
    var mat = new THREE.MeshBasicMaterial({ map: tx, transparent: true, opacity: 0.96, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
    var geo = new THREE.PlaneGeometry(2.50, 0.36, 1, 1);
      var mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 240 + i;
      group.add(mesh);
      return { canvas: cv, texture: tx, mesh: mesh, song: song, index: i, fxPulse: 0 };
    }
}

function compactCount(n) {
  n = Number(n) || 0;
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿';
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  return String(n);
}
function drawCanvasHeart(ctx, cx, cy, size, color) {
  var s = (size || 20) / 28;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(0, 10.2);
  ctx.bezierCurveTo(-8.9, 2.6, -13.8, -1.9, -13.8, -7.4);
  ctx.bezierCurveTo(-13.8, -12.0, -10.3, -15.2, -5.9, -15.2);
  ctx.bezierCurveTo(-3.2, -15.2, -1.1, -13.9, 0, -11.9);
  ctx.bezierCurveTo(1.1, -13.9, 3.2, -15.2, 5.9, -15.2);
  ctx.bezierCurveTo(10.3, -15.2, 13.8, -12.0, 13.8, -7.4);
  ctx.bezierCurveTo(13.8, -1.9, 8.9, 2.6, 0, 10.2);
  ctx.closePath();
  ctx.fillStyle = color || '#ff7a90';
  ctx.fill();
  ctx.restore();
}
function requestPlaylistCover(url, cb) {
  if (!url) { if (cb) cb(null); return; }
  var rec = playlistCoverCache[url];
  if (rec && rec.loaded) { if (cb) setTimeout(function(){ cb(rec.img); }, 0); return; }
  if (rec && rec.loading) { if (cb) rec.waiters.push(cb); return; }
  rec = playlistCoverCache[url] = { loaded:false, loading:true, waiters: cb ? [cb] : [], img:null, failed:false };
  var img = new Image();
  if (!isInlineCoverSrc(url)) img.crossOrigin = 'anonymous';
  img.onload = function(){
    rec.loaded = true; rec.loading = false; rec.img = img;
    rec.waiters.splice(0).forEach(function(fn){ setTimeout(function(){ fn(img); }, 0); });
  };
  img.onerror = function(){
    rec.loading = false; rec.failed = true;
    rec.waiters.splice(0).forEach(function(fn){ setTimeout(function(){ fn(null); }, 0); });
  };
  var src = coverProxySrc(url);
  if (!src) {
    rec.loading = false; rec.failed = true;
    rec.waiters.splice(0).forEach(function(fn){ setTimeout(function(){ fn(null); }, 0); });
    return;
  }
  img.src = src;
}

// ============================================================
//  3D 卡片交互 - PSP 风格
//   - 滚轮: 滚动 center 卡 (一级或二级)
//   - 点击 center 卡: 打开内容框 (歌单) 或 播放 (队列)
//   - 点击两侧卡: 滚到那张
//   - ESC: 关闭内容框
// ============================================================
function raycasterFromPointerEvent(e) {
  var mx = (e.clientX / innerWidth) * 2 - 1;
  var my = -(e.clientY / innerHeight) * 2 + 1;
  var rc = new THREE.Raycaster();
  rc.setFromCamera(new THREE.Vector2(mx, my), camera);
  return rc;
}
function pointerCardHit(rc, e, screenPad) {
  if (!shelfManager) return null;
  return shelfManager.raycastCards(rc) || (shelfManager.pickCardAtScreen && shelfManager.pickCardAtScreen(e.clientX, e.clientY, screenPad));
}
function isSideShelfFocusHit(e) {
  if (!e || !shelfManager || !shelfManager.getMode || shelfManager.getMode() !== 'side') return false;
  if (shelfPinnedOpen) return true;
  if (shelfAlwaysVisible()) return !!pointerCardHit(raycasterFromPointerEvent(e), e, 18);
  if (!shelfAutoHiddenInputReady()) return false;
  if (shelfVisibility > 0.34 && (isShelfClickZone(e) || isShelfPreviewUseZone(e))) return true;
  return !!(shelfPreviewIsVisible() && pointerCardHit(raycasterFromPointerEvent(e), e, 24));
}
function updateShelfCardHoverSelection(e) {
  if (!shelfManager || !shelfManager.clearSelected || !shelfManager.setSelected) return;
  if (!e || document.body.classList.contains('splash-active') || isPointerOverUi(e)) {
    shelfManager.clearSelected();
    return;
  }
  var mode = shelfManager.getMode && shelfManager.getMode();
  if (!mode || mode === 'off') {
    shelfManager.clearSelected();
    return;
  }
  if (shelfManager.hasOpenContent && shelfManager.hasOpenContent()) {
    shelfManager.clearSelected();
    return;
  }
  var canInteract = shelfManager.canInteract && shelfManager.canInteract();
  if (!canInteract) {
    shelfManager.clearSelected();
    return;
  }
  if (mode === 'side') {
    if (!shelfPinnedOpen && shelfAlwaysVisible()) {
      var alwaysHit = pointerCardHit(raycasterFromPointerEvent(e), e, 18);
      if (alwaysHit && alwaysHit.card) shelfManager.setSelected(alwaysHit.card.index);
      else shelfManager.clearSelected();
      return;
    }
    var sideUsable = shelfPinnedOpen || shelfAutoHiddenInputReady();
    if (!sideUsable) {
      shelfManager.clearSelected();
      return;
    }
  } else if (mode !== 'stage') {
    shelfManager.clearSelected();
    return;
  }
  var hit = pointerCardHit(raycasterFromPointerEvent(e), e);
  if (hit && hit.card) shelfManager.setSelected(hit.card.index);
  else shelfManager.clearSelected();
}
function isShelfPlaylistPlayHit(hit) {
  if (!hit || !hit.card || !hit.uv || !hit.card.item || hit.card.item.type !== 'playlist') return false;
  return hit.uv.x >= 0.49 && hit.uv.x <= 0.72 && hit.uv.y >= 0.13 && hit.uv.y <= 0.42;
}
renderer.domElement.addEventListener('click', function(e){
  if (!shelfManager || shelfManager.getMode() === 'off') return;
  if (document.body.classList.contains('splash-active')) return;
  if (isPointerOverUi(e)) return;
  if (mouseDownAt.hadDrag) { mouseDownAt.hadDrag = false; return; }

  var rc = raycasterFromPointerEvent(e);
  var mode = shelfManager.getMode();
  var canInteract = shelfManager.canInteract && shelfManager.canInteract();

  // 优先二级内容框
  if (shelfManager.hasOpenContent()) {
    var cl = shelfManager.getContentList && shelfManager.getContentList();
    if (cl) {
      var rowHit = cl.raycastRows(rc);
      if (!rowHit && cl.pickRowAtScreen) rowHit = cl.pickRowAtScreen(e.clientX, e.clientY);
      if (rowHit) {
        if (cl.pulseRow) cl.pulseRow(rowHit.row, 0.72);
        var selectedRow = Math.abs(rowHit.row.index - cl.getCenterIdx()) < 0.5;
        var rowIsPodcastRadio = !!(rowHit.row.song && rowHit.row.song.type === 'podcast-radio');
        var hitLikeButton = rowHit.uv && rowHit.uv.x > 0.61 && rowHit.uv.x < 0.68 && rowHit.uv.y > 0.20 && rowHit.uv.y < 0.82;
        var hitCollectButton = rowHit.uv && rowHit.uv.x >= 0.68 && rowHit.uv.x < 0.75 && rowHit.uv.y > 0.20 && rowHit.uv.y < 0.82;
        var hitNextButton = rowHit.uv && rowHit.uv.x >= 0.75 && rowHit.uv.x < 0.82 && rowHit.uv.y > 0.20 && rowHit.uv.y < 0.82;
        var hitPlayButton = rowHit.uv && rowHit.uv.x >= 0.82 && rowHit.uv.y > 0.20 && rowHit.uv.y < 0.82;
        var screenAction = (!rowHit.uv && cl.rowActionAtScreen) ? cl.rowActionAtScreen(rowHit.row, e.clientX, e.clientY) : null;
        hitLikeButton = hitLikeButton || screenAction === 'like';
        hitCollectButton = hitCollectButton || screenAction === 'collect';
        hitNextButton = hitNextButton || screenAction === 'next';
        hitPlayButton = hitPlayButton || screenAction === 'play';
        // 详情页支持直接点歌曲播放；红心/收藏按钮仍然保留原动作。
        if (selectedRow && !rowIsPodcastRadio && hitLikeButton) {
          toggleLikeDetailSong(rowHit.row.song);
        } else if (selectedRow && !rowIsPodcastRadio && hitCollectButton) {
          collectDetailSong(rowHit.row.song);
        } else if (selectedRow && !rowIsPodcastRadio && hitNextButton) {
          queueDetailSongNext(rowHit.row.song);
        } else if ((rowHit.row.song && rowHit.row.song.id) || rowIsPodcastRadio || (selectedRow && hitPlayButton)) {
          cl.playRow(rowHit.row);
        } else {
          // 滚到这行
          cl.scrollBy(rowHit.row.index - cl.getCenterIdx());
        }
        return;
      }
      var returnHit = shelfManager.raycastCards(rc);
      safeShelfCloseContent('shelf-card-return');
      if (mode === 'side') setShelfPinnedOpen(true, true);
      if (returnHit && returnHit.card) {
        shelfManager.scrollBy(returnHit.card.index - shelfManager.getCenterIdx());
      }
      return;
    }
  }

  // 一级卡片
  var hit = pointerCardHit(rc, e, mode === 'side' && !shelfPinnedOpen && shelfAlwaysVisible() ? 18 : undefined);
  if (mode === 'side' && !shelfPinnedOpen && !canUseSideShelfWithoutPinnedOpen()) return;

  if (hit) {
    if (mode === 'side') setShelfPinnedOpen(true, true);
    var idx = hit.card.index;
    if (Math.abs(idx - shelfManager.getCenterIdx()) < 0.5) {
      if (isShelfPlaylistPlayHit(hit) && shelfManager.playPlaylistAt && shelfManager.playPlaylistAt(idx)) return;
      shelfManager.openContent(idx);
    } else {
      shelfManager.scrollBy(idx - shelfManager.getCenterIdx());
    }
  } else if (mode === 'side' && shelfPinnedOpen) {
    setShelfPinnedOpen(false, true);
  }
});

renderer.domElement.addEventListener('contextmenu', function(e){
  if (document.body.classList.contains('splash-active')) return;
  if (isPointerOverUi(e)) return;
  e.preventDefault();
  e.stopPropagation();
  if (typeof suppressBottomControlsForShelf === 'function') suppressBottomControlsForShelf(980);
  if (!shelfManager) return;
  var mode = shelfManager.getMode && shelfManager.getMode();
  if (mode === 'off') {
    setShelfMode('side');
    mode = 'side';
  }
  if (mode !== 'side') return;
  if (shelfManager.hasOpenContent && shelfManager.hasOpenContent()) {
    var rc = raycasterFromPointerEvent(e);
    var cl = shelfManager.getContentList && shelfManager.getContentList();
    var rowHit = cl && cl.raycastRows ? cl.raycastRows(rc) : null;
    if (rowHit && rowHit.row && rowHit.row.song && rowHit.row.song.id && rowHit.row.song.type !== 'podcast-radio') {
      if (cl.pulseRow) cl.pulseRow(rowHit.row, 0.88);
      queueDetailSongNext(rowHit.row.song);
      return;
    }
    safeShelfCloseContent('shelf-context-toggle');
    setShelfPinnedOpen(true, true);
    return;
  }
  setShelfPinnedOpen(!shelfPinnedOpen, true);
  if (!shelfPinnedOpen && typeof setFocusZone === 'function') setFocusZone(null, true);
});

// 滚轮: 在真实卡片或右侧窄热区内滚卡片; 否则保留给封面粒子/视角
//   side 模式: 常驻不再用半屏预览区接管滚轮
//   stage 模式: 鼠标 y > 60% 屏幕高
//   shift + wheel: 强制滚卡片
var wheelOverShelf = false;
renderer.domElement.addEventListener('wheel', function(e){
  if (isPointerOverUi(e)) return;
  if (!shelfManager || shelfManager.getMode() === 'off') return;
  markRenderInteraction('shelf-wheel', 900);
  var rc = raycasterFromPointerEvent(e);
  // 二级框打开时, 只有真正命中详情行才接管滚轮
  if (shelfManager.hasOpenContent()) {
    var cl = shelfManager.getContentList();
    if (cl) {
      var rowHit = cl.raycastRows(rc);
      var panelHit = !rowHit && cl.raycastPanel ? cl.raycastPanel(rc) : null;
      var panelScreenHit = !rowHit && !panelHit && cl.screenContainsPanel ? cl.screenContainsPanel(e.clientX, e.clientY) : false;
      if (!rowHit && !panelHit && !panelScreenHit) return;
      e.preventDefault(); e.stopImmediatePropagation();
      cl.scrollBy(e.deltaY > 0 ? 1 : -1);
      return;
    }
  }
  var mode = shelfManager.getMode();
  var inShelfArea = false;
  var canScrollShelf = shelfManager.canInteract && shelfManager.canInteract();
  var shelfPreviewActive = shelfAutoHiddenInputReady();
  var cardWheelHit = canScrollShelf ? pointerCardHit(rc, e, mode === 'side' && !shelfPinnedOpen && shelfAlwaysVisible() ? 18 : undefined) : null;
  if (canScrollShelf && e.shiftKey && (mode !== 'side' || shelfPinnedOpen || shelfPreviewActive || shelfAlwaysVisible())) inShelfArea = true;
  else if (canScrollShelf && mode === 'side') {
    if (shelfPinnedOpen) inShelfArea = isShelfWheelZone(e) || !!cardWheelHit;
    else if (shelfAlwaysVisible()) inShelfArea = !!cardWheelHit;
    else if (shelfPreviewActive) inShelfArea = isShelfWheelZone(e) || !!cardWheelHit;
  }
  else if (canScrollShelf && mode === 'stage' && cardWheelHit) inShelfArea = true;
  if (inShelfArea) {
    e.preventDefault();
    e.stopImmediatePropagation();
    shelfManager.scrollBy(e.deltaY > 0 ? 1 : -1);
  }
}, { passive: false, capture: true });

// 键盘 / 全局事件
function isFreeCameraControlCode(code) {
  return /^(KeyW|KeyA|KeyS|KeyD|KeyQ|KeyE|Space|ShiftLeft|ShiftRight|ControlLeft|ControlRight)$/.test(code);
}
function consumeFreeCameraKeyEvent(e, isDown) {
  if (isTypingTarget(e.target)) return false;
  if (isDown && e.code === 'KeyR') {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat) return true;
    toggleFreeCamera();
    return true;
  }
  if (!freeCamera || !freeCamera.active) return false;
  if (isDown && e.code === 'KeyK') {
    e.preventDefault();
    e.stopImmediatePropagation();
    resetFreeCameraToDefault();
    return true;
  }
  if (!isFreeCameraControlCode(e.code)) return false;
  e.preventDefault();
  e.stopImmediatePropagation();
  freeCamera.keys = freeCamera.keys || {};
  freeCamera.keys[e.code] = !!isDown;
  markRenderInteraction('free-camera-key', 900);
  return true;
}
document.addEventListener('keydown', function(e){
  consumeFreeCameraKeyEvent(e, true);
}, true);
document.addEventListener('keyup', function(e){
  consumeFreeCameraKeyEvent(e, false);
}, true);
document.addEventListener('keydown', function(e){
  if (isTypingTarget(e.target)) return;
  markRenderInteraction('keyboard', 700);
  if (e.code === 'KeyK') {
    e.preventDefault();
    if (freeCamera && (freeCamera.active || freeCamera.locked)) resetFreeCameraToDefault();
    else {
      recenterCamera();
      showToast('镜头已回正');
    }
    return;
  }
  if (e.code === 'KeyR') {
    if (e.repeat) return;
    e.preventDefault();
    toggleFreeCamera();
    return;
  }
  if (freeCamera && freeCamera.active) {
    if (/^(KeyW|KeyA|KeyS|KeyD|KeyQ|KeyE|Space|ShiftLeft|ShiftRight|ControlLeft|ControlRight)$/.test(e.code)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      freeCamera.keys[e.code] = true;
      return;
    }
  }
  if (!shelfManager) return;
  if (e.code === 'BracketRight' || e.code === 'PageDown') shelfManager.next();
  else if (e.code === 'BracketLeft' || e.code === 'PageUp') shelfManager.prev();
});
document.addEventListener('keyup', function(e){
  if (!freeCamera || !freeCamera.keys) return;
  if (/^(KeyW|KeyA|KeyS|KeyD|KeyQ|KeyE|Space|ShiftLeft|ShiftRight|ControlLeft|ControlRight)$/.test(e.code)) {
    freeCamera.keys[e.code] = false;
  }
});
window.addEventListener('blur', function(){
  if (freeCamera && freeCamera.keys) freeCamera.keys = {};
});

// ============================================================
//  API 助手
