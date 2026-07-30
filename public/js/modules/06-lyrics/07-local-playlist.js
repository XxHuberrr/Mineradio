// ===== 本地歌单（Local Playlist） =====
// 持久化本地文件夹歌单：扫描 -> 存储 -> 播放 -> 删除 -> 排序。
// 设计要点：复用现有播放分支（playLocalQueueSong 走 song.localUrl），
// 因而导入时必须为每首歌设置 localUrl = /api/local-audio?path=...。
// 封面/歌词复用 customCoverMap / customLyricMap，key = local:{localKey}（localKey = 绝对路径）。

(function () {
  'use strict';

  var LOCAL_PLAYLIST_STORE_KEY = 'mineradio-local-playlists-v1';
  var LOCAL_PLAYLIST_SONGS_KEY = 'mineradio-local-playlist-songs-v1';

  function readLocalPlaylists() {
    try {
      var raw = localStorage.getItem(LOCAL_PLAYLIST_STORE_KEY);
      var p = raw ? JSON.parse(raw) : [];
      return Array.isArray(p) ? p : [];
    } catch (e) { return []; }
  }
  function saveLocalPlaylists(list) {
    try { localStorage.setItem(LOCAL_PLAYLIST_STORE_KEY, JSON.stringify(list || [])); return true; }
    catch (e) { console.warn('local playlists save failed', e); return false; }
  }
  function readLocalSongsMap() {
    try {
      var raw = localStorage.getItem(LOCAL_PLAYLIST_SONGS_KEY);
      var p = raw ? JSON.parse(raw) : {};
      return p && typeof p === 'object' ? p : {};
    } catch (e) { return {}; }
  }
  function saveLocalSongsMap(map) {
    try { localStorage.setItem(LOCAL_PLAYLIST_SONGS_KEY, JSON.stringify(map || {})); return true; }
    catch (e) { console.warn('local songs save failed', e); return false; }
  }

  var localPlaylists = readLocalPlaylists();
  var localSongsMap = readLocalSongsMap();
  var expandedLocalPlaylistId = null;

  function localServerApi() {
    return (typeof window !== 'undefined' && window.desktopWindow) ? window.desktopWindow : null;
  }
  function basename(p) {
    return String(p || '').split(/[\\/]/).pop() || String(p || '');
  }
  function localSongKey(filePath) { return filePath; }
  function buildLocalAudioUrl(filePath) { return '/api/local-audio?path=' + encodeURIComponent(filePath); }
  function escHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function escAttr(s) { return escHtml(s); }
  function sortModeLabel(mode) {
    return ({ custom: '手动', name: '曲名', artist: '歌手', added: '添加时间' })[mode] || '手动';
  }

  // 取出一首可播放的本地歌（确保 localUrl / localKey / type / source 齐全）
  function cloneLocalSong(s) {
    if (!s) return s;
    return {
      name: s.name || s.title || s.fileName || '未知曲目',
      artist: s.artist || '',
      title: s.name || s.title || '',
      type: 'local',
      source: 'local',
      localKey: s.localKey || s.localPath || s.filePath,
      localPath: s.localPath || s.filePath,
      localUrl: s.localUrl || buildLocalAudioUrl(s.localPath || s.filePath),
      cover: s.cover || '',
      durationMs: s.durationMs || s.duration || 0,
      fileName: s.fileName || '',
    };
  }

  function getLocalPlaylistById(id) {
    for (var i = 0; i < localPlaylists.length; i++) if (localPlaylists[i].id === id) return localPlaylists[i];
    return null;
  }

  // 返回按当前排序模式排序后的 songKey 数组（custom=手动顺序；其余仅用于显示，不回写 songKeys）
  function getLocalPlaylistKeys(pl) {
    if (!pl) return [];
    var keys = (Array.isArray(pl.songKeys) && pl.songKeys.length) ? pl.songKeys.slice() : [];
    var mode = pl.sortMode || 'custom';
    if (mode === 'name') {
      keys.sort(function (a, b) {
        var sa = (localSongsMap[a] && localSongsMap[a].name) || '';
        var sb = (localSongsMap[b] && localSongsMap[b].name) || '';
        return sa.localeCompare(sb, 'zh');
      });
    } else if (mode === 'artist') {
      keys.sort(function (a, b) {
        var sa = (localSongsMap[a] && localSongsMap[a].artist) || '';
        var sb = (localSongsMap[b] && localSongsMap[b].artist) || '';
        return sa.localeCompare(sb, 'zh');
      });
    }
    return keys.filter(function (k) { return !!localSongsMap[k]; });
  }

  // ---- 导入流程 ----
  async function openLocalFolderImport() {
    var api = localServerApi();
    if (!api || typeof api.openLocalFolder !== 'function') { showToast('本地歌单功能不可用'); return; }
    var pick = await api.openLocalFolder();
    if (!pick || pick.canceled || !pick.path) return;
    showToast('正在扫描本地音乐…');
    var result = await api.scanLocalFolder(pick.path);
    if (!result || !result.ok) { showToast('扫描失败：' + ((result && result.error) || '未知错误')); return; }
    if (!result.count) { showToast('该文件夹没有可导入的音频文件'); return; }
    processLocalPlaylistImport(pick.path, result.songs);
  }

  function processLocalPlaylistImport(folderPath, songs) {
    if (!Array.isArray(songs) || !songs.length) { showToast('没有可导入的曲目'); return; }
    var map = localSongsMap;
    var newKeys = [];
    songs.forEach(function (s) {
      var key = localSongKey(s.filePath);
      var stored = {
        filePath: s.filePath,
        fileName: s.fileName,
        name: s.name || s.fileName,
        artist: s.artist || '',
        localKey: s.localKey || s.filePath,
        localPath: s.localPath || s.filePath,
        localUrl: buildLocalAudioUrl(s.localPath || s.filePath),
        cover: s.cover ? ('__local__:' + (s.localPath || s.filePath)) : '',
        durationMs: s.durationMs || 0,
        addedAt: Date.now(),
      };
      map[key] = stored;
      newKeys.push(key);
      if (s.cover) customCoverMap['local:' + stored.localKey] = '__local__:' + (s.localPath || s.filePath);
      if (s.lrcContent) {
        var lrcKey = 'local:' + stored.localKey;
        customLyricMap[lrcKey] = { text: s.lrcContent };
        customLyricPrefs[lrcKey] = 'custom';
      }
    });
    saveLocalSongsMap(map);
    saveCustomCoverMap();
    saveCustomLyricMap();
    saveCustomLyricPrefs();

    var existing = null;
    for (var i = 0; i < localPlaylists.length; i++) if (localPlaylists[i].folderPath === folderPath) { existing = localPlaylists[i]; break; }
    if (existing) {
      var seen = {};
      existing.songKeys.forEach(function (k) { seen[k] = true; });
      newKeys.forEach(function (k) { if (!seen[k]) existing.songKeys.push(k); });
      existing.count = existing.songKeys.length;
      existing.updatedAt = Date.now();
      saveLocalPlaylists(localPlaylists);
      showToast('已更新本地歌单：' + existing.name + '（' + existing.count + ' 首）');
    } else {
      var pl = {
        id: 'lp_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
        name: basename(folderPath) || folderPath,
        folderPath: folderPath,
        songKeys: newKeys,
        sortMode: 'custom',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        count: newKeys.length,
        local: true,
      };
      localPlaylists.unshift(pl);
      saveLocalPlaylists(localPlaylists);
      showToast('已导入本地歌单：' + pl.name + '（' + pl.count + ' 首）');
    }
    var api = localServerApi();
    if (api && typeof api.registerLocalFolders === 'function') api.registerLocalFolders([folderPath]);
    renderLocalPlaylistsSection();
  }

  // ---- 播放 ----
  async function rescanLocalPlaylist(id) {
    var pl = getLocalPlaylistById(id);
    if (!pl || !pl.folderPath) { showToast('该歌单没有关联文件夹，无法重新扫描'); return; }
    var api = localServerApi();
    if (!api || typeof api.scanLocalFolder !== 'function') { showToast('本地歌单功能不可用'); return; }
    showToast('正在重新扫描：' + (pl.name || ''));
    var result = await api.scanLocalFolder(pl.folderPath);
    if (!result || !result.ok) { showToast('重新扫描失败：' + ((result && result.error) || '未知错误')); return; }
    processLocalPlaylistImport(pl.folderPath, result.songs);
    showToast('已刷新封面/歌词：' + (pl.name || '') + '（' + result.count + ' 首）');
  }

  function playLocalPlaylist(id) {
    var pl = getLocalPlaylistById(id);
    if (!pl) return;
    var api = localServerApi();
    if (api && typeof api.registerLocalFolders === 'function') api.registerLocalFolders([pl.folderPath]);
    var keys = getLocalPlaylistKeys(pl);
    if (!keys.length) { showToast('歌单为空'); return; }
    clearQueue();
    keys.forEach(function (k) { var s = localSongsMap[k]; if (s) queueSong(cloneLocalSong(s)); });
    if (playQueue.length) playQueueAt(0, { skipShuffleOrder: true });
    showToast('正在播放：' + (pl.name || '本地歌单'));
  }

  function playLocalSongAt(playlistId, key) {
    var pl = getLocalPlaylistById(playlistId);
    if (!pl) return;
    var api = localServerApi();
    if (api && typeof api.registerLocalFolders === 'function') api.registerLocalFolders([pl.folderPath]);
    var keys = getLocalPlaylistKeys(pl);
    var idx = keys.indexOf(key);
    if (idx < 0) { showToast('歌曲不存在'); return; }
    clearQueue();
    keys.forEach(function (k) { var s = localSongsMap[k]; if (s) queueSong(cloneLocalSong(s)); });
    if (playQueue.length) playQueueAt(Math.max(0, idx), { skipShuffleOrder: true });
  }

  // ---- 删除（只删引用 + 缓存，不动磁盘） ----
  function deleteLocalPlaylist(id) {
    var pl = getLocalPlaylistById(id);
    if (!pl) return;
    (pl.songKeys || []).forEach(function (k) {
      var s = localSongsMap[k];
      if (s && s.localKey) {
        var lrcKey = 'local:' + s.localKey;
        delete customCoverMap[lrcKey];
        delete customLyricMap[lrcKey];
        delete customLyricPrefs[lrcKey];
      }
      delete localSongsMap[k];
    });
    saveCustomCoverMap();
    saveCustomLyricMap();
    saveCustomLyricPrefs();
    saveLocalSongsMap(localSongsMap);
    localPlaylists = localPlaylists.filter(function (p) { return p.id !== id; });
    saveLocalPlaylists(localPlaylists);
    if (expandedLocalPlaylistId === id) expandedLocalPlaylistId = null;
    showToast('已删除本地歌单：' + (pl.name || ''));
    renderLocalPlaylistsSection();
  }

  // ---- 排序模式 ----
  function cycleLocalSortMode(id) {
    var pl = getLocalPlaylistById(id);
    if (!pl) return;
    var order = ['custom', 'name', 'artist', 'added'];
    var cur = order.indexOf(pl.sortMode || 'custom');
    pl.sortMode = order[(cur + 1) % order.length];
    saveLocalPlaylists(localPlaylists);
    renderLocalPlaylistsSection();
  }

  // ---- 手动排序（custom）：拖拽 ----
  function reorderLocalSong(playlistId, fromKey, toKey) {
    var pl = getLocalPlaylistById(playlistId);
    if (!pl || !Array.isArray(pl.songKeys)) return false;
    var from = pl.songKeys.indexOf(fromKey);
    var to = pl.songKeys.indexOf(toKey);
    if (from < 0 || to < 0 || from === to) return false;
    pl.sortMode = 'custom';
    pl.songKeys.splice(from, 1);
    pl.songKeys.splice(to, 0, fromKey);
    saveLocalPlaylists(localPlaylists);
    return true;
  }

  // ===== UI =====
  function ensureLocalSection() {
    var pane = document.getElementById('pl-pane');
    if (!pane) return null;
    var section = document.getElementById('local-playlists-section');
    if (!section) {
      section = document.createElement('div');
      section.id = 'local-playlists-section';
      section.style.marginTop = '14px';
      var list = document.getElementById('pl-list');
      if (list && list.parentNode) list.parentNode.insertBefore(section, list.nextSibling);
      else pane.appendChild(section);
    }
    var toolbar = pane.querySelector('.queue-toolbar');
    if (toolbar && !document.getElementById('local-import-btn')) {
      var btn = document.createElement('button');
      btn.id = 'local-import-btn';
      btn.className = 'fx-mini-btn ghost';
      btn.style.height = '26px'; btn.style.padding = '0 10px'; btn.style.fontSize = '11px'; btn.style.marginLeft = '6px';
      btn.textContent = '导入本地歌单';
      btn.onclick = function () { openLocalFolderImport(); };
      toolbar.appendChild(btn);
    }
    return section;
  }

  function renderLocalPlaylistsSection() {
    var section = ensureLocalSection();
    if (!section) return;
    var html = '<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 2px 8px;color:rgba(255,255,255,.5);font-size:11px;letter-spacing:.04em">本地歌单<span style="opacity:.6">' + localPlaylists.length + '</span></div>';
    if (!localPlaylists.length) {
      html += '<div style="text-align:center;padding:14px 0;color:rgba(255,255,255,.3);font-size:11.5px">点击「导入本地歌单」选择文件夹</div>';
    } else {
      html += localPlaylists.map(renderLocalPlaylistCardHtml).join('');
    }
    section.innerHTML = html;
    if (expandedLocalPlaylistId) {
      var pl = getLocalPlaylistById(expandedLocalPlaylistId);
      var holder = pl ? document.getElementById('local-detail-' + pl.id) : null;
      if (holder) holder.innerHTML = renderLocalPlaylistDetailHtml(pl);
    }
  }

  function renderLocalPlaylistCardHtml(pl) {
    var total = (pl.songKeys && pl.songKeys.length) || pl.count || 0;
    var cover = '';
    if (pl.songKeys && pl.songKeys.length) {
      var first = localSongsMap[pl.songKeys[0]];
      if (first) cover = getCustomCoverForSong(first);
    }
    var coverStyle = cover
      ? 'background-image:url("' + cssImageUrl(cover) + '");background-size:cover;background-position:center'
      : 'background:rgba(255,255,255,.06)';
    return '<div class="local-pl-card" data-local-pl="' + escAttr(pl.id) + '" style="display:flex;align-items:center;gap:10px;padding:8px;margin:6px 0;border-radius:10px;background:rgba(255,255,255,.04);cursor:pointer">' +
      '<div style="width:42px;height:42px;border-radius:8px;flex:0 0 auto;' + coverStyle + '"></div>' +
      '<div style="flex:1;min-width:0"><div style="font-size:13px;color:rgba(255,255,255,.92);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escHtml(pl.name) + '</div>' +
      '<div style="font-size:11px;color:rgba(255,255,255,.42)">' + total + ' 首 · 本地文件夹</div></div>' +
      '<button class="fx-mini-btn ghost" data-local-action="' + (expandedLocalPlaylistId === pl.id ? 'collapse' : 'toggle') + '" data-local-pl="' + escAttr(pl.id) + '">' + (expandedLocalPlaylistId === pl.id ? '收起' : '展开') + '</button>' +
      '</div>' +
      '<div id="local-detail-' + escAttr(pl.id) + '" class="local-detail-holder" style="display:block;width:100%;box-sizing:border-box"></div>';
  }

  function renderLocalPlaylistDetailHtml(pl) {
    var keys = getLocalPlaylistKeys(pl);
    var total = keys.length;
    var plCover = '';
    if (pl.songKeys && pl.songKeys.length) {
      var first = localSongsMap[pl.songKeys[0]];
      if (first) plCover = getCustomCoverForSong(first);
    }
    var coverStyle = plCover
      ? 'background-image:url("' + cssImageUrl(plCover) + '");background-size:cover;background-position:center'
      : 'background:rgba(255,255,255,.06)';
    var head = '<div class="pl-detail-head"><div class="pl-detail-cover" style="' + coverStyle + '"></div>' +
      '<div style="flex:1;min-width:0"><div class="pl-detail-title">' + escHtml(pl.name) + '</div>' +
      '<div class="pl-detail-sub">' + total + ' 首 · 本地文件夹</div></div>' +
      '<div class="pl-detail-count">' + total + '</div></div>';
    var actions = '<div class="pl-detail-actions">' +
      '<button class="pl-detail-play" type="button" data-local-action="play" data-local-pl="' + escAttr(pl.id) + '"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>播放歌单</button>' +
      '<button class="fx-mini-btn ghost pl-detail-top-btn" type="button" data-local-action="rescan" data-local-pl="' + escAttr(pl.id) + '">重新扫描</button>' +
      '<button class="fx-mini-btn ghost pl-detail-top-btn" type="button" data-local-action="sort" data-local-pl="' + escAttr(pl.id) + '">排序：' + sortModeLabel(pl.sortMode) + '</button>' +
      '<button class="fx-mini-btn ghost pl-detail-top-btn" type="button" data-local-action="delete" data-local-pl="' + escAttr(pl.id) + '">删除</button>' +
      '<button class="fx-mini-btn ghost pl-detail-top-btn" type="button" data-local-action="collapse" data-local-pl="' + escAttr(pl.id) + '">收起</button>' +
      '</div>';
    var rows = keys.map(function (k) {
      var s = localSongsMap[k]; if (!s) return '';
      var thumb = getCustomCoverForSong(s);
      var imgTag = thumb
        ? '<img src="' + escAttr(thumb) + '" alt="" loading="lazy" decoding="async" onerror="this.style.opacity=0.2" style="width:34px;height:34px;border-radius:7px;flex:0 0 auto;object-fit:cover">'
        : '<div style="width:34px;height:34px;border-radius:7px;background:rgba(255,255,255,.06);flex:0 0 auto"></div>';
      return '<div class="pl-detail-row" draggable="true" data-local-action="play-track" data-local-pl="' + escAttr(pl.id) + '" data-local-track="' + escAttr(k) + '" style="cursor:pointer">' +
        imgTag +
        '<div style="flex:1;min-width:0"><div class="pl-detail-row-title">' + escHtml(s.name || s.fileName || '') + '</div>' +
        '<div class="pl-detail-row-artist">' + escHtml(s.artist || '未知歌手') + '</div></div></div>';
    }).join('');
    return '<div class="pl-inline-detail local-pl-inline-detail" style="display:block;width:100%;box-sizing:border-box;margin:6px 0 10px">' +
      '<div class="pl-detail-sticky">' + head + actions + '</div>' +
      '<div class="pl-detail-list">' + (rows || '<div style="text-align:center;padding:14px 10px;color:rgba(255,255,255,.3);font-size:11.5px">歌单暂无可播放歌曲</div>') + '</div></div>';
  }

  var draggingLocalKey = null;
  function bindLocalPlaylistEvents() {
    var panel = document.getElementById('playlist-panel');
    if (!panel || panel.__localBound) return;
    panel.__localBound = true;
    panel.addEventListener('click', function (e) {
      var el = e.target && e.target.closest ? e.target.closest('[data-local-action]') : null;
      if (!el) return;
      var action = el.getAttribute('data-local-action');
      var id = el.getAttribute('data-local-pl');
      if (action === 'toggle' || action === 'collapse') {
        expandedLocalPlaylistId = (action === 'collapse' || expandedLocalPlaylistId === id) ? null : id;
        renderLocalPlaylistsSection();
      } else if (action === 'play') {
        playLocalPlaylist(id);
      } else if (action === 'rescan') {
        rescanLocalPlaylist(id);
      } else if (action === 'delete') {
        deleteLocalPlaylist(id);
      } else if (action === 'sort') {
        cycleLocalSortMode(id);
      } else if (action === 'play-track') {
        playLocalSongAt(id, el.getAttribute('data-local-track'));
      }
    });
    panel.addEventListener('dragstart', function (e) {
      var el = e.target && e.target.closest ? e.target.closest('[data-local-track]') : null;
      if (!el) return;
      draggingLocalKey = el.getAttribute('data-local-track');
      try { e.dataTransfer.setData('text/plain', draggingLocalKey); } catch (err) { }
    });
    panel.addEventListener('dragover', function (e) {
      var el = e.target && e.target.closest ? e.target.closest('[data-local-track]') : null;
      if (el && draggingLocalKey) e.preventDefault();
    });
    panel.addEventListener('drop', function (e) {
      var el = e.target && e.target.closest ? e.target.closest('[data-local-track]') : null;
      if (!el || !draggingLocalKey) return;
      e.preventDefault();
      var targetKey = el.getAttribute('data-local-track');
      var id = el.getAttribute('data-local-pl');
      if (reorderLocalSong(id, draggingLocalKey, targetKey)) {
        expandedLocalPlaylistId = id;
        renderLocalPlaylistsSection();
      }
      draggingLocalKey = null;
    });
  }

  // 清理本地歌单相关缓存：移除可能含超大 base64 的持久化键，并清掉 map 中的 local: 残留。
  // 背景：早期实现把 base64 大图写进 localStorage 撑爆 5MB 配额，导致写入静默失败；
  // 改为 '__local__:' 引用后不再超配额。此函数为一次性（版本戳）与手动两种入口共用。
  function clearLocalPlaylistCaches() {
    [LOCAL_PLAYLIST_STORE_KEY, LOCAL_PLAYLIST_SONGS_KEY,
     CUSTOM_COVER_STORE_KEY, CUSTOM_LYRIC_STORE_KEY, CUSTOM_LYRIC_PREF_STORE_KEY].forEach(function (k) {
      try { localStorage.removeItem(k); } catch (e) {}
    });
    for (var k1 in customCoverMap) { if (k1.indexOf('local:') === 0) delete customCoverMap[k1]; }
    for (var k2 in customLyricMap) { if (k2.indexOf('local:') === 0) delete customLyricMap[k2]; }
    for (var k3 in customLyricPrefs) { if (k3.indexOf('local:') === 0) delete customLyricPrefs[k3]; }
    localPlaylists = readLocalPlaylists();
    localSongsMap = readLocalSongsMap();
    saveCustomCoverMap();
    saveCustomLyricMap();
    saveCustomLyricPrefs();
  }
  // 一次性清理（版本戳保证只跑一次）：清掉旧版被配额毒化的本地歌单缓存。
  var REPAIR_STAMP_KEY = 'mineradio-local-playlist-repair-v2';
  function ensureLocalStorageClean() {
    try {
      if (localStorage.getItem(REPAIR_STAMP_KEY)) return false; // 本版本已清理过
      clearLocalPlaylistCaches();
      localStorage.setItem(REPAIR_STAMP_KEY, '1');
      showToast('已清理本地歌单历史缓存，请重新导入本地歌单');
      return true;
    } catch (e) { return false; }
  }
  // 手动触发清理（DevTools 调用：window.localPlaylistApi.clearLocalCache()）
  function manualClearLocalCache() {
    try {
      clearLocalPlaylistCaches();
      showToast('已清理本地歌单缓存，请重新导入');
      return true;
    } catch (e) { return false; }
  }

  function registerLocalFoldersOnStartup() {
    var api = localServerApi();
    if (!api || typeof api.registerLocalFolders !== 'function') return;
    var dirs = [];
    localPlaylists.forEach(function (p) { if (p.folderPath) dirs.push(p.folderPath); });
    if (dirs.length) api.registerLocalFolders(dirs);
  }

  function initLocalPlaylists() {
    ensureLocalStorageClean();
    registerLocalFoldersOnStartup();
    bindLocalPlaylistEvents();
    renderLocalPlaylistsSection();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initLocalPlaylists);
    else initLocalPlaylists();
  }

  window.localPlaylistApi = {
    openLocalFolderImport: openLocalFolderImport,
    playLocalPlaylist: playLocalPlaylist,
    deleteLocalPlaylist: deleteLocalPlaylist,
    renderLocalPlaylistsSection: renderLocalPlaylistsSection,
    clearLocalCache: manualClearLocalCache,
  };
})();
