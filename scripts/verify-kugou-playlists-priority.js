const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const serverSource = fs.readFileSync(path.join(repoRoot, 'server.js'), 'utf8');
const uiSource = fs.readFileSync(path.join(repoRoot, 'public', 'index.html'), 'utf8');

const requirements = [
  ['server KuGou playlist mapper', serverSource, 'function mapKugouPlaylist'],
  ['server KuGou user playlist handler', serverSource, 'async function handleKugouUserPlaylists'],
  ['server KuGou playlist tracks handler', serverSource, 'async function handleKugouPlaylistTracks'],
  ['server KuGou user playlists route', serverSource, "pn === '/api/kugou/user/playlists'"],
  ['server KuGou playlist tracks route', serverSource, "pn === '/api/kugou/playlist/tracks'"],
  ['UI refreshes KuGou playlists', uiSource, "kugouLoginStatus.loggedIn ? apiJson('/api/kugou/user/playlists')"],
  ['UI renders KuGou playlist group', uiSource, "key:'kugou'"],
  ['UI opens KuGou playlist detail route', uiSource, "/api/kugou/playlist/tracks?id="],
  ['UI loads KuGou playlist into queue', uiSource, "kugouPlaylistId"],
  ['UI boosts KuGou when logged in', uiSource, "hasPlatformLogin('kugou') ? 36 : 5"],
];

const missing = requirements
  .filter(([, source, marker]) => !source.includes(marker))
  .map(([label, , marker]) => `${label}: missing "${marker}"`);

if (missing.length) {
  console.error('KuGou playlist/priority wiring is incomplete:');
  missing.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}

console.log('KuGou playlist/priority markers are present.');
