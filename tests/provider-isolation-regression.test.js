'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `${name} must exist`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`${name} must have a complete body`);
}

const accountActions = read('public', 'js', 'modules', '05-playback', '06-track-detail-lyrics-actions.js');
const likeContext = {
  likedSongMap: {},
  songAccountStateKey: (song) => `${song.provider}:${song.id}`,
  songAccountProvider: (song) => song.provider,
};
vm.createContext(likeContext);
vm.runInContext(extractFunction(accountActions, 'isSongLiked'), likeContext);

assert.strictEqual(likeContext.isSongLiked({ provider: 'netease', id: '1', isFavorite: true }), false, 'AI favorite metadata must not alter upstream Netease liked-state behavior');
assert.strictEqual(likeContext.isSongLiked({ provider: 'ai6666', id: '1', isFavorite: true }), true, 'AI6666 must honor favorite metadata returned with its songs');
likeContext.likedSongMap['netease:1'] = true;
assert.strictEqual(likeContext.isSongLiked({ provider: 'netease', id: '1' }), true, 'existing provider-scoped liked-state maps must retain priority');

const lyricSource = read('public', 'js', 'modules', '06-lyrics', '00-lyrics-fetch-parse.js');
const lyricContext = {
  plainParseCalls: 0,
  parseYrcText: () => [],
  parseLyricText: () => [],
  parsePlainLyricText: () => {
    lyricContext.plainParseCalls += 1;
    return [{ t: 0, text: 'plain lyric' }];
  },
  playbackDurationFromSong: () => 180,
  buildLyricTranslationPayload: () => ({ lines: [], source: 'none' }),
  attachLyricTranslations: (lines) => lines,
  withLyricFallbackForSong: (_song, lines) => lines.length ? lines : [{ t: 0, text: 'fallback', fallback: true }],
  cloneLyricLines: (lines) => lines.slice(),
  hasUsableLyricLines: (lines) => lines.length > 0,
};
vm.createContext(lyricContext);
vm.runInContext(extractFunction(lyricSource, 'parseLyricResponseToOriginalState'), lyricContext);

const neteaseLyrics = lyricContext.parseLyricResponseToOriginalState({ provider: 'netease', id: '1' }, { plainLyric: 'must stay ignored' });
assert.strictEqual(lyricContext.plainParseCalls, 0, 'AI plain-lyric estimation must not change existing providers');
assert.strictEqual(neteaseLyrics.timingSource, 'fallback');

const aiLyrics = lyricContext.parseLyricResponseToOriginalState({ provider: 'ai6666', id: '1' }, { plainLyric: 'plain lyric' });
assert.strictEqual(lyricContext.plainParseCalls, 1, 'AI6666 plain lyrics must use the isolated estimation fallback');
assert.strictEqual(aiLyrics.timingSource, 'plain-estimated');

console.log('[OK] AI6666 favorite and lyric fallbacks remain isolated from upstream providers.');
