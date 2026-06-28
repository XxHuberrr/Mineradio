#!/usr/bin/env node
'use strict';

const { spawn, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const defaultApp = path.join(repoRoot, 'dist', 'mac-arm64', 'Mineradio.app', 'Contents', 'MacOS', 'Mineradio');
const appPath = process.env.MINERADIO_APP_PATH || defaultApp;
const outDir = path.join(repoRoot, 'output', 'perf');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const runLabel = process.env.MINERADIO_PROFILE_LABEL || 'macos-runtime';
const runDir = path.join(outDir, `${stamp}-${runLabel}`);
const port = Number(process.env.MINERADIO_CDP_PORT || 31992);
const sampleMs = Number(process.env.MINERADIO_PROFILE_SAMPLE_MS || 6000);
const startupSampleMs = Number(process.env.MINERADIO_PROFILE_STARTUP_SAMPLE_MS || 5200);
const launchTimeoutMs = Number(process.env.MINERADIO_PROFILE_LAUNCH_TIMEOUT_MS || 45000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureExecutable(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`Packaged app executable not found: ${file}`);
  }
}

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function jsonFetch(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { signal: controller.signal }).then(async (res) => {
    clearTimeout(timer);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  }).catch((error) => {
    clearTimeout(timer);
    throw error;
  });
}

async function waitForTargets() {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < launchTimeoutMs) {
    try {
      const targets = await jsonFetch(`http://127.0.0.1:${port}/json/list`, 2500);
      const pages = targets.filter((target) => target.type === 'page' && target.webSocketDebuggerUrl);
      if (pages.length) return pages;
    } catch (error) {
      lastError = error;
    }
    await sleep(350);
  }
  throw new Error(`Timed out waiting for CDP targets on ${port}${lastError ? `: ${lastError.message}` : ''}`);
}

async function getTargets() {
  try {
    const targets = await jsonFetch(`http://127.0.0.1:${port}/json/list`, 5000);
    return targets.filter((target) => target.type === 'page' && target.webSocketDebuggerUrl);
  } catch {
    return [];
  }
}

function targetName(target) {
  return `${target.title || '(untitled)'} ${target.url || ''}`;
}

function pickMainTarget(targets) {
  const byUrl = targets.find((target) => /127\.0\.0\.1|localhost/.test(target.url || ''));
  if (byUrl) return byUrl;
  const byTitle = targets.find((target) => /Mineradio/i.test(target.title || ''));
  return byTitle || targets[0];
}

