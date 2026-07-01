const fs = require('fs');

const serverSource = fs.readFileSync('server.js', 'utf8');
const uiSource = fs.readFileSync('public/index.html', 'utf8');

const checks = [
  ['server KuGou like handler', serverSource, 'async function handleKugouSongLike'],
  ['server KuGou like check handler', serverSource, 'async function handleKugouSongLikeCheck'],
  ['server KuGou liked playlist helper', serverSource, 'function pickKugouLikedPlaylist'],
  ['server KuGou like route', serverSource, "pn === '/api/kugou/song/like'"],
  ['server KuGou like check route', serverSource, "pn === '/api/kugou/song/like/check'"],
  ['UI uses provider like key', uiSource, 'function songLikeKey'],
  ['UI syncs KuGou like status', uiSource, "/api/kugou/song/like/check?ids="],
  ['UI posts KuGou like route', uiSource, "/api/kugou/song/like"],
  ['UI allows KuGou like toggle', uiSource, "provider === 'kugou' ? hasPlatformLogin('kugou')"],
];

const missing = checks.filter(([, source, marker]) => !source.includes(marker));
if (missing.length) {
  console.error('KuGou like wiring is incomplete:');
  missing.forEach(([label]) => console.error(`- ${label}`));
  process.exit(1);
}

console.log('KuGou like markers are present.');
