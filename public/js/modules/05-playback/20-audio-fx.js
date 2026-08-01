// ============================================================
//  音效 (Audio FX) —— 10 段图形均衡器 + 专业声场 / 3D 环绕
//  作为「视觉控制台 · 音效」Tab 内的独立内容块（挂在 #fx-panel，
//  由 organizeFxConsoleWorkspace 归入音效页各分组），音频链插入
//  analyser 与 gainNode 之间（见 08-audio-graph-controls.js）。
//
//  视觉风格：深色玻璃卡（深底 + 顶部高光 + 白色细描边），
//  强调色为青色 (#00f5d4) 仅作激活态描边与微辉光，避免满屏高饱和。
//  灵感来自主页 home-tile 卡片（深底 + 白字标题 + 灰副标 + 微高光）。
// ============================================================

// ---- 常量 ----
var AUDIO_FX_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

// 预设：每段增益 dB（±12）。sub 为卡片副标，仿 home-tile「副标」灰字。
// 渲染为 <button>，内部两行：主标题(白/14) + 副标(灰/11)。
var AUDIO_FX_PRESETS = {
  '原声':       { gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],                  sub: 'Flat · 中性基准' },
  '低音':       { gains: [6, 5, 4, 3, 2, 0, 0, 0, 0, 0],                  sub: 'Bass Boost · 低频强化' },
  '人声':       { gains: [-2, -1, 0, 2, 4, 5, 5, 4, 2, 0],                sub: 'Vocal+ · 中频突出' },
  '明亮':       { gains: [0, 0, 0, 0, 0, 0, 0, 1, 2, 3],                  sub: 'Treble+ · 通透高频' },
  '夜间':       { gains: [-3, -2, -1, 0, 0, 0, 0, 0, -1, -2],             sub: 'Night · 压两头保中段' },
  '电影':       { gains: [3, 2, 1, 0, 0, 0, 0, 1, 2, 3],                  sub: 'Cinema · 临场感' },
  '声境 Chill': { gains: [-2, -1, 0, 0, 0, 0, 0, 0, -1, -2],             sub: 'Ambient · 松弛低对比' },
  '声境 Live':  { gains: [2, 1, 1, 0, 0, 0, 0, 1, 1, 2],                  sub: 'Live · 现场两端提' },
  '心动声境':   { gains: [0, 0, 0, 1, 2, 3, 2, 1, 0, 0],                  sub: 'Pulse · 中频泛音' },
  'Lo-fi':      { gains: [3, 2, 1, 0, -1, -1, 0, 1, 2, 3],                sub: 'Lo-fi · 复古暖糊' },
  'Air':        { gains: [-1, 0, 0, 0, 0, 0, 0, 1, 2, 3],                 sub: 'Air · 清瘦高亮' },
  'Focus':      { gains: [-1, -1, 0, 0, 0, 1, 1, 0, -1, -2],              sub: 'Focus · 注意力轮廓' }
};

// 声场：duration(秒) 控制 IR 长度，mix 控制干湿比，sub 卡片副标
var AUDIO_FX_SOUND_FIELDS = {
  '关闭':   { duration: 0,   mix: 0,    decay: 0,  sub: '直通 · 无混响' },
  '录音棚': { duration: 0.9, mix: 0.22, decay: 2.4, sub: 'Studio · 干声短混响' },
  '小房间': { duration: 1.4, mix: 0.34, decay: 2.2, sub: 'Room · 居家临场' },
  '音乐厅': { duration: 2.4, mix: 0.50, decay: 1.8, sub: 'Hall · 古典厅堂' },
  '影院':   { duration: 3.0, mix: 0.62, decay: 1.6, sub: 'Cinema · 影院包围' },
  '教堂':   { duration: 4.2, mix: 0.76, decay: 1.4, sub: 'Cathedral · 长混响' }
};

var AUDIO_FX_STORAGE_KEY = 'mineradio-audio-fx';

// ---- 状态 ----
var audioFxState = {
  enabled: true,
  mix: 0.7,
  preset: '原声',
  bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  advancedGainDb: 0,
  q: 1.3,
  soundField: '关闭',
  surround3d: false,
  surround3dIntensity: 0.6,   // 3D 环绕强度 0~1（混响量 + 旋转深度）
  surround3dSpeed: 0.3        // 3D 环绕速度 0~1（LFO 频率 0.05~1.5Hz）
};

