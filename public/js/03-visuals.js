// ============================================================
//  Mineradio — 03-visuals.js
// ============================================================

// ============================================================
//  安魂 — 3D 粒子建模层
// ============================================================
var SKULL_PRESET_INDEX = 6;
var SKULL_MODEL_BASE_ROTATION_X = -0.26;
var SKULL_MODEL_BASE_ROTATION_Y = 0.00;
var SKULL_MODEL_SCALE = 2.34;
var SKULL_MODEL_BASE_POSITION = { x: 0, y: 0.22, z: 0.10 };
var skullAmpPulse = 0;
var skullBeatFlash = 0;
var skullJawOpen = 0;
var skullCameraBlend = 0;
var skullWheelZoom = 0;
var skullWheelZoomTarget = 0;
var skullCameraTargetPos = new THREE.Vector3();
var skullCameraTargetLook = new THREE.Vector3();
var skullCameraBasePos = new THREE.Vector3();
var skullCameraBaseLook = new THREE.Vector3();
var skullCameraShelfPos = new THREE.Vector3();
var skullCameraShelfLook = new THREE.Vector3();
var skullCameraMixedLook = new THREE.Vector3();
var skullShelfCameraMix = 0;
var skullLyricMouthLocal = new THREE.Vector3(0.025, -0.72, 0.62);
var skullLyricMouthTarget = new THREE.Vector3();
var skullLyricMouthForward = new THREE.Vector3();
var skullLyricMouthQuat = new THREE.Quaternion();
var skullLyricReadableQuat = new THREE.Quaternion();
var skullParticleGroup = null;
var skullParticleOpacity = 0;
var skullParticleAsset = { data: null, promise: null, failed: false };
var skullBaseColors = {
  boneA: new THREE.Color('#b8ae98'),
  boneB: new THREE.Color('#fff4d8'),
  shadow: new THREE.Color('#100d0d'),
  light: new THREE.Color('#ffe3a0'),
  neutralBoneA: new THREE.Color('#9fb7c8'),
  neutralBoneB: new THREE.Color('#eef9ff'),
  neutralShadow: new THREE.Color('#070b12'),
  neutralLight: new THREE.Color('#d6f3ff')
};
var skullTintScratch = {
  tint: new THREE.Color(),
  soft: new THREE.Color(),
  bright: new THREE.Color(),
  dark: new THREE.Color(),
  boneA: new THREE.Color(),
  boneB: new THREE.Color(),
  shadow: new THREE.Color(),
  light: new THREE.Color()
};

function effectiveSkullVisualTint() {
  var pal = stageLyrics && (stageLyrics.coverPalette || stageLyrics.palette) || {};
  var custom = fx && fx.visualTintMode === 'custom';
  var color = custom
    ? fx.visualTintColor
    : (pal.secondary || pal.primary || fx.visualTintColor || fxDefaults.visualTintColor || '#9db8cf');
  color = normalizeHexColor(color || '#9db8cf', '#9db8cf');
  var strength = custom ? 0.98 : (pal && (pal.secondary || pal.primary) ? 0.30 : 0.14);
  return { color: color, strength: strength, custom: custom };
}

function syncSkullParticleColors() {
  if (!skullParticleGroup || !skullParticleGroup.material || !skullParticleGroup.material.uniforms) return;
  var u = skullParticleGroup.material.uniforms;
  var tint = effectiveSkullVisualTint();
  var custom = !!tint.custom;
  var strength = clampRange(Number(tint.strength) || 0, 0, custom ? 0.99 : 0.78);
  skullTintScratch.tint.set(tint.color);
  skullTintScratch.soft.copy(skullTintScratch.tint).lerp(new THREE.Color('#e8f5ff'), custom ? 0.05 : 0.28);
  skullTintScratch.bright.copy(skullTintScratch.tint).lerp(new THREE.Color(custom ? '#f6fbff' : '#fff7d6'), custom ? 0.14 : 0.46);
  skullTintScratch.dark.copy(skullTintScratch.tint).lerp(new THREE.Color('#05070c'), custom ? 0.74 : 0.72);
  skullTintScratch.boneA.copy(custom ? skullBaseColors.neutralBoneA : skullBaseColors.boneA).lerp(skullTintScratch.soft, strength * (custom ? 0.99 : 0.64));
  skullTintScratch.boneB.copy(custom ? skullBaseColors.neutralBoneB : skullBaseColors.boneB).lerp(skullTintScratch.bright, strength * (custom ? 0.94 : 0.46));
  skullTintScratch.shadow.copy(custom ? skullBaseColors.neutralShadow : skullBaseColors.shadow).lerp(skullTintScratch.dark, strength * (custom ? 0.72 : 0.42));
  skullTintScratch.light.copy(custom ? skullBaseColors.neutralLight : skullBaseColors.light).lerp(skullTintScratch.bright, strength * (custom ? 0.98 : 0.76));
  if (u.uColorA) u.uColorA.value.copy(skullTintScratch.boneA);
  if (u.uColorB) u.uColorB.value.copy(skullTintScratch.boneB);
  if (u.uShadow) u.uShadow.value.copy(skullTintScratch.shadow);
  if (u.uLight) u.uLight.value.copy(skullTintScratch.light);
}

function buildSkullParticleGeometryFromAsset(points) {
  var count = Math.floor((points && points.length || 0) / 5);
  var geo = new THREE.BufferGeometry();
  var positions = new Float32Array(count * 3);
  var seeds = new Float32Array(count);
  var kinds = new Float32Array(count);
  for (var i = 0; i < count; i++) {
    positions[i * 3] = points[i * 5];
    positions[i * 3 + 1] = points[i * 5 + 1];
    positions[i * 3 + 2] = points[i * 5 + 2];
    kinds[i] = points[i * 5 + 3];
    seeds[i] = points[i * 5 + 4];
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
  geo.setAttribute('kind', new THREE.BufferAttribute(kinds, 1));
  return geo;
}

function loadSkullParticleAsset() {
  if (skullParticleAsset.data || skullParticleAsset.promise || skullParticleAsset.failed) return skullParticleAsset.promise || Promise.resolve(skullParticleAsset.data);
  if (typeof fetch !== 'function') {
    skullParticleAsset.failed = true;
    return Promise.resolve(null);
  }
  skullParticleAsset.promise = fetch('assets/skull-decimation-points.bin?v=regular-surface-teeth-soften-20260621', { cache: 'reload' })
    .then(function(res){
      if (!res.ok) throw new Error('skull asset ' + res.status);
      return res.arrayBuffer();
    })
    .then(function(buf){
      if (!buf || buf.byteLength < 20 || buf.byteLength % 20 !== 0) throw new Error('invalid skull asset');
      skullParticleAsset.data = new Float32Array(buf);
      skullParticleAsset.promise = null;
      return skullParticleAsset.data;
    })
    .catch(function(err){
      console.warn('skull particle asset load failed:', err);
      skullParticleAsset.failed = true;
      skullParticleAsset.promise = null;
      return null;
    });
  return skullParticleAsset.promise;
}

function skullPushPoint(pos, seed, kind, x, y, z, k) {
  pos.push(x, y, z);
  seed.push(Math.random() * 1000);
  kind.push(k == null ? 0 : k);
}
function skullPushCurve(pos, seed, kind, count, fn, k, jitter) {
  jitter = jitter == null ? 0.012 : jitter;
  for (var i = 0; i < count; i++) {
    var t = count > 1 ? i / (count - 1) : 0;
    var p = fn(t);
    skullPushPoint(pos, seed, kind, p.x + (Math.random() - 0.5) * jitter, p.y + (Math.random() - 0.5) * jitter, p.z + (Math.random() - 0.5) * jitter, k);
  }
}
function createSkullParticleLayer() {
  if (skullParticleGroup) return skullParticleGroup;
  var asset = skullParticleAsset.data;
  if (!asset) return null;
  var pos = [];
  var seed = [];
  var kind = [];
  if (!asset) {

  function rotate2(x, y, a) {
    var c = Math.cos(a), s = Math.sin(a);
    return { x:x * c - y * s, y:x * s + y * c };
  }
  function eyeCut(x, y, z, side) {
    if (z < 0.16) return false;
    var p = rotate2(x - side * 0.38, y - 0.02, side * 0.10);
    var almond = Math.pow(Math.abs(p.x) / 0.34, 1.70) + Math.pow(Math.abs(p.y) / 0.215, 1.34);
    var slantGate = p.y < 0.22 - Math.abs(p.x) * 0.12 && p.y > -0.24 + Math.abs(p.x) * 0.10;
    return almond < 1.0 && slantGate;
  }
  function noseCut(x, y, z) {
    if (z < 0.20 || y > -0.12 || y < -0.62) return false;
    var t = clampRange((-0.12 - y) / 0.50, 0, 1);
    var half = 0.050 + t * 0.185;
    return Math.abs(x) < half && z > 0.38 + t * 0.18;
  }
  function mouthGap(x, y, z) {
    return z > 0.18 && y < -0.66 && y > -1.03 && Math.abs(x) < 0.30;
  }
  function addEllipsoidSurface(count, cx, cy, cz, rx, ry, rz, yMin, yMax, k, frontBias) {
    var made = 0, guard = 0;
    while (made < count && guard < count * 8) {
      guard++;
      var theta = frontBias
        ? (-Math.PI * 0.07 + Math.random() * Math.PI * 1.14)
        : (Math.random() * Math.PI * 2);
      var phi = Math.acos(1 - Math.random() * 2);
      var sx = Math.sin(phi) * Math.cos(theta);
      var sy = Math.cos(phi);
      var sz = Math.sin(phi) * Math.sin(theta);
      var x = cx + sx * rx * (0.96 + Math.max(0, -sy) * 0.12);
      var y = cy + sy * ry;
      var z = cz + sz * rz;
      if (y < yMin || y > yMax) continue;
      if (eyeCut(x, y, z, -1) || eyeCut(x, y, z, 1) || noseCut(x, y, z) || mouthGap(x, y, z)) continue;
      var cheekCarve = z > 0.18 && y < -0.18 && y > -0.66 && Math.abs(x) > 0.26 && Math.abs(x) < 0.58 && Math.random() < 0.36;
      if (cheekCarve) continue;
      skullPushPoint(pos, seed, kind, x, y, z, k + Math.random() * 0.08);
      made++;
    }
  }

  addEllipsoidSurface(3150, 0, 0.46, 0.00, 0.93, 0.88, 0.58, -0.16, 1.35, 0.055, true);
  addEllipsoidSurface(2100, 0, -0.34, 0.10, 0.70, 0.66, 0.46, -0.95, 0.14, 0.10, true);
  for (var j = 0; j < 1450; j++) {
    var a = Math.random() * Math.PI * 2;
    var v = Math.random();
    var y = -1.16 + v * 0.48;
    var taper = clampRange((y + 1.16) / 0.48, 0, 1);
    var rx = 0.32 + taper * 0.31;
    var rz = 0.22 + taper * 0.18;
    var x = Math.cos(a) * rx;
    var z = 0.22 + Math.sin(a) * rz;
    if (mouthGap(x, y, z)) continue;
    if (y > -0.94 && Math.abs(x) < 0.22 && z > 0.18) continue;
    skullPushPoint(pos, seed, kind, x, y, z, 0.15 + Math.random() * 0.10);
  }

  [-1, 1].forEach(function(side){
    var cx = side * 0.38;
    skullPushCurve(pos, seed, kind, 520, function(t){
      var a = t * Math.PI * 2;
      var px = Math.cos(a) * (0.345 + Math.sin(a * 2.0) * 0.012);
      var py = Math.sin(a) * (0.205 + Math.cos(a * 2.0) * 0.010);
      var r = rotate2(px, py, -side * 0.10);
      return {
        x: cx + r.x,
        y: 0.02 + r.y - Math.max(0, Math.cos(a)) * 0.018,
        z: 0.72 + Math.sin(a * 2.0) * 0.030
      };
    }, 0.96, 0.010);
    skullPushCurve(pos, seed, kind, 330, function(t){
      var x = side * (0.13 + t * 0.58);
      var y = 0.245 - t * 0.085 + Math.sin(t * Math.PI) * 0.055;
      return { x:x, y:y, z:0.66 + Math.sin(t * Math.PI) * 0.055 };
    }, 0.98, 0.010);
    skullPushCurve(pos, seed, kind, 300, function(t){
      return {
        x: side * (0.30 + t * 0.47),
        y: -0.18 - t * 0.25 + Math.sin(t * Math.PI) * 0.070,
        z: 0.69 - t * 0.095
      };
    }, 0.84, 0.012);
    skullPushCurve(pos, seed, kind, 330, function(t){
      return {
        x: side * (0.62 - t * 0.20),
        y: -0.28 - t * 0.55 + Math.sin(t * Math.PI) * 0.065,
        z: 0.50 + Math.sin(t * Math.PI) * 0.070
      };
    }, 0.72, 0.014);
  });

  skullPushCurve(pos, seed, kind, 360, function(t){
    var x = -0.72 + t * 1.44;
    return { x:x, y:0.235 - Math.abs(x) * 0.055 + Math.sin(t * Math.PI) * 0.035, z:0.62 + Math.sin(t * Math.PI) * 0.040 };
  }, 0.86, 0.012);
  [-1, 1].forEach(function(side){
    skullPushCurve(pos, seed, kind, 260, function(t){
      return { x:side * (0.035 + t * 0.205), y:-0.15 - t * 0.43, z:0.79 - t * 0.035 };
    }, 0.98, 0.007);
  });
  skullPushCurve(pos, seed, kind, 240, function(t){
    var x = -0.25 + t * 0.50;
    return { x:x, y:-0.62 + Math.sin(t * Math.PI) * 0.030, z:0.70 };
  }, 0.86, 0.008);
  skullPushCurve(pos, seed, kind, 420, function(t){
    var a = Math.PI + t * Math.PI;
    return { x: Math.cos(a) * 0.50, y: -0.98 + Math.sin(a) * 0.205, z: 0.46 + Math.sin(t * Math.PI) * 0.075 };
  }, 0.82, 0.014);
  skullPushCurve(pos, seed, kind, 360, function(t){
    var x = -0.39 + t * 0.78;
    return { x:x, y:-0.70 + Math.sin(t * Math.PI) * 0.018, z:0.73 };
  }, 0.96, 0.006);
  skullPushCurve(pos, seed, kind, 320, function(t){
    var x = -0.36 + t * 0.72;
    return { x:x, y:-1.005 - Math.sin(t * Math.PI) * 0.018, z:0.70 };
  }, 0.78, 0.008);
  for (var tooth = -4; tooth <= 4; tooth++) {
    var tx = tooth * 0.082;
    var height = tooth === 0 ? 0.30 : (0.25 + (4 - Math.abs(tooth)) * 0.012);
    skullPushCurve(pos, seed, kind, 58, function(t){
      return { x: tx + Math.sin(t * Math.PI) * 0.006, y: -0.715 - t * height, z: 0.735 - t * 0.020 };
    }, 0.94, 0.004);
  }
  skullPushCurve(pos, seed, kind, 520, function(t){
    var a = Math.PI * 0.12 + t * Math.PI * 0.76;
    return { x: Math.cos(a) * 0.98, y: 0.42 + Math.sin(a) * 0.92, z: 0.48 + Math.sin(t * Math.PI) * 0.10 };
  }, 0.70, 0.012);
  skullPushCurve(pos, seed, kind, 360, function(t){
    var a = t * Math.PI * 2;
    return { x: Math.cos(a) * 0.52, y: -1.19 + Math.sin(a) * 0.082, z: 0.24 + Math.sin(a * 2.0) * 0.028 };
  }, 0.72, 0.010);
  }

  var geo = asset ? buildSkullParticleGeometryFromAsset(asset) : new THREE.BufferGeometry();
  if (!asset) {
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(new Float32Array(seed), 1));
    geo.setAttribute('kind', new THREE.BufferAttribute(new Float32Array(kind), 1));
  }
  var mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: dotTexture },
      uTime: uniforms.uTime,
      uPixel: uniforms.uPixel,
      uBass: uniforms.uBass,
      uMid: uniforms.uMid,
      uTreble: uniforms.uTreble,
      uBeat: uniforms.uBeat,
      uJawOpen: { value: 0 },
      uSkullFlash: { value: 0 },
      uPointScale: uniforms.uPointScale,
      uBloomStrength: uniforms.uBloomStrength,
      uColorBoost: uniforms.uColorBoost,
      uOpacity: { value: 0 },
      uColorA: { value: new THREE.Color('#b8ae98') },
      uColorB: { value: new THREE.Color('#fff4d8') },
      uShadow: { value: new THREE.Color('#100d0d') },
      uLight: { value: new THREE.Color('#ffe3a0') }
    },
    vertexShader: [
      'precision highp float;',
      'attribute float seed,kind;',
      'uniform float uTime,uPixel,uPointScale,uBloomStrength,uColorBoost;',
      'uniform float uBass,uMid,uTreble,uBeat,uJawOpen,uSkullFlash;',
      'varying float vKind,vLight,vRim,vAmp,vDensity,vFlash;',
      'void main(){',
      '  vec3 pos = position;',
      '  float jawGroup = step(1.0, kind);',
      '  float boneKind = fract(kind);',
      '  vKind = boneKind;',
      '  vec3 n = normalize(vec3(position.x * 0.82, position.y * 0.68, position.z * 1.22 + 0.16));',
      '  float toothBand = smoothstep(0.48, 0.70, position.z) * (1.0 - smoothstep(0.27, 0.48, abs(position.x))) * (1.0 - smoothstep(0.18, 0.46, abs(position.y + 0.72)));',
      '  float toothNoise = fract(sin(seed * 21.731 + floor((position.x + 0.52) * 21.0) * 5.137) * 43758.5453);',
      '  pos.y += toothBand * (toothNoise - 0.5) * 0.020;',
      '  pos.z += toothBand * (fract(sin(seed * 17.923 + position.y * 31.0) * 24634.6345) - 0.5) * 0.012;',
      '  float jawSidePull = jawGroup * smoothstep(-0.42, -1.06, position.y) * smoothstep(0.24, 0.62, abs(position.x)) * (1.0 - smoothstep(0.78, 1.04, abs(position.x))) * smoothstep(0.16, 0.70, position.z);',
      '  pos.x *= 1.0 - jawSidePull * 0.10;',
      '  float fallbackJaw = smoothstep(-0.48, -0.90, position.y) * smoothstep(0.08, 0.52, position.z) * (1.0 - smoothstep(0.62, 0.96, abs(position.x)));',
      '  float jawMask = jawGroup;',
      '  float jawSideAnchor = smoothstep(0.36, 0.66, abs(position.x)) * (1.0 - smoothstep(0.78, 0.98, abs(position.x))) * smoothstep(-0.34, -0.74, position.y) * (1.0 - smoothstep(0.62, 0.86, position.z));',
      '  float jawMotion = jawMask * (1.0 - jawSideAnchor * 0.32);',
      '  vec2 jawHinge = vec2(-0.45, 0.18);',
      '  float jawAngle = uJawOpen * 0.52 * jawMotion;',
      '  float jc = cos(jawAngle);',
      '  float js = sin(jawAngle);',
      '  vec2 jr = pos.yz - jawHinge;',
      '  vec2 openedJaw = vec2(jr.x * jc - jr.y * js, jr.x * js + jr.y * jc) + jawHinge;',
      '  pos.yz = mix(pos.yz, openedJaw, jawMotion);',
      '  float jawDrop = jawMotion * smoothstep(-0.32, -0.88, position.y) * (0.58 + smoothstep(0.18, 0.62, abs(position.x)) * 0.04);',
      '  float openDrive = clamp(uJawOpen, 0.0, 1.25);',
      '  pos.y -= jawDrop * (0.038 + openDrive * 0.100);',
      '  pos.z += jawDrop * (0.003 + openDrive * 0.014);',
      '  float ampDrive = smoothstep(0.20, 0.82, uBass * 0.44 + uMid * 0.22 + uBeat * 0.72);',
      '  float ampPhase = 0.50 + 0.50 * sin(uTime * (1.05 + uMid * 0.30) + seed * 6.2831);',
      '  vFlash = clamp(uSkullFlash * (0.68 + ampPhase * 0.32), 0.0, 1.0);',
      '  vAmp = clamp(ampDrive * 0.045 + vFlash * 0.92 + uTreble * 0.012, 0.0, 1.0);',
      '  vec4 mv = modelViewMatrix * vec4(pos, 1.0);',
      '  float dist = max(0.55, -mv.z);',
      '  vec3 vn = normalize(normalMatrix * n);',
      '  vec3 keyDir = normalize(vec3(-0.48, 0.64, 0.60));',
      '  vec3 lowDir = normalize(vec3(-0.10, -0.78, 0.34));',
      '  vec3 fillDir = normalize(vec3(0.36, -0.04, 0.64));',
      '  vec3 rimDir = normalize(vec3(0.88, 0.18, -0.44));',
      '  float key = pow(max(dot(vn, keyDir), 0.0), 1.18);',
      '  float low = pow(max(dot(vn, lowDir), 0.0), 1.34) * 0.10;',
      '  float fill = max(dot(vn, fillDir), 0.0) * 0.055;',
      '  float gothicShadow = smoothstep(-0.10, 0.36, dot(vn, normalize(vec3(0.44, -0.06, -0.58))));',
      '  float dentalLift = smoothstep(0.48, 0.72, position.z) * (1.0 - smoothstep(0.30, 0.54, abs(position.x))) * (1.0 - smoothstep(0.18, 0.48, abs(position.y + 0.70))) * (0.62 + toothNoise * 0.20);',
      '  vRim = pow(max(dot(vn, rimDir), 0.0), 2.50) * (0.24 + uBloomStrength * 0.08 + vFlash * 0.62);',
      '  float dust = fract(sin(seed * 13.871 + position.x * 19.7 + position.y * 7.1) * 43758.5453);',
      '  vDensity = clamp(0.30 + key * 0.70 + vRim * 0.24 - gothicShadow * 0.24 + dust * 0.025 + vFlash * 0.08, 0.16, 1.20);',
      '  vLight = clamp(0.115 + key * 1.02 + low + fill + dentalLift * 0.20 + boneKind * 0.070 + vAmp * 0.56 - gothicShadow * 0.08, 0.035, 1.72);',
      '  float scaleCtl = clamp(uPointScale, 0.48, 2.35);',
      '  float size = (0.035 + boneKind * 0.026) * (0.84 + vDensity * 0.22 + vLight * 0.13 + uBloomStrength * 0.030 + vFlash * 0.18);',
      '  gl_PointSize = clamp(size * uPixel * scaleCtl * 128.0 / dist, 0.95, 7.60);',
      '  gl_Position = projectionMatrix * mv;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'precision highp float;',
      'uniform sampler2D uMap;',
      'uniform vec3 uColorA,uColorB,uShadow,uLight;',
      'uniform float uOpacity,uBloomStrength,uColorBoost;',
      'varying float vKind,vLight,vRim,vAmp,vDensity,vFlash;',
      'void main(){',
      '  vec4 tex = texture2D(uMap, gl_PointCoord);',
      '  if(tex.a < 0.070) discard;',
      '  float contrast = clamp(uColorBoost, 0.50, 2.00);',
      '  float lit = clamp(pow(vLight, mix(1.18, 0.74, (contrast - 0.50) / 1.50)), 0.0, 1.28);',
      '  vec3 bone = mix(uColorA, uColorB, clamp((vKind - 0.34) * 2.0 + lit * 0.18, 0.0, 1.0));',
      '  vec3 col = mix(uShadow, bone, clamp(lit, 0.0, 1.0));',
      '  col = mix(col, uLight, clamp(vRim * (0.14 + uBloomStrength * 0.035 + vFlash * 0.40), 0.0, 0.54));',
      '  col = mix(col, uLight, clamp(vAmp * (0.09 + uBloomStrength * 0.025) + vFlash * 0.56, 0.0, 0.68));',
      '  float alpha = tex.a * uOpacity * clamp(0.20 + lit * 0.44 + vDensity * 0.40 + vRim * 0.10 + vFlash * 0.46, 0.12, 1.56);',
      '  gl_FragColor = vec4(col, alpha);',
      '}'
    ].join('\n'),
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending
  });
  skullParticleGroup = new THREE.Points(geo, mat);
  skullParticleGroup.frustumCulled = false;
  skullParticleGroup.visible = false;
  skullParticleGroup.userData.source = asset ? 'asset' : 'fallback';
  skullParticleGroup.position.set(SKULL_MODEL_BASE_POSITION.x, SKULL_MODEL_BASE_POSITION.y, SKULL_MODEL_BASE_POSITION.z);
  skullParticleGroup.scale.setScalar(SKULL_MODEL_SCALE);
  skullParticleGroup.rotation.x = SKULL_MODEL_BASE_ROTATION_X;
  skullParticleGroup.rotation.y = SKULL_MODEL_BASE_ROTATION_Y;
  skullParticleGroup.renderOrder = 32;
  syncSkullParticleColors();
  scene.add(skullParticleGroup);
  return skullParticleGroup;
}
function isSkullShelfCompositionActive() {
  if (!(fx && fx.preset === SKULL_PRESET_INDEX)) return false;
  if (!shelfManager || !shelfManager.getMode || shelfManager.getMode() !== 'side') return false;
  if (shelfPinnedOpen || shelfVisibility > 0.18) return true;
  return !!(shelfManager.hasOpenContent && shelfManager.hasOpenContent());
}
function clearSkullPresetResidue() {
  skullParticleOpacity = 0;
  skullAmpPulse = 0;
  skullBeatFlash = 0;
  skullJawOpen = 0;
  skullCameraBlend = 0;
  if (!skullParticleGroup) return;
  skullParticleGroup.visible = false;
  if (skullParticleGroup.material && skullParticleGroup.material.uniforms) {
    if (skullParticleGroup.material.uniforms.uOpacity) skullParticleGroup.material.uniforms.uOpacity.value = 0;
    if (skullParticleGroup.material.uniforms.uJawOpen) skullParticleGroup.material.uniforms.uJawOpen.value = 0;
    if (skullParticleGroup.material.uniforms.uSkullFlash) skullParticleGroup.material.uniforms.uSkullFlash.value = 0;
  }
}
function resetSkullPresetView(immediate, opts) {
  opts = opts || {};
  if (!(fx && fx.preset === SKULL_PRESET_INDEX)) return;
  skullWheelZoomTarget = 0;
  if (!opts.smooth) skullWheelZoom = 0;
  skullCameraBlend = Math.max(skullCameraBlend, 1);
  if (!opts.keepLyricLock && typeof stageLyrics !== 'undefined' && stageLyrics && stageLyrics.group && stageLyrics.group.userData) stageLyrics.group.userData.skullMouthLocked = false;
  if (!opts.keepLyricLock && typeof requestStageLyricCameraSnap === 'function') requestStageLyricCameraSnap(10);
  if (!immediate || !skullParticleGroup) return;
  var shelfComposition = isSkullShelfCompositionActive();
  skullShelfCameraMix = shelfComposition ? 1 : 0;
  skullParticleGroup.position.set(shelfComposition ? -1.18 : SKULL_MODEL_BASE_POSITION.x, shelfComposition ? 0.32 : SKULL_MODEL_BASE_POSITION.y, SKULL_MODEL_BASE_POSITION.z);
  skullParticleGroup.scale.setScalar(shelfComposition ? 3.02 : SKULL_MODEL_SCALE);
  skullParticleGroup.rotation.set(SKULL_MODEL_BASE_ROTATION_X, SKULL_MODEL_BASE_ROTATION_Y, 0);
  skullParticleGroup.updateMatrixWorld(true);
  if (camera && typeof setSkullCameraTargetVectors === 'function') {
    var portrait = innerHeight > innerWidth * 1.08;
    setSkullCameraTargetVectors(skullCameraTargetPos, skullCameraTargetLook, portrait, shelfComposition, 0);
    camera.position.copy(skullCameraTargetPos);
    skullCameraMixedLook.copy(skullCameraTargetLook);
    camera.lookAt(skullCameraMixedLook);
    camera.updateProjectionMatrix();
  }
}
function skullBreathOffset(t, shelfComposition) {
  var strength = shelfComposition ? 0.70 : 1.0;
  return {
    x: strength * (Math.sin(t * 0.33 + 1.7) * 0.028 + Math.sin(t * 0.61 + 0.4) * 0.010),
    y: strength * (Math.sin(t * 0.38 + 0.2) * 0.036 + Math.sin(t * 0.83 + 2.1) * 0.012),
    z: strength * (Math.sin(t * 0.24 + 2.6) * 0.026)
  };
}
function setSkullCameraTargetVectors(pos, look, portrait, shelfComposition, zoom) {
  zoom = Number(zoom) || 0;
  if (shelfComposition) {
    pos.set(portrait ? -0.06 : 0.00, portrait ? -2.36 : -2.50, (portrait ? 4.88 : 4.96) + zoom * 0.78);
    look.set(portrait ? -0.04 : 0.00, portrait ? -0.26 : -0.20, 0.03);
    return;
  }
  pos.set(0.00, portrait ? -2.38 : -2.52, (portrait ? 4.92 : 4.98) + zoom);
  look.set(0.00, portrait ? -0.28 : -0.20, 0.02);
}
function applySkullCameraPose(dt) {
  if (freeCamera && (freeCamera.active || freeCamera.locked || freeCamera.resetTween)) return;
  var active = fx && fx.preset === SKULL_PRESET_INDEX;
  skullCameraBlend += ((active ? 1 : 0) - skullCameraBlend) * Math.min(1, dt * (active ? 4.8 : 7.2));
  if (skullCameraBlend < 0.002) return;
  skullWheelZoom += (skullWheelZoomTarget - skullWheelZoom) * Math.min(1, dt * 8.0);
  var portrait = innerHeight > innerWidth * 1.08;
  var shelfComposition = isSkullShelfCompositionActive();
  var shelfMixTarget = shelfComposition ? 1 : 0;
  skullShelfCameraMix += (shelfMixTarget - skullShelfCameraMix) * Math.min(1, dt * (shelfMixTarget > skullShelfCameraMix ? 4.6 : 5.8));
  if (Math.abs(skullShelfCameraMix - shelfMixTarget) < 0.002) skullShelfCameraMix = shelfMixTarget;
  setSkullCameraTargetVectors(skullCameraBasePos, skullCameraBaseLook, portrait, false, skullWheelZoom);
  setSkullCameraTargetVectors(skullCameraShelfPos, skullCameraShelfLook, portrait, true, skullWheelZoom);
  skullCameraTargetPos.copy(skullCameraBasePos).lerp(skullCameraShelfPos, skullShelfCameraMix);
  skullCameraTargetLook.copy(skullCameraBaseLook).lerp(skullCameraShelfLook, skullShelfCameraMix);
  camera.position.lerp(skullCameraTargetPos, skullCameraBlend);
  skullCameraMixedLook.set(orbit.lookAt.x, orbit.lookAt.y, orbit.lookAt.z).lerp(skullCameraTargetLook, skullCameraBlend);
  camera.lookAt(skullCameraMixedLook);
  camera.updateProjectionMatrix();
}
function updateSkullParticleLayer(dt) {
  var active = fx && fx.preset === SKULL_PRESET_INDEX;
  if (active && !skullParticleAsset.data && !skullParticleAsset.failed) {
    loadSkullParticleAsset();
    return;
  }
  if (active && !skullParticleAsset.data) return;
  if (active) createSkullParticleLayer();
  if (!skullParticleGroup) return;
  var target = active ? 1 : 0;
  skullParticleOpacity += (target - skullParticleOpacity) * Math.min(1, dt * (active ? 3.2 : 2.4));
  if (skullParticleOpacity < 0.006 && !active) {
    skullParticleGroup.visible = false;
    return;
  }
  skullParticleGroup.visible = true;
  skullParticleGroup.material.uniforms.uOpacity.value = skullParticleOpacity * clampRange(0.78 + (fx.intensity || 0.85) * 0.18, 0.56, 1.0);
  var beatTransient = clampRange(Math.max(0, beatPulse - 0.16) / 0.84, 0, 1.35);
  var flashTarget = clampRange(Math.pow(beatTransient, 1.34) * 1.08 + Math.max(0, bass - 0.60) * 0.18 * beatTransient, 0, 1);
  skullBeatFlash += (flashTarget - skullBeatFlash) * Math.min(1, dt * (flashTarget > skullBeatFlash ? 24.0 : 6.2));
  if (skullParticleGroup.material.uniforms.uSkullFlash) skullParticleGroup.material.uniforms.uSkullFlash.value = skullBeatFlash;
  var jawTarget = clampRange(0.60 + (0.5 + 0.5 * Math.sin(uniforms.uTime.value * 0.50)) * 0.050 + bass * 0.060 + skullBeatFlash * 0.090, 0.52, 0.88);
  skullJawOpen += (jawTarget - skullJawOpen) * Math.min(1, dt * (jawTarget > skullJawOpen ? 7.8 : 3.4));
  if (skullParticleGroup.material.uniforms.uJawOpen) skullParticleGroup.material.uniforms.uJawOpen.value = skullJawOpen;
  var shelfComposition = isSkullShelfCompositionActive();
  var shelfMix = clampRange(skullShelfCameraMix || (shelfComposition ? 1 : 0), 0, 1);
  var drift = skullBreathOffset(uniforms.uTime.value, shelfComposition);
  var ampTarget = clampRange(bass * 0.006 + mid * 0.004 + skullBeatFlash * 0.070, 0, 0.090);
  skullAmpPulse += (ampTarget - skullAmpPulse) * Math.min(1, dt * (ampTarget > skullAmpPulse ? 11.0 : 4.0));
  var shelfScale = 3.02;
  var targetScale = (SKULL_MODEL_SCALE + (shelfScale - SKULL_MODEL_SCALE) * shelfMix) * (1 + skullAmpPulse) * clampRange(1 - skullWheelZoom * 0.055, 0.92, 1.08);
  var shelfX = -1.18;
  var shelfY = 0.32;
  var targetX = (SKULL_MODEL_BASE_POSITION.x + (shelfX - SKULL_MODEL_BASE_POSITION.x) * shelfMix) + drift.x;
  var targetY = (SKULL_MODEL_BASE_POSITION.y + (shelfY - SKULL_MODEL_BASE_POSITION.y) * shelfMix) + drift.y;
  var targetZ = SKULL_MODEL_BASE_POSITION.z + drift.z;
  skullParticleGroup.position.x += (targetX - skullParticleGroup.position.x) * Math.min(1, dt * 4.2);
  skullParticleGroup.position.y += (targetY - skullParticleGroup.position.y) * Math.min(1, dt * 4.8);
  skullParticleGroup.position.z += (targetZ - skullParticleGroup.position.z) * Math.min(1, dt * 4.2);
  skullParticleGroup.scale.x += (targetScale - skullParticleGroup.scale.x) * Math.min(1, dt * 4.6);
  skullParticleGroup.scale.y = skullParticleGroup.scale.x;
  skullParticleGroup.scale.z = skullParticleGroup.scale.x;
  var targetRotY = SKULL_MODEL_BASE_ROTATION_Y + (orbit.centerLocked ? 0 : (headParallax.active ? headParallax.x * 0.5 : 0) + gestureRotation.y);
  var targetRotX = SKULL_MODEL_BASE_ROTATION_X + (orbit.centerLocked ? 0 : (headParallax.active ? -headParallax.y * 0.35 : 0) + gestureRotation.x);
  var rotEase = Math.min(1, dt * 7.4);
  skullParticleGroup.rotation.y += (targetRotY - skullParticleGroup.rotation.y) * rotEase;
  skullParticleGroup.rotation.x += (targetRotX - skullParticleGroup.rotation.x) * rotEase;
  skullParticleGroup.rotation.z += (0 - skullParticleGroup.rotation.z) * Math.min(1, dt * 6.0);
}

