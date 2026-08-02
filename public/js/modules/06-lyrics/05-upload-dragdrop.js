// ============================================================
var AUDIO_UPLOAD_EXT_RE = /\.(mp3|flac|wav|ogg|m4a|aac|opus)$/i;
var IMAGE_UPLOAD_EXT_RE = /\.(jpg|jpeg|png|webp)$/i;
var PLAYLIST_UPLOAD_EXT_RE = /\.(m3u|m3u8|pls)$/i;
function isPlaylistUploadFile(file) {
  if (!file) return false;
  return PLAYLIST_UPLOAD_EXT_RE.test(file.name || '');
}
function sortedPlaylistUploadFiles(files) {
  return Array.prototype.slice.call(files || [])
    .filter(isPlaylistUploadFile)
    .sort(function (a, b) {
      return uploadFileSortKey(a).localeCompare(uploadFileSortKey(b), 'zh-CN', { numeric: true, sensitivity: 'base' });
    });
}
function isAudioUploadFile(file) {
  if (!file) return false;
  return /^audio\//i.test(file.type || '') || AUDIO_UPLOAD_EXT_RE.test(file.name || '');
}
function isImageUploadFile(file) {
  if (!file) return false;
  return /^image\//i.test(file.type || '') || IMAGE_UPLOAD_EXT_RE.test(file.name || '');
}
function uploadFileSortKey(file) {
  return String((file && (file.webkitRelativePath || file.name)) || '').toLowerCase();
}
function sortedAudioUploadFiles(files) {
  return Array.prototype.slice.call(files || [])
    .filter(isAudioUploadFile)
    .sort(function (a, b) {
      return uploadFileSortKey(a).localeCompare(uploadFileSortKey(b), 'zh-CN', { numeric: true, sensitivity: 'base' });
    });
}
function firstImageUploadFile(files) {
  var list = Array.prototype.slice.call(files || []);
  for (var i = 0; i < list.length; i++) if (isImageUploadFile(list[i])) return list[i];
  return null;
}
function localSongFromAudioFile(file) {
  var rel = String(file.webkitRelativePath || file.name || '');
  var filename = String(file.name || rel || '本地音乐');
  var title = filename.replace(/\.[^.]+$/, '');
  return hydrateCustomCover({
    type: 'local',
    source: 'local',
    provider: 'local',
    name: title || '本地音乐',
    artist: '本地文件',
    album: rel && rel !== filename ? rel.split(/[\\/]/).slice(0, -1).join(' / ') : '',
    localKey: [rel || filename, file.size || 0, file.lastModified || 0].join(':'),
    localUrl: URL.createObjectURL(file),
    localPath: rel,
    duration: 0
  });
}
function canUsePersistentLocalMusicLibrary() {
  return !!(
    window.desktopWindow &&
    typeof window.desktopWindow.importLocalMusicFiles === 'function'
  );
}
async function importPersistentLocalAudioFiles(files) {
  if (!canUsePersistentLocalMusicLibrary()) return null;
  var selectedFiles = Array.prototype.slice.call(files || []);
  if (!selectedFiles.length) return null;
  var result = await window.desktopWindow.importLocalMusicFiles(selectedFiles);
  if (!result || result.ok !== true || !Array.isArray(result.tracks) || !result.tracks.length) {
    throw new Error(result && result.error || 'LOCAL_LIBRARY_IMPORT_FAILED');
  }
  return result;
}
function isLocalPlaybackSnapshot(snapshot) {
  var song = snapshot && snapshot.current;
  return !!(song && (song.type === 'local' || song.source === 'local' || song.localKey || song.localFileId));
}
function restoredLocalTrackIndex(tracks, snapshot) {
  var current = snapshot && snapshot.current || {};
  var localId = String(current.localFileId || current.localKey || '').replace(/^local:/, '');
  if (localId) {
    for (var i = 0; i < tracks.length; i++) {
      var songId = String(tracks[i].localFileId || tracks[i].localKey || '').replace(/^local:/, '');
      if (songId === localId) return i;
    }
    return -1;
  }
  var fallback = Number(snapshot && snapshot.currentIdx);
  return isFinite(fallback) && fallback >= 0 && fallback < tracks.length ? Math.round(fallback) : 0;
}
async function restorePersistedLocalLibrary() {
  if (!window.desktopWindow || typeof window.desktopWindow.listLocalMusicLibrary !== 'function') return false;
  var snapshotAtRequest = restoredLastPlaybackSnapshot;
  var queueAtRequest = playQueue;
  var indexAtRequest = currentIdx;
  var localSongAtRequest = currentLocalSong;
  var result;
  try { result = await window.desktopWindow.listLocalMusicLibrary(); } catch (e) { return false; }
  if (!result || result.ok !== true || !Array.isArray(result.tracks)) return false;
  var tracks = result.tracks.map(function (song) {
    var copy = hydrateCustomCover(Object.assign({}, song));
    copy.localMissing = false;
    return copy;
  }).filter(function (song) { return song && song.localUrl && song.localKey; });
  persistentLocalLibraryTracks = tracks.map(cloneSong);
  var snapshot = snapshotAtRequest;
  if (snapshot && !isLocalPlaybackSnapshot(snapshot)) return false;
  if (
    restoredLastPlaybackSnapshot !== snapshotAtRequest
    || playQueue !== queueAtRequest
    || currentIdx !== indexAtRequest
    || currentLocalSong !== localSongAtRequest
  ) return false;
  if (snapshot) {
    var restoredIndex = restoredLocalTrackIndex(tracks, snapshot);
    if (restoredIndex < 0 || !tracks[restoredIndex]) {
      playQueue = tracks;
      currentIdx = -1;
      currentLocalSong = null;
      pendingPlaybackResumeAt = 0;
      restoredLastPlaybackSnapshot = null;
      startupRestoreHomePending = false;
      try { localStorage.removeItem(LAST_PLAYBACK_STORE_KEY); } catch (e) { }
      applyRestoredPlaybackProgressUi({ currentTime: 0, duration: 0, current: null });
      safeRenderQueuePanel('local-library-missing');
      updateEmptyHomeVisibility({ forceLoad: false });
      return false;
    }
    currentIdx = restoredIndex;
  } else {
    currentIdx = -1;
  }
  playQueue = tracks;
  currentLocalSong = null;
  if (!snapshot) {
    safeRenderQueuePanel('local-library-restore');
    updateEmptyHomeVisibility({ forceLoad: false });
    return false;
  }
  var current = playQueue[currentIdx];
  if (!current) return false;
  snapshot.current = playbackRestoreSongSnapshot(current);
  snapshot.current.localMissing = false;
  updateControlTrackInfo(current);
  var titleEl = document.getElementById('thumb-title');
  var artistEl = document.getElementById('thumb-artist');
  if (titleEl) titleEl.textContent = current.name || current.title || '本地音乐';
  if (artistEl) artistEl.textContent = current.artist || '本地文件';
  var thumbWrap = document.getElementById('thumb-wrap');
  if (thumbWrap) thumbWrap.classList.add('visible');
  if (current.cover) {
    setTimeout(function () {
      if (!audio && currentIdx >= 0 && playQueue[currentIdx] && queueItemKey(playQueue[currentIdx]) === queueItemKey(current)) {
        loadCoverFromUrl(songCoverSrc(current, 400), { deferHeavy: true, delay: 120, timeout: 700 });
      }
    }, 180);
  }
  safeRenderQueuePanel('local-library-restore', { scrollCurrent: miniQueueOpen });
  updateEmptyHomeVisibility({ forceLoad: false });
  return true;
}
function loadPersistedLocalLibraryIntoQueue() {
  if (!Array.isArray(persistentLocalLibraryTracks) || !persistentLocalLibraryTracks.length) return false;
  return importLocalAudioSongs(persistentLocalLibraryTracks.map(cloneSong), { mode: 'persistent-library' });
}
var uploadFilePickerActiveUntil = 0;
var uploadFilePickerFocusArmed = false;
var uploadFilePickerFocusTimer = null;
function uploadImportNow() {
  return (window.performance && typeof performance.now === 'function') ? performance.now() : Date.now();
}
function isUploadPanelOpen() {
  var panel = document.getElementById('upload-panel');
  return !!(panel && panel.classList.contains('show'));
}
function pinUploadSearchArea() {
  var area = document.getElementById('search-area');
  if (area && typeof setPeek === 'function') setPeek(area, true, 'search');
}
function keepUploadImportActive(ms) {
  uploadFilePickerActiveUntil = Math.max(uploadFilePickerActiveUntil, uploadImportNow() + (ms || 12000));
  pinUploadSearchArea();
}
function isUploadImportActive() {
  return isUploadPanelOpen() || uploadImportNow() < uploadFilePickerActiveUntil;
}
function clearUploadFilePickerFocusTimer() {
  if (uploadFilePickerFocusTimer) {
    clearTimeout(uploadFilePickerFocusTimer);
    uploadFilePickerFocusTimer = null;
  }
}
function disarmUploadFilePickerFocus() {
  if (!uploadFilePickerFocusArmed) return;
  uploadFilePickerFocusArmed = false;
  window.removeEventListener('focus', handleUploadFilePickerFocus);
}
function handleUploadFilePickerFocus() {
  disarmUploadFilePickerFocus();
  keepUploadImportActive(900);
  clearUploadFilePickerFocusTimer();
  uploadFilePickerFocusTimer = setTimeout(function () {
    uploadFilePickerFocusTimer = null;
    uploadFilePickerActiveUntil = 0;
    if (isUploadPanelOpen()) closeUploadPanel();
  }, 900);
}
function armUploadFilePickerFocus() {
  disarmUploadFilePickerFocus();
  uploadFilePickerFocusArmed = true;
  window.addEventListener('focus', handleUploadFilePickerFocus);
}
function finishUploadFilePicker(closePanel) {
  uploadFilePickerActiveUntil = 0;
  clearUploadFilePickerFocusTimer();
  disarmUploadFilePickerFocus();
  if (closePanel) closeUploadPanel({ keepPicker: true });
}
function openUploadPanel() {
  closeUploadTip(false);
  var actions = document.getElementById('upload-actions');
  var panel = document.getElementById('upload-panel');
  if (!panel) return;
  var hidden = !actions;
  if (!hidden) {
    try {
      var style = getComputedStyle(actions);
      hidden = style.display === 'none' || style.visibility === 'hidden' || actions.getClientRects().length === 0;
    } catch (e) { }
  }
  if (hidden) {
    triggerUploadInput('audio');
    return;
  }
  panel.classList.add('show');
  pinUploadSearchArea();
}
function closeUploadPanel(opts) {
  opts = opts || {};
  if (!opts.keepPicker) uploadFilePickerActiveUntil = 0;
  var panel = document.getElementById('upload-panel');
  if (panel) panel.classList.remove('show');
}
function toggleUploadPanel(event) {
  if (event) event.stopPropagation();
  var panel = document.getElementById('upload-panel');
  if (!panel) return;
  if (panel.classList.contains('show')) closeUploadPanel();
  else openUploadPanel();
}
function triggerUploadInput(kind) {
  var id = kind === 'cover' ? 'cover-input' : (kind === 'folder' ? 'folder-input' : 'file-input');
  var input = document.getElementById(id);
  if (!input) {
    closeUploadPanel();
    return;
  }
  keepUploadImportActive(kind === 'folder' ? 120000 : 45000);
  armUploadFilePickerFocus();
  try {
    input.click();
  } catch (e) {
    console.warn('[LocalImport] failed to open file picker', e);
    finishUploadFilePicker(false);
  }
}
function importLocalAudioSongs(songs, opts) {
  opts = opts || {};
  songs = Array.isArray(songs) ? songs.filter(Boolean) : [];
  if (!songs.length) return false;
  homeForcedOpen = false;
  homeSuppressed = false;
  setHomeControlsLocked(false);
  playQueue = songs.map(cloneSong);
  currentIdx = 0;
  currentLocalSong = null;
  activeRadioContext = null;
  safeRenderQueuePanel('local-import', { scrollCurrent: miniQueueOpen });
  safeShelfRebuild('local-import', true);
  forcePlaybackControlsInteractive();
  updateEmptyHomeVisibility({ forceLoad: false });
  showToast(songs.length > 1 ? ('已导入 ' + songs.length + ' 首本地音乐') : '正在播放本地音乐');
  Promise.resolve(playQueueAt(0, { manual: true })).then(function () {
    if (opts.coverFile && currentIdx === 0 && playQueue[0]) {
      loadCoverFromFile(opts.coverFile, { trackToken: trackSwitchToken, deferHeavy: false, delay: 0, timeout: 260 });
    }
  }).catch(function (e) { console.warn('[LocalImport]', e); });
  return true;
}
function handleCoverFiles(files) {
  finishUploadFilePicker(true);
  var imgFile = firstImageUploadFile(files);
  if (!imgFile) {
    showToast('没有找到可用的封面图片');
    return;
  }
  loadCoverFromFile(imgFile, null);
  updateCustomCoverButton();
}
async function handleFiles(files, opts) {
  finishUploadFilePicker(true);
  opts = opts || {};
  var playlistFiles = sortedPlaylistUploadFiles(files);
  var audioFiles = sortedAudioUploadFiles(files);
  var imgFile = firstImageUploadFile(files);
  // 播放列表文件（m3u/m3u8/pls）优先走解析导入；目录选择若包含音频则整体走目录扫描，
  // 目录里只有播放列表（无音频）时仍按播放列表解析。
  if (playlistFiles.length && (opts.mode !== 'folder' || !audioFiles.length)) {
    await importLocalPlaylistFilesWithFeedback(playlistFiles);
    return;
  }
  if (audioFiles.length) {
    var songs;
    var persistenceFailed = false;
    if (canUsePersistentLocalMusicLibrary()) {
      showToast('正在读取 ' + audioFiles.length + ' 首本地音乐的标签与歌词…');
      try {
        var persisted;
        if (opts.mode === 'folder') {
          // 目录选择：主进程递归扫描所选目录（含子目录），再批量导入
          persisted = await window.desktopWindow.scanLocalMusicDirectory(audioFiles);
        } else {
          persisted = await importPersistentLocalAudioFiles(audioFiles);
        }
        songs = persisted && persisted.tracks;
        if (!songs || !songs.length) throw new Error(persisted && persisted.error || 'LOCAL_LIBRARY_IMPORT_EMPTY');
        persistentLocalLibraryTracks = songs.map(cloneSong);
        if (persisted && Array.isArray(persisted.failures) && persisted.failures.length) {
          setTimeout(function () { showToast('有 ' + persisted.failures.length + ' 个文件无法读取，其余歌曲已保存'); }, 900);
        }
      } catch (e) {
        persistenceFailed = true;
        console.warn('[LocalImport] persistent library unavailable, using this session only', e);
      }
    }
    if (!songs || !songs.length) songs = audioFiles.map(localSongFromAudioFile);
    importLocalAudioSongs(songs, { coverFile: songs.length === 1 ? imgFile : null, mode: opts.mode || '' });
    if (persistenceFailed) {
      setTimeout(function () { showToast('本地曲库保存失败：这些歌曲仅本次可用，重启后不会保留'); }, 260);
    }
    return;
  }
  if (imgFile) {
    handleCoverFiles([imgFile]);
    return;
  }
  showToast('没有找到可导入的音乐、播放列表或封面文件');
}
async function importLocalPlaylistFilesWithFeedback(playlistFiles) {
  if (!window.desktopWindow || typeof window.desktopWindow.importLocalPlaylistFiles !== 'function') {
    showToast('当前环境不支持导入播放列表');
    return;
  }
  showToast('正在解析 ' + playlistFiles.length + ' 个播放列表…');
  try {
    var persisted = await window.desktopWindow.importLocalPlaylistFiles(playlistFiles);
    var songs = persisted && persisted.tracks;
    var skippedUrls = (persisted && Array.isArray(persisted.urls)) ? persisted.urls : [];
    var missing = (persisted && Array.isArray(persisted.missing)) ? persisted.missing : [];
    if (!songs || !songs.length) {
      var emptyReason = '';
      if (skippedUrls.length && !missing.length) emptyReason = '（其中 ' + skippedUrls.length + ' 条为网络地址，未做下载）';
      else if (missing.length) emptyReason = '（其中 ' + missing.length + ' 个文件不存在）';
      showToast('播放列表中没有可导入的本地音频' + emptyReason);
      return;
    }
    persistentLocalLibraryTracks = songs.map(cloneSong);
    importLocalAudioSongs(songs, { mode: 'playlist-import' });
    var notes = [];
    if (persisted && Array.isArray(persisted.failures) && persisted.failures.length) notes.push('有 ' + persisted.failures.length + ' 个文件无法读取');
    if (skippedUrls.length) notes.push('跳过 ' + skippedUrls.length + ' 个网络地址');
    if (missing.length) notes.push(missing.length + ' 个文件缺失');
    if (notes.length) {
      setTimeout(function () { showToast('已导入 ' + songs.length + ' 首，' + notes.join('，')); }, 900);
    }
  } catch (e) {
    console.warn('[PlaylistImport]', e);
    showToast('播放列表导入失败');
  }
}
async function exportQueueAsM3U() {
  if (!Array.isArray(playQueue) || !playQueue.length) {
    showToast('队列为空，没有可导出的歌曲');
    return;
  }
  if (!window.desktopWindow || typeof window.desktopWindow.exportLocalQueueAsM3U !== 'function') {
    showToast('当前环境不支持导出 m3u 播放列表');
    return;
  }
  var tracks = playQueue.map(function (song) {
    song = song || {};
    return {
      localFileId: song.localFileId || '',
      name: song.name || song.title || '',
      artist: song.artist || '',
      duration: Number(song.duration) || 0
    };
  });
  showToast('正在导出 ' + tracks.length + ' 首到 m3u…');
  try {
    var result = await window.desktopWindow.exportLocalQueueAsM3U(tracks);
    if (result && result.ok === true) showToast('已导出 m3u 播放列表（' + (result.count || 0) + ' 首本地曲目）');
    else if (result && result.canceled) showToast('已取消导出');
    else showToast(result && result.error || '导出失败');
  } catch (e) {
    console.warn('[M3UExport]', e);
    showToast('导出失败');
  }
}
var fileInput = document.getElementById('file-input');
if (fileInput) fileInput.addEventListener('change', function (e) { handleFiles(e.target.files, { mode: 'audio' }); e.target.value = ''; });
var coverInput = document.getElementById('cover-input');
if (coverInput) coverInput.addEventListener('change', function (e) { handleCoverFiles(e.target.files); e.target.value = ''; });
var folderInput = document.getElementById('folder-input');
if (folderInput) folderInput.addEventListener('change', function (e) { handleFiles(e.target.files, { mode: 'folder' }); e.target.value = ''; });
var lyricFontInput = document.getElementById('lyric-font-input');
if (lyricFontInput) lyricFontInput.addEventListener('change', function (e) { handleLyricFontFiles(e.target.files); e.target.value = ''; });
document.addEventListener('click', function (e) {
  var panel = document.getElementById('upload-panel');
  if (!panel || !panel.classList.contains('show')) return;
  if (e.target && e.target.closest && e.target.closest('#upload-actions')) return;
  closeUploadPanel();
});
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') closeUploadPanel();
});
var dropOv = document.getElementById('drop-overlay'), dragCount = 0;
document.addEventListener('dragenter', function (e) { e.preventDefault(); dragCount++; dropOv.classList.add('show'); });
document.addEventListener('dragleave', function (e) { e.preventDefault(); dragCount--; if (dragCount <= 0) { dragCount = 0; dropOv.classList.remove('show'); } });
document.addEventListener('dragover', function (e) { e.preventDefault(); });
document.addEventListener('drop', function (e) {
  e.preventDefault(); dragCount = 0; dropOv.classList.remove('show');
  if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
});

