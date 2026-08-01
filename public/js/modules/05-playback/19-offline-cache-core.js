// ============================================================
// 离线缓存核心 (P1: 音频离线闭环)
// 提供: manifest 内存镜像 / resolveOfflineAudioKey / hasOfflineAudio /
//       downloadOfflineAudio / deleteOfflineAudio / 启动加载
// 依赖全局函数:
//   queueItemKey (09-queue-snapshot-autoplay)
//   apiJson (00-api-quality-output)
//   normalizePlaybackProvider / getProviderPlaybackQuality /
//   normalizePlaybackQualityForProvider (00-api-quality-output)
//   songProviderKey (07-search)
//   qqPlaybackEvidenceQuery / neteasePlaybackMatchQuery (13-playback-start-audio)
//   isPodcastSong (03-beat-dj-state)
// 缓存 key 复用队列去重同一套 queueItemKey, 再附「名称|歌手」兜底,
// 跨入口(搜索/歌单/队列)与跨源(fallback)均能命中。
// ============================================================
'use strict';

// ---------- 离线缓存偏好(音质 / 命名规则, 存 localStorage) ----------
var OFFLINE_CACHE_PREFS_KEY = 'mineradio-offline-cache-prefs';
var offlineCachePrefs = { quality: 'default', naming: 'title-artist' };
function loadOfflineCachePrefs() {
  try {
    var raw = localStorage.getItem(OFFLINE_CACHE_PREFS_KEY);
    if (raw) {
      var p = JSON.parse(raw) || {};
      if (p.quality) offlineCachePrefs.quality = p.quality;
      if (p.naming) offlineCachePrefs.naming = p.naming;
    }
  } catch (e) {}
  return offlineCachePrefs;
}
function saveOfflineCachePrefs() {
  try { localStorage.setItem(OFFLINE_CACHE_PREFS_KEY, JSON.stringify(offlineCachePrefs)); } catch (e) {}
}
function getOfflineCachePrefQuality() {
  return (offlineCachePrefs.quality && offlineCachePrefs.quality !== 'default') ? offlineCachePrefs.quality : null;
}
function offlineFileNameHint(song) {
  var name = String(song.name || song.title || '未知歌曲').trim();
  var artist = String(song.artist || (Array.isArray(song.artists) ? song.artists.join('/') : '') || '未知歌手').trim();
  var naming = offlineCachePrefs.naming || 'title-artist';
  if (naming === 'artist-title') return artist + ' - ' + name;
  if (naming === 'title') return name;
  if (naming === 'key') return queueItemKey(song) || (name + ' - ' + artist);
  return name + ' - ' + artist; // title-artist
}
loadOfflineCachePrefs();

// ---------- 关联缓存(P6): 下载失败时用户搜到的「相似版本」可显式关联给原曲 ----------
// 这样即使相似版本歌名略有差异(如加了 (Live)/(伴奏)), 原曲播放也能命中它。
var OFFLINE_ALIAS_KEY = 'mineradio-offline-aliases';
var offlineAliasMap = {};            // origKey -> downloadedKey
var offlineFallbackOrigSong = null;  // 触发「相似版本搜索」的原曲(下载搜索结果时关联)
function loadOfflineAliasMap() {
  try {
    var raw = localStorage.getItem(OFFLINE_ALIAS_KEY);
    if (raw) offlineAliasMap = JSON.parse(raw) || {};
  } catch (e) {}
  return offlineAliasMap;
}
function saveOfflineAliasMap() {
  try { localStorage.setItem(OFFLINE_ALIAS_KEY, JSON.stringify(offlineAliasMap)); } catch (e) {}
}
loadOfflineAliasMap();

