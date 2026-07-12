const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  scanLocalMusicDirectory,
  lookupLocalAudioToken,
  resolveLocalTrackPath,
  clearLocalAudioRegistry,
} = require('../desktop/local-music-library');

function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-local-music-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    clearLocalAudioRegistry();
  }
}

withTempDir((dir) => {
  write(path.join(dir, 'Artist - Night Drive.MP3'), Buffer.from('fake mp3'));
  write(path.join(dir, 'Artist - Night Drive.lrc'), '[00:01.00]hello');
  write(path.join(dir, 'Artist - Night Drive.trans.lrc'), '[00:01.20]你好');
  write(path.join(dir, 'Second Track.flac'), Buffer.from('fake flac'));
  write(path.join(dir, 'Second Track.LYR'), '[00:02.00]world');
  write(path.join(dir, 'cover.jpg'), Buffer.from('image'));

  const result = scanLocalMusicDirectory(dir);

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.folderPath, dir);
  assert.strictEqual(result.tracks.length, 2);
  assert.deepStrictEqual(result.tracks.map((track) => track.name), ['Night Drive', 'Second Track']);
  assert.deepStrictEqual(result.tracks.map((track) => track.artist), ['Artist', '本地音乐']);
  assert.strictEqual(result.tracks[0].localLyricText.trim(), '[00:01.00]hello');
  assert.strictEqual(result.tracks[0].localTranslationText.trim(), '[00:01.20]你好');
  assert.strictEqual(result.tracks[1].localLyricText.trim(), '[00:02.00]world');
  assert.ok(result.tracks[0].localAudioToken);
  assert.strictEqual(result.tracks[0].filePath, undefined);
  assert.strictEqual(lookupLocalAudioToken(result.tracks[0].localAudioToken), path.join(dir, 'Artist - Night Drive.MP3'));
  assert.strictEqual(resolveLocalTrackPath(result.tracks[0].id), path.join(dir, 'Artist - Night Drive.MP3'));

  const originalId = result.tracks[0].id;
  write(path.join(dir, 'Artist - Night Drive.MP3'), Buffer.from('updated fake mp3'));
  const rescanned = scanLocalMusicDirectory(dir);
  assert.strictEqual(rescanned.tracks[0].id, originalId);
});

withTempDir((dir) => {
  write(path.join(dir, 'nested', 'Deep Song.wav'), Buffer.from('fake wav'));
  const result = scanLocalMusicDirectory(dir);

  assert.strictEqual(result.tracks.length, 1);
  assert.strictEqual(result.tracks[0].name, 'Deep Song');
  assert.strictEqual(result.tracks[0].format, 'wav');
});

console.log('local-music-library tests passed');
