'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { createAppleMusicWebController } = require('../desktop/apple-music-web-controller');

class FakeWebContents extends EventEmitter {
  setWindowOpenHandler(handler) { this.windowOpenHandler = handler; }
  executeJavaScript() { return Promise.resolve({ ok: true }); }
  send() {}
}

function controllerFixture(loadResults = []) {
  const windows = [];
  class FakeBrowserWindow extends EventEmitter {
    constructor(options = {}) {
      super();
      this.options = options;
      this.webContents = new FakeWebContents();
      this.destroyed = false;
      windows.push(this);
    }
    isDestroyed() { return this.destroyed; }
    isMinimized() { return false; }
    restore() {}
    show() {}
    focus() {}
    close() { this.destroy(); }
    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.emit('closed');
    }
    loadURL() {
      const result = loadResults.shift();
      return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
    }
  }

  const externalUrls = [];
  const appleSession = {
    setUserAgent() {},
    webRequest: { onBeforeSendHeaders() {} },
  };
  const owner = { isDestroyed: () => false, webContents: { send() {} } };
  const shell = { openExternal: async (url) => { externalUrls.push(url); } };
  const controller = createAppleMusicWebController({
    BrowserWindow: FakeBrowserWindow,
    session: { fromPartition: () => appleSession },
    shell,
    getMainWindow: () => owner,
    ensureWidevineReady: async () => ({ ok: true }),
  });

  return { controller, externalUrls, FakeBrowserWindow, windows };
}

test('concurrent opens share one player window', async () => {
  let releaseWidevine;
  const ready = new Promise((resolve) => { releaseWidevine = resolve; });
  const fixture = controllerFixture();
  const controller = createAppleMusicWebController({
    BrowserWindow: fixture.FakeBrowserWindow,
    session: { fromPartition: () => ({ setUserAgent() {}, webRequest: { onBeforeSendHeaders() {} } }) },
    shell: { openExternal: async () => {} },
    getMainWindow: () => ({ isDestroyed: () => false, webContents: { send() {} } }),
    ensureWidevineReady: () => ready,
  });

  const first = controller.open();
  const second = controller.open();
  assert.equal(first, second);
  releaseWidevine({ ok: true });
  await Promise.all([first, second]);
  assert.equal(fixture.windows.length, 1);
});

test('an open during page loading shares the in-flight promise', async () => {
  let finishLoad;
  const loading = new Promise((resolve) => { finishLoad = resolve; });
  const { controller, windows } = controllerFixture([loading]);

  const first = controller.open();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(windows.length, 1);
  const second = controller.open();
  assert.equal(first, second);

  finishLoad();
  await Promise.all([first, second]);
  assert.equal(windows.length, 1);
});

test('closing while Widevine is preparing cancels window creation', async () => {
  let releaseWidevine;
  const ready = new Promise((resolve) => { releaseWidevine = resolve; });
  const fixture = controllerFixture();
  const controller = createAppleMusicWebController({
    BrowserWindow: fixture.FakeBrowserWindow,
    session: { fromPartition: () => ({ setUserAgent() {}, webRequest: { onBeforeSendHeaders() {} } }) },
    shell: { openExternal: async () => {} },
    getMainWindow: () => ({ isDestroyed: () => false, webContents: { send() {} } }),
    ensureWidevineReady: () => ready,
  });

  const pending = controller.open();
  const rejected = assert.rejects(pending, /APPLE_MUSIC_OPEN_CANCELLED/);
  controller.close();
  releaseWidevine({ ok: true });
  await rejected;
  assert.equal(fixture.windows.length, 0);
  assert.equal(controller.isOpen(), false);
});

test('a failed player load is destroyed and can be retried', async () => {
  const { controller, windows } = controllerFixture([new Error('load failed'), null]);

  await assert.rejects(controller.open(), /load failed/);
  assert.equal(windows[0].isDestroyed(), true);
  assert.equal(controller.isOpen(), false);

  const retry = await controller.open();
  assert.deepEqual(retry, { ok: true, reused: false });
  assert.equal(windows.length, 2);
  assert.equal(controller.isOpen(), true);
});

test('player and Apple auth children reject off-host navigation and redirects', async () => {
  const { controller, externalUrls, FakeBrowserWindow, windows } = controllerFixture();
  await controller.open();
  const player = windows[0];

  const authMainFrameEvent = { prevented: false, preventDefault() { this.prevented = true; } };
  player.webContents.emit('will-navigate', authMainFrameEvent, 'https://idmsa.apple.com/appleauth/auth/authorize/signin');
  assert.equal(authMainFrameEvent.prevented, true);

  const redirectEvent = { prevented: false, preventDefault() { this.prevented = true; } };
  player.webContents.emit('will-redirect', redirectEvent, 'https://evil.example/collect');
  assert.equal(redirectEvent.prevented, true);
  assert.deepEqual(externalUrls, ['https://evil.example/collect']);

  const popupPolicy = player.webContents.windowOpenHandler({
    url: 'https://idmsa.apple.com/appleauth/auth/authorize/signin',
  });
  assert.equal(popupPolicy.action, 'allow');
  const child = new FakeBrowserWindow();
  player.webContents.emit('did-create-window', child, {});
  assert.equal(child.webContents.listenerCount('will-redirect'), 1);
  assert.equal(typeof child.webContents.windowOpenHandler, 'function');

  const childAuthNavigation = { prevented: false, preventDefault() { this.prevented = true; } };
  child.webContents.emit('will-navigate', childAuthNavigation, 'https://idmsa.apple.com/appleauth/auth/authorize/signin');
  assert.equal(childAuthNavigation.prevented, false);

  const childRedirect = { prevented: false, preventDefault() { this.prevented = true; } };
  child.webContents.emit('will-redirect', childRedirect, 'https://evil.example/from-auth');
  assert.equal(childRedirect.prevented, true);
});
