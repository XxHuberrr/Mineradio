const assert = require('assert');

const {
  eligibleSearchProviders,
  dedupeSearchResults,
  selectAll,
  invertSelection,
  stableSongRef,
} = require('../public/local-library-core');

assert.deepStrictEqual(eligibleSearchProviders({ qq: false, netease: false }), ['local']);
assert.deepStrictEqual(eligibleSearchProviders({ qq: true, netease: false }), ['local', 'qq']);
assert.deepStrictEqual(eligibleSearchProviders({ qq: false, netease: true }), ['local', 'netease']);
assert.deepStrictEqual(eligibleSearchProviders({ qq: true, netease: true }), ['local', 'qq', 'netease']);

const neteaseSong = { id: 1, provider: 'netease', name: 'Night-Drive', artist: 'Artist' };
const qqSong = { id: 2, mid: 'qq-2', provider: 'qq', name: 'Night Drive', artist: 'Artist' };
const localSong = { id: 'local:a', provider: 'local', name: 'Night Drive', artist: 'Artist', available: true };
const uniqueSong = { id: 3, provider: 'netease', name: 'Other', artist: 'Singer' };
const deduped = dedupeSearchResults([neteaseSong, uniqueSong, qqSong, localSong]);
assert.strictEqual(deduped.length, 2);
assert.strictEqual(deduped[0].provider, 'local');
assert.strictEqual(deduped[1].name, 'Other');

const unavailableLocal = Object.assign({}, localSong, { available: false });
assert.strictEqual(dedupeSearchResults([unavailableLocal, qqSong])[0].provider, 'qq');

assert.deepStrictEqual(Array.from(selectAll(['a', 'b'])), ['a', 'b']);
assert.deepStrictEqual(Array.from(invertSelection(['a', 'b', 'c'], new Set(['a']))), ['b', 'c']);
assert.strictEqual(stableSongRef(localSong), 'local:local:a');
assert.strictEqual(stableSongRef(qqSong), 'qq:qq-2');

console.log('local library core tests passed');
