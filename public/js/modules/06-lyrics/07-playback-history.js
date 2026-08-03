// ============================================================
// 播放历史 + 一键恢复 (07-playback-history.js)
// - 记录每首开始播放的歌曲到 localStorage（mineradio-playback-history-v1）
// - 最多保留 50 条；60 秒内同一首歌不重复记录
// - 进度每 10 秒（或切歌时）写入最新条目的 progress 字段
// - 「最近播放」面板：最近播放列表 + 一键恢复上次播放 + 清空
// 由 05-playback/13-playback-start-audio.js 播放成功路径调用 recordPlaybackHistory(song)
var PLAYBACK_HISTORY_STORE_KEY = 'mineradio-playback-history-v1';
var PLAYBACK_HISTORY_LIMIT = 50;
var PLAYBACK_HISTORY_DEDUPE_MS = 60000;
var PLAYBACK_HISTORY_PROGRESS_TICK_MS = 10000;
var playbackHistoryCache = null;
var playbackHistoryProgressTimer = null;

function playbackHistoryCurrentSeconds() {
  try {
    if (typeof getPlaybackCurrentSeconds === 'function') return getPlaybackCurrentSeconds();
    return audio && isFinite(audio.currentTime) && audio.currentTime > 0 ? audio.currentTime : 0;
  } catch (e) { return 0; }
}

function playbackHistoryPlayingNow() {
  try { return !!(audio && !audio.paused && !audio.ended); } catch (e) { return false; }
}

function playbackHistorySongKey(song) {
  if (!song || typeof song !== 'object') return '';
  try {
    if (typeof queueItemKey === 'function') {
      var key = queueItemKey(song);
      if (key) return key;
    }
  } catch (e) { }
  return String(song.provider || '') + ':' + String(song.id || song.mid || song.hash || song.programId || song.localKey || ((song.name || '') + '|' + (song.artist || '')));
}

function playbackHistorySongSnapshot(song) {
  if (!song || typeof song !== 'object') return {};
  var snap = {};
  [
    'provider', 'source', 'type', 'id', 'mid', 'songmid', 'mediaMid', 'media_mid', 'qqId',
    'spotifyId', 'spotifyUri', 'spotifyUrl', 'uri',
    'hash', 'fileHash', 'audioHash', 'albumId', 'album_id', 'albumMid', 'albummid',
    'name', 'title', 'artist', 'album', 'cover', 'picUrl', 'duration', 'durationMs', 'dt',
    'programId', 'radioId', 'radioName', 'localKey', 'localFileId', 'localUrl'
  ].forEach(function (key) {
    if (song[key] != null && song[key] !== '') snap[key] = song[key];
  });
  if (Array.isArray(song.artists)) snap.artists = song.artists.slice(0, 6);
  return snap;
}

function playbackHistoryRead() {
  if (playbackHistoryCache) return playbackHistoryCache;
  try {
    var raw = JSON.parse(localStorage.getItem(PLAYBACK_HISTORY_STORE_KEY) || 'null');
    if (raw && raw.version === 1 && Array.isArray(raw.entries)) {
      playbackHistoryCache = raw;
      return raw;
    }
  } catch (e) { }
  playbackHistoryCache = { version: 1, savedAt: 0, entries: [] };
  return playbackHistoryCache;
}

function playbackHistoryWrite() {
  try {
    localStorage.setItem(PLAYBACK_HISTORY_STORE_KEY, JSON.stringify(playbackHistoryCache));
  } catch (e) { }
}

// 播放钩子：每首成功开始播放的歌曲都会走到这里
function playbackHistoryRecord(song) {
  if (!song || typeof song !== 'object') return;
  var history = playbackHistoryRead();
  var now = Date.now();
  var snap = playbackHistorySongSnapshot(song);
  if (!snap || (!snap.id && !snap.mid && !snap.hash && !snap.programId && !snap.localKey && !snap.name)) return;
  var key = playbackHistorySongKey(snap);
  var entries = history.entries;
  var latest = entries && entries[0];
  if (latest && key && latest.key && latest.key === key) {
    // 同一首歌：60 秒内不重复记录；仅刷新时间（进度由 10 秒 ticker 持续写入）
    latest.time = now;
  } else {
    if (latest && playbackHistoryPlayingNow()) {
      // 切歌前把当前播放进度写入上一条历史
      latest.progress = Math.max(Number(latest.progress) || 0, playbackHistoryCurrentSeconds());
    }
    entries.unshift({ time: now, key: key || '', progress: 0, song: snap });
  }
  if (entries.length > PLAYBACK_HISTORY_LIMIT) entries.length = PLAYBACK_HISTORY_LIMIT;
  history.savedAt = now;
  playbackHistoryWrite();
  playbackHistoryEnsureProgressTicker();
  playbackHistoryRender();
}

