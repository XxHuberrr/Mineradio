'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const source = read('public', 'niulai-dream-preset.js');
const loader = read('public', 'js', 'index-loader.js');
const core = read('public', 'js', 'modules', '00-state', '00-core-stores.js');
const presets = read('public', 'js', 'modules', '07-fx', '00-preset-archive-data.js');
const presetGrid = read('public', 'js', 'modules', '07-fx', '04-preset-grid-uniforms.js');
const mainLoop = read('public', 'js', 'modules', '11-main-loop.js');
const css = read('public', 'css', 'index.css');
const liveQa = read('scripts', 'check-niulai-dream-live.js');

const context = { window: {} };
vm.runInNewContext(source, context, { filename: 'niulai-dream-preset.js' });
const runtime = context.window.MineradioNiuLaiDream;
assert(runtime, 'Niu Lai Dream runtime must register globally');
assert.strictEqual(runtime.INDEX, 10, 'Niu Lai Dream must occupy preset index 10');

const api = runtime._test;
assert.strictEqual(api.constants.bandCount, 8, 'the dream scene must consume all eight sonic bands');
assert(api.constants.particleCount <= 192, 'dream particle pool must remain bounded');
assert(api.constants.mountainCount <= 20, 'mountain instance pool must remain bounded');
assert(api.constants.grassCount <= 64, 'grass instance pool must remain bounded');
assert.strictEqual(api.constants.rippleCount, 8, 'one ground echo must represent each sonic band');
assert.deepStrictEqual(Array.from(api.constants.chapterNames), ['desert-lullaby', 'grassland-awakening', 'forest-stand', 'ink-dream']);

assert.strictEqual(api.chapterStateAtTime(0).index, 0, 'the journey must open in the desert lullaby');
assert.strictEqual(api.chapterStateAtTime(api.constants.chapterDuration).index, 1, 'the journey must enter the grassland');
assert.strictEqual(api.chapterStateAtTime(api.constants.chapterDuration * 2).index, 2, 'the journey must enter the forest stand');
assert.strictEqual(api.chapterStateAtTime(api.constants.chapterDuration * 3).index, 3, 'the journey must enter the ink dream');
assert(api.chapterStateAtTime(api.constants.chapterDuration * 0.95).blend > 0.8, 'chapter changes must crossfade instead of cutting');

const detailed = api.readAudio({
  sonicDetailed: true,
  subBass: 0.91,
  bass: 0.82,
  lowMid: 0.73,
  mid: 0.64,
  highMid: 0.55,
  presence: 0.46,
  brilliance: 0.37,
  air: 0.28,
  energy: 0.74,
  kickEnvelope: 0.86,
  triggerPulse: 0.93
});
assert.deepStrictEqual(Array.from(detailed.bands), [0.91, 0.82, 0.73, 0.64, 0.55, 0.46, 0.37, 0.28]);
assert(detailed.beat >= 0.93, 'beat input must reach the calf stride and ground echoes');

assert(loader.includes("'niulai-dream-preset.js'"), 'Niu Lai Dream must load before the main loop');
assert(/MAX_VISUAL_PRESET_INDEX = 10/.test(core) && /NIULAI_PRESET_INDEX = 10/.test(core), 'preset 10 must survive persistence clamps');
assert(presets.includes("name: '牛来'") && presets.includes('作者 <span class="pc-author-cyberforker">Cyberforker</span>'), 'the preset card must credit Cyberforker');
assert(/presetDisplayOrder = \[0, 6, 7, 8, 9, 10/.test(presets), 'the Niu Lai card must sit beside Highway Drive');
assert(/\.pc-author-cyberforker[\s\S]{0,90}color:\s*#e55a4f/.test(css), 'the Cyberforker credit must have a distinct visual treatment');
assert(/MineradioNiuLaiDream\.onPresetChange/.test(presetGrid), 'preset switching must notify the dream runtime');
assert(/MineradioNiuLaiDream\.update/.test(mainLoop) && /visual\.niulai-dream/.test(mainLoop), 'the main loop must update and measure the dream runtime');
assert(/!niulaiPresetActiveEarly/.test(mainLoop), 'base cover particles must hide behind the dream scene');
assert(/setVisualSuppressed\(highwayPresetActiveEarly \|\| niulaiPresetActiveEarly\)/.test(mainLoop), 'the dream scene must keep the playlist shelf from covering the characters');

assert(/niulai-low-poly-calf/.test(source) && /new THREE\.SphereGeometry\(1, 10, 7\)/.test(source), 'the calf must be a real low-poly 3D model');
assert(/niulai-red-cape/.test(source) && /createCape/.test(source), 'the calf must retain its animated red cape silhouette');
assert(/niulai-low-poly-lark/.test(source) && /niulai-lark-wing-left/.test(source), 'the dream must include the flying lark');
assert(/niulai-ink-dream-gate/.test(source) && /new THREE\.TorusGeometry/.test(source), 'the scene must include an independent 3D ink-dream gate');
assert(/new THREE\.InstancedMesh/.test(source), 'repeated scenery must use bounded instanced geometry');
assert(/frameOpacity != null && isFinite\(frameOpacity\)/.test(source), 'static model materials must not treat a missing frame opacity as transparent zero');
assert(!/TextureLoader|GLTFLoader|fetch\(|XMLHttpRequest|https?:\/\//.test(source), 'the homage must not copy or request unlicensed film assets at runtime');
assert(/name: 'desert-wide'/.test(liveQa) && /name: 'grassland-compact'/.test(liveQa) && /name: 'forest-wide'/.test(liveQa) && /name: 'ink-wide'/.test(liveQa), 'live QA must capture every dream chapter across desktop and compact layouts');
assert(/pixelSpan/.test(liveQa) && /cowProjection/.test(liveQa) && /motionDelta/.test(liveQa), 'live QA must verify nonblank pixels, safe framing, and actual animation');
assert(/niulai-dream-preset-card\.png/.test(liveQa) && /nameFits/.test(liveQa) && /descFits/.test(liveQa), 'live QA must verify the selected Cyberforker card without text overflow');

console.log('[OK] Niu Lai Dream ships as an original bounded 3D homage with Cyberforker credit, four dream chapters, and eight-band music response.');
