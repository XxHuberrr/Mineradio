const { contextBridge, ipcRenderer, webFrame } = require('electron');

const runtimeArg = process.argv.find(value => value.startsWith('--mineradio-lx-runtime-id='));
const runtimeId = runtimeArg ? runtimeArg.split('=').slice(1).join('=') : '';
const bootstrap = ipcRenderer.sendSync('mineradio-lx-bootstrap', { runtimeId });
if (!bootstrap || bootstrap.error) throw new Error('LX runtime bootstrap failed');

const currentScriptInfo = bootstrap.currentScriptInfo;
const EVENT_NAMES = Object.freeze({
  request: 'request',
  inited: 'inited',
  updateAlert: 'updateAlert',
});
let requestHandler = null;
let initialized = false;
let updateAlertSent = false;

function syncCrypto(operation, args) {
  const result = ipcRenderer.sendSync('mineradio-lx-crypto', { runtimeId, operation, args });
  if (result && result.error) throw new Error(result.error);
  return result;
}

function createLxUtils() {
  return {
    crypto: {
      md5: value => syncCrypto('md5', [value]),
      aesEncrypt: (buffer, mode, key, iv) => syncCrypto('aesEncrypt', [buffer, mode, key, iv]),
      rsaEncrypt: (buffer, key) => syncCrypto('rsaEncrypt', [buffer, key]),
      randomBytes: size => syncCrypto('randomBytes', [size]),
    },
    buffer: {
      from: (...args) => Buffer.from(...args),
      bufToString: (buffer, format) => Buffer.from(buffer).toString(format),
    },
    zlib: {
      inflate: data => ipcRenderer.invoke('mineradio-lx-zlib', { runtimeId, operation: 'inflate', data }),
      deflate: data => ipcRenderer.invoke('mineradio-lx-zlib', { runtimeId, operation: 'deflate', data }),
    },
  };
}

function reportInitError(value) {
  if (initialized) return;
  const message = typeof value === 'string' ? value : value?.message || String(value);
  ipcRenderer.send('mineradio-lx-init-error', {
    runtimeId,
    error: String(message).replace(/^Uncaught\s+(?:Error:\s*)?/, '').slice(0, 1024),
  });
}

contextBridge.exposeInMainWorld('lx', {
  version: '2.0.0',
  env: 'desktop',
  EVENT_NAMES,
  currentScriptInfo,
  request(url, options = {}, callback) {
    const requestId = `http_${Date.now()}_${Math.random()}`;
    ipcRenderer.invoke('mineradio-lx-http', { runtimeId, requestId, url, options })
      .then(result => {
        if (result && result.error) callback(new Error(result.error), null, null);
        else callback(null, result.response, result.body);
      })
      .catch(error => callback(error, null, null));
    return () => ipcRenderer.send('mineradio-lx-http-cancel', { runtimeId, requestId });
  },
  on(eventName, handler) {
    if (eventName !== EVENT_NAMES.request || typeof handler !== 'function') {
      return Promise.reject(new Error(`The event is not supported: ${eventName}`));
    }
    requestHandler = handler;
    return Promise.resolve();
  },
  send(eventName, data) {
    if (eventName === EVENT_NAMES.inited) {
      if (initialized) return Promise.reject(new Error('Script is inited'));
      initialized = true;
      return ipcRenderer.invoke('mineradio-lx-inited', { runtimeId, data });
    }
    if (eventName === EVENT_NAMES.updateAlert) {
      if (updateAlertSent) return Promise.reject(new Error('The update alert can only be called once.'));
      updateAlertSent = true;
      return ipcRenderer.invoke('mineradio-lx-update-alert', { runtimeId, data });
    }
    return Promise.reject(new Error(`The event is not supported: ${eventName}`));
  },
  utils: createLxUtils(),
});

ipcRenderer.on('mineradio-lx-request', (_event, payload) => {
  if (!payload || !requestHandler) {
    ipcRenderer.send('mineradio-lx-response', {
      runtimeId,
      requestKey: payload?.requestKey,
      error: 'Request event is not defined',
    });
    return;
  }
  Promise.resolve()
    .then(() => requestHandler(payload.data))
    .then(result => ipcRenderer.send('mineradio-lx-response', {
      runtimeId,
      requestKey: payload.requestKey,
      result,
    }))
    .catch(error => ipcRenderer.send('mineradio-lx-response', {
      runtimeId,
      requestKey: payload.requestKey,
      error: String(error?.message || error).slice(0, 1024),
    }));
});

window.addEventListener('error', event => reportInitError(event.message));
window.addEventListener('unhandledrejection', event => reportInitError(event.reason));

ipcRenderer.once('mineradio-lx-script', (_event, payload) => {
  if (!payload || payload.runtimeId !== runtimeId || typeof payload.script !== 'string') {
    reportInitError('Invalid script payload');
    return;
  }
  // Execute in the page's main world. Context isolation keeps preload's Node
  // globals out of reach of the custom source.
  webFrame.executeJavaScript(`(0, eval)(${JSON.stringify(payload.script)})`)
    .catch(reportInitError);
});
