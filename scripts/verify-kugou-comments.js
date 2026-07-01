const fs = require('fs');

const serverSource = fs.readFileSync('server.js', 'utf8');
const uiSource = fs.readFileSync('public/index.html', 'utf8');

const checks = [
  ['server KuGou comment mapper', serverSource, 'function mapKugouComment'],
  ['server KuGou song comments handler', serverSource, 'async function handleKugouSongComments'],
  ['server KuGou song comments endpoint', serverSource, "'/mcomment/v1/cmtlist'"],
  ['server KuGou song comments route', serverSource, "pn === '/api/kugou/song/comments'"],
  ['UI detects KuGou detail comments', uiSource, 'detailIsKugou'],
  ['UI labels KuGou comments', uiSource, "'酷狗评论'"],
  ['UI requests KuGou comments route', uiSource, "/api/kugou/song/comments?mixsongid="],
];

const missing = checks.filter(([, source, marker]) => !source.includes(marker));
if (missing.length) {
  console.error('KuGou comments wiring is incomplete:');
  missing.forEach(([label]) => console.error(`- ${label}`));
  process.exit(1);
}

console.log('KuGou comments markers are present.');
