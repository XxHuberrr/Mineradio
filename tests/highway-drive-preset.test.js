'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const source = read('public', 'highway-drive-preset.js');
const loader = read('public', 'js', 'index-loader.js');
const core = read('public', 'js', 'modules', '00-state', '00-core-stores.js');
const presets = read('public', 'js', 'modules', '07-fx', '00-preset-archive-data.js');
const presetGrid = read('public', 'js', 'modules', '07-fx', '04-preset-grid-uniforms.js');
const mainLoop = read('public', 'js', 'modules', '11-main-loop.js');
const shelfManager = read('public', 'js', 'modules', '04-shelf', '01-manager-core.js');
const liveQa = read('scripts', 'check-highway-drive-live.js');
const planetAssetDir = path.join(root, 'public', 'assets', 'highway-planets');
const planetAssetNames = ['moon.jpg', 'mars.jpg', 'jupiter.jpg', 'saturn.jpg', 'saturn-ring.png', 'neptune.jpg', 'venus.jpg', 'mercury.jpg'];

const context = { window: {} };
vm.runInNewContext(source, context, { filename: 'highway-drive-preset.js' });
const runtime = context.window.MineradioHighwayDrive;
assert(runtime, 'highway runtime must register globally');
assert.strictEqual(runtime.INDEX, 9, 'highway must occupy preset index 9');

const api = runtime._test;
assert.strictEqual(api.constants.bandCount, 8, 'road surface must expose all eight sonic bands');
assert.strictEqual(api.constants.spectrumSampleCount, api.constants.segmentCount + 1, 'road spectrum history must cover every depth row without an unbounded buffer');
assert(api.constants.segmentCount <= 128, 'road mesh must remain bounded');
assert((api.constants.segmentCount + 1) * api.constants.columnCount <= 2200, 'road vertex budget must remain bounded');
assert(api.constants.lightPairCount <= 32, 'roadside light instance budget must remain bounded');
assert(api.constants.maxCameraRoll <= 0.015, 'camera banking must stay below a motion-comfort limit');
assert(api.constants.cameraRollResponse <= 1.5, 'camera banking must ease in instead of snapping to each curve');
assert(api.constants.sceneryInstanceCount <= 32, 'each natural scenery pool must remain bounded');
assert.strictEqual(api.constants.biomeNames.length, 6, 'the road must cross six natural environment families');
assert.deepStrictEqual(
  Array.from(api.constants.biomeNames),
  ['mountains', 'river', 'hills', 'desert', 'beach', 'grassland'],
  'natural environments must cover mountains, rivers, hills, desert, beach, and grassland'
);
assert.deepStrictEqual(
  Array.from(api.constants.weatherNames),
  ['clear-day', 'golden-hour', 'rain', 'snow', 'starry-night', 'aurora'],
  'the sky cycle must cover daylight, golden hour, rain, snow, stars, and aurora'
);
assert.deepStrictEqual(
  Array.from(api.constants.celestialNames),
  ['moon', 'mars', 'jupiter', 'saturn', 'neptune', 'venus', 'mercury'],
  'night skies must rotate through seven recognizable celestial bodies'
);
assert(api.constants.precipitationCount <= 512, 'rain and snow must share one bounded particle pool');
assert(api.constants.landmarkNames.length >= 8 && api.constants.landmarkNames.length <= 10, 'the roadside landmark series must be varied and bounded');
assert(api.constants.landmarkNames.includes('Eiffel Tower') && api.constants.landmarkNames.includes('Taj Mahal'), 'globally recognizable landmarks must be present');
assert.strictEqual(api.constants.trackLaneCount, 4, 'tap blocks must align with the four visible highway lanes');
assert.strictEqual(api.constants.trackMinEventGap, 0.12, 'the observational chart must use the hard-mode minimum note gap');
assert.strictEqual(api.constants.trackOnsetThreshold, 0.15, 'the observational chart must retain hard-mode onset sensitivity');
assert.deepStrictEqual(
  Array.from(api.constants.trackLaneBands, bands => Array.from(bands)),
  [[0, 4], [2, 6], [3, 7], [1, 5]],
  'eight frequency bands must feed four spatially distributed tap lanes'
);
assert.strictEqual(api.roadTrackLaneForBand(0), 0, 'sub-bass must reach the outer-left tap lane');
assert.strictEqual(api.roadTrackLaneForBand(1), 3, 'bass must reach the outer-right tap lane');
assert.strictEqual(api.roadTrackLaneForBand(2), 1, 'low-mid energy must occupy an inner tap lane');
assert.strictEqual(api.roadTrackLaneForBand(3), 2, 'mid energy must occupy the opposite inner tap lane');
assert(api.roadTrackLaneCenter(0) < -0.6 && api.roadTrackLaneCenter(3) > 0.6, 'outer tap lanes must span most of the road width');
assert.strictEqual(api.roadTrackLaneForSide(-0.67), 0, 'the left road lane must resolve to the first tap lane');
assert.strictEqual(api.roadTrackLaneForSide(0.67), 3, 'the right road lane must resolve to the fourth tap lane');
assert.strictEqual(api.roadBandForSide(0), 0, 'the original road response must keep low frequencies near the center');
assert.strictEqual(api.roadBandForSide(1), 7, 'the original road response must keep high frequencies near both edges');
assert.strictEqual(api.spectrumHistorySlotForRow(api.constants.segmentCount, 27), 27, 'the latest spectrum sample must enter at the road horizon');
assert.strictEqual(api.spectrumHistorySlotForRow(api.constants.segmentCount - 1, 27), 26, 'older spectrum samples must advance toward the camera');
assert(
  api.spectrumPulseForBand(0.82, 0.18, 6, 0, 0) > 0.95,
  'a sudden high-frequency onset must create a visible road-wave crest'
);
assert(
  api.spectrumPulseForBand(0.30, 0.30, 0, 0.9, 0.6) > api.spectrumPulseForBand(0.30, 0.30, 7, 0.9, 0.6),
  'kick pulses must weight the center low-frequency lanes more strongly than the outer air band'
);
const isolatedOnset = api.rhythmTrackEventFrame(
  [0.22, 0.24, 0.25, 0.28, 0.30, 0.31, 0.92, 0.24],
  [0.22, 0.24, 0.25, 0.28, 0.30, 0.31, 0.12, 0.24],
  [0, 0, 0, 0],
  0.8,
  0.9,
  0,
  -1
);
assert.strictEqual(isolatedOnset.eventLanes.length, 1, 'a normal beat must create one tap note rather than fill the row');
assert.strictEqual(isolatedOnset.pulses.filter(value => value > 0.68).length, 1, 'one tap event must have exactly one bright note head');

