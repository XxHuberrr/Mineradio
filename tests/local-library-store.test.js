const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createLocalLibraryStore } = require('../desktop/local-library-store');
const { scanLocalMusicDirectory, clearLocalAudioRegistry } = require('../desktop/local-music-library');

function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-library-store-'));
try {
  const folderA = path.join(root, 'A');
  const folderB = path.join(root, 'B');
  const dataFile = path.join(root, 'state', 'local-library-v1.json');
  const audioA = path.join(folderA, 'Artist - Alpha.mp3');
  const audioB = path.join(folderB, 'Beta.flac');
  write(audioA, Buffer.from('alpha'));
  write(audioB, Buffer.from('beta'));

  const store = createLocalLibraryStore({ dataFile, scanDirectory: scanLocalMusicDirectory });
  store.addFolder(folderA);
  store.addFolder(folderB);
  let library = store.getLibrary();
  assert.strictEqual(library.folders.length, 2);
  assert.strictEqual(library.tracks.length, 2);
  assert.ok(library.tracks.every((track) => track.available));

  store.addFolder(folderA);
  library = store.getLibrary();
  assert.strictEqual(library.folders.length, 2);
  assert.strictEqual(library.tracks.length, 2);

  const playlist = store.createPlaylist('夜间');
  const localSong = library.tracks.find((track) => track.name === 'Alpha');
  const qqSong = { id: 'qq-mid-1', provider: 'qq', name: 'Cloud', artist: 'Singer', mid: 'qq-mid-1' };
  const addResult = store.addPlaylistItems(playlist.id, [localSong, localSong, qqSong]);
  assert.strictEqual(addResult.added, 2);
  assert.strictEqual(store.getPlaylist(playlist.id).items.length, 2);

  assert.strictEqual(store.renamePlaylist(playlist.id, '深夜').name, '深夜');

  const reopened = createLocalLibraryStore({ dataFile, scanDirectory: scanLocalMusicDirectory });
  const reopenedLibrary = reopened.getLibrary();
  assert.strictEqual(reopenedLibrary.folders.length, 2);
  assert.strictEqual(reopenedLibrary.playlists.length, 1);
  assert.strictEqual(reopenedLibrary.playlists[0].name, '深夜');

  fs.rmSync(folderA, { recursive: true, force: true });
  reopened.refreshAllFolders();
  const missingTrack = reopened.getLibrary().tracks.find((track) => track.name === 'Alpha');
  assert.strictEqual(missingTrack.available, false);

  assert.strictEqual(reopened.deletePlaylist(playlist.id), true);
  assert.strictEqual(reopened.getLibrary().playlists.length, 0);
  assert.strictEqual(fs.existsSync(audioB), true);

  const persisted = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  const serialized = JSON.stringify(persisted);
  assert.ok(!serialized.includes('localAudioToken'));
  assert.ok(!serialized.includes('localLyricText'));
  assert.ok(!serialized.includes('localTranslationText'));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
  clearLocalAudioRegistry();
}

console.log('local library store tests passed');