// 供 05-playback/13-playback-start-audio.js 播放成功路径调用（typeof 守卫在调用方）
function recordPlaybackHistory(song) {
  playbackHistoryRecord(song);
}

function playbackHistoryEnsureProgressTicker() {
  if (playbackHistoryProgressTimer) return;
  playbackHistoryProgressTimer = setInterval(playbackHistoryProgressTick, PLAYBACK_HISTORY_PROGRESS_TICK_MS);
}

function playbackHistoryProgressTick() {
  try {
    var history = playbackHistoryRead();
    var latest = history.entries && history.entries[0];
    if (!latest || !playbackHistoryPlayingNow()) return;
    var song = typeof currentCoverSong === 'function' ? currentCoverSong() : null;
    if (!song || !latest.key || latest.key !== playbackHistorySongKey(song)) return;
    latest.progress = Math.max(Number(latest.progress) || 0, playbackHistoryCurrentSeconds());
    history.savedAt = Date.now();
    playbackHistoryWrite();
  } catch (e) { }
}

// ---- UI ----
function playbackHistoryFormatRelativeTime(ts) {
  ts = Number(ts) || 0;
  var diff = Date.now() - ts;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
  if (diff < 2592000000) return Math.floor(diff / 86400000) + ' 天前';
  var d = new Date(ts);
  return (d.getMonth() + 1) + '月' + d.getDate() + '日';
}

function playbackHistoryFormatProgress(sec) {
  sec = Math.max(0, Number(sec) || 0);
  if (typeof formatProgramTime === 'function') {
    try { return formatProgramTime(sec); } catch (e) { }
  }
  var m = Math.floor(sec / 60);
  var s = Math.floor(sec % 60);
  return m + ':' + (s < 10 ? '0' : '') + s;
}

function playbackHistoryEntryCover(entry) {
  var song = entry && entry.song;
  if (!song) return '';
  try {
    var hydrated = typeof hydrateCustomCover === 'function' ? hydrateCustomCover(Object.assign({}, song)) : song;
    if (typeof songCoverSrc === 'function') return songCoverSrc(hydrated, 200) || '';
    var raw = hydrated.customCover || hydrated.cover || hydrated.picUrl || '';
    if (typeof coverUrlWithSize === 'function') return coverUrlWithSize(raw, 200);
    return raw;
  } catch (e) { return ''; }
}

function playbackHistoryRender() {
  var list = document.getElementById('playback-history-list');
  if (!list) return;
  var history = playbackHistoryRead();
  var entries = history.entries || [];
  list.innerHTML = '';
  if (!entries.length) {
    var empty = document.createElement('div');
    empty.style.cssText = 'padding:22px 0;text-align:center;font-size:12px;color:rgba(255,255,255,.42)';
    empty.textContent = '暂无播放记录';
    list.appendChild(empty);
    updatePlaybackHistoryRestoreButton();
    return;
  }
  var fragment = document.createDocumentFragment();
  entries.forEach(function (entry, i) {
    var song = entry.song || {};
    var name = String(song.name || song.title || '未知歌曲');
    var artist = String(song.artist || '未知歌手');
    var timeText = playbackHistoryFormatRelativeTime(entry.time);
    var progress = Math.max(0, Number(entry.progress) || 0);
    var coverSrc = playbackHistoryEntryCover(entry);

    var item = document.createElement('div');
    item.className = 'playback-history-item';
    item.setAttribute('data-history-index', String(i));
    item.style.cssText = 'display:flex;align-items:center;gap:9px;padding:7px 8px;border-radius:10px;cursor:pointer;transition:background .16s;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06)';
    item.title = progress > 0 ? ('从 ' + playbackHistoryFormatProgress(progress) + ' 继续播放') : '播放 ' + name;

    var coverWrap = document.createElement('div');
    coverWrap.style.cssText = 'width:40px;height:40px;border-radius:8px;overflow:hidden;flex:0 0 auto;background:rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center';
    if (coverSrc) {
      var img = document.createElement('img');
      img.alt = '';
      img.loading = 'lazy';
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
      img.src = coverSrc;
      img.onerror = function () { img.style.display = 'none'; };
      coverWrap.appendChild(img);
    } else {
      var note = document.createElement('span');
      note.style.cssText = 'color:rgba(255,255,255,.34);font-size:16px;line-height:1';
      note.textContent = '♪';
      coverWrap.appendChild(note);
    }

    var meta = document.createElement('div');
    meta.style.cssText = 'flex:1;min-width:0;display:flex;flex-direction:column;gap:2px';
    var titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-size:12px;color:rgba(255,255,255,.9);white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    titleEl.textContent = name;
    var artistEl = document.createElement('div');
    artistEl.style.cssText = 'font-size:10px;color:rgba(255,255,255,.48);white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    artistEl.textContent = progress > 0 ? (artist + ' · 播至 ' + playbackHistoryFormatProgress(progress)) : artist;
    meta.appendChild(titleEl);
    meta.appendChild(artistEl);

    var timeEl = document.createElement('div');
    timeEl.style.cssText = 'font-size:10px;color:rgba(255,255,255,.42);flex:0 0 auto;white-space:nowrap';
    timeEl.textContent = timeText;

    item.appendChild(coverWrap);
    item.appendChild(meta);
    item.appendChild(timeEl);
    item.addEventListener('mouseenter', (function (el) { return function () { el.style.background = 'rgba(255,255,255,.09)'; }; })(item));
    item.addEventListener('mouseleave', (function (el) { return function () { el.style.background = 'rgba(255,255,255,.03)'; }; })(item));
    item.addEventListener('click', (function (entryRef) { return function () { restorePlaybackHistoryEntry(entryRef); }; })(entry));
    fragment.appendChild(item);
  });
  list.appendChild(fragment);
  updatePlaybackHistoryRestoreButton();
}