// ---- 音频节点（与 08-audio-graph-controls.js 共享）----
var audioFxNodes = {
  eqBands: [],        // 10 个 BiquadFilterNode（peaking）
  convolver: null,    // ConvolverNode
  wetGain: null,      // GainNode（声场强度）
  dryGain: null,      // GainNode（直通信号）
  effectSum: null,    // GainNode（汇聚 dry + wet）
  advancedGain: null, // GainNode（高级增益 dB）
  fieldBuffer: null,  // 当前声场脉冲响应
  ir3d: null,         // 3D 环绕脉冲响应
  surroundPan: null,  // StereoPannerNode（3D 旋转）
  surroundLfo: null,  // OscillatorNode（驱动自动左右扫动）
  surroundLfoGain: null // GainNode（旋转深度）
};

// ============================================================
//  音频引擎
// ============================================================

function buildAudioFxChain(actx) {
  if (!actx) return;
  disposeAudioFxChain();
  // EQ 级联
  for (var i = 0; i < AUDIO_FX_FREQS.length; i++) {
    var f = actx.createBiquadFilter();
    f.type = 'peaking';
    f.frequency.value = AUDIO_FX_FREQS[i];
    f.Q.value = audioFxState.q;
    f.gain.value = audioFxState.enabled ? audioFxState.bands[i] : 0;
    audioFxNodes.eqBands.push(f);
  }
  for (var j = 0; j < audioFxNodes.eqBands.length - 1; j++) {
    audioFxNodes.eqBands[j].connect(audioFxNodes.eqBands[j + 1]);
  }
  audioFxNodes.convolver = actx.createConvolver();
  audioFxNodes.convolver.normalize = true; // 归一化 IR，保证混响清晰可闻
  audioFxNodes.wetGain = actx.createGain();
  audioFxNodes.dryGain = actx.createGain();
  audioFxNodes.effectSum = actx.createGain();
  audioFxNodes.advancedGain = actx.createGain();
  // 3D 环绕旋转：effectSum → surroundPan → advancedGain
  // surroundPan.pan 由 LFO 正弦驱动自动左右扫动，速度=surround3dSpeed，深度=强度
  audioFxNodes.surroundPan = actx.createStereoPanner();
  audioFxNodes.surroundLfo = actx.createOscillator();
  audioFxNodes.surroundLfo.type = 'sine';
  audioFxNodes.surroundLfoGain = actx.createGain();
  audioFxNodes.surroundLfo.connect(audioFxNodes.surroundLfoGain);
  audioFxNodes.surroundLfoGain.connect(audioFxNodes.surroundPan.pan);
  audioFxNodes.surroundLfo.start();
  // 内部连线：eqTail → dryGain → effectSum
  //           eqTail → convolver → wetGain → effectSum
  //           effectSum → advancedGain （由 initAudio 接往 gainNode/analysisSinkNode）
  var eqTail = audioFxNodes.eqBands[audioFxNodes.eqBands.length - 1];
  eqTail.connect(audioFxNodes.dryGain);
  eqTail.connect(audioFxNodes.convolver);
  audioFxNodes.convolver.connect(audioFxNodes.wetGain);
  audioFxNodes.dryGain.connect(audioFxNodes.effectSum);
  audioFxNodes.wetGain.connect(audioFxNodes.effectSum);
  audioFxNodes.effectSum.connect(audioFxNodes.surroundPan);
  audioFxNodes.surroundPan.connect(audioFxNodes.advancedGain);
  applyAudioFxBandGains();
  applyAudioFxSoundFieldBuffers(actx);
  applyAudioFxMixGains();
  applyAudioFxAdvancedGain();
  applyAudioFxSurroundSpeed();
}

function disposeAudioFxChain() {
  audioFxNodes.eqBands.forEach(function (n) { try { n.disconnect(); } catch (e) {} });
  [audioFxNodes.convolver, audioFxNodes.wetGain, audioFxNodes.dryGain,
   audioFxNodes.effectSum, audioFxNodes.advancedGain,
   audioFxNodes.surroundPan, audioFxNodes.surroundLfoGain].forEach(function (n) {
    if (!n) return;
    try { n.disconnect(); } catch (e) {}
  });
  if (audioFxNodes.surroundLfo) { try { audioFxNodes.surroundLfo.stop(); } catch (e) {} try { audioFxNodes.surroundLfo.disconnect(); } catch (e) {} }
  audioFxNodes.eqBands = [];
  audioFxNodes.convolver = null;
  audioFxNodes.wetGain = null;
  audioFxNodes.dryGain = null;
  audioFxNodes.effectSum = null;
  audioFxNodes.advancedGain = null;
  audioFxNodes.surroundPan = null;
  audioFxNodes.surroundLfo = null;
  audioFxNodes.surroundLfoGain = null;
  audioFxNodes.fieldBuffer = null;
  audioFxNodes.ir3d = null;
}

function applyAudioFxBandGains() {
  for (var i = 0; i < audioFxState.bands.length; i++) {
    if (audioFxNodes.eqBands[i]) {
      audioFxNodes.eqBands[i].gain.value = audioFxState.enabled ? audioFxState.bands[i] : 0;
    }
  }
}

