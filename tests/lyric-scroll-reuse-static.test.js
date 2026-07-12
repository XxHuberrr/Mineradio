const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('public/index.html', 'utf8');

const showScroll = html.match(/function\s+showStageScroll\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/);
assert.ok(showScroll, 'showStageScroll should exist');
assert.ok(!showScroll[1].includes('clearStageScrollMeshes()'), 'ordinary scroll updates should not clear every lyric mesh');
assert.ok(html.includes('function updateStageScrollSlots'), 'scroll mode should update two reusable slots');
assert.ok(/lyricWindow\(lines,\s*currentIndex,\s*2\)/.test(html), 'scroll mode should request exactly two lyric nodes');
assert.ok(html.includes('scrollStats'), 'scroll mode should expose reuse diagnostics');

console.log('lyric scroll reuse static tests passed');