class CdpClient {
  constructor(target) {
    this.target = target;
    this.id = 1;
    this.pending = new Map();
    this.events = [];
    this.ws = new WebSocket(target.webSocketDebuggerUrl);
    this.ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`CDP connect timeout: ${targetName(target)}`)), 10000);
      this.ws.addEventListener('open', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      this.ws.addEventListener('error', (event) => {
        clearTimeout(timer);
        reject(new Error(`CDP socket error: ${event.message || targetName(target)}`));
      }, { once: true });
    });
    this.ws.addEventListener('message', (event) => {
      let msg = null;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject, timer } = this.pending.get(msg.id);
        clearTimeout(timer);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message || 'CDP error'} (${msg.error.code || 'no-code'})`));
        else resolve(msg.result || {});
        return;
      }
      if (msg.method) this.events.push(msg);
    });
  }

  async send(method, params = {}, timeoutMs = 30000) {
    await this.ready;
    const id = this.id++;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(payload);
    });
  }

  async eval(expression, opts = {}) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: opts.awaitPromise !== false,
      returnByValue: opts.returnByValue !== false,
      userGesture: !!opts.userGesture,
    }, opts.timeoutMs || 45000);
    if (result.exceptionDetails) {
      const text = result.exceptionDetails.text || 'Runtime exception';
      throw new Error(text);
    }
    return result.result ? result.result.value : undefined;
  }

  async screenshot(fileName) {
    await this.send('Page.bringToFront').catch(() => {});
    const result = await this.send('Page.captureScreenshot', { format: 'png', fromSurface: true }, 30000);
    const file = path.join(runDir, fileName);
    fs.writeFileSync(file, Buffer.from(result.data || '', 'base64'));
    return file;
  }

  close() {
    try {
      this.ws.close();
    } catch {}
  }
}

async function createClient(target) {
  const client = new CdpClient(target);
  await client.ready;
  await client.send('Runtime.enable').catch(() => {});
  await client.send('Page.enable').catch(() => {});
  await client.send('Performance.enable').catch(() => {});
  return client;
}

const installObserverExpression = `(() => {
  if (window.__mineradioProfileObserverInstalled) return true;
  window.__mineradioProfileObserverInstalled = true;
  window.__mineradioProfileLongTasks = [];
  window.__mineradioProfileMarks = [];
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__mineradioProfileLongTasks.push({
          name: entry.name,
          startTime: entry.startTime,
          duration: entry.duration
        });
      }
    }).observe({ entryTypes: ['longtask'] });
  } catch (e) {
    window.__mineradioProfileLongTaskError = String(e && e.message || e);
  }
  return true;
})()`;

function frameSamplerExpression(durationMs) {
  return `new Promise((resolve) => {
    const start = performance.now();
    const frames = [];
    let last = start;
    function tick(now) {
      frames.push(now - last);
      last = now;
      if (now - start >= ${Math.max(500, Number(durationMs) || sampleMs)}) {
        const sorted = frames.slice().sort((a, b) => a - b);
        const pick = (p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)))] : 0;
        const over16 = frames.filter((v) => v > 16.9).length;
        const over33 = frames.filter((v) => v > 33.4).length;
        const over50 = frames.filter((v) => v > 50).length;
        const avg = frames.reduce((a, b) => a + b, 0) / Math.max(1, frames.length);
        resolve({
          durationMs: performance.now() - start,
          frameCount: frames.length,
          avgFrameMs: avg,
          p50FrameMs: pick(0.50),
          p90FrameMs: pick(0.90),
          p95FrameMs: pick(0.95),
          p99FrameMs: pick(0.99),
          maxFrameMs: sorted[sorted.length - 1] || 0,
          estimatedFps: 1000 / Math.max(1, avg),
          over16,
          over33,
          over50
        });
      } else {
        requestAnimationFrame(tick);
      }
    }
    requestAnimationFrame(tick);
  })`;
}

const collectStateExpression = `(() => {
  const perf = window.__mineradioPerfSnapshot ? window.__mineradioPerfSnapshot() : null;
  const rafPerf = window.__mineradioPerf || null;
  const longTasks = Array.isArray(window.__mineradioProfileLongTasks) ? window.__mineradioProfileLongTasks.slice() : [];
  const appPerf = window.__mineradioAppPerf || window.__appPerf || null;
  const canvases = Array.from(document.querySelectorAll('canvas')).map((canvas) => ({
    id: canvas.id || '',
    width: canvas.width || 0,
    height: canvas.height || 0,
    cssWidth: canvas.getBoundingClientRect().width,
    cssHeight: canvas.getBoundingClientRect().height,
    visible: getComputedStyle(canvas).visibility !== 'hidden' && getComputedStyle(canvas).display !== 'none'
  }));
  return {
    title: document.title,
    url: location.href,
    readyState: document.readyState,
    bodyClass: document.body.className,
    htmlClass: document.documentElement.className,
    platform: window.desktopWindow && window.desktopWindow.platform,
    isMac: !!(window.desktopWindow && window.desktopWindow.isMac),
    overlayPlatform: window.desktopOverlay && window.desktopOverlay.platform,
    isMacOverlay: !!(window.desktopOverlay && window.desktopOverlay.isMac),
    runtimeKind: window.desktopWindow ? 'main' : (window.desktopOverlay ? 'overlay' : 'web'),
    canvasCount: canvases.length,
    canvases,
    buttonCount: document.querySelectorAll('button').length,
    hiddenWindowButtons: Array.from(document.querySelectorAll('.desktop-window-btn')).filter((el) => getComputedStyle(el).display === 'none').length,
    visibleWindowButtons: Array.from(document.querySelectorAll('.desktop-window-btn')).filter((el) => getComputedStyle(el).display !== 'none').length,
    perf,
    rafPerf,
    appPerf,
    longTaskCount: longTasks.length,
    longTaskDurationMs: longTasks.reduce((sum, item) => sum + (item.duration || 0), 0),
    longTaskMaxMs: longTasks.reduce((max, item) => Math.max(max, item.duration || 0), 0),
    longTaskRecent: longTasks.slice(-12)
  };
})()`;

async function cpuSnapshot(rootPid) {
  const pids = await processTree(rootPid);
  if (!pids.length) return null;
  return new Promise((resolve) => {
    execFile('ps', ['-p', pids.join(','), '-o', 'pid=', '-o', 'pcpu=', '-o', 'rss=', '-o', 'comm='], (error, stdout) => {
      if (error) {
        resolve({ pids, error: error.message });
        return;
      }
      const processes = stdout.trim().split(/\n/).filter(Boolean).map((line) => {
        const match = line.trim().match(/^(\d+)\s+([\d.]+)\s+(\d+)\s+(.+)$/);
        if (!match) return null;
        return {
          pid: Number(match[1]),
          cpu: Number(match[2]),
          rssKb: Number(match[3]),
          command: match[4],
        };
      }).filter(Boolean);
      resolve({
        pids,
        processCount: processes.length,
        cpuPercent: processes.reduce((sum, proc) => sum + proc.cpu, 0),
        rssMb: processes.reduce((sum, proc) => sum + proc.rssKb, 0) / 1024,
        processes,
      });
    });
  });
}

async function processTree(rootPid) {
  const childMap = await new Promise((resolve) => {
    execFile('ps', ['-axo', 'pid=,ppid='], (error, stdout) => {
      if (error) {
        resolve(new Map());
        return;
      }
      const map = new Map();
      stdout.trim().split(/\n/).forEach((line) => {
        const parts = line.trim().split(/\s+/);
        const pid = Number(parts[0]);
        const ppid = Number(parts[1]);
        if (!Number.isFinite(pid) || !Number.isFinite(ppid)) return;
        if (!map.has(ppid)) map.set(ppid, []);
        map.get(ppid).push(pid);
      });
      resolve(map);
    });
  });
  const seen = new Set();
  const queue = [Number(rootPid)];
  while (queue.length) {
    const pid = queue.shift();
    if (!Number.isFinite(pid) || seen.has(pid)) continue;
    seen.add(pid);
    const children = childMap.get(pid) || [];
    for (const child of children) queue.push(child);
  }
  return Array.from(seen);
}

async function collectScenario(client, rootPid, name, durationMs, beforeEval) {
  if (beforeEval) await client.eval(beforeEval, { userGesture: true, timeoutMs: 60000 });
  await sleep(250);
  await client.eval(installObserverExpression);
  const frame = await client.eval(frameSamplerExpression(durationMs), { timeoutMs: durationMs + 20000 });
  const state = await client.eval(collectStateExpression, { timeoutMs: 20000 });
  const metrics = await client.send('Performance.getMetrics').catch((error) => ({ error: error.message }));
  const cpu = await cpuSnapshot(rootPid);
  const screenshot = await client.screenshot(`${name}.png`).catch((error) => ({ error: error.message }));
  const result = { name, frame, state, metrics, cpu, screenshot };
  fs.writeFileSync(path.join(runDir, `${name}.json`), JSON.stringify(result, null, 2));
  return result;
}

async function waitForExpression(client, expression, timeoutMs = 12000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const ok = await client.eval(expression, { timeoutMs: 5000 }).catch(() => false);
    if (ok) return true;
    await sleep(250);
  }
  return false;
}

function syntheticPlaybackExpression() {
  return `(() => {
    document.body.classList.remove('splash-active', 'splash-revealing');
    const splash = document.getElementById('splash');
    if (splash) {
      splash.classList.add('hide');
      splash.style.display = 'none';
    }
    if (typeof updateEmptyHomeVisibility === 'function') updateEmptyHomeVisibility({ forceLoad: false });
    if (typeof switchPlaybackVisualToEmily === 'function') switchPlaybackVisualToEmily();
    if (typeof setPreset === 'function') setPreset(0, { silent: true, preserveCamera: false, noSave: true });
    window.__mineradioProfileSyntheticStart = performance.now();
    if (window.__mineradioProfileSyntheticTimer) clearInterval(window.__mineradioProfileSyntheticTimer);
    window.__mineradioProfileSyntheticTimer = setInterval(() => {
      const t = (performance.now() - window.__mineradioProfileSyntheticStart) / 1000;
      try {
        playing = true;
        beatPulse = 0.35 + Math.max(0, Math.sin(t * 7.2)) * 0.95;
        bass = 0.22 + Math.max(0, Math.sin(t * 3.8)) * 0.72;
        mid = 0.18 + Math.max(0, Math.sin(t * 4.4 + 1.2)) * 0.62;
        treble = 0.20 + Math.max(0, Math.sin(t * 8.6 + 0.5)) * 0.55;
      } catch (e) {}
    }, 16);
    return true;
  })()`;
}

function stopSyntheticPlaybackExpression() {
  return `(() => {
    if (window.__mineradioProfileSyntheticTimer) clearInterval(window.__mineradioProfileSyntheticTimer);
    window.__mineradioProfileSyntheticTimer = 0;
    try { playing = false; } catch (e) {}
    return true;
  })()`;
}

function settleTransientGuideExpression() {
  return `(() => {
    try {
      if (typeof startupLoginGuideShown !== 'undefined') startupLoginGuideShown = true;
      if (typeof loginGuideRaf !== 'undefined' && loginGuideRaf) cancelAnimationFrame(loginGuideRaf);
      if (typeof loginGuideRaf !== 'undefined') loginGuideRaf = 0;
      if (typeof loginGuideAnimating !== 'undefined') loginGuideAnimating = false;
      if (typeof maybeRunStartupLoginGuide === 'function') maybeRunStartupLoginGuide = function(){ return false; };
      if (typeof runLoginGuideParticles === 'function') runLoginGuideParticles = function(done){
        if (typeof done === 'function') done();
        return false;
      };
    } catch (e) {}
    document.body.classList.remove('login-guide-active');
    const canvas = document.getElementById('login-guide-canvas');
    if (canvas) {
      try {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width || 0, canvas.height || 0);
      } catch (e) {}
    }
    return true;
  })()`;
}

function desktopLyricsExpression(enabled) {
  if (!enabled) {
    return `window.desktopWindow.setDesktopLyricsEnabled(false, {})`;
  }
  return `window.desktopWindow.setDesktopLyricsEnabled(true, {
    enabled: true,
    clickThrough: true,
    current: 'Mineradio Mac overlay profiling',
    text: 'Mineradio Mac overlay profiling',
    next: 'native smoothness check',
    progress: 0.42,
    size: 1,
    opacity: 0.92,
    y: 0.76,
    playing: true,
    cinema: true,
    highlightFollow: true,
    frameRate: 60,
    colors: { primary: '#d6f8ff', secondary: '#9cffdf', highlight: '#fff0b8', glow: '#9cffdf' }
  })`;
}

function wallpaperExpression(enabled) {
  if (!enabled) {
    return `window.desktopWindow.setWallpaperMode(false, {})`;
  }
  return `window.desktopWindow.setWallpaperMode(true, {
    enabled: true,
    title: 'Mineradio Mac wallpaper profiling',
    artist: 'native fallback',
    playing: true,
    preset: 0,
    opacity: 0.62,
    colors: { primary: '#d6f8ff', secondary: '#9cffdf', highlight: '#fff0b8', glow: '#9cffdf' }
  })`;
}

async function maybeCollectOverlayPage(rootPid, urlNeedle, name) {
  const targets = await getTargets();
  const target = targets.find((item) => (item.url || '').includes(urlNeedle));
  if (!target) return { name, skipped: `No target containing ${urlNeedle}` };
  const client = await createClient(target);
  try {
    return await collectScenario(client, rootPid, name, Math.max(2600, Math.min(sampleMs, 4200)));
  } finally {
    client.close();
  }
}

async function main() {
  ensureExecutable(appPath);
  mkdirp(runDir);
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-profile-'));
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
  ];
  const child = spawn(appPath, args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      MINERADIO_PROFILE_RUN: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const logs = [];
  child.stdout.on('data', (chunk) => logs.push({ stream: 'stdout', text: chunk.toString('utf8') }));
  child.stderr.on('data', (chunk) => logs.push({ stream: 'stderr', text: chunk.toString('utf8') }));

  const report = {
    runLabel,
    startedAt: new Date().toISOString(),
    repoRoot,
    appPath,
    cdpPort: port,
    sampleMs,
    startupSampleMs,
    profileDir,
    pid: child.pid,
    scenarios: [],
    targets: [],
    errors: [],
  };

  let mainClient = null;
  try {
    const targets = await waitForTargets();
    report.targets = targets.map((target) => ({ title: target.title, url: target.url, id: target.id }));
    mainClient = await createClient(pickMainTarget(targets));
    await waitForExpression(mainClient, `document.readyState === 'complete' || document.readyState === 'interactive'`, 20000);
    await mainClient.eval(installObserverExpression);

    report.scenarios.push(await collectScenario(mainClient, child.pid, '01-splash-startup', startupSampleMs));

    await waitForExpression(mainClient, `document.getElementById('splash') && document.getElementById('splash').classList.contains('ready')`, 9000);
    await mainClient.eval(`(() => { const splash = document.getElementById('splash'); if (splash) splash.click(); return true; })()`, { userGesture: true });
    await waitForExpression(mainClient, `!document.body.classList.contains('splash-active')`, 7000);
    await waitForExpression(mainClient, `!document.body.classList.contains('login-guide-active') && !(typeof loginGuideAnimating !== 'undefined' && loginGuideAnimating)`, 10000);
    await mainClient.eval(settleTransientGuideExpression()).catch(() => {});
    report.scenarios.push(await collectScenario(mainClient, child.pid, '02-home-idle', sampleMs));

    report.scenarios.push(await collectScenario(mainClient, child.pid, '03-synthetic-playback-visual', sampleMs, syntheticPlaybackExpression()));
    await mainClient.eval(stopSyntheticPlaybackExpression()).catch(() => {});

    report.scenarios.push(await collectScenario(mainClient, child.pid, '04-desktop-lyrics-main', sampleMs, desktopLyricsExpression(true)));
    await sleep(750);
    report.scenarios.push(await maybeCollectOverlayPage(child.pid, 'desktop-lyrics.html', '04b-desktop-lyrics-window'));
    await mainClient.eval(desktopLyricsExpression(false), { userGesture: true }).catch((error) => {
      report.errors.push(`desktop lyrics close failed: ${error.message}`);
    });

    report.scenarios.push(await collectScenario(mainClient, child.pid, '05-wallpaper-main', sampleMs, wallpaperExpression(true)));
    await sleep(750);
    report.scenarios.push(await maybeCollectOverlayPage(child.pid, 'wallpaper.html', '05b-wallpaper-window'));
    await mainClient.eval(wallpaperExpression(false), { userGesture: true }).catch((error) => {
      report.errors.push(`wallpaper close failed: ${error.message}`);
    });
  } catch (error) {
    report.errors.push(error.stack || error.message);
    process.exitCode = 1;
  } finally {
    if (mainClient) mainClient.close();
    report.finishedAt = new Date().toISOString();
    report.logs = logs.slice(-120);
    fs.writeFileSync(path.join(runDir, 'report.json'), JSON.stringify(report, null, 2));
    child.kill('SIGTERM');
    await sleep(1200);
    if (!child.killed) child.kill('SIGKILL');
    console.log(JSON.stringify({
      ok: !report.errors.length,
      runDir,
      scenarios: report.scenarios.map((item) => item.name),
      errors: report.errors,
    }, null, 2));
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