let chartEventIndex = 0;
let chartLastLane = -1;
const visitedTapLanes = new Set();
for (let event = 0; event < 8; event += 1) {
  const frame = api.rhythmTrackEventFrame(
    [0.34, 0.32, 0.30, 0.28, 0.26, 0.24, 0.22, 0.20],
    [0.34, 0.32, 0.30, 0.28, 0.26, 0.24, 0.22, 0.20],
    [0, 0, 0, 0],
    1,
    1,
    chartEventIndex,
    chartLastLane
  );
  assert(frame.eventLanes.length >= 1 && frame.eventLanes.length <= api.constants.trackMaxEventLanes, 'an automatic chart event must contain one tap or a bounded two-note chord');
  frame.eventLanes.forEach(lane => visitedTapLanes.add(lane));
  chartEventIndex = frame.nextEventIndex;
  chartLastLane = frame.lastLane;
}
assert.strictEqual(visitedTapLanes.size, 4, 'automatic tap notes must travel across all four highway lanes over time');

const sustainedTrail = api.rhythmTrackEventFrame(
  [0, 0, 0, 0, 0, 0.58, 0, 0],
  [0, 0, 0, 0, 0, 0.58, 0, 0],
  [0, 0, 0, 0.90],
  0,
  0,
  4,
  3
);
assert(sustainedTrail.pulses[3] > 0 && sustainedTrail.pulses[3] < 0.90, 'a sustained lane must leave a decaying hold-style track body behind its note head');
assert.strictEqual(sustainedTrail.eventLanes.length, 0, 'a tail sample must not create another tap without a new beat');