// ============================================================
//  封面背面粒子层 (v7.2)
//   - 独立 Points, 放在 z=-1.5 (主封面平面背面)
//   - 颜色取自封面镜像 UV
//   - 慢呼吸 + 小幅 noise 漂移
//   - 跟主粒子同步旋转 (在主循环里赋值)
//   - 视角转到背面才能看到 — 不需要手动控制 visible
// ============================================================
var BACK_COVER_COUNT = 3000;
var backCoverGroup = null;
var backCoverColorArr = null;

function createBackCoverLayer() {
  if (backCoverGroup) return;
  var bg = new THREE.BufferGeometry();
  var bp = new Float32Array(BACK_COVER_COUNT * 3);
  var bc = new Float32Array(BACK_COVER_COUNT * 3);
  var br = new Float32Array(BACK_COVER_COUNT);
  var bu = new Float32Array(BACK_COVER_COUNT * 2);  // 镜像 UV 用于采样封面
  for (var i = 0; i < BACK_COVER_COUNT; i++) {
    var u = Math.random();
    var v = Math.random();
    // 在 PLANE_SIZE 范围内分布
    bp[i*3]   = (u - 0.5) * PLANE_SIZE;
    bp[i*3+1] = (v - 0.5) * PLANE_SIZE;
    bp[i*3+2] = -1.5 - Math.random() * 0.4;  // 在主平面后方
    bu[i*2]   = 1.0 - u;  // 镜像 X
    bu[i*2+1] = v;
    br[i] = Math.random();
    bc[i*3] = 0.7; bc[i*3+1] = 0.6; bc[i*3+2] = 0.8;  // 占位
  }
  bg.setAttribute('position', new THREE.BufferAttribute(bp, 3));
  bg.setAttribute('aColor',   new THREE.BufferAttribute(bc, 3));
  bg.setAttribute('aRand',    new THREE.BufferAttribute(br, 1));
  bg.setAttribute('aUv',      new THREE.BufferAttribute(bu, 2));

  var vs = `
    precision highp float;
    uniform float uTime, uBass, uPixel, uAlpha;
    attribute vec3 aColor;
    attribute vec2 aUv;
    attribute float aRand;
    varying vec3 vC;
    varying float vA;
    void main(){
      vec3 pos = position;
      // 缓慢呼吸
      pos.x += sin(uTime * 0.20 + aRand * 8.0) * 0.20;
      pos.y += cos(uTime * 0.18 + aRand * 6.0) * 0.22;
      pos.z += sin(uTime * 0.12 + aRand * 5.0) * 0.18 + uBass * 0.12 * sin(aRand * 11.0);
      vC = aColor;
      vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
      float dist = -mvPos.z;
      vA = clamp(0.30 + 0.4 * sin(uTime * 0.6 + aRand * 5.0), 0.10, 0.65);
      float sz = clamp(46.0 / max(0.5, dist), 1.4, 4.5);
      gl_PointSize = sz * uPixel;
      gl_Position = projectionMatrix * mvPos;
    }
  `;
  var fs = `
    precision highp float;
    uniform sampler2D uDotTex;
    uniform float uAlpha;
    varying vec3 vC;
    varying float vA;
    void main(){
      vec4 tex = texture2D(uDotTex, gl_PointCoord);
      if (tex.a < 0.02) discard;
      gl_FragColor = vec4(vC, tex.a * vA * uAlpha);
    }
  `;
  var mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: uniforms.uTime,
      uBass: uniforms.uBass,
      uPixel: uniforms.uPixel,
      uDotTex: uniforms.uDotTex,
      uAlpha: uniforms.uAlpha,
    },
    vertexShader: vs, fragmentShader: fs,
    transparent:true, depthWrite:false, blending: THREE.NormalBlending,
  });
  backCoverGroup = new THREE.Points(bg, mat);
  backCoverGroup.frustumCulled = false;
  backCoverColorArr = bc;
  scene.add(backCoverGroup);
}

function destroyBackCoverLayer() {
  if (!backCoverGroup) return;
  scene.remove(backCoverGroup);
  backCoverGroup.geometry.dispose(); backCoverGroup.material.dispose();
  backCoverGroup = null; backCoverColorArr = null;
}

function refreshBackCoverColorsFromCanvas(coverCanvas) {
  if (!backCoverGroup || !coverCanvas || !backCoverColorArr) return;
  var ctx = coverCanvas.getContext('2d');
  var img = ctx.getImageData(0, 0, coverCanvas.width, coverCanvas.height).data;
  var w = coverCanvas.width, h = coverCanvas.height;
  var attr = backCoverGroup.geometry.attributes;
  var uvA = attr.aUv.array;
  for (var i = 0; i < BACK_COVER_COUNT; i++) {
    var u = uvA[i*2], v = uvA[i*2+1];
    var sx = Math.floor(u * w);
    var sy = Math.floor(v * h);
    var di = (sy * w + sx) * 4;
    backCoverColorArr[i*3]   = img[di]   / 255 * 0.85;
    backCoverColorArr[i*3+1] = img[di+1] / 255 * 0.85;
    backCoverColorArr[i*3+2] = img[di+2] / 255 * 0.85;
  }
  attr.aColor.needsUpdate = true;
}
function updateFloatLayer(dt) {
  // 漂移已在 shader 中完成, JS 不需要每帧改 buffer
}
function refreshFloatColorsFromCover(coverCanvas) {
  if (!floatGroup || !coverCanvas) return;
  var ctx = coverCanvas.getContext('2d');
  var img = ctx.getImageData(0, 0, coverCanvas.width, coverCanvas.height).data;
  var w = coverCanvas.width, h = coverCanvas.height;
  for (var i = 0; i < FLOAT_COUNT; i++) {
    var sx = Math.floor(Math.random() * w);
    var sy = Math.floor(Math.random() * h);
    var di = (sy * w + sx) * 4;
    floatColorArr[i*3]   = img[di]   / 255 * 0.95;
    floatColorArr[i*3+1] = img[di+1] / 255 * 0.95;
    floatColorArr[i*3+2] = img[di+2] / 255 * 0.95;
  }
  floatGroup.geometry.attributes.aColor.needsUpdate = true;
}
function resetFloatColorsToIdle() {
  if (!floatGroup || !floatColorArr) return;
  for (var i = 0; i < FLOAT_COUNT; i++) {
    var white = 0.88 + (i % 17) / 17 * 0.12;
    floatColorArr[i*3] = white;
    floatColorArr[i*3+1] = white;
    floatColorArr[i*3+2] = white;
  }
  floatGroup.geometry.attributes.aColor.needsUpdate = true;
}

// ============================================================
//  舞台歌词系统 v9 — Three.js 文字平面, 跟随专辑粒子 3D 运动
// ============================================================
var stageLyrics = {
  group: null,
  current: null,
  outgoing: [],
  currentIdx: -1,
  currentText: '',
  highBloom: 0,
  beatGlow: 0,
  glowFollowX: 0,
  glowFollowY: 0,
  glowFollowRoll: 0,
  palette: {
    primary: '#d6f8ff',
    secondary: '#9cffdf',
    highlight: '#eef7ff',
    shadow: 'rgba(2,8,12,0.42)',
    glow: 'rgba(143,233,255,0.34)',
  },
  coverPalette: {
    primary: '#d6f8ff',
    secondary: '#9cffdf',
    highlight: '#eef7ff',
    shadow: 'rgba(2,8,12,0.42)',
    glow: 'rgba(143,233,255,0.34)',
  },
  starRiver: null,
  starRiverWidth: 4.2,
  starRiverHeight: 0.58,
  lockFitScale: 1,
  snapCameraLockFrames: 0,
};
var lyricSunColor = new THREE.Color(0xffe6a4);
var lyricSunHotColor = new THREE.Color(0xfff4cc);
var lyricCameraDir = new THREE.Vector3();
var lyricCameraRight = new THREE.Vector3();
var lyricCameraUp = new THREE.Vector3();
var lyricCameraTarget = new THREE.Vector3();
var lyricLayoutBase = new THREE.Vector3();
var lyricLayoutTarget = new THREE.Vector3();
var lyricCoverWorldPos = new THREE.Vector3();
var lyricCoverWorldQuat = new THREE.Quaternion();
var lyricBaseEuler = new THREE.Euler(0, 0, 0, 'YXZ');
var lyricTiltEuler = new THREE.Euler(0, 0, 0, 'YXZ');
var lyricBaseQuat = new THREE.Quaternion();
var lyricTiltQuat = new THREE.Quaternion();
var lyricTargetQuat = new THREE.Quaternion();
var LYRIC_CAMERA_LOCK_MAX_SCALE = 0.80;
function setStageLyricViewBasisFromCameraOrQuaternion(fallbackQuat) {
  if (fallbackQuat) {
    lyricCameraDir.set(0, 0, 1).applyQuaternion(fallbackQuat);
    lyricCameraRight.set(1, 0, 0).applyQuaternion(fallbackQuat);
    lyricCameraUp.set(0, 1, 0).applyQuaternion(fallbackQuat);
  } else if (camera) {
    camera.getWorldDirection(lyricCameraDir);
    lyricCameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    lyricCameraUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
  } else {
    lyricCameraDir.set(0, 0, 1);
    lyricCameraRight.set(1, 0, 0);
    lyricCameraUp.set(0, 1, 0);
  }
  lyricCameraDir.normalize();
  lyricCameraRight.normalize();
  lyricCameraUp.normalize();
}
function applyStageLyricLayoutOffset(target, x, y, z) {
  return target
    .addScaledVector(lyricCameraRight, x || 0)
    .addScaledVector(lyricCameraUp, y || 0)
    .addScaledVector(lyricCameraDir, z || 0);
}
function stageLyricTargetQuaternion(baseQuat, tiltX, tiltY) {
  lyricTiltEuler.set((tiltX || 0) * Math.PI / 180, (tiltY || 0) * Math.PI / 180, 0, 'YXZ');
  lyricTiltQuat.setFromEuler(lyricTiltEuler);
  return lyricTargetQuat.copy(baseQuat || lyricBaseQuat).multiply(lyricTiltQuat);
}
function getStageLyricLockBounds() {
  var maxW = 0, maxH = 0;
  function take(mesh) {
    if (!mesh || !mesh.userData || !mesh.userData.lyric) return;
    var d = mesh.userData.lyric;
    var meshScale = Math.max(mesh.scale && isFinite(mesh.scale.x) ? mesh.scale.x : 1, mesh.scale && isFinite(mesh.scale.y) ? mesh.scale.y : 1);
    maxW = Math.max(maxW, (d.textWorldW || d.worldW || 6.1) * meshScale);
    maxH = Math.max(maxH, (d.textWorldH || d.worldH || 1.0) * meshScale);
  }
  take(stageLyrics.current);
  for (var i = 0; i < stageLyrics.outgoing.length; i++) take(stageLyrics.outgoing[i]);
  return { w: maxW || 5.4, h: maxH || 0.78 };
}
function lyricCameraLockFit(layoutScale, layoutX, layoutY, distance) {
  if (!camera || !camera.isPerspectiveCamera) return 1;
  layoutScale = Math.max(0.1, layoutScale || 1);
  var fov = (camera.fov || 45) * Math.PI / 180;
  var dist = Math.max(1.4, distance || 4.85);
  var visibleH = 2 * Math.tan(fov * 0.5) * dist;
  var visibleW = visibleH * (camera.aspect || (innerWidth / Math.max(1, innerHeight)) || 1.78);
  var bounds = getStageLyricLockBounds();
  var skullSafe = !!(fx && fx.preset === SKULL_PRESET_INDEX);
  var safeW = Math.max(visibleW * (skullSafe ? 0.36 : 0.42), visibleW * (skullSafe ? 0.70 : 0.84) - Math.abs(layoutX || 0) * (skullSafe ? 1.36 : 1.22));
  var safeH = Math.max(visibleH * (skullSafe ? 0.16 : 0.18), visibleH * (skullSafe ? 0.34 : 0.44) - Math.abs(layoutY || 0) * (skullSafe ? 0.98 : 0.82));
  var scaledW = Math.max(0.01, bounds.w * layoutScale);
  var scaledH = Math.max(0.01, bounds.h * layoutScale);
  var viewportFit = Math.min(1, safeW / scaledW, safeH / scaledH);
  var lockScaleCap = Math.min(1, (skullSafe ? 0.94 : LYRIC_CAMERA_LOCK_MAX_SCALE) / layoutScale);
  return clampRange(Math.min(viewportFit, lockScaleCap), skullSafe ? 0.36 : 0.42, 1);
}
// 兼容旧变量名以便其它代码不破坏
var lyricsParticles = null;
var lyricsGeo = null;