function applyAudioFxQ() {
  audioFxNodes.eqBands.forEach(function (n) { n.Q.value = audioFxState.q; });
}

function applyAudioFxAdvancedGain() {
  if (audioFxNodes.advancedGain) {
    audioFxNodes.advancedGain.gain.value = Math.pow(10, audioFxState.advancedGainDb / 20);
  }
}

// ---- 声场 / 3D 脉冲响应 ----
// 房间化 IR：长尾衰减噪声 + 早期反射簇 + 立体声去相关，配合 convolver.normalize
// 让不同声场有可辨别的空间感（而非单纯音量变化）。
function audioFxBuildFieldBuffer(actx, field) {
  if (!field || field.duration <= 0) return null;
  var dur = Math.max(0.8, field.duration);
  var len = Math.max(1, Math.floor(actx.sampleRate * dur));
  var buf = actx.createBuffer(2, len, actx.sampleRate);
  var sr = actx.sampleRate;
  for (var ch = 0; ch < 2; ch++) {
    var d = buf.getChannelData(ch);
    var seed = ch === 0 ? 12345 : 98765;
    for (var i = 0; i < len; i++) {
      var t = i / len;
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      var rnd = (seed / 0x7fffffff) * 2 - 1;
      d[i] = rnd * Math.pow(1 - t, field.decay);
    }
    // 早期反射簇（增强空间定位感）
    var erCount = 7;
    for (var k = 0; k < erCount; k++) {
      var off = Math.floor((0.004 + k * 0.007 + (ch * 0.0012)) * sr);
      if (off < len) d[off] += (ch === 0 ? 0.55 : -0.55) * (0.6 - k * 0.06) * Math.pow(0.92, k);
    }
  }
  return buf;
}

// 3D 环绕：Haas 延迟（右声道滞后 ~12ms）制造宽度，叠加长尾混响形成环绕感
function audioFxBuild3DBuffer(actx) {
  var duration = 3.0;
  var sr = actx.sampleRate;
  var len = Math.floor(sr * duration);
  var buf = actx.createBuffer(2, len, sr);
  var delay = Math.floor(0.012 * sr);
  for (var ch = 0; ch < 2; ch++) {
    var d = buf.getChannelData(ch);
    var s = ch === 0 ? 1 : 9999;
    for (var i = 0; i < len; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      var rnd = (s / 0x7fffffff) * 2 - 1;
      var t = i / len;
      var v = rnd * Math.pow(1 - t, 2.0);
      var idx = i + (ch === 1 ? delay : 0);
      if (idx < len) d[idx] += v;
    }
  }
  return buf;
}

function applyAudioFxSoundFieldBuffers(actx) {
  var field = AUDIO_FX_SOUND_FIELDS[audioFxState.soundField] || AUDIO_FX_SOUND_FIELDS['关闭'];
  audioFxNodes.fieldBuffer = audioFxBuildFieldBuffer(actx, field);
  audioFxNodes.ir3d = audioFxBuild3DBuffer(actx);
  audioFxAssignIR();
}

function audioFxAssignIR() {
  if (!audioFxNodes.convolver) return;
  audioFxNodes.convolver.buffer = audioFxState.surround3d ? audioFxNodes.ir3d : audioFxNodes.fieldBuffer;
}

// 干湿比 + 3D 旋转深度（不重建 IR）。
// 关键：3D 环绕 = 纯声像旋转，不加任何混响（避免教堂式长尾混响）；
// 混响只来自「声场」且 3D 关闭时。旋转与「音效」主开关无关，仅由 3D 开关 + 强度控制。
function applyAudioFxField() {
  var field = AUDIO_FX_SOUND_FIELDS[audioFxState.soundField] || AUDIO_FX_SOUND_FIELDS['关闭'];
  var wet = 0;
  // 混响：仅当「音效」启用且未开 3D 时，由所选声场产生
  if (audioFxState.enabled && !audioFxState.surround3d) {
    wet = (field.mix || 0) * (0.65 + 0.35 * audioFxState.mix);
  }
  if (wet > 0.85) wet = 0.85;
  if (audioFxNodes.wetGain) audioFxNodes.wetGain.gain.value = wet;
  if (audioFxNodes.dryGain) audioFxNodes.dryGain.gain.value = 1 - wet * 0.4;
  // 3D 旋转深度由「强度」控制；开 3D 即旋转，关 3D 即静止。不受主开关影响。
  if (audioFxNodes.surroundLfoGain) {
    audioFxNodes.surroundLfoGain.gain.value = audioFxState.surround3d
      ? (0.2 + 0.78 * audioFxState.surround3dIntensity)
      : 0;
  }
}

