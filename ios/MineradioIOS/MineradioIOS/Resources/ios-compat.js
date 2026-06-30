(function () {
  'use strict';

  var root = document.documentElement;
  root.classList.add('mineradio-ios-shell');
  var NETEASE_LOGIN_URL = 'https://music.163.com/#/login';
  var QQ_LOGIN_URL = 'https://y.qq.com/n/ryqq/player';
  var NETEASE_LOGIN_STORAGE_KEY = 'MINERADIO_IOS_NETEASE_LOGIN';
  var BRIDGE_TIMEOUT_MS = Math.max(1000, Number(window.__MINERADIO_IOS_BRIDGE_TIMEOUT_MS || 90000) || 90000);
  if (window.__MINERADIO_IOS_BRIDGE_TIMEOUT_MS) {
    BRIDGE_TIMEOUT_MS = Math.max(1, Number(window.__MINERADIO_IOS_BRIDGE_TIMEOUT_MS) || 10);
  }
  var bridgeSequence = 0;
  var bridgeResolvers = {};
  var lastNeteaseLoginDiagnostic = {
    phase: 'idle',
    message: '尚未开始网易云登录',
    updatedAt: Date.now()
  };

  function resolve(value) {
    return Promise.resolve(value || { ok: true, unavailableOnIOS: true });
  }

  function noopResult(extra) {
    return Object.assign({ ok: false, unavailableOnIOS: true, platform: 'ios' }, extra || {});
  }

  function jsonResponse(body, status) {
    return new Response(JSON.stringify(body), {
      status: status || 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  function readStoredNeteaseLogin() {
    try {
      var raw = localStorage.getItem(NETEASE_LOGIN_STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.cookie || !parsed.loggedIn) return null;
      return parsed;
    } catch (error) {
      return null;
    }
  }

  function extractCookieValue(cookie, name) {
    var pattern = new RegExp('(?:^|;\\s*)' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]+)');
    var match = String(cookie || '').match(pattern);
    return match ? decodeURIComponent(match[1]) : '';
  }

  function makeNeteaseLoginStatus(cookie) {
    var musicUser = extractCookieValue(cookie, 'MUSIC_U');
    var userId = musicUser ? String(Math.abs(hashString(musicUser))).slice(0, 10) : 'ios-netease';
    return {
      provider: 'netease',
      loggedIn: true,
      iosLocalLogin: true,
      nickname: '网易云账号',
      userId: userId,
      avatar: '',
      cookie: cookie,
      savedAt: Date.now()
    };
  }

  function hashString(input) {
    var hash = 0;
    for (var i = 0; i < input.length; i += 1) {
      hash = ((hash << 5) - hash) + input.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }

  function saveNeteaseLogin(cookie) {
    var status = makeNeteaseLoginStatus(cookie);
    localStorage.setItem(NETEASE_LOGIN_STORAGE_KEY, JSON.stringify(status));
    return status;
  }

  function clearNeteaseLogin() {
    localStorage.removeItem(NETEASE_LOGIN_STORAGE_KEY);
    return { ok: true, loggedIn: false, provider: 'netease', iosLocalLogin: true };
  }

  function setNeteaseLoginDiagnostic(update) {
    lastNeteaseLoginDiagnostic = Object.assign({}, lastNeteaseLoginDiagnostic, update || {}, {
      updatedAt: Date.now()
    });
    return lastNeteaseLoginDiagnostic;
  }

  function postNative(action, payload) {
    payload = payload || {};
    return new Promise(function (resolvePromise) {
      var id = 'ios-bridge-' + Date.now() + '-' + (++bridgeSequence);
      var timer = setTimeout(function () {
        var entry = bridgeResolvers[id];
        if (!entry) return;
        delete bridgeResolvers[id];
        entry.resolve(noopResult({
          reason: 'ios-bridge-timeout',
          message: '网页登录没有返回结果，请重试。'
        }));
      }, BRIDGE_TIMEOUT_MS);
      bridgeResolvers[id] = {
        resolve: resolvePromise,
        timer: timer
      };
      try {
        if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.mineradioIOS) {
          window.webkit.messageHandlers.mineradioIOS.postMessage(Object.assign({}, payload, {
            action: action,
            id: id
          }));
          return;
        }
      } catch (error) {
        console.warn('Mineradio iOS bridge failed:', error);
      }
      delete bridgeResolvers[id];
      clearTimeout(timer);
      resolvePromise(noopResult({ error: 'iOS 原生桥接不可用' }));
    });
  }

  window.__mineradioIOSBridgeResolve = function (message) {
    var id = message && message.id;
    var entry = id && bridgeResolvers[id];
    if (!entry) return;
    delete bridgeResolvers[id];
    clearTimeout(entry.timer);
    entry.resolve(message.payload || {});
  };

  function openExternalURL(url) {
    try {
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.mineradioIOS) {
        window.webkit.messageHandlers.mineradioIOS.postMessage({
          action: 'openExternalURL',
          url: url
        });
        return true;
      }
    } catch (error) {
      console.warn('Mineradio iOS bridge failed:', error);
    }
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
      return true;
    } catch (error) {
      window.location.href = url;
      return true;
    }
  }

  function openProviderLogin(provider) {
    var url = provider === 'qq' ? QQ_LOGIN_URL : NETEASE_LOGIN_URL;
    var opened = openExternalURL(url);
    return resolve(noopResult({
      openedExternalLogin: opened,
      loginUrl: url,
      reason: 'ios-external-login',
      message: '已在 Safari 打开官方登录页。iPhone 兼容版当前不能自动同步该网页登录 Cookie。'
    }));
  }

  function openNeteaseLogin() {
    setNeteaseLoginDiagnostic({
      phase: 'opening',
      reason: '',
      message: '正在打开网易云官方网页登录页',
      loginUrl: NETEASE_LOGIN_URL
    });
    return postNative('openNeteaseLogin').then(function (result) {
      if (result && result.ok && result.cookie) {
        setNeteaseLoginDiagnostic({
          phase: 'success',
          reason: '',
          message: '已获取网易云登录 Cookie',
          hasCookie: true,
          nativeDiagnostics: result.diagnostics || null
        });
        return result;
      }
      var failure = Object.assign(noopResult({
        reason: 'netease-login-incomplete',
        loginUrl: NETEASE_LOGIN_URL,
        message: result && (result.error || result.message) || '网易云登录未完成'
      }), result || {});
      setNeteaseLoginDiagnostic({
        phase: 'failed',
        reason: failure.reason || failure.error || 'netease-login-incomplete',
        message: failure.message || failure.error || '网易云登录未完成',
        hasCookie: false,
        nativeDiagnostics: failure.diagnostics || null
      });
      return failure;
    });
  }

  function readRequestBody(init) {
    if (!init || init.body == null) return Promise.resolve('');
    if (typeof init.body === 'string') return Promise.resolve(init.body);
    if (init.body instanceof URLSearchParams) return Promise.resolve(init.body.toString());
    if (init.body instanceof FormData) {
      var data = {};
      init.body.forEach(function (value, key) { data[key] = value; });
      return Promise.resolve(JSON.stringify(data));
    }
    return Promise.resolve(String(init.body));
  }

  function parseRequestJson(init) {
    return readRequestBody(init).then(function (body) {
      if (!body) return {};
      try {
        return JSON.parse(body);
      } catch (error) {
        return {};
      }
    });
  }

  function handleLocalApi(url, init) {
    var path = String(url || '').split('?')[0];
    if (path === '/api/login/status') {
      return Promise.resolve(jsonResponse(readStoredNeteaseLogin() || {
        provider: 'netease',
        loggedIn: false,
        iosLocalLogin: true
      }));
    }
    if (path === '/api/login/cookie') {
      return parseRequestJson(init).then(function (body) {
        var cookie = body && body.cookie ? String(body.cookie) : '';
        if (!cookie || cookie.indexOf('MUSIC_U=') === -1) {
          setNeteaseLoginDiagnostic({
            phase: 'failed',
            reason: 'MISSING_MUSIC_U',
            message: '网易云 Cookie 不完整，请重新登录。',
            hasCookie: false
          });
          return jsonResponse({
            ok: false,
            loggedIn: false,
            iosLocalLogin: true,
            error: 'MISSING_MUSIC_U',
            message: '网易云 Cookie 不完整，请重新登录。'
          }, 400);
        }
        setNeteaseLoginDiagnostic({
          phase: 'success',
          reason: '',
          message: '网易云会话已保存到 iPhone 本地',
          hasCookie: true
        });
        return jsonResponse(saveNeteaseLogin(cookie));
      });
    }
    if (path === '/api/ios/netease-login-diagnostics') {
      return Promise.resolve(jsonResponse(lastNeteaseLoginDiagnostic));
    }
    if (path === '/api/login/qr/key' || path === '/api/login/qr/create' || path === '/api/login/qr/check') {
      return Promise.resolve(jsonResponse({
        ok: false,
        iosOfflineShell: true,
        error: 'IOS_WEB_LOGIN_REQUIRED',
        message: 'iPhone 版请使用网页登录。'
      }, 503));
    }
    if (path === '/api/user/playlists') {
      var login = readStoredNeteaseLogin();
      return Promise.resolve(jsonResponse({
        loggedIn: !!login,
        iosLocalLogin: true,
        playlists: []
      }));
    }
    if (path === '/api/podcast/my') {
      var podcastLogin = readStoredNeteaseLogin();
      return Promise.resolve(jsonResponse({
        loggedIn: !!podcastLogin,
        iosLocalLogin: true,
        collections: []
      }));
    }
    if (path.indexOf('/api/podcast/my/items') === 0) {
      return Promise.resolve(jsonResponse({
        loggedIn: !!readStoredNeteaseLogin(),
        iosLocalLogin: true,
        items: []
      }));
    }
    if (path === '/api/qq/login/status') {
      return Promise.resolve(jsonResponse({
        provider: 'qq',
        loggedIn: false,
        preview: true,
        iosLocalLogin: true,
        nickname: 'QQ 音乐'
      }));
    }
    return Promise.resolve(jsonResponse({
      ok: false,
      iosOfflineShell: true,
      error: 'LOCAL_NODE_SERVER_UNAVAILABLE',
      message: 'iPhone 版本当前以本地界面兼容为主，桌面端 Node 服务接口不可用。'
    }, 503));
  }

  if (!window.desktopWindow) {
    window.desktopWindow = {
      isDesktop: false,
      isIOS: true,
      minimize: function () { return resolve(noopResult()); },
      toggleMaximize: function () { return resolve(noopResult()); },
      toggleFullscreen: function () { return resolve(noopResult()); },
      exitFullscreenWindowed: function () { return resolve(noopResult()); },
      getState: function () {
        return resolve({
          isDesktop: false,
          isIOS: true,
          isMaximized: false,
          isFullScreen: false,
          isPrimaryDisplay: true,
          hasDisplayOnLeft: false
        });
      },
      close: function () { return resolve(noopResult()); },
      openNeteaseMusicLogin: openNeteaseLogin,
      getNeteaseLoginDiagnostics: function () { return resolve(lastNeteaseLoginDiagnostic); },
      clearNeteaseMusicLogin: function () { return resolve(clearNeteaseLogin()); },
      openQQMusicLogin: function () { return openProviderLogin('qq'); },
      clearQQMusicLogin: function () { return resolve({ ok: true }); },
      openUpdateInstaller: function () { return resolve(noopResult({ reason: 'installer-unavailable' })); },
      restartApp: function () { return resolve(noopResult({ reason: 'restart-unavailable' })); },
      configureGlobalHotkeys: function () { return resolve({ ok: true, bindings: [] }); },
      exportJsonFile: function () { return resolve(noopResult({ reason: 'file-picker-unavailable' })); },
      importJsonFile: function () { return resolve(null); },
      onGlobalHotkey: function () { return function () {}; },
      setDesktopLyricsEnabled: function () { return resolve(noopResult({ reason: 'desktop-lyrics-unavailable' })); },
      updateDesktopLyrics: function () { return resolve(noopResult({ reason: 'desktop-lyrics-unavailable' })); },
      setWallpaperMode: function () { return resolve(noopResult({ reason: 'wallpaper-unavailable' })); },
      updateWallpaperMode: function () { return resolve(noopResult({ reason: 'wallpaper-unavailable' })); },
      onDesktopLyricsLockState: function () { return function () {}; },
      onDesktopLyricsEnabledState: function () { return function () {}; },
      onWindowState: function () { return function () {}; }
    };
  }

  var originalFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (/^\/api\//.test(url)) {
      return handleLocalApi(url, init);
    }
    if (originalFetch) return originalFetch(input, init);
    return Promise.reject(new Error('fetch unavailable'));
  };

  window.addEventListener('DOMContentLoaded', function () {
    document.body.classList.add('mineradio-ios-shell');
    document.body.classList.remove('desktop-shell', 'desktop-fullscreen', 'desktop-maximized');
  });
})();
