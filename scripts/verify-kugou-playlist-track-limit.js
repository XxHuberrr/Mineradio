const fs = require('fs');

const serverSource = fs.readFileSync('server.js', 'utf8');

function sectionBetween(startMarker, endMarker) {
  const start = serverSource.indexOf(startMarker);
  const end = serverSource.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) return '';
  return serverSource.slice(start, end);
}

const handlerSection = sectionBetween(
  'async function handleKugouPlaylistTracks',
  'async function kugouLyricsRequest'
);
const routeSection = sectionBetween(
  "if (pn === '/api/kugou/playlist/tracks')",
  "if (pn === '/api/kugou/playlist/create')"
);

const errors = [];

if (!handlerSection) {
  errors.push('Missing KuGou playlist track handler.');
}
if (!routeSection) {
  errors.push('Missing KuGou playlist track route.');
}
if (handlerSection && !handlerSection.includes("parseInt(limit || '500', 10) || 500")) {
  errors.push('KuGou playlist track handler should default to 500 tracks.');
}
if (routeSection && !routeSection.includes("url.searchParams.get('limit') || '500'")) {
  errors.push('KuGou playlist track route should default to 500 tracks.');
}

if (errors.length) {
  console.error('KuGou playlist track limit is not aligned:');
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log('KuGou playlist track limit defaults to 500.');