// 环绕速度：LFO 频率 0.05~1.5Hz（值越大转得越快）
function applyAudioFxSurroundSpeed() {
  if (audioFxNodes.surroundLfo) {
    audioFxNodes.surroundLfo.frequency.value = 0.05 + audioFxState.surround3dSpeed * 1.45;
  }
}

function applyAudioFxMixGains() {
  if (audioFxNodes.dryGain) audioFxNodes.dryGain.gain.value = 1;
  applyAudioFxField();
}

function applyAudioFxEnabled() {
  applyAudioFxBandGains();
  applyAudioFxField();
}

// ============================================================
//  UI —— 同步构建 4 个内容块，挂进 #fx-panel（organize 之前就位）
// ============================================================

function audioFxEl(tag, opts) {
  var n = document.createElement(tag);
  if (opts) {
    if (opts.id) n.id = opts.id;
    if (opts.cls) n.className = opts.cls;
    if (opts.text != null) n.textContent = opts.text;
    if (opts.attr) { for (var k in opts.attr) n.setAttribute(k, opts.attr[k]); }
  }
  return n;
}

function audioFxFreqLabel(f) {
  if (f >= 1000) return (f / 1000) + 'K';
  return f + 'Hz';
}

function audioFxSliderRow(id, label, val, min, max, step, unit, forceSign) {
  var wrap = audioFxEl('div', { cls: 'fx-slider', id: id + '-wrap' });
  wrap.appendChild(audioFxEl('label', { text: label }));
  wrap.appendChild(audioFxEl('input', {
    id: id,
    attr: { type: 'range', min: String(min), max: String(max), step: String(step), value: String(val) }
  }));
  var disp = (forceSign && val >= 0 ? '+' : '') + (Math.round(val * 10) / 10) + unit;
  wrap.appendChild(audioFxEl('output', { id: id + '-out', text: disp }));
  return wrap;
}

// 单个预设/声场卡片按钮（深色玻璃卡：主标题白 + 副标灰 + 顶部高光）
// data-preset / data-field 标记，由父 grid 委托 click 派发
function audioFxChipCard(name, sub, dataKey) {
  var attr = { type: 'button' };
  attr['data-' + dataKey] = name;
  var btn = audioFxEl('button', { cls: 'audio-fx-chip', attr: attr });
  btn.appendChild(audioFxEl('span', { cls: 'audio-fx-chip-name', text: name }));
  btn.appendChild(audioFxEl('span', { cls: 'audio-fx-chip-sub', text: sub }));
  return btn;
}

function audioFxBuildMaster() {
  var b = audioFxEl('div', { id: 'audio-fx-master', cls: 'audio-fx-block' });
  var toggle = audioFxEl('div', {
    id: 'audio-fx-enabled', cls: 'fx-toggle',
    attr: { role: 'switch', tabindex: '0', 'aria-checked': 'false' }
  });
  toggle.appendChild(audioFxEl('span', { text: '启用音效' }));
  toggle.appendChild(audioFxEl('span', { cls: 'dot' }));
  b.appendChild(toggle);
  b.appendChild(audioFxSliderRow('audio-fx-mix', '音效强度', Math.round(audioFxState.mix * 100), 0, 100, 1, '%', false));
  return b;
}

function audioFxBuildPresets() {
  var b = audioFxEl('div', { id: 'audio-fx-presets', cls: 'audio-fx-block' });
  var grid = audioFxEl('div', { cls: 'audio-fx-chips', id: 'audio-fx-chip-grid' });
  Object.keys(AUDIO_FX_PRESETS).forEach(function (name) {
    grid.appendChild(audioFxChipCard(name, AUDIO_FX_PRESETS[name].sub, 'preset'));
  });
  b.appendChild(grid);
  return b;
}

function audioFxBuildEq() {
  var b = audioFxEl('div', { id: 'audio-fx-eq', cls: 'audio-fx-block' });
  b.appendChild(audioFxEl('canvas', {
    cls: 'audio-fx-curve', id: 'audio-fx-curve',
    attr: { width: '600', height: '192' }
  }));
  var bands = audioFxEl('div', { cls: 'audio-fx-eq', id: 'audio-fx-bands' });
  AUDIO_FX_FREQS.forEach(function (f, i) {
    var band = audioFxEl('div', { cls: 'audio-fx-band' });
    band.appendChild(audioFxEl('div', { cls: 'audio-fx-band-freq', text: audioFxFreqLabel(f) }));
    var track = audioFxEl('div', { cls: 'audio-fx-band-track' });
    track.appendChild(audioFxEl('div', { cls: 'audio-fx-band-fill', attr: { id: 'audio-fx-fill-' + i } }));
    track.appendChild(audioFxEl('input', {
      id: 'audio-fx-input-' + i,
      cls: 'audio-fx-band-input',
      attr: { type: 'range', min: '-12', max: '12', step: '0.5', value: String(audioFxState.bands[i]), 'data-band': String(i) }
    }));
    band.appendChild(track);
    band.appendChild(audioFxEl('div', { cls: 'audio-fx-band-val', attr: { id: 'audio-fx-val-' + i }, text: '0.0' }));
    bands.appendChild(band);
  });
  b.appendChild(bands);
  b.appendChild(audioFxSliderRow('audio-fx-gain', '高级增益', audioFxState.advancedGainDb, -12, 12, 0.5, ' dB', true));
  b.appendChild(audioFxSliderRow('audio-fx-q', 'Q 值', audioFxState.q, 0.3, 6, 0.1, '', false));
  return b;
}

