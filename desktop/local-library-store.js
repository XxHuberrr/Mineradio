const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const STORE_VERSION = 1;

function emptyState() {
  return { version: STORE_VERSION, folders: [], tracks: {}, playlists: [] };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeFolderPath(folderPath) {
  return path.resolve(String(folderPath || '')).replace(/[\\/]+$/, '');
}

function folderIdForPath(folderPath) {
  return `folder:${crypto.createHash('sha1').update(normalizeFolderPath(folderPath).toLowerCase()).digest('hex').slice(0, 16)}`;
}

function playlistItemRef(song) {
  const provider = song && (song.provider || song.source || song.type) || 'netease';
  if (provider === 'local') return String(song.id || song.localKey || '');
  if (provider === 'qq') return String(song.mid || song.songmid || song.id || '');
  return String(song.id || '');
}

function normalizePlaylistItem(song) {
  const provider = song && (song.provider || song.source || song.type) || 'netease';
  const normalizedProvider = provider === 'local' ? 'local' : (provider === 'qq' ? 'qq' : 'netease');
  const ref = playlistItemRef(song);
  if (!ref) return null;
  const snapshot = Object.assign({}, song || {});
  delete snapshot.localAudioToken;
  delete snapshot.localLyricText;
  delete snapshot.localTranslationText;
  delete snapshot.filePath;
  return { ref, provider: normalizedProvider, snapshot };
}

function playlistItemKey(item) {
  return `${item.provider}:${item.ref}`;
}

function trackForDisk(track, folderId) {
  const copy = Object.assign({}, track || {}, {
    folderId,
    available: !!(track && track.available !== false),
  });
  delete copy.localAudioToken;
  delete copy.localLyricText;
  delete copy.localTranslationText;
  delete copy.filePath;
  return copy;
}

function writeStateAtomic(filePath, state) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), 'utf8');
  try {
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
    fs.renameSync(tempPath, filePath);
  }
}

function readState(dataFile) {
  if (!fs.existsSync(dataFile)) return emptyState();
  try {
    const parsed = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    if (!parsed || parsed.version !== STORE_VERSION) return emptyState();
    parsed.folders = Array.isArray(parsed.folders) ? parsed.folders : [];
    parsed.tracks = parsed.tracks && typeof parsed.tracks === 'object' ? parsed.tracks : {};
    parsed.playlists = Array.isArray(parsed.playlists) ? parsed.playlists : [];
    Object.keys(parsed.tracks).forEach((id) => {
      parsed.tracks[id].available = false;
    });
    return parsed;
  } catch (error) {
    const corruptPath = `${dataFile}.corrupt-${Date.now()}`;
    try { fs.renameSync(dataFile, corruptPath); } catch (renameError) {}
    return emptyState();
  }
}