function updatePlaybackHistoryRestoreButton() {
  var btn = document.getElementById('playback-history-restore-btn');
  if (!btn) return;
  var history = playbackHistoryRead();
  var has = !!(history.entries && history.entries.length);
  btn.disabled = !has;
  btn.style.opacity = has ? '1' : '.45';
  btn.style.cursor = has ? 'pointer' : 'not-allowed';
}

function closePlaybackHistoryPanel() {
  var wrap = document.getElementById('playback-history-control');
  if (wrap) wrap.classList.remove('open');
}

// 恢复播放：队列可定位则直接播，否则播单曲；带进度恢复（resumeAt 交给 playQueueAt 处理）
function restorePlaybackHistoryEntry(entry) {
  try {
    if (!entry || !entry.song) return false;
    if (typeof playQueueAt !== 'function') return false;
    var song = typeof hydrateCustomCover === 'function'
      ? hydrateCustomCover(Object.assign({}, entry.song))
      : Object.assign({}, entry.song);
    var targetKey = playbackHistorySongKey(song);
    var idx = -1;
    if (Array.isArray(playQueue) && playQueue.length) {
      for (var i = 0; i < playQueue.length; i++) {
        if (playQueue[i] && playbackHistorySongKey(playQueue[i]) === targetKey) { idx = i; break; }
      }
    }
    var isLocal = !!(song.type === 'local' || song.localKey || song.localFileId || song.localUrl);
    if (isLocal && !song.localUrl && idx >= 0 && playQueue[idx] && playQueue[idx].localUrl) {
      song.localUrl = playQueue[idx].localUrl;
    }
    if (isLocal && !song.localUrl) {
      if (typeof showToast === 'function') showToast('上次播放的是本地文件，请重新导入后继续');
      closePlaybackHistoryPanel();
      return false;
    }
    if (idx < 0) {
      if (!Array.isArray(playQueue)) playQueue = [];
      playQueue.push(song);
      idx = playQueue.length - 1;
    }
    var resumeAt = Math.max(0, Number(entry.progress) || 0);
    var result = playQueueAt(idx, { manual: true, resumeAt: resumeAt });
    if (result && typeof result.then === 'function') {
      result.then(function (ok) {
        if (ok && typeof showToast === 'function') {
          showToast(resumeAt > 0
            ? ('已恢复播放：' + (song.name || '') + '（' + playbackHistoryFormatProgress(resumeAt) + '）')
            : ('已开始播放：' + (song.name || '')));
        }
      });
    }
    closePlaybackHistoryPanel();
    return true;
  } catch (e) {
    console.warn('[PlaybackHistory] restore failed', e);
    return false;
  }
}

function restorePlaybackHistoryLatest() {
  var history = playbackHistoryRead();
  if (!history.entries || !history.entries.length) {
    if (typeof showToast === 'function') showToast('暂无播放记录');
    return;
  }
  restorePlaybackHistoryEntry(history.entries[0]);
}

function clearPlaybackHistory() {
  playbackHistoryCache = { version: 1, savedAt: Date.now(), entries: [] };
  playbackHistoryWrite();
  playbackHistoryRender();
  if (typeof showToast === 'function') showToast('播放历史已清空');
}

