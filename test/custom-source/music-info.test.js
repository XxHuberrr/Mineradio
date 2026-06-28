const test = require('node:test');
const assert = require('node:assert/strict');
const { toLxMusicInfo } = require('../../desktop/custom-source/music-info');

test('maps NetEase tracks to wy MusicInfo', () => {
  const info = toLxMusicInfo({ provider: 'netease', id: 123, name: 'Song', artist: 'Singer', album: 'Album', duration: 195000, cover: 'https://img' });
  assert.equal(info.source, 'wy');
  assert.equal(info.meta.songId, 123);
  assert.equal(info.songmid, 123);
  assert.equal(info.interval, '03:15');
});

test('maps QQ identifiers to tx fields and legacy aliases', () => {
  const info = toLxMusicInfo({
    provider: 'qq', id: 'mid1', qqId: 88, mid: 'mid1', mediaMid: 'media1',
    albumMid: 'album1', name: 'Song', artist: 'Singer', album: 'Album', duration: 200,
  });
  assert.equal(info.source, 'tx');
  assert.equal(info.meta.strMediaMid, 'media1');
  assert.equal(info.meta.albumMid, 'album1');
  assert.equal(info.songmid, 'mid1');
  assert.equal(info.interval, '03:20');
});

test('uses QQ songId as media mid alias before computed songmid fallback', () => {
  const info = toLxMusicInfo({ provider: 'qq', mid: 'song-mid', songId: 'media-from-songid' });
  assert.equal(info.meta.strMediaMid, 'media-from-songid');
  assert.equal(info.songmid, 'song-mid');
});

test('formats NetEase millisecond durations below ten seconds', () => {
  const info = toLxMusicInfo({ provider: 'netease', id: 1, duration: 9000 });
  assert.equal(info.interval, '00:09');
});
