const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('public/index.html', 'utf8');

assert.ok(html.includes('id="lyrics-mode-btn"'), 'lyrics control should have a stable mode button id');
assert.ok(html.includes('class="lyrics-mode-sub"'), 'lyrics mode should use a subscript-style status label');
assert.ok(html.includes('id="lyrics-mode-sub"'), 'lyrics status should update independently from the word icon');
assert.ok(/lyricDisplayMode:\s*'single'/.test(html), 'lyrics should default to single mode');
assert.ok(/lyricShowTranslation:\s*false/.test(html), 'translation should default off');
assert.ok(html.includes('t-lyricShowTranslation'), 'lyrics settings should expose a translation toggle');
assert.ok(/function\s+cycleLyricDisplayMode\s*\(/.test(html), 'lyrics button should cycle display modes');
assert.ok(html.includes('MineradioLyricCore.alignTranslations'), 'cloud and local translations should use alignment core');
assert.ok(html.includes('MineradioLyricCore.lyricWindow'), 'scroll mode should use a seven-node lyric window');
assert.ok(!html.includes('t-lyricDoubleLine'), 'legacy double-line toggle should be removed');

console.log('lyric display UI static tests passed');
