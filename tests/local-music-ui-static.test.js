const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('public/index.html', 'utf8');

assert.ok(html.includes('批量导入本地歌曲'), 'queue panel should expose the batch local import button');
assert.ok(
  /<button[^>]*id="upload-btn"[^>]*onclick="openLocalMusicFolder\(\)"[^>]*>/.test(html),
  'top upload button should open folder batch import'
);
assert.ok(
  /function\s+openHomeLocalImport\s*\(\)\s*\{[\s\S]*?openLocalMusicFolder\(\);[\s\S]*?\}/.test(html),
  'Home local import should use folder batch import'
);
assert.ok(html.includes('src="local-library-core.js"'), 'local library core should load before the app script');
assert.ok(html.includes('src="lyric-display-core.js"'), 'lyric display core should load before the app script');
assert.ok(html.includes('id="tab-local"'), 'playlist panel should expose a local library tab');
assert.ok(html.includes('id="local-pane"'), 'playlist panel should expose the local library pane');
assert.ok(html.includes('id="local-library-list"'), 'local library should have a track list');
assert.ok(html.includes('id="local-playlist-list"'), 'local playlists should have a list');
assert.ok(html.includes('onclick="selectAllLocalTracks()"'), 'local library should support select all');
assert.ok(html.includes('onclick="invertLocalTrackSelection()"'), 'local library should support invert selection');
assert.ok(html.includes('onclick="clearLocalTrackSelection()"'), 'local library should support clearing selection');
assert.ok(html.includes('onclick="addSelectedLocalTracksToPlaylist()"'), 'local library should support batch playlist add');
assert.ok(/function\s+loadPersistentLocalLibrary\s*\(/.test(html), 'startup should restore the persistent local library');
assert.ok(/function\s+createLocalPlaylist\s*\(/.test(html), 'users should be able to create local playlists');
assert.ok(/function\s+renameLocalPlaylist\s*\(/.test(html), 'users should be able to rename local playlists');
assert.ok(/function\s+deleteLocalPlaylist\s*\(/.test(html), 'users should be able to delete local playlists');
assert.ok(/function\s+playLocalPlaylist\s*\(/.test(html), 'users should be able to play a local playlist');

console.log('local-music-ui static tests passed');
