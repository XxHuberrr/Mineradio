const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('public/index.html', 'utf8');

assert.ok(/function\s+searchLocalLibrary\s*\(/.test(html), 'search should include the local library');
assert.ok(html.includes('MineradioLocalLibraryCore.eligibleSearchProviders'), 'search should derive providers from login status');
assert.ok(html.includes('MineradioLocalLibraryCore.dedupeSearchResults'), 'search should deduplicate by source priority');
assert.ok(/mode === 'qq'[\s\S]*?!qqLoginStatus\.loggedIn/.test(html), 'QQ-only search should require QQ login');
assert.ok(/mode === 'netease'[\s\S]*?!loginStatus\.loggedIn/.test(html), 'Netease-only search should require Netease login');

console.log('search login routing static tests passed');
