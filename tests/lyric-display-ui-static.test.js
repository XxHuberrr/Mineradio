const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('public/index.html', 'utf8');

assert.ok(html.includes('id="lyrics-mode-btn"'), 'lyrics control should have a stable mode button id');
assert.ok(html.includes('class="lyrics-mode-sub"'), 'lyrics mode should use a subscript-style status label');
assert.ok(html.includes('id="lyrics-mode-sub"'), 'lyrics status should update independently from the word icon');
assert.ok(/lyricDisplayMode:\s*'single'/.test(html), 'lyrics should default to single mode');
assert.ok(/lyricDoubleLine:\s*false/.test(html), 'double-line lyrics should default off');
assert.ok(html.includes('t-lyricDoubleLine'), 'lyrics settings should expose a double-line toggle');
assert.ok(html.includes('歌词双行显示'), 'double-line toggle should use the requested label');
assert.ok(/function\s+cycleLyricDisplayMode\s*\(/.test(html), 'lyrics button should cycle display modes');
assert.ok(html.includes('MineradioLyricCore.lyricWindow'), 'scroll mode should use the tested lyric window helper');
assert.ok(!html.includes('t-lyricShowTranslation'), 'translation toggle should be removed from the UI');

console.log('lyric display UI static tests passed');
