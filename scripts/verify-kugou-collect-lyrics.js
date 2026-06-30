const fs = require('fs');

const serverSource = fs.readFileSync('server.js', 'utf8');
const uiSource = fs.readFileSync('public/index.html', 'utf8');

const checks = [
  ['server KuGou lyric handler', serverSource, 'async function handleKugouLyric'],
  ['server KuGou lyric route', serverSource, "pn === '/api/kugou/lyric'"],
  ['server KuGou playlist add handler', serverSource, 'async function handleKugouPlaylistAddSong'],
  ['server KuGou playlist add route', serverSource, "pn === '/api/kugou/playlist/add-song'"],
  ['server KuGou KRC decode helper', serverSource, 'function decodeKugouKrcLyrics'],
  ['UI requests KuGou lyric route', uiSource, "/api/kugou/lyric?hash="],
  ['UI allows KuGou collection modal', uiSource, "provider === 'kugou' ? hasPlatformLogin('kugou')"],
  ['UI posts KuGou collection route', uiSource, "/api/kugou/playlist/add-song"],
  ['UI filters writable playlists by provider', uiSource, 'collectTargetProvider'],
  ['UI verifies KuGou playlist add', uiSource, "verifySongInPlaylist(pid, songId, provider)"],
];

const missing = checks.filter(([, source, marker]) => !source.includes(marker));
if (missing.length) {
  console.error('KuGou collect/lyric wiring is incomplete:');
  missing.forEach(([label]) => console.error(`- ${label}`));
  process.exit(1);
}

const addSongSection = serverSource.slice(
  serverSource.indexOf('async function handleKugouPlaylistAddSong'),
  serverSource.indexOf('function kugouPlaylistDeleteSucceeded')
);
if (addSongSection.includes("headers: { 'x-router': 'cloudlist.service.kugou.com' }")) {
  console.error('KuGou playlist add-song should call add_song without x-router header.');
  process.exit(1);
}

console.log('KuGou collect/lyric markers are present.');