function audioFxBuildFields() {
  var b = audioFxEl('div', { id: 'audio-fx-fields', cls: 'audio-fx-block' });
  var grid = audioFxEl('div', { cls: 'audio-fx-chips', id: 'audio-fx-field-grid' });
  Object.keys(AUDIO_FX_SOUND_FIELDS).forEach(function (name) {
    grid.appendChild(audioFxChipCard(name, AUDIO_FX_SOUND_FIELDS[name].sub, 'field'));
  });
  b.appendChild(grid);
  var toggle = audioFxEl('div', {
    id: 'audio-fx-3d', cls: 'fx-toggle',
    attr: { role: 'switch', tabindex: '0', 'aria-checked': 'false' }
  });
  toggle.appendChild(audioFxEl('span', { text: '3D 环绕' }));
  toggle.appendChild(audioFxEl('span', { cls: 'dot' }));
  b.appendChild(toggle);
  b.appendChild(audioFxSliderRow('audio-fx-3d-intensity', '环绕强度', Math.round(audioFxState.surround3dIntensity * 100), 0, 100, 1, '%', false));
  b.appendChild(audioFxSliderRow('audio-fx-3d-speed', '环绕速度', Math.round(audioFxState.surround3dSpeed * 100), 0, 100, 1, '%', false));
  return b;
}

function audioFxBuildBlocks() {
  var panel = document.getElementById('fx-panel');
  if (!panel) return false;
  if (document.getElementById('audio-fx-master')) return true;
  panel.appendChild(audioFxBuildMaster());
  panel.appendChild(audioFxBuildPresets());
  panel.appendChild(audioFxBuildEq());
  panel.appendChild(audioFxBuildFields());
  return true;
}

function audioFxSetEnabled(v) {
  audioFxState.enabled = v;
  var en = document.getElementById('audio-fx-enabled');
  if (en) { en.classList.toggle('on', v); en.setAttribute('aria-checked', v ? 'true' : 'false'); }
  applyAudioFxEnabled();
  audioFxRenderBands();
  audioFxDrawCurve();
  saveAudioFxSettings();
}

function audioFxApplyPreset(name) {
  var p = AUDIO_FX_PRESETS[name];
  if (!p) return;
  audioFxState.preset = name;
  audioFxState.bands = p.gains.slice();
  audioFxUpdatePresetChips();
  audioFxRenderBands();
  applyAudioFxBandGains();
  audioFxDrawCurve();
  saveAudioFxSettings();
}

function audioFxSetBand(i, v) {
  audioFxState.bands[i] = Math.max(-12, Math.min(12, Math.round(v * 2) / 2));
  audioFxState.preset = '自定义';
  audioFxUpdatePresetChips();
  audioFxRenderBands();
  if (audioFxNodes.eqBands[i]) {
    audioFxNodes.eqBands[i].gain.value = audioFxState.enabled ? audioFxState.bands[i] : 0;
  }
  audioFxDrawCurve();
  saveAudioFxSettings();
}

function audioFxSetField(name) {
  audioFxState.soundField = name;
  audioFxUpdateFieldChips();
  if (audioFxNodes.convolver && audioFxNodes.convolver.context) {
    var field = AUDIO_FX_SOUND_FIELDS[name] || AUDIO_FX_SOUND_FIELDS['关闭'];
    audioFxNodes.fieldBuffer = audioFxBuildFieldBuffer(audioFxNodes.convolver.context, field);
    audioFxAssignIR();
  }
  applyAudioFxField();
  saveAudioFxSettings();
}

function audioFxSet3D(v) {
  audioFxState.surround3d = v;
  var t = document.getElementById('audio-fx-3d');
  if (t) { t.classList.toggle('on', v); t.setAttribute('aria-checked', v ? 'true' : 'false'); }
  audioFxAssignIR();
  applyAudioFxField();
  applyAudioFxSurroundSpeed();
  saveAudioFxSettings();
}