// 下载失败时: 自动打开搜索界面, 用软件自带搜索接口搜同名同歌手的相似版本
function openSimilarVersionSearchForOffline(song) {
  if (!song) return;
  offlineFallbackOrigSong = song;
  var name = String(song.name || song.title || '').trim();
  var artist = String(song.artist || (Array.isArray(song.artists) ? song.artists.join(' ') : '') || '').trim();
  var query = (name + ' ' + artist).trim() || name;
  try {
    var input = document.getElementById('search-input');
    if (input) { input.value = query; try { input.focus(); } catch (e2) {} }
    if (typeof doSearch === 'function') doSearch(query);
  } catch (e) {}
}
// 把刚下载的「相似版本」关联到原曲(原曲播放时命中它)
function aliasOfflineAudioForOriginal(origSong, downloadedSong) {
  var ok = queueItemKey(origSong);
  var dk = queueItemKey(downloadedSong);
  if (!ok || !dk || ok === dk) return;
  offlineAliasMap[ok] = dk;
  saveOfflineAliasMap();
}
function clearOfflineFallbackContext() { offlineFallbackOrigSong = null; }
// 用户手动改搜索词 => 放弃「为原曲找替代」的上下文
try {
  var _offlineSearchInput = document.getElementById('search-input');
  if (_offlineSearchInput) _offlineSearchInput.addEventListener('input', clearOfflineFallbackContext);
} catch (e) {}

var offlineAudioManifest = {};
var offlineAudioNameIndex = {};
var offlineAudioManifestLoaded = false;

function loadOfflineAudioManifest() {
  offlineAudioManifestLoaded = false;
  return apiJson('/api/offline-manifest', { timeoutMs: 8000 })
    .then(function (data) {
      if (data && data.manifest) offlineAudioManifest = data.manifest || {};
      rebuildOfflineNameIndex();
      offlineAudioManifestLoaded = true;
      return offlineAudioManifest;
    })
    .catch(function (e) {
      console.warn('[OfflineCache] manifest 加载失败', e);
      offlineAudioManifestLoaded = true;
      return offlineAudioManifest;
    });
}

function rebuildOfflineNameIndex() {
  offlineAudioNameIndex = {};
  Object.keys(offlineAudioManifest).forEach(function (k) {
    var e = offlineAudioManifest[k];
    if (!e) return;
    var nk = String((e.name || '') + '|' + (e.artist || '')).trim().toLowerCase();
    if (!nk) return;
    // 同名同歌手可能有多份缓存(不同源/不同版本), 存为数组, 命中时择优
    if (!offlineAudioNameIndex[nk]) offlineAudioNameIndex[nk] = [];
    offlineAudioNameIndex[nk].push(k);
  });
}

function normalizeOfflineSongIdentity(song) {
  if (!song) return '';
  var name = String(song.name || song.title || '').trim().toLowerCase();
  var artist = String(song.artist || (Array.isArray(song.artists) ? song.artists.join('/') : '') || '').trim().toLowerCase();
  return name + '|' + artist;
}

// 返回命中的 manifest key (与下载时一致), 未命中返回 null
// opts.allowSimilar === false: 仅精确匹配(在线播放默认, 避免用相似版本替换在线原曲, 坑10)
// 省略 / true: 允许「名称|歌手」相似命中(离线续播 P5)
function resolveOfflineAudioKey(song, opts) {
  opts = opts || {};
  if (!song) return null;
  var exact = queueItemKey(song);
  if (exact && offlineAudioManifest[exact]) return exact;
  // 用户显式关联过的「相似版本」替代(原曲播放命中; 仅当未禁用 alias)
  if (opts.allowAlias !== false && exact && offlineAliasMap[exact] && offlineAudioManifest[offlineAliasMap[exact]]) {
    return offlineAliasMap[exact];
  }
  if (opts.allowSimilar === false) return null;
  var nk = normalizeOfflineSongIdentity(song);
  if (!nk) return null;
  var candidates = offlineAudioNameIndex[nk];
  if (!candidates || !candidates.length) return null;
  if (candidates.length === 1) return candidates[0];
  // 多个同名同歌手候选: 优先时长接近者(避免不同版本串台), 否则最近下载者
  var dur = Number(song.duration || song.dt || 0);
  if (dur > 0) {
    for (var i = 0; i < candidates.length; i++) {
      var cd = Number((offlineAudioManifest[candidates[i]] || {}).duration || 0);
      if (cd > 0 && Math.abs(cd - dur) <= 3) return candidates[i];
    }
  }
  var best = candidates[0], bestT = -1;
  for (var j = 0; j < candidates.length; j++) {
    var t = Number((offlineAudioManifest[candidates[j]] || {}).downloadedAt || 0);
    if (t > bestT) { bestT = t; best = candidates[j]; }
  }
  return best;
}

