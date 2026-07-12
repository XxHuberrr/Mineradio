const assert = require('assert');
const fs = require('fs');

const main = fs.readFileSync('desktop/main.js', 'utf8');
const preload = fs.readFileSync('desktop/preload.js', 'utf8');

[
  'mineradio-local-library-get',
  'mineradio-local-library-refresh',
  'mineradio-local-playlist-create',
  'mineradio-local-playlist-rename',
  'mineradio-local-playlist-delete',
  'mineradio-local-playlist-add-items',
  'mineradio-local-playlist-remove-items',
].forEach((channel) => {
  assert.ok(main.includes(`ipcMain.handle('${channel}'`), `main should handle ${channel}`);
});

[
  'getLocalLibrary:',
  'refreshLocalLibrary:',
  'createLocalPlaylist:',
  'renameLocalPlaylist:',
  'deleteLocalPlaylist:',
  'addLocalPlaylistItems:',
  'removeLocalPlaylistItems:',
].forEach((method) => {
  assert.ok(preload.includes(method), `preload should expose ${method}`);
});

assert.ok(main.includes("'local-library-v1.json'"), 'store should use the versioned user-data file');

console.log('local library IPC static tests passed');
