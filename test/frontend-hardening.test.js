const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

function extractFunction(name) {
  const match = source.match(new RegExp(`function ${name}\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}`));
  assert.ok(match, `${name} must be defined`);
  return match[0];
}

test('escAttr escapes HTML attribute metacharacters', () => {
  const context = {};
  vm.runInNewContext(`${extractFunction('escAttr')}; this.result = escAttr;`, context);
  const escAttr = context.result;

  assert.equal(
    escAttr('https://img.test/a?x=" onerror="alert(1)'),
    'https://img.test/a?x=&quot; onerror=&quot;alert(1)',
  );
  assert.equal(escAttr("<&>'"), '&lt;&amp;&gt;&#39;');
});

test('dynamic image src templates use attribute-context escaping', () => {
  const unsafeLines = source.split('\n').filter((line) => (
    line.includes('<img')
    && line.includes('src="\' + ')
    && !line.includes('src="\' + escAttr(')
  ));

  assert.deepEqual(unsafeLines, []);
});

test('dual-account preference reads and writes safe versioned values', () => {
  const declarations = source.match(/var DUAL_ACCOUNT_STORE_KEY[\s\S]*?var dualAccountMode = loadDualAccountPreference\(\);/);
  assert.ok(declarations, 'dual-account preference helpers must be defined');

  const stored = new Map([['mineradio-dual-account-mode-v1', '1']]);
  const context = {
    localStorage: {
      getItem(key) { return stored.get(key); },
      setItem(key, value) { stored.set(key, value); },
    },
  };
  vm.runInNewContext(`${declarations[0]}; this.api = { loadDualAccountPreference, saveDualAccountPreference, dualAccountMode };`, context);

  assert.equal(context.api.dualAccountMode, true);
  context.api.saveDualAccountPreference(false);
  assert.equal(stored.get('mineradio-dual-account-mode-v1'), '0');
  stored.set('mineradio-dual-account-mode-v1', 'invalid');
  assert.equal(context.api.loadDualAccountPreference(), false);

  const throwingContext = { localStorage: { getItem() { throw new Error('disabled'); } } };
  vm.runInNewContext(`${declarations[0]}; this.loaded = dualAccountMode;`, throwingContext);
  assert.equal(throwingContext.loaded, false);
});

test('dual-account transitions persist and render only two authenticated accounts', () => {
  assert.match(source, /function setActiveAccountProvider[\s\S]*?setDualAccountMode\(false\)/);
  assert.match(source, /function enableDualAccountView[\s\S]*?setDualAccountMode\(true\)/);
  assert.match(source, /async function logoutActiveAccount[\s\S]*?setDualAccountMode\(false\)/);
  assert.match(source, /async function doLogout[\s\S]*?setDualAccountMode\(false\)/);
  assert.match(
    source,
    /if \(dualAccountMode && hasPlatformLogin\('netease'\) && hasPlatformLogin\('qq'\)\)/,
  );
});

function createQueueContext(overrides) {
  const calls = [];
  return Object.assign({
    calls,
    playlist: [{ name: 'Song' }],
    podcastPrograms: [{ name: 'Podcast' }],
    playQueue: [],
    currentIdx: -1,
    playSearchResult(index) { calls.push(['play-song', index]); },
    playPodcastProgram(index) { calls.push(['play-podcast', index]); },
    queueSongNext(song) { calls.push(['queue-next', song.name]); },
    showToast(message) { calls.push(['toast', message]); },
  }, overrides || {});
}

test('search add actions start playback when no current queue item exists', () => {
  const context = createQueueContext();
  vm.runInNewContext(
    `${extractFunction('queueSearchResult')}; ${extractFunction('queuePodcastProgram')};`,
    context,
  );

  context.queueSearchResult(0);
  context.queuePodcastProgram(0);

  assert.deepEqual(context.calls, [['play-song', 0], ['play-podcast', 0]]);
});

test('search add actions preserve insert-next behavior with a current item', () => {
  const context = createQueueContext({ playQueue: [{ name: 'Current' }], currentIdx: 0 });
  vm.runInNewContext(
    `${extractFunction('queueSearchResult')}; ${extractFunction('queuePodcastProgram')};`,
    context,
  );

  context.queueSearchResult(0);
  context.queuePodcastProgram(0);

  assert.deepEqual(context.calls, [
    ['queue-next', 'Song'],
    ['toast', '已设为下一首: Song'],
    ['queue-next', 'Podcast'],
    ['toast', '已设为下一首: Podcast'],
  ]);
});

test('song and podcast playback adapters select from their own result lists', () => {
  assert.match(source, /function playSearchResult[\s\S]*?playSearchSong\(song\)/);
  assert.match(source, /function playPodcastProgram[\s\S]*?playSearchSong\(item\)/);
});