let cueAge = 0;
let cueCooldown = 0;
let previousCueBeat = 0;
let previousCueTrigger = 0;
let previousCueBands = [0, 0, 0, 0, 0, 0, 0, 0];
const steadyCueTimes = [];
for (let frame = 0; frame < 240; frame += 1) {
  const cueAudio = {
    bands: [0.42, 0.39, 0.36, 0.34, 0.31, 0.29, 0.26, 0.24],
    energy: 0.55,
    beat: 0.12,
    trigger: 0.08,
  };
  const cue = api.rhythmChartCueFrame(
    cueAudio,
    previousCueBands,
    previousCueBeat,
    previousCueTrigger,
    cueAge,
    cueCooldown,
    1 / 60,
  );
  cueAge = cue.cueAge;
  cueCooldown = cue.cooldown;
  previousCueBeat = cueAudio.beat;
  previousCueTrigger = cueAudio.trigger;
  previousCueBands = cueAudio.bands.slice();
  if (cue.emitted) steadyCueTimes.push(frame / 60);
}
assert(steadyCueTimes.length >= 7, 'hard-mode fallback must keep generating taps through sustained music instead of stopping after the opening onset');
assert(steadyCueTimes.at(-1) > 3, 'automatic taps must continue into the later part of the sampled song window');
for (let index = 1; index < steadyCueTimes.length; index += 1) {
  assert(steadyCueTimes[index] - steadyCueTimes[index - 1] >= api.constants.trackMinEventGap - 1 / 60, 'dense fallback taps must still respect the hard-mode minimum gap');
}

const seed = 314.159;
const firstRun = [];
const secondRun = [];
let leftTurns = 0;
let rightTurns = 0;
let last = api.roadCenterAt(0, seed);
let maxCurveStep = 0;
let maxCurveAcceleration = 0;
let previous = last;
for (let distance = 0; distance <= 1200; distance += 12) {
  const value = api.roadCenterAt(distance, seed);
  const repeated = api.roadCenterAt(distance, seed);
  assert(Number.isFinite(value), 'road curve must remain finite');
  maxCurveStep = Math.max(maxCurveStep, Math.abs(value - last));
  if (distance >= 24) maxCurveAcceleration = Math.max(maxCurveAcceleration, Math.abs(value - 2 * last + previous));
  if (value > last + 0.08) rightTurns += 1;
  if (value < last - 0.08) leftTurns += 1;
  firstRun.push(value);
  secondRun.push(repeated);
  previous = last;
  last = value;
}
assert.deepStrictEqual(firstRun, secondRun, 'a generated road seed must be deterministic');
assert(leftTurns > 8 && rightTurns > 8, 'the endless road must bend in both directions');
assert(maxCurveStep < 3.2, 'road lateral movement must stay broad and gradual');
assert(maxCurveAcceleration < 1.2, 'road direction changes must not oscillate sharply');

