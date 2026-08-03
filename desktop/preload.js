const { contextBridge, ipcRenderer, clipboard, webUtils } = require('electron');
const path = require('path');

contextBridge.exposeInMainWorld('desktopWindow', {
  isDesktop: true,
  minimize: () => ipcRenderer.invoke('desktop-window-minimize'),
  restore: () => ipcRenderer.invoke('desktop-window-restore'),
  toggleMaximize: () => ipcRenderer.invoke('desktop-window-toggle-maximize'),
  toggleFullscreen: () => ipcRenderer.invoke('desktop-window-toggle-fullscreen'),
  exitFullscreenWindowed: () => ipcRenderer.invoke('desktop-window-exit-fullscreen-windowed'),
  getState: () => ipcRenderer.invoke('desktop-window-get-state'),
  getGpuDiagnostics: () => ipcRenderer.invoke('mineradio-get-gpu-diagnostics'),
  getMemorySnapshot: () => ipcRenderer.invoke('mineradio-memory-get-snapshot'),
  configureMemoryReduct: (payload) => ipcRenderer.invoke('mineradio-memory-configure-auto', payload || {}),
  trimAppMemory: (payload) => ipcRenderer.invoke('mineradio-memory-trim-app', payload || {}),
  purgeSystemMemory: (payload) => ipcRenderer.invoke('mineradio-memory-purge-system', payload || {}),
  getCacheSettings: () => ipcRenderer.invoke('mineradio-cache-get-settings'),
  chooseCacheDirectory: () => ipcRenderer.invoke('mineradio-cache-choose-directory'),
  setCacheSettings: (payload) => ipcRenderer.invoke('mineradio-cache-set-settings', payload || {}),
  listWallpaperEngineProjects: (payload) => ipcRenderer.invoke('mineradio-wallpaper-engine-list', payload || {}),
  getWallpaperEngineProjectDetails: (id) => ipcRenderer.invoke('mineradio-wallpaper-engine-project-details', String(id || '')),
  openWallpaperEngineProjectDetails: (id, target) => ipcRenderer.invoke('mineradio-wallpaper-engine-open-project-details', {
    id: String(id || ''),
    target: target === 'workshop' ? 'workshop' : 'we',
  }),
  chooseWallpaperEngineDirectory: () => ipcRenderer.invoke('mineradio-wallpaper-engine-choose-directory'),
  chooseWallpaperEngineProjectFile: () => ipcRenderer.invoke('mineradio-wallpaper-engine-choose-project-file'),
  removeWallpaperEngineDirectory: (rootId) => ipcRenderer.invoke('mineradio-wallpaper-engine-remove-directory', String(rootId || '')),
  getWallpaperEngineRuntimeStatus: (payload) => ipcRenderer.invoke('mineradio-wallpaper-engine-runtime-status', payload || {}),
  startWallpaperEngineScene: (payload) => ipcRenderer.invoke('mineradio-wallpaper-engine-start-scene', payload || {}),
  reportWallpaperEngineCaptureResult: (payload) => ipcRenderer.invoke('mineradio-wallpaper-engine-capture-result', payload || {}),
  prepareWallpaperEngineGlassCapture: (payload) => ipcRenderer.invoke('mineradio-wallpaper-engine-prepare-glass-capture', payload || {}),
  activateWallpaperEngineDwmSurface: (payload) => ipcRenderer.invoke('mineradio-wallpaper-engine-activate-dwm-surface', payload || {}),
  updateWallpaperEngineGlassSurface: (payload) => ipcRenderer.send('mineradio-wallpaper-engine-glass-surface', payload || {}),
  reportWallpaperEnginePointerActivity: (payload) => ipcRenderer.send('mineradio-wallpaper-engine-pointer-activity', payload || {}),
  stopWallpaperEngineScene: (payload) => ipcRenderer.invoke('mineradio-wallpaper-engine-stop-scene', payload || {}),
  onWallpaperEngineHostBoundsChanged: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload || {});
    ipcRenderer.on('mineradio-wallpaper-engine-host-bounds-changed', listener);
    return () => ipcRenderer.removeListener('mineradio-wallpaper-engine-host-bounds-changed', listener);
  },
  listLocalMusicLibrary: () => ipcRenderer.invoke('mineradio-local-library-list'),
  readLocalMusicLyric: (localFileId) => ipcRenderer.invoke('mineradio-local-library-lyric', String(localFileId || '')),
  importLocalMusicFiles: async (files) => {
    const entries = [];
    for (const file of Array.from(files || [])) {
      let filePath = '';
      try {
        filePath = webUtils && typeof webUtils.getPathForFile === 'function' ? webUtils.getPathForFile(file) : '';
      } catch (_) {}
      if (!filePath) continue;
      entries.push({
        path: filePath,
        relativePath: String(file && (file.webkitRelativePath || file.name) || ''),
      });
    }
    if (!entries.length) return { ok: false, count: 0, tracks: [], error: 'NO_AUTHORIZED_LOCAL_AUDIO' };
    const authorization = await ipcRenderer.invoke('mineradio-local-library-authorize', { files: entries });
    if (!authorization || authorization.ok !== true || !authorization.token) return authorization;
    return ipcRenderer.invoke('mineradio-local-library-import', { token: authorization.token });
  },
  importLocalPlaylistFiles: async (files) => {
    // m3u / m3u8 / pls 播放列表导入：主进程解析出音频文件路径后复用 authorize + import 管线。
    const entries = [];
    for (const file of Array.from(files || [])) {
      let filePath = '';
      try {
        filePath = webUtils && typeof webUtils.getPathForFile === 'function' ? webUtils.getPathForFile(file) : '';
      } catch (_) {}
      if (!filePath) continue;
      entries.push({ path: filePath, relativePath: String(file && (file.webkitRelativePath || file.name) || '') });
    }
    if (!entries.length) return { ok: false, count: 0, tracks: [], error: 'NO_AUTHORIZED_PLAYLIST' };
    const parsed = await ipcRenderer.invoke('mineradio-local-library-parse-playlist', { files: entries });
    if (!parsed || parsed.ok !== true || !Array.isArray(parsed.entries) || !parsed.entries.length) {
      return {
        ok: false,
        count: 0,
        tracks: [],
        urls: parsed && parsed.urls || [],
        missing: parsed && parsed.missing || [],
        error: parsed && parsed.error || 'LOCAL_PLAYLIST_PARSE_EMPTY',
      };
    }
    const authorization = await ipcRenderer.invoke('mineradio-local-library-authorize', { files: parsed.entries });
    if (!authorization || authorization.ok !== true || !authorization.token) return authorization;
    return ipcRenderer.invoke('mineradio-local-library-import', { token: authorization.token });
  },
  scanLocalMusicDirectory: async (files) => {
    // 目录扫描：由 webkitdirectory 返回的文件推导所选目录绝对路径，主进程递归扫描后走导入管线。
    let firstPath = '';
    let firstRel = '';
    for (const file of Array.from(files || [])) {
      let filePath = '';
      try {
        filePath = webUtils && typeof webUtils.getPathForFile === 'function' ? webUtils.getPathForFile(file) : '';
      } catch (_) {}
      if (!filePath) continue;
      firstPath = filePath;
      firstRel = String(file && (file.webkitRelativePath || file.name) || '');
      break;
    }
    if (!firstPath) return { ok: false, count: 0, tracks: [], error: 'NO_AUTHORIZED_LOCAL_AUDIO' };
    // webkitRelativePath 形如 "所选目录名/子路径/.../文件名"，第一段即所选目录名。
    // 从文件绝对路径的 dirname 向上推 (relSegments.length - 2) 层即可回到所选目录。
    const relSegments = firstRel.split(/[\\/]+/).filter(Boolean);
    let directory = path.dirname(firstPath);
    if (relSegments.length > 1) {
      for (let i = 0; i < relSegments.length - 2; i += 1) directory = path.dirname(directory);
    }
    const scanned = await ipcRenderer.invoke('mineradio-local-library-scan-directory', { path: directory });
    if (!scanned || scanned.ok !== true || !Array.isArray(scanned.entries) || !scanned.entries.length) {
      return { ok: false, count: 0, tracks: [], error: scanned && scanned.error || 'LOCAL_LIBRARY_SCAN_EMPTY' };
    }
    const authorization = await ipcRenderer.invoke('mineradio-local-library-authorize', { files: scanned.entries });
    if (!authorization || authorization.ok !== true || !authorization.token) return authorization;
    return ipcRenderer.invoke('mineradio-local-library-import', { token: authorization.token });
  },
  exportLocalQueueAsM3U: (tracks) => ipcRenderer.invoke('mineradio-local-library-export-m3u', {
    tracks: Array.isArray(tracks) ? tracks : [],
    defaultName: 'mineradio-queue.m3u',
  }),
  readLyricCache: (key) => ipcRenderer.invoke('mineradio-cache-read-lyric', key || ''),
  writeLyricCache: (key, payload) => ipcRenderer.invoke('mineradio-cache-write-lyric', key || '', payload || {}),
  close: (behavior) => ipcRenderer.invoke('desktop-window-close', behavior),
  getCloseBehavior: () => ipcRenderer.invoke('desktop-window-get-close-behavior'),
  setCloseBehavior: (behavior) => ipcRenderer.invoke('desktop-window-set-close-behavior', behavior),
  getLoginEasterEggStatus: () => ipcRenderer.invoke('mineradio-login-easter-egg-status'),
  unlockLoginEasterEgg: (value) => ipcRenderer.invoke('mineradio-login-easter-egg-unlock', String(value || '')),
  resetLoginEasterEgg: () => ipcRenderer.invoke('mineradio-login-easter-egg-reset'),
  openNeteaseMusicLogin: () => ipcRenderer.invoke('netease-music-open-login'),
  clearNeteaseMusicLogin: () => ipcRenderer.invoke('netease-music-clear-login'),
  openQQMusicLogin: (options) => ipcRenderer.invoke('qq-music-open-login', options || {}),
  clearQQMusicLogin: () => ipcRenderer.invoke('qq-music-clear-login'),
  openKugouMusicLogin: () => ipcRenderer.invoke('kugou-music-open-login'),
  clearKugouMusicLogin: () => ipcRenderer.invoke('kugou-music-clear-login'),
  clearQishuiMusicLogin: () => ipcRenderer.invoke('qishui-music-clear-login'),
  openSpotifyMusicLogin: () => ipcRenderer.invoke('spotify-music-open-login'),
  clearSpotifyMusicLogin: () => ipcRenderer.invoke('spotify-music-clear-login'),
  openUpdatePage: (url) => ipcRenderer.invoke('mineradio-open-update-page', String(url || '')),
  restartApp: () => ipcRenderer.invoke('mineradio-restart-app'),
  configureGlobalHotkeys: (bindings) => ipcRenderer.invoke('mineradio-hotkeys-configure-global', bindings || []),
  configureMediaKeys: (enabled) => ipcRenderer.invoke('mineradio-media-keys-configure', enabled !== false),
  setThumbarPlaying: (playing) => ipcRenderer.send('mineradio-thumbar-playback', !!playing),
  copyText: (text) => {
    clipboard.writeText(String(text || ''));
    return { ok: true };
  },
  readText: () => ({ ok: true, text: clipboard.readText() || '' }),
  exportJsonFile: (payload) => ipcRenderer.invoke('mineradio-export-json-file', payload || {}),
  exportLoginCookie: (provider) => ipcRenderer.invoke('mineradio-export-login-cookie', provider || ''),
  importJsonFile: () => ipcRenderer.invoke('mineradio-import-json-file'),
  readCurrentFxAutosaveSync: () => ipcRenderer.sendSync('mineradio-current-fx-autosave-read-sync'),
  saveCurrentFxAutosaveSync: (payload) => ipcRenderer.sendSync('mineradio-current-fx-autosave-save-sync', payload || {}),
  saveCurrentFxAutosave: (payload) => ipcRenderer.invoke('mineradio-current-fx-autosave-save', payload || {}),
  onGlobalHotkey: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload || {});
    ipcRenderer.on('mineradio-global-hotkey', listener);
    return () => ipcRenderer.removeListener('mineradio-global-hotkey', listener);
  },
  toggleMusicWidget: (payload) => ipcRenderer.invoke('mineradio-music-widget-toggle', payload || {}),
  updateMusicWidget: (payload) => ipcRenderer.invoke('mineradio-music-widget-update', payload || {}),
  closeMusicWidget: () => ipcRenderer.invoke('mineradio-music-widget-close'),
  seekMusicWidget: (ratio) => ipcRenderer.send('mineradio-music-widget-seek', Number(ratio) || 0),
  onMusicWidgetState: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload || {});
    ipcRenderer.on('mineradio-music-widget-state', listener);
    return () => ipcRenderer.removeListener('mineradio-music-widget-state', listener);
  },
  onMusicWidgetSeek: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload || {});
    ipcRenderer.on('mineradio-music-widget-seek', listener);
    return () => ipcRenderer.removeListener('mineradio-music-widget-seek', listener);
  },
  onMusicWidgetClosed: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = () => callback();
    ipcRenderer.on('mineradio-music-widget-closed', listener);
    return () => ipcRenderer.removeListener('mineradio-music-widget-closed', listener);
  },
  controlMusicWidget: (action) => ipcRenderer.send('mineradio-music-widget-control', action),
  onMusicWidgetControl: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload || {});
    ipcRenderer.on('mineradio-music-widget-control', listener);
    return () => ipcRenderer.removeListener('mineradio-music-widget-control', listener);
  },
  setDesktopLyricsEnabled: (enabled, payload) => ipcRenderer.invoke('mineradio-desktop-lyrics-set-enabled', !!enabled, payload || {}),
  updateDesktopLyrics: (payload) => ipcRenderer.invoke('mineradio-desktop-lyrics-update', payload || {}),
  onDesktopLyricsLockState: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload || {});
    ipcRenderer.on('mineradio-desktop-lyrics-lock-state', listener);
    return () => ipcRenderer.removeListener('mineradio-desktop-lyrics-lock-state', listener);
  },
  onDesktopLyricsEnabledState: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload || {});
    ipcRenderer.on('mineradio-desktop-lyrics-enabled-state', listener);
    return () => ipcRenderer.removeListener('mineradio-desktop-lyrics-enabled-state', listener);
  },
  setWallpaperMode: (enabled, payload) => ipcRenderer.invoke('mineradio-wallpaper-set-enabled', !!enabled, payload || {}),
  updateWallpaperMode: (payload) => ipcRenderer.invoke('mineradio-wallpaper-update', payload || {}),
  getWallpaperModeStatus: () => ipcRenderer.invoke('mineradio-wallpaper-get-status'),
  updateDesktopIconShields: (payload) => ipcRenderer.send('mineradio-full-desktop-icon-shields', payload || {}),
  setDesktopSoftwareLocked: (locked) => ipcRenderer.invoke('mineradio-full-desktop-set-software-lock', locked === true),
  setDesktopIconsVisible: (visible) => ipcRenderer.invoke('mineradio-full-desktop-set-icons-visible', visible !== false),
  requestDesktopKeyboardFocus: (reason) => ipcRenderer.invoke(
    'mineradio-full-desktop-request-keyboard-focus',
    String(reason || 'renderer-pointerdown').slice(0, 80)
  ),
  updateDesktopPointerRoute: (payload) => ipcRenderer.send('mineradio-full-desktop-pointer-route', {
    overSoftwareUi: payload && payload.overSoftwareUi === true,
    overDesktopControls: payload && payload.overDesktopControls === true,
  }),
  onWallpaperModeState: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload || {});
    ipcRenderer.on('mineradio-wallpaper-runtime-state', listener);
    return () => ipcRenderer.removeListener('mineradio-wallpaper-runtime-state', listener);
  },
  onStateChange: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('desktop-window-state', listener);
    return () => ipcRenderer.removeListener('desktop-window-state', listener);
  },
});

window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.classList.add('desktop-shell-root');
  document.body.classList.add('desktop-shell');
});
