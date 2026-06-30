const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const serverSource = fs.readFileSync(path.join(repoRoot, 'server.js'), 'utf8');
const uiSource = fs.readFileSync(path.join(repoRoot, 'public', 'index.html'), 'utf8');

const requirements = [
  ['server android signature helper', serverSource, 'function kugouAndroidSignature'],
  ['server song url sign key helper', serverSource, 'function kugouSignKey'],
  ['server signed KuGou API request helper', serverSource, 'async function kugouApiRequest'],
  ['server KuGou search mapper', serverSource, 'function mapKugouSearchSong'],
  ['server KuGou search handler', serverSource, 'async function handleKugouSearch'],
  ['server KuGou song URL handler', serverSource, 'async function handleKugouSongUrl'],
  ['server KuGou search route', serverSource, "pn === '/api/kugou/search'"],
  ['server KuGou song URL route', serverSource, "pn === '/api/kugou/song/url'"],
  ['UI recognizes KuGou provider', uiSource, "songProviderKey(song) === 'kugou'"],
  ['UI calls KuGou search route', uiSource, '/api/kugou/search?keywords='],
  ['UI calls KuGou song URL route', uiSource, '/api/kugou/song/url?hash='],
  ['UI has KuGou source tag style', uiSource, '.tag-source.kugou'],
  ['UI has KuGou search hover style', uiSource, '.search-result.kugou-source:hover'],
  ['UI has KuGou playback branch', uiSource, "var isKugouPlayback = songProviderKey(song) === 'kugou'"],
];

const missing = requirements
  .filter(([, source, marker]) => !source.includes(marker))
  .map(([label, , marker]) => `${label}: missing "${marker}"`);

if (missing.length) {
  console.error('KuGou search/playback wiring is incomplete:');
  missing.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}

console.log('KuGou search/playback markers are present.');