// 三个 attribute: 源位置(随机扩散态), 目标位置(组成字), color, brightness
var lyricsAttrTargetA = null;
var lyricsAttrTargetB = null;
var lyricsAttrSeed = null;

function createLyricsParticles() {
  if (stageLyrics.group) {
    ensureLyricStarRiver();
    return;
  }
  stageLyrics.group = new THREE.Group();
  stageLyrics.group.renderOrder = 38;
  scene.add(stageLyrics.group);
  ensureLyricStarRiver();
}

function ensureLyricStarRiver() {
  if (!stageLyrics.group || stageLyrics.starRiver) return stageLyrics.starRiver;
  var count = 420;
  var geo = new THREE.BufferGeometry();
  var seeds = new Float32Array(count);
  var lanes = new Float32Array(count);
  var depths = new Float32Array(count);
  for (var i = 0; i < count; i++) {
    seeds[i] = Math.random() * 1000;
    lanes[i] = Math.random();
    depths[i] = Math.random();
  }
  geo.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
  geo.setAttribute('lane', new THREE.BufferAttribute(lanes, 1));
  geo.setAttribute('depthSeed', new THREE.BufferAttribute(depths, 1));
  var mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: dotTexture },
      uTime: uniforms.uTime,
      uPixel: uniforms.uPixel,
      uBass: uniforms.uBass,
      uBeat: uniforms.uBeat,
      uWidth: { value: stageLyrics.starRiverWidth || 4.2 },
      uHeight: { value: stageLyrics.starRiverHeight || 0.58 },
      uOpacity: { value: 0 },
      uColorA: { value: lyricThreeColor(stageLyrics.palette.secondary, '#9cffdf', 0.42) },
      uColorB: { value: lyricThreeColor(stageLyrics.palette.highlight, '#fff7d2', 0.44) }
    },
    vertexShader: [
      'precision highp float;',
      'attribute float seed,lane,depthSeed;',
      'uniform float uTime,uPixel,uBass,uBeat,uWidth,uHeight;',
      'varying float vSeed,vLane,vGlow;',
      'float hash(float n){return fract(sin(n)*43758.5453123);}',
      'void main(){',
      '  float laneBand = floor(lane * 5.0);',
      '  float laneLocal = fract(lane * 5.0);',
      '  float speed = 0.030 + hash(seed * 1.71) * 0.055 + laneBand * 0.005;',
      '  float flow = fract(hash(seed * 2.13) + uTime * speed);',
      '  float x = (flow - 0.5) * uWidth * (1.08 + hash(seed * 5.1) * 0.18);',
      '  float curve = sin(flow * 6.2831853 * (0.92 + hash(seed * 4.0) * 0.46) + seed * 0.071 + uTime * 0.34);',
      '  float breath = sin(uTime * (0.42 + hash(seed * 6.9) * 0.42) + seed * 0.093);',
      '  float y = (laneBand - 2.0) * uHeight * 0.135 + curve * uHeight * (0.20 + hash(seed * 9.0) * 0.18) + (laneLocal - 0.5) * uHeight * 0.16 + breath * uHeight * 0.10;',
      '  float z = -0.08 + (depthSeed - 0.5) * 0.44 + sin(uTime * (0.18 + hash(seed) * 0.24) + seed) * 0.08;',
      '  vec3 pos = vec3(x, y, z);',
      '  float edge = smoothstep(0.0, 0.18, flow) * (1.0 - smoothstep(0.82, 1.0, flow));',
      '  vSeed = seed;',
      '  vLane = lane;',
      '  vGlow = edge * (0.62 + 0.38 * sin(uTime * (0.9 + hash(seed * 8.0) * 0.7) + seed));',
      '  vec4 mv = modelViewMatrix * vec4(pos, 1.0);',
      '  float dist = max(0.45, -mv.z);',
      '  float size = (0.030 + hash(seed * 12.0) * 0.040 + vGlow * 0.024 + uBeat * 0.010) * (1.0 + uBass * 0.18);',
      '  gl_PointSize = clamp(size * uPixel * 120.0 / dist, 1.0, 7.2);',
      '  gl_Position = projectionMatrix * mv;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'precision highp float;',
      'uniform sampler2D uMap;',
      'uniform vec3 uColorA,uColorB;',
      'uniform float uOpacity,uTime,uBeat;',
      'varying float vSeed,vLane,vGlow;',
      'void main(){',
      '  vec4 tex = texture2D(uMap, gl_PointCoord);',
      '  if(tex.a < 0.02) discard;',
      '  float tw = pow(0.5 + 0.5 * sin(uTime * (0.55 + fract(vSeed) * 0.35) + vSeed), 4.0);',
      '  vec3 col = mix(uColorA, uColorB, smoothstep(0.12, 0.92, vLane) * 0.45 + tw * 0.42 + vGlow * 0.26);',
      '  float alpha = tex.a * uOpacity * (0.20 + vGlow * 0.78 + tw * 0.32 + uBeat * 0.10);',
      '  gl_FragColor = vec4(col * (0.82 + vGlow * 0.72 + tw * 0.32), alpha);',
      '}'
    ].join('\n'),
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending
  });
  var points = new THREE.Points(geo, mat);
  points.renderOrder = 45;
  points.frustumCulled = false;
  points.position.set(0, 0.20, 1.53);
  stageLyrics.group.add(points);
  stageLyrics.starRiver = points;
  return points;
}

function updateLyricStarRiver(dt) {
  var river = ensureLyricStarRiver();
  if (!river || !river.material || !river.material.uniforms) return;
  if (fx && fx.preset === SKULL_PRESET_INDEX) {
    river.visible = false;
    if (river.material.uniforms.uOpacity) river.material.uniforms.uOpacity.value = 0;
    return;
  }
  var u = river.material.uniforms;
  var data = stageLyrics.current && stageLyrics.current.userData ? stageLyrics.current.userData.lyric : null;
  var targetW = data ? clampRange((data.textWorldW || data.worldW || 4.2) * 1.12 + 0.80, 2.25, 7.20) : 3.4;
  var targetH = data ? clampRange((data.textWorldH || data.worldH || 0.58) * 1.85 + 0.18, 0.52, 1.35) : 0.58;
  stageLyrics.starRiverWidth += (targetW - stageLyrics.starRiverWidth) * Math.min(1, dt * 5.2);
  stageLyrics.starRiverHeight += (targetH - stageLyrics.starRiverHeight) * Math.min(1, dt * 4.6);
  u.uWidth.value = stageLyrics.starRiverWidth;
  u.uHeight.value = stageLyrics.starRiverHeight;
  var lyricGlowStrength = fx.lyricGlow ? Math.min(0.85, Math.max(0, fx.lyricGlowStrength)) : 0;
  var targetOpacity = (stageLyrics.current && fx.lyricGlowParticles)
    ? clampRange(0.22 + lyricGlowStrength * 0.58 + stageLyrics.highBloom * 0.16 + stageLyrics.beatGlow * 0.12, 0.16, 0.86)
    : 0;
  u.uOpacity.value += (targetOpacity - u.uOpacity.value) * (targetOpacity > u.uOpacity.value ? 0.10 : 0.055);
  u.uColorA.value.copy(lyricThreeColor(stageLyrics.palette.secondary || stageLyrics.palette.primary, '#9cffdf', 0.42));
  u.uColorB.value.copy(lyricThreeColor(stageLyrics.palette.highlight || stageLyrics.palette.primary, '#fff7d2', 0.46));
  river.visible = u.uOpacity.value > 0.01 || !!stageLyrics.current;
  var t = uniforms.uTime.value;
  river.position.y += ((0.18 + Math.sin(t * 0.44) * 0.035 + Math.sin(t * 0.91 + 1.7) * 0.018) - river.position.y) * 0.08;
  river.position.z += ((1.54 + Math.cos(t * 0.31) * 0.060) - river.position.z) * 0.08;
  river.rotation.z = Math.sin(t * 0.22) * 0.012;
}