function audioFxBindBlocks() {
  var en = document.getElementById('audio-fx-enabled');
  if (en) {
    en.addEventListener('click', function () { audioFxSetEnabled(!audioFxState.enabled); });
    en.addEventListener('keydown', function (e) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); audioFxSetEnabled(!audioFxState.enabled); }
    });
  }
  var mix = document.getElementById('audio-fx-mix');
  if (mix) mix.addEventListener('input', function () {
    audioFxState.mix = Math.max(0, Math.min(1, Number(mix.value) / 100));
    var out = document.getElementById('audio-fx-mix-out');
    if (out) out.textContent = Math.round(audioFxState.mix * 100) + '%';
    applyAudioFxField();
    saveAudioFxSettings();
  });

  var grid = document.getElementById('audio-fx-chip-grid');
  if (grid) grid.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('.audio-fx-chip') : null;
    if (!btn) return;
    audioFxApplyPreset(btn.getAttribute('data-preset'));
  });

  var fgrid = document.getElementById('audio-fx-field-grid');
  if (fgrid) fgrid.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('.audio-fx-chip') : null;
    if (!btn) return;
    audioFxSetField(btn.getAttribute('data-field'));
  });

  var t3d = document.getElementById('audio-fx-3d');
  if (t3d) {
    t3d.addEventListener('click', function () { audioFxSet3D(!audioFxState.surround3d); });
    t3d.addEventListener('keydown', function (e) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); audioFxSet3D(!audioFxState.surround3d); }
    });
  }

  var bandsWrap = document.getElementById('audio-fx-bands');
  if (bandsWrap) bandsWrap.querySelectorAll('.audio-fx-band-input').forEach(function (inp) {
    inp.addEventListener('input', function () {
      audioFxSetBand(Number(inp.getAttribute('data-band')), Number(inp.value));
    });
  });

  var gain = document.getElementById('audio-fx-gain');
  if (gain) gain.addEventListener('input', function () {
    audioFxState.advancedGainDb = Number(gain.value);
    var out = document.getElementById('audio-fx-gain-out');
    if (out) out.textContent = (audioFxState.advancedGainDb >= 0 ? '+' : '') + (Math.round(audioFxState.advancedGainDb * 10) / 10) + ' dB';
    applyAudioFxAdvancedGain();
    saveAudioFxSettings();
  });

  var q = document.getElementById('audio-fx-q');
  if (q) q.addEventListener('input', function () {
    audioFxState.q = Number(q.value);
    var out = document.getElementById('audio-fx-q-out');
    if (out) out.textContent = (Math.round(audioFxState.q * 10) / 10).toFixed(1);
    applyAudioFxQ();
    saveAudioFxSettings();
  });

  var s3i = document.getElementById('audio-fx-3d-intensity');
  if (s3i) s3i.addEventListener('input', function () {
    audioFxState.surround3dIntensity = Math.max(0, Math.min(1, Number(s3i.value) / 100));
    var out = document.getElementById('audio-fx-3d-intensity-out');
    if (out) out.textContent = Math.round(audioFxState.surround3dIntensity * 100) + '%';
    applyAudioFxField();
    saveAudioFxSettings();
  });

  var s3s = document.getElementById('audio-fx-3d-speed');
  if (s3s) s3s.addEventListener('input', function () {
    audioFxState.surround3dSpeed = Math.max(0, Math.min(1, Number(s3s.value) / 100));
    var out = document.getElementById('audio-fx-3d-speed-out');
    if (out) out.textContent = Math.round(audioFxState.surround3dSpeed * 100) + '%';
    applyAudioFxSurroundSpeed();
    saveAudioFxSettings();
  });
}

// ============================================================
//  渲染
// ============================================================

function audioFxRenderBands() {
  AUDIO_FX_FREQS.forEach(function (f, i) {
    var fill = document.getElementById('audio-fx-fill-' + i);
    var val = document.getElementById('audio-fx-val-' + i);
    var inp = document.getElementById('audio-fx-input-' + i);
    var eff = audioFxState.enabled ? audioFxState.bands[i] : 0;
    if (fill) {
      fill.style.height = ((eff + 12) / 24 * 100) + '%';
      fill.style.opacity = audioFxState.enabled ? '1' : '.35';
    }
    if (val) val.textContent = (audioFxState.bands[i] >= 0 ? '+' : '') + audioFxState.bands[i].toFixed(1);
    // 关键修复：拖动后选预设时，必须把 range 实际值同步，否则滑块竖柄停在老位置、与 fill/文字不一致
    if (inp && Number(inp.value) !== audioFxState.bands[i]) inp.value = audioFxState.bands[i];
  });
}

function audioFxUpdatePresetChips() {
  var grid = document.getElementById('audio-fx-chip-grid');
  if (!grid) return;
  grid.querySelectorAll('.audio-fx-chip').forEach(function (c) {
    c.classList.toggle('active', c.getAttribute('data-preset') === audioFxState.preset);
  });
}

