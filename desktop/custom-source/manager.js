const path = require('node:path');
const { EventEmitter } = require('node:events');
const { CustomSourceStore } = require('./store');
const { LxSourceRuntime } = require('./runtime');
const { parseScriptInfo, selectLxQuality, validateActionResponse } = require('./protocol');
const { toLxMusicInfo } = require('./music-info');

const QUALITY_LEVELS = Object.freeze({
  '128k': 'standard',
  '320k': 'exhigh',
  flac: 'lossless',
  flac24bit: 'hires',
});

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function initializedSources(result) {
  if (!result || typeof result !== 'object') return {};
  return clone(result.sources && typeof result.sources === 'object' ? result.sources : result);
}

function errorMessage(error) {
  return String(error?.message || error || 'CUSTOM_SOURCE_FAILED').slice(0, 1024);
}

class CustomSourceManager extends EventEmitter {
  constructor({ store, runtimeFactory, userDataPath, app, BrowserWindow, ipcMain } = {}) {
    super();
    const dataPath = userDataPath || app?.getPath?.('userData');
    if (!store && !dataPath) throw new TypeError('store or userDataPath is required');
    this.store = store || new CustomSourceStore(path.join(dataPath, 'custom-sources'));
    this.electron = { app, BrowserWindow, ipcMain };
    this.runtimeFactory = runtimeFactory || (options => new LxSourceRuntime(options));
    this.runtime = null;
    this.activeId = '';
    this.sources = {};
  }