function disposeLyricMesh(mesh) {
  if (!mesh) return;
  if (mesh.parent) mesh.parent.remove(mesh);
  mesh.traverse(function(obj){
    if (obj.material) {
      if (Array.isArray(obj.material)) {
        obj.material.forEach(function(m){ if (m.map) m.map.dispose(); m.dispose(); });
      } else {
        if (obj.material.map) obj.material.map.dispose();
        if (obj.material.uniforms && obj.material.uniforms.uMap && obj.material.uniforms.uMap.value) obj.material.uniforms.uMap.value.dispose();
        obj.material.dispose();
      }
    }
    if (obj.geometry) obj.geometry.dispose();
  });
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  var max = Math.max(r, g, b), min = Math.min(r, g, b);
  var h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    var d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return { h:h, s:s, l:l };
}
function hslToRgb(h, s, l) {
  function hue2rgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  }
  var r, g, b;
  if (s === 0) r = g = b = l;
  else {
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return { r:Math.round(r * 255), g:Math.round(g * 255), b:Math.round(b * 255) };
}
function rgbCss(c, a) {
  if (a == null) return 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')';
  return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')';
}
function clampRange(v, min, max) { return Math.max(min, Math.min(max, v)); }
function normalizeCoverResolution(v) {
  return clampRange(Number(v) || 1, 0.75, 1.55);
}
function normalizePerformanceBackgroundMode(v, liveKeepFallback) {
  var value = String(v || '');
  if (value === 'keep' || liveKeepFallback === true) return 'keep';
  if (value === 'release') return 'release';
  return 'auto';
}
function normalizePerformanceQuality(v) {
  var value = String(v || '');
  return /^(eco|balanced|high|ultra)$/.test(value) ? value : fxDefaults.performanceQuality;
}
function coverParticleGridForResolution(v) {
  var grid = Math.round(118 * normalizeCoverResolution(v));
  grid = Math.max(88, Math.min(183, grid));
  return grid % 2 ? grid : grid + 1;
}
function coverParticleCountLabel(v) {
  var grid = coverParticleGridForResolution(v);
  return grid + 'x' + grid;
}
function coverTextureSizeForResolution(v) {
  v = normalizeCoverResolution(v);
  if (v >= 1.32) return 512;
  if (v >= 1.10) return 384;
  return 256;
}
function readSavedLyricLayout() {
  try {
    var savedLayoutRaw = localStorage.getItem(LYRIC_LAYOUT_STORE_KEY);
    var raw = savedLayoutRaw ? (JSON.parse(savedLayoutRaw) || {}) : packagedDefaultLyricLayoutRaw();
    var savedPreset = clampRange(Number(raw.preset) || 0, 0, 6);
    if (savedPreset === 3 && raw.visualPresetSchema !== VISUAL_PRESET_SCHEMA) {
      savedPreset = 5;
    }
    var savedBgColor = normalizeHexColor(raw.backgroundColor || '#000000', '#000000');
    var savedBgOpacity = clampRange(raw.backgroundOpacity == null ? fxDefaults.backgroundOpacity : Number(raw.backgroundOpacity), 0, 1);
    var savedGlassOffset = clampRange(raw.controlGlassChromaticOffset == null ? fxDefaults.controlGlassChromaticOffset : Number(raw.controlGlassChromaticOffset), 0, 140);
    var savedBgMode = /^(cover|custom)$/.test(String(raw.backgroundColorMode || '')) ? String(raw.backgroundColorMode) : '';
    var savedBgCustom = savedBgMode
      ? savedBgMode === 'custom'
      : (raw.backgroundColorCustom === true || (raw.backgroundColorCustom !== false && savedBgColor !== '#000000') || savedBgOpacity < 1);
    var desktopLyricsSchemaReady = raw.desktopLyricsSchema === 'desktop-lyrics-v3';
    var savedShelfCameraMode = normalizeShelfCameraMode(raw.shelfCameraMode || fxDefaults.shelfCameraMode);
    var savedShelfAngleManual = raw.shelfAngleYManual === true;
    var savedShelfAngle = savedShelfAngleManual
      ? clampRange(raw.shelfAngleY == null ? shelfDefaultAngleForCameraMode(savedShelfCameraMode) : Number(raw.shelfAngleY), -30, 30)
      : shelfDefaultAngleForCameraMode(savedShelfCameraMode);
    return {
      preset: savedPreset,
      intensity: clampRange(Number(raw.intensity) || fxDefaults.intensity, 0.2, 1.6),
      cinemaShake: clampRange(Number(raw.cinemaShake) || fxDefaults.cinemaShake, 0, 1.8),
      depth: clampRange(Number(raw.depth) || fxDefaults.depth, 0.2, 1.8),
      point: clampRange(Number(raw.point) || fxDefaults.point, 0.5, 2.2),
      speed: clampRange(Number(raw.speed) || fxDefaults.speed, 0.2, 2.5),
      twist: clampRange(Number(raw.twist) || fxDefaults.twist, 0, 0.6),
      color: clampRange(Number(raw.color) || fxDefaults.color, 0.5, 2.0),
      scatter: clampRange(Number(raw.scatter) || fxDefaults.scatter, 0, 0.5),
      bgFade: clampRange(Number(raw.bgFade) || fxDefaults.bgFade, 0, 1.2),
      bloomStrength: clampRange(Number(raw.bloomStrength) || fxDefaults.bloomStrength, 0, 1.6),
      lyricGlowStrength: clampRange(Number(raw.lyricGlowStrength) || fxDefaults.lyricGlowStrength, 0, 0.85),
      lyricScale: clampRange(Number(raw.lyricScale) || 1, 0.35, 1.65),
      lyricOffsetX: clampRange(Number(raw.lyricOffsetX) || 0, -2.0, 2.0),
      lyricOffsetY: clampRange(Number(raw.lyricOffsetY) || 0, -1.2, 1.35),
      lyricOffsetZ: clampRange(Number(raw.lyricOffsetZ) || 0, -1.6, 1.6),
      lyricTiltX: clampRange(Number(raw.lyricTiltX) || 0, -42, 42),
      lyricTiltY: clampRange(Number(raw.lyricTiltY) || 0, -42, 42),
      lyricCameraLock: !!raw.lyricCameraLock,
      lyricColorMode: raw.lyricColorMode === 'custom' ? 'custom' : 'auto',
      lyricColor: normalizeHexColor(raw.lyricColor || '#a9b8c8'),
      lyricHighlightMode: raw.lyricHighlightMode === 'custom' ? 'custom' : 'auto',
      lyricHighlightColor: normalizeHexColor(raw.lyricHighlightColor || '#fff0b8'),
      lyricGlowLinked: raw.lyricGlowLinked !== false,
      lyricGlowColor: normalizeHexColor(raw.lyricGlowColor || '#9db8cf'),
      lyricFont: normalizeLyricFontKey(raw.lyricFont),
      lyricLetterSpacing: clampRange(Number(raw.lyricLetterSpacing) || 0, -0.04, 0.18),
      lyricLineHeight: clampRange(Number(raw.lyricLineHeight) || 1, 0.86, 1.35),
      lyricWeight: clampRange(Number(raw.lyricWeight) || 900, 500, 900),
      lyricGlow: raw.lyricGlow !== false,
      lyricGlowBeat: raw.lyricGlowBeat !== false,
      lyricGlowParticles: !!raw.lyricGlowParticles,
      cinema: raw.cinema !== false,
      bloom: raw.bloom === true,
      edge: raw.edge === true,
      visualTintMode: raw.visualTintMode === 'custom' ? 'custom' : 'auto',
      visualTintColor: normalizeHexColor(raw.visualTintColor || '#9db8cf'),
      uiAccentColor: normalizeHexColor(raw.uiAccentColor || '#00f5d4', '#00f5d4'),
      homeAccentColor: normalizeHexColor(raw.homeAccentColor || '#00f5d4'),
      homeIconColor: normalizeHexColor(raw.homeIconColor || fxDefaults.homeIconColor || '#f4d28a', '#f4d28a'),
      visualIconColor: normalizeHexColor(raw.visualIconColor || fxDefaults.visualIconColor || '#7fd8ff', '#7fd8ff'),
      backgroundColorMode: savedBgCustom ? 'custom' : 'cover',
      backgroundColor: savedBgColor,
      backgroundOpacity: savedBgOpacity,
      controlGlassChromaticOffset: savedGlassOffset,
      backgroundColorCustom: savedBgCustom,
      backgroundImage: normalizeCustomBackgroundImage(raw.backgroundImage),
      backgroundMedia: normalizeCustomBackgroundMedia(raw.backgroundMedia || raw.backgroundImage),
      desktopLyrics: raw.desktopLyrics === true,
      desktopLyricsSize: clampRange(Number(raw.desktopLyricsSize) || fxDefaults.desktopLyricsSize, 0.72, 1.55),
      desktopLyricsOpacity: clampRange(raw.desktopLyricsOpacity == null ? fxDefaults.desktopLyricsOpacity : Number(raw.desktopLyricsOpacity), 0.28, 1),
      desktopLyricsY: clampRange(raw.desktopLyricsY == null ? fxDefaults.desktopLyricsY : Number(raw.desktopLyricsY), 0.08, 0.92),
      desktopLyricsClickThrough: desktopLyricsSchemaReady ? raw.desktopLyricsClickThrough === true : fxDefaults.desktopLyricsClickThrough,
      desktopLyricsCinema: desktopLyricsSchemaReady ? raw.desktopLyricsCinema !== false : fxDefaults.desktopLyricsCinema,
      desktopLyricsHighlight: desktopLyricsSchemaReady ? raw.desktopLyricsHighlight === true : fxDefaults.desktopLyricsHighlight,
      desktopLyricsFps: desktopLyricsSchemaReady ? normalizeDesktopLyricsFps(raw.desktopLyricsFps) : fxDefaults.desktopLyricsFps,
      performanceBackground: normalizePerformanceBackgroundMode(raw.performanceBackground, raw.liveBackgroundKeep === true),
      performanceQuality: normalizePerformanceQuality(raw.performanceQuality),
      liveBackgroundKeep: normalizePerformanceBackgroundMode(raw.performanceBackground, raw.liveBackgroundKeep === true) === 'keep',
      wallpaperMode: false,
      wallpaperOpacity: clampRange(raw.wallpaperOpacity == null ? fxDefaults.wallpaperOpacity : Number(raw.wallpaperOpacity), 0.35, 1),
      coverResolution: normalizeCoverResolution(raw.coverResolution),
      shelf: /^(off|side|stage)$/.test(String(raw.shelf || '')) ? raw.shelf : fxDefaults.shelf,
      shelfCameraMode: savedShelfCameraMode,
      shelfPresence: normalizeShelfPresence(raw.shelfPresence || fxDefaults.shelfPresence),
      shelfShowPodcasts: raw.shelfShowPodcasts !== false,
      shelfMergeCollections: raw.shelfMergeCollections === true,
      shelfSize: clampRange(raw.shelfSize == null ? fxDefaults.shelfSize : Number(raw.shelfSize), 0.65, 1.45),
      shelfOffsetX: clampRange(raw.shelfOffsetX == null ? fxDefaults.shelfOffsetX : Number(raw.shelfOffsetX), -1.2, 1.2),
      shelfOffsetY: clampRange(raw.shelfOffsetY == null ? fxDefaults.shelfOffsetY : Number(raw.shelfOffsetY), -0.9, 0.9),
      shelfOffsetZ: clampRange(raw.shelfOffsetZ == null ? fxDefaults.shelfOffsetZ : Number(raw.shelfOffsetZ), -0.9, 0.9),
      shelfAngleY: savedShelfAngle,
      shelfAngleYManual: savedShelfAngleManual,
      shelfOpacity: clampRange(raw.shelfOpacity == null ? fxDefaults.shelfOpacity : Number(raw.shelfOpacity), 0.25, 1),
      shelfBgOpacity: clampRange(raw.shelfBgOpacity == null ? fxDefaults.shelfBgOpacity : Number(raw.shelfBgOpacity), 0.25, 0.98),
      shelfAccentColor: normalizeHexColor(raw.shelfAccentColor || fxDefaults.shelfAccentColor, fxDefaults.shelfAccentColor),
      cam: /^(off|gesture)$/.test(String(raw.cam || '')) ? raw.cam : fxDefaults.cam
    };
  } catch (e) {
    return {};
  }
}
function saveLyricLayout() {
  try {
    var presetForSave = startupVisualPreviewActive && !playing && currentIdx < 0
      ? playbackVisualPreset
      : clampRange(Number(fx.preset) || 0, 0, presetMeta.length - 1);
    localStorage.setItem(LYRIC_LAYOUT_STORE_KEY, JSON.stringify({
      visualPresetSchema: VISUAL_PRESET_SCHEMA,
      desktopLyricsSchema: 'desktop-lyrics-v3',
      preset: presetForSave,
      intensity: clampRange(Number(fx.intensity) || fxDefaults.intensity, 0.2, 1.6),
      cinemaShake: clampRange(Number(fx.cinemaShake) || fxDefaults.cinemaShake, 0, 1.8),
      depth: clampRange(Number(fx.depth) || fxDefaults.depth, 0.2, 1.8),
      point: clampRange(Number(fx.point) || fxDefaults.point, 0.5, 2.2),
      speed: clampRange(Number(fx.speed) || fxDefaults.speed, 0.2, 2.5),
      twist: clampRange(Number(fx.twist) || fxDefaults.twist, 0, 0.6),
      color: clampRange(Number(fx.color) || fxDefaults.color, 0.5, 2.0),
      scatter: clampRange(Number(fx.scatter) || fxDefaults.scatter, 0, 0.5),
      bgFade: clampRange(Number(fx.bgFade) || fxDefaults.bgFade, 0, 1.2),
      bloomStrength: clampRange(Number(fx.bloomStrength) || fxDefaults.bloomStrength, 0, 1.6),
      lyricGlowStrength: clampRange(Number(fx.lyricGlowStrength) || fxDefaults.lyricGlowStrength, 0, 0.85),
      lyricScale: clampRange(Number(fx.lyricScale) || 1, 0.35, 1.65),
      lyricOffsetX: clampRange(Number(fx.lyricOffsetX) || 0, -2.0, 2.0),
      lyricOffsetY: clampRange(Number(fx.lyricOffsetY) || 0, -1.2, 1.35),
      lyricOffsetZ: clampRange(Number(fx.lyricOffsetZ) || 0, -1.6, 1.6),
      lyricTiltX: clampRange(Number(fx.lyricTiltX) || 0, -42, 42),
      lyricTiltY: clampRange(Number(fx.lyricTiltY) || 0, -42, 42),
      lyricCameraLock: !!fx.lyricCameraLock,
      lyricColorMode: fx.lyricColorMode === 'custom' ? 'custom' : 'auto',
      lyricColor: normalizeHexColor(fx.lyricColor || '#a9b8c8'),
      lyricHighlightMode: fx.lyricHighlightMode === 'custom' ? 'custom' : 'auto',
      lyricHighlightColor: normalizeHexColor(fx.lyricHighlightColor || '#fff0b8'),
      lyricGlowLinked: fx.lyricGlowLinked !== false,
      lyricGlowColor: normalizeHexColor(fx.lyricGlowColor || '#9db8cf'),
      lyricFont: normalizeLyricFontKey(fx.lyricFont),
      lyricLetterSpacing: clampRange(Number(fx.lyricLetterSpacing) || 0, -0.04, 0.18),
      lyricLineHeight: clampRange(Number(fx.lyricLineHeight) || 1, 0.86, 1.35),
      lyricWeight: clampRange(Number(fx.lyricWeight) || 900, 500, 900),
      lyricGlow: !!fx.lyricGlow,
      lyricGlowBeat: !!fx.lyricGlowBeat,
      lyricGlowParticles: !!fx.lyricGlowParticles,
      cinema: !!fx.cinema,
      bloom: !!fx.bloom,
      edge: !!fx.edge,
      visualTintMode: fx.visualTintMode === 'custom' ? 'custom' : 'auto',
      visualTintColor: normalizeHexColor(fx.visualTintColor || '#9db8cf'),
      uiAccentColor: normalizeHexColor(fx.uiAccentColor || '#00f5d4', '#00f5d4'),
      homeAccentColor: normalizeHexColor(fx.homeAccentColor || '#00f5d4'),
      homeIconColor: normalizeHexColor(fx.homeIconColor || '#f4d28a', '#f4d28a'),
      visualIconColor: normalizeHexColor(fx.visualIconColor || '#7fd8ff', '#7fd8ff'),
      backgroundColorMode: fx.backgroundColorMode === 'custom' || fx.backgroundColorCustom ? 'custom' : 'cover',
      backgroundColor: normalizeHexColor(fx.backgroundColor || '#000000', '#000000'),
      backgroundOpacity: clampRange(fx.backgroundOpacity == null ? fxDefaults.backgroundOpacity : Number(fx.backgroundOpacity), 0, 1),
      controlGlassChromaticOffset: clampRange(fx.controlGlassChromaticOffset == null ? fxDefaults.controlGlassChromaticOffset : Number(fx.controlGlassChromaticOffset), 0, 140),
      backgroundColorCustom: fx.backgroundColorMode === 'custom' || !!fx.backgroundColorCustom,
      backgroundImage: normalizeCustomBackgroundImage(fx.backgroundImage),
      backgroundMedia: normalizeCustomBackgroundMedia(fx.backgroundMedia || fx.backgroundImage),
      desktopLyrics: !!fx.desktopLyrics,
      desktopLyricsSize: clampRange(Number(fx.desktopLyricsSize) || fxDefaults.desktopLyricsSize, 0.72, 1.55),
      desktopLyricsOpacity: clampRange(fx.desktopLyricsOpacity == null ? fxDefaults.desktopLyricsOpacity : Number(fx.desktopLyricsOpacity), 0.28, 1),
      desktopLyricsY: clampRange(fx.desktopLyricsY == null ? fxDefaults.desktopLyricsY : Number(fx.desktopLyricsY), 0.08, 0.92),
      desktopLyricsClickThrough: fx.desktopLyricsClickThrough === true,
      desktopLyricsCinema: fx.desktopLyricsCinema !== false,
      desktopLyricsHighlight: fx.desktopLyricsHighlight === true,
      desktopLyricsFps: normalizeDesktopLyricsFps(fx.desktopLyricsFps),
      performanceBackground: normalizePerformanceBackgroundMode(fx.performanceBackground, fx.liveBackgroundKeep === true),
      performanceQuality: normalizePerformanceQuality(fx.performanceQuality),
      liveBackgroundKeep: normalizePerformanceBackgroundMode(fx.performanceBackground, fx.liveBackgroundKeep === true) === 'keep',
      wallpaperMode: false,
      wallpaperOpacity: clampRange(fx.wallpaperOpacity == null ? fxDefaults.wallpaperOpacity : Number(fx.wallpaperOpacity), 0.35, 1),
      coverResolution: normalizeCoverResolution(fx.coverResolution),
      shelf: /^(off|side|stage)$/.test(String(fx.shelf || '')) ? fx.shelf : fxDefaults.shelf,
      shelfCameraMode: normalizeShelfCameraMode(fx.shelfCameraMode || fxDefaults.shelfCameraMode),
      shelfPresence: normalizeShelfPresence(fx.shelfPresence || fxDefaults.shelfPresence),
      shelfShowPodcasts: fx.shelfShowPodcasts !== false,
      shelfMergeCollections: fx.shelfMergeCollections === true,
      shelfSize: clampRange(fx.shelfSize == null ? fxDefaults.shelfSize : Number(fx.shelfSize), 0.65, 1.45),
      shelfOffsetX: clampRange(fx.shelfOffsetX == null ? fxDefaults.shelfOffsetX : Number(fx.shelfOffsetX), -1.2, 1.2),
      shelfOffsetY: clampRange(fx.shelfOffsetY == null ? fxDefaults.shelfOffsetY : Number(fx.shelfOffsetY), -0.9, 0.9),
      shelfOffsetZ: clampRange(fx.shelfOffsetZ == null ? fxDefaults.shelfOffsetZ : Number(fx.shelfOffsetZ), -0.9, 0.9),
      shelfAngleY: clampRange(fx.shelfAngleY == null ? fxDefaults.shelfAngleY : Number(fx.shelfAngleY), -30, 30),
      shelfAngleYManual: fx.shelfAngleYManual === true,
      shelfOpacity: clampRange(fx.shelfOpacity == null ? fxDefaults.shelfOpacity : Number(fx.shelfOpacity), 0.25, 1),
      shelfBgOpacity: clampRange(fx.shelfBgOpacity == null ? fxDefaults.shelfBgOpacity : Number(fx.shelfBgOpacity), 0.25, 0.98),
      shelfAccentColor: normalizeHexColor(fx.shelfAccentColor || fxDefaults.shelfAccentColor, fxDefaults.shelfAccentColor),
      cam: /^(off|gesture)$/.test(String(fx.cam || '')) ? fx.cam : fxDefaults.cam
    }));
  } catch (e) {}
}
function normalizeHexColor(value, fallback) {
  var hex = String(value || '').trim();
  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    hex = '#' + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2) + hex.charAt(3) + hex.charAt(3);
  }
  fallback = /^#[0-9a-f]{6}$/i.test(String(fallback || '')) ? String(fallback).toLowerCase() : '#a9b8c8';
  return /^#[0-9a-f]{6}$/i.test(hex) ? hex.toLowerCase() : fallback;
}
function normalizeDesktopLyricsFps(value) {
  var n = Number(value);
  if (!isFinite(n) || n <= 0) return 0;
  if (n <= 26) return 24;
  if (n <= 45) return 30;
  if (n <= 90) return 60;
  return 120;
}
function normalizeShelfCameraMode(value) {
  return String(value || '') === 'static' ? 'static' : 'dynamic';
}
function shelfDefaultAngleForCameraMode(mode) {
  return normalizeShelfCameraMode(mode) === 'static' ? -15 : 0;
}
function applyShelfCameraDefaultAngle(force) {
  if (!fx) return;
  fx.shelfCameraMode = normalizeShelfCameraMode(fx.shelfCameraMode || fxDefaults.shelfCameraMode);
  if (force || fx.shelfAngleYManual !== true) {
    fx.shelfAngleYManual = false;
    fx.shelfAngleY = shelfDefaultAngleForCameraMode(fx.shelfCameraMode);
  } else {
    fx.shelfAngleY = Math.round(clampRange(Number(fx.shelfAngleY) || 0, -30, 30));
  }
}
function normalizeShelfPresence(value) {
  return String(value || '') === 'always' ? 'always' : 'auto';
}
function normalizedShelfNumber(key, fallback, min, max) {
  var value = fx && fx[key] != null ? Number(fx[key]) : fallback;
  if (!isFinite(value)) value = fallback;
  return clampRange(value, min, max);
}
function shelfSettings() {
  var angleDeg = fx && fx.shelfAngleYManual === true
    ? normalizedShelfNumber('shelfAngleY', shelfDefaultAngleForCameraMode(fx.shelfCameraMode), -30, 30)
    : shelfDefaultAngleForCameraMode(fx && fx.shelfCameraMode);
  return {
    size: normalizedShelfNumber('shelfSize', fxDefaults.shelfSize, 0.65, 1.45),
    x: normalizedShelfNumber('shelfOffsetX', fxDefaults.shelfOffsetX, -1.2, 1.2),
    y: normalizedShelfNumber('shelfOffsetY', fxDefaults.shelfOffsetY, -0.9, 0.9),
    z: normalizedShelfNumber('shelfOffsetZ', fxDefaults.shelfOffsetZ, -0.9, 0.9),
    angle: angleDeg * Math.PI / 180,
    opacity: normalizedShelfNumber('shelfOpacity', fxDefaults.shelfOpacity, 0.25, 1),
    bgOpacity: normalizedShelfNumber('shelfBgOpacity', fxDefaults.shelfBgOpacity, 0.25, 0.98),
    accent: normalizeHexColor((fx && fx.shelfAccentColor) || fxDefaults.shelfAccentColor, fxDefaults.shelfAccentColor)
  };
}
function shelfAlwaysVisible() {
  return !!(fx && normalizeShelfPresence(fx.shelfPresence) === 'always');
}
function shouldUseShelfDynamicCamera(type) {
  if (!/^shelf-/.test(String(type || ''))) return true;
  return !(fx && normalizeShelfCameraMode(fx.shelfCameraMode) === 'static');
}
function shelfAccentHex() {
  return normalizeHexColor((fx && fx.shelfAccentColor) || fxDefaults.shelfAccentColor, fxDefaults.shelfAccentColor);
}
function shelfAccentRgba(alpha, fallback) {
  var rgb = hexToRgb(shelfAccentHex());
  if (!rgb) return fallback || 'rgba(244,210,138,' + alpha + ')';
  return 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + alpha + ')';
}
function rgbToHexColor(r, g, b) {
  function part(v) {
    return Math.max(0, Math.min(255, Math.round(v || 0))).toString(16).padStart(2, '0');
  }
  return '#' + part(r) + part(g) + part(b);
}
function normalizeLyricFontKey(value) {
  value = String(value || 'sans');
  return /^(sans|hei|song|bold-song|stone-song|kai-song|serif-en|gothic|editorial|humanist|round|mono|display)$/.test(value) ? value : 'sans';
}
function lyricFontStackForKey(key) {
  key = normalizeLyricFontKey(key);
  if (key === 'hei') return '"Noto Sans SC","Microsoft YaHei",SimHei,"PingFang SC",sans-serif';
  if (key === 'song') return '"Noto Serif SC","Source Han Serif SC",SimSun,"Songti SC",serif';
  if (key === 'bold-song') return '"Source Han Serif SC Heavy","Source Han Serif SC","Noto Serif SC Black","Noto Serif SC","STZhongsong","SimSun",serif';
  if (key === 'stone-song') return '"FZYaSongS-B-GB","FZCuSong-B09S","Source Han Serif SC Heavy","Noto Serif SC Black","STZhongsong","SimSun",serif';
  if (key === 'kai-song') return '"Kaiti SC","STKaiti","KaiTi","Source Han Serif SC","Noto Serif SC",serif';
  if (key === 'serif-en') return 'Georgia,"Times New Roman","Noto Serif SC","Source Han Serif SC",serif';
  if (key === 'gothic') return '"UnifrakturCook","UnifrakturMaguntia","Old English Text MT","Blackletter","Cinzel Decorative","Noto Serif SC",serif';
  if (key === 'editorial') return '"Didot","Bodoni 72","Libre Baskerville",Georgia,"Noto Serif SC",serif';
  if (key === 'humanist') return '"Avenir Next","Segoe UI","Inter","Noto Sans SC","PingFang SC",sans-serif';
  if (key === 'round') return '"HarmonyOS Sans SC","Microsoft YaHei UI","PingFang SC","Noto Sans SC",sans-serif';
  if (key === 'mono') return '"JetBrains Mono",Consolas,"Noto Sans SC","Microsoft YaHei",monospace';
  if (key === 'display') return '"Alibaba PuHuiTi","Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif';
  return 'Inter,"Noto Sans SC","PingFang SC","Microsoft YaHei",Arial,sans-serif';
}
function lyricFontWeightValue() {
  if (normalizeLyricFontKey(fx && fx.lyricFont) === 'stone-song') return 900;
  return Math.round(clampRange(Number(fx && fx.lyricWeight) || 900, 500, 900) / 50) * 50;
}
function lyricFontCss(fontSize) {
  return lyricFontWeightValue() + ' ' + fontSize + 'px ' + lyricFontStackForKey(fx && fx.lyricFont);
}
function lyricLetterSpacingPx(fontSize) {
  return clampRange(Number(fx && fx.lyricLetterSpacing) || 0, -0.04, 0.18) * Math.max(1, fontSize || 1);
}
function lyricLineHeightFactor() {
  return clampRange(Number(fx && fx.lyricLineHeight) || 1, 0.86, 1.35);
}
function measureTextWithLetterSpacing(ctx, text, spacing) {
  text = String(text || '');
  spacing = Number(spacing) || 0;
  if (!spacing || text.length < 2) return ctx.measureText(text).width;
  var chars = Array.from(text);
  var w = 0;
  for (var i = 0; i < chars.length; i++) {
    w += ctx.measureText(chars[i]).width;
    if (i < chars.length - 1) w += spacing;
  }
  return Math.max(1, w);
}
function lyricMeasureText(ctx, text, fontSize) {
  return measureTextWithLetterSpacing(ctx, text, lyricLetterSpacingPx(fontSize));
}
function drawTextWithLetterSpacing(ctx, text, x, y, spacing, stroke) {
  text = String(text || '');
  spacing = Number(spacing) || 0;
  if (!spacing || text.length < 2) {
    if (stroke) ctx.strokeText(text, x, y);
    else ctx.fillText(text, x, y);
    return;
  }
  var chars = Array.from(text);
  var align = ctx.textAlign || 'left';
  var width = measureTextWithLetterSpacing(ctx, text, spacing);
  var start = x;
  if (align === 'center') start = x - width / 2;
  else if (align === 'right' || align === 'end') start = x - width;
  ctx.textAlign = 'left';
  var cursor = start;
  for (var i = 0; i < chars.length; i++) {
    if (stroke) ctx.strokeText(chars[i], cursor, y);
    else ctx.fillText(chars[i], cursor, y);
    cursor += ctx.measureText(chars[i]).width + (i < chars.length - 1 ? spacing : 0);
  }
  ctx.textAlign = align;
}
function lyricFillText(ctx, text, x, y, fontSize) {
  drawTextWithLetterSpacing(ctx, text, x, y, lyricLetterSpacingPx(fontSize), false);
}
function lyricStrokeText(ctx, text, x, y, fontSize) {
  drawTextWithLetterSpacing(ctx, text, x, y, lyricLetterSpacingPx(fontSize), true);
}
function applyStonePrintTexture(ctx, W, H, fontSize) {
  if (normalizeLyricFontKey(fx && fx.lyricFont) !== 'stone-song') return;
  var size = clampRange(fontSize || 128, 42, 180);
  var bandTop = H * 0.10;
  var bandH = H * 0.80;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';

  var noiseW = 300, noiseH = 110;
  var noise = document.createElement('canvas');
  noise.width = noiseW; noise.height = noiseH;
  var nctx = noise.getContext('2d');
  var img = nctx.createImageData(noiseW, noiseH);
  for (var p = 0; p < noiseW * noiseH; p++) {
    var x0 = p % noiseW;
    var y0 = Math.floor(p / noiseW);
    var vein = Math.sin(x0 * 0.19 + y0 * 0.043) * 0.10 + Math.sin(y0 * 0.31) * 0.06;
    var r = Math.random() + vein;
    var a = 0;
    if (r > 0.82) a = 78 + Math.random() * 92;
    else if (r > 0.62) a = 22 + Math.random() * 54;
    else if (r > 0.48) a = 4 + Math.random() * 24;
    img.data[p * 4] = 255;
    img.data[p * 4 + 1] = 255;
    img.data[p * 4 + 2] = 255;
    img.data[p * 4 + 3] = a;
  }
  nctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 0.34;
  ctx.drawImage(noise, 0, bandTop, W, bandH);

  var chips = Math.round(size * 7.2);
  for (var i = 0; i < chips; i++) {
    var x = Math.random() * W;
    var y = bandTop + Math.random() * bandH;
    var w = 0.7 + Math.random() * (size * 0.052);
    var h = 0.45 + Math.random() * (size * 0.026);
    ctx.globalAlpha = 0.16 + Math.random() * 0.36;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((Math.random() - 0.5) * 0.38);
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.restore();
  }

  ctx.lineCap = 'round';
  for (var s = 0; s < 44; s++) {
    var sx = Math.random() * W;
    var sy = bandTop + Math.random() * bandH;
    ctx.globalAlpha = 0.09 + Math.random() * 0.16;
    ctx.lineWidth = 0.45 + Math.random() * 1.2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + 10 + Math.random() * 86, sy + (Math.random() - 0.5) * 4.8);
    ctx.stroke();
  }

  for (var c = 0; c < 26; c++) {
    var cx = Math.random() * W;
    var cy = bandTop + Math.random() * bandH;
    var radius = 1.8 + Math.random() * (size * 0.060);
    ctx.globalAlpha = 0.08 + Math.random() * 0.18;
    ctx.beginPath();
    ctx.ellipse(cx, cy, radius * (0.7 + Math.random() * 1.4), radius * (0.25 + Math.random() * 0.55), Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
function hexToRgb(hex) {
  hex = normalizeHexColor(hex).slice(1);
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16)
  };
}
function normalizeCustomBackgroundImage(value) {
  var src = String(value || '').trim();
  if (!src) return '';
  if (/^data:image\/(png|jpe?g|webp);base64,/i.test(src)) return src;
  if (/^https?:\/\//i.test(src)) return src;
  return '';
}
function normalizeCustomBackgroundMedia(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    var img = normalizeCustomBackgroundImage(value);
    if (img) return { type: 'image', src: img };
    if (/^data:video\/(mp4|webm|quicktime);base64,/i.test(value) || /^https?:\/\//i.test(value)) return { type: 'video', src: String(value) };
    return null;
  }
  if (typeof value !== 'object') return null;
  var type = value.type === 'video' ? 'video' : (value.type === 'image' ? 'image' : '');
  if (type === 'image') {
    var imageSrc = normalizeCustomBackgroundImage(value.src || value.url || '');
    return imageSrc ? { type: 'image', src: imageSrc } : null;
  }
  if (type === 'video') {
    var src = String(value.src || '').trim();
    var id = String(value.id || '').trim();
    if (!id && !/^data:video\/(mp4|webm|quicktime);base64,/i.test(src) && !/^https?:\/\//i.test(src)) return null;
    return {
      type: 'video',
      id: id,
      src: src,
      name: String(value.name || '').slice(0, 120),
      mime: String(value.mime || '').slice(0, 80),
      size: Math.max(0, Number(value.size) || 0)
    };
  }
  return null;
}
function customBackgroundMediaLabel(media) {
  media = normalizeCustomBackgroundMedia(media);
  if (!media) return '未设置';
  return media.type === 'video' ? '视频已设置' : '图片已设置';
}
var CUSTOM_BG_DB_NAME = 'mineradio-custom-background-v1';
var CUSTOM_BG_STORE = 'media';
var customBgObjectUrl = '';
var customBgApplyToken = 0;
function openCustomBackgroundDb() {
  return new Promise(function(resolve, reject){
    if (!window.indexedDB) { reject(new Error('indexedDB unavailable')); return; }
    var req = indexedDB.open(CUSTOM_BG_DB_NAME, 1);
    req.onupgradeneeded = function(){
      var db = req.result;
      if (!db.objectStoreNames.contains(CUSTOM_BG_STORE)) db.createObjectStore(CUSTOM_BG_STORE, { keyPath: 'id' });
    };
    req.onsuccess = function(){ resolve(req.result); };
    req.onerror = function(){ reject(req.error || new Error('indexedDB open failed')); };
  });
}
async function putCustomBackgroundBlob(id, blob, meta) {
  var db = await openCustomBackgroundDb();
  return new Promise(function(resolve, reject){
    var tx = db.transaction(CUSTOM_BG_STORE, 'readwrite');
    tx.objectStore(CUSTOM_BG_STORE).put(Object.assign({ id: id, blob: blob, savedAt: Date.now() }, meta || {}));
    tx.oncomplete = function(){ db.close(); resolve(); };
    tx.onerror = function(){ db.close(); reject(tx.error || new Error('indexedDB put failed')); };
  });
}
async function getCustomBackgroundBlob(id) {
  var db = await openCustomBackgroundDb();
  return new Promise(function(resolve, reject){
    var tx = db.transaction(CUSTOM_BG_STORE, 'readonly');
    var req = tx.objectStore(CUSTOM_BG_STORE).get(id);
    req.onsuccess = function(){ resolve(req.result && req.result.blob ? req.result.blob : null); };
    req.onerror = function(){ reject(req.error || new Error('indexedDB get failed')); };
    tx.oncomplete = function(){ db.close(); };
  });
}
var colorLabState = { picker: null, id: '', h: 0, s: 1, v: 1, dragging: false };
var COLOR_LAB_PRESETS = [
  { name: '极黑', color: '#000000' },
  { name: '极白', color: '#ffffff' },
  { name: '克莱因蓝', color: '#002fa7' },
  { name: '法拉利红', color: '#f00000' },
  { name: '香槟金', color: '#c8a96a' },
  { name: '孔雀绿', color: '#006b5b' },
  { name: '午夜紫', color: '#2b164f' },
  { name: '银雾', color: '#d9dde2' }
];
function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  var max = Math.max(r, g, b), min = Math.min(r, g, b);
  var d = max - min, h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h: h, s: max === 0 ? 0 : d / max, v: max };
}
function hsvToHex(h, s, v) {
  h = ((h % 1) + 1) % 1; s = clampRange(s, 0, 1); v = clampRange(v, 0, 1);
  var i = Math.floor(h * 6), f = h * 6 - i;
  var p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  var r, g, b;
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    default: r = v; g = p; b = q; break;
  }
  return rgbToHexColor(r * 255, g * 255, b * 255);
}
function applyColorLabValue(hex, silent) {
  hex = normalizeHexColor(hex || '#000000', '#000000');
  var id = colorLabState.id;
  if (id === 'ui-accent-picker') setUiAccentColor(hex, true);
  else if (id === 'visual-tint-picker') setVisualTintCustom(hex, true);
  else if (id === 'home-accent-picker') setHomeAccentColor(hex, true);
  else if (id === 'home-icon-picker') setHomeIconColor(hex, true);
  else if (id === 'visual-icon-picker') setVisualIconColor(hex, true);
  else if (id === 'bg-color-picker') setCustomBackgroundColor(hex, true, true);
  else if (id === 'shelf-accent-picker') setShelfAccentColor(hex, true);
  else if (id === 'lyric-color-picker') setLyricColorCustom(hex, true);
  else if (id === 'lyric-highlight-picker') setLyricHighlightCustom(hex, true);
  else if (id === 'lyric-glow-picker') setLyricGlowCustom(hex, true);
  if (!silent) showToast('颜色: ' + hex.toUpperCase());
}
function syncColorLabUi(hex) {
  hex = normalizeHexColor(hex || '#000000', '#000000');
  var rgb = hexToRgb(hex);
  var hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
  colorLabState.h = hsv.h; colorLabState.s = hsv.s; colorLabState.v = hsv.v;
  var pop = document.getElementById('color-lab-pop');
  var sv = document.getElementById('color-lab-sv');
  var cursor = document.getElementById('color-lab-cursor');
  var hue = document.getElementById('color-lab-hue');
  var hexInput = document.getElementById('color-lab-hex');
  var preview = document.getElementById('color-lab-preview');
  var hueHex = hsvToHex(colorLabState.h, 1, 1);
  if (pop) {
    pop.style.setProperty('--lab-color', hex);
    pop.style.setProperty('--lab-hue', hueHex);
  }
  if (sv) sv.style.setProperty('--lab-hue', hueHex);
  if (cursor) { cursor.style.left = (colorLabState.s * 100).toFixed(2) + '%'; cursor.style.top = ((1 - colorLabState.v) * 100).toFixed(2) + '%'; }
  if (hue) hue.value = Math.round(colorLabState.h * 360);
  if (hexInput) hexInput.value = hex.toUpperCase();
  if (preview) preview.style.setProperty('--lab-color', hex);
}
function closeColorLab() {
  var pop = document.getElementById('color-lab-pop');
  if (pop) pop.classList.remove('show');
  colorLabState.picker = null;
  colorLabState.id = '';
}
function placeFxFloatingPanel(pop, anchor, opts) {
  if (!pop || !anchor || !anchor.getBoundingClientRect) return;
  opts = opts || {};
  var gap = opts.gap == null ? 12 : opts.gap;
  var pad = opts.pad == null ? 14 : opts.pad;
  var rect = anchor.getBoundingClientRect();
  var vw = Math.max(320, window.innerWidth || document.documentElement.clientWidth || 320);
  var vh = Math.max(320, window.innerHeight || document.documentElement.clientHeight || 320);
  var pw = Math.min(pop.offsetWidth || pop.getBoundingClientRect().width || 330, vw - pad * 2);
  var ph = Math.min(pop.offsetHeight || pop.getBoundingClientRect().height || 260, vh - pad * 2);
  var left;
  var top;
  if (vw < 760) {
    left = Math.max(pad, Math.min(vw - pw - pad, rect.left + rect.width / 2 - pw / 2));
    top = rect.bottom + gap;
    if (top + ph > vh - pad) top = Math.max(pad, rect.top - ph - gap);
  } else {
    var roomRight = vw - rect.right - pad;
    var roomLeft = rect.left - pad;
    if (roomRight >= pw + gap || roomRight >= roomLeft) left = rect.right + gap;
    else left = rect.left - pw - gap;
    left = Math.max(pad, Math.min(vw - pw - pad, left));
    top = rect.top + rect.height / 2 - ph / 2;
    top = Math.max(pad, Math.min(vh - ph - pad, top));
  }
  pop.style.left = Math.round(left) + 'px';
  pop.style.top = Math.round(top) + 'px';
  pop.style.transform = 'none';
}
function openColorLabForPicker(picker) {
  var pop = document.getElementById('color-lab-pop');
  if (!picker || !pop) return;
  if (pop.classList.contains('show') && colorLabState.picker === picker) {
    closeColorLab();
    return;
  }
  colorLabState.picker = picker;
  colorLabState.id = picker.id || '';
  var label = picker.closest('.lyric-color-row');
  var title = document.getElementById('color-lab-title');
  if (title) title.textContent = label ? (label.textContent || 'Color').replace(/#[0-9a-f]{6}/ig, '').trim().slice(0, 24) : 'Color';
  syncColorLabUi(picker.value || '#000000');
  var presets = document.getElementById('color-lab-presets');
  if (presets) {
    presets.innerHTML = COLOR_LAB_PRESETS.map(function(p){
      return '<button type="button" title="' + escHtml(p.name) + '" style="--c:' + p.color + '" data-color="' + p.color + '"></button>';
    }).join('');
  }
  pop.classList.add('show');
  placeFxFloatingPanel(pop, label || picker, { gap: 12, pad: 14 });
}
function updateColorLabFromSv(e) {
  var sv = document.getElementById('color-lab-sv');
  if (!sv) return;
  var rect = sv.getBoundingClientRect();
  colorLabState.s = clampRange((e.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
  colorLabState.v = 1 - clampRange((e.clientY - rect.top) / Math.max(1, rect.height), 0, 1);
  var hex = hsvToHex(colorLabState.h, colorLabState.s, colorLabState.v);
  syncColorLabUi(hex);
  applyColorLabValue(hex, true);
}
function bindColorLabPicker(picker) {
  if (!picker || picker._colorLabBound) return;
  picker._colorLabBound = true;
  picker.setAttribute('aria-haspopup', 'dialog');
  picker.setAttribute('data-color-lab-picker', '1');
  function openFromPickerEvent(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    picker._colorLabOpenedAt = Date.now();
    openColorLabForPicker(picker);
  }
  picker.addEventListener('pointerdown', openFromPickerEvent);
  picker.addEventListener('mousedown', function(e){ e.preventDefault(); e.stopPropagation(); });
  picker.addEventListener('click', function(e){
    e.preventDefault();
    e.stopPropagation();
    if (Date.now() - (picker._colorLabOpenedAt || 0) < 260) return;
    openColorLabForPicker(picker);
  });
  picker.addEventListener('keydown', function(e){
    if (e.key === 'Enter' || e.key === ' ') openFromPickerEvent(e);
  });
}
function liftFxFloatingPopups() {
  ['cover-color-pop', 'color-lab-pop', 'cover-color-loupe'].forEach(function(id){
    var el = document.getElementById(id);
    if (el && el.parentElement !== document.body) document.body.appendChild(el);
  });
}
function bindColorLabRows() {
  document.querySelectorAll('.lyric-color-row').forEach(function(row){
    if (!row || row._colorLabRowBound || row.classList.contains('linked')) return;
    var picker = row.querySelector('.lyric-color-picker');
    if (!picker) return;
    row._colorLabRowBound = true;
    row.addEventListener('pointerdown', function(e){
      if (!e || !e.target) return;
      if (e.target.closest('button,.fx-mini-btn,input[type="range"],select,textarea')) return;
      e.preventDefault();
      e.stopPropagation();
      picker._colorLabOpenedAt = Date.now();
      openColorLabForPicker(picker);
    });
  });
}
function repositionFxFloatingPanels() {
  var colorPop = document.getElementById('color-lab-pop');
  if (colorPop && colorPop.classList.contains('show') && colorLabState.picker) {
    placeFxFloatingPanel(colorPop, colorLabState.picker.closest('.lyric-color-row') || colorLabState.picker, { gap: 12, pad: 14 });
  }
  var coverPop = document.getElementById('cover-color-pop');
  if (coverPop && coverPop.classList.contains('show')) {
    placeFxFloatingPanel(coverPop, document.getElementById('visual-tint-auto-btn') || document.getElementById('visual-tint-picker') || coverPop, { gap: 12, pad: 14 });
  }
}
window.addEventListener('resize', function(){
  if (window.requestAnimationFrame) requestAnimationFrame(repositionFxFloatingPanels);
  else repositionFxFloatingPanels();
});
function uiAccentHex(fallback) {
  return normalizeHexColor((fx && fx.uiAccentColor) || fallback || '#00f5d4', fallback || '#00f5d4');
}
function uiAccentRgba(alpha, fallback) {
  var c = hexToRgb(uiAccentHex(fallback));
  return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + (alpha == null ? 1 : alpha) + ')';
}
function readableInkForHex(hex) {
  var c = hexToRgb(hex || '#00f5d4');
  var lum = (c.r * 0.299 + c.g * 0.587 + c.b * 0.114) / 255;
  return lum > 0.54 ? '#06100f' : '#f8fbff';
}
function lyricPaletteFromHex(hex) {
  var c = hexToRgb(hex);
  var hsl = rgbToHsl(c.r, c.g, c.b);
  var neutral = hsl.s < 0.035;
  var s = neutral ? 0 : clampRange(hsl.s * 1.08, 0.14, 0.92);
  var l = hsl.l;
  if (l < 0.11) l = 0.15 + l * 1.18;
  else if (l < 0.28) l = 0.21 + (l - 0.11) * 1.18;
  else l = clampRange(l, 0.30, 0.82);
  l = clampRange(l, 0.14, 0.84);
  var primary = hslToRgb(hsl.h, s, l);
  var secondary = hslToRgb((hsl.h + 0.055) % 1, neutral ? 0 : clampRange(s * 0.88, 0.12, 0.78), clampRange(l + (l < 0.38 ? 0.10 : -0.08), 0.18, 0.76));
  var highlight = hslToRgb((hsl.h + 0.018) % 1, neutral ? 0 : clampRange(s * 0.72, 0.10, 0.70), clampRange(l + 0.22, 0.38, 0.92));
  var darkText = l < 0.40;
  return {
    primary: rgbCss(primary),
    secondary: rgbCss(secondary),
    highlight: rgbCss(highlight),
    shadow: darkText ? 'rgba(0,6,10,0.46)' : 'rgba(248,253,255,0.34)',
    glow: rgbCss(primary, 0.26),
  };
}
function silverBlueLyricPalette() {
  return {
    primary: '#d8f1ff',
    secondary: '#9db8cf',
    highlight: '#eef7ff',
    shadow: 'rgba(0,7,12,0.48)',
    glow: 'rgba(138,190,255,0.26)',
  };
}
function setLyricSparkOpacity(data, value) {
  if (!data || !data.sparkMat) return;
  value = clampRange(Number(value) || 0, 0, 1);
  if (data.sparkMat.uniforms && data.sparkMat.uniforms.uOpacity) data.sparkMat.uniforms.uOpacity.value = value;
  else data.sparkMat.opacity = value;
}
function getLyricSparkOpacity(data) {
  if (!data || !data.sparkMat) return 0;
  if (data.sparkMat.uniforms && data.sparkMat.uniforms.uOpacity) return Number(data.sparkMat.uniforms.uOpacity.value) || 0;
  return Number(data.sparkMat.opacity) || 0;
}
function setLyricSparkSize(data, value) {
  if (!data || !data.sparkMat) return;
  value = Math.max(0.002, Number(value) || 0.035);
  if (data.sparkMat.uniforms && data.sparkMat.uniforms.uSize) data.sparkMat.uniforms.uSize.value = value;
  else data.sparkMat.size = value;
}
function getLyricSparkSize(data) {
  if (!data || !data.sparkMat) return 0.035;
  if (data.sparkMat.uniforms && data.sparkMat.uniforms.uSize) return Number(data.sparkMat.uniforms.uSize.value) || 0.035;
  return Number(data.sparkMat.size) || 0.035;
}
function setLyricSparkColor(data, color) {
  if (!data || !data.sparkMat) return;
  if (data.sparkMat.uniforms && data.sparkMat.uniforms.uColor) data.sparkMat.uniforms.uColor.value.copy(color);
  else if (data.sparkMat.color) data.sparkMat.color.copy(color);
}
function applyLyricPaletteToMesh(mesh) {
  if (!mesh || !mesh.userData || !mesh.userData.lyric) return;
  var pal = stageLyrics.palette || {};
  var data = mesh.userData.lyric;
  if (data.textMat && data.textMat.uniforms) {
    var u = data.textMat.uniforms;
    if (u.uBaseColor) u.uBaseColor.value.copy(lyricThreeColor(pal.primary, '#d6f8ff', 0.38));
    if (u.uHiColor) u.uHiColor.value.copy(lyricThreeColor(pal.highlight || pal.primary, '#fff0b8', 0.48));
    if (u.uGlowColor) u.uGlowColor.value.copy(lyricThreeColor(pal.glowColor || pal.secondary || pal.primary, '#9cffdf', 0.36));
    if (u.uSolarColor) u.uSolarColor.value.copy(lyricThreeColor(pal.highlight || pal.secondary || pal.primary, '#fff0b8', 0.50));
    if (u.uSolar && !isFinite(u.uSolar.value)) u.uSolar.value = 0;
    if (u.uOpacity && !isFinite(u.uOpacity.value)) u.uOpacity.value = 0;
    data.textMat.needsUpdate = true;
  }
  if (data.glowMat) data.glowMat.color.copy(lyricThreeColor(pal.glowColor || pal.secondary || pal.primary, '#9cffdf', 0.36));
  if (data.sparkMat) setLyricSparkColor(data, lyricThreeColor(pal.highlight || pal.secondary || pal.primary, '#fff0b8', 0.46));
  if (data.sunMat) data.sunMat.color.copy(lyricThreeColor(pal.highlight || pal.secondary || pal.primary, '#fff0b8', 0.50));
}
function effectiveLyricPalette(pal) {
  var src = pal || stageLyrics.coverPalette || stageLyrics.palette || {};
  var out = {
    primary: src.primary || '#d6f8ff',
    secondary: src.secondary || '#9cffdf',
    highlight: src.highlight || '#eef7ff',
    shadow: src.shadow || 'rgba(2,8,12,0.42)',
    glow: src.glow || 'rgba(143,233,255,0.34)'
  };
  if (fx.lyricHighlightMode === 'custom') {
    var hi = lyricPaletteFromHex(fx.lyricHighlightColor);
    out.highlight = hi.primary;
    if (fx.lyricGlowLinked !== false) {
      out.glowColor = hi.secondary || hi.primary;
      out.glow = hi.glow || out.glow;
    }
  }
  if (fx.lyricGlowLinked === false) {
    var glowPal = lyricPaletteFromHex(fx.lyricGlowColor || '#9db8cf');
    out.glowColor = glowPal.primary;
    out.glow = glowPal.glow || out.glow;
  }
  if (!out.glowColor) out.glowColor = out.secondary;
  return out;
}
function setStageLyricPalette(pal) {
  stageLyrics.palette = effectiveLyricPalette(pal);
  lyricSunColor.copy(lyricThreeColor(stageLyrics.palette.glowColor || stageLyrics.palette.secondary || stageLyrics.palette.primary, '#ffe6a4', 0.44));
  lyricSunHotColor.copy(lyricThreeColor(stageLyrics.palette.highlight || stageLyrics.palette.primary, '#fff4cc', 0.54));
  applyLyricPaletteToMesh(stageLyrics.current);
  stageLyrics.outgoing.forEach(applyLyricPaletteToMesh);
  syncSkullParticleColors();
}
function lyricTextPaletteFromHsl(hsl, avgL, chroma) {
  if (avgL < 0.16 || chroma < 0.08) {
    return silverBlueLyricPalette();
  }
  var hue = hsl.h;
  if (avgL < 0.30 && (hue < 0.06 || hue > 0.86 || (hue > 0.75 && hue < 0.86))) return silverBlueLyricPalette();
  if (avgL > 0.82 && chroma < 0.12) {
    return {
      primary: '#064b5b',
      secondary: '#168c88',
      highlight: '#315f68',
      shadow: 'rgba(255,255,255,0.48)',
      glow: 'rgba(143,233,255,0.14)',
    };
  }
  var lightText = avgL < 0.52;
  var s = Math.max(0.42, Math.min(0.78, hsl.s + 0.16));
  var c1 = hslToRgb(hsl.h, s, lightText ? 0.74 : 0.34);
  var c2 = hslToRgb((hsl.h + 0.08) % 1, Math.max(0.36, s - 0.10), lightText ? 0.62 : 0.46);
  return {
    primary: rgbCss(c1),
    secondary: rgbCss(c2),
    highlight: rgbCss(hslToRgb((hsl.h + 0.03) % 1, Math.max(0.28, s - 0.18), lightText ? 0.86 : 0.58)),
    shadow: lightText ? 'rgba(0,6,10,0.44)' : 'rgba(248,253,255,0.40)',
    glow: rgbCss(c1, lightText ? 0.24 : 0.14),
  };
}
function updateLyricPaletteFromCover(coverCanvas) {
  if (!coverCanvas) return;
  try {
    var ctx = coverCanvas.getContext('2d');
    var img = ctx.getImageData(0, 0, coverCanvas.width, coverCanvas.height).data;
    var w = coverCanvas.width, h = coverCanvas.height;
    var sumR = 0, sumG = 0, sumB = 0, count = 0;
    var best = { score:-1, r:143, g:233, b:255 };
    for (var y = 0; y < h; y += 8) {
      for (var x = 0; x < w; x += 8) {
        var di = (y * w + x) * 4;
        var r = img[di], g = img[di+1], b = img[di+2], a = img[di+3] / 255;
        if (a < 0.5) continue;
        var lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
        var maxC = Math.max(r, g, b), minC = Math.min(r, g, b);
        var chroma = (maxC - minC) / 255;
        var edgePenalty = Math.abs(lum - 0.5);
        var score = chroma * 1.6 + (0.5 - edgePenalty) * 0.45;
        sumR += r; sumG += g; sumB += b; count++;
        if (lum > 0.08 && lum < 0.92 && score > best.score) best = { score:score, r:r, g:g, b:b };
      }
    }
    if (!count) return;
    var avgL = (sumR / count * 0.299 + sumG / count * 0.587 + sumB / count * 0.114) / 255;
    var hsl = rgbToHsl(best.r, best.g, best.b);
    stageLyrics.coverPalette = lyricTextPaletteFromHsl(hsl, avgL, Math.max(0, best.score));
    if (fx.lyricColorMode !== 'custom') setStageLyricPalette(stageLyrics.coverPalette);
  } catch (e) {}
}

function wrapLyricText(ctx, text, maxWidth, maxLines, fontSize) {
  text = String(text || '').trim();
  var useWords = /\s/.test(text) && /[A-Za-z0-9]/.test(text);
  var units = useWords ? text.split(/(\s+)/).filter(Boolean) : text.split('');
  var lines = [], line = '';
  for (var i = 0; i < units.length; i++) {
    var test = line + units[i];
    if (lyricMeasureText(ctx, test, fontSize) > maxWidth && line) {
      lines.push(line.trim());
      line = units[i].trimStart ? units[i].trimStart() : units[i].replace(/^\s+/, '');
      if (lines.length >= maxLines) {
        var rest = units.slice(i).join('').trim();
        if (rest) lines[lines.length - 1] = lines[lines.length - 1].replace(/[.。,…，、\s]*$/, '') + '...';
        return lines;
      }
    } else {
      line = test;
    }
  }
  if (line && lines.length < maxLines) lines.push(line.trim());
  return lines.length ? lines : [''];
}

function cssColorToThreeColor(css, fallback) {
  var c = new THREE.Color(fallback || '#d6f8ff');
  var value = String(css || fallback || '#d6f8ff').trim();
  try {
    if (/^#[0-9a-f]{3}$/i.test(value) || /^#[0-9a-f]{6}$/i.test(value)) {
      c.set(normalizeHexColor(value));
      return c;
    }
    var m = value.match(/^rgba?\(\s*([.\d]+)\s*,\s*([.\d]+)\s*,\s*([.\d]+)/i);
    if (m) {
      c.setRGB(
        Math.max(0, Math.min(255, parseFloat(m[1]))) / 255,
        Math.max(0, Math.min(255, parseFloat(m[2]))) / 255,
        Math.max(0, Math.min(255, parseFloat(m[3]))) / 255
      );
      return c;
    }
    c.setStyle(value);
  } catch (e) {
    try { c.set(normalizeHexColor(fallback || '#d6f8ff')); } catch (e2) {}
  }
  return c;
}
function lyricThreeColor(css, fallback, minLum) {
  var c = cssColorToThreeColor(css, fallback || '#d6f8ff');
  var lum = c.r * 0.299 + c.g * 0.587 + c.b * 0.114;
  var floor = minLum == null ? 0.34 : minLum;
  if (lum < floor) {
    var lift = floor - lum;
    c.r = Math.min(1, c.r + lift);
    c.g = Math.min(1, c.g + lift);
    c.b = Math.min(1, c.b + lift);
  }
  return c;
}

var STAGE_LYRIC_MAX_LINES = 1;

function makeLyricMask(text) {
  var canvas = document.createElement('canvas');
  var W = 2048, H = 384;
  canvas.width = W; canvas.height = H;
  var ctx = canvas.getContext('2d');
  var maxWidth = W - 190;
  var maxLines = STAGE_LYRIC_MAX_LINES;
  var fontSize = 128;
  text = String(text || '').replace(/\s+/g, ' ').trim();
  var lines = [text];
  var widest = 1;
  for (; fontSize >= 42; fontSize -= 4) {
    ctx.font = lyricFontCss(fontSize);
    lines = maxLines > 1 && lyricMeasureText(ctx, text, fontSize) > maxWidth ? wrapLyricText(ctx, text, maxWidth, maxLines, fontSize) : [text];
    widest = 1;
    for (var li = 0; li < lines.length; li++) widest = Math.max(widest, lyricMeasureText(ctx, lines[li], fontSize));
    if (widest <= maxWidth) break;
  }
  ctx.font = lyricFontCss(fontSize);
  if (!lines.length) lines = [''];
  widest = 1;
  for (var mi = 0; mi < lines.length; mi++) widest = Math.max(widest, lyricMeasureText(ctx, lines[mi], fontSize));
  var width = Math.min(maxWidth, widest);
  var fitScaleX = maxLines <= 1 && widest > maxWidth ? Math.max(0.68, maxWidth / widest) : 1;
  if (fitScaleX < 1) width = Math.min(maxWidth, widest * fitScaleX);
  var lineHeight = fontSize * (lines.length > 1 ? 1.02 : 1.0) * lyricLineHeightFactor();
  var blockH = fontSize + (lines.length - 1) * lineHeight;
  var x = W / 2, y0 = H / 2 - blockH / 2 + fontSize * 0.82;
  ctx.clearRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff';
  for (var di = 0; di < lines.length; di++) {
    if (fitScaleX < 1) {
      ctx.save();
      ctx.translate(x, 0);
      ctx.scale(fitScaleX, 1);
      lyricFillText(ctx, lines[di], 0, y0 + di * lineHeight, fontSize);
      ctx.restore();
    } else {
      lyricFillText(ctx, lines[di], x, y0 + di * lineHeight, fontSize);
    }
  }
  applyStonePrintTexture(ctx, W, H, fontSize);
  var tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1);
  return { texture:tex, width:W, height:H, textWidth:width, textHeight:blockH, fontSize:fontSize, lineHeight:lineHeight, lineCount:lines.length, lines:lines, fitScaleX:fitScaleX, textMin:(W / 2 - width / 2) / W, textMax:(W / 2 + width / 2) / W };
}

function makeLyricReadabilityTexture(mask) {
  var canvas = document.createElement('canvas');
  var W = mask && mask.width || 2048;
  var H = mask && mask.height || 384;
  var fontSize = mask && mask.fontSize || 128;
  var lines = mask && Array.isArray(mask.lines) && mask.lines.length ? mask.lines : [''];
  var lineHeight = mask && mask.lineHeight || fontSize * lyricLineHeightFactor();
  var fitScaleX = mask && mask.fitScaleX || 1;
  canvas.width = W; canvas.height = H;
  var ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  ctx.font = lyricFontCss(fontSize);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.miterLimit = 2;
  var blockH = fontSize + (lines.length - 1) * lineHeight;
  var y0 = H / 2 - blockH / 2 + fontSize * 0.82;
  function strokeLines(dx, dy) {
    for (var i = 0; i < lines.length; i++) {
      var y = y0 + i * lineHeight + (dy || 0);
      if (fitScaleX < 1) {
        ctx.save();
        ctx.translate(W / 2 + (dx || 0), 0);
        ctx.scale(fitScaleX, 1);
        lyricStrokeText(ctx, lines[i], 0, y, fontSize);
        ctx.restore();
      } else {
        lyricStrokeText(ctx, lines[i], W / 2 + (dx || 0), y, fontSize);
      }
    }
  }

  // Black/white readability layer: text-shaped only, no rectangular backing.
  ctx.save();
  ctx.filter = 'blur(14px)';
  ctx.globalAlpha = 0.18;
  ctx.lineWidth = Math.max(18, fontSize * 0.16);
  ctx.strokeStyle = 'rgba(0,0,0,1)';
  strokeLines(0, fontSize * 0.018);
  ctx.restore();

  ctx.save();
  ctx.filter = 'blur(5px)';
  ctx.globalAlpha = 0.32;
  ctx.lineWidth = Math.max(9, fontSize * 0.075);
  ctx.strokeStyle = 'rgba(0,0,0,1)';
  strokeLines(0, fontSize * 0.012);
  ctx.restore();

  ctx.save();
  ctx.filter = 'blur(4px)';
  ctx.globalAlpha = 0.15;
  ctx.lineWidth = Math.max(9, fontSize * 0.070);
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  strokeLines(0, 0);
  ctx.restore();

  ctx.save();
  ctx.filter = 'blur(1.2px)';
  ctx.globalAlpha = 0.26;
  ctx.lineWidth = Math.max(3.2, fontSize * 0.030);
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  strokeLines(0, 0);
  ctx.restore();

  var tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1);
  return tex;
}

function makeLyricGlowTexture(text, fontSize, textWidth, lines, lineHeight, fitScaleX) {
  text = String(text || '').replace(/\s+/g, ' ').trim();
  var drawLines = Array.isArray(lines) && lines.length ? lines : [text];
  var canvas = document.createElement('canvas');
  var measureCanvas = document.createElement('canvas');
  var measureCtx = measureCanvas.getContext('2d');
  measureCtx.font = lyricFontCss(fontSize);
  fitScaleX = fitScaleX || 1;
  var measuredWidth = Math.max(1, textWidth || lyricMeasureText(measureCtx, text, fontSize) * fitScaleX);
  for (var li = 0; li < drawLines.length; li++) measuredWidth = Math.max(measuredWidth, lyricMeasureText(measureCtx, drawLines[li], fontSize) * fitScaleX);
  var padX = Math.max(160, fontSize * 1.45);
  var padY = Math.max(86, fontSize * 0.78);
  var lh = lineHeight || fontSize * 1.04;
  var blockH = fontSize + (drawLines.length - 1) * lh;
  var W = Math.ceil(measuredWidth + padX * 2);
  var H = Math.ceil(blockH + padY * 2);
  canvas.width = W; canvas.height = H;
  var ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = lyricFontCss(fontSize);
  var y0 = H / 2 - blockH / 2 + fontSize * 0.82;
  function drawGlowText(dx, dy) {
    for (var i = 0; i < drawLines.length; i++) {
      var y = y0 + i * lh + (dy || 0);
      if (fitScaleX < 1) {
        ctx.save();
        ctx.translate(W / 2 + (dx || 0), 0);
        ctx.scale(fitScaleX, 1);
        if (ctx.lineWidth > 0) lyricStrokeText(ctx, drawLines[i], 0, y, fontSize);
        lyricFillText(ctx, drawLines[i], 0, y, fontSize);
        ctx.restore();
      } else {
        if (ctx.lineWidth > 0) lyricStrokeText(ctx, drawLines[i], W / 2 + (dx || 0), y, fontSize);
        lyricFillText(ctx, drawLines[i], W / 2 + (dx || 0), y, fontSize);
      }
    }
  }
  ctx.save();
  ctx.filter = 'blur(14px)';
  ctx.globalAlpha = 0.46;
  ctx.fillStyle = '#fff';
  ctx.lineWidth = Math.max(10, fontSize * 0.10);
  ctx.strokeStyle = '#fff';
  drawGlowText(0, 0);
  ctx.restore();
  ctx.save();
  ctx.filter = 'blur(34px)';
  ctx.globalAlpha = 0.34;
  ctx.fillStyle = '#fff';
  ctx.lineWidth = Math.max(18, fontSize * 0.18);
  ctx.strokeStyle = '#fff';
  drawGlowText(0, 0);
  ctx.restore();
  ctx.save();
  ctx.filter = 'blur(78px)';
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#fff';
  ctx.lineWidth = Math.max(28, fontSize * 0.26);
  ctx.strokeStyle = '#fff';
  drawGlowText(0, 0);
  ctx.restore();
  ctx.save();
  ctx.filter = 'blur(116px)';
  ctx.globalAlpha = 0.13;
  ctx.fillStyle = '#fff';
  ctx.lineWidth = Math.max(42, fontSize * 0.40);
  ctx.strokeStyle = '#fff';
  drawGlowText(0, 0);
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.filter = 'blur(8px)';
  ctx.globalAlpha = 0.26;
  ctx.fillStyle = '#fff';
  for (var ri = 0; ri < 8; ri++) {
    var ang = ri / 8 * Math.PI * 2;
    drawGlowText(Math.cos(ang) * 7, Math.sin(ang) * 4);
  }
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  var xMask = ctx.createLinearGradient(0, 0, W, 0);
  xMask.addColorStop(0.00, 'rgba(255,255,255,0)');
  xMask.addColorStop(0.10, 'rgba(255,255,255,1)');
  xMask.addColorStop(0.90, 'rgba(255,255,255,1)');
  xMask.addColorStop(1.00, 'rgba(255,255,255,0)');
  ctx.fillStyle = xMask;
  ctx.fillRect(0, 0, W, H);
  var yMask = ctx.createLinearGradient(0, 0, 0, H);
  yMask.addColorStop(0.00, 'rgba(255,255,255,0)');
  yMask.addColorStop(0.16, 'rgba(255,255,255,1)');
  yMask.addColorStop(0.84, 'rgba(255,255,255,1)');
  yMask.addColorStop(1.00, 'rgba(255,255,255,0)');
  ctx.fillStyle = yMask;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  var tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.userData = { width:W, height:H, textWidth:measuredWidth };
  return tex;
}

var lyricSunBloomTexture = null;
function getLyricSunBloomTexture() {
  if (lyricSunBloomTexture) return lyricSunBloomTexture;
  var canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 512;
  var ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  var cx = canvas.width * 0.50, cy = canvas.height * 0.50;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(2.05, 1);
  var radial = ctx.createRadialGradient(0, 0, 0, 0, 0, canvas.height * 0.43);
  radial.addColorStop(0.00, 'rgba(255,246,186,0.92)');
  radial.addColorStop(0.18, 'rgba(255,219,126,0.44)');
  radial.addColorStop(0.46, 'rgba(255,186,82,0.15)');
  radial.addColorStop(1.00, 'rgba(255,186,82,0)');
  ctx.fillStyle = radial;
  ctx.fillRect(-canvas.width, -canvas.height, canvas.width * 2, canvas.height * 2);
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.filter = 'blur(34px)';
  ctx.fillStyle = 'rgba(255,235,168,0.18)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, canvas.width * 0.33, canvas.height * 0.14, -0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.filter = 'blur(58px)';
  ctx.fillStyle = 'rgba(255,214,122,0.11)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, canvas.width * 0.45, canvas.height * 0.19, -0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.filter = 'blur(18px)';
  var core = ctx.createRadialGradient(cx, cy, 0, cx, cy, canvas.width * 0.16);
  core.addColorStop(0.00, 'rgba(255,252,220,0.38)');
  core.addColorStop(0.34, 'rgba(255,230,158,0.20)');
  core.addColorStop(1.00, 'rgba(255,210,116,0)');
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  var xMask = ctx.createLinearGradient(0, 0, canvas.width, 0);
  xMask.addColorStop(0.00, 'rgba(255,255,255,0)');
  xMask.addColorStop(0.11, 'rgba(255,255,255,1)');
  xMask.addColorStop(0.89, 'rgba(255,255,255,1)');
  xMask.addColorStop(1.00, 'rgba(255,255,255,0)');
  ctx.fillStyle = xMask;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  var yMask = ctx.createLinearGradient(0, 0, 0, canvas.height);
  yMask.addColorStop(0.00, 'rgba(255,255,255,0)');
  yMask.addColorStop(0.18, 'rgba(255,255,255,1)');
  yMask.addColorStop(0.82, 'rgba(255,255,255,1)');
  yMask.addColorStop(1.00, 'rgba(255,255,255,0)');
  ctx.fillStyle = yMask;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
  lyricSunBloomTexture = new THREE.CanvasTexture(canvas);
  lyricSunBloomTexture.minFilter = THREE.LinearFilter;
  lyricSunBloomTexture.magFilter = THREE.LinearFilter;
  lyricSunBloomTexture.generateMipmaps = false;
  return lyricSunBloomTexture;
}

function makeLyricShaderMaterial(mask, pal) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: mask.texture },
      uProgress: { value: 0 },
      uTextMin: { value: mask.textMin },
      uTextMax: { value: mask.textMax },
      uOpacity: { value: 0 },
      uBaseColor: { value: lyricThreeColor(pal.primary, '#d6f8ff', 0.38) },
      uHiColor: { value: lyricThreeColor(pal.highlight || pal.primary, '#fff0b8', 0.48) },
      uGlowColor: { value: lyricThreeColor(pal.glowColor || pal.secondary, '#9cffdf', 0.36) },
      uSolarColor: { value: lyricThreeColor(pal.highlight || pal.secondary || pal.primary, '#fff0b8', 0.50) },
      uFeather: { value: lyricsHasNativeKaraoke ? 0.030 : 0.055 },
      uSolar: { value: 0 },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: [
      'precision highp float;',
      'uniform sampler2D uMap;',
      'uniform float uProgress,uTextMin,uTextMax,uOpacity,uFeather,uSolar;',
      'uniform vec3 uBaseColor,uHiColor,uGlowColor,uSolarColor;',
      'varying vec2 vUv;',
      'void main(){',
      '  vec2 uv = gl_FrontFacing ? vUv : vec2(1.0 - vUv.x, vUv.y);',
      '  float mask = texture2D(uMap, uv).a;',
      '  if(mask < 0.01) discard;',
      '  float denom = max(0.001, uTextMax - uTextMin);',
      '  float p = clamp((uv.x - uTextMin) / denom, 0.0, 1.0);',
      '  float filled = 1.0 - smoothstep(uProgress, uProgress + uFeather, p);',
      '  float edge = 1.0 - smoothstep(0.0, uFeather * 2.8, abs(p - uProgress));',
      '  vec3 color = mix(uBaseColor, uHiColor, filled * 0.88);',
      '  color += uGlowColor * edge * 0.14;',
      '  vec3 solar = uSolarColor;',
      '  color = mix(color, color + solar * 0.34, uSolar * (0.25 + filled * 0.45));',
      '  color += solar * edge * uSolar * 0.22;',
      '  float lum = dot(color, vec3(0.299, 0.587, 0.114));',
      '  color += vec3(max(0.0, 0.30 - lum));',
      '  gl_FragColor = vec4(color, mask * uOpacity);',
      '}',
    ].join('\n'),
    transparent:true, depthWrite:false, depthTest:false, side:THREE.DoubleSide,
  });
}