function audioFxUpdateFieldChips() {
  var grid = document.getElementById('audio-fx-field-grid');
  if (!grid) return;
  grid.querySelectorAll('.audio-fx-chip').forEach(function (c) {
    c.classList.toggle('active', c.getAttribute('data-field') === audioFxState.soundField);
  });
}

// ---- 频响曲线 ----
function audioFxPeakingMag(f0, Q, dBgain, f) {
  var A = Math.pow(10, dBgain / 40);
  var w = 2 * Math.PI * f / f0;
  var alpha = Math.sin(w) / (2 * Q);
  var cosw = Math.cos(w), sinw = Math.sin(w);
  var b0 = 1 + alpha * A, b1 = -2 * cosw, b2 = 1 - alpha * A;
  var a0 = 1 + alpha / A, a1 = -2 * cosw, a2 = 1 - alpha / A;
  var reNum = b0 + b1 * cosw + b2 * Math.cos(2 * w);
  var imNum = -b1 * sinw - b2 * Math.sin(2 * w);
  var reDen = a0 + a1 * cosw + a2 * Math.cos(2 * w);
  var imDen = -a1 * sinw - a2 * Math.sin(2 * w);
  var magNum = Math.sqrt(reNum * reNum + imNum * imNum);
  var magDen = Math.sqrt(reDen * reDen + imDen * imDen);
  return magNum / magDen;
}

function audioFxBandResponseDb(f) {
  var total = 1;
  if (audioFxNodes.eqBands && audioFxNodes.eqBands.length) {
    var freqs = new Float32Array([f]);
    var mag = new Float32Array(1);
    var phase = new Float32Array(1);
    for (var i = 0; i < audioFxNodes.eqBands.length; i++) {
      audioFxNodes.eqBands[i].getFrequencyResponse(freqs, mag, phase);
      total *= mag[0];
    }
  } else {
    for (var k = 0; k < audioFxState.bands.length; k++) {
      total *= audioFxPeakingMag(AUDIO_FX_FREQS[k], audioFxState.q, audioFxState.enabled ? audioFxState.bands[k] : 0, f);
    }
  }
  return 20 * Math.log10(total);
}

// 频响曲线：低饱和玻璃感（白→冷白描边 + 极淡填充），呼应主题克制风格，
// 不再用满屏高亮青。
function audioFxDrawCurve() {
  var cv = document.getElementById('audio-fx-curve');
  if (!cv) return;
  var ctx = cv.getContext('2d');
  var W = cv.width, H = cv.height;
  var mid = H / 2;
  ctx.clearRect(0, 0, W, H);
  // 网格
  ctx.strokeStyle = 'rgba(255,255,255,.05)';
  ctx.lineWidth = 1;
  for (var g = 1; g < 4; g++) {
    var y = H * g / 4;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,.10)';
  ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(W, mid); ctx.stroke();

  var N = 180, minF = 20, maxF = 20000;
  var pts = [];
  for (var i = 0; i < N; i++) {
    var fr = minF * Math.pow(maxF / minF, i / (N - 1));
    var db = audioFxBandResponseDb(fr);
    var x = (i / (N - 1)) * W;
    var yy = mid - (Math.max(-15, Math.min(15, db)) / 15) * (H / 2 - 6);
    pts.push([x, yy]);
  }
  // 填充：极淡玻璃感，主题色仅微染
  ctx.beginPath();
  ctx.moveTo(pts[0][0], mid);
  for (var p = 0; p < pts.length; p++) ctx.lineTo(pts[p][0], pts[p][1]);
  ctx.lineTo(pts[pts.length - 1][0], mid);
  ctx.closePath();
  var fillGrad = ctx.createLinearGradient(0, 0, 0, H);
  fillGrad.addColorStop(0, 'rgba(0,245,212,.08)');
  fillGrad.addColorStop(1, 'rgba(0,245,212,0)');
  ctx.fillStyle = fillGrad;
  ctx.fill();
  // 描边：白色低饱和（呼应 home-tile 卡片的白字），叠加极淡青发光
  var strokeGrad = ctx.createLinearGradient(0, 0, W, 0);
  strokeGrad.addColorStop(0, 'rgba(255,255,255,.70)');
  strokeGrad.addColorStop(1, 'rgba(220,235,240,.55)');
  ctx.strokeStyle = strokeGrad;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (var q = 0; q < pts.length; q++) {
    if (q === 0) ctx.moveTo(pts[q][0], pts[q][1]);
    else ctx.lineTo(pts[q][0], pts[q][1]);
  }
  ctx.stroke();
}

// ============================================================
//  持久化
// ============================================================

