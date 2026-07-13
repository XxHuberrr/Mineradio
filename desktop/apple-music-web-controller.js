'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  buildCommandScript,
  normalizeCommandResponse,
  normalizePageEvent,
} = require('./apple-music-web-protocol');

const APPLE_MUSIC_INFO_URL = 'https://www.apple.com.cn/apple-music/';
const APPLE_MUSIC_URL = 'https://music.apple.com/cn';
const APPLE_MUSIC_PARTITION = 'persist:mineradio-apple-music';
const APPLE_MUSIC_AUTH_HOSTS = new Set([
  'auth.music.apple.com',
  'idmsa.apple.com',
]);

function isAllowedAppleMusicUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'music.apple.com';
  } catch (_) {
    return false;
  }
}

function isAllowedAppleAuthUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && APPLE_MUSIC_AUTH_HOSTS.has(url.hostname);
  } catch (_) {
    return false;
  }
}

function classifyApplePopupUrl(value) {
  if (isAllowedAppleMusicUrl(value) || isAllowedAppleAuthUrl(value)) return 'allow';
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? 'external' : 'deny';
  } catch (_) {
    return 'deny';
  }
}

function buildBrowserUserAgent(chromeVersion = process.versions.chrome) {
  const version = String(chromeVersion || '140.0.0.0');
  return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;
}

