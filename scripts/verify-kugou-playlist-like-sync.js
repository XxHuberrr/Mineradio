const fs = require('fs');

const uiSource = fs.readFileSync('public/index.html', 'utf8');

const checks = [
  ['UI marks KuGou liked playlist songs', uiSource, "kugouPlaylistId && isLikedPlaylistContext(kugouPlaylistId"],
  ['UI syncs KuGou playlist queue likes', uiSource, 'syncLikeStatusForSongs(playQueue);'],
  ['UI marks KuGou panel detail tracks', uiSource, "provider === 'kugou' && isLikedPlaylistContext(pid"],
  ['UI syncs KuGou panel detail tracks', uiSource, 'syncLikeStatusForSongs(playlistPanelDetailState.tracks);'],
  ['UI syncs KuGou panel detail playback queue', uiSource, 'syncLikeStatusForSongs(playQueue);'],
  ['UI rerenders playlist detail after like sync', uiSource, "renderPlaylistPanelDetailState();\n    updateLikeButtons();"],
];

const missing = checks.filter(([, source, marker]) => !source.includes(marker));
if (missing.length) {
  console.error('KuGou playlist like sync is incomplete:');
  missing.forEach(([label]) => console.error(`- ${label}`));
  process.exit(1);
}

console.log('KuGou playlist like sync markers are present.');