function hasOfflineAudio(song) {
  return !!resolveOfflineAudioKey(song, { allowAlias: false });
}

// 复刻 playQueueAt 的 URL 解析逻辑, 返回 { data, provider, quality }
function resolveSongAudioUrl(song, qualityOverride) {
  var provider = normalizePlaybackProvider(songProviderKey(song));
  var requestedQuality = normalizePlaybackQualityForProvider(qualityOverride || getProviderPlaybackQuality(provider), provider);
  var qualityParam = '&quality=' + encodeURIComponent(requestedQuality);
  var url;
  if (provider === 'qq') {
    url = '/api/qq/song/url?mid=' + encodeURIComponent(song.mid || song.songmid || song.id || '') + '&mediaMid=' + encodeURIComponent(song.mediaMid || song.media_mid || '') + qqPlaybackEvidenceQuery(song) + qualityParam;
  } else if (provider === 'kugou') {
    url = '/api/kugou/song/url?hash=' + encodeURIComponent(song.hash || song.fileHash || song.audioHash || song.id || '') +
      '&albumId=' + encodeURIComponent(song.albumId || song.album_id || '') +
      '&albumAudioId=' + encodeURIComponent(song.albumAudioId || song.album_audio_id || song.mixSongId || '') +
      '&mixSongId=' + encodeURIComponent(song.mixSongId || '') +
      '&hqHash=' + encodeURIComponent(song.hqHash || song.hq_hash || '') +
      '&sqHash=' + encodeURIComponent(song.sqHash || song.sq_hash || '') +
      '&resHash=' + encodeURIComponent(song.resHash || song.res_hash || '') +
      '&vipRequired=' + encodeURIComponent(song.vipRequired || song.needVip || song.onlyVipPlayable || song.only_vip_playable ? '1' : '') +
      '&privilege=' + encodeURIComponent(song.privilege || song.Privilege || song.mediaPrivilege || song.media_privilege || '') +
      '&fee=' + encodeURIComponent(song.fee || song.Fee || '') +
      qualityParam;
  } else if (provider === 'qishui') {
    url = '/api/qishui/song/url?id=' + encodeURIComponent(song.id || song.providerSongId || '') + qqPlaybackEvidenceQuery(song) + qualityParam;
  } else if (provider === 'spotify') {
    url = '/api/spotify/song/url?id=' + encodeURIComponent(song.id || song.providerSongId || song.spotifyId || '') +
      '&spotifyId=' + encodeURIComponent(song.spotifyId || '') +
      '&uri=' + encodeURIComponent(song.spotifyUri || song.uri || '') +
      qualityParam;
  } else {
    url = '/api/song/url?id=' + encodeURIComponent(song.id || '') + neteasePlaybackMatchQuery(song) + qualityParam;
  }
  return apiJson(url, { timeoutMs: 15000 }).then(function (data) {
    return { data: data, provider: provider, quality: requestedQuality };
  });
}

// 下载时预填歌词持久缓存: 使离线播放时 fetchLyric 直接命中, 无需联网/无需先播放
function prefetchAndCacheLyricForOffline(song) {
  try {
    if (typeof lyricEndpointForSong !== 'function' || typeof writePersistentLyricCache !== 'function') return Promise.resolve(null);
    return apiJson(lyricEndpointForSong(song))
      .then(function (r) {
        var merged = (typeof mergeInlineLyricResponseForSong === 'function')
          ? mergeInlineLyricResponseForSong(song, r || {})
          : (r || null);
        if (merged) writePersistentLyricCache(song, merged);
        return merged;
      })
      .catch(function () { return null; });
  } catch (e) { return Promise.resolve(null); }
}

