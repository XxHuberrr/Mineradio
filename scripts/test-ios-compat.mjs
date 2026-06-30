import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function makeClassList() {
  return {
    values: new Set(),
    add(...names) {
      names.forEach((name) => this.values.add(name));
    },
    remove(...names) {
      names.forEach((name) => this.values.delete(name));
    }
  };
}

function makeLocalStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

function makeContext({ respondToNative = false } = {}) {
  const windowObject = {};
  const context = {
    console,
    setTimeout,
    clearTimeout,
    Promise,
    Response,
    URLSearchParams,
    FormData,
    Error,
    RegExp,
    String,
    Number,
    Math,
    Date,
    JSON,
    Object,
    localStorage: makeLocalStorage(),
    document: {
      documentElement: { classList: makeClassList() },
      body: { classList: makeClassList() }
    },
    window: windowObject
  };
  windowObject.__MINERADIO_IOS_BRIDGE_TIMEOUT_MS = 10;
  windowObject.addEventListener = () => {};
  windowObject.open = () => {};
  windowObject.location = { href: '' };
  windowObject.webkit = {
    messageHandlers: {
      mineradioIOS: {
        postMessage(message) {
          if (!respondToNative) return;
          setTimeout(() => {
            windowObject.__mineradioIOSBridgeResolve({
              id: message.id,
              payload: { ok: true, cookie: 'MUSIC_U=test-token; NMTID=test-id' }
            });
          }, 0);
        }
      }
    }
  };
  context.globalThis = context;
  return vm.createContext(context);
}

async function readJson(response) {
  return JSON.parse(await response.text());
}

async function expectTimeoutFallback() {
  const source = fs.readFileSync('ios/MineradioIOS/MineradioIOS/Resources/ios-compat.js', 'utf8');
  const context = makeContext({ respondToNative: false });
  vm.runInContext(source, context, { filename: 'ios-compat.js' });

  const result = await Promise.race([
    context.window.desktopWindow.openNeteaseMusicLogin(),
    new Promise((resolve) => setTimeout(() => resolve({ hung: true }), 80))
  ]);

  assert.equal(result.hung, undefined, 'openNeteaseMusicLogin must not hang if native bridge never answers');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'ios-bridge-timeout');

  const diagnostic = await context.window.desktopWindow.getNeteaseLoginDiagnostics();
  assert.equal(diagnostic.phase, 'failed');
  assert.equal(diagnostic.reason, 'ios-bridge-timeout');
}

async function expectCookieLoginPersistence() {
  const source = fs.readFileSync('ios/MineradioIOS/MineradioIOS/Resources/ios-compat.js', 'utf8');
  const context = makeContext({ respondToNative: true });
  vm.runInContext(source, context, { filename: 'ios-compat.js' });

  const bridgeResult = await context.window.desktopWindow.openNeteaseMusicLogin();
  assert.equal(bridgeResult.ok, true);
  assert.match(bridgeResult.cookie, /MUSIC_U=/);

  const loginResponse = await context.window.fetch('/api/login/cookie', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cookie: bridgeResult.cookie })
  });
  const loginStatus = await readJson(loginResponse);
  assert.equal(loginStatus.loggedIn, true);
  assert.equal(loginStatus.provider, 'netease');
  assert.equal(loginStatus.iosLocalLogin, true);

  const statusResponse = await context.window.fetch('/api/login/status?t=1');
  const restoredStatus = await readJson(statusResponse);
  assert.equal(restoredStatus.loggedIn, true);
  assert.equal(restoredStatus.cookie, bridgeResult.cookie);

  const diagnostic = await context.window.desktopWindow.getNeteaseLoginDiagnostics();
  assert.equal(diagnostic.phase, 'success');
  assert.equal(diagnostic.hasCookie, true);
}

await expectTimeoutFallback();
await expectCookieLoginPersistence();

console.log('iOS compatibility behavior verified');