function buildLyricMesh(text) {
  text = String(text || '').replace(/\s+/g, ' ').trim();
  var mask = makeLyricMask(text);
  var pal = stageLyrics.palette;
  var worldW = 6.10;
  var worldH = worldW * (mask.height / mask.width);
  var geo = new THREE.PlaneGeometry(worldW, worldH, 1, 1);
  var textWorldW = worldW * (mask.textWidth / mask.width);
  var textWorldH = worldH * ((mask.textHeight || mask.fontSize) / mask.height);
  var group = new THREE.Group();
  group.renderOrder = 42;
  group.position.set((Math.random() - 0.5) * 0.08, 0.20, 1.46);
  group.scale.setScalar(0.96);
  group.userData.age = 0;
  group.userData.state = 'in';
  group.userData.lastLyricProgress = -1;
  group.userData.floatSeed = Math.random() * 100;

  var sunMat = new THREE.MeshBasicMaterial({
    map:getLyricSunBloomTexture(), transparent:true, opacity:0,
    depthWrite:false, depthTest:false, side:THREE.DoubleSide,
    blending:THREE.AdditiveBlending, color:lyricThreeColor(pal.highlight || pal.secondary || pal.primary, '#ffe7a6', 0.50)
  });
  var sunWorldW = Math.max(textWorldW + worldH * 1.10, textWorldW * 1.18);
  sunWorldW = Math.min(worldW * 1.16, Math.max(worldH * 1.35, sunWorldW));
  var sunWorldH = Math.max(worldH * 1.02, Math.min(worldH * 1.54, worldH + textWorldW * 0.070));
  var sun = new THREE.Mesh(new THREE.PlaneGeometry(sunWorldW, sunWorldH, 1, 1), sunMat);
  sun.renderOrder = 40;
  sun.position.set(0, 0.02, -0.030);
  sun.scale.set(0.78, 0.58, 1);
  group.add(sun);

  var glowTex = makeLyricGlowTexture(text, mask.fontSize, mask.textWidth, mask.lines, mask.lineHeight, mask.fitScaleX);
  var glowMat = new THREE.MeshBasicMaterial({
    map: glowTex, transparent:true, opacity:0, depthWrite:false, depthTest:false,
    side:THREE.DoubleSide, blending:THREE.AdditiveBlending, color:lyricThreeColor(pal.secondary, '#9cffdf', 0.36)
  });
  var glowMeta = glowTex.userData || {};
  var glowWorldW = textWorldW * ((glowMeta.width || mask.width) / Math.max(1, glowMeta.textWidth || mask.textWidth));
  glowWorldW = Math.min(worldW * 1.10, Math.max(textWorldW + worldH * 0.38, glowWorldW));
  var glowWorldH = worldH * ((glowMeta.height || mask.height) / mask.height);
  glowWorldH = Math.min(worldH * 1.42, Math.max(worldH * 0.92, glowWorldH));
  var glow = new THREE.Mesh(new THREE.PlaneGeometry(glowWorldW, glowWorldH, 1, 1), glowMat);
  glow.renderOrder = 41;
  glow.scale.set(1.0, 1.06, 1);
  group.add(glow);

  var readabilityTex = makeLyricReadabilityTexture(mask);
  var readabilityMat = new THREE.MeshBasicMaterial({
    map: readabilityTex, transparent:true, opacity:0, depthWrite:false, depthTest:false,
    side:THREE.DoubleSide
  });
  var readability = new THREE.Mesh(new THREE.PlaneGeometry(worldW, worldH, 1, 1), readabilityMat);
  readability.renderOrder = 42;
  readability.position.set(0, 0, -0.012);
  group.add(readability);

  var textMat = makeLyricShaderMaterial(mask, pal);
  var textMesh = new THREE.Mesh(geo, textMat);
  textMesh.renderOrder = 43;
  group.add(textMesh);

  var sparkCount = 132;
  var pgeo = new THREE.BufferGeometry();
  var ppos = new Float32Array(sparkCount * 3);
  var pseed = new Float32Array(sparkCount);
  for (var i = 0; i < sparkCount; i++) {
    var angle = Math.random() * Math.PI * 2;
    var ring = 0.78 + Math.pow(Math.random(), 1.45) * 0.58;
    var rx = textWorldW * (0.50 + Math.random() * 0.22) + 0.10;
    var ry = worldH * (0.42 + Math.random() * 0.22) + 0.08;
    ppos[i*3] = Math.cos(angle) * rx * ring + (Math.random() - 0.5) * textWorldW * 0.12;
    ppos[i*3+1] = Math.sin(angle) * ry * ring + (Math.random() - 0.5) * worldH * 0.14;
    ppos[i*3+2] = (Math.random() - 0.5) * 0.24;
    pseed[i] = Math.random() * 1000;
  }
  pgeo.setAttribute('position', new THREE.BufferAttribute(ppos, 3));
  pgeo.setAttribute('seed', new THREE.BufferAttribute(pseed, 1));
  var pmat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: dotTexture },
      uSize: { value: 0.052 },
      uOpacity: { value: 0 },
      uColor: { value: lyricThreeColor(pal.highlight || pal.secondary || pal.primary, '#fff7d2', 0.30) },
      uPixel: uniforms.uPixel
    },
    vertexShader: [
      'attribute float seed;',
      'uniform float uSize;',
      'uniform float uPixel;',
      'varying float vSeed;',
      'void main(){',
      '  vSeed = seed;',
      '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
      '  float jitter = 0.58 + fract(sin(seed * 19.17) * 43758.5453) * 1.18;',
      '  float depth = clamp(2.2 / max(0.35, -mv.z), 0.54, 1.55);',
      '  gl_PointSize = uSize * jitter * depth * uPixel * 120.0;',
      '  gl_Position = projectionMatrix * mv;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'precision highp float;',
      'uniform sampler2D uMap;',
      'uniform vec3 uColor;',
      'uniform float uOpacity;',
      'varying float vSeed;',
      'void main(){',
      '  vec4 tex = texture2D(uMap, gl_PointCoord);',
      '  float twinkle = 0.72 + fract(sin(vSeed * 7.31) * 91.7) * 0.28;',
      '  gl_FragColor = vec4(uColor * twinkle, tex.a * uOpacity);',
      '}'
    ].join('\n'),
    transparent:true, depthWrite:false, depthTest:false, blending:THREE.AdditiveBlending
  });
  var sparks = new THREE.Points(pgeo, pmat);
  sparks.renderOrder = 44;
  sparks.visible = !!fx.lyricGlowParticles;
  group.add(sparks);

  group.userData.lyric = {
    mask:mask, textMesh:textMesh, readability:readability, glow:glow, sparks:sparks, sun:sun,
    textMat:textMat, readabilityMat:readabilityMat, glowMat:glowMat, sparkMat:pmat, sunMat:sunMat,
    basePositions:ppos.slice ? ppos.slice(0) : new Float32Array(ppos),
    textWorldW:textWorldW, textWorldH:textWorldH, worldW:worldW, worldH:worldH
  };
  updateLyricMeshProgress(group, 0);
  return group;
}