function togglePlaybackHistoryPanel(e) {
  if (e) e.stopPropagation();
  var wrap = document.getElementById('playback-history-control');
  if (!wrap) return;
  if (!wrap.classList.contains('open') && typeof closeVolumePanel === 'function') {
    try { closeVolumePanel(true); } catch (err) { }
  }
  playbackHistoryRender();
  wrap.classList.toggle('open');
}

function buildPlaybackHistoryControl() {
  if (document.getElementById('playback-history-control')) return;
  // 用户要求：最近播放入口从状态栏 modes 区移入左侧播放列表面板的"我的歌单"工具栏行（pl-pane queue-toolbar）
  var plToolbar = document.querySelector('#pl-pane .queue-toolbar');
  if (!plToolbar) return;

  var wrap = document.createElement('div');
  wrap.id = 'playback-history-control';
  wrap.className = 'volume-control';

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'playback-history-btn';
  btn.className = 'ctrl-btn';
  btn.title = '最近播放';
  btn.setAttribute('aria-label', '最近播放');
  btn.innerHTML = '<svg width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true">'
    + '<circle cx="12" cy="12" r="9"/>'
    + '<path d="M12 7v5l3.2 1.8"/>'
    + '</svg>';

  var pop = document.createElement('div');
  pop.id = 'playback-history-popover';
  pop.className = 'volume-popover';
  // 位于左侧面板工具栏内：改为向下弹出（覆盖 volume-popover 的 bottom 定位），
  // 右对齐（wrap 在 toolbar 最右端，left:0 会让 280px 宽 popover 右缘被面板裁剪）
  pop.style.top = 'calc(100% + 8px)';
  pop.style.bottom = 'auto';
  pop.style.left = 'auto';
  pop.style.right = '0';
  pop.style.transform = 'none';
  pop.style.width = '280px';
  pop.style.maxHeight = 'min(430px, calc(100vh - 220px))';
  pop.style.overflowY = 'auto';
  pop.addEventListener('click', function (e) { e.stopPropagation(); });

  var head = document.createElement('div');
  head.style.cssText = 'display:flex;align-items:center;gap:8px;padding-bottom:2px';
  var title = document.createElement('span');
  title.textContent = '最近播放';
  title.style.cssText = 'font-size:12px;font-weight:600;color:rgba(255,255,255,.85);white-space:nowrap';
  var actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:5px;flex:1;min-width:0;justify-content:flex-end';
  var restoreBtn = document.createElement('button');
  restoreBtn.type = 'button';
  restoreBtn.id = 'playback-history-restore-btn';
  restoreBtn.textContent = '恢复上次播放';
  restoreBtn.title = '一键恢复最近播放的歌曲与进度';
  var clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.id = 'playback-history-clear-btn';
  clearBtn.textContent = '清空';
  clearBtn.title = '清空全部播放历史';
  [restoreBtn, clearBtn].forEach(function (b) {
    b.style.cssText = 'font-size:11px;color:rgba(255,255,255,.8);background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:3px 8px;cursor:pointer;white-space:nowrap;transition:background .16s,border-color .16s,color .16s';
    actions.appendChild(b);
  });
  head.appendChild(title);
  head.appendChild(actions);
  pop.appendChild(head);

  var list = document.createElement('div');
  list.id = 'playback-history-list';
  list.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-top:8px;max-height:min(430px, calc(100vh - 220px));overflow-y:auto;padding-right:2px';
  pop.appendChild(list);

  wrap.appendChild(btn);
  wrap.appendChild(pop);
  plToolbar.appendChild(wrap);

  btn.addEventListener('click', togglePlaybackHistoryPanel);
  restoreBtn.addEventListener('click', function (e) { if (e) e.stopPropagation(); restorePlaybackHistoryLatest(); });
  clearBtn.addEventListener('click', function (e) { if (e) e.stopPropagation(); clearPlaybackHistory(); });
}

function bindPlaybackHistoryDismiss() {
  if (document._mineradioPlaybackHistoryDismissBound) return;
  document._mineradioPlaybackHistoryDismissBound = true;
  document.addEventListener('pointerdown', function (e) {
    var wrap = document.getElementById('playback-history-control');
    if (!wrap) return;
    if (wrap.classList.contains('open') && !wrap.contains(e.target)) wrap.classList.remove('open');
  }, true);
}

// 自执行初始化（try/catch 防护，失败不中断模块链）
function initPlaybackHistory() {
  try {
    buildPlaybackHistoryControl();
    playbackHistoryEnsureProgressTicker();
    playbackHistoryRender();
    bindPlaybackHistoryDismiss();
  } catch (e) {
    console.warn('[PlaybackHistory] init failed', e);
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPlaybackHistory);
else initPlaybackHistory();