for (let zone = 0; zone < api.constants.biomeNames.length; zone += 1) {
  assert.strictEqual(api.biomeIndexAtDistance(zone * api.constants.biomeZoneLength, 0), zone, 'natural zones must progress deterministically');
}
const biomeTransitionDistance = api.constants.biomeZoneLength * (1 + api.constants.weatherTransitionStart + 0.12);
const transitioningBiome = api.biomeStateAtDistance(biomeTransitionDistance, 0);
assert.strictEqual(transitioningBiome.name, 'river', 'landscape transition must retain the current biome while crossfading');
assert.strictEqual(transitioningBiome.nextName, 'hills', 'landscape transition must prepare the next roadside biome');
assert(transitioningBiome.blend > 0 && transitioningBiome.blend < 1, 'roadside biomes must crossfade near the end of a zone');
const weatherSamples = [
  { zone: 0, name: 'snow' },
  { zone: 1, name: 'rain' },
  { zone: 2, name: 'clear-day' },
  { zone: 3, name: 'golden-hour' },
  { zone: 5, name: 'starry-night' },
  { zone: 6, name: 'aurora' },
];
weatherSamples.forEach(sample => {
  const weather = api.weatherStateAtDistance(sample.zone * api.constants.biomeZoneLength, 0);
  assert.strictEqual(weather.name, sample.name, `weather zone ${sample.zone} must activate ${sample.name}`);
  assert.strictEqual(weather.blend, 0, 'a weather zone must begin without a stale transition blend');
});
const celestialNightZones = [5, 6, 11, 17, 18, 23, 29];
const celestialTour = celestialNightZones.map(zone => api.celestialIndexForZone(zone, 0));
assert.strictEqual(new Set(celestialTour).size, api.constants.celestialNames.length, 'seven night zones must cover every celestial body without random repeats');
const celestialPositions = celestialNightZones.map(zone => api.celestialPositionForZone(zone, 0));
assert.strictEqual(
  new Set(celestialPositions.map(position => position.side)).size,
  2,
  'a deterministic night-sky tour must distribute celestial bodies across both sides'
);
celestialPositions.forEach(position => {
  assert(Math.abs(position.x) >= 17.5 && Math.abs(position.x) <= 21, 'celestial horizontal placement must avoid the vanishing point and compact viewport edges');
  assert(position.y >= 17 && position.y <= 20.5, 'celestial height must remain inside the visible upper sky');
  assert(position.z >= -80 && position.z <= -74, 'celestial depth must preserve a recognizable but unobtrusive silhouette');
});
const repeatedCelestialPosition = api.celestialPositionForZone(11, 0);
assert.deepStrictEqual(
  [repeatedCelestialPosition.x, repeatedCelestialPosition.y, repeatedCelestialPosition.z, repeatedCelestialPosition.side],
  [celestialPositions[2].x, celestialPositions[2].y, celestialPositions[2].z, celestialPositions[2].side],
  'celestial placement must remain stable within the same night zone'
);
const celestialTilts = celestialNightZones.map((zone, index) => api.celestialAxialTiltForZone(zone, celestialTour[index], 0));
celestialTilts.forEach(tilt => {
  assert(tilt.angle >= 0.025 && tilt.angle <= 0.62, 'planet axial tilt must stay within a believable visible range');
  assert(tilt.azimuth >= 0 && tilt.azimuth <= Math.PI * 2, 'planet spin-axis direction must cover a full deterministic rotation');
  assert(Math.abs(Math.hypot(tilt.x, tilt.z) - tilt.angle) < 1e-9, 'planet axial tilt vector must preserve its requested angle');
});
assert(new Set(celestialTilts.map(tilt => tilt.azimuth.toFixed(3))).size >= 5, 'planet spin axes must not all lean in the same screen direction');
const repeatedCelestialTilt = api.celestialAxialTiltForZone(11, celestialTour[2], 0);
assert.deepStrictEqual(
  [repeatedCelestialTilt.angle, repeatedCelestialTilt.azimuth, repeatedCelestialTilt.x, repeatedCelestialTilt.z, repeatedCelestialTilt.spinPhase],
  [celestialTilts[2].angle, celestialTilts[2].azimuth, celestialTilts[2].x, celestialTilts[2].z, celestialTilts[2].spinPhase],
  'planet axial tilt must remain stable throughout the same night zone'
);
assert.notStrictEqual(
  api.celestialAxialTiltForZone(5, 3, 0).azimuth,
  api.celestialAxialTiltForZone(35, 3, 0).azimuth,
  'the same planet must receive a fresh spin-axis direction in a later night region'
);
assert.strictEqual(
  api.constants.celestialNames[api.celestialIndexForZone(5, 0)],
  'saturn',
  'the first deterministic starry-night QA zone must expose a recognizable ringed body'
);
const transitioningWeather = api.weatherStateAtDistance(
  biomeTransitionDistance,
  0,
);
const nextWeather = api.weatherStateAtDistance(api.constants.biomeZoneLength * 2, 0);
assert(transitioningWeather.blend > 0 && transitioningWeather.blend < 1, 'weather must crossfade near the end of a biome');
assert.strictEqual(transitioningBiome.blend, transitioningWeather.blend, 'roadside biome and sky transitions must share the same easing progress');
assert.strictEqual(transitioningWeather.nextName, nextWeather.name, 'weather crossfades must meet the next zone continuously');
for (let landmark = 0; landmark < api.constants.landmarkNames.length; landmark += 1) {
  assert.strictEqual(api.landmarkIndexAtDistance(landmark * api.constants.landmarkSpacing), landmark, 'roadside landmarks must progress deterministically');
}

