function queueSong(song, opts) {
  opts = opts || {};
  if (!song) return -1;
  var cloned = cloneSong(song);
  var insertAt = playQueue.length;
  if (opts.position === 'next') {
    var key = queueItemKey(cloned);
    var existing = -1;
    if (key) {
      for (var i = 0; i < playQueue.length; i++) {
        if (queueItemKey(playQueue[i]) === key) { existing = i; break; }
      }
    }
    if (existing === currentIdx) return currentIdx;
    if (existing >= 0) {
      cloned = playQueue.splice(existing, 1)[0];
      if (currentIdx >= 0 && existing < currentIdx) currentIdx -= 1;
    }
    var hasCurrent = currentIdx >= 0 && currentIdx < playQueue.length;
    insertAt = hasCurrent ? Math.min(playQueue.length, currentIdx + 1) : playQueue.length;
    playQueue.splice(insertAt, 0, cloned);
  } else {
    playQueue.push(cloned);
    insertAt = playQueue.length - 1;
  }
  safeRenderQueuePanel('queue-song');
  safeShelfRebuild('queue-song');
  return insertAt;
}
function queueSongNext(song) {
  return queueSong(song, { position: 'next' });
}
function queueSearchResult(i) {
  var song = playlist[i]; if (!song) return;
  queueSongNext(song);
  showToast('已设为下一首: ' + song.name);
}
function queueDetailSongNext(song) {
  if (!song || song.type === 'podcast-radio') return;
  queueSongNext(song);
  showToast('已设为下一首: ' + (song.name || ''));
}
function queueIndexNext(i) {
  i = Number(i);
  if (!isFinite(i) || i < 0 || i >= playQueue.length) return;
  var song = playQueue[i];
  queueSongNext(song);
  showToast('已设为下一首: ' + (song && song.name ? song.name : ''));
}
function openQueueArtist(i) {
  var song = playQueue && playQueue[i];
  if (song) openArtistDetailForSong(song);
}
function moveQueueIndexToTop(idx) {
  idx = Number(idx);
  if (!isFinite(idx) || idx < 0 || idx >= playQueue.length) return -1;
  if (idx === 0) return 0;
  var item = playQueue.splice(idx, 1)[0];
  playQueue.unshift(item);
  if (currentIdx === idx) currentIdx = 0;
  else if (currentIdx >= 0 && currentIdx < idx) currentIdx += 1;
  return 0;
}
function moveQueueIndex(fromIdx, toIdx, opts) {
  opts = opts || {};
  fromIdx = Math.round(Number(fromIdx));
  toIdx = Math.round(Number(toIdx));
  if (!playQueue.length) return false;
  if (!isFinite(fromIdx) || !isFinite(toIdx)) return false;
  if (fromIdx < 0 || fromIdx >= playQueue.length) return false;
  toIdx = Math.max(0, Math.min(playQueue.length - 1, toIdx));
  if (fromIdx === toIdx) return false;
  var currentSong = currentIdx >= 0 && currentIdx < playQueue.length ? playQueue[currentIdx] : null;
  var item = playQueue.splice(fromIdx, 1)[0];
  playQueue.splice(toIdx, 0, item);
  if (currentSong) {
    var nextCurrentIdx = playQueue.indexOf(currentSong);
    currentIdx = nextCurrentIdx >= 0 ? nextCurrentIdx : Math.min(currentIdx, playQueue.length - 1);
  } else {
    currentIdx = -1;
  }
  if (opts.renderPanel !== false) safeRenderQueuePanel('queue-reorder', { animate: false, scrollCurrent: false, deferWhenHidden: false });
  if (opts.rebuildShelf !== false) safeShelfRebuild('queue-reorder', true);
  if (opts.persistSnapshot !== false && typeof saveLastPlaybackSnapshot === 'function') saveLastPlaybackSnapshot(true, 'queue-reorder');
  return true;
}
function playSearchResult(i) {
  var song = playlist[i]; if (!song) return;
  homeForcedOpen = false;
  homeSuppressed = false;
  setHomeControlsLocked(false);
  if (!playQueue.length) { playQueue.unshift(cloneSong(song)); currentIdx = 0; }
  else {
    var matchIdx = -1;
    var targetKey = queueItemKey(song);
    for (var j = 0; j < playQueue.length; j++) if (queueItemKey(playQueue[j]) === targetKey) { matchIdx = j; break; }
    if (matchIdx >= 0) currentIdx = moveQueueIndexToTop(matchIdx);
    else { playQueue.unshift(cloneSong(song)); currentIdx = 0; }
  }
  $results.classList.remove('show');
  $input.value = ''; $input.blur();
  playQueueAt(currentIdx);
}

