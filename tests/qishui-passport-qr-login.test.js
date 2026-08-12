'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createQishuiQrLoginBridge } = require('../qishui-qr-login');

test('Qishui Passport QR bridge persists a confirmed official web session and clears it', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-qishui-passport-'));
  const configFile = path.join(tempDir, 'qishui-qr.json');
  let hooks = null;
  let clearCount = 0;
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const auth = {
    configure(value) {
      hooks = value;
    },
    async getQrCode() {
      return {
        message: 'success',
        data: {
          token: 'official-passport-token',
          qrcode: 'data:image/png;base64,TEST',
          qrcode_index_url: 'https://api.qishui.com/passport/web/get_qrcode/?token=official-passport-token',
        },
      };
    },
    async checkQrConnect(token) {
      assert.equal(token, 'official-passport-token');
      hooks.updateConfig({
        deviceId: '386088-device',
        installId: '386088-install',
        cookie: 'sessionid=official-session; sessionid_ss=official-session',
        msToken: 'signed-ms-token',
      });
      return { message: 'success', data: { error_code: 0, status: '3' } };
    },
    async clear() {
      clearCount += 1;
    },
  };

  const bridge = createQishuiQrLoginBridge({ auth, configFile });
  const qr = await bridge.createQrCode();
  assert.equal(qr.data.token, 'official-passport-token');

  await bridge.checkQrConnect(qr.data.token);
  assert.equal(bridge.getStatus().loggedIn, true);
  assert.match(bridge.getCookie(), /sessionid=official-session/);
  const saved = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  assert.equal(saved.deviceId, '386088-device');
  assert.equal(saved.installId, '386088-install');
  assert.equal(saved.msToken, 'signed-ms-token');

  await bridge.clear();
  assert.equal(clearCount, 1);
  assert.equal(bridge.getStatus().loggedIn, false);
  const cleared = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  assert.equal(cleared.cookie, '');
  assert.equal(cleared.msToken, '');
  assert.equal(cleared.deviceId, '386088-device');
});

test('Qishui login product surface uses only the signed Passport QR flow', () => {
  const root = path.resolve(__dirname, '..');
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'desktop/main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'desktop/preload.js'), 'utf8');
  const ui = fs.readFileSync(path.join(root, 'public/js/modules/08-account/03-login-modal-flows.js'), 'utf8');
  const auth = fs.readFileSync(path.join(root, 'qishui-auth-v6.js'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

  assert.match(server, /require\('\.\/qishui-qr-login'\)/);
  assert.match(server, /\/api\/qishui\/login\/qrcode/);
  assert.match(server, /\/api\/qishui\/login\/check/);
  assert.doesNotMatch(server, /pn === '\/api\/qishui\/login\/token'/);
  assert.doesNotMatch(server, /pn === '\/api\/qishui\/login\/cookie'/);

  assert.match(ui, /请使用抖音 App 扫码并确认登录/);
  assert.match(ui, /pollQishuiQr/);
  assert.match(ui, /\/api\/qishui\/login\/qrcode/);
  assert.match(ui, /\/api\/qishui\/login\/check/);
  assert.doesNotMatch(ui, /读取本机汽水|本机会话|Token 导入|submitQishuiTokenLogin/);
  assert.doesNotMatch(ui, /openQishuiMusicLogin/);

  assert.doesNotMatch(main, /ipcMain\.handle\('qishui-music-open-login'/);
  assert.doesNotMatch(preload, /openQishuiMusicLogin/);
  assert.match(main, /await qishuiQrLogin\.clear\(\)/);

  assert.match(auth, /show:\s*false/);
  assert.match(auth, /persist:mineradio-qishui-auth-v6/);
  assert.match(auth, /a_bogus/);
  assert.match(auth, /\/passport\/web\/get_qrcode\//);
  assert.match(auth, /\/passport\/web\/check_qrconnect\//);
  assert.match(auth, /secondVerify/);
  assert.match(
    auth,
    /async function clear\(\)[\s\S]{0,420}session\.fromPartition\(AUTH_PARTITION\)[\s\S]{0,260}clearStorageData/,
    'logout must clear the persistent official auth partition even before the signing runtime is initialized'
  );

  assert.ok(pkg.build.files.includes('qishui-auth-v6.js'));
  assert.ok(pkg.build.files.includes('qishui-qr-login.js'));
  assert.ok(pkg.build.files.includes('qishui-auth-v6/**/*'));
});