const sceneryBeforePass = api.recycledWorldPlacement(
  0,
  api.constants.scenerySpacing,
  api.constants.sceneryInstanceCount,
  8,
  13.9,
  api.constants.sceneryPassDistance,
);
const sceneryAfterPass = api.recycledWorldPlacement(
  0,
  api.constants.scenerySpacing,
  api.constants.sceneryInstanceCount,
  8,
  14.1,
  api.constants.sceneryPassDistance,
);
assert(sceneryBeforePass.ahead < 0, 'roadside scenery must remain visible after passing the camera plane');
assert.strictEqual(sceneryBeforePass.worldDistance, 8, 'roadside scenery recycled before it passed the camera');
assert(sceneryAfterPass.worldDistance > sceneryBeforePass.worldDistance, 'roadside scenery must recycle only after the pass distance');
assert(sceneryAfterPass.ahead > api.constants.sceneryPassDistance, 'recycled scenery must return beyond the visible near field');

const landmarkBeforePass = api.recycledWorldPlacement(
  0,
  api.constants.landmarkSpacing,
  api.constants.landmarkNames.length,
  58,
  69.9,
  api.constants.landmarkPassDistance,
);
const landmarkAfterPass = api.recycledWorldPlacement(
  0,
  api.constants.landmarkSpacing,
  api.constants.landmarkNames.length,
  58,
  70.1,
  api.constants.landmarkPassDistance,
);
assert(landmarkBeforePass.ahead < 0, 'landmarks must visibly pass the camera before recycling');
assert.strictEqual(landmarkBeforePass.worldDistance, 58, 'landmark recycled while it was still beside the road');
assert(landmarkAfterPass.worldDistance > landmarkBeforePass.worldDistance, 'landmark must recycle after clearing the camera');

const detailed = api.readAudio({
  sonicDetailed: true,
  subBass: 0.9,
  bass: 0.8,
  lowMid: 0.7,
  mid: 0.6,
  highMid: 0.5,
  presence: 0.4,
  brilliance: 0.3,
  air: 0.2,
  energy: 0.75,
  kickEnvelope: 0.82,
  triggerPulse: 0.94
});
assert.deepStrictEqual(Array.from(detailed.bands), [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2]);
assert(detailed.trigger >= 0.94, 'shared sonic trigger pulse must reach the road runtime');
const idleSpeed = api.targetRoadSpeed({ energy: 0 }, { speed: 1 }, 0, 0, 0);
const beatSpeed = api.targetRoadSpeed({ energy: 0.8 }, { speed: 1 }, 0.85, 0.9, 0.9);
assert(beatSpeed > idleSpeed + 20, 'strong music beats must produce a material speed increase');