function updateLyricMeshProgress(mesh, progress) {
  if (!mesh || !mesh.userData || !mesh.userData.lyric) return;
  progress = Math.max(0, Math.min(1, progress || 0));
  var d = mesh.userData.lyric;
  d.textMat.uniforms.uProgress.value = progress;
  mesh.userData.lastLyricProgress = progress;
}

function showStageLine(text, redrawOnly) {
  createLyricsParticles();
  if (!stageLyrics.group) return;
  if (!text) { clearStageLyrics(); return; }
  if (redrawOnly && stageLyrics.current) {
    disposeLyricMesh(stageLyrics.current);
    stageLyrics.current = null;
  } else if (stageLyrics.current) {
    stageLyrics.current.userData.state = 'out';
    stageLyrics.current.userData.age = 0;
    stageLyrics.outgoing.push(stageLyrics.current);
  }
  stageLyrics.currentText = text;
  var mesh = buildLyricMesh(text);
  stageLyrics.group.add(mesh);
  stageLyrics.current = mesh;
}

function refreshCurrentLyricStyle() {
  if (!stageLyrics || !stageLyrics.currentText || !stageLyrics.current) return;
  var progress = stageLyrics.current.userData ? (stageLyrics.current.userData.lastLyricProgress || 0) : 0;
  showStageLine(stageLyrics.currentText, true);
  updateLyricMeshProgress(stageLyrics.current, progress);
  if (stageLyrics.current && stageLyrics.current.userData) stageLyrics.current.userData.age = 0.48;
}

function clearStageLyrics() {
  disposeLyricMesh(stageLyrics.current);
  stageLyrics.current = null;
  stageLyrics.currentIdx = -1;
  stageLyrics.currentText = '';
  while (stageLyrics.outgoing.length) disposeLyricMesh(stageLyrics.outgoing.pop());
}

