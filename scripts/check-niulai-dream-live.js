#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const port = Number(process.argv[2] || 9237);

async function main() {
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json());
  const target = targets.find(item => item.type === 'page' && /127\.0\.0\.1|localhost/.test(item.url || ''));
  assert(target && target.webSocketDebuggerUrl, 'Mineradio CDP page target was not found');

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const waiter = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });
  function call(method, params = {}) {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const response = await call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || 'Renderer evaluation failed');
    return response.result?.value;
  }

  await call('Runtime.enable');
  await call('Page.enable');
  await call('Page.reload', { ignoreCache: true });
  await new Promise(resolve => setTimeout(resolve, 900));
  const outputDir = path.join(__dirname, '..', 'output', 'playwright');
  fs.mkdirSync(outputDir, { recursive: true });

  await evaluate(`(async () => {
    const deadline = performance.now() + 20000;
    while (performance.now() < deadline && !(window.MineradioNiuLaiDream && typeof setPreset === 'function' && window.renderer && window.scene && window.camera)) {
      await new Promise(resolve => setTimeout(resolve, 80));
    }
    if (!(window.MineradioNiuLaiDream && typeof setPreset === 'function')) throw new Error('NIULAI_RUNTIME_NOT_READY');
    if (document.body.classList.contains('splash-active')) dismissSplash({ instant: true });
    if (document.body.classList.contains('empty-home-active') && typeof dismissHomePage === 'function') dismissHomePage({});
    document.querySelectorAll('.modal-mask,.visual-guide').forEach(node => {
      if (node.style) node.style.display = 'none';
      if (node.classList) node.classList.remove('open', 'show');
    });
    setPreset(10, { noSave: true, silent: true, preserveCamera: true });
    clearInterval(window.__mineradioNiuLaiQaTimer);
    window.__mineradioNiuLaiQaTimer = setInterval(() => {
      const t = performance.now() / 1000;
      const hit = Math.sin(t * Math.PI * 2.1) > 0.88 ? 1 : 0;
      MineradioNiuLaiDream.update(1 / 60, {
        scene,
        camera,
        fx,
        audio: {
          sonicDetailed: true,
          subBass: 0.50 + hit * 0.42,
          bass: 0.45 + hit * 0.44,
          lowMid: 0.36 + Math.sin(t * 1.9) * 0.12,
          mid: 0.34 + Math.sin(t * 2.5 + 1) * 0.11,
          highMid: 0.30 + Math.sin(t * 3.1 + 2) * 0.10,
          presence: 0.28 + Math.sin(t * 3.8 + 3) * 0.09,
          brilliance: 0.25 + Math.sin(t * 4.8 + 4) * 0.08,
          air: 0.22 + Math.sin(t * 5.7 + 5) * 0.07,
          energy: 0.56 + hit * 0.30,
          kickEnvelope: hit,
          triggerPulse: hit
        }
      });
    }, 16);
    await new Promise(resolve => setTimeout(resolve, 1100));
    if (typeof dismissHomePage === 'function') dismissHomePage({});
    setPreset(10, { noSave: true, silent: true, preserveCamera: true });
    await new Promise(resolve => setTimeout(resolve, 360));
    return true;
  })()`);

  async function capture(entry) {
    await call('Emulation.setDeviceMetricsOverride', {
      width: entry.width,
      height: entry.height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await evaluate(`MineradioNiuLaiDream._test.setTimeForQa(${entry.time})`);
    await new Promise(resolve => setTimeout(resolve, 260));
    const metrics = await evaluate(`(() => {
      renderer.render(scene, camera);
      const source = renderer.domElement;
      const sample = document.createElement('canvas');
      sample.width = 120;
      sample.height = 72;
      const context = sample.getContext('2d', { willReadFrequently: true });
      context.drawImage(source, 0, 0, sample.width, sample.height);
      const data = context.getImageData(0, 0, sample.width, sample.height).data;
      let minimum = 255;
      let maximum = 0;
      let nonBlack = 0;
      let total = 0;
      for (let index = 0; index < data.length; index += 4) {
        const value = Math.round(data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722);
        minimum = Math.min(minimum, value);
        maximum = Math.max(maximum, value);
        total += value;
        if (value > 4 && data[index + 3] > 16) nonBlack += 1;
      }
      function projection(name) {
        const object = scene.getObjectByName(name);
        if (!object) return null;
        const point = new THREE.Vector3();
        object.getWorldPosition(point);
        point.project(camera);
        return { x: point.x, y: point.y, z: point.z };
      }
      const card = document.querySelector('.preset-card[data-preset="10"]');
      return {
        canvasWidth: source.width,
        canvasHeight: source.height,
        pixelSpan: maximum - minimum,
        nonBlack,
        average: total / (data.length / 4),
        snapshot: MineradioNiuLaiDream.snapshot(),
        selectedPreset: fx.preset,
        homeCovered: document.body.classList.contains('empty-home-active'),
        cowProjection: projection('niulai-low-poly-calf'),
        larkProjection: projection('niulai-low-poly-lark'),
        authorText: card ? card.textContent.replace(/\\s+/g, ' ').trim() : '',
        shelfParentVisible: !!(shelfManager && shelfManager.getCards && shelfManager.getCards().some(item => item.mesh && item.mesh.parent && item.mesh.parent.visible)),
      };
    })()`);
    const screenshot = await call('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const screenshotPath = path.join(outputDir, `niulai-dream-${entry.name}.png`);
    fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
    return { ...entry, ...metrics, screenshotPath };
  }

  const captures = [];
  captures.push(await capture({ name: 'desert-wide', width: 1280, height: 800, time: 0, chapter: 'desert-lullaby' }));
  captures.push(await capture({ name: 'grassland-compact', width: 820, height: 720, time: 22, chapter: 'grassland-awakening' }));
  captures.push(await capture({ name: 'forest-wide', width: 1100, height: 700, time: 44, chapter: 'forest-stand' }));
  captures.push(await capture({ name: 'ink-wide', width: 1100, height: 700, time: 66, chapter: 'ink-dream' }));

  const presetCard = await evaluate(`(async () => {
    toggleFxPanel(true);
    const card = document.querySelector('.preset-card[data-preset="10"]');
    if (!card) throw new Error('NIULAI_PRESET_CARD_NOT_FOUND');
    card.scrollIntoView({ block: 'center' });
    await new Promise(resolve => setTimeout(resolve, 320));
    const name = card.querySelector('.pc-name');
    const desc = card.querySelector('.pc-desc');
    return {
      active: card.classList.contains('active'),
      text: card.textContent.replace(/\\s+/g, ' ').trim(),
      nameFits: !!name && name.scrollWidth <= name.clientWidth + 1 && name.scrollHeight <= name.clientHeight + 1,
      descFits: !!desc && desc.scrollWidth <= desc.clientWidth + 1 && desc.scrollHeight <= desc.clientHeight + 1,
    };
  })()`);
  const presetCardImage = await call('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const presetCardScreenshotPath = path.join(outputDir, 'niulai-dream-preset-card.png');
  fs.writeFileSync(presetCardScreenshotPath, Buffer.from(presetCardImage.data, 'base64'));
  await evaluate(`toggleFxPanel(false)`);

  const motion = await evaluate(`(async () => {
    const cape = scene.getObjectByName('niulai-red-cape');
    const lark = scene.getObjectByName('niulai-low-poly-lark');
    const last = cape.geometry.attributes.position.count - 1;
    const before = { cape: cape.geometry.attributes.position.getY(last), larkX: lark.position.x, phase: MineradioNiuLaiDream.snapshot().motionPhase };
    await new Promise(resolve => setTimeout(resolve, 320));
    renderer.render(scene, camera);
    const after = { cape: cape.geometry.attributes.position.getY(last), larkX: lark.position.x, phase: MineradioNiuLaiDream.snapshot().motionPhase };
    clearInterval(window.__mineradioNiuLaiQaTimer);
    window.__mineradioNiuLaiQaTimer = 0;
    MineradioNiuLaiDream._test.setTimeForQa(22);
    return { before, after };
  })()`);
  await call('Emulation.clearDeviceMetricsOverride');
  socket.close();

  captures.forEach(capture => {
    assert.strictEqual(capture.selectedPreset, 10, `${capture.name} did not select Niu Lai Dream`);
    assert.strictEqual(capture.homeCovered, false, `${capture.name} stayed behind the Home surface`);
    assert(capture.snapshot && capture.snapshot.active, `${capture.name} dream runtime stayed inactive`);
    assert.strictEqual(capture.snapshot.chapter, capture.chapter, `${capture.name} did not render the expected chapter`);
    assert.strictEqual(capture.snapshot.cow3D, true, `${capture.name} calf is not a 3D mesh`);
    assert.strictEqual(capture.snapshot.capeVisible, true, `${capture.name} lost the red cape`);
    assert.strictEqual(capture.snapshot.larkVisible, true, `${capture.name} lost the lark`);
    assert(capture.snapshot.meshCount > 20 && capture.snapshot.meshCount < 80, `${capture.name} scene mesh pool is empty or unbounded`);
    assert.strictEqual(capture.snapshot.particleCount, 144, `${capture.name} dream particle pool changed`);
    assert.strictEqual(capture.snapshot.mountainInstances, 14, `${capture.name} mountain instance pool changed`);
    assert.strictEqual(capture.snapshot.grassInstances, 56, `${capture.name} grass instance pool changed`);
    assert.strictEqual(capture.snapshot.rippleCount, 8, `${capture.name} lost an audio-band ground echo`);
    assert(capture.pixelSpan > 45, `${capture.name} WebGL canvas has insufficient contrast`);
    assert(capture.nonBlack > 2400, `${capture.name} WebGL canvas is effectively blank`);
    assert(capture.average > 10, `${capture.name} WebGL canvas stayed too dark`);
    assert(capture.cowProjection && Math.abs(capture.cowProjection.x) < 0.52 && capture.cowProjection.y > -0.72 && capture.cowProjection.y < 0.55, `${capture.name} calf left the safe frame`);
    assert(capture.larkProjection && Math.abs(capture.larkProjection.x) < 0.55 && capture.larkProjection.y > -0.72 && capture.larkProjection.y < 0.60, `${capture.name} lark left the safe frame`);
    assert(/Cyberforker/.test(capture.authorText), `${capture.name} preset card lost the author credit`);
    assert.strictEqual(capture.shelfParentVisible, false, `${capture.name} playlist shelf covered the dream scene`);
  });
  const motionDelta = Math.abs(motion.after.cape - motion.before.cape) + Math.abs(motion.after.larkX - motion.before.larkX) + Math.abs(motion.after.phase - motion.before.phase);
  assert(motionDelta > 0.015, 'cape, lark, and calf stayed visually static under music input');
  assert.strictEqual(presetCard.active, true, 'Niu Lai preset card did not show its selected state');
  assert(/Cyberforker/.test(presetCard.text), 'Niu Lai preset card did not show the Cyberforker credit');
  assert.strictEqual(presetCard.nameFits, true, 'Niu Lai preset card name overflowed its container');
  assert.strictEqual(presetCard.descFits, true, 'Niu Lai preset card author overflowed its container');
  console.log(JSON.stringify({ ok: true, captures, presetCard: { ...presetCard, screenshotPath: presetCardScreenshotPath }, motion, motionDelta }, null, 2));
}

main().catch(error => {
  console.error(error && error.stack || error);
  process.exit(1);
});
