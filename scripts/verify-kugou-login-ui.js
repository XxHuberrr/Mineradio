const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');

const requiredMarkers = [
  'id="login-provider-kugou"',
  'id="user-provider-kugou"',
  'id="account-add-kugou"',
  'var kugouLoginStatus',
  "provider === 'kugou'",
  '/api/kugou/login/status',
  '/api/kugou/login/qr/key',
  '/api/kugou/login/qr/create',
  '/api/kugou/login/qr/check',
  '/api/kugou/logout',
];

const missing = requiredMarkers.filter(marker => !html.includes(marker));

if (missing.length) {
  console.error('Missing KuGou login UI markers:');
  missing.forEach(marker => console.error('- ' + marker));
  process.exit(1);
}

console.log('KuGou login UI markers are present.');
