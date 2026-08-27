'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const adapter = read('ai6666-api.js');
const server = read('server.js');
const main = read('desktop', 'main.js');
const gate = read('desktop', 'login-easter-egg-gate.js');
const html = read('public', 'index.html');
const state = read('public', 'js', 'modules', '00-state', '00-core-stores.js');
const search = read('public', 'js', 'modules', '05-playback', '07-search.js');
const fallback = read('public', 'js', 'modules', '05-playback', '11-provider-fallback.js');
const playback = read('public', 'js', 'modules', '05-playback', '13-playback-start-audio.js');
const trackDetails = read('public', 'js', 'modules', '05-playback', '06-track-detail-lyrics-actions.js');
const lyrics = read('public', 'js', 'modules', '06-lyrics', '00-lyrics-fetch-parse.js');
const playlists = read('public', 'js', 'modules', '06-lyrics', '01-playlist-panel-shell.js');
const details = read('public', 'js', 'modules', '06-lyrics', '02-playlist-detail.js');
const accounts = read('public', 'js', 'modules', '08-account', '01-login-modal-utils.js');
const login = read('public', 'js', 'modules', '08-account', '03-login-modal-flows.js');
const css = read('public', 'css', 'index.css');

[
  '/api/ai6666/status',
  '/api/ai6666/config',
  '/api/ai6666/logout',
  '/api/ai6666/user/playlists',
  '/api/ai6666/playlist/tracks',
  '/api/ai6666/search',
  '/api/ai6666/recommendations',
  '/api/ai6666/song/detail',
  '/api/ai6666/song/url',
  '/api/ai6666/lyric',
  '/api/ai6666/song/favorite',
].forEach((route) => assert(server.includes(route), `server route missing: ${route}`));

assert(server.includes("pn.startsWith('/api/ai6666/') && !isTrustedLocalMutationRequest(req)"), 'private AI6666 routes must be loopback/origin protected');
assert(server.includes("'/api/ai6666/config'"), 'credential configuration must be behind the login gate');
assert(main.includes("'.ai6666-credentials.json'"), 'Electron userData must own the credential file');
assert(gate.includes("'.ai6666-credentials.json'"), 'login reset must clear AI6666 credentials');
assert(!main.includes("ai6666: { label:"), 'AI6666 API keys must never use the cookie export bridge');