// 从歌词合并结果中提取「纯 LRC 文本」(用于写进文件标签)
// netease 等源的富文本(JSON {"t":..,"c":..} 或 YRC/romalrc)不能写进文件 LYRICS 标签,
// 必须取纯净 LRC(含 [mm:ss.xx] 时间标签且不含 JSON)。
function offlineLyricLooksLikeLrc(t) {
  return typeof t === 'string' && t.trim().length && /\[\d{1,2}:\d{2}/.test(t) &&
    t.indexOf('{"t":') === -1 && t.indexOf('"c":[') === -1;
}
function offlinePickPlainLrc(merged) {
  if (!merged || typeof merged !== 'object') return '';
  var sources = [merged.lrc, merged.lyric, merged.romalrc, merged.yromalrc, merged.tlyric, merged.ytlrc];
  for (var i = 0; i < sources.length; i++) {
    if (offlineLyricLooksLikeLrc(sources[i])) return sources[i].trim();
  }
  // 兜底: 混合文本(如 JSON+LRC)中仅抽取 LRC 行
  var mixed = merged.lrc || merged.lyric || '';
  if (typeof mixed === 'string') {
    var lines = mixed.split('\n').filter(function (ln) { return /^\[\d{1,2}:\d{2}/.test(ln); });
    if (lines.length) return lines.join('\n');
  }
  return '';
}
// 从 song 对象解析发行年份(兼容 unix 秒/毫秒 与 "2005"/"2005-01-01" 字符串)
function offlineSongYear(song) {
  var v = song && (song.year || song.publishTime);
  if (v == null || v === '') return '';
  if (typeof v === 'number') {
    var ms = v < 1e12 ? v * 1000 : v; // 秒 -> 毫秒
    var d = new Date(ms);
    return isNaN(d.getTime()) ? '' : String(d.getFullYear());
  }
  var m = String(v).match(/\d{4}/);
  return m ? m[0] : '';
}

function downloadOfflineAudio(song) {
  if (!song) return Promise.resolve({ ok: false, reason: 'NO_SONG' });
  if (typeof isPodcastSong === 'function' && isPodcastSong(song)) return Promise.resolve({ ok: false, reason: 'PODCAST_NOT_CACHED' });
  var key = queueItemKey(song);
  if (!key) return Promise.resolve({ ok: false, reason: 'NO_KEY' });
  // 已缓存: 跳过音频下载, 仅用最新 song 元数据补全/重写标签(幂等, 修复旧文件标签不全)
  var tagOnly = !!offlineAudioManifest[key];
  return Promise.all([
    tagOnly ? Promise.resolve(null) : resolveSongAudioUrl(song, getOfflineCachePrefQuality()),
    prefetchAndCacheLyricForOffline(song)
  ]).then(function (arr) {
    var res = arr[0];
    var merged = arr[1];
    if (!tagOnly) {
      if (!res || !res.data || !res.data.url) {
        // 后端已做音质回退 + 站内同曲匹配 + 探测, 仍无 url 说明源站真的给不出
        // (版权 / VIP / 购买 / 地区 / 未登录 / 下架)。把后端的中文原因透传上去,
        // 不要再只丢一个 no_url 让用户看不懂。
        var noUrlDetail = (res && res.data)
          ? ((res.data.restriction && res.data.restriction.message) || res.data.message || res.data.reason || '')
          : '';
        return { ok: false, reason: 'NO_URL', detail: noUrlDetail, provider: res ? res.provider : (song.provider || '') };
      }
      // 试听片段会永久污染缓存, 必须拒绝 (R3)
      if (res.data.trial) return { ok: false, reason: 'TRIAL_FORBIDDEN' };
    }
    var lyricText = offlinePickPlainLrc(merged);
    var body = {
      key: key,
      url: res ? (res.data && res.data.url) : '',
      provider: res ? res.provider : (song.provider || ''),
      quality: res ? res.quality : '',
      fileNameHint: offlineFileNameHint(song),
      name: song.name || song.title || '',
      artist: song.artist || (Array.isArray(song.artists) ? song.artists.join('/') : ''),
      album: song.album || '',
      albumArtist: song.albumArtist || (song.artist || (Array.isArray(song.artists) ? song.artists.join('/') : '')) || '',
      track: song.trackNumber || song.track || '',
      year: offlineSongYear(song),
      genre: song.genre || '',
      lyric: lyricText,
      cover: song.cover || '',
      duration: Number(song.duration || song.dt || 0),
      tagOnly: tagOnly,
    };
    return apiJson('/api/offline-audio/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      timeoutMs: 180000,
    }).then(function (r) {
      if (r && r.ok) {
        offlineAudioManifest[key] = Object.assign({ key: key }, r.entry || body);
        rebuildOfflineNameIndex();
        return { ok: true, key: key, size: r.entry && r.entry.size, retagged: tagOnly };
      }
      return { ok: false, reason: (r && r.reason) || 'DOWNLOAD_FAILED', detail: r };
    });
  });
}

function deleteOfflineAudio(key) {
  if (!key) return Promise.resolve({ ok: false, reason: 'NO_KEY' });
  return apiJson('/api/offline-audio?key=' + encodeURIComponent(key), { method: 'DELETE', timeoutMs: 10000 })
    .then(function (r) {
      delete offlineAudioManifest[key];
      rebuildOfflineNameIndex();
      return { ok: !!(r && r.ok) };
    })
    .catch(function (e) { return { ok: false, reason: e.message }; });
}

// 启动即加载 manifest 镜像 (后台, 不阻塞渲染)
loadOfflineAudioManifest();

// 批量下载(串行, 去重, 进度回调). songs: 数组; opts.onProgress({done,total,song,result})
function downloadOfflineAudioBatch(songs, opts) {
  opts = opts || {};
  var list = (songs || []).filter(Boolean);
  var onProgress = opts.onProgress || function () {};
  var total = list.length;
  var done = 0;
  var results = { ok: 0, skipped: 0, failed: [] };
  return list.reduce(function (chain, song) {
    return chain.then(function () {
      return downloadOfflineAudio(song).then(function (r) {
        done += 1;
        if (r && r.ok && !r.already) results.ok += 1;
        else if (r && r.already) results.skipped += 1;
        else results.failed.push({ name: (song && (song.name || song.title)) || '未知', reason: (r && r.reason) || 'FAIL', detail: (r && r.detail) || '' });
        onProgress({ done: done, total: total, song: song, result: r });
      }).catch(function (e) {
        done += 1;
        results.failed.push({ name: (song && (song.name || song.title)) || '未知', reason: e.message || 'ERR' });
        onProgress({ done: done, total: total, song: song, result: { ok: false, reason: 'ERR' } });
      });
    });
  }, Promise.resolve()).then(function () { return results; });
}

// 清空全部离线缓存
function clearAllOfflineAudio() {
  var keys = Object.keys(offlineAudioManifest);
  if (!keys.length) return Promise.resolve({ ok: true, removed: 0 });
  return Promise.all(keys.map(function (k) {
    return deleteOfflineAudio(k).catch(function () {});
  })).then(function () { return { ok: true, removed: keys.length }; });
}

// 统计: 条数 + 总字节数
function getOfflineStats() {
  var keys = Object.keys(offlineAudioManifest);
  var total = 0;
  keys.forEach(function (k) { var e = offlineAudioManifest[k]; if (e) total += Number(e.size || 0); });
  return { count: keys.length, totalBytes: total };
}