assert(loader.includes("'highway-drive-preset.js'"), 'highway runtime must load before the main loop');
assert(/MAX_VISUAL_PRESET_INDEX = 10/.test(core) && /HIGHWAY_PRESET_INDEX = 9/.test(core), 'preset 9 must survive startup and persistence clamps after later presets');
assert(presets.includes("name: '无尽公路'") && /presetDisplayOrder = \[0, 6, 7, 8, 9/.test(presets), 'highway card must be directly visible with the sonic presets');
assert(/MineradioHighwayDrive\.onPresetChange/.test(presetGrid), 'preset changes must notify the highway runtime');
assert(/MineradioHighwayDrive\.update/.test(mainLoop) && /visual\.highway-drive/.test(mainLoop), 'main loop must drive and measure the highway runtime');
assert(/audio: sonicAudioFrame \|\|/.test(mainLoop), 'Highway Drive must receive the shared real-time spectrum frame instead of legacy aggregate energy only');
assert(/!highwayPresetActiveEarly/.test(mainLoop), 'base cover particles must hide behind the highway scene');
assert(/setVisualSuppressed\(highwayPresetActiveEarly \|\| niulaiPresetActiveEarly\)/.test(mainLoop) && /setVisualSuppressed: function/.test(shelfManager), 'highway mode must reveal the vanishing point without changing the persisted shelf mode');
assert(/syncShelfSuppression\(active\)/.test(source), 'the highway runtime must keep the shelf hidden after later scene updates');
assert(/splash\.style\.display !== 'none'/.test(mainLoop), 'a hidden splash must never keep the main scene behind its warm-render gate');
assert(/dismissSplash\(\{ instant: true \}\)/.test(liveQa) && !/splash\.style\.display\s*=/.test(liveQa), 'live QA must dismiss startup through the app lifecycle instead of mutating splash styles');
assert(/basePresetRestored/.test(liveQa), 'live QA must verify that leaving Highway Drive restores ordinary visual layers');
assert(/capture\.snapshot\.celestial/.test(liveQa), 'live QA must verify celestial identity in rendered night skies');
assert(/celestialSeries/.test(liveQa) && /celestial3D/.test(liveQa), 'live QA must inspect every textured 3D celestial body');
assert(/InstancedMesh/.test(source) && /highway-landscape-root/.test(source), 'natural scenery must use bounded instanced geometry beside the road');
assert(/highway-landmark-root/.test(source) && /lateral = 9\.5/.test(source), 'landmarks must stay outside the road lanes');
assert(/highway-dynamic-sky/.test(source) && /new THREE\.Points/.test(source), 'weather must use one procedural sky and one shared precipitation pool');
assert(/syncBiomeTransition\(state\.travel \+ ROAD_LENGTH \* 0\.34\)/.test(source), 'roadside palette and water must use the same gradual zone transition as the sky');
assert(/aBandPulse/.test(source) && /advanceSpectrumHistory\(state\.speed \* dt\)/.test(source), 'road-wave geometry must propagate detected spectrum onsets from the horizon toward the camera');
assert(/aTrackPulse/.test(source) && /trackPulseHistory/.test(source), 'four-lane chart notes must use a separate history and shader attribute without replacing the original road rhythm');
assert(/rhythmTrackEventFrame/.test(source) && /ROAD_TRACK_LANE_SEQUENCE/.test(source), 'road waves must generate an automatic rhythm-game chart instead of a full-width beat flash');
assert(/trackCell=smoothstep\([^;]+laneDist\)/.test(source), 'tap blocks must fill the four visible highway lanes while respecting their actual separators');
assert(/state\.spectrumDistance \/ ROAD_SPECTRUM_STEP/.test(source), 'road track events must interpolate between depth rows for continuous approach motion');
assert(/new THREE\.SphereGeometry\(1, 48, 32\)/.test(source), 'night skies must render a true 3D sphere instead of a shader disc');
assert(/new THREE\.RingGeometry\(1\.26, 2\.16, 96, 2\)/.test(source), 'Saturn must have independent 3D ring geometry');
assert(/new THREE\.TextureLoader\(\)/.test(source) && /assets\/highway-planets\//.test(source), '3D planets must use packaged surface textures without runtime network access');
assert(!/celestialBody\(vec2 uv,float body\)/.test(source), 'the old flat procedural celestial disc must stay removed');
assert(/celestialPositionForZone\(displayZone, state\.seed\)/.test(source), '3D planet placement must update only when its deterministic night zone changes');
assert(/applyCelestialAxialTilt\(displayZone, displayIndex\)/.test(source), '3D planets and Saturn rings must share a stable randomized axial tilt per night zone');
let planetAssetBytes = 0;
planetAssetNames.forEach(name => {
  const assetPath = path.join(planetAssetDir, name);
  assert(fs.existsSync(assetPath), `packaged planet texture is missing: ${name}`);
  planetAssetBytes += fs.statSync(assetPath).size;
});
assert(planetAssetBytes < 1024 * 1024, 'packaged planet textures must stay below a 1 MB runtime budget');
assert(fs.readFileSync(path.join(planetAssetDir, 'LICENSE.txt'), 'utf8').includes('CC BY 4.0'), 'planet texture attribution must ship with the assets');

console.log('[OK] Highway Drive has stable scenery, comfortable curves, six dynamic skies, seven textured 3D celestial bodies, bounded precipitation, landmarks, eight-band response, and beat-linked speed.');