// ============================================================
//  歌单队列排序 / 置顶置底 / 本地持久化
//  (P0-② 歌单顺序自定义；排序只存本地，不写回服务器)
// ============================================================
function moveQueueIndexToBottom(idx) {
  idx = Number(idx);
  if (!isFinite(idx) || idx < 0 || idx >= playQueue.length) return -1;
  if (idx === playQueue.length - 1) return idx;
  var item = playQueue.splice(idx, 1)[0];
  playQueue.push(item);
  if (currentIdx === idx) currentIdx = playQueue.length - 1;
  else if (currentIdx > idx) currentIdx -= 1;
  return playQueue.length - 1;
}
function playlistOrderStoreKeyFor(provider, id) {
  provider = String(provider || 'netease');
  id = String(id == null ? '' : id);
  return id ? (provider + ':' + id) : '';
}
function playlistOrderStoreKeyFromHydration() {
  var st = queueHydrationState;
  if (!st || !st.playlistId) return '';
  var raw = String(st.playlistId || '');
  var provider = String(st.provider || '');
  if (!provider) {
    if (raw.indexOf('qq:') === 0) provider = 'qq';
    else if (raw.indexOf('kugou:') === 0) provider = 'kugou';
    else if (raw.indexOf('qishui:') === 0) provider = 'qishui';
    else if (raw.indexOf('spotify:') === 0) provider = 'spotify';
    else provider = 'netease';
  }
  var id = raw;
  var prefix = provider + ':';
  if (raw.indexOf(prefix) === 0) id = raw.slice(prefix.length);
  return playlistOrderStoreKeyFor(provider, id);
}
function readPlaylistOrderMap() {
  try {
    var raw = localStorage.getItem(PLAYLIST_ORDER_STORE_KEY);
    var map = raw ? JSON.parse(raw) : {};
    return map && typeof map === 'object' ? map : {};
  } catch (e) {
    return {};
  }
}
function savePlaylistOrderForCurrentQueue(reason) {
  var st = queueHydrationState;
  if (!st || st.queueRef !== playQueue || !st.playlistId) return false;
  var key = playlistOrderStoreKeyFromHydration();
  if (!key || !playQueue.length) return false;
  var ids = [];
  for (var i = 0; i < playQueue.length; i++) {
    var trackKey = queueItemKey(playQueue[i]);
    if (trackKey) ids.push(trackKey);
  }
  if (ids.length < 2) return false;
  var map = readPlaylistOrderMap();
  map[key] = ids;
  try {
    localStorage.setItem(PLAYLIST_ORDER_STORE_KEY, JSON.stringify(map));
    return true;
  } catch (e) {
    return false;
  }
}
function applyPlaylistOrderToTracks(tracks, provider, id) {
  if (!Array.isArray(tracks) || tracks.length < 2) return tracks;
  var key = playlistOrderStoreKeyFor(provider, id);
  if (!key) return tracks;
  var map = readPlaylistOrderMap();
  var ids = map[key];
  if (!Array.isArray(ids) || ids.length < 2) return tracks;
  var rank = {};
  ids.forEach(function (trackKey, rankIdx) { rank[trackKey] = rankIdx; });
  var hasRanked = false;
  tracks.forEach(function (song) {
    var trackKey = queueItemKey(song);
    if (trackKey && rank[trackKey] != null) hasRanked = true;
  });
  if (!hasRanked) return tracks;
  return tracks.map(function (song, idx) {
    var trackKey = queueItemKey(song);
    return { song: song, idx: idx, rank: trackKey ? rank[trackKey] : null };
  }).sort(function (a, b) {
    var ah = a.rank != null, bh = b.rank != null;
    if (ah && bh) return a.rank - b.rank;
    if (ah) return -1;
    if (bh) return 1;
    return a.idx - b.idx;
  }).map(function (entry) { return entry.song; });
}
function queueSortStrCompare(a, b) {
  a = String(a == null ? '' : a);
  b = String(b == null ? '' : b);
  try {
    return a.localeCompare(b, 'zh-Hans-CN', { numeric: true });
  } catch (e) {
    return a < b ? -1 : (a > b ? 1 : 0);
  }
}
function queueSortDurationMs(song) {
  song = song || {};
  var ms = Number(song.durationMs != null ? song.durationMs : song.dt) || 0;
  if (ms > 0) return ms;
  return Number(song.duration) || 0;
}
function makeQueueSortCompare(mode) {
  if (mode === 'artist') {
    return function (a, b) { return queueSortStrCompare(a.artist, b.artist) || queueSortStrCompare(a.name, b.name); };
  }
  if (mode === 'duration') {
    return function (a, b) { return (queueSortDurationMs(a) - queueSortDurationMs(b)) || queueSortStrCompare(a.name, b.name); };
  }
  return function (a, b) { return queueSortStrCompare(a.name, b.name); };
}
function queueSortModeLabel(mode) {
  return { title: '已按标题排序队列', artist: '已按歌手排序队列', duration: '已按时长排序队列', random: '已随机排序队列' }[mode] || '队列已重排';
}
function sortQueueBy(mode) {
  mode = String(mode || '');
  if (!playQueue.length) return false;
  if (playQueue.length < 2) {
    showToast('队列不足两首，无需排序');
    return false;
  }
  var currentSong = currentIdx >= 0 && currentIdx < playQueue.length ? playQueue[currentIdx] : null;
  if (mode === 'random') {
    shuffleArrayInPlace(playQueue);
  } else {
    var sorted = playQueue.slice().sort(makeQueueSortCompare(mode));
    playQueue.length = 0;
    Array.prototype.push.apply(playQueue, sorted);
  }
  if (currentSong) {
    var nextCurrentIdx = playQueue.indexOf(currentSong);
    currentIdx = nextCurrentIdx >= 0 ? nextCurrentIdx : Math.max(0, Math.min(currentIdx, playQueue.length - 1));
  } else {
    currentIdx = -1;
  }
  queueSortMode = mode || 'title';
  safeRenderQueuePanel('queue-sort-' + mode, { animate: true, scrollCurrent: true, deferWhenHidden: false });
  safeShelfRebuild('queue-sort-' + mode, true);
  if (typeof saveLastPlaybackSnapshot === 'function') saveLastPlaybackSnapshot(true, 'queue-sort-' + mode);
  savePlaylistOrderForCurrentQueue('queue-sort-' + mode);
  if (typeof updateQueueSortToolbarActive === 'function') updateQueueSortToolbarActive();
  showToast(queueSortModeLabel(mode));
  return true;
}
function moveCurrentQueueSongToTop() {
  if (!playQueue.length) return -1;
  if (currentIdx <= 0) {
    if (currentIdx === 0) showToast('当前曲已在队列首位');
    return currentIdx;
  }
  var to = moveQueueIndexToTop(currentIdx);
  if (to !== 0) return currentIdx;
  safeRenderQueuePanel('queue-current-top', { animate: true, scrollCurrent: true, deferWhenHidden: false });
  safeShelfRebuild('queue-current-top', true);
  if (typeof saveLastPlaybackSnapshot === 'function') saveLastPlaybackSnapshot(true, 'queue-current-top');
  savePlaylistOrderForCurrentQueue('queue-current-top');
  showToast('当前曲已移到队列首位');
  return 0;
}
function moveCurrentQueueSongToBottom() {
  if (!playQueue.length) return -1;
  if (currentIdx >= playQueue.length - 1) {
    if (currentIdx >= 0) showToast('当前曲已在队列队尾');
    return currentIdx;
  }
  var to = moveQueueIndexToBottom(currentIdx);
  if (to < 0) return currentIdx;
  safeRenderQueuePanel('queue-current-bottom', { animate: true, scrollCurrent: true, deferWhenHidden: false });
  safeShelfRebuild('queue-current-bottom', true);
  if (typeof saveLastPlaybackSnapshot === 'function') saveLastPlaybackSnapshot(true, 'queue-current-bottom');
  savePlaylistOrderForCurrentQueue('queue-current-bottom');
  showToast('当前曲已移到队列队尾');
  return to;
}