assert(html.includes('id="search-mode-ai6666"'));
assert(html.includes('id="login-provider-ai6666"'));
assert(html.includes('id="user-provider-ai6666"'));
assert(accounts.includes("if (provider === 'ai6666') return 'https://ai6666.com/static/share-icon.png';"), 'AI6666 account surfaces must use the official website icon');
assert(state.includes('var ai6666LoginStatus'));
assert(state.includes('ai6666Playlists'));
assert(accounts.includes("'spotify', 'ai6666'"));
assert(login.includes('submitAi6666ConfigLogin'));
assert(/function submitQQCookieLogin\(\) \{\s*if \(loginProvider === 'ai6666'\) return submitAi6666ConfigLogin\(\);/.test(login), 'shared credential save button must dispatch AI6666 keys to the AI6666 submitter');
const drawerGuardSource = login.match(/function shouldOpenLoginAuthDrawerForMode\(provider, mode\) \{[\s\S]*?\n\}/);
assert(drawerGuardSource, 'AI6666 login drawer guard must exist');
function evaluateDrawerGuard(provider, mode, connected, pendingProvider) {
  const context = {
    hasLoginWorkflowConnection: () => connected,
    loginProviderSupportsCookieMode: (candidate) => !['spotify', 'qishui', 'ai6666'].includes(candidate),
    loginWorkflowPendingProvider: pendingProvider || '',
  };
  vm.runInNewContext(drawerGuardSource[0], context);
  return context.shouldOpenLoginAuthDrawerForMode(provider, mode);
}
assert.strictEqual(evaluateDrawerGuard('ai6666', 'official', false, ''), true, 'AI6666 API Key mode must open the credential drawer before connection');
assert.strictEqual(evaluateDrawerGuard('qq', 'official', false, ''), true, 'official login actions must work without a drag gesture');
assert.strictEqual(evaluateDrawerGuard('qq', 'cookie', false, ''), true, 'supported cookie login actions must work without a drag gesture');
assert.strictEqual(evaluateDrawerGuard('spotify', 'cookie', false, ''), false, 'unsupported cookie modes must stay unavailable');
assert.strictEqual(evaluateDrawerGuard('qq', 'official', true, ''), true, 'connected providers must keep the drawer open');
assert.strictEqual(evaluateDrawerGuard('qq', 'official', false, 'qq'), true, 'pending providers must keep the drawer open');
assert(/function loginProviderUsesDirectCredentialFlow\(provider\) \{\s*return normalizeLoginProviderKey\(provider\) === 'ai6666';\s*\}/.test(login), 'AI6666 must be declared as a direct credential flow');
assert(/function selectLoginProviderNode\(provider\)[\s\S]{0,420}if \(openDirectLoginProviderFlow\(provider\)\) return;/.test(login), 'selecting AI6666 must open the credential flow without a drag gesture');
assert(/function resumeLoginModalAfterGate\(\)[\s\S]{0,220}openDirectLoginProviderFlow\(loginProvider\)/.test(login), 'opening the account modal directly on AI6666 must reveal credentials immediately');
assert(/function openDirectLoginProviderFlow\(provider, options\)[\s\S]{0,500}setLoginAuthDrawerOpen\(true\)[\s\S]{0,500}focusLoginProviderCredentialInput\(provider\)/.test(login), 'direct AI6666 flow must reveal the drawer and focus the key field');
assert(/function bindAi6666CredentialInput\(input\)[\s\S]{0,900}event\.key !== 'Enter'[\s\S]{0,900}submitAi6666ConfigLogin\(\)/.test(login), 'AI6666 key entry must support Enter to save and validate');
assert(login.includes("authDrawer.classList.toggle('ai6666-auth', isAi6666)"), 'AI6666 login must activate its compact credential layout');
assert(/\.login-auth-drawer\.ai6666-auth\s*\{[\s\S]{0,240}grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(300px,\s*360px\)/.test(css), 'AI6666 credential drawer must reserve visible space for its input and confirmation controls');
assert(/\.login-auth-drawer\.ai6666-auth \.qq-cookie-actions\s*\{[\s\S]{0,240}grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/.test(css), 'AI6666 save action must remain visible beside the guidance copy');
assert(/\.login-auth-drawer\.ai6666-auth \.qr-shell,[\s\S]{0,160}\.login-auth-drawer\.ai6666-auth \.login-auth-actions\s*\{\s*display:\s*none/.test(css), 'AI6666 must not duplicate its primary action in a hidden bottom action row');
assert(/\.login-node-graph\.direct-credential-flow #login-mode-cookie\s*\{\s*display:\s*none/.test(css), 'AI6666 must not show an inapplicable Cookie mode');
assert(/\.login-auth-drawer\.ai6666-auth \.qq-cookie-input\s*\{[\s\S]{0,220}height:\s*48px/.test(css), 'AI6666 key field must remain compact so confirmation stays in view');
assert(login.includes("ai6666ConfigFeedback = { message: e && e.message ? e.message : 'AI6666 API Key 保存失败', mode: 'fail' }"), 'failed validation must provide persistent inline feedback');
assert(!/catch \(e\) \{\s*if \(input\) input\.value = '';\s*ai6666ConfigFeedback/.test(login), 'failed validation must preserve the entered key for correction and retry');
assert(/function closeLoginModal\(\)[\s\S]{0,320}if \(keyInput\) keyInput\.value = '';[\s\S]{0,320}ai6666ConfigFeedback = null;/.test(login), 'closing the account modal must clear unsubmitted AI6666 key material');
assert(search.includes("provider === 'ai6666'"));
assert(playlists.includes("provider === 'ai6666'"));
assert(details.includes("provider === 'ai6666'"));
assert(playback.includes('/api/ai6666/song/url'));
assert(lyrics.includes('/api/ai6666/lyric'));
assert(lyrics.includes('parsePlainLyricText'));
assert(/var isAi6666Song = [^;]+;\s*var plainLines = \(isAi6666Song &&/.test(lyrics), 'plain-text lyric timing fallback must remain isolated to AI6666 songs');
assert(trackDetails.includes("return songAccountProvider(song) === 'ai6666' && !!(song && (song.isFavorite || song.userFavorited));"), 'API favorite flags must not change existing providers\' liked-state behavior');

assert(fallback.includes("if (currentProvider === 'ai6666') return [];"), 'private AI songs must not enter cross-provider fallback');
assert(!/controlSourceProviders\(\)[\s\S]{0,700}key:\s*['"]ai6666['"]/.test(search), 'AI6666 must not be exposed by cross-platform source switching');

const forbiddenRuntimeFragments = [
  '/generate',
  '/generation',
  '/export',
  '/stem',
  '/download-mp3',
  '/download-cover',
  '/download-lrc',
];
forbiddenRuntimeFragments.forEach((fragment) => {
  assert(!adapter.includes(fragment), `adapter must not call non-player endpoint: ${fragment}`);
  assert(!server.includes(`/api/ai6666${fragment}`), `server must not expose non-player endpoint: ${fragment}`);
});

assert(!/hh_[A-Za-z0-9_-]{24,}/.test(adapter), 'adapter must not contain an API key');
assert(!/hh_[A-Za-z0-9_-]{24,}/.test(server), 'server must not contain an API key');

console.log('[OK] AI6666 provider routing, player surfaces, privacy isolation, and non-billable endpoint boundaries are guarded.');