function updateStageLyrics3D(dt) {
  if (!stageLyrics.group) return;
  if (!fx.particleLyrics && !stageLyrics.current && (!stageLyrics.outgoing || !stageLyrics.outgoing.length)) return;
  if (!isFinite(stageLyrics.highBloom)) stageLyrics.highBloom = 0;
  if (!isFinite(stageLyrics.beatGlow)) stageLyrics.beatGlow = 0;
  if (!isFinite(stageLyrics.glowFollowX)) stageLyrics.glowFollowX = 0;
  if (!isFinite(stageLyrics.glowFollowY)) stageLyrics.glowFollowY = 0;
  if (!isFinite(stageLyrics.glowFollowRoll)) stageLyrics.glowFollowRoll = 0;
  var t = uniforms.uTime.value;
  var lyricGlowStrength = fx.lyricGlow ? Math.min(0.85, Math.max(0, fx.lyricGlowStrength)) : 0;
  var glowDrive = Math.min(1.7, Math.max(0, lyricGlowStrength / 0.50));
  var glowBreath = lyricGlowStrength > 0 ? (0.5 + 0.5 * Math.sin(t * 1.05)) : 0;
  var musicBloom = Math.max(lyricSunEnergy, beatPulse * 0.10);
  var beatGlowRaw = fx.lyricGlowBeat && lyricGlowStrength > 0
    ? Math.max(beatPulse * 1.22, beatCam.punch * 0.86 + beatCam.radiusKick * 1.85)
    : 0;
  stageLyrics.beatGlow += (beatGlowRaw - stageLyrics.beatGlow) * (beatGlowRaw > stageLyrics.beatGlow ? 0.32 : 0.10);
  if (!isFinite(stageLyrics.beatGlow)) stageLyrics.beatGlow = 0;
  var skullLyricPreset = !!(fx && fx.preset === SKULL_PRESET_INDEX);
  var solarBloom = lyricGlowStrength > 0 ? (0.18 + glowBreath * 0.16 + musicBloom * 0.90 + stageLyrics.beatGlow * 1.18 + Math.sin(t * 0.37 + 1.2) * 0.035) * glowDrive : 0;
  if (skullLyricPreset && lyricGlowStrength > 0) {
    solarBloom = (0.035 + glowBreath * 0.030 + musicBloom * 0.11 + Math.pow(Math.max(0, stageLyrics.beatGlow), 1.26) * 1.45 + Math.pow(Math.max(0, skullBeatFlash || 0), 1.08) * 1.18) * glowDrive;
  }
  solarBloom = Math.max(0, Math.min(1.45, solarBloom));
  stageLyrics.highBloom += (solarBloom - stageLyrics.highBloom) * (solarBloom > stageLyrics.highBloom ? (skullLyricPreset ? 0.22 : 0.075) : (skullLyricPreset ? 0.070 : 0.050));
  if (!isFinite(stageLyrics.highBloom)) stageLyrics.highBloom = 0;
  updateLyricStarRiver(dt);
  var followDrive = fx.lyricGlowBeat && lyricGlowStrength > 0 ? Math.min(1.35, stageLyrics.beatGlow) : 0;
  var followXTarget = followDrive * (beatCam.thetaKick * 34 + beatCam.rollKick * 8);
  var followYTarget = followDrive * (beatCam.phiKick * 42 - beatCam.radiusKick * 0.48);
  var followRollTarget = followDrive * (beatCam.rollKick * 22 + beatCam.thetaKick * 10);
  stageLyrics.glowFollowX += (followXTarget - stageLyrics.glowFollowX) * 0.26;
  stageLyrics.glowFollowY += (followYTarget - stageLyrics.glowFollowY) * 0.24;
  stageLyrics.glowFollowRoll += (followRollTarget - stageLyrics.glowFollowRoll) * 0.22;
  stageLyrics.glowFollowX *= 0.92;
  stageLyrics.glowFollowY *= 0.92;
  stageLyrics.glowFollowRoll *= 0.90;
  var layoutScale = clampRange(Number(fx.lyricScale) || 1, 0.35, 1.65);
  var layoutX = clampRange(Number(fx.lyricOffsetX) || 0, -2.0, 2.0);
  var layoutY = clampRange(Number(fx.lyricOffsetY) || 0, -1.2, 1.35);
  var layoutZ = clampRange(Number(fx.lyricOffsetZ) || 0, -1.6, 1.6);
  var layoutTiltX = clampRange(Number(fx.lyricTiltX) || 0, -42, 42);
  var layoutTiltY = clampRange(Number(fx.lyricTiltY) || 0, -42, 42);
  var skullMouthLyrics = !!(camera && fx && fx.preset === SKULL_PRESET_INDEX && skullParticleGroup && skullParticleGroup.visible);
  var shelfDetailOpen = !!(shelfManager && shelfManager.hasOpenContent && shelfManager.hasOpenContent());
  var skullShelfDetailOpen = !!(fx && fx.preset === SKULL_PRESET_INDEX && shelfDetailOpen);
  var normalShelfDetailOpen = !!(shelfDetailOpen && !skullShelfDetailOpen);
  stageLyrics.group.renderOrder = shelfDetailOpen ? 24 : 38;
  var shelfDetailLyricProfile = shelfDetailOpen ? {
    opacity: skullShelfDetailOpen ? 0.30 : 0.38,
    readability: skullShelfDetailOpen ? 0.20 : 0.26,
    bloom: skullShelfDetailOpen ? 0.20 : 0.24,
    glowCap: skullShelfDetailOpen ? 0.050 : 0.070,
    outgoing: skullShelfDetailOpen ? 0.34 : 0.42,
    easeDown: 0.34
  } : {
    opacity: 0.96,
    readability: 0.86,
    bloom: 1,
    glowCap: 1.0,
    outgoing: 1,
    easeDown: 0.16
  };
  var shelfLyricAvoid = shouldAvoidStageLyricsForShelf();
  var wallpaperLyricLock = shouldUseWallpaperLyricCameraLock();
  var wallpaperShelfLyrics = wallpaperLyricLock && shouldDimWallpaperForShelf();
  if (wallpaperLyricLock) {
    layoutScale *= wallpaperShelfLyrics ? 0.60 : 0.84;
    layoutX = clampRange(layoutX + (wallpaperShelfLyrics ? -1.34 : 0), -2.0, 2.0);
    layoutY = clampRange(layoutY + (wallpaperShelfLyrics ? -0.04 : 0.08), -1.2, 1.35);
    layoutZ = clampRange(layoutZ + (wallpaperShelfLyrics ? 1.02 : 1.15), -1.6, 1.6);
  } else if (!skullMouthLyrics && shelfLyricAvoid && fx.lyricCameraLock) {
    layoutScale *= 0.72;
    layoutX = clampRange(layoutX - 1.36, -2.0, 2.0);
    layoutY = clampRange(layoutY + 0.06, -1.2, 1.35);
    layoutZ = clampRange(layoutZ + 0.72, -1.6, 1.6);
  } else if (!skullMouthLyrics && shouldOffsetLyricsForShelfDetail()) {
    layoutScale *= normalShelfDetailOpen ? 0.56 : 0.70;
    layoutX = clampRange(layoutX - (normalShelfDetailOpen ? 1.78 : 1.58), -2.0, 2.0);
    layoutY = clampRange(layoutY + (normalShelfDetailOpen ? 0.18 : 0.08), -1.2, 1.35);
    layoutZ = clampRange(layoutZ + 0.84, -1.6, 1.6);
  }
  if (skullMouthLyrics) {
    layoutScale *= skullShelfDetailOpen ? 0.52 : (shelfLyricAvoid ? 0.58 : 0.66);
    if (shelfLyricAvoid && !skullShelfDetailOpen) {
      layoutX = clampRange(layoutX - 0.36, -2.0, 2.0);
      layoutY = clampRange(layoutY + 0.02, -1.2, 1.35);
      layoutZ = clampRange(layoutZ + 0.18, -1.6, 1.6);
    }
  }
  var lockBaseDistance = wallpaperShelfLyrics ? 5.58 : 4.85;
  var lockDistance = lockBaseDistance + layoutZ;
  var cameraLockedLyrics = (fx.lyricCameraLock || wallpaperLyricLock) && camera;
  var skullLyricEdgeGuard = !!(fx && fx.preset === SKULL_PRESET_INDEX && (orbit.centerLocked || orbit.recentering));
  var lockFit = (cameraLockedLyrics || skullLyricEdgeGuard || skullMouthLyrics) ? lyricCameraLockFit(layoutScale, layoutX, layoutY, skullMouthLyrics ? Math.max(2.2, 4.4 + layoutZ) : lockDistance) : 1;
  if (skullMouthLyrics) lockFit = Math.min(lockFit, 1.12);
  if (!isFinite(stageLyrics.lockFitScale)) stageLyrics.lockFitScale = 1;
  stageLyrics.lockFitScale += (lockFit - stageLyrics.lockFitScale) * (lockFit < stageLyrics.lockFitScale ? 0.18 : 0.10);
  stageLyrics.group.scale.setScalar(layoutScale * stageLyrics.lockFitScale);
  if (skullMouthLyrics) {
    stageLyrics.snapCameraLockFrames = 0;
    skullParticleGroup.updateMatrixWorld(true);
    skullLyricMouthTarget.copy(skullLyricMouthLocal).applyMatrix4(skullParticleGroup.matrixWorld);
    skullParticleGroup.getWorldQuaternion(skullLyricMouthQuat);
    skullLyricMouthForward.set(0, 0, 1).applyQuaternion(skullLyricMouthQuat);
    skullLyricMouthTarget.addScaledVector(skullLyricMouthForward, 0.020);
    skullLyricReadableQuat.copy(skullLyricMouthQuat);
    setStageLyricViewBasisFromCameraOrQuaternion(skullLyricMouthQuat);
    lyricLayoutTarget.copy(skullLyricMouthTarget);
    applyStageLyricLayoutOffset(lyricLayoutTarget, layoutX, layoutY, layoutZ);
    stageLyricTargetQuaternion(skullLyricReadableQuat, layoutTiltX, layoutTiltY);
    stageLyrics.group.userData = stageLyrics.group.userData || {};
    if (!stageLyrics.group.userData.skullMouthLocked) {
      stageLyrics.group.position.copy(lyricLayoutTarget);
      stageLyrics.group.quaternion.copy(lyricTargetQuat);
      stageLyrics.group.userData.skullMouthLocked = true;
    } else {
      stageLyrics.group.position.lerp(lyricLayoutTarget, 0.26);
      stageLyrics.group.quaternion.slerp(lyricTargetQuat, 0.30);
    }
  } else if (cameraLockedLyrics) {
    if (stageLyrics.group.userData) stageLyrics.group.userData.skullMouthLocked = false;
    setStageLyricViewBasisFromCameraOrQuaternion(null);
    lyricLayoutBase.copy(camera.position).addScaledVector(lyricCameraDir, lockBaseDistance);
    lyricCameraTarget.copy(lyricLayoutBase);
    applyStageLyricLayoutOffset(lyricCameraTarget, layoutX, layoutY, layoutZ);
    stageLyricTargetQuaternion(camera.quaternion, layoutTiltX, layoutTiltY);
    if (stageLyrics.snapCameraLockFrames > 0) {
      stageLyrics.group.position.copy(lyricCameraTarget);
      stageLyrics.group.quaternion.copy(lyricTargetQuat);
      stageLyrics.snapCameraLockFrames -= 1;
    } else {
      var lockPosEase = wallpaperLyricLock ? (wallpaperShelfLyrics ? 0.42 : 0.34) : 0.24;
      var lockQuatEase = wallpaperLyricLock ? (wallpaperShelfLyrics ? 0.44 : 0.36) : 0.22;
      stageLyrics.group.position.lerp(lyricCameraTarget, lockPosEase);
      stageLyrics.group.quaternion.slerp(lyricTargetQuat, lockQuatEase);
    }
  } else {
    if (stageLyrics.group.userData) stageLyrics.group.userData.skullMouthLocked = false;
    stageLyrics.snapCameraLockFrames = 0;
    if (particles) {
      particles.updateMatrixWorld(true);
      particles.getWorldPosition(lyricCoverWorldPos);
      particles.getWorldQuaternion(lyricCoverWorldQuat);
    } else {
      lyricCoverWorldPos.set(0, 0, 0);
      lyricCoverWorldQuat.identity();
    }
    setStageLyricViewBasisFromCameraOrQuaternion(lyricCoverWorldQuat);
    lyricLayoutBase.copy(lyricCoverWorldPos);
    lyricLayoutTarget.copy(lyricLayoutBase);
    applyStageLyricLayoutOffset(lyricLayoutTarget, layoutX, layoutY, layoutZ);
    stageLyrics.group.position.copy(lyricLayoutTarget);
    stageLyricTargetQuaternion(lyricCoverWorldQuat, layoutTiltX, layoutTiltY);
    stageLyrics.group.quaternion.copy(lyricTargetQuat);
  }
  function tickMesh(mesh, isCurrent) {
    if (!mesh) return false;
    mesh.userData.age += dt;
    var a = Math.min(1, mesh.userData.age / (isCurrent ? 0.52 : 0.38));
    a = a * a * (3 - 2 * a);
    var data = mesh.userData.lyric || {};
    var followMix = isCurrent ? 1.0 : 0.64;
    var glowX = stageLyrics.glowFollowX * followMix;
    var glowY = stageLyrics.glowFollowY * followMix;
    var glowRoll = stageLyrics.glowFollowRoll * followMix;
    if (data.glow) {
      data.glow.position.set(glowX * 0.14, glowY * 0.12, -0.006);
      data.glow.rotation.z = glowRoll * 0.30;
    }
    if (data.sun) {
      data.sun.position.set(glowX * 0.42, 0.02 + glowY * 0.34, -0.035);
      data.sun.rotation.z = glowRoll * 0.36;
    }
    if (data.sparks) {
      data.sparks.position.set(glowX * 0.24, glowY * 0.22, 0.010);
      data.sparks.rotation.z = glowRoll * 0.22;
    }
    var opacity = 0;
    if (isCurrent) {
      var shelfDetailLyricDim = shelfDetailLyricProfile.bloom;
      var lyricOpacityTarget = shelfDetailLyricProfile.opacity;
      var currentOpacity = data.textMat ? data.textMat.uniforms.uOpacity.value : 0;
      var opacityEase = shelfDetailOpen && currentOpacity > lyricOpacityTarget ? shelfDetailLyricProfile.easeDown : 0.16;
      opacity = clampRange(currentOpacity + (lyricOpacityTarget - currentOpacity) * opacityEase, 0, 1);
      if (data.textMat) data.textMat.uniforms.uOpacity.value = opacity;
      if (data.readabilityMat) {
        var readabilityTarget = opacity * shelfDetailLyricProfile.readability;
        var readabilityEase = shelfDetailOpen && data.readabilityMat.opacity > readabilityTarget ? 0.28 : 0.16;
        data.readabilityMat.opacity += (readabilityTarget - data.readabilityMat.opacity) * readabilityEase;
      }
      if (data.textMat && data.textMat.uniforms.uSolar) {
        var solarTarget = stageLyrics.highBloom * shelfDetailLyricDim;
        var solarEase = shelfDetailOpen && data.textMat.uniforms.uSolar.value > solarTarget ? 0.26 : 0.12;
        data.textMat.uniforms.uSolar.value += (solarTarget - data.textMat.uniforms.uSolar.value) * solarEase;
      }
      var solar = stageLyrics.highBloom * shelfDetailLyricDim;
      var warmth = Math.max(0, Math.min(1, solar * 1.10));
      if (data.glowMat) {
        var glowTarget = lyricGlowStrength > 0 ? Math.min(shelfDetailLyricProfile.glowCap, (0.075 + solar * 0.34 + stageLyrics.beatGlow * 0.16 * shelfDetailLyricDim) * Math.min(3.0, glowDrive)) : 0;
        data.glowMat.opacity += (glowTarget - data.glowMat.opacity) * (glowTarget > data.glowMat.opacity ? 0.095 : (shelfDetailOpen ? 0.20 : 0.055));
        data.glowMat.color.copy(lyricThreeColor(stageLyrics.palette.glowColor || stageLyrics.palette.secondary, '#9cffdf', 0.36)).lerp(lyricSunHotColor, warmth);
      }
      if (data.sparkMat) {
        var sparkTarget = lyricGlowStrength > 0 && fx.lyricGlowParticles && !shelfDetailOpen ? Math.min(0.42, (0.10 + solar * 0.14 + stageLyrics.beatGlow * 0.10) * Math.min(1.6, glowDrive)) : 0;
        var sparkOpacity = getLyricSparkOpacity(data);
        sparkOpacity += (sparkTarget - sparkOpacity) * (sparkTarget > sparkOpacity ? 0.13 : (shelfDetailOpen ? 0.22 : 0.075));
        setLyricSparkOpacity(data, sparkOpacity);
        var sparkSizeTarget = fx.lyricGlowParticles && !shelfDetailOpen ? (0.050 + solar * 0.016 + stageLyrics.beatGlow * 0.026 + bass * 0.008) : 0.035;
        setLyricSparkSize(data, getLyricSparkSize(data) + (sparkSizeTarget - getLyricSparkSize(data)) * 0.12);
        var sparkColor = lyricSunHotColor.clone().lerp(lyricSunColor, 0.22 + solar * 0.18);
        setLyricSparkColor(data, sparkColor);
      }
      var seed = mesh.userData.floatSeed || 0;
      if (data.sunMat) {
        var sunTarget = lyricGlowStrength > 0 && !shelfDetailOpen ? Math.min(0.88, (Math.pow(Math.min(1.35, solar), 1.08) * 0.28 + stageLyrics.beatGlow * 0.20) * Math.min(2.4, glowDrive)) : 0;
        data.sunMat.opacity += (sunTarget - data.sunMat.opacity) * (shelfDetailOpen ? 0.18 : 0.055);
        data.sunMat.color.copy(lyricSunColor).lerp(lyricSunHotColor, solar * 0.55);
      }
      if (data.sun) {
        var sunPulse = solar;
        var beatScale = fx.lyricGlowBeat ? stageLyrics.beatGlow * 0.24 : 0;
        data.sun.scale.set(0.82 + sunPulse * 0.36 + beatScale + Math.sin(t * 1.6) * sunPulse * 0.018, 0.60 + sunPulse * 0.34 + beatScale * 0.72 + Math.cos(t * 1.25) * sunPulse * 0.020, 1);
        data.sun.rotation.z += Math.sin(t * 0.32 + seed) * 0.010 * sunPulse;
      }
      var breathe = Math.sin(t * 0.92 + seed) * 0.050 + Math.sin(t * 0.41 + seed * 0.7) * 0.028;
      if (skullMouthLyrics) {
        var mouthMeshY = -0.070 + Math.sin(t * 0.50 + seed) * 0.018 + Math.sin(t * 1.12 + seed) * 0.006;
        var mouthMeshZ = 0.018 + Math.cos(t * 0.46 + seed) * 0.007;
        var mouthMeshScale = 1.08 + a * 0.040 + breathe * 0.12 + bass * 0.024 + beatPulse * 0.014;
        if (!mesh.userData.skullMouthMeshLocked) {
          mesh.position.set(0, mouthMeshY, mouthMeshZ);
          mesh.userData.skullMouthMeshLocked = true;
        } else {
          mesh.position.x += (0 - mesh.position.x) * 0.18;
          mesh.position.y += (mouthMeshY - mesh.position.y) * 0.16;
          mesh.position.z += (mouthMeshZ - mesh.position.z) * 0.18;
        }
        mesh.scale.setScalar(mouthMeshScale);
        mesh.rotation.z = Math.sin(t * 0.30 + seed) * 0.010;
      } else {
        mesh.userData.skullMouthMeshLocked = false;
        mesh.scale.setScalar(0.96 + a * 0.055 + breathe + bass * 0.038 + beatPulse * 0.014);
        mesh.position.y += ((0.18 + Math.sin(t * 0.55 + seed) * 0.055 + Math.sin(t * 1.35 + seed) * 0.014) - mesh.position.y) * 0.075;
        mesh.position.z += ((1.48 + Math.cos(t * 0.48 + seed) * 0.080) - mesh.position.z) * 0.080;
        mesh.rotation.z = Math.sin(t * 0.34 + seed) * 0.018;
      }
      if (data.sparks && data.sparkMat) data.sparks.visible = fx.lyricGlowParticles || getLyricSparkOpacity(data) > 0.015;
      if (data.sparks && data.basePositions) {
        var pos = data.sparks.geometry.attributes.position;
        var arr = pos.array, base = data.basePositions;
        data.sparks.rotation.z += ((fx.lyricGlowParticles ? 0.0009 : 0.00025) + stageLyrics.beatGlow * 0.0007) * (dt * 60);
        data.sparks.rotation.x = Math.sin(t * 0.12 + seed) * 0.012;
        for (var si = 0; si < arr.length / 3; si++) {
          var s = si * 12.989 + seed;
          var particleBeat = fx.lyricGlowParticles ? stageLyrics.beatGlow : 0;
          var dustBreath = fx.lyricGlowParticles ? (0.62 + 0.38 * Math.sin(t * (0.32 + (si % 7) * 0.025) + s)) : 0.18;
          var drift = fx.lyricGlowParticles ? 1 : 0.30;
          arr[si*3] = base[si*3] + Math.sin(t * (0.18 + (si % 5) * 0.025) + s) * (0.045 + bass * 0.030 + particleBeat * 0.052) * drift + Math.cos(t * 0.11 + s) * 0.018 * dustBreath;
          arr[si*3+1] = base[si*3+1] + Math.cos(t * (0.16 + (si % 6) * 0.024) + s) * (0.042 + mid * 0.026 + particleBeat * 0.046) * drift + Math.sin(t * 0.13 + s) * 0.016 * dustBreath;
          arr[si*3+2] = base[si*3+2] + Math.sin(t * (0.24 + (si % 4) * 0.035) + s) * (0.036 + particleBeat * 0.028) * drift;
        }
        pos.needsUpdate = true;
      }
      return true;
    }
    opacity = (1 - a) * 0.72 * shelfDetailLyricProfile.outgoing;
    if (data.textMat) data.textMat.uniforms.uOpacity.value = opacity;
    if (data.readabilityMat) data.readabilityMat.opacity = opacity * (shelfDetailOpen ? shelfDetailLyricProfile.readability : 0.58);
    if (data.textMat && data.textMat.uniforms.uSolar) data.textMat.uniforms.uSolar.value *= shelfDetailOpen ? 0.72 : 0.86;
    if (data.glowMat) data.glowMat.opacity = lyricGlowStrength > 0 ? (shelfDetailOpen ? Math.min(shelfDetailLyricProfile.glowCap * 0.40, opacity * 0.05 * lyricGlowStrength) : opacity * 0.08 * lyricGlowStrength) : 0;
    if (data.sparkMat) {
      var outgoingSpark = lyricGlowStrength > 0 && fx.lyricGlowParticles && !shelfDetailOpen ? Math.max(opacity * 0.24 * lyricGlowStrength, (1 - a) * 0.18 * lyricGlowStrength) : 0;
      setLyricSparkOpacity(data, outgoingSpark);
      setLyricSparkSize(data, 0.046 + (1 - a) * 0.020);
    }
    if (data.sunMat) data.sunMat.opacity = lyricGlowStrength > 0 && !shelfDetailOpen ? opacity * 0.08 * lyricGlowStrength : 0;
    mesh.position.z -= dt * 0.26;
    mesh.position.y += dt * 0.08;
    mesh.scale.setScalar(0.98 - a * 0.06);
    return a < 1;
  }
  tickMesh(stageLyrics.current, true);
  for (var i = stageLyrics.outgoing.length - 1; i >= 0; i--) {
    if (!tickMesh(stageLyrics.outgoing[i], false)) {
      disposeLyricMesh(stageLyrics.outgoing[i]);
      stageLyrics.outgoing.splice(i, 1);
    }
  }
}

function getLyricLineProgress(line, nextLine, now) {
  if (!line) return 0;
  now += line.words && line.words.length ? 0.030 : 0.020;
  if (line.words && line.words.length && line.charCount > 0) {
    var lastP = 0;
    for (var i = 0; i < line.words.length; i++) {
      var w = line.words[i];
      var ws = w.t;
      var we = w.t + Math.max(0.08, w.d || 0.24);
      if (now < ws) return lastP;
      var local = now >= we ? 1 : (now - ws) / Math.max(0.08, we - ws);
      local = Math.max(0, Math.min(1, local));
      var p = (w.c0 + (w.c1 - w.c0) * local) / line.charCount;
      lastP = Math.max(lastP, p);
      if (now < we) return lastP;
    }
    return 1;
  }
  var nextT = nextLine && nextLine.t > line.t ? nextLine.t : Math.min((audio && audio.duration) || now + 4, line.t + (line.duration || 4.8));
  var span = Math.max(0.75, nextT - line.t);
  var prog = Math.max(0, Math.min(1, (now - line.t) / span));
  return prog * prog * (3 - 2 * prog);
}

function tickLyricsParticles() {
  if (!fx.particleLyrics) {
    if (stageLyrics.current || stageLyrics.currentText || (stageLyrics.outgoing && stageLyrics.outgoing.length)) clearStageLyrics();
    return;
  }
  if (!playing || !audio || !lyricsLines.length) {
    if (stageLyrics.current) {
      stageLyrics.current.userData.state = 'out';
      stageLyrics.current.userData.age = 0;
      stageLyrics.outgoing.push(stageLyrics.current);
      stageLyrics.current = null;
      stageLyrics.currentIdx = -1;
      stageLyrics.currentText = '';
    }
    return;
  }
  var t = audio.currentTime;
  var newIdx = -1;
  for (var i = 0; i < lyricsLines.length; i++) {
    if (lyricsLines[i].t <= t + 0.05) newIdx = i; else break;
  }
  if (newIdx < 0) {
    var introText = currentLyricFallbackText();
    if (!introText) {
      clearStageLyrics();
      return;
    }
    if (stageLyrics.currentIdx !== -2 || stageLyrics.currentText !== introText) {
      stageLyrics.currentIdx = -2;
      showStageLine(introText);
    }
    if (stageLyrics.current) {
      var firstLine = lyricsLines[0];
      var introEnd = firstLine && firstLine.t > 0 ? firstLine.t : Math.min((audio && audio.duration) || 4.8, 4.8);
      var introLine = { t:0, text:introText, duration:Math.max(0.8, introEnd), charCount:Math.max(1, introText.length), fallback:true };
      updateLyricMeshProgress(stageLyrics.current, getLyricLineProgress(introLine, null, t));
    }
    return;
  }
  if (newIdx !== stageLyrics.currentIdx) {
    stageLyrics.currentIdx = newIdx;
    showStageLine(lyricsLines[newIdx].text || '');
  }
  if (stageLyrics.current) {
    var curLine = lyricsLines[newIdx] || { t:t };
    var nextLine = lyricsLines[newIdx + 1];
    var progress = getLyricLineProgress(curLine, nextLine, t);
    updateLyricMeshProgress(stageLyrics.current, progress);
  }
}

function disposeLyricsParticles() {
  clearStageLyrics();
  if (stageLyrics.starRiver) {
    if (stageLyrics.starRiver.parent) stageLyrics.starRiver.parent.remove(stageLyrics.starRiver);
    if (stageLyrics.starRiver.geometry) stageLyrics.starRiver.geometry.dispose();
    if (stageLyrics.starRiver.material) stageLyrics.starRiver.material.dispose();
    stageLyrics.starRiver = null;
  }
  if (stageLyrics.group) {
    scene.remove(stageLyrics.group);
    stageLyrics.group = null;
  }
}

// ============================================================
//  涟漪触发系统 — 3×3 九宫格 + bass 上升沿
// ============================================================
var rippleIdx = 0;
var lastRippleAt = 0;
var lastBassRising = false;
var BASS_THRESHOLD = 0.30;
var RIPPLE_COOLDOWN = 0.32;

var regions = [];
for (var ry = 0; ry < 3; ry++) for (var rx = 0; rx < 3; rx++) {
  regions.push({
    x: (rx / 2 - 0.5) * PLANE_SIZE * 0.72,
    y: (ry / 2 - 0.5) * PLANE_SIZE * 0.72,
  });
}

function triggerRipple(x, y, strength) {
  var r = ripples[rippleIdx];
  r.x = x; r.y = y; r.age = 0; r.str = strength;
  rippleIdx = (rippleIdx + 1) % RIPPLE_MAX;
}

function updateRipples(dt) {
  var isBassHit = bass > BASS_THRESHOLD && !lastBassRising;
  lastBassRising = bass > BASS_THRESHOLD * 0.75;
  var now = uniforms.uTime.value;
  if (isBassHit && (now - lastRippleAt) > RIPPLE_COOLDOWN) {
    lastRippleAt = now;
    var count = 2 + (Math.random() < 0.5 ? 0 : 1);
    var used = {};
    for (var k = 0; k < count; k++) {
      var idx, tries = 0;
      do { idx = Math.floor(Math.random() * 9); tries++; } while (used[idx] && tries < 12);
      used[idx] = true;
      var reg = regions[idx];
      var jx = reg.x + (Math.random() - 0.5) * 0.7;
      var jy = reg.y + (Math.random() - 0.5) * 0.7;
      var str = 0.65 + bass * 1.4 + Math.random() * 0.25;
      triggerRipple(jx, jy, str);
    }
  }

  for (var i = 0; i < RIPPLE_MAX; i++) {
    var r = ripples[i];
    if (r.str > 0.005) {
      r.age += dt;
      if (r.age > 2.0) { r.str = 0; r.age = -10; }
    }
    var off = i * 4;
    rippleData[off]   = r.x;
    rippleData[off+1] = r.y;
    rippleData[off+2] = r.age;
    rippleData[off+3] = r.str;
  }
  rippleTex.needsUpdate = true;

  var active = 0;
  for (var i = 0; i < RIPPLE_MAX; i++) if (ripples[i].str > 0.005) active++;
  uniforms.uRippleCount.value = active;
}