  #getItem(id) {
    if (typeof this.store.get === 'function') return this.store.get(id);
    return this.store.list().find(item => item.id === id) || null;
  }

  #emitStatus(extra = {}) {
    this.emit('status', { ...this.getStatus(), ...extra });
  }

  #createRuntime(item, script, currentScriptInfo = item) {
    let alertSent = false;
    let alertsEnabled = false;
    let pendingAlert = null;
    const publishAlert = data => {
      const latest = this.#getItem(item.id);
      if (latest && latest.allowUpdateAlert === false) return;
      this.emit('updateAlert', { id: item.id, ...data });
    };
    const runtime = this.runtimeFactory({
      script,
      currentScriptInfo,
      electron: this.electron,
      onUpdateAlert: data => {
        if (alertSent) throw new Error('UPDATE_ALERT_FAILED: Update alert already sent');
        alertSent = true;
        if (!alertsEnabled) {
          pendingAlert = data;
          return;
        }
        publishAlert(data);
      },
    });
    return {
      runtime,
      enableAlerts() {
        alertsEnabled = true;
        if (!pendingAlert) return;
        const alert = pendingAlert;
        pendingAlert = null;
        publishAlert(alert);
      },
    };
  }

  async #stopQuietly(runtime) {
    if (!runtime || typeof runtime.stop !== 'function') return;
    try {
      await runtime.stop();
    } catch (error) {
      this.emit('runtimeError', error);
    }
  }

  async #startCandidate(item, script, currentScriptInfo = item) {
    const candidate = this.#createRuntime(item, script, currentScriptInfo);
    try {
      const result = await candidate.runtime.start();
      return { ...candidate, sources: initializedSources(result) };
    } catch (error) {
      await this.#stopQuietly(candidate.runtime);
      throw error;
    }
  }

  async startActive() {
    const active = this.store.getActive();
    if (!active) return this.getStatus();
    if (this.runtime && this.activeId === active.id) return this.getStatus();
    let candidate;
    try {
      candidate = await this.#startCandidate(active, this.store.getScript(active.id));
      this.store.setStatus(active.id, 'ready', '', candidate.sources);
    } catch (error) {
      if (candidate) await this.#stopQuietly(candidate.runtime);
      try {
        this.store.setStatus(active.id, 'failed', errorMessage(error), active.sources || {});
      } catch {}
      this.#emitStatus({ error: errorMessage(error) });
      return this.getStatus();
    }
    const previous = this.runtime;
    this.runtime = candidate.runtime;
    this.activeId = active.id;
    this.sources = candidate.sources;
    candidate.enableAlerts();
    await this.#stopQuietly(previous);
    this.#emitStatus();
    return this.getStatus();
  }

  async activate(id) {
    const item = this.#getItem(id);
    if (!item) throw new Error('SOURCE_NOT_FOUND');
    if (this.runtime && this.activeId === id) return this.getStatus();

    const candidate = await this.#startCandidate(item, this.store.getScript(id));
    const previousActiveId = this.store.getActive()?.id || '';
    try {
      this.store.setActive(id);
      this.store.setStatus(id, 'ready', '', candidate.sources);
    } catch (error) {
      try {
        this.store.setActive(previousActiveId);
      } catch {}
      await this.#stopQuietly(candidate.runtime);
      throw error;
    }

    const previous = this.runtime;
    this.runtime = candidate.runtime;
    this.activeId = id;
    this.sources = candidate.sources;
    candidate.enableAlerts();
    await this.#stopQuietly(previous);
    this.#emitStatus();
    return this.getStatus();
  }

  async deactivate() {
    this.store.setActive('');
    const previous = this.runtime;
    this.runtime = null;
    this.activeId = '';
    this.sources = {};
    await this.#stopQuietly(previous);
    this.#emitStatus();
    return this.getStatus();
  }

  async importScript(filePath, script) {
    const currentScriptInfo = parseScriptInfo(script);
    const placeholder = { id: `import_${Date.now()}`, ...currentScriptInfo, allowUpdateAlert: true };
    const candidate = await this.#startCandidate(placeholder, script, currentScriptInfo);
    try {
      return this.store.importScript(filePath, script);
    } finally {
      await this.#stopQuietly(candidate.runtime);
      this.#emitStatus();
    }
  }

  async replaceScript(id, script) {
    const item = this.#getItem(id);
    if (!item) throw new Error('SOURCE_NOT_FOUND');
    const currentScriptInfo = { ...item, ...parseScriptInfo(script) };
    const candidate = await this.#startCandidate(item, script, currentScriptInfo);
    let replaced;
    try {
      replaced = this.store.replaceScript(id, script);
    } catch (error) {
      await this.#stopQuietly(candidate.runtime);
      throw error;
    }

    if (this.activeId === id) {
      const previous = this.runtime;
      this.runtime = candidate.runtime;
      this.sources = candidate.sources;
      candidate.enableAlerts();
      await this.#stopQuietly(previous);
    } else {
      await this.#stopQuietly(candidate.runtime);
    }
    this.#emitStatus();
    return replaced;
  }

  async remove(id) {
    const wasActive = this.activeId === id;
    this.store.remove(id);
    if (wasActive) {
      const previous = this.runtime;
      this.runtime = null;
      this.activeId = '';
      this.sources = {};
      await this.#stopQuietly(previous);
    }
    this.#emitStatus();
    return this.list();
  }

  setAllowUpdateAlert(id, enabled) {
    this.store.setAllowUpdateAlert(id, enabled);
    this.#emitStatus();
    return this.list();
  }

  list() {
    return this.store.list().map(item => {
      if (item.id !== this.activeId || !this.runtime) return item;
      return { ...item, active: true, status: 'ready', message: '', sources: clone(this.sources) };
    });
  }

  getStatus() {
    if (!this.runtime || !this.activeId) return { active: false, activeId: '', sources: {} };
    return { active: true, activeId: this.activeId, sources: clone(this.sources) };
  }

  async resolveMusicUrl(song, mineradioQuality, signal) {
    if (!this.runtime || !this.activeId) return { active: false, handled: false };
    let lxSong;
    try {
      lxSong = toLxMusicInfo(song);
    } catch (error) {
      return { active: true, handled: true, url: '', reason: 'source_unsupported', error: 'SOURCE_UNSUPPORTED' };
    }
    const sourceInfo = this.sources[lxSong.source];
    if (!sourceInfo || !Array.isArray(sourceInfo.actions) || !sourceInfo.actions.includes('musicUrl')) {
      return { active: true, handled: true, url: '', reason: 'source_unsupported', error: 'SOURCE_UNSUPPORTED' };
    }
    const lxQuality = selectLxQuality(mineradioQuality, Array.isArray(sourceInfo.qualitys) ? sourceInfo.qualitys : []);
    if (!lxQuality) {
      return { active: true, handled: true, url: '', reason: 'quality_unsupported', error: 'QUALITY_UNSUPPORTED' };
    }
    const url = validateActionResponse('musicUrl', await this.runtime.request({
      source: lxSong.source,
      action: 'musicUrl',
      info: { type: lxQuality, musicInfo: lxSong },
    }, signal));
    return {
      active: true,
      handled: true,
      provider: 'lx-custom-source',
      source: lxSong.source,
      url,
      level: QUALITY_LEVELS[lxQuality],
      lxQuality,
    };
  }

  async dispose() {
    const previous = this.runtime;
    this.runtime = null;
    this.activeId = '';
    this.sources = {};
    await this.#stopQuietly(previous);
  }
}

module.exports = { CustomSourceManager };