function createLocalLibraryStore(options = {}) {
  const dataFile = path.resolve(String(options.dataFile || 'local-library-v1.json'));
  const scanDirectory = options.scanDirectory;
  if (typeof scanDirectory !== 'function') throw new TypeError('scanDirectory is required');

  const state = readState(dataFile);
  const runtimeTracks = new Map();

  function persist() {
    writeStateAtomic(dataFile, state);
  }

  function folderByIdOrPath(idOrPath) {
    const value = String(idOrPath || '');
    const normalized = value.startsWith('folder:') ? '' : normalizeFolderPath(value).toLowerCase();
    return state.folders.find((folder) => folder.id === value || (normalized && normalizeFolderPath(folder.path).toLowerCase() === normalized));
  }

  function refreshFolder(idOrPath, persistAfter = true) {
    const folder = folderByIdOrPath(idOrPath);
    if (!folder) return null;
    const now = Date.now();
    try {
      const result = scanDirectory(folder.path);
      if (!result || !result.ok) throw new Error(result && result.error || 'LOCAL_MUSIC_SCAN_FAILED');
      const seen = new Set();
      (result.tracks || []).forEach((track) => {
        if (!track || !track.id) return;
        seen.add(track.id);
        state.tracks[track.id] = trackForDisk(Object.assign({}, track, { available: true, lastSeenAt: now }), folder.id);
        runtimeTracks.set(track.id, Object.assign({}, track, { folderId: folder.id, available: true, lastSeenAt: now }));
      });
      Object.keys(state.tracks).forEach((id) => {
        if (state.tracks[id].folderId === folder.id && !seen.has(id)) {
          state.tracks[id].available = false;
          runtimeTracks.delete(id);
        }
      });
      folder.name = path.basename(folder.path) || folder.path;
      folder.status = 'available';
      folder.lastScannedAt = now;
    } catch (error) {
      folder.status = error && error.code === 'EACCES' ? 'unreadable' : 'missing';
      folder.lastScannedAt = now;
      Object.keys(state.tracks).forEach((id) => {
        if (state.tracks[id].folderId === folder.id) {
          state.tracks[id].available = false;
          runtimeTracks.delete(id);
        }
      });
    }
    if (persistAfter) persist();
    return clone(folder);
  }

  function addFolder(folderPath) {
    const normalized = normalizeFolderPath(folderPath);
    let folder = folderByIdOrPath(normalized);
    if (!folder) {
      folder = {
        id: folderIdForPath(normalized),
        path: normalized,
        name: path.basename(normalized) || normalized,
        addedAt: Date.now(),
        lastScannedAt: 0,
        status: 'available',
      };
      state.folders.push(folder);
    }
    refreshFolder(folder.id, false);
    persist();
    return getLibrary();
  }

  function refreshAllFolders() {
    state.folders.forEach((folder) => refreshFolder(folder.id, false));
    persist();
    return getLibrary();
  }

  function getTrackSnapshot(id) {
    const disk = state.tracks[id];
    if (!disk) return null;
    const runtime = runtimeTracks.get(id);
    return Object.assign({}, disk, runtime || {}, { available: !!runtime && runtime.available !== false });
  }

  function getLibrary() {
    return {
      version: STORE_VERSION,
      folders: clone(state.folders),
      tracks: Object.keys(state.tracks).map(getTrackSnapshot).filter(Boolean),
      playlists: clone(state.playlists),
    };
  }

  function createPlaylist(name) {
    const cleanName = String(name || '').trim().slice(0, 40);
    if (!cleanName) throw new Error('PLAYLIST_NAME_REQUIRED');
    const now = Date.now();
    const playlist = { id: `playlist:${crypto.randomUUID()}`, name: cleanName, createdAt: now, updatedAt: now, items: [] };
    state.playlists.push(playlist);
    persist();
    return clone(playlist);
  }

  function getPlaylist(id) {
    const playlist = state.playlists.find((item) => item.id === String(id || ''));
    return playlist ? clone(playlist) : null;
  }

  function renamePlaylist(id, name) {
    const playlist = state.playlists.find((item) => item.id === String(id || ''));
    const cleanName = String(name || '').trim().slice(0, 40);
    if (!playlist) throw new Error('PLAYLIST_NOT_FOUND');
    if (!cleanName) throw new Error('PLAYLIST_NAME_REQUIRED');
    playlist.name = cleanName;
    playlist.updatedAt = Date.now();
    persist();
    return clone(playlist);
  }

  function deletePlaylist(id) {
    const index = state.playlists.findIndex((item) => item.id === String(id || ''));
    if (index < 0) return false;
    state.playlists.splice(index, 1);
    persist();
    return true;
  }

  function addPlaylistItems(id, songs) {
    const playlist = state.playlists.find((item) => item.id === String(id || ''));
    if (!playlist) throw new Error('PLAYLIST_NOT_FOUND');
    const existing = new Set(playlist.items.map(playlistItemKey));
    let added = 0;
    (Array.isArray(songs) ? songs : []).forEach((song) => {
      const item = normalizePlaylistItem(song);
      if (!item || existing.has(playlistItemKey(item))) return;
      playlist.items.push(item);
      existing.add(playlistItemKey(item));
      added++;
    });
    if (added) {
      playlist.updatedAt = Date.now();
      persist();
    }
    return { added, playlist: clone(playlist) };
  }

  function removePlaylistItems(id, refs) {
    const playlist = state.playlists.find((item) => item.id === String(id || ''));
    if (!playlist) throw new Error('PLAYLIST_NOT_FOUND');
    const remove = new Set((Array.isArray(refs) ? refs : []).map(String));
    const before = playlist.items.length;
    playlist.items = playlist.items.filter((item) => !remove.has(item.ref) && !remove.has(playlistItemKey(item)));
    const removed = before - playlist.items.length;
    if (removed) {
      playlist.updatedAt = Date.now();
      persist();
    }
    return { removed, playlist: clone(playlist) };
  }

  return {
    addFolder,
    refreshFolder,
    refreshAllFolders,
    getLibrary,
    getPlaylist,
    createPlaylist,
    renamePlaylist,
    deletePlaylist,
    addPlaylistItems,
    removePlaylistItems,
  };
}

module.exports = {
  STORE_VERSION,
  createLocalLibraryStore,
  folderIdForPath,
  playlistItemRef,
};