function saveAudioFxSettings() {
  try {
    localStorage.setItem(AUDIO_FX_STORAGE_KEY, JSON.stringify({
      enabled: audioFxState.enabled,
      mix: audioFxState.mix,
      bands: audioFxState.bands,
      preset: audioFxState.preset,
      advancedGainDb: audioFxState.advancedGainDb,
      q: audioFxState.q,
      soundField: audioFxState.soundField,
      surround3d: audioFxState.surround3d,
      surround3dIntensity: audioFxState.surround3dIntensity,
      surround3dSpeed: audioFxState.surround3dSpeed
    }));
  } catch (e) {}
}

function loadAudioFxSettings() {
  try {
    var raw = localStorage.getItem(AUDIO_FX_STORAGE_KEY);
    if (!raw) return;
    var s = JSON.parse(raw);
    if (typeof s.enabled === 'boolean') audioFxState.enabled = s.enabled;
    if (typeof s.mix === 'number') audioFxState.mix = Math.max(0, Math.min(1, s.mix));
    if (Array.isArray(s.bands) && s.bands.length === 10) audioFxState.bands = s.bands.map(Number);
    if (typeof s.preset === 'string') audioFxState.preset = s.preset;
    if (typeof s.advancedGainDb === 'number') audioFxState.advancedGainDb = advancedGainDbClamp(s.advancedGainDb);
    if (typeof s.q === 'number') audioFxState.q = s.q;
    if (typeof s.soundField === 'string' && AUDIO_FX_SOUND_FIELDS[s.soundField]) audioFxState.soundField = s.soundField;
    if (typeof s.surround3d === 'boolean') audioFxState.surround3d = s.surround3d;
    if (typeof s.surround3dIntensity === 'number') audioFxState.surround3dIntensity = Math.max(0, Math.min(1, s.surround3dIntensity));
    if (typeof s.surround3dSpeed === 'number') audioFxState.surround3dSpeed = Math.max(0, Math.min(1, s.surround3dSpeed));
  } catch (e) {}
}

function advancedGainDbClamp(v) {
  v = Number(v);
  if (!isFinite(v)) return 0;
  return Math.max(-12, Math.min(12, v));
}

function audioFxReflectUI() {
  var en = document.getElementById('audio-fx-enabled');
  if (en) { en.classList.toggle('on', audioFxState.enabled); en.setAttribute('aria-checked', audioFxState.enabled ? 'true' : 'false'); }
  var mix = document.getElementById('audio-fx-mix');
  if (mix) { mix.value = Math.round(audioFxState.mix * 100); var mo = document.getElementById('audio-fx-mix-out'); if (mo) mo.textContent = Math.round(audioFxState.mix * 100) + '%'; }
  var t3d = document.getElementById('audio-fx-3d');
  if (t3d) { t3d.classList.toggle('on', audioFxState.surround3d); t3d.setAttribute('aria-checked', audioFxState.surround3d ? 'true' : 'false'); }
  var gain = document.getElementById('audio-fx-gain');
  if (gain) { gain.value = audioFxState.advancedGainDb; var go = document.getElementById('audio-fx-gain-out'); if (go) go.textContent = (audioFxState.advancedGainDb >= 0 ? '+' : '') + (Math.round(audioFxState.advancedGainDb * 10) / 10) + ' dB'; }
  var q = document.getElementById('audio-fx-q');
  if (q) { q.value = audioFxState.q; var qo = document.getElementById('audio-fx-q-out'); if (qo) qo.textContent = (Math.round(audioFxState.q * 10) / 10).toFixed(1); }
  var s3i = document.getElementById('audio-fx-3d-intensity');
  if (s3i) { s3i.value = Math.round(audioFxState.surround3dIntensity * 100); var s3io = document.getElementById('audio-fx-3d-intensity-out'); if (s3io) s3io.textContent = Math.round(audioFxState.surround3dIntensity * 100) + '%'; }
  var s3s = document.getElementById('audio-fx-3d-speed');
  if (s3s) { s3s.value = Math.round(audioFxState.surround3dSpeed * 100); var s3so = document.getElementById('audio-fx-3d-speed-out'); if (s3so) s3so.textContent = Math.round(audioFxState.surround3dSpeed * 100) + '%'; }
  audioFxUpdatePresetChips();
  audioFxUpdateFieldChips();
  audioFxRenderBands();
  audioFxDrawCurve();
}

// ============================================================
//  启动：同步构建（#fx-panel 为静态节点），确保 organize 扫描前就位
// ============================================================
(function audioFxBootstrap() {
  function start() {
    audioFxBuildBlocks();
    audioFxBindBlocks();
    loadAudioFxSettings();
    audioFxReflectUI();
  }
  if (!audioFxBuildBlocks()) {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    audioFxBindBlocks();
    loadAudioFxSettings();
    audioFxReflectUI();
  }
})();