function createAppleMusicWebController(options) {
  const {
    BrowserWindow,
    session,
    shell,
    getMainWindow,
    ensureWidevineReady = async () => ({ ok: false, unavailable: true }),
  } = options;
  const hookSource = fs.readFileSync(path.join(__dirname, 'apple-music-web-hook.js'), 'utf8');
  let playerWindow = null;
  let openPromise = null;
  let openGeneration = 0;
  let sessionConfigured = false;
  const guardedWindows = new WeakSet();

  function appleSession() {
    const target = session.fromPartition(APPLE_MUSIC_PARTITION);
    if (!sessionConfigured) {
      sessionConfigured = true;
      const userAgent = buildBrowserUserAgent();
      target.setUserAgent(userAgent);
      target.webRequest.onBeforeSendHeaders({
        urls: [
          '*://*.apple.com/*',
          '*://*.icloud.com/*',
          '*://*.mzstatic.com/*',
        ],
      }, (details, callback) => {
        details.requestHeaders['User-Agent'] = userAgent;
        callback({ requestHeaders: details.requestHeaders });
      });
    }
    return target;
  }

  function sendToPoc(event) {
    const clean = normalizePageEvent(event);
    const owner = getMainWindow();
    if (!clean || !owner || owner.isDestroyed()) return false;
    owner.webContents.send('mineradio-apple-music-web-event', clean);
    return true;
  }

  async function injectHook(win = playerWindow) {
    if (!win || win.isDestroyed() || win !== playerWindow) return;
    try {
      await win.webContents.executeJavaScript(hookSource, true);
    } catch (_) {
      sendToPoc({
        type: 'error',
        code: 'APPLE_MUSIC_HOOK_FAILED',
      });
    }
  }

  function openExternal(url) {
    if (classifyApplePopupUrl(url) === 'external') shell.openExternal(url).catch(() => {});
  }

  function popupPolicy(win, url) {
    const disposition = classifyApplePopupUrl(url);
    if (disposition === 'allow') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 560,
          height: 760,
          minWidth: 420,
          minHeight: 560,
          parent: win,
          title: 'Apple 账户登录',
          autoHideMenuBar: true,
          backgroundColor: '#ffffff',
          webPreferences: {
            partition: APPLE_MUSIC_PARTITION,
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            plugins: true,
          },
        },
      };
    }
    if (disposition === 'external') openExternal(url);
    return { action: 'deny' };
  }

  function guardAppleWindow(win, scope) {
    if (!win || win.isDestroyed() || guardedWindows.has(win)) return;
    guardedWindows.add(win);
    const guardNavigation = (event, url) => {
      const allowed = isAllowedAppleMusicUrl(url)
        || scope === 'auth' && isAllowedAppleAuthUrl(url);
      if (allowed) return;
      event.preventDefault();
      openExternal(url);
    };
    win.webContents.on('will-navigate', guardNavigation);
    win.webContents.on('will-redirect', guardNavigation);
    win.webContents.setWindowOpenHandler(({ url }) => popupPolicy(win, url));
    win.webContents.on('did-create-window', (child) => guardAppleWindow(child, 'auth'));
  }

  async function focusExisting(win) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    await injectHook(win);
    return { ok: true, reused: true };
  }

  function assertOpenGeneration(generation) {
    if (generation !== openGeneration) throw new Error('APPLE_MUSIC_OPEN_CANCELLED');
  }

  async function createPlayerWindow(generation) {
    await ensureWidevineReady();
    assertOpenGeneration(generation);
    if (playerWindow && !playerWindow.isDestroyed()) {
      return focusExisting(playerWindow);
    }

    const win = new BrowserWindow({
      width: 1240,
      height: 820,
      minWidth: 880,
      minHeight: 620,
      show: false,
      title: 'Apple Music · Mineradio',
      backgroundColor: '#111111',
      autoHideMenuBar: true,
      webPreferences: {
        partition: APPLE_MUSIC_PARTITION,
        preload: path.join(__dirname, 'apple-music-web-preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        plugins: true,
        backgroundThrottling: false,
      },
    });
    playerWindow = win;

    appleSession();
    win.on('page-title-updated', (event) => event.preventDefault());
    win.once('ready-to-show', () => {
      if (!win.isDestroyed() && win === playerWindow) win.show();
    });
    win.on('closed', () => {
      if (playerWindow !== win) return;
      playerWindow = null;
      openGeneration += 1;
      openPromise = null;
      sendToPoc({
        type: 'status',
        authorized: false,
        storefrontId: '',
        isPlaying: false,
        audioContextState: '',
        spectrumActive: false,
      });
    });
    win.webContents.on('did-finish-load', () => injectHook(win));
    win.webContents.on('did-navigate-in-page', () => injectHook(win));
    win.webContents.on('render-process-gone', (_event, details) => {
      if (playerWindow !== win) return;
      sendToPoc({
        type: 'error',
        code: 'APPLE_MUSIC_RENDERER_GONE',
        message: details && details.reason || 'Apple Music renderer stopped',
      });
    });
    guardAppleWindow(win, 'player');

    try {
      await win.loadURL(APPLE_MUSIC_URL, {
        userAgent: buildBrowserUserAgent(),
      });
      assertOpenGeneration(generation);
      if (win.isDestroyed() || playerWindow !== win) {
        throw new Error('APPLE_MUSIC_OPEN_CANCELLED');
      }
    } catch (error) {
      if (playerWindow === win) playerWindow = null;
      if (!win.isDestroyed()) win.destroy();
      throw error;
    }
    return { ok: true, reused: false };
  }

  function open() {
    if (openPromise) return openPromise;
    if (playerWindow && !playerWindow.isDestroyed()) {
      return focusExisting(playerWindow);
    }
    const generation = openGeneration;
    let trackedPromise;
    trackedPromise = createPlayerWindow(generation).finally(() => {
      if (openPromise === trackedPromise) openPromise = null;
    });
    openPromise = trackedPromise;
    return trackedPromise;
  }

  async function command(name, payload) {
    if (!playerWindow || playerWindow.isDestroyed()) {
      return { ok: false, error: 'APPLE_MUSIC_WINDOW_NOT_OPEN' };
    }
    try {
      const response = await playerWindow.webContents.executeJavaScript(
        buildCommandScript(name, payload),
        true
      );
      return normalizeCommandResponse(name, response);
    } catch (_) {
      return { ok: false, error: 'APPLE_MUSIC_COMMAND_FAILED' };
    }
  }

  function owns(webContents) {
    return !!playerWindow
      && !playerWindow.isDestroyed()
      && playerWindow.webContents === webContents;
  }

  function handlePageEvent(webContents, event) {
    if (!owns(webContents)) return false;
    return sendToPoc(event);
  }

  function close() {
    openGeneration += 1;
    openPromise = null;
    const win = playerWindow;
    playerWindow = null;
    if (win && !win.isDestroyed()) win.close();
  }

  return {
    open,
    command,
    close,
    owns,
    handlePageEvent,
    isOpen: () => !!playerWindow && !playerWindow.isDestroyed(),
  };
}

module.exports = {
  APPLE_MUSIC_INFO_URL,
  APPLE_MUSIC_PARTITION,
  APPLE_MUSIC_URL,
  buildBrowserUserAgent,
  classifyApplePopupUrl,
  createAppleMusicWebController,
  isAllowedAppleAuthUrl,
  isAllowedAppleMusicUrl,
};