// ============================================================
//  m3u 导出按钮（队列工具栏）+ 本地音乐库入口（上传面板）
function installLocalQueueM3UExportButton() {
  var toolbar = document.querySelector('#queue-pane .queue-toolbar');
  if (!toolbar || document.getElementById('queue-export-m3u-btn')) return;
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'fx-mini-btn ghost';
  btn.id = 'queue-export-m3u-btn';
  btn.style.cssText = 'height:26px;padding:0 10px;font-size:11px';
  btn.textContent = '导出 m3u';
  btn.title = '把当前播放队列导出为 m3u 播放列表（本地曲目写文件路径，在线曲目以注释行占位）';
  btn.onclick = exportQueueAsM3U;
  toolbar.appendChild(btn);
}
function installLocalLibraryBrowserButton() {
  var panel = document.getElementById('upload-panel');
  if (!panel || document.getElementById('open-local-library-browser-btn')) return;
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'upload-choice';
  btn.id = 'open-local-library-browser-btn';
  btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">' +
    '<rect x="3" y="4" width="18" height="16" rx="2" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="16" y1="2" x2="16" y2="6" />' +
    '<circle cx="8.5" cy="12" r="1.5" /><circle cx="15.5" cy="12" r="1.5" /><path d="M8.5 12c2.2 2.4 4.8 2.4 7 0" /></svg>' +
    '<span><strong>本地音乐库</strong><small>按专辑 / 艺人 / 文件夹浏览，管理本地歌单</small></span>';
  btn.onclick = function (event) {
    if (event) event.stopPropagation();
    closeUploadPanel(true);
    openLocalMusicLibraryBrowser();
  };
  panel.appendChild(btn);
}
installLocalQueueM3UExportButton();
installLocalLibraryBrowserButton();

