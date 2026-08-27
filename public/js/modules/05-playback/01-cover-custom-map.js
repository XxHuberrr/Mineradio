function isTypingTarget(target) {
  if (!target) return false;
  var tag = String(target.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return !!(target.isContentEditable || (target.closest && target.closest('[contenteditable="true"]')));
}
function readCustomCoverMap() {
  try {
    var raw = localStorage.getItem(CUSTOM_COVER_STORE_KEY);
    var parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}
function saveCustomCoverMap() {
  try {
    localStorage.setItem(CUSTOM_COVER_STORE_KEY, JSON.stringify(customCoverMap || {}));
    return true;
  } catch (e) {
    console.warn('custom cover save failed:', e);
    return false;
  }
}
function isInlineCoverSrc(src) {
  return typeof src === 'string' && (
    /^data:image\//i.test(src) ||
    /^blob:/i.test(src) ||
    /^mineradio-local:\/\/cover\//i.test(src)
  );
}
function isProxyableCoverUrl(url) {
  return /^https?:\/\//i.test(String(url || ''));
}
function coverProxySrc(url, cacheBust) {
  if (!url) return '';
  if (isInlineCoverSrc(url)) return url;
  if (!isProxyableCoverUrl(url)) return '';
  return '/api/cover?url=' + encodeURIComponent(url) + (cacheBust ? '&v=' + Date.now() : '');
}
function coverUrlWithSize(url, size) {
  if (!url || isInlineCoverSrc(url) || !/^https?:\/\//i.test(url)) return url || '';
  if (!size) return url;
  var param = 'param=' + size + 'y' + size;
  if (/[?&]param=\d+y\d+/i.test(url)) return url.replace(/([?&])param=\d+y\d+/i, '$1' + param);
  return url + (url.indexOf('?') >= 0 ? '&' : '?') + param;
}
var COVER_REFRESH_MAX_CONCURRENT = 3;
var COVER_REFRESH_RETRY_MS = 60000;
var COVER_SIGNED_URL_SKEW_MS = 60000;
var coverRefreshStateByKey = Object.create(null);
var coverRefreshQueue = [];
var coverRefreshActiveCount = 0;
var coverFailureUntilByKey = Object.create(null);
var queueCoverRefreshRenderTimer = 0;
function songCustomCoverKey(song) {
  if (!song) return '';
  if (song.customCoverKey) return String(song.customCoverKey);
  if (song.provider === 'ai6666' || song.source === 'ai6666' || song.type === 'ai6666' || song.ai6666Id) return 'ai6666:' + (song.ai6666Id || song.providerSongId || song.id || (song.name + '|' + song.artist));
  if (song.provider === 'qq' || song.source === 'qq' || song.type === 'qq') return 'qq:' + (song.mid || song.songmid || song.id || (song.name + '|' + song.artist));
  if (song.provider === 'qishui' || song.source === 'qishui' || song.type === 'qishui') return 'qishui:' + (song.id || song.providerSongId || (song.name + '|' + song.artist));
  if (song.provider === 'kugou' || song.source === 'kugou' || song.type === 'kugou' || song.hash || song.audioHash) return 'kugou:' + (song.hash || song.fileHash || song.audioHash || song.id || (song.name + '|' + song.artist));
  if (song.localKey) return 'local:' + song.localKey;
  if (song.type === 'podcast' && song.programId) return 'podcast:' + song.programId;
  if (song.id != null && song.id !== '') return 'id:' + song.id;
  var title = String(song.name || song.title || '').trim();
  var artist = String(song.artist || '').trim();
  return (title || artist) ? ('meta:' + (title + '|' + artist).slice(0, 220)) : '';
}
function getCustomCoverForSong(song) {
  if (!song) return '';
  if (song.customCover) return song.customCover;
  var key = songCustomCoverKey(song);
  return key && customCoverMap[key] ? customCoverMap[key] : '';
}
function hydrateCustomCover(song) {
  if (!song) return song;
  var custom = getCustomCoverForSong(song);
  if (custom) song.customCover = custom;
  return song;
}
function isAi6666CoverSong(song) {
  return !!(song && (song.provider === 'ai6666' || song.source === 'ai6666' || song.type === 'ai6666' || song.ai6666Id));
}
function signedCoverExpiryMs(url) {
  if (!url || !/^https?:\/\//i.test(String(url))) return 0;
  try {
    var parsed = new URL(String(url), window.location && window.location.href ? window.location.href : 'http://127.0.0.1/');
    var signTime = String(parsed.searchParams.get('q-sign-time') || '');
    var expiresSeconds = Number(signTime.split(';')[1]);
    return Number.isFinite(expiresSeconds) && expiresSeconds > 0 ? expiresSeconds * 1000 : 0;
  } catch (e) {
    return 0;
  }
}
function coverSignedUrlNeedsRefresh(url, nowMs) {
  var expiryMs = signedCoverExpiryMs(url);
  return !!expiryMs && expiryMs <= (Number(nowMs) || Date.now()) + COVER_SIGNED_URL_SKEW_MS;
}
function queueCoverRequestKey(song, url) {
  return songCustomCoverKey(song) || String(url || '');
}
function scheduleQueueCoverRefreshRender() {
  if (queueCoverRefreshRenderTimer) return;
  queueCoverRefreshRenderTimer = setTimeout(function () {
    queueCoverRefreshRenderTimer = 0;
    if (typeof renderQueuePanel === 'function') renderQueuePanel({ scrollCurrent: false });
    else if (typeof renderMiniQueuePanel === 'function') renderMiniQueuePanel();
    if (typeof saveLastPlaybackSnapshot === 'function') saveLastPlaybackSnapshot(true, 'cover-refresh');
  }, 80);
}
function applyRefreshedAi6666Cover(key, requestedSong, cover) {
  if (requestedSong) requestedSong.cover = cover;
  if (Array.isArray(playQueue)) {
    playQueue.forEach(function (queuedSong) {
      if (songCustomCoverKey(queuedSong) === key) queuedSong.cover = cover;
    });
  }
  if (typeof currentLocalSong !== 'undefined' && currentLocalSong && songCustomCoverKey(currentLocalSong) === key) currentLocalSong.cover = cover;
  delete coverFailureUntilByKey[key];
  scheduleQueueCoverRefreshRender();
}
function finishAi6666CoverRefresh(job) {
  coverRefreshActiveCount = Math.max(0, coverRefreshActiveCount - 1);
  drainAi6666CoverRefreshQueue();
}
function runAi6666CoverRefresh(job) {
  job.status = 'pending';
  coverRefreshActiveCount += 1;
  apiJson('/api/ai6666/song/detail?id=' + encodeURIComponent(job.id), { timeoutMs: 12000, cache: 'no-store' }).then(function (data) {
    var cover = data && data.song ? String(data.song.cover || '') : '';
    if (!cover || coverSignedUrlNeedsRefresh(cover)) throw new Error('AI6666_COVER_REFRESH_INVALID');
    job.status = 'ready';
    job.url = cover;
    job.retryAt = 0;
    applyRefreshedAi6666Cover(job.key, job.song, cover);
  }).catch(function (error) {
    job.status = 'failed';
    job.retryAt = Date.now() + COVER_REFRESH_RETRY_MS;
    console.warn('[CoverRefresh]', job.key, error && error.message ? error.message : error);
  }).then(function () {
    finishAi6666CoverRefresh(job);
  });
}
function drainAi6666CoverRefreshQueue() {
  while (coverRefreshActiveCount < COVER_REFRESH_MAX_CONCURRENT && coverRefreshQueue.length) {
    var job = coverRefreshQueue.shift();
    if (!job || coverRefreshStateByKey[job.key] !== job || job.status !== 'queued') continue;
    runAi6666CoverRefresh(job);
  }
}
function scheduleAi6666CoverRefresh(song, reason) {
  if (!isAi6666CoverSong(song)) return false;
  var key = songCustomCoverKey(song);
  var id = song.ai6666Id || song.providerSongId || song.id || '';
  if (!key || !id) return false;
  var now = Date.now();
  var state = coverRefreshStateByKey[key];
  if (state && (state.status === 'queued' || state.status === 'pending')) return false;
  if (state && state.retryAt > now) return false;
  state = {
    key: key,
    id: String(id),
    song: song,
    reason: reason || 'expired',
    status: 'queued',
    retryAt: 0,
    url: state && state.url ? state.url : ''
  };
  coverRefreshStateByKey[key] = state;
  coverRefreshQueue.push(state);
  drainAi6666CoverRefreshQueue();
  return true;
}
function songCoverSrc(song, size) {
  var custom = getCustomCoverForSong(song);
  var raw = custom || (song && song.cover ? String(song.cover) : '');
  var key = queueCoverRequestKey(song, raw);
  if (isAi6666CoverSong(song)) {
    var refreshed = key && coverRefreshStateByKey[key] && coverRefreshStateByKey[key].url;
    if (refreshed && !coverSignedUrlNeedsRefresh(refreshed)) {
      raw = refreshed;
      song.cover = refreshed;
    }
    if (!raw || coverSignedUrlNeedsRefresh(raw)) {
      scheduleAi6666CoverRefresh(song, raw ? 'expired' : 'missing');
      return '';
    }
  }
  if (!raw || (key && coverFailureUntilByKey[key] > Date.now())) return '';
  var sized = coverUrlWithSize(raw, size);
  return isProxyableCoverUrl(sized) ? coverProxySrc(sized) : sized;
}
function handleQueueCoverImageError(img, queueIndex) {
  if (img) {
    img.onerror = null;
    img.removeAttribute('src');
    img.style.opacity = '0';
  }
  var song = Array.isArray(playQueue) ? playQueue[Number(queueIndex)] : null;
  if (!song) return false;
  var key = queueCoverRequestKey(song, song.cover);
  if (key) coverFailureUntilByKey[key] = Date.now() + COVER_REFRESH_RETRY_MS;
  return scheduleAi6666CoverRefresh(song, 'image-error');
}
function cssImageUrl(url) {
  return String(url || '').replace(/\\/g, '\\\\').replace(/"/g, '%22');
}
function setHomeArt(id, url, size) {
  var el = document.getElementById(id);
  if (!el) return;
  var src = url ? coverUrlWithSize(url, size || 260) : '';
  el.style.backgroundImage = src ? 'url("' + cssImageUrl(src) + '")' : '';
  el.classList.toggle('has-cover', !!src);
  el.classList.toggle('home-skeleton', !src && homeDiscoverState.loading);
}
function compactHomeCount(n) {
  n = Number(n) || 0;
  if (n >= 100000000) return (n / 100000000).toFixed(1).replace(/\.0$/, '') + '亿';
  if (n >= 10000) return Math.round(n / 10000) + '万';
  return n ? String(n) : '';
}
