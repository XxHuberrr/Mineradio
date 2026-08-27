'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const login = read('public', 'js', 'modules', '08-account', '03-login-modal-flows.js');
const html = read('public', 'index.html');
const preload = read('desktop', 'preload.js');
const main = read('desktop', 'main.js');

function functionSource(name) {
  const match = login.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}(?=\\nfunction )`));
  assert(match, `${name} must exist`);
  return match[0];
}

const context = {
  loginProvider: 'netease',
  loginWorkflowPendingProvider: '',
  loginProviderSupportsCookieMode: () => true,
  loginProviderUsesDirectCredentialFlow: () => false,
  hasLoginWorkflowConnection: () => false,
  openDirectLoginProviderFlow: () => false,
  showToast: () => assert.fail('Netease official login must not be rejected'),
  connectLoginMode: (mode) => { context.connectedMode = mode; },
};
vm.createContext(context);
vm.runInContext([
  functionSource('shouldOpenLoginAuthDrawerForMode'),
  functionSource('selectLoginMode'),
].join('\n'), context);

context.selectLoginMode('official');
assert.strictEqual(context.loginWorkflowPendingProvider, 'netease', 'clicking the Netease scan mode must select Netease for login');
assert.strictEqual(context.connectedMode, 'official', 'clicking the Netease scan mode must immediately start official login');

assert(/function selectLoginProviderNode\(provider\)[\s\S]{0,420}openDirectLoginProviderFlow\(provider\)[\s\S]{0,240}setLoginAuthDrawerOpen\(hasLoginWorkflowConnection\(provider\) \|\| loginWorkflowPendingProvider === provider\)/.test(login), 'existing providers must retain the upstream selection layout while direct-credential providers may open immediately');
assert(/function connectLoginMode\(mode\)[\s\S]{0,700}setTimeout\(openProviderWebLogin, 120\)/.test(login), 'official mode must schedule the provider login bridge');
assert(/function openProviderWebLogin\(\)[\s\S]{0,400}return openNeteaseWebLogin\(\)/.test(login), 'Netease must remain the official-login fallback provider');
assert(!login.includes('先把左侧接口拖到 MR 接入口'), 'login must not contain the obsolete drag-only gate');

assert(html.includes("onclick=\"selectLoginProviderNode('netease')\""), 'Netease provider must be directly selectable');
assert(html.includes("onclick=\"selectLoginMode('official')\""), 'official scan mode must have a direct click action');
assert(html.includes('选择平台后，点击扫码、官网或 Cookie 登录。'), 'login drawer must explain the direct action');
assert(/function resumeLoginModalAfterGate\(\)[\s\S]{0,260}if \(!openDirectLoginProviderFlow\(loginProvider\)\) \{\s*setLoginAuthDrawerOpen\(false\)/.test(login), 'opening the modal must retain the upstream graph-first layout for existing providers');

assert(preload.includes("openNeteaseMusicLogin: () => ipcRenderer.invoke('netease-music-open-login')"), 'preload must expose the Netease login bridge');
assert(main.includes("ipcMain.handle('netease-music-open-login'"), 'Electron main must handle Netease login requests');
const mainFlow = main.slice(main.indexOf('async function openNeteaseMusicLoginWindow'), main.indexOf('async function openQQMusicLoginWindow'));
assert(mainFlow.includes("loginWindow.on('ready-to-show', () => loginWindow.show())"), 'the existing Netease login window must show when Electron reports readiness');
assert(mainFlow.includes('loginWindow.loadURL(NETEASE_LOGIN_URL)'), 'the existing Netease login window must load the official login page');