// ============================================================
//  本地音乐库浏览（专辑 / 艺人 / 文件夹分组）+ 本地歌单
var LOCAL_PLAYLISTS_STORAGE_KEY = 'mineradio-local-playlists-v1';
var localLibraryBrowserView = 'all';
var localLibraryBrowserPlaylistId = '';
function loadLocalPlaylists() {
  try {
    var raw = localStorage.getItem(LOCAL_PLAYLISTS_STORAGE_KEY);
    if (!raw) return { version: 1, playlists: [] };
    var parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.playlists)) return { version: 1, playlists: [] };
    parsed.version = 1;
    return parsed;
  } catch (e) {
    return { version: 1, playlists: [] };
  }
}
function saveLocalPlaylists(state) {
  try {
    localStorage.setItem(LOCAL_PLAYLISTS_STORAGE_KEY, JSON.stringify(state));
  } catch (e) { }
}
function localLibraryBrowserTracks() {
  return (Array.isArray(persistentLocalLibraryTracks) ? persistentLocalLibraryTracks : [])
    .filter(Boolean)
    .map(function (song) { return hydrateCustomCover(cloneSong(song)); });
}
function localTrackIdentity(song) {
  return String((song && (song.localFileId || song.localKey)) || '').replace(/^local:/, '');
}
function groupLocalLibraryTracks(tracks, keyFn) {
  var groups = [];
  var map = Object.create(null);
  tracks.forEach(function (track, index) {
    var key = String(keyFn(track) || '').trim() || '未知';
    if (!map[key]) {
      map[key] = { key: key, tracks: [] };
      groups.push(map[key]);
    }
    map[key].tracks.push({ track: track, index: index });
  });
  groups.sort(function (a, b) { return a.key.localeCompare(b.key, 'zh-CN', { numeric: true, sensitivity: 'base' }); });
  return groups;
}
function localLibraryTrackRowHtml(item, extra) {
  extra = extra || '';
  var song = item.track;
  var thumb = songCoverSrc(song, 60);
  var img = thumb
    ? '<img src="' + thumb + '" alt="" loading="lazy" decoding="async" onerror="this.style.opacity=0.2" style="width:36px;height:36px;border-radius:6px;flex-shrink:0;object-fit:cover">'
    : '<div style="width:36px;height:36px;border-radius:6px;background:rgba(255,255,255,.06);flex-shrink:0"></div>';
  var actions = '<button type="button" data-llb-add="' + item.index + '" onclick="event.stopPropagation()" title="加入本地歌单" style="width:24px;height:24px;border-radius:6px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:rgba(255,255,255,.75);cursor:pointer;font-size:13px;line-height:1;flex-shrink:0">+</button>';
  if (extra === 'playlist-remove') {
    actions = '<button type="button" data-llb-remove="' + item.index + '" onclick="event.stopPropagation()" title="从歌单移除" style="width:24px;height:24px;border-radius:6px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:rgba(255,255,255,.6);cursor:pointer;font-size:12px;line-height:1;flex-shrink:0">−</button>';
  }
  return '<div data-llb-play="' + item.index + '" style="display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:10px;cursor:pointer" onmouseover="this.style.background=\'rgba(255,255,255,.06)\'" onmouseout="this.style.background=\'\'">' +
    img +
    '<div style="flex:1;min-width:0">' +
    '<div style="font-size:12.5px;color:rgba(255,255,255,.9);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escHtml(song.name || song.title || '未知') + '</div>' +
    '<div style="font-size:10.5px;color:rgba(255,255,255,.42);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escHtml(song.artist || '本地文件') + (song.album ? ' · ' + escHtml(song.album) : '') + '</div>' +
    '</div>' + actions + '</div>';
}
function renderLocalLibraryBrowserGroups(body, tracks) {
  var view = localLibraryBrowserView;
  if (view === 'all') {
    body.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:6px">' +
      tracks.map(function (track, index) { return localLibraryTrackRowHtml({ track: track, index: index }); }).join('') +
      '</div>';
    return;
  }
  var keyFns = {
    album: function (t) { return t.album || '未知专辑'; },
    artist: function (t) { return t.artist || '未知艺人'; },
    folder: function (t) { return String(t.localPath || '').split(/[\\/]/).slice(0, -1).join(' / ') || '未知文件夹'; }
  };
  var groups = groupLocalLibraryTracks(tracks, keyFns[view] || keyFns.album);
  body.innerHTML = groups.map(function (group) {
    return '<div style="margin-bottom:14px">' +
      '<div style="font-size:12.5px;font-weight:700;color:rgba(255,255,255,.8);padding:6px 4px;display:flex;align-items:center;gap:8px">' + escHtml(group.key) +
      '<span style="font-weight:400;color:rgba(255,255,255,.35);font-size:10.5px">' + group.tracks.length + ' 首</span></div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:6px">' +
      group.tracks.map(function (item) { return localLibraryTrackRowHtml(item); }).join('') +
      '</div></div>';
  }).join('');
}
function renderLocalLibraryBrowserPlaylists(body) {
  var state = loadLocalPlaylists();
  if (!state.playlists.length) {
    body.innerHTML = '<div style="text-align:center;padding:50px 0;color:rgba(255,255,255,.35);font-size:12.5px">还没有本地歌单。<br>先到「全部 / 专辑 / 艺人 / 文件夹」里给歌曲点 + 加入歌单，或点击右上角「新建歌单」。</div>';
    return;
  }
  body.innerHTML = state.playlists.map(function (playlist) {
    return '<div data-llb-open-playlist="' + escHtml(playlist.id) + '" style="display:flex;align-items:center;gap:10px;padding:11px 12px;border-radius:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);margin-bottom:8px;cursor:pointer" onmouseover="this.style.borderColor=\'rgba(255,255,255,.18)\'" onmouseout="this.style.borderColor=\'\'">' +
      '<div style="width:34px;height:34px;border-radius:8px;background:rgba(79,124,255,.18);color:#8fb0ff;display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0">♪</div>' +
      '<div style="flex:1;min-width:0"><div style="font-size:13px;color:rgba(255,255,255,.9)">' + escHtml(playlist.name) + '</div>' +
      '<div style="font-size:11px;color:rgba(255,255,255,.42)">' + playlist.trackIds.length + ' 首本地歌曲</div></div>' +
      '<button type="button" data-llb-delete-playlist="' + escHtml(playlist.id) + '" onclick="event.stopPropagation()" title="删除歌单" style="height:24px;padding:0 9px;border-radius:6px;border:1px solid rgba(255,80,80,.3);background:rgba(255,80,80,.08);color:rgba(255,130,130,.85);cursor:pointer;font-size:11px;flex-shrink:0">删除</button>' +
      '</div>';
  }).join('');
}
function renderLocalLibraryPlaylistDetail(body) {
  var state = loadLocalPlaylists();
  var playlist = null;
  for (var i = 0; i < state.playlists.length; i += 1) {
    if (state.playlists[i].id === localLibraryBrowserPlaylistId) { playlist = state.playlists[i]; break; }
  }
  if (!playlist) {
    localLibraryBrowserView = 'playlists';
    localLibraryBrowserPlaylistId = '';
    renderLocalLibraryBrowserPlaylists(body);
    return;
  }
  var idSet = {};
  playlist.trackIds.forEach(function (id) { idSet[id] = true; });
  var tracks = localLibraryBrowserTracks();
  var items = [];
  tracks.forEach(function (track, index) {
    var identity = localTrackIdentity(track);
    if (identity && idSet[identity]) items.push({ track: track, index: index });
  });
  var head = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">' +
    '<button type="button" data-llb-back="1" style="height:26px;padding:0 10px;border-radius:8px;border:1px solid rgba(255,255,255,.14);background:transparent;color:rgba(255,255,255,.75);cursor:pointer;font-size:11.5px">← 返回歌单列表</button>' +
    '<div style="font-size:14px;font-weight:700;color:rgba(255,255,255,.92)">' + escHtml(playlist.name) + '</div>' +
    '<div style="font-size:11px;color:rgba(255,255,255,.4)">' + playlist.trackIds.length + ' 首</div>' +
    '<span style="flex:1"></span>' +
    '<button type="button" data-llb-delete-playlist="' + escHtml(playlist.id) + '" style="height:26px;padding:0 10px;border-radius:8px;border:1px solid rgba(255,80,80,.3);background:rgba(255,80,80,.08);color:rgba(255,130,130,.85);cursor:pointer;font-size:11.5px">删除歌单</button>' +
    '</div>';
  var list = items.length
    ? items.map(function (item) { return localLibraryTrackRowHtml(item, 'playlist-remove'); }).join('')
    : '<div style="text-align:center;padding:40px 0;color:rgba(255,255,255,.35);font-size:12px">歌单还是空的，去「全部 / 专辑 / 艺人 / 文件夹」里给歌曲点 + 加入歌单</div>';
  body.innerHTML = head + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:6px">' + list + '</div>';
}
function refreshLocalLibraryBrowser() {
  var overlay = document.getElementById('local-library-browser');
  if (!overlay || !overlay.classList.contains('show')) return;
  var body = overlay.querySelector('.llb-body');
  if (!body) return;
  var activeView = localLibraryBrowserView === 'playlist-detail' ? 'playlists' : localLibraryBrowserView;
  Array.prototype.forEach.call(overlay.querySelectorAll('.llb-tab'), function (tab) {
    tab.classList.toggle('active', tab.getAttribute('data-llb-view') === activeView);
  });
  var tracks = localLibraryBrowserTracks();
  if (!tracks.length) {
    body.innerHTML = '<div style="text-align:center;padding:50px 0;color:rgba(255,255,255,.35);font-size:12.5px">本地音乐库为空。<br>点击左上角「导入」选择歌曲、文件夹或 m3u / pls 播放列表，导入后会显示在这里。</div>';
    return;
  }
  if (localLibraryBrowserView === 'playlist-detail') { renderLocalLibraryPlaylistDetail(body); return; }
  if (localLibraryBrowserView === 'playlists') { renderLocalLibraryBrowserPlaylists(body); return; }
  renderLocalLibraryBrowserGroups(body, tracks);
}
function switchLocalLibraryBrowserView(view) {
  localLibraryBrowserView = view;
  localLibraryBrowserPlaylistId = '';
  refreshLocalLibraryBrowser();
}
function playLocalLibraryTrack(index) {
  var tracks = localLibraryBrowserTracks();
  var song = tracks[index];
  if (!song) return;
  closeLocalMusicLibraryBrowser();
  importLocalAudioSongs(tracks, { mode: 'local-library-browse' });
  if (index > 0 && index < playQueue.length) {
    currentIdx = index;
    Promise.resolve(playQueueAt(index, { manual: true })).then(function () {
      // 播放就绪后再次刷新 Home 可见性，确保从本地库选歌播放能切回播放态界面
      if (typeof updateEmptyHomeVisibility === 'function') updateEmptyHomeVisibility({ forceLoad: true });
    }).catch(function (e) { console.warn('[LocalLibraryBrowse]', e); });
  } else {
    if (typeof updateEmptyHomeVisibility === 'function') updateEmptyHomeVisibility({ forceLoad: true });
  }
}
function addCurrentTrackToLocalPlaylist(index) {
  var tracks = localLibraryBrowserTracks();
  var song = tracks[index];
  if (!song) return;
  var id = localTrackIdentity(song);
  if (!id) { showToast('该曲目不在本地库中，无法加入歌单'); return; }
  var state = loadLocalPlaylists();
  if (!state.playlists.length) { showToast('还没有本地歌单，请先点击「新建歌单」'); return; }
  var options = state.playlists.map(function (p, i) {
    return '<option value="' + i + '">' + escHtml(p.name) + '（' + p.trackIds.length + ' 首）</option>';
  }).join('');
  var picker = document.createElement('div');
  picker.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:9100;background:#16181f;border:1px solid rgba(255,255,255,.16);border-radius:12px;padding:14px;width:280px;box-shadow:0 20px 60px rgba(0,0,0,.5)';
  picker.innerHTML = '<div style="font-size:12.5px;color:rgba(255,255,255,.85);margin-bottom:8px">把「' + escHtml(song.name || song.title || '未知') + '」加入本地歌单</div>' +
    '<select style="width:100%;box-sizing:border-box;padding:6px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.16);background:#0c0d11;color:rgba(255,255,255,.85);font-size:12px">' + options + '</select>' +
    '<div style="display:flex;gap:8px;margin-top:10px;justify-content:flex-end">' +
    '<button type="button" class="llb-cancel" style="padding:5px 12px;border-radius:8px;border:1px solid rgba(255,255,255,.16);background:transparent;color:rgba(255,255,255,.7);font-size:12px;cursor:pointer">取消</button>' +
    '<button type="button" class="llb-confirm" style="padding:5px 12px;border-radius:8px;border:none;background:#4f7cff;color:#fff;font-size:12px;cursor:pointer">加入</button>' +
    '</div>';
  document.body.appendChild(picker);
  function dismiss() { if (picker.parentNode) picker.parentNode.removeChild(picker); }
  picker.querySelector('.llb-cancel').addEventListener('click', dismiss);
  picker.querySelector('.llb-confirm').addEventListener('click', function () {
    var idx = Math.max(0, Number(picker.querySelector('select').value) || 0);
    var playlist = state.playlists[idx];
    if (playlist) {
      if (playlist.trackIds.indexOf(id) < 0) {
        playlist.trackIds.push(id);
        playlist.updatedAt = Date.now();
        saveLocalPlaylists(state);
        showToast('已加入歌单「' + playlist.name + '」');
      } else {
        showToast('该曲目已在歌单「' + playlist.name + '」中');
      }
      refreshLocalLibraryBrowser();
    }
    dismiss();
  });
}
function removeTrackFromLocalPlaylist(index) {
  var tracks = localLibraryBrowserTracks();
  var song = tracks[index];
  if (!song) return;
  var id = localTrackIdentity(song);
  if (!id) return;
  var state = loadLocalPlaylists();
  for (var i = 0; i < state.playlists.length; i += 1) {
    if (state.playlists[i].id === localLibraryBrowserPlaylistId) {
      var at = state.playlists[i].trackIds.indexOf(id);
      if (at >= 0) {
        state.playlists[i].trackIds.splice(at, 1);
        state.playlists[i].updatedAt = Date.now();
        saveLocalPlaylists(state);
        showToast('已从歌单移除');
        refreshLocalLibraryBrowser();
      }
      break;
    }
  }
}
function deleteLocalPlaylist(playlistId) {
  var state = loadLocalPlaylists();
  var idx = -1;
  for (var i = 0; i < state.playlists.length; i += 1) {
    if (state.playlists[i].id === playlistId) { idx = i; break; }
  }
  if (idx < 0) return;
  var name = state.playlists[idx].name;
  if (!window.confirm('确定删除本地歌单「' + name + '」？\n此操作只删除本机保存的歌单记录，不会影响歌曲文件。')) return;
  state.playlists.splice(idx, 1);
  saveLocalPlaylists(state);
  showToast('已删除本地歌单「' + name + '」');
  if (localLibraryBrowserPlaylistId === playlistId) { localLibraryBrowserPlaylistId = ''; localLibraryBrowserView = 'playlists'; }
  refreshLocalLibraryBrowser();
}
function createLocalPlaylistPrompt() {
  var wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:9100;background:#16181f;border:1px solid rgba(255,255,255,.16);border-radius:12px;padding:14px;width:260px;box-shadow:0 20px 60px rgba(0,0,0,.5)';
  wrap.innerHTML = '<div style="font-size:12.5px;color:rgba(255,255,255,.85);margin-bottom:8px">新建本地歌单</div>' +
    '<input type="text" maxlength="40" placeholder="输入歌单名称" style="width:100%;box-sizing:border-box;padding:6px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.16);background:#0c0d11;color:rgba(255,255,255,.85);font-size:12px">' +
    '<div style="display:flex;gap:8px;margin-top:10px;justify-content:flex-end">' +
    '<button type="button" class="llb-cancel" style="padding:5px 12px;border-radius:8px;border:1px solid rgba(255,255,255,.16);background:transparent;color:rgba(255,255,255,.7);font-size:12px;cursor:pointer">取消</button>' +
    '<button type="button" class="llb-confirm" style="padding:5px 12px;border-radius:8px;border:none;background:#4f7cff;color:#fff;font-size:12px;cursor:pointer">创建</button>' +
    '</div>';
  document.body.appendChild(wrap);
  var input = wrap.querySelector('input');
  function dismiss() { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }
  function createIt() {
    var name = String(input.value || '').trim();
    if (!name) { showToast('请输入歌单名称'); return; }
    var state = loadLocalPlaylists();
    state.playlists.push({
      id: 'lp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      name: name,
      trackIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    saveLocalPlaylists(state);
    showToast('已创建本地歌单「' + name + '」');
    dismiss();
    switchLocalLibraryBrowserView('playlists');
  }
  wrap.querySelector('.llb-cancel').addEventListener('click', dismiss);
  wrap.querySelector('.llb-confirm').addEventListener('click', createIt);
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') createIt(); });
  input.focus();
}
function buildLocalMusicLibraryBrowser() {
  var overlay = document.createElement('div');
  overlay.id = 'local-library-browser';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);opacity:0;visibility:hidden;transition:opacity .18s,visibility .18s';
  overlay.innerHTML = '<div style="width:min(920px,92vw);height:min(640px,86vh);background:linear-gradient(150deg,rgba(22,24,30,.97),rgba(9,10,14,.96));border:1px solid rgba(255,255,255,.10);border-radius:16px;box-shadow:0 30px 90px rgba(0,0,0,.5);display:flex;flex-direction:column;overflow:hidden">' +
    '<div style="display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.08)">' +
    '<div style="flex:1;min-width:0"><div style="font-size:15px;font-weight:700;color:rgba(255,255,255,.92)">本地音乐库</div>' +
    '<div style="font-size:11px;color:rgba(255,255,255,.45)">按专辑 / 艺人 / 文件夹浏览；本地歌单保存在本机</div></div>' +
    '<button type="button" class="llb-close" title="关闭" style="width:30px;height:30px;border-radius:8px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:rgba(255,255,255,.8);cursor:pointer;font-size:15px;flex-shrink:0">×</button>' +
    '</div>' +
    '<div style="display:flex;gap:6px;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.08);flex-wrap:wrap;align-items:center">' +
    '<button type="button" class="llb-tab" data-llb-view="all" style="height:26px;padding:0 12px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:rgba(255,255,255,.72);cursor:pointer;font-size:11.5px">全部</button>' +
    '<button type="button" class="llb-tab" data-llb-view="album" style="height:26px;padding:0 12px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:rgba(255,255,255,.72);cursor:pointer;font-size:11.5px">专辑</button>' +
    '<button type="button" class="llb-tab" data-llb-view="artist" style="height:26px;padding:0 12px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:rgba(255,255,255,.72);cursor:pointer;font-size:11.5px">艺人</button>' +
    '<button type="button" class="llb-tab" data-llb-view="folder" style="height:26px;padding:0 12px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:rgba(255,255,255,.72);cursor:pointer;font-size:11.5px">文件夹</button>' +
    '<button type="button" class="llb-tab" data-llb-view="playlists" style="height:26px;padding:0 12px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:rgba(255,255,255,.72);cursor:pointer;font-size:11.5px">本地歌单</button>' +
    '<span style="flex:1"></span>' +
    '<button type="button" class="llb-new-playlist" style="height:26px;padding:0 12px;border-radius:8px;border:none;background:#4f7cff;color:#fff;cursor:pointer;font-size:11.5px">+ 新建歌单</button>' +
    '</div>' +
    '<div class="llb-body" style="flex:1;overflow:auto;padding:12px 16px"></div>' +
    '</div>';
  document.body.appendChild(overlay);
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) { closeLocalMusicLibraryBrowser(); return; }
    var tab = e.target && e.target.closest && e.target.closest('.llb-tab');
    if (tab) { switchLocalLibraryBrowserView(tab.getAttribute('data-llb-view')); return; }
    if (e.target && e.target.closest && e.target.closest('.llb-close')) { closeLocalMusicLibraryBrowser(); return; }
    if (e.target && e.target.closest && e.target.closest('.llb-new-playlist')) { createLocalPlaylistPrompt(); return; }
    var back = e.target && e.target.closest && e.target.closest('[data-llb-back]');
    if (back) { switchLocalLibraryBrowserView('playlists'); return; }
    var openPl = e.target && e.target.closest && e.target.closest('[data-llb-open-playlist]');
    if (openPl) {
      localLibraryBrowserView = 'playlist-detail';
      localLibraryBrowserPlaylistId = openPl.getAttribute('data-llb-open-playlist');
      refreshLocalLibraryBrowser();
      return;
    }
    var delPl = e.target && e.target.closest && e.target.closest('[data-llb-delete-playlist]');
    if (delPl) { deleteLocalPlaylist(delPl.getAttribute('data-llb-delete-playlist')); return; }
    var removeBtn = e.target && e.target.closest && e.target.closest('[data-llb-remove]');
    if (removeBtn) { removeTrackFromLocalPlaylist(Number(removeBtn.getAttribute('data-llb-remove'))); return; }
    var addBtn = e.target && e.target.closest && e.target.closest('[data-llb-add]');
    if (addBtn) { addCurrentTrackToLocalPlaylist(Number(addBtn.getAttribute('data-llb-add'))); return; }
    var playBtn = e.target && e.target.closest && e.target.closest('[data-llb-play]');
    if (playBtn) playLocalLibraryTrack(Number(playBtn.getAttribute('data-llb-play')));
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeLocalMusicLibraryBrowser();
  });
  return overlay;
}
function openLocalMusicLibraryBrowser() {
  var overlay = document.getElementById('local-library-browser');
  if (!overlay) overlay = buildLocalMusicLibraryBrowser();
  overlay.classList.add('show');
  overlay.style.visibility = 'visible';
  overlay.style.opacity = '1';
  overlay.style.pointerEvents = 'auto';
  refreshLocalLibraryBrowser();
}
function closeLocalMusicLibraryBrowser() {
  var overlay = document.getElementById('local-library-browser');
  if (!overlay) return;
  overlay.style.visibility = 'hidden';
  overlay.style.opacity = '0';
  overlay.style.pointerEvents = 'none';
  overlay.classList.remove('show');
}

// ============================================================
//  控制台 — 预设卡片 + 主滑块 + 开关 + 三态
