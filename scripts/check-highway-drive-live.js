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
    while (performance.now() < deadline && !(window.MineradioHighwayDrive && typeof setPreset === 'function' && window.renderer && window.scene && window.camera)) {
      await new Promise(resolve => setTimeout(resolve, 80));
    }
    if (!(window.MineradioHighwayDrive && typeof setPreset === 'function')) throw new Error('HIGHWAY_RUNTIME_NOT_READY');
    const splash = document.getElementById('splash');
    if (splash && document.body.classList.contains('splash-active')) {
      if (typeof dismissSplash !== 'function') throw new Error('SPLASH_DISMISS_NOT_READY');
      dismissSplash({ instant: true });
      await new Promise(resolve => setTimeout(resolve, 120));
    }
    if (document.body.classList.contains('splash-active')) throw new Error('SPLASH_STATE_STAYED_ACTIVE');
    window.__mineradioHighwayQaHomeWasActive = document.body.classList.contains('empty-home-active');
    if (window.__mineradioHighwayQaHomeWasActive && typeof dismissHomePage === 'function') dismissHomePage({});
    document.querySelectorAll('.modal-mask,.visual-guide').forEach(node => {
      if (node && node.style) node.style.display = 'none';
      if (node && node.classList) node.classList.remove('open','show');
    });
    setPreset(9, { noSave: true, silent: true, preserveCamera: true });
    clearInterval(window.__mineradioHighwayQaTimer);
    window.__mineradioHighwayQaTimer = setInterval(() => {
      const t = performance.now() / 1000;
      const hit = Math.sin(t * Math.PI * 2.35) > 0.91 ? 1 : 0;
      MineradioHighwayDrive.update(1 / 60, {
        scene,
        camera,
        fx,
        audio: {
          sonicDetailed: true,
          subBass: 0.52 + hit * 0.44,
          bass: 0.46 + hit * 0.46,
          lowMid: 0.38 + Math.sin(t * 2.1) * 0.14,
          mid: 0.34 + Math.sin(t * 2.8 + 1) * 0.12,
          highMid: 0.30 + Math.sin(t * 3.3 + 2) * 0.10,
          presence: 0.26 + Math.sin(t * 4.1 + 3) * 0.09,
          brilliance: 0.24 + Math.sin(t * 5.2 + 4) * 0.08,
          air: 0.22 + Math.sin(t * 6.4 + 5) * 0.07,
          energy: 0.58 + hit * 0.32,
          kickEnvelope: hit,
          triggerPulse: hit
        }
      });
    }, 16);
    await new Promise(resolve => setTimeout(resolve, 1300));
    return true;
  })()`);

  const captures = [];
  for (const viewport of [
    { name: 'wide', width: 1440, height: 900, journey: 0, biome: 'mountains', weather: 'snow', landmark: 'Eiffel Tower', minSkyAverage: 18 },
    { name: 'compact', width: 820, height: 720, journey: 1770, biome: 'beach', weather: 'clear-day', landmark: 'Sydney Opera House', minSkyAverage: 18 },
    { name: 'rain', width: 1100, height: 700, journey: 420, biome: 'river', weather: 'rain', landmark: 'Taj Mahal', minSkyAverage: 12 },
    { name: 'golden', width: 1100, height: 700, journey: 1260, biome: 'desert', weather: 'golden-hour', landmark: '', minSkyAverage: 16 },
    { name: 'stars', width: 1100, height: 700, journey: 2100, biome: 'grassland', weather: 'starry-night', celestial: 'saturn', landmark: 'Oriental Pearl Tower', minSkyAverage: 4 },
    { name: 'aurora', width: 1100, height: 700, journey: 2520, biome: 'mountains', weather: 'aurora', celestial: 'venus', landmark: 'Big Ben', minSkyAverage: 5 },
  ]) {
    await call('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await evaluate(`MineradioHighwayDrive._test.setJourneyForQa(${viewport.journey}, 0)`);
    await new Promise(resolve => setTimeout(resolve, 260));
    const metrics = await evaluate(`(() => {
      const source = renderer && renderer.domElement;
      renderer.render(scene, camera);
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
      let skyTotal = 0;
      let skyPixels = 0;
      for (let index = 0; index < data.length; index += 4) {
        const value = Math.round(data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722);
        minimum = Math.min(minimum, value);
        maximum = Math.max(maximum, value);
        total += value;
        if (value > 4 && data[index + 3] > 16) nonBlack += 1;
        const pixel = index / 4;
        if (Math.floor(pixel / sample.width) < sample.height * 0.46) {
          skyTotal += value;
          skyPixels += 1;
        }
      }
      return {
        canvasWidth: source.width,
        canvasHeight: source.height,
        cssWidth: innerWidth,
        cssHeight: innerHeight,
        pixelSpan: maximum - minimum,
        nonBlack,
        average: total / (data.length / 4),
        skyAverage: skyTotal / Math.max(1, skyPixels),
        snapshot: MineradioHighwayDrive.snapshot(),
        selectedPreset: fx.preset,
        splashCovered: typeof isMainSceneCoveredBySplash === 'function' && isMainSceneCoveredBySplash(),
        shelfParentVisible: !!(shelfManager && shelfManager.getCards && shelfManager.getCards().some(card => (
          card.mesh && card.mesh.parent && card.mesh.parent.visible
        ))),
      };
    })()`);
    const screenshot = await call('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const screenshotPath = path.join(outputDir, `highway-drive-${viewport.name}.png`);
    fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
    captures.push({ ...viewport, ...metrics, screenshotPath });
  }

  const celestialCaptures = [];
  await call('Emulation.setDeviceMetricsOverride', {
    width: 1100,
    height: 700,
    deviceScaleFactor: 1,
    mobile: false,
  });
  for (const entry of [
    { zone: 5, expected: 'saturn' },
    { zone: 6, expected: 'venus' },
    { zone: 11, expected: 'moon' },
    { zone: 17, expected: 'jupiter' },
    { zone: 18, expected: 'neptune' },
    { zone: 23, expected: 'mercury' },
    { zone: 29, expected: 'mars' },
  ]) {
    await evaluate(`MineradioHighwayDrive._test.setJourneyForQa(${entry.zone} * MineradioHighwayDrive._test.constants.biomeZoneLength, 0)`);
    await new Promise(resolve => setTimeout(resolve, 180));
    const snapshot = await evaluate(`(() => { renderer.render(scene, camera); return MineradioHighwayDrive.snapshot(); })()`);
    const screenshot = await call('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const screenshotPath = path.join(outputDir, `highway-drive-celestial-${entry.expected}.png`);
    fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
    celestialCaptures.push({ ...entry, snapshot, screenshotPath });
  }

  await call('Emulation.clearDeviceMetricsOverride');
  const transitionCheck = await evaluate(`(async () => {
    clearInterval(window.__mineradioHighwayQaTimer);
    window.__mineradioHighwayQaTimer = 0;
    const waitForRenderTurn = () => new Promise(resolve => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      setTimeout(finish, 180);
      requestAnimationFrame(() => requestAnimationFrame(finish));
    });
    const qaAudio = {
      sonicDetailed: true,
      subBass: 0.52,
      bass: 0.46,
      lowMid: 0.38,
      mid: 0.34,
      highMid: 0.30,
      presence: 0.26,
      brilliance: 0.24,
      air: 0.22,
      energy: 0.58,
      kickEnvelope: 0.4,
      triggerPulse: 0.2,
    };
    const biomeSeries = [];
    MineradioHighwayDrive._test.constants.biomeNames.forEach((name, index) => {
      MineradioHighwayDrive._test.setJourneyForQa(index * MineradioHighwayDrive._test.constants.biomeZoneLength, 0);
      MineradioHighwayDrive.update(1 / 60, { scene, camera, fx, audio: qaAudio });
      const item = MineradioHighwayDrive.snapshot();
      biomeSeries.push({ expected: name, actual: item.biome, sceneryInstances: item.sceneryInstances });
    });
    const alignedTransitionJourney = MineradioHighwayDrive._test.constants.biomeZoneLength
      * (1 + MineradioHighwayDrive._test.constants.weatherTransitionStart + 0.12);
    MineradioHighwayDrive._test.setJourneyForQa(alignedTransitionJourney, 0);
    MineradioHighwayDrive.update(1 / 60, { scene, camera, fx, audio: qaAudio });
    const alignedTransition = MineradioHighwayDrive.snapshot();
    const weatherSeries = [
      { journey: 0, expected: 'snow' },
      { journey: 420, expected: 'rain' },
      { journey: 840, expected: 'clear-day' },
      { journey: 1260, expected: 'golden-hour' },
      { journey: 2100, expected: 'starry-night', celestial: 'saturn' },
      { journey: 2520, expected: 'aurora', celestial: 'venus' },
    ].map(entry => {
      MineradioHighwayDrive._test.setJourneyForQa(entry.journey, 0);
      MineradioHighwayDrive.update(1 / 60, { scene, camera, fx, audio: qaAudio });
      const item = MineradioHighwayDrive.snapshot();
      renderer.render(scene, camera);
      return {
        expected: entry.expected,
        actual: item.weather,
        expectedCelestial: entry.celestial || '',
        actualCelestial: item.celestial,
        rainAmount: item.rainAmount,
        snowAmount: item.snowAmount,
        precipitationCount: item.precipitationCount,
      };
    });
    const celestialSeries = [
      { zone: 5, expected: 'saturn' },
      { zone: 6, expected: 'venus' },
      { zone: 11, expected: 'moon' },
      { zone: 17, expected: 'jupiter' },
      { zone: 18, expected: 'neptune' },
      { zone: 23, expected: 'mercury' },
      { zone: 29, expected: 'mars' },
    ].map(entry => {
      MineradioHighwayDrive._test.setJourneyForQa(entry.zone * MineradioHighwayDrive._test.constants.biomeZoneLength, 0);
      MineradioHighwayDrive.update(1 / 60, { scene, camera, fx, audio: qaAudio });
      renderer.render(scene, camera);
      const item = MineradioHighwayDrive.snapshot();
      return {
        expected: entry.expected,
        actual: item.celestial,
        celestial3D: item.celestial3D,
        celestialMeshCount: item.celestialMeshCount,
        celestialTexturesReady: item.celestialTexturesReady,
        celestialSide: item.celestialSide,
        celestialPosition: item.celestialPosition,
        celestialAxialTilt: item.celestialAxialTilt,
        celestialAxisAzimuth: item.celestialAxisAzimuth,
        celestialAxis: item.celestialAxis,
      };
    });
    const landmarkSeries = [];
    MineradioHighwayDrive._test.constants.landmarkNames.forEach((name, index) => {
      MineradioHighwayDrive._test.setJourneyForQa(index * MineradioHighwayDrive._test.constants.landmarkSpacing, 0);
      MineradioHighwayDrive.update(1 / 60, { scene, camera, fx, audio: qaAudio });
      landmarkSeries.push({ expected: name, actual: MineradioHighwayDrive.snapshot().visibleLandmark });
    });
    setPreset(4, { noSave: true, silent: true, preserveCamera: true });
    await waitForRenderTurn();
    const basePresetRestored = fx.preset === 4 && particles && particles.visible;
    setPreset(9, { noSave: true, silent: true, preserveCamera: true });
    await waitForRenderTurn();
    if (window.__mineradioHighwayQaHomeWasActive && typeof updateEmptyHomeVisibility === 'function') {
      homeSuppressed = false;
      homeForcedOpen = true;
      updateEmptyHomeVisibility({ forceLoad: false });
    }
    return {
      basePresetRestored,
      splashActive: document.body.classList.contains('splash-active'),
      highway: MineradioHighwayDrive.snapshot(),
      biomeSeries,
      weatherSeries,
      celestialSeries,
      landmarkSeries,
      alignedTransition,
    };
  })()`);
  socket.close();

  captures.forEach(capture => {
    assert.strictEqual(capture.selectedPreset, 9, `${capture.name} did not select Highway Drive`);
    assert(capture.snapshot && capture.snapshot.active, `${capture.name} highway runtime stayed inactive`);
    assert(capture.snapshot.roadVertices > 1500, `${capture.name} road mesh was not initialized`);
    assert.strictEqual(capture.snapshot.roadWaveVertices, capture.snapshot.roadVertices, `${capture.name} road-wave spectrum attribute does not cover the road mesh`);
    assert.strictEqual(capture.snapshot.roadTrackVertices, capture.snapshot.roadVertices, `${capture.name} automatic chart attribute does not cover the road mesh`);
    assert(capture.snapshot.spectrumHistorySamples > 8, `${capture.name} did not accumulate a moving spectrum history`);
    assert(capture.snapshot.spectrumWavePeak > 0.05, `${capture.name} did not render a detected spectrum crest on the road`);
    assert(capture.snapshot.trackNotePeak > 0.05, `${capture.name} did not render an independent four-lane tap note`);
    assert(capture.snapshot.spectrumEventLanePeak > 0, `${capture.name} did not emit a rhythm-lane event`);
    assert(capture.snapshot.spectrumEventLanePeak <= 2, `${capture.name} turned one beat into more than a two-note chord`);
    assert(capture.snapshot.trackEventCount > 3, `${capture.name} automatic tap chart remained too sparse after the opening beat`);
    assert(capture.snapshot.trackVisitedLanes > 1, `${capture.name} kept automatic tap notes in one highway lane`);
    assert(capture.snapshot.spectrumTravelPhase >= 0 && capture.snapshot.spectrumTravelPhase <= 1, `${capture.name} road-wave interpolation phase left its bounded approach window`);
    assert.strictEqual(capture.snapshot.biome, capture.biome, `${capture.name} did not render the expected natural environment`);
    assert.strictEqual(capture.snapshot.weather, capture.weather, `${capture.name} did not render the expected sky weather`);
    if (capture.celestial) assert.strictEqual(capture.snapshot.celestial, capture.celestial, `${capture.name} did not render the expected celestial body`);
    if (capture.celestial) assert.strictEqual(capture.snapshot.celestial3D, true, `${capture.name} celestial body is not a 3D sphere`);
    if (capture.celestial) assert.strictEqual(capture.snapshot.celestialMeshCount, 2, `${capture.name} celestial geometry pool is incomplete or unbounded`);
    if (capture.celestial) assert.strictEqual(capture.snapshot.celestialTexturesReady, 8, `${capture.name} celestial textures did not finish loading`);
    assert(capture.snapshot.precipitationCount > 0 && capture.snapshot.precipitationCount <= 512, `${capture.name} weather particle pool is missing or unbounded`);
    assert.strictEqual(capture.snapshot.visibleLandmark, capture.landmark, `${capture.name} did not place the expected landmark beside the road`);
    assert(capture.snapshot.sceneryInstances > 8, `${capture.name} natural scenery pool stayed empty`);
    assert(capture.snapshot.speed > 16, `${capture.name} beat-linked road speed did not rise`);
    assert(Math.abs(capture.snapshot.roll) <= 0.0121, `${capture.name} camera banking exceeded the comfort cap`);
    assert(capture.pixelSpan > 18, `${capture.name} WebGL canvas has insufficient contrast`);
    assert(capture.nonBlack > 240, `${capture.name} WebGL canvas is effectively blank`);
    assert(capture.skyAverage > capture.minSkyAverage, `${capture.name} sky stayed effectively black`);
    assert.strictEqual(capture.splashCovered, false, `${capture.name} stayed trapped behind the startup render gate`);
    assert.strictEqual(capture.shelfParentVisible, false, `${capture.name} playlist shelf obscures the road vanishing point`);
  });
  assert(
    new Set(captures.map(capture => Math.round(capture.snapshot.spectrumTravelPhase * 10))).size > 1,
    'rhythm-lane events did not move continuously between road depth rows'
  );
  assert(captures.some(capture => capture.snapshot.trackVisitedLanes === 4), 'automatic tap notes did not visit all four highway lanes');
  celestialCaptures.forEach(capture => {
    assert.strictEqual(capture.snapshot.celestial, capture.expected, `celestial screenshot did not activate ${capture.expected}`);
    assert.strictEqual(capture.snapshot.celestial3D, true, `celestial screenshot ${capture.expected} is not a 3D sphere`);
    assert.strictEqual(capture.snapshot.celestialMeshCount, 2, `celestial screenshot ${capture.expected} changed the bounded geometry pool`);
    assert.strictEqual(capture.snapshot.celestialTexturesReady, 8, `celestial screenshot ${capture.expected} is missing packaged textures`);
    assert(['left', 'right'].includes(capture.snapshot.celestialSide), `celestial screenshot ${capture.expected} has no lateral placement`);
    assert(Math.abs(capture.snapshot.celestialPosition.x) >= 17.5 && Math.abs(capture.snapshot.celestialPosition.x) <= 21, `celestial screenshot ${capture.expected} left the safe horizontal sky band`);
    assert(capture.snapshot.celestialAxialTilt >= 0.025 && capture.snapshot.celestialAxialTilt <= 0.62, `celestial screenshot ${capture.expected} has an implausible axial tilt`);
    assert(capture.snapshot.celestialAxis && Math.abs(Math.hypot(capture.snapshot.celestialAxis.x, capture.snapshot.celestialAxis.z) - capture.snapshot.celestialAxialTilt) < 1e-6, `celestial screenshot ${capture.expected} lost its shared spin axis`);
  });
  assert.strictEqual(new Set(celestialCaptures.map(capture => capture.snapshot.celestialSide)).size, 2, 'celestial screenshots did not cover both sides of the highway');
  assert(new Set(celestialCaptures.map(capture => capture.snapshot.celestialAxisAzimuth.toFixed(2))).size >= 5, 'celestial screenshots did not vary their spin-axis direction');
  assert.strictEqual(transitionCheck.basePresetRestored, true, 'leaving Highway Drive did not restore the base visual layers');
  assert.strictEqual(transitionCheck.splashActive, false, 'live QA left the startup render gate active');
  assert(transitionCheck.highway && transitionCheck.highway.active, 'live QA did not return to Highway Drive');
  transitionCheck.biomeSeries.forEach(item => {
    assert.strictEqual(item.actual, item.expected, `natural environment ${item.expected} did not activate`);
    assert(item.sceneryInstances > 8, `natural environment ${item.expected} did not populate its scenery pool`);
  });
  assert(transitionCheck.alignedTransition.biomeBlend > 0 && transitionCheck.alignedTransition.biomeBlend < 1, 'roadside biome transition did not crossfade');
  assert.strictEqual(transitionCheck.alignedTransition.biomeBlend, transitionCheck.alignedTransition.weatherBlend, 'roadside biome transition drifted out of sync with the sky');
  transitionCheck.weatherSeries.forEach(item => {
    assert.strictEqual(item.actual, item.expected, `sky weather ${item.expected} did not activate`);
    assert(item.precipitationCount > 0 && item.precipitationCount <= 512, `sky weather ${item.expected} lost its bounded precipitation pool`);
    if (item.expected === 'rain') assert(item.rainAmount > 0.9, 'rain weather did not activate rainfall');
    if (item.expected === 'snow') assert(item.snowAmount > 0.9, 'snow weather did not activate snowfall');
    if (item.expectedCelestial) assert.strictEqual(item.actualCelestial, item.expectedCelestial, `night sky ${item.expected} did not activate ${item.expectedCelestial}`);
  });
  transitionCheck.celestialSeries.forEach(item => {
    assert.strictEqual(item.actual, item.expected, `night journey did not activate textured 3D body ${item.expected}`);
    assert.strictEqual(item.celestial3D, true, `night journey ${item.expected} did not use SphereGeometry`);
    assert.strictEqual(item.celestialMeshCount, 2, `night journey ${item.expected} changed the bounded celestial geometry pool`);
    assert.strictEqual(item.celestialTexturesReady, 8, `night journey ${item.expected} did not load every packaged texture`);
    assert(['left', 'right'].includes(item.celestialSide), `night journey ${item.expected} has no lateral placement`);
    assert(item.celestialPosition && Math.abs(item.celestialPosition.x) >= 17.5 && Math.abs(item.celestialPosition.x) <= 21, `night journey ${item.expected} left the safe horizontal sky band`);
    assert(item.celestialAxialTilt >= 0.025 && item.celestialAxialTilt <= 0.62, `night journey ${item.expected} has an implausible axial tilt`);
    assert(item.celestialAxis && Math.abs(Math.hypot(item.celestialAxis.x, item.celestialAxis.z) - item.celestialAxialTilt) < 1e-6, `night journey ${item.expected} lost its shared spin axis`);
  });
  assert.strictEqual(new Set(transitionCheck.celestialSeries.map(item => item.celestialSide)).size, 2, 'night journey did not distribute celestial bodies across both sides');
  assert(new Set(transitionCheck.celestialSeries.map(item => item.celestialAxisAzimuth.toFixed(2))).size >= 5, 'night journey did not vary planet spin-axis directions');
  transitionCheck.landmarkSeries.forEach(item => {
    assert.strictEqual(item.actual, item.expected, `roadside landmark ${item.expected} did not activate`);
  });
  console.log(JSON.stringify({ ok: true, captures, celestialCaptures }, null, 2));
}

main().catch(error => {
  console.error(error && error.stack || error);
  process.exit(1);
});
