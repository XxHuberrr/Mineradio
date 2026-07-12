const assert = require('assert');

const {
  nextLyricDisplayMode,
  lyricWindow,
  alignTranslations,
  mergeExactTimestampBilingual,
} = require('../public/lyric-display-core');

assert.strictEqual(nextLyricDisplayMode('off'), 'single');
assert.strictEqual(nextLyricDisplayMode('single'), 'scroll');
assert.strictEqual(nextLyricDisplayMode('scroll'), 'off');
assert.strictEqual(nextLyricDisplayMode('unknown'), 'off');

const lines = Array.from({ length: 10 }, (_, index) => ({ t: index * 4, text: `line ${index}` }));
assert.deepStrictEqual(lyricWindow(lines, 3, 7).map((item) => item.index), [0, 1, 2, 3, 4, 5, 6]);
assert.deepStrictEqual(lyricWindow(lines, 0, 7).map((item) => item.index), [0, 1, 2, 3, 4, 5, 6]);
assert.deepStrictEqual(lyricWindow(lines, 9, 7).map((item) => item.index), [3, 4, 5, 6, 7, 8, 9]);

const original = [
  { t: 1, text: 'One' },
  { t: 5, text: 'Two' },
  { t: 9, text: 'Three' },
];
const translated = [
  { t: 1.2, text: 'Uno' },
  { t: 5.8, text: 'Dos' },
  { t: 20, text: 'Too late' },
];
const aligned = alignTranslations(original, translated);
assert.strictEqual(aligned[0].translation, 'Uno');
assert.strictEqual(aligned[1].translation, 'Dos');
assert.strictEqual(aligned[2].translation, '');

const noReuse = alignTranslations(
  [{ t: 1, text: 'A' }, { t: 1.3, text: 'B' }],
  [{ t: 1.1, text: 'Only translation' }]
);
assert.strictEqual(noReuse.filter((line) => line.translation).length, 1);

const bilingual = mergeExactTimestampBilingual([
  { t: 1, text: 'Hello' },
  { t: 1, text: '你好' },
  { t: 5, text: 'World' },
]);
assert.strictEqual(bilingual.length, 2);
assert.strictEqual(bilingual[0].text, 'Hello');
assert.strictEqual(bilingual[0].translation, '你好');

console.log('lyric display core tests passed');