// ============================================================
//  封面 + 边缘 + 启发式深度 处理 (CPU 端)
//   生成 256×256 RGBA 纹理: R=depth G=edge B=fg-mask A=lum
// ============================================================
function coverDepthCacheId(raw) {
  var str = String(raw || '');
  if (!str) return '';
  var h = 2166136261;
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return str.length + ':' + (h >>> 0).toString(36);
}
function getCoverDepthCache(raw) {
  var id = coverDepthCacheId(raw);
  if (!id || !coverDepthCache[id]) return null;
  coverDepthCache[id].at = Date.now();
  var idx = coverDepthCacheKeys.indexOf(id);
  if (idx >= 0) {
    coverDepthCacheKeys.splice(idx, 1);
    coverDepthCacheKeys.push(id);
  } else coverDepthCacheKeys.push(id);
  return coverDepthCache[id];
}
function setCoverDepthCache(raw, canvas, aiEnhanced) {
  var id = coverDepthCacheId(raw);
  if (!id || !canvas) return;
  var idx = coverDepthCacheKeys.indexOf(id);
  if (idx >= 0) coverDepthCacheKeys.splice(idx, 1);
  coverDepthCacheKeys.push(id);
  coverDepthCache[id] = { canvas: canvas, ai: !!aiEnhanced, at: Date.now() };
  while (coverDepthCacheKeys.length > 18) {
    var drop = coverDepthCacheKeys.shift();
    delete coverDepthCache[drop];
  }
}

function buildEdgeAndDepth(srcCanvas) {
  var W = 256, H = 256, N = W * H;
  var normalized = document.createElement('canvas');
  normalized.width = W;
  normalized.height = H;
  var sctx = normalized.getContext('2d');
  sctx.drawImage(srcCanvas, 0, 0, W, H);
  var src = sctx.getImageData(0, 0, W, H).data;
  var lum = new Float32Array(N), blur = new Float32Array(N), tmp = new Float32Array(N);
  // 1) Luminance
  for (var i = 0; i < N; i++) {
    var di = i * 4;
    lum[i] = (src[di] * 0.299 + src[di+1] * 0.587 + src[di+2] * 0.114) / 255;
  }
  // 2) Box blur 2 次 (深度基础)
  function blurH(s, d, r) {
    for (var y = 0; y < H; y++) {
      var sum = 0;
      for (var x = -r; x <= r; x++) sum += s[y * W + Math.max(0, Math.min(W-1, x))];
      for (var x = 0; x < W; x++) {
        d[y * W + x] = sum / (2*r + 1);
        var xR = Math.min(W-1, x + r + 1), xL = Math.max(0, x - r);
        sum += s[y * W + xR] - s[y * W + xL];
      }
    }
  }
  function blurV(s, d, r) {
    for (var x = 0; x < W; x++) {
      var sum = 0;
      for (var y = -r; y <= r; y++) sum += s[Math.max(0, Math.min(H-1, y)) * W + x];
      for (var y = 0; y < H; y++) {
        d[y * W + x] = sum / (2*r + 1);
        var yD = Math.min(H-1, y + r + 1), yU = Math.max(0, y - r);
        sum += s[yD * W + x] - s[yU * W + x];
      }
    }
  }
  blurH(lum, tmp, 4); blurV(tmp, blur, 4);

  // 3) Sobel 边缘 (在 blur 上做 - 减少噪声)
  var edge = new Float32Array(N);
  for (var y = 1; y < H-1; y++) for (var x = 1; x < W-1; x++) {
    var gx = -blur[(y-1)*W + (x-1)] - 2*blur[y*W + (x-1)] - blur[(y+1)*W + (x-1)]
            + blur[(y-1)*W + (x+1)] + 2*blur[y*W + (x+1)] + blur[(y+1)*W + (x+1)];
    var gy = -blur[(y-1)*W + (x-1)] - 2*blur[(y-1)*W + x] - blur[(y-1)*W + (x+1)]
            + blur[(y+1)*W + (x-1)] + 2*blur[(y+1)*W + x] + blur[(y+1)*W + (x+1)];
    edge[y*W + x] = Math.min(1.0, Math.sqrt(gx*gx + gy*gy) * 1.4);
  }
  // 4) 启发式深度:亮度 + 中心 mask + 边缘累积
  var depth = new Float32Array(N);
  for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
    var i = y*W + x;
    var cx = (x / (W-1) - 0.5) * 2.0;
    var cy = (y / (H-1) - 0.5) * 2.0;
    var rr = Math.sqrt(cx*cx + cy*cy);
    var centerBias = 1.0 - Math.min(1, rr * 0.75);
    var bright = blur[i];
    depth[i] = Math.min(1.0, bright * 0.45 + centerBias * 0.55);
  }
  // 5) fg-mask: 中心 + 高对比区
  var fg = new Float32Array(N);
  for (var i = 0; i < N; i++) {
    var d = depth[i];
    var e = edge[i];
    fg[i] = Math.min(1.0, d * 0.6 + e * 0.5);
  }

  // 输出 256×256 RGBA
  var out = document.createElement('canvas'); out.width = W; out.height = H;
  var octx = out.getContext('2d'), imgOut = octx.createImageData(W, H);
  for (var i = 0; i < N; i++) {
    var di = i * 4;
    imgOut.data[di]   = Math.round(depth[i] * 255);
    imgOut.data[di+1] = Math.round(edge[i] * 255);
    imgOut.data[di+2] = Math.round(fg[i] * 255);
    imgOut.data[di+3] = Math.round(lum[i] * 255);
  }
  octx.putImageData(imgOut, 0, 0);
  return out;
}

// AI 深度估计 (Xenova/depth-anything-small) - 异步加载, 失败回退
async function ensureAIDepthPipeline() {
  if (aiDepthReady && aiDepthPipeline) return aiDepthPipeline;
  if (aiDepthBusy) return null;
  aiDepthBusy = true;
  try {
    showAIDepthChip('加载 AI 深度模型 (首次需下载 50MB)…');
    var mod = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');
    mod.env.allowLocalModels = false;
    if (mod.env.backends && mod.env.backends.onnx && mod.env.backends.onnx.wasm) mod.env.backends.onnx.wasm.numThreads = 1;
    aiDepthPipeline = await mod.pipeline('depth-estimation', 'Xenova/depth-anything-small-hf');
    aiDepthReady = true;
    return aiDepthPipeline;
  } catch (e) {
    console.warn('AI depth pipeline failed:', e);
    return null;
  } finally {
    aiDepthBusy = false;
  }
}

function makeAIDepthInputCanvas(srcCanvas) {
  if (!srcCanvas) return srcCanvas;
  var size = 160;
  var cv = document.createElement('canvas');
  cv.width = cv.height = size;
  var ctx = cv.getContext('2d');
  try {
    ctx.drawImage(srcCanvas, 0, 0, size, size);
    return cv;
  } catch (e) {
    return srcCanvas;
  }
}

async function estimateAIDepth(srcCanvas, token) {
  if (!fx.aiDepth) return null;
  if (performance.now() < aiDepthFailUntil) return null;
  showAIDepthChip('后台增强封面深度…');
  try {
    var pipe = await ensureAIDepthPipeline();
    if (!pipe) { hideAIDepthChip(); return null; }
    if (token !== coverProcessToken) { hideAIDepthChip(); return null; }
    var inputCanvas = makeAIDepthInputCanvas(srcCanvas);
    var input = inputCanvas;
    try {
      if (inputCanvas && inputCanvas.toDataURL) input = inputCanvas.toDataURL('image/jpeg', 0.82);
    } catch (e) {
      input = inputCanvas;
    }
    var result = await pipe(input);
    if (token !== coverProcessToken) { hideAIDepthChip(); return null; }
    var raw = result && (result.depth || result.predicted_depth || result);
    var rawCv = raw && raw.toCanvas ? await raw.toCanvas() : raw;
    hideAIDepthChip();
    return rawCv;
  } catch (e) {
    console.warn('AI depth estimation failed:', e);
    aiDepthFailUntil = performance.now() + 120000;
    hideAIDepthChip();
    return null;
  }
}

function mergeAIDepthIntoEdgeTexture(heuristicCanvas, aiCanvas) {
  // 把 AI 深度 (灰度) 写入 R 通道, 保留启发式的 G/B/A
  var W = heuristicCanvas.width || 256, H = heuristicCanvas.height || 256;
  var hctx = heuristicCanvas.getContext('2d');
  var hImg = hctx.getImageData(0, 0, W, H);

  var aiTmp = document.createElement('canvas'); aiTmp.width = W; aiTmp.height = H;
  var actx = aiTmp.getContext('2d');
  actx.drawImage(aiCanvas, 0, 0, W, H);
  var aData = actx.getImageData(0, 0, W, H).data;

  // 归一化 AI 深度
  var aiVals = new Float32Array(W * H), minV = 1, maxV = 0;
  for (var i = 0; i < aiVals.length; i++) {
    var di = i * 4;
    var v = (aData[di] * 0.299 + aData[di+1] * 0.587 + aData[di+2] * 0.114) / 255;
    aiVals[i] = v; if (v < minV) minV = v; if (v > maxV) maxV = v;
  }
  var range = Math.max(0.001, maxV - minV);
  // 判断是否反相 (中心应该比边缘深, 表示前景在中)
  var centerSum = 0, centerCount = 0, edgeSum = 0, edgeCount = 0;
  for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
    var i = y * W + x;
    var cx = x / (W-1) - 0.5, cy = y / (H-1) - 0.5;
    var rr = Math.sqrt(cx*cx + cy*cy);
    if (rr < 0.22) { centerSum += aiVals[i]; centerCount++; }
    else if (rr > 0.46) { edgeSum += aiVals[i]; edgeCount++; }
  }
  var invert = (centerSum / Math.max(1, centerCount)) < (edgeSum / Math.max(1, edgeCount));

  for (var i = 0; i < aiVals.length; i++) {
    var n = (aiVals[i] - minV) / range;
    if (invert) n = 1.0 - n;
    hImg.data[i*4] = Math.round(n * 255);
  }
  hctx.putImageData(hImg, 0, 0);
  return heuristicCanvas;
}

function queueAIDepthForCover(srcCanvas, edgeCanvas, token, opts, cacheSeed, force) {
  opts = opts || {};
  if (!fx.aiDepth || !srcCanvas || !edgeCanvas) return;
  if (!force && isHiddenForBackgroundOptimization()) return;
  if (performance.now() < aiDepthFailUntil || aiDepthBusy) return;
  var now = performance.now();
  if (!force && now - aiDepthLastRunAt < aiDepthMinGapMs) return;
  aiDepthLastRunAt = now;
  scheduleVisualApply(async function(){
    if (!fx.aiDepth || token !== coverProcessToken || !coverApplyStillCurrent(opts)) return;
    await yieldToIdle(force ? 900 : 2600);
    if (!fx.aiDepth || token !== coverProcessToken || !coverApplyStillCurrent(opts)) return;
    var aiCanvas = await estimateAIDepth(srcCanvas, token);
    if (!aiCanvas || token !== coverProcessToken || !coverApplyStillCurrent(opts)) return;
    mergeAIDepthIntoEdgeTexture(edgeCanvas, aiCanvas);
    coverEdgeTex.image = edgeCanvas;
    coverEdgeTex.needsUpdate = true;
    setCoverDepthState(1, 1.0, 360);
    setCoverDepthCache(cacheSeed, edgeCanvas, true);
    showToast('AI 深度已后台增强');
  }, force ? 240 : 1800, force ? 1200 : 3000);
}

function queueAIDepthForCurrentCover(force) {
  if (!coverTex || !coverTex.image || !coverEdgeTex || !coverEdgeTex.image) return;
  if (!uniforms.uHasCover.value || !uniforms.uHasDepth.value) return;
  queueAIDepthForCover(coverTex.image, coverEdgeTex.image, coverProcessToken, {}, '', !!force);
}

// 颜色渐变 tween (切歌时旧封面→新封面)
var colorMixTween = null;
function startColorMixTween(durationMs) {
  if (colorMixTween) cancelAnimationFrame(colorMixTween.raf);
  durationMs = Math.max(1, durationMs || 1);
  var start = performance.now();
  uniforms.uColorMixT.value = 0;
  function step(now) {
    var t = Math.min(1, (now - start) / durationMs);
    t = visualEase(t);
    uniforms.uColorMixT.value = t;
    if (t < 1) colorMixTween = { raf: requestAnimationFrame(step) };
    else colorMixTween = null;
  }
  colorMixTween = { raf: requestAnimationFrame(step) };
}

// 粒子整体透明度 tween (启动 fade-in)
var alphaTween = null;
var floatAlphaTween = null;
var IDLE_PARTICLE_ALPHA = 0;
function tweenParticleAlpha(from, to, durationMs) {
  if (alphaTween) cancelAnimationFrame(alphaTween.raf);
  var start = performance.now();
  function step(now) {
    var t = Math.min(1, (now - start) / durationMs);
    t = t * t * (3 - 2 * t);
    uniforms.uAlpha.value = from + (to - from) * t;
    if (t < 1) alphaTween = { raf: requestAnimationFrame(step) };
    else alphaTween = null;
  }
  alphaTween = { raf: requestAnimationFrame(step) };
}
function tweenFloatAlpha(from, to, durationMs) {
  if (floatAlphaTween) cancelAnimationFrame(floatAlphaTween.raf);
  var start = performance.now();
  function step(now) {
    var t = Math.min(1, (now - start) / durationMs);
    t = t * t * (3 - 2 * t);
    uniforms.uFloatAlpha.value = from + (to - from) * t;
    if (t < 1) floatAlphaTween = { raf: requestAnimationFrame(step) };
    else floatAlphaTween = null;
  }
  floatAlphaTween = { raf: requestAnimationFrame(step) };
}
function revealIdleParticles(target, durationMs) {
  if (!uniforms || !uniforms.uFloatAlpha) return;
  if (floatAlphaTween) { cancelAnimationFrame(floatAlphaTween.raf); floatAlphaTween = null; }
  uniforms.uFloatAlpha.value = 0;
  if (floatGroup) destroyFloatLayer();
  return;
  var next = typeof target === 'number' ? target : IDLE_PARTICLE_ALPHA;
  var from = uniforms.uFloatAlpha.value || 0;
  if (from >= next - 0.01) return;
  tweenFloatAlpha(from, next, durationMs || 1800);
}

// 加载形态 tween (uLoading 0..1)
var loadingTween = null;
var loadingShownAt = 0;
var loadingHideTimer = null;
var coverDepthTween = null;
function visualEase(t) {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
}
function tweenLoading(to, durationMs, onComplete) {
  if (loadingTween) cancelAnimationFrame(loadingTween.raf);
  durationMs = Math.max(1, durationMs || 1);
  if (isHiddenForBackgroundOptimization() || isDeepBackgroundMode()) {
    uniforms.uLoading.value = to;
    loadingTween = null;
    if (onComplete) onComplete();
    return;
  }
  var start = performance.now();
  var from = uniforms.uLoading.value;
  function step(now) {
    var t = Math.min(1, (now - start) / durationMs);
    var eased = visualEase(t);
    uniforms.uLoading.value = from + (to - from) * eased;
    if (t < 1) loadingTween = { raf: requestAnimationFrame(step) };
    else {
      uniforms.uLoading.value = to;
      loadingTween = null;
      if (onComplete) onComplete();
    }
  }
  loadingTween = { raf: requestAnimationFrame(step) };
}
function showLoading() {
  loadingShownAt = performance.now();
  if (loadingHideTimer) {
    clearTimeout(loadingHideTimer);
    loadingHideTimer = null;
  }
  var current = uniforms.uLoading.value || 0;
  tweenLoading(Math.max(current, 0.56), current > 0.04 ? 86 : 118);
}
function hideLoading() {
  if (loadingHideTimer) clearTimeout(loadingHideTimer);
  if (isHiddenForBackgroundOptimization() || isDeepBackgroundMode()) {
    forceLoadingSettled('background-hide');
    return;
  }
  var elapsed = loadingShownAt ? performance.now() - loadingShownAt : 999;
  var wait = Math.max(0, 72 - elapsed);
  loadingHideTimer = setTimeout(function(){
    loadingHideTimer = null;
    var current = uniforms.uLoading.value || 0;
    if (current <= 0.015 || isHiddenForBackgroundOptimization() || isDeepBackgroundMode()) {
      if (loadingTween) {
        cancelAnimationFrame(loadingTween.raf);
        loadingTween = null;
      }
      uniforms.uLoading.value = 0;
      return;
    }
    tweenLoading(0, current > 0.38 ? 126 : 96);
  }, wait);
}
function forceLoadingSettled(reason) {
  if (loadingHideTimer) {
    clearTimeout(loadingHideTimer);
    loadingHideTimer = null;
  }
  if (loadingTween) {
    cancelAnimationFrame(loadingTween.raf);
    loadingTween = null;
  }
  uniforms.uLoading.value = 0;
  loadingShownAt = 0;
  if (reason && window.__mineradioDebugLoading) console.log('[LoadingSettled]', reason);
}
function recoverVisualsAfterBackground(reason) {
  applyRendererPowerMode();
  if (typeof scheduleMainRendererViewportRefresh === 'function') scheduleMainRendererViewportRefresh(reason || 'restore');
  if (audio && audio.src && !audio.paused && ((uniforms.uLoading.value || 0) > 0.015 || loadingTween || loadingHideTimer)) {
    forceLoadingSettled(reason || 'restore');
  }
  if (typeof markRenderInteraction === 'function') markRenderInteraction('restore', 1100);
}

function setCoverDepthState(depthTo, aiTo, durationMs) {
  depthTo = Math.max(0, Math.min(1, Number(depthTo) || 0));
  aiTo = Math.max(0, Math.min(1, Number(aiTo) || 0));
  if (coverDepthTween) {
    cancelAnimationFrame(coverDepthTween.raf);
    coverDepthTween = null;
  }
  durationMs = Math.max(1, durationMs || 1);
  var depthFrom = uniforms.uHasDepth.value || 0;
  var aiFrom = uniforms.uAiBoost.value || 0;
  if (durationMs <= 1 || (Math.abs(depthFrom - depthTo) < 0.001 && Math.abs(aiFrom - aiTo) < 0.001)) {
    uniforms.uHasDepth.value = depthTo;
    uniforms.uAiBoost.value = aiTo;
    return;
  }
  var start = performance.now();
  function step(now) {
    var t = Math.min(1, (now - start) / durationMs);
    var eased = visualEase(t);
    uniforms.uHasDepth.value = depthFrom + (depthTo - depthFrom) * eased;
    uniforms.uAiBoost.value = aiFrom + (aiTo - aiFrom) * eased;
    if (t < 1) coverDepthTween = { raf: requestAnimationFrame(step) };
    else {
      uniforms.uHasDepth.value = depthTo;
      uniforms.uAiBoost.value = aiTo;
      coverDepthTween = null;
    }
  }
  coverDepthTween = { raf: requestAnimationFrame(step) };
}

function coverApplyStillCurrent(opts) {
  opts = opts || {};
  return !opts.trackToken || opts.trackToken === trackSwitchToken;
}

function setControlCoverSrc(src) {
  var cover = document.getElementById('control-cover');
  if (!cover) return;
  if (!src) {
    cover.style.backgroundImage = '';
    cover.classList.add('cover-empty');
    return;
  }
  cover.style.backgroundImage = 'url("' + String(src).replace(/"/g, '\\"') + '")';
  cover.classList.remove('cover-empty');
}

function updateControlTrackInfo(song) {
  song = song || {};
  var title = document.getElementById('control-title');
  var artist = document.getElementById('control-artist');
  if (title) title.textContent = song.name || '';
  if (artist) artist.textContent = song.artist || '';
}

function applyCoverCanvas(cv, thumbSrc, opts) {
  opts = opts || {};
  if (!cv || !coverApplyStillCurrent(opts)) return;
  var token = ++coverProcessToken;
  if (opts.coverSource && opts.coverSourceKind) {
    currentCoverSource = { kind: opts.coverSourceKind, src: opts.coverSource };
  }
  var cacheSeed = (opts.coverKey || thumbSrc || '') + '|tex=' + (cv.width || 0) + 'x' + (cv.height || 0);
  var cachedDepth = getCoverDepthCache(cacheSeed);
  // 切歌颜色渐变: 把当前 coverTex 当作 prevCoverTex
  if (uniforms.uHasCover.value > 0.5 && coverTex.image) {
    var prevW = coverTex.image.width || 256;
    var prevH = coverTex.image.height || 256;
    var prevScale = Math.min(1, 256 / Math.max(prevW, prevH, 1));
    var prevCv = document.createElement('canvas');
    prevCv.width = Math.max(1, Math.round(prevW * prevScale));
    prevCv.height = Math.max(1, Math.round(prevH * prevScale));
    try {
      prevCv.getContext('2d').drawImage(coverTex.image, 0, 0, prevCv.width, prevCv.height);
      prevCoverTex.image = prevCv;
      prevCoverTex.needsUpdate = true;
    } catch (e) {}
  }
  coverTex.image = cv; coverTex.needsUpdate = true;
  coverPickerCanvas = cv;
  uniforms.uHasCover.value = 1;
  if (cachedDepth && cachedDepth.canvas) {
    coverEdgeTex.image = cachedDepth.canvas;
    coverEdgeTex.needsUpdate = true;
    setCoverDepthState(1, cachedDepth.ai ? 1.0 : 0.55, opts.deferHeavy ? 180 : 120);
  } else {
    setCoverDepthState(opts.deferHeavy ? (uniforms.uHasDepth.value > 0.5 ? 0.22 : 0) : 0, opts.deferHeavy ? 0.20 : 0, opts.deferHeavy ? 120 : 1);
  }

  if (thumbSrc) {
    document.getElementById('thumb-cover').src = thumbSrc;
    setControlCoverSrc(thumbSrc);
  }
  if (shelfManager) shelfManager.onCoverChange(thumbSrc);

  // 启动颜色渐变 (1.4 秒)
  var colorMixMs = opts.colorMixDuration || (fx.preset === 0 ? 520 : 1400);
  startColorMixTween(opts.fromResolutionChange ? (fx.preset === 0 ? 300 : 520) : colorMixMs);

  function refreshCoverDependentColors() {
    if (token !== coverProcessToken || !coverApplyStillCurrent(opts)) return;
    if (floatGroup) refreshFloatColorsFromCover(cv);
    if (backCoverGroup) refreshBackCoverColorsFromCanvas(cv);
    updateLyricPaletteFromCover(cv);
  }

  function runHeavyCoverWork() {
    if (token !== coverProcessToken || !coverApplyStillCurrent(opts)) return;
    if (opts.deferHeavy && typeof isRenderInteractionActive === 'function' && isRenderInteractionActive()) {
      scheduleVisualApply(runHeavyCoverWork, 420, heavyTimeout || 1800);
      return;
    }
    var edgeCv = buildEdgeAndDepth(cv);
    if (token !== coverProcessToken || !coverApplyStillCurrent(opts)) return;
    setCoverDepthCache(cacheSeed, edgeCv, false);
    coverEdgeTex.image = edgeCv; coverEdgeTex.needsUpdate = true;
    setCoverDepthState(1, 0.55, opts.deferHeavy ? 260 : 180);
    refreshCoverDependentColors();

    queueAIDepthForCover(cv, edgeCv, token, opts, cacheSeed, false);
  }
  if (cachedDepth && cachedDepth.canvas) {
    scheduleVisualApply(refreshCoverDependentColors, opts.deferHeavy ? 260 : 90, opts.deferHeavy ? 1200 : 700);
    if (!cachedDepth.ai) queueAIDepthForCover(cv, cachedDepth.canvas, token, opts, cacheSeed, false);
    return;
  }
  var heavyDelay = opts.deferHeavy ? (opts.delay || 620) : (opts.delay || 120);
  var heavyTimeout = opts.deferHeavy ? (opts.timeout || 1800) : (opts.timeout || 900);
  scheduleVisualApply(runHeavyCoverWork, heavyDelay, heavyTimeout);
}

