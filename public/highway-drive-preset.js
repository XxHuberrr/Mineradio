/**
 * Highway Drive visual preset for Mineradio.
 * A bounded first-person road scene driven by the shared eight-band sonic monitor.
 */
(function (global) {
  'use strict';

  var INDEX = 9;
  var ROAD_SEGMENT_COUNT = 112;
  var ROAD_COLUMN_COUNT = 17;
  var ROAD_BAND_COUNT = 8;
  var ROAD_NEAR = 1.4;
  var ROAD_LENGTH = 98;
  var ROAD_SPECTRUM_SAMPLE_COUNT = ROAD_SEGMENT_COUNT + 1;
  var ROAD_SPECTRUM_STEP = ROAD_LENGTH / ROAD_SEGMENT_COUNT;
  var ROAD_TRACK_LANE_BANDS = [[0, 4], [2, 6], [3, 7], [1, 5]];
  var ROAD_TRACK_LANE_CENTERS = [-0.67, -0.17, 0.17, 0.67];
  var ROAD_TRACK_LANE_SEQUENCE = [1, 2, 0, 3, 2, 0, 3, 1];
  var ROAD_TRACK_LANE_COUNT = ROAD_TRACK_LANE_BANDS.length;
  var ROAD_TRACK_MAX_EVENT_LANES = 2;
  var ROAD_TRACK_MIN_EVENT_GAP = 0.12;
  var ROAD_TRACK_ONSET_THRESHOLD = 0.15;
  var ROAD_HALF_WIDTH = 3.7;
  var SHOULDER_HALF_WIDTH = 26;
  var ROAD_BASE_Y = -1.62;
  var LIGHT_PAIR_COUNT = 24;
  var LIGHT_SPACING = 6.4;
  var MAX_CAMERA_ROLL = 0.012;
  var CAMERA_ROLL_RESPONSE = 1.15;
  var SCENERY_INSTANCE_COUNT = 28;
  var SCENERY_SPACING = 5.4;
  var SCENERY_PASS_DISTANCE = 6;
  var BIOME_ZONE_LENGTH = 420;
  var WEATHER_TRANSITION_START = 0.72;
  var PRECIPITATION_COUNT = 384;
  var LANDMARK_SPACING = 148;
  var LANDMARK_PASS_DISTANCE = 12;
  var BIOME_NAMES = ['mountains', 'river', 'hills', 'desert', 'beach', 'grassland'];
  var WEATHER_NAMES = ['clear-day', 'golden-hour', 'rain', 'snow', 'starry-night', 'aurora'];
  var CELESTIAL_NAMES = ['moon', 'mars', 'jupiter', 'saturn', 'neptune', 'venus', 'mercury'];
  var CELESTIAL_TEXTURE_PATH = 'assets/highway-planets/';
  var CELESTIAL_TEXTURE_FILES = ['moon.jpg', 'mars.jpg', 'jupiter.jpg', 'saturn.jpg', 'neptune.jpg', 'venus.jpg', 'mercury.jpg'];
  var CELESTIAL_CONFIG = [
    { radius: 4.25, flatten: 1.00, tilt: 0.12, spin: 0.040, color: 0xc8c8c2, shininess: 3 },
    { radius: 4.05, flatten: 0.99, tilt: 0.44, spin: 0.035, color: 0xb44725, shininess: 4 },
    { radius: 5.05, flatten: 0.93, tilt: 0.05, spin: 0.062, color: 0xd6ad78, shininess: 8 },
    { radius: 4.75, flatten: 0.91, tilt: 0.47, spin: 0.057, color: 0xd8bd82, shininess: 7, ring: true },
    { radius: 4.55, flatten: 0.98, tilt: 0.49, spin: 0.047, color: 0x397bd8, shininess: 10 },
    { radius: 4.35, flatten: 0.99, tilt: 0.05, spin: 0.028, color: 0xd9a95d, shininess: 8 },
    { radius: 3.75, flatten: 1.00, tilt: 0.03, spin: 0.032, color: 0x898783, shininess: 3 }
  ];
  var WEATHER_BY_BIOME_TOUR = [
    [3, 2, 0, 1, 0, 4],
    [5, 2, 0, 1, 1, 4]
  ];
  var LANDMARK_NAMES = [
    'Eiffel Tower',
    'Big Ben',
    'Burj Khalifa',
    'Taj Mahal',
    'Sydney Opera House',
    'Pyramids of Giza',
    'Oriental Pearl Tower',
    'Empire State Building'
  ];
  var BIOME_PALETTES = [
    { ground: 0x071411, mountain: 0x29424a, mound: 0x18382e, trunk: 0x26362f, crown: 0x315b49, water: 0x16424d },
    { ground: 0x071817, mountain: 0x24444a, mound: 0x183d32, trunk: 0x263b32, crown: 0x2b6550, water: 0x137b96 },
    { ground: 0x0a1d11, mountain: 0x2e4c3c, mound: 0x2d6538, trunk: 0x304334, crown: 0x4d7a45, water: 0x1c5968 },
    { ground: 0x241607, mountain: 0x76502c, mound: 0xa06a32, trunk: 0x4d5b35, crown: 0x39704d, water: 0x1d5867 },
    { ground: 0x3c2914, mountain: 0x7a5b38, mound: 0xb8884d, trunk: 0x5b4028, crown: 0x397454, water: 0x1688a5 },
    { ground: 0x092111, mountain: 0x315342, mound: 0x347442, trunk: 0x314637, crown: 0x4d8555, water: 0x1a6572 }
  ];
  var BAND_KEYS = ['subBass', 'bass', 'lowMid', 'mid', 'highMid', 'presence', 'brilliance', 'air'];
  var celestialTextureCache = null;

  var state = {
    root: null,
    scene: null,
    road: null,
    roadMaterial: null,
    shoulder: null,
    shoulderMaterial: null,
    leftRail: null,
    rightRail: null,
    poleMesh: null,
    leftLights: null,
    rightLights: null,
    poleMaterial: null,
    leftLightMaterial: null,
    rightLightMaterial: null,
    sky: null,
    skyMaterial: null,
    precipitation: null,
    precipitationMaterial: null,
    celestialRoot: null,
    celestialMesh: null,
    celestialMaterial: null,
    celestialRing: null,
    celestialRingMaterial: null,
    sceneryRoot: null,
    sceneryMaterials: null,
    mountainMesh: null,
    moundMesh: null,
    treeTrunkMesh: null,
    treeCrownMesh: null,
    cactusStemMesh: null,
    cactusArmMesh: null,
    leftWater: null,
    rightWater: null,
    landmarkRoot: null,
    landmarks: [],
    landmarkMaterials: null,
    roadPositions: null,
    roadEnergy: null,
    roadPulse: null,
    roadTrackPulse: null,
    spectrumEnergyHistory: null,
    spectrumPulseHistory: null,
    trackPulseHistory: null,
    spectrumHead: -1,
    spectrumSamples: 0,
    spectrumDistance: 0,
    spectrumWavePeak: 0,
    trackNotePeak: 0,
    spectrumEventLanePeak: 0,
    pendingTrigger: 0,
    trackEventIndex: 0,
    lastTrackLane: -1,
    trackVisitedMask: 0,
    trackCueAge: 0,
    trackCueCooldown: 0,
    trackPreviousBeat: 0,
    trackPreviousBands: [0, 0, 0, 0, 0, 0, 0, 0],
    shoulderPositions: null,
    leftRailPositions: null,
    rightRailPositions: null,
    dummy: null,
    rollQuaternion: null,
    rollAxis: null,
    roll: 0,
    biomeIndex: -1,
    nextBiomeIndex: -1,
    biomeBlend: 0,
    biomeFade: 0,
    leftWaterAmount: 0,
    rightWaterAmount: 0,
    weatherIndex: 0,
    nextWeatherIndex: 0,
    weatherBlend: 0,
    celestialIndex: 0,
    nextCelestialIndex: 0,
    activeCelestialIndex: -1,
    activeCelestialZone: -1,
    celestialOpacity: 0,
    celestialAxialTilt: 0,
    celestialAxisAzimuth: 0,
    celestialAxisX: 0,
    celestialAxisZ: 0,
    rainAmount: 0,
    snowAmount: 0,
    visibleLandmark: '',
    opacity: 0,
    travel: 0,
    time: 0,
    speed: 12,
    boost: 0,
    beat: 0,
    lastTrigger: 0,
    seed: 0,
    initialized: false,
    bands: [0, 0, 0, 0, 0, 0, 0, 0]
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
  }

  function clamp01(value) {
    return clamp(Number(value) || 0, 0, 1);
  }

  function lerp(a, b, amount) {
    return a + (b - a) * amount;
  }

  function damp(current, target, speed, dt) {
    return current + (target - current) * (1 - Math.exp(-Math.max(0, speed) * Math.max(0.001, dt || 1 / 60)));
  }

  function smoothstep(value) {
    var t = clamp01(value);
    return t * t * (3 - 2 * t);
  }

  function hash1(index, seed) {
    var x = Math.sin(index * 127.1 + seed * 311.7) * 43758.5453123;
    return (x - Math.floor(x)) * 2 - 1;
  }

  function valueNoise1D(value, seed) {
    var index = Math.floor(value);
    var fraction = value - index;
    var blend = smoothstep(fraction);
    return lerp(hash1(index, seed), hash1(index + 1, seed), blend);
  }

  function positiveModulo(value, divisor) {
    return ((value % divisor) + divisor) % divisor;
  }

  function recycledWorldPlacement(index, spacing, count, leadOffset, travel, passDistance) {
    var cycleLength = Math.max(spacing, count * spacing);
    var firstWorldDistance = leadOffset + index * spacing;
    var recycleCount = Math.max(0, Math.ceil((travel - passDistance - firstWorldDistance) / cycleLength));
    var worldDistance = firstWorldDistance + recycleCount * cycleLength;
    return {
      ahead: worldDistance - travel,
      slot: Math.floor(worldDistance / spacing),
      worldDistance: worldDistance,
      recycleCount: recycleCount
    };
  }

  function biomeIndexAtDistance(distance, seed) {
    var offset = positiveModulo(Math.floor((Number(seed) || 0) * 13), BIOME_NAMES.length);
    var zone = Math.floor(Math.max(0, Number(distance) || 0) / BIOME_ZONE_LENGTH);
    return positiveModulo(zone + offset, BIOME_NAMES.length);
  }

  function biomeStateAtDistance(distance, seed) {
    var safeDistance = Math.max(0, Number(distance) || 0);
    var currentIndex = biomeIndexAtDistance(safeDistance, seed);
    var nextIndex = biomeIndexAtDistance(safeDistance + BIOME_ZONE_LENGTH, seed);
    var progress = positiveModulo(safeDistance, BIOME_ZONE_LENGTH) / BIOME_ZONE_LENGTH;
    return {
      index: currentIndex,
      name: BIOME_NAMES[currentIndex],
      nextIndex: nextIndex,
      nextName: BIOME_NAMES[nextIndex],
      blend: smoothstep((progress - WEATHER_TRANSITION_START) / (1 - WEATHER_TRANSITION_START)),
      progress: progress,
      zone: Math.floor(safeDistance / BIOME_ZONE_LENGTH)
    };
  }

  function weatherIndexForSequence(sequenceIndex) {
    var biomeIndex = positiveModulo(sequenceIndex, BIOME_NAMES.length);
    var tourIndex = positiveModulo(Math.floor(sequenceIndex / BIOME_NAMES.length), WEATHER_BY_BIOME_TOUR.length);
    return WEATHER_BY_BIOME_TOUR[tourIndex][biomeIndex];
  }

  function celestialIndexForZone(zone, seed) {
    var safeZone = Math.max(0, Math.floor(Number(zone) || 0));
    var weatherOffset = positiveModulo(Math.floor((Number(seed) || 0) * 13), BIOME_NAMES.length);
    var celestialOffset = positiveModulo(Math.floor((Number(seed) || 0) * 17), CELESTIAL_NAMES.length);
    var nightOrdinal = 0;
    for (var index = 0; index < safeZone; index++) {
      if (weatherIndexForSequence(index + weatherOffset) >= 4) nightOrdinal += 1;
    }
    return positiveModulo(3 + nightOrdinal * 2 + celestialOffset, CELESTIAL_NAMES.length);
  }

  function celestialPositionForZone(zone, seed) {
    var safeZone = Math.max(0, Math.floor(Number(zone) || 0));
    var safeSeed = Number(seed) || 0;
    var side = hash1(safeZone + 17, safeSeed + 503) >= 0 ? 1 : -1;
    var horizontal = 17.5 + (hash1(safeZone + 31, safeSeed + 587) + 1) * 1.75;
    var height = 17 + (hash1(safeZone + 47, safeSeed + 643) + 1) * 1.75;
    var depth = -74 - (hash1(safeZone + 59, safeSeed + 701) + 1) * 3;
    return { x: side * horizontal, y: height, z: depth, side: side < 0 ? 'left' : 'right' };
  }

  function celestialAxialTiltForZone(zone, index, seed) {
    var safeZone = Math.max(0, Math.floor(Number(zone) || 0));
    var safeIndex = Math.max(0, Math.min(CELESTIAL_CONFIG.length - 1, Math.round(Number(index) || 0)));
    var safeSeed = Number(seed) || 0;
    var baseTilt = CELESTIAL_CONFIG[safeIndex].tilt;
    var tiltVariation = (hash1(safeZone + 83, safeSeed + safeIndex * 137 + 761) + 1) * 0.5;
    var fineVariation = (hash1(safeZone + 109, safeSeed + safeIndex * 191 + 823) + 1) * 0.5;
    var angle = clamp(baseTilt * (0.78 + tiltVariation * 0.44) + fineVariation * 0.036, 0.025, 0.62);
    var azimuth = (hash1(safeZone + 131, safeSeed + safeIndex * 223 + 887) + 1) * Math.PI;
    var spinPhase = (hash1(safeZone + 157, safeSeed + safeIndex * 257 + 947) + 1) * Math.PI;
    return {
      angle: angle,
      azimuth: azimuth,
      x: Math.sin(azimuth) * angle,
      z: Math.cos(azimuth) * angle,
      spinPhase: spinPhase
    };
  }

  function weatherStateAtDistance(distance, seed) {
    var safeDistance = Math.max(0, Number(distance) || 0);
    var seedOffset = positiveModulo(Math.floor((Number(seed) || 0) * 13), BIOME_NAMES.length);
    var rawZone = Math.floor(safeDistance / BIOME_ZONE_LENGTH);
    var sequence = rawZone + seedOffset;
    var progress = positiveModulo(safeDistance, BIOME_ZONE_LENGTH) / BIOME_ZONE_LENGTH;
    var currentIndex = weatherIndexForSequence(sequence);
    var nextIndex = weatherIndexForSequence(sequence + 1);
    var blend = smoothstep((progress - WEATHER_TRANSITION_START) / (1 - WEATHER_TRANSITION_START));
    return {
      index: currentIndex,
      name: WEATHER_NAMES[currentIndex],
      nextIndex: nextIndex,
      nextName: WEATHER_NAMES[nextIndex],
      blend: blend,
      progress: progress,
      zone: rawZone
    };
  }

  function landmarkIndexAtDistance(distance) {
    return positiveModulo(Math.floor(Math.max(0, Number(distance) || 0) / LANDMARK_SPACING), LANDMARK_NAMES.length);
  }

  function roadCenterAt(distance, seed) {
    var broad = valueNoise1D(distance / 168 + 17.3, seed + 11) * 5.2;
    var turn = valueNoise1D(distance / 88 + 43.7, seed + 29) * 2.6;
    var drift = valueNoise1D(distance / 320 + 91.2, seed + 47) * 3.4;
    return broad + turn + drift;
  }

  function roadElevationAt(distance, seed) {
    return valueNoise1D(distance / 180 + 9.4, seed + 73) * 0.24
      + valueNoise1D(distance / 82 + 31.8, seed + 97) * 0.07;
  }

  function localRoadSample(ahead) {
    var base = state.travel;
    var center = roadCenterAt(base, state.seed);
    var heading = (roadCenterAt(base + 0.8, state.seed) - roadCenterAt(base - 0.8, state.seed)) / 1.6;
    var elevation = roadElevationAt(base, state.seed);
    var slope = (roadElevationAt(base + 1.2, state.seed) - roadElevationAt(base - 1.2, state.seed)) / 2.4;
    return {
      x: roadCenterAt(base + ahead, state.seed) - center - heading * ahead,
      y: roadElevationAt(base + ahead, state.seed) - elevation - slope * ahead
    };
  }

  function normalizeHex(value, fallback) {
    value = value == null ? '' : String(value).trim();
    if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
    if (/^#[0-9a-fA-F]{3}$/.test(value)) {
      return '#' + value.slice(1).split('').map(function (part) { return part + part; }).join('');
    }
    if (typeof global.lyricPaletteColorToHex === 'function') {
      return global.lyricPaletteColorToHex(value, fallback, 0.42);
    }
    return fallback;
  }

  function readTheme(fx) {
    var stage = global.stageLyrics || {};
    var palette = stage.coverPalette || stage.palette || {};
    var fallbackPrimary = normalizeHex(fx && fx.visualTintColor, '#26d9ff');
    var primary = new THREE.Color(normalizeHex(palette.primary, fallbackPrimary));
    var secondary = new THREE.Color(normalizeHex(palette.secondary, '#ffad42'));
    var accent = new THREE.Color(normalizeHex(palette.highlight, '#f7fbff'));
    var colorDistance = Math.abs(primary.r - secondary.r) + Math.abs(primary.g - secondary.g) + Math.abs(primary.b - secondary.b);
    if (colorDistance < 0.28) secondary.lerp(new THREE.Color('#ffad42'), 0.72);
    accent.lerp(new THREE.Color('#ffffff'), 0.28);
    return { primary: primary, secondary: secondary, accent: accent };
  }

  function readAudio(raw) {
    raw = raw || {};
    var detailed = raw.sonicDetailed || raw.subBass != null || raw.lowMid != null || raw.highMid != null;
    var bass = clamp01(raw.bass);
    var mid = clamp01(raw.mid);
    var treble = clamp01(raw.treble);
    var beat = clamp01(raw.beat);
    var energy = clamp01(raw.energy);
    var bands = detailed ? BAND_KEYS.map(function (key) { return clamp01(raw[key]); }) : [
      clamp01(bass * 0.58 + beat * 0.48),
      clamp01(bass * 0.82 + beat * 0.26),
      clamp01(mid * 0.54 + bass * 0.16),
      clamp01(mid * 0.88 + energy * 0.08),
      clamp01(treble * 0.48 + mid * 0.22),
      clamp01(treble * 0.62 + beat * 0.10),
      clamp01(treble * 0.76 + energy * 0.06),
      clamp01(treble * 0.45 + energy * 0.10)
    ];
    return {
      bands: bands,
      energy: energy,
      beat: clamp01(raw.kickEnvelope != null ? raw.kickEnvelope : beat),
      trigger: clamp01(Math.max(Number(raw.triggerPulse) || 0, Number(raw.kickOnset) || 0, beat * 0.72))
    };
  }

  function buildRoadGeometry() {
    var rows = ROAD_SEGMENT_COUNT + 1;
    var vertexCount = rows * ROAD_COLUMN_COUNT;
    var positions = new Float32Array(vertexCount * 3);
    var uv = new Float32Array(vertexCount * 2);
    var energy = new Float32Array(vertexCount);
    var pulse = new Float32Array(vertexCount);
    var trackPulse = new Float32Array(vertexCount);
    var indices = [];
    for (var row = 0; row < rows; row++) {
      for (var column = 0; column < ROAD_COLUMN_COUNT; column++) {
        var vertex = row * ROAD_COLUMN_COUNT + column;
        uv[vertex * 2] = column / (ROAD_COLUMN_COUNT - 1);
        uv[vertex * 2 + 1] = row / ROAD_SEGMENT_COUNT;
        if (row < ROAD_SEGMENT_COUNT && column < ROAD_COLUMN_COUNT - 1) {
          var next = vertex + ROAD_COLUMN_COUNT;
          indices.push(vertex, next, vertex + 1, next, next + 1, vertex + 1);
        }
      }
    }
    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geometry.setAttribute('aBandEnergy', new THREE.BufferAttribute(energy, 1));
    geometry.setAttribute('aBandPulse', new THREE.BufferAttribute(pulse, 1));
    geometry.setAttribute('aTrackPulse', new THREE.BufferAttribute(trackPulse, 1));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    state.roadPositions = positions;
    state.roadEnergy = energy;
    state.roadPulse = pulse;
    state.roadTrackPulse = trackPulse;
    resetSpectrumHistory();
    return geometry;
  }

  function roadVertexShader() {
    return [
      'precision highp float;',
      'attribute float aBandEnergy;',
      'attribute float aBandPulse;',
      'attribute float aTrackPulse;',
      'varying vec2 vUv;',
      'varying float vBandEnergy;',
      'varying float vBandPulse;',
      'varying float vTrackPulse;',
      'varying float vDepth;',
      'void main(){',
      '  vUv=uv;',
      '  vBandEnergy=aBandEnergy;',
      '  vBandPulse=aBandPulse;',
      '  vTrackPulse=aTrackPulse;',
      '  vDepth=max(0.0,-position.z);',
      '  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);',
      '}'
    ].join('\n');
  }

  function roadFragmentShader() {
    return [
      'precision highp float;',
      'uniform float uTime;',
      'uniform float uTravel;',
      'uniform float uBeat;',
      'uniform float uBoost;',
      'uniform float uOpacity;',
      'uniform vec3 uPrimary;',
      'uniform vec3 uSecondary;',
      'uniform vec3 uAccent;',
      'varying vec2 vUv;',
      'varying float vBandEnergy;',
      'varying float vBandPulse;',
      'varying float vTrackPulse;',
      'varying float vDepth;',
      'void main(){',
      '  float side=abs(vUv.x*2.0-1.0);',
      '  float fog=1.0-smoothstep(54.0,98.0,vDepth);',
      '  float laneDist=min(abs(side-0.34),side);',
      '  float dash=step(0.48,fract((vDepth+uTravel)*0.115));',
      '  float lane=(1.0-smoothstep(0.010,0.030,laneDist))*dash;',
      '  float edge=1.0-smoothstep(0.010,0.040,abs(side-0.955));',
      '  float crossGrid=1.0-smoothstep(0.025,0.105,abs(fract((vDepth+uTravel)*0.185)-0.5));',
      '  float trackCell=smoothstep(0.022,0.080,laneDist);',
      '  vec3 bandColor=mix(uPrimary,uSecondary,smoothstep(0.08,0.92,side));',
      '  vec3 asphalt=mix(vec3(0.010,0.015,0.026),bandColor,0.048+vBandEnergy*0.090);',
      '  float spectrum=(0.14+vBandEnergy*0.92)*(0.28+crossGrid*0.72);',
      '  float waveGlow=pow(max(vBandPulse,0.0),1.16)*(0.30+crossGrid*0.70);',
      '  float trackGlow=pow(max(vTrackPulse,0.0),1.08)*trackCell;',
      '  vec3 color=asphalt+bandColor*spectrum*0.48;',
      '  color+=uAccent*lane*(0.82+uBoost*0.58+uBeat*0.12);',
      '  color+=mix(uPrimary,uSecondary,step(0.5,vUv.x))*edge*(0.96+vBandEnergy*0.72);',
      '  color+=bandColor*pow(max(vBandEnergy,0.0),1.22)*0.62;',
      '  color+=mix(bandColor,uAccent,0.30)*waveGlow*0.82;',
      '  color+=mix(bandColor,uAccent,0.72)*trackGlow*1.46;',
      '  float alpha=uOpacity*fog*(0.94+min(0.05,spectrum*0.03));',
      '  gl_FragColor=vec4(color,alpha);',
      '}'
    ].join('\n');
  }

  function buildRoadMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uTravel: { value: 0 },
        uBeat: { value: 0 },
        uBoost: { value: 0 },
        uOpacity: { value: 0 },
        uPrimary: { value: new THREE.Color('#26d9ff') },
        uSecondary: { value: new THREE.Color('#ffad42') },
        uAccent: { value: new THREE.Color('#ffffff') }
      },
      vertexShader: roadVertexShader(),
      fragmentShader: roadFragmentShader(),
      transparent: true,
      depthWrite: true,
      depthTest: true,
      side: THREE.DoubleSide
    });
  }

  function skyVertexShader() {
    return [
      'precision highp float;',
      'varying vec2 vUv;',
      'void main(){',
      '  vUv=uv;',
      '  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);',
      '}'
    ].join('\n');
  }

  function skyFragmentShader() {
    return [
      'precision highp float;',
      'uniform float uTime;',
      'uniform float uOpacity;',
      'uniform float uMode;',
      'uniform float uNextMode;',
      'uniform float uBlend;',
      'varying vec2 vUv;',
      'float hash21(vec2 p){',
      '  return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);',
      '}',
      'float noise2(vec2 p){',
      '  vec2 i=floor(p);',
      '  vec2 f=fract(p);',
      '  f=f*f*(3.0-2.0*f);',
      '  return mix(mix(hash21(i),hash21(i+vec2(1.0,0.0)),f.x),mix(hash21(i+vec2(0.0,1.0)),hash21(i+vec2(1.0,1.0)),f.x),f.y);',
      '}',
      'float fbm(vec2 p){',
      '  float value=0.0;',
      '  float weight=0.54;',
      '  for(int i=0;i<4;i++){',
      '    value+=noise2(p)*weight;',
      '    p=p*2.03+vec2(17.3,9.1);',
      '    weight*=0.48;',
      '  }',
      '  return value;',
      '}',
      'float sunDisc(vec2 uv,vec2 center,float radius){',
      '  vec2 delta=vec2((uv.x-center.x)*1.65,uv.y-center.y);',
      '  return 1.0-smoothstep(radius,radius+0.012,length(delta));',
      '}',
      'float cloudField(vec2 uv,float scale,float drift){',
      '  vec2 p=vec2(uv.x*scale-uTime*drift,uv.y*scale*1.34);',
      '  return fbm(p)+noise2(p*0.42+7.8)*0.22;',
      '}',
      'float stars(vec2 uv){',
      '  vec2 grid=uv*vec2(190.0,108.0);',
      '  vec2 cell=floor(grid);',
      '  vec2 point=fract(grid)-0.5;',
      '  float seed=hash21(cell);',
      '  float sparkle=0.72+0.28*sin(uTime*(0.7+seed*1.6)+seed*31.0);',
      '  return step(0.982,seed)*(1.0-smoothstep(0.02,0.18,length(point)))*sparkle;',
      '}',
      'vec3 skyForMode(float mode,vec2 uv){',
      '  float h=clamp(uv.y,0.0,1.0);',
      '  if(mode<0.5){',
      '    vec3 color=mix(vec3(0.62,0.82,0.94),vec3(0.055,0.31,0.68),pow(h,0.72));',
      '    float sun=sunDisc(uv,vec2(0.42,0.68),0.045);',
      '    float halo=1.0-smoothstep(0.04,0.28,length(vec2((uv.x-0.42)*1.65,uv.y-0.68)));',
      '    float cloud=smoothstep(0.59,0.78,cloudField(uv,4.2,0.010))*smoothstep(0.10,0.78,h);',
      '    color=mix(color,vec3(0.91,0.96,1.0),cloud*0.62);',
      '    return color+vec3(1.0,0.84,0.52)*(sun*0.82+halo*0.18);',
      '  }',
      '  if(mode<1.5){',
      '    vec3 color=mix(vec3(0.98,0.37,0.13),vec3(0.055,0.10,0.29),pow(h,0.64));',
      '    float sun=sunDisc(uv,vec2(0.30,0.54),0.065);',
      '    float haze=(1.0-smoothstep(0.04,0.44,abs(h-0.49)))*(0.42+noise2(vec2(uv.x*5.0,uTime*0.012))*0.18);',
      '    float cloud=smoothstep(0.62,0.80,cloudField(uv+vec2(0.0,0.18),3.7,0.008));',
      '    color=mix(color,vec3(0.23,0.13,0.24),cloud*0.48);',
      '    return color+vec3(1.0,0.73,0.32)*(sun*0.95+haze*0.22);',
      '  }',
      '  if(mode<2.5){',
      '    vec3 color=mix(vec3(0.30,0.38,0.43),vec3(0.045,0.075,0.13),pow(h,0.78));',
      '    float storm=cloudField(uv+vec2(0.0,0.20),3.2,0.020);',
      '    color=mix(color,vec3(0.035,0.055,0.075),smoothstep(0.48,0.84,storm)*0.72);',
      '    float horizon=1.0-smoothstep(0.02,0.34,abs(h-0.24));',
      '    return color+vec3(0.10,0.16,0.18)*horizon;',
      '  }',
      '  if(mode<3.5){',
      '    vec3 color=mix(vec3(0.78,0.86,0.91),vec3(0.25,0.39,0.54),pow(h,0.76));',
      '    float overcast=smoothstep(0.48,0.78,cloudField(uv+vec2(0.0,0.28),3.0,0.008));',
      '    color=mix(color,vec3(0.48,0.58,0.67),overcast*0.46);',
      '    return color+vec3(0.12,0.16,0.20)*(1.0-h)*0.22;',
      '  }',
      '  if(mode<4.5){',
      '    vec3 color=mix(vec3(0.055,0.105,0.19),vec3(0.006,0.015,0.055),pow(h,0.65));',
      '    float milky=1.0-smoothstep(0.08,0.36,abs(uv.y-(0.30+uv.x*0.30)));',
      '    milky*=0.22+fbm(uv*vec2(5.0,3.2))*0.34;',
      '    return color+vec3(0.20,0.25,0.38)*milky+vec3(0.82,0.90,1.0)*stars(uv);',
      '  }',
      '  vec3 color=mix(vec3(0.035,0.095,0.15),vec3(0.004,0.018,0.052),pow(h,0.62));',
      '  float wave=sin(uv.x*13.0+fbm(vec2(uv.x*2.6,uTime*0.025))*5.2-uTime*0.16);',
      '  float curtain=pow(smoothstep(0.10,0.94,wave*0.5+0.5),1.7);',
      '  curtain*=smoothstep(0.18,0.48,h)*(1.0-smoothstep(0.76,0.99,h));',
      '  float ribbon=sin(uv.x*19.0-uTime*0.11+noise2(uv*3.0)*4.0)*0.5+0.5;',
      '  vec3 aurora=mix(vec3(0.08,0.92,0.56),vec3(0.30,0.48,1.0),ribbon);',
      '  aurora=mix(aurora,vec3(0.78,0.24,0.72),smoothstep(0.68,1.0,ribbon));',
      '  return color+aurora*curtain*0.62+vec3(0.72,0.90,1.0)*stars(uv)*0.74;',
      '}',
      'void main(){',
      '  vec3 current=skyForMode(uMode,vUv);',
      '  vec3 next=skyForMode(uNextMode,vUv);',
      '  vec3 color=mix(current,next,smoothstep(0.0,1.0,uBlend));',
      '  gl_FragColor=vec4(color,uOpacity);',
      '}'
    ].join('\n');
  }

  function precipitationVertexShader() {
    return [
      'precision highp float;',
      'attribute float aSeed;',
      'uniform float uTime;',
      'uniform float uRain;',
      'uniform float uSnow;',
      'varying float vRain;',
      'varying float vSnow;',
      'varying float vSeed;',
      'void main(){',
      '  float strength=max(uRain,uSnow);',
      '  vec3 transformed=position;',
      '  float fallSpeed=uRain*22.0+uSnow*3.2;',
      '  transformed.y=mod(position.y+12.0-uTime*fallSpeed+aSeed*30.0,30.0)-12.0;',
      '  transformed.x+=sin(uTime*(0.45+aSeed*0.55)+aSeed*31.0)*uSnow*1.25;',
      '  transformed.x-=uRain*(transformed.y+12.0)*0.055;',
      '  vec4 mvPosition=modelViewMatrix*vec4(transformed,1.0);',
      '  float perspective=clamp(22.0/max(5.0,-mvPosition.z),0.34,1.35);',
      '  gl_PointSize=mix(5.0,8.5,uSnow)*perspective*strength;',
      '  gl_Position=projectionMatrix*mvPosition;',
      '  vRain=uRain;',
      '  vSnow=uSnow;',
      '  vSeed=aSeed;',
      '}'
    ].join('\n');
  }

  function precipitationFragmentShader() {
    return [
      'precision highp float;',
      'uniform float uOpacity;',
      'varying float vRain;',
      'varying float vSnow;',
      'varying float vSeed;',
      'void main(){',
      '  vec2 point=gl_PointCoord-0.5;',
      '  float rainShape=(1.0-smoothstep(0.045,0.13,abs(point.x)))*(1.0-smoothstep(0.40,0.50,abs(point.y)));',
      '  float snowShape=1.0-smoothstep(0.20,0.50,length(point));',
      '  float alpha=max(vRain*rainShape*0.72,vSnow*snowShape*(0.62+vSeed*0.30))*uOpacity;',
      '  if(alpha<0.015) discard;',
      '  vec3 color=mix(vec3(0.65,0.82,0.92),vec3(0.96,0.99,1.0),vSnow);',
      '  gl_FragColor=vec4(color,alpha);',
      '}'
    ].join('\n');
  }

  function loadCelestialTextures() {
    if (celestialTextureCache) return celestialTextureCache;
    var loader = new THREE.TextureLoader();
    function loadTexture(file) {
      var texture = loader.load(CELESTIAL_TEXTURE_PATH + file);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.anisotropy = 4;
      if (THREE.sRGBEncoding != null) texture.encoding = THREE.sRGBEncoding;
      return texture;
    }
    celestialTextureCache = {
      surfaces: CELESTIAL_TEXTURE_FILES.map(loadTexture),
      ring: loadTexture('saturn-ring.png')
    };
    return celestialTextureCache;
  }

  function celestialTextureReadyCount() {
    if (!celestialTextureCache) return 0;
    var textures = celestialTextureCache.surfaces.concat([celestialTextureCache.ring]);
    return textures.reduce(function (count, texture) {
      return count + (texture && texture.image && texture.image.width > 0 ? 1 : 0);
    }, 0);
  }

  function celestialRingVertexShader() {
    return [
      'precision highp float;',
      'varying vec3 vLocalPosition;',
      'void main(){',
      '  vLocalPosition=position;',
      '  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);',
      '}'
    ].join('\n');
  }

  function celestialRingFragmentShader() {
    return [
      'precision highp float;',
      'uniform sampler2D uMap;',
      'uniform float uOpacity;',
      'varying vec3 vLocalPosition;',
      'void main(){',
      '  float radius=length(vLocalPosition.xy);',
      '  float radialUv=clamp((radius-1.26)/(2.16-1.26),0.0,1.0);',
      '  vec4 band=texture2D(uMap,vec2(radialUv,0.5));',
      '  float edge=smoothstep(1.26,1.31,radius)*(1.0-smoothstep(2.10,2.16,radius));',
      '  float alpha=band.a*edge*uOpacity;',
      '  if(alpha<0.015) discard;',
      '  gl_FragColor=vec4(band.rgb*(0.72+radialUv*0.22),alpha);',
      '}'
    ].join('\n');
  }

  function applyCelestialAppearance(index) {
    if (!state.celestialMesh || index < 0 || index >= CELESTIAL_CONFIG.length) return;
    var config = CELESTIAL_CONFIG[index];
    var textures = loadCelestialTextures();
    state.activeCelestialIndex = index;
    state.celestialMaterial.map = textures.surfaces[index];
    state.celestialMaterial.color.setHex(textures.surfaces[index].image ? 0xffffff : config.color);
    state.celestialMaterial.shininess = config.shininess;
    state.celestialMaterial.needsUpdate = true;
    state.celestialMesh.name = 'highway-celestial-' + CELESTIAL_NAMES[index];
    state.celestialMesh.scale.set(config.radius, config.radius * config.flatten, config.radius);
    state.celestialRing.scale.setScalar(config.radius);
    state.celestialMesh.rotation.y = index * 0.71;
    state.celestialRing.visible = !!config.ring;
  }

  function applyCelestialAxialTilt(zone, index) {
    if (!state.celestialRoot || !state.celestialMesh) return;
    var orientation = celestialAxialTiltForZone(zone, index, state.seed);
    state.celestialRoot.rotation.set(orientation.x, 0, orientation.z);
    state.celestialMesh.rotation.y = orientation.spinPhase;
    state.celestialAxialTilt = orientation.angle;
    state.celestialAxisAzimuth = orientation.azimuth;
    state.celestialAxisX = orientation.x;
    state.celestialAxisZ = orientation.z;
  }

  function createCelestialLayer() {
    var textures = loadCelestialTextures();
    state.celestialRoot = new THREE.Group();
    state.celestialRoot.name = 'highway-celestial-3d-root';
    var initialPosition = celestialPositionForZone(0, state.seed);
    state.celestialRoot.position.set(initialPosition.x, initialPosition.y, initialPosition.z);

    state.celestialMaterial = new THREE.MeshPhongMaterial({
      map: textures.surfaces[0],
      color: CELESTIAL_CONFIG[0].color,
      transparent: true,
      opacity: 0,
      shininess: CELESTIAL_CONFIG[0].shininess,
      specular: 0x343c48,
      depthWrite: true,
      depthTest: true
    });
    state.celestialMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), state.celestialMaterial);
    state.celestialMesh.renderOrder = -90;
    state.celestialMesh.frustumCulled = false;
    state.celestialRoot.add(state.celestialMesh);

    state.celestialRingMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: textures.ring },
        uOpacity: { value: 0 }
      },
      vertexShader: celestialRingVertexShader(),
      fragmentShader: celestialRingFragmentShader(),
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide
    });
    state.celestialRing = new THREE.Mesh(new THREE.RingGeometry(1.26, 2.16, 96, 2), state.celestialRingMaterial);
    state.celestialRing.name = 'highway-celestial-saturn-ring';
    state.celestialRing.rotation.x = 1.10;
    state.celestialRing.rotation.z = -0.08;
    state.celestialRing.renderOrder = -89;
    state.celestialRing.frustumCulled = false;
    state.celestialRoot.add(state.celestialRing);

    var ambient = new THREE.AmbientLight(0x8795ad, 0.60);
    var key = new THREE.DirectionalLight(0xffedd2, 1.12);
    key.position.set(-18, 32, -48);
    key.target = state.celestialRoot;
    state.root.add(ambient);
    state.root.add(key);
    state.root.add(state.celestialRoot);
    applyCelestialAppearance(0);
    state.celestialRoot.visible = false;
  }

  function updateCelestialLayer(weather, dt) {
    if (!state.celestialRoot || !state.celestialMesh) return;
    var currentNight = weather.index >= 4;
    var nextNight = weather.nextIndex >= 4;
    var displayIndex = -1;
    var displayZone = -1;
    var celestialOpacity = 0;
    if (currentNight && nextNight) {
      if (weather.blend < 0.5) {
        displayIndex = state.celestialIndex;
        displayZone = weather.zone;
        celestialOpacity = 1 - smoothstep(weather.blend / 0.5);
      } else {
        displayIndex = state.nextCelestialIndex;
        displayZone = weather.zone + 1;
        celestialOpacity = smoothstep((weather.blend - 0.5) / 0.5);
      }
    } else if (currentNight) {
      displayIndex = state.celestialIndex;
      displayZone = weather.zone;
      celestialOpacity = 1 - weather.blend;
    } else if (nextNight) {
      displayIndex = state.nextCelestialIndex;
      displayZone = weather.zone + 1;
      celestialOpacity = weather.blend;
    }
    var appearanceChanged = displayIndex >= 0 && displayIndex !== state.activeCelestialIndex;
    if (appearanceChanged) applyCelestialAppearance(displayIndex);
    if (displayZone >= 0 && (displayZone !== state.activeCelestialZone || appearanceChanged)) {
      var position = celestialPositionForZone(displayZone, state.seed);
      state.celestialRoot.position.set(position.x, position.y, position.z);
      applyCelestialAxialTilt(displayZone, displayIndex);
      state.activeCelestialZone = displayZone;
    }
    state.celestialOpacity = clamp01(celestialOpacity);
    state.celestialRoot.visible = state.celestialOpacity > 0.01;
    if (displayIndex >= 0) {
      var config = CELESTIAL_CONFIG[displayIndex];
      state.celestialMesh.rotation.y += config.spin * Math.max(0.001, dt || 1 / 60);
      state.celestialMaterial.color.setHex(celestialTextureCache.surfaces[displayIndex].image ? 0xffffff : config.color);
      state.celestialRing.visible = !!config.ring && state.celestialOpacity > 0.01;
    }
  }

  function createWeatherLayer() {
    state.skyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uMode: { value: 0 },
        uNextMode: { value: 0 },
        uBlend: { value: 0 }
      },
      vertexShader: skyVertexShader(),
      fragmentShader: skyFragmentShader(),
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide
    });
    state.sky = new THREE.Mesh(new THREE.PlaneGeometry(240, 135, 1, 1), state.skyMaterial);
    state.sky.name = 'highway-dynamic-sky';
    state.sky.position.set(0, 10, -100);
    state.sky.renderOrder = -100;
    state.sky.frustumCulled = false;
    state.root.add(state.sky);
    createCelestialLayer();

    var positions = new Float32Array(PRECIPITATION_COUNT * 3);
    var seeds = new Float32Array(PRECIPITATION_COUNT);
    for (var index = 0; index < PRECIPITATION_COUNT; index++) {
      var seed = (hash1(index, 701) + 1) * 0.5;
      positions[index * 3] = hash1(index, 733) * 25;
      positions[index * 3 + 1] = -12 + (hash1(index, 769) + 1) * 15;
      positions[index * 3 + 2] = -5 - (hash1(index, 811) + 1) * 45;
      seeds[index] = seed;
    }
    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    geometry.computeBoundingSphere();
    state.precipitationMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uRain: { value: 0 },
        uSnow: { value: 0 }
      },
      vertexShader: precipitationVertexShader(),
      fragmentShader: precipitationFragmentShader(),
      transparent: true,
      depthWrite: false,
      depthTest: true
    });
    state.precipitation = new THREE.Points(geometry, state.precipitationMaterial);
    state.precipitation.name = 'highway-weather-precipitation';
    state.precipitation.renderOrder = 8;
    state.precipitation.frustumCulled = false;
    state.root.add(state.precipitation);
  }

  function buildShoulderGeometry() {
    var rows = ROAD_SEGMENT_COUNT + 1;
    var positions = new Float32Array(rows * 2 * 3);
    var indices = [];
    for (var row = 0; row < ROAD_SEGMENT_COUNT; row++) {
      var vertex = row * 2;
      indices.push(vertex, vertex + 2, vertex + 1, vertex + 2, vertex + 3, vertex + 1);
    }
    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    state.shoulderPositions = positions;
    return geometry;
  }

  function buildRail(side, color) {
    var positions = new Float32Array(ROAD_SEGMENT_COUNT * 2 * 3);
    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.computeBoundingSphere();
    var material = new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0, depthWrite: false });
    var line = new THREE.LineSegments(geometry, material);
    line.frustumCulled = false;
    if (side < 0) state.leftRailPositions = positions;
    else state.rightRailPositions = positions;
    return line;
  }

  function makeWorldMaterial(color, depthWrite) {
    return new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0,
      depthWrite: depthWrite !== false,
      side: THREE.DoubleSide
    });
  }

  function createInstancedWorldMesh(geometry, material, count, name) {
    var mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.name = name;
    mesh.count = 0;
    mesh.frustumCulled = false;
    state.sceneryRoot.add(mesh);
    return mesh;
  }

  function createLandscapeLayer() {
    state.sceneryRoot = new THREE.Group();
    state.sceneryRoot.name = 'highway-landscape-root';
    state.sceneryMaterials = {
      mountain: makeWorldMaterial(0x29424a, true),
      mound: makeWorldMaterial(0x18382e, true),
      trunk: makeWorldMaterial(0x26362f, true),
      crown: makeWorldMaterial(0x315b49, true),
      cactus: makeWorldMaterial(0x39704d, true),
      waterLeft: makeWorldMaterial(0x1688a5, false),
      waterRight: makeWorldMaterial(0x1688a5, false)
    };
    state.mountainMesh = createInstancedWorldMesh(
      new THREE.ConeGeometry(1, 1, 6),
      state.sceneryMaterials.mountain,
      SCENERY_INSTANCE_COUNT,
      'highway-mountains'
    );
    state.moundMesh = createInstancedWorldMesh(
      new THREE.SphereGeometry(1, 8, 5),
      state.sceneryMaterials.mound,
      SCENERY_INSTANCE_COUNT,
      'highway-mounds'
    );
    state.treeTrunkMesh = createInstancedWorldMesh(
      new THREE.CylinderGeometry(0.16, 0.23, 1, 6),
      state.sceneryMaterials.trunk,
      SCENERY_INSTANCE_COUNT,
      'highway-tree-trunks'
    );
    state.treeCrownMesh = createInstancedWorldMesh(
      new THREE.ConeGeometry(0.82, 1.5, 7),
      state.sceneryMaterials.crown,
      SCENERY_INSTANCE_COUNT,
      'highway-tree-crowns'
    );
    state.cactusStemMesh = createInstancedWorldMesh(
      new THREE.CylinderGeometry(0.16, 0.2, 1, 7),
      state.sceneryMaterials.cactus,
      SCENERY_INSTANCE_COUNT,
      'highway-cactus-stems'
    );
    state.cactusArmMesh = createInstancedWorldMesh(
      new THREE.BoxGeometry(1, 1, 1),
      state.sceneryMaterials.cactus,
      SCENERY_INSTANCE_COUNT * 2,
      'highway-cactus-arms'
    );

    var waterGeometry = new THREE.PlaneGeometry(1, 1, 1, 1);
    state.leftWater = new THREE.Mesh(waterGeometry, state.sceneryMaterials.waterLeft);
    state.rightWater = new THREE.Mesh(waterGeometry, state.sceneryMaterials.waterRight);
    state.leftWater.name = 'highway-water-left';
    state.rightWater.name = 'highway-water-right';
    state.leftWater.rotation.x = -Math.PI / 2;
    state.rightWater.rotation.x = -Math.PI / 2;
    state.leftWater.renderOrder = -1;
    state.rightWater.renderOrder = -1;
    state.leftWater.visible = false;
    state.rightWater.visible = false;
    state.sceneryRoot.add(state.leftWater);
    state.sceneryRoot.add(state.rightWater);
    state.root.add(state.sceneryRoot);
  }

  function addLandmarkPart(group, geometries, materials, geometryKey, materialKey, position, scale, rotation) {
    var mesh = new THREE.Mesh(geometries[geometryKey], materials[materialKey]);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.scale.set(scale[0], scale[1], scale[2]);
    if (rotation) mesh.rotation.set(rotation[0] || 0, rotation[1] || 0, rotation[2] || 0);
    group.add(mesh);
    return mesh;
  }

  function createLandmarkLayer() {
    state.landmarkRoot = new THREE.Group();
    state.landmarkRoot.name = 'highway-landmark-root';
    var geometries = {
      box: new THREE.BoxGeometry(1, 1, 1),
      cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
      cone: new THREE.ConeGeometry(0.5, 1, 10),
      pyramid: new THREE.ConeGeometry(0.5, 1, 4),
      sphere: new THREE.SphereGeometry(0.5, 12, 8)
    };
    state.landmarkMaterials = {
      body: makeWorldMaterial(0xaeb8b7, true),
      shadow: makeWorldMaterial(0x44535a, true),
      glass: makeWorldMaterial(0x2c8da5, true),
      light: makeWorldMaterial(0xf4d28a, false)
    };
    var materials = state.landmarkMaterials;
    function part(group, geometryKey, materialKey, x, y, z, sx, sy, sz, rx, ry, rz) {
      return addLandmarkPart(
        group,
        geometries,
        materials,
        geometryKey,
        materialKey,
        [x, y, z],
        [sx, sy, sz],
        [rx || 0, ry || 0, rz || 0]
      );
    }

    state.landmarks = LANDMARK_NAMES.map(function (name, index) {
      var group = new THREE.Group();
      group.name = 'highway-landmark-' + index;
      group.userData.landmarkName = name;
      if (index === 0) {
        part(group, 'box', 'body', -0.55, 0.95, 0, 0.17, 1.9, 0.22, 0, 0, 0.18);
        part(group, 'box', 'body', 0.55, 0.95, 0, 0.17, 1.9, 0.22, 0, 0, -0.18);
        part(group, 'box', 'shadow', 0, 1.45, 0, 1.35, 0.12, 0.62);
        part(group, 'box', 'body', 0, 2.65, 0, 0.34, 2.4, 0.30);
        part(group, 'box', 'light', 0, 3.25, 0, 0.86, 0.10, 0.48);
        part(group, 'cylinder', 'light', 0, 4.25, 0, 0.08, 1.6, 0.08);
      } else if (index === 1) {
        part(group, 'box', 'shadow', 0, 1.65, 0, 1.12, 3.3, 1.05);
        part(group, 'box', 'body', 0, 3.45, 0, 1.30, 0.72, 1.18);
        part(group, 'sphere', 'light', 0, 3.45, 0.61, 0.54, 0.54, 0.08);
        part(group, 'cone', 'body', 0, 4.28, 0, 1.0, 1.10, 1.0);
        part(group, 'cylinder', 'light', 0, 5.05, 0, 0.10, 0.72, 0.10);
      } else if (index === 2) {
        part(group, 'box', 'glass', 0, 1.8, 0, 1.02, 3.6, 0.90);
        part(group, 'box', 'glass', 0.36, 3.1, 0, 0.68, 2.6, 0.72);
        part(group, 'box', 'body', 0.60, 4.15, 0, 0.40, 1.8, 0.50);
        part(group, 'box', 'body', 0.76, 5.05, 0, 0.22, 1.3, 0.30);
        part(group, 'cylinder', 'light', 0.82, 6.25, 0, 0.08, 1.8, 0.08);
      } else if (index === 3) {
        part(group, 'box', 'shadow', 0, 0.22, 0, 3.1, 0.44, 1.8);
        part(group, 'box', 'body', 0, 0.95, 0, 1.72, 1.18, 1.18);
        part(group, 'sphere', 'body', 0, 1.78, 0, 1.45, 1.02, 1.45);
        part(group, 'cylinder', 'light', 0, 2.58, 0, 0.10, 0.74, 0.10);
        [-1.45, 1.45].forEach(function (x) {
          [-0.65, 0.65].forEach(function (z) {
            part(group, 'cylinder', 'body', x, 1.15, z, 0.18, 2.3, 0.18);
            part(group, 'cone', 'light', x, 2.45, z, 0.42, 0.62, 0.42);
          });
        });
      } else if (index === 4) {
        part(group, 'box', 'shadow', 0, 0.18, 0, 3.4, 0.36, 1.6);
        part(group, 'sphere', 'body', -0.82, 1.05, 0, 1.18, 2.25, 0.42, 0, 0, -0.42);
        part(group, 'sphere', 'body', 0, 1.22, 0, 1.22, 2.55, 0.42, 0, 0, 0.10);
        part(group, 'sphere', 'body', 0.86, 0.95, 0, 1.08, 2.05, 0.40, 0, 0, 0.48);
      } else if (index === 5) {
        part(group, 'pyramid', 'body', -0.70, 1.25, 0, 2.7, 2.5, 2.7);
        part(group, 'pyramid', 'shadow', 0.95, 0.88, -0.25, 1.9, 1.76, 1.9);
        part(group, 'pyramid', 'light', 2.05, 0.48, 0.18, 1.08, 0.96, 1.08);
      } else if (index === 6) {
        part(group, 'cylinder', 'shadow', 0, 1.75, 0, 0.24, 3.5, 0.24);
        part(group, 'sphere', 'light', 0, 1.15, 0, 1.08, 1.08, 1.08);
        part(group, 'sphere', 'glass', 0, 2.95, 0, 0.78, 0.78, 0.78);
        part(group, 'sphere', 'light', 0, 3.75, 0, 0.40, 0.40, 0.40);
        part(group, 'cylinder', 'body', 0, 4.65, 0, 0.12, 1.9, 0.12);
      } else {
        part(group, 'box', 'shadow', 0, 1.65, 0, 1.48, 3.3, 1.28);
        part(group, 'box', 'body', 0, 3.55, 0, 1.08, 1.45, 0.98);
        part(group, 'box', 'body', 0, 4.62, 0, 0.72, 0.82, 0.70);
        part(group, 'cylinder', 'light', 0, 5.35, 0, 0.08, 1.1, 0.08);
      }
      group.visible = false;
      state.landmarkRoot.add(group);
      return group;
    });
    state.root.add(state.landmarkRoot);
  }

  function ensureLayer(scene) {
    if (state.initialized && state.scene === scene) return;
    clearLayer();
    if (!scene || typeof THREE === 'undefined') return;
    state.scene = scene;
    state.seed = state.seed || (Math.random() * 900 + 100);
    state.dummy = new THREE.Object3D();
    state.rollQuaternion = new THREE.Quaternion();
    state.rollAxis = new THREE.Vector3(0, 0, 1);
    state.root = new THREE.Group();
    state.root.name = 'highway-drive-root';

    createWeatherLayer();

    state.shoulderMaterial = new THREE.MeshBasicMaterial({ color: 0x020407, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    state.shoulder = new THREE.Mesh(buildShoulderGeometry(), state.shoulderMaterial);
    state.shoulder.frustumCulled = false;
    state.shoulder.renderOrder = -3;
    state.root.add(state.shoulder);

    state.roadMaterial = buildRoadMaterial();
    state.road = new THREE.Mesh(buildRoadGeometry(), state.roadMaterial);
    state.road.frustumCulled = false;
    state.road.renderOrder = -2;
    state.root.add(state.road);

    state.leftRail = buildRail(-1, 0x26d9ff);
    state.rightRail = buildRail(1, 0xffad42);
    state.leftRail.renderOrder = -1;
    state.rightRail.renderOrder = -1;
    state.root.add(state.leftRail);
    state.root.add(state.rightRail);

    var poleGeometry = new THREE.BoxGeometry(0.035, 1.12, 0.035);
    state.poleMaterial = new THREE.MeshBasicMaterial({ color: 0x4b5563, transparent: true, opacity: 0 });
    state.poleMesh = new THREE.InstancedMesh(poleGeometry, state.poleMaterial, LIGHT_PAIR_COUNT * 2);
    state.poleMesh.frustumCulled = false;
    state.root.add(state.poleMesh);

    var lightGeometry = new THREE.BoxGeometry(0.24, 0.11, 0.32);
    state.leftLightMaterial = new THREE.MeshBasicMaterial({ color: 0x26d9ff, transparent: true, opacity: 0 });
    state.rightLightMaterial = new THREE.MeshBasicMaterial({ color: 0xffad42, transparent: true, opacity: 0 });
    state.leftLights = new THREE.InstancedMesh(lightGeometry, state.leftLightMaterial, LIGHT_PAIR_COUNT);
    state.rightLights = new THREE.InstancedMesh(lightGeometry, state.rightLightMaterial, LIGHT_PAIR_COUNT);
    state.leftLights.frustumCulled = false;
    state.rightLights.frustumCulled = false;
    state.root.add(state.leftLights);
    state.root.add(state.rightLights);

    createLandscapeLayer();
    createLandmarkLayer();

    state.root.visible = false;
    scene.add(state.root);
    state.initialized = true;
  }

  function roadBandForSide(side) {
    return Math.min(ROAD_BAND_COUNT - 1, Math.floor(Math.abs(clamp(Number(side) || 0, -1, 1)) * ROAD_BAND_COUNT));
  }

  function roadTrackLaneForSide(side) {
    var safeSide = clamp(Number(side) || 0, -1, 1);
    var nearestLane = 0;
    var nearestDistance = Infinity;
    for (var lane = 0; lane < ROAD_TRACK_LANE_COUNT; lane++) {
      var distance = Math.abs(safeSide - roadTrackLaneCenter(lane));
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestLane = lane;
      }
    }
    return nearestLane;
  }

  function roadTrackLaneCenter(lane) {
    var safeLane = Math.max(0, Math.min(ROAD_TRACK_LANE_COUNT - 1, Math.round(Number(lane) || 0)));
    return ROAD_TRACK_LANE_CENTERS[safeLane];
  }

  function roadTrackLaneForBand(band) {
    var safeBand = Math.max(0, Math.min(ROAD_BAND_COUNT - 1, Math.round(Number(band) || 0)));
    for (var lane = 0; lane < ROAD_TRACK_LANE_COUNT; lane++) {
      if (ROAD_TRACK_LANE_BANDS[lane].indexOf(safeBand) >= 0) return lane;
    }
    return 0;
  }

  function spectrumHistorySlotForRow(row, head) {
    var safeRow = Math.max(0, Math.min(ROAD_SEGMENT_COUNT, Math.round(Number(row) || 0)));
    var safeHead = Math.round(Number(head) || 0);
    return positiveModulo(safeHead - (ROAD_SEGMENT_COUNT - safeRow), ROAD_SPECTRUM_SAMPLE_COUNT);
  }

  function spectrumPulseForBand(current, previous, band, beat, boost) {
    var safeBand = Math.max(0, Math.min(ROAD_BAND_COUNT - 1, Math.round(Number(band) || 0)));
    var lowWeight = 1 - safeBand / (ROAD_BAND_COUNT - 1);
    var onset = Math.max(0, clamp01(current) - clamp01(previous));
    var beatDrive = clamp01(beat) * (0.16 + lowWeight * 0.58);
    var boostDrive = clamp01(boost) * (0.08 + lowWeight * 0.34);
    return clamp01(onset * 3.2 + beatDrive + boostDrive);
  }

  function rhythmChartCueFrame(audio, previousBands, previousBeat, previousTrigger, cueAge, cooldown, dt) {
    audio = audio || {};
    var currentBands = audio.bands || [];
    var elapsed = clamp(Number(dt) || 0, 0, 0.1);
    var nextAge = Math.max(0, Number(cueAge) || 0) + elapsed;
    var nextCooldown = Math.max(0, (Number(cooldown) || 0) - elapsed);
    var onsetPeak = 0;
    var onsetTotal = 0;
    var bandTotal = 0;
    for (var band = 0; band < ROAD_BAND_COUNT; band++) {
      var current = clamp01(currentBands[band]);
      var previous = clamp01(previousBands && previousBands[band]);
      var onset = Math.max(0, current - previous);
      onsetPeak = Math.max(onsetPeak, onset);
      onsetTotal += onset;
      bandTotal += current;
    }
    var onsetStrength = clamp01(onsetPeak * 2.2 + onsetTotal / ROAD_BAND_COUNT * 1.6);
    var beat = clamp01(audio.beat);
    var trigger = clamp01(audio.trigger);
    var beatRise = Math.max(0, beat - clamp01(previousBeat));
    var triggerCandidate = trigger > ROAD_TRACK_ONSET_THRESHOLD && clamp01(previousTrigger) <= ROAD_TRACK_ONSET_THRESHOLD;
    var beatCandidate = beat > 0.18 && beatRise > 0.035;
    var onsetCandidate = onsetStrength >= ROAD_TRACK_ONSET_THRESHOLD;
    var activeEnergy = Math.max(clamp01(audio.energy), bandTotal / ROAD_BAND_COUNT);
    var fillGap = clamp(0.58 - activeEnergy * 0.20 - beat * 0.06, 0.34, 0.58);
    var fillCandidate = activeEnergy > 0.10 && nextAge >= fillGap;
    var emitted = nextCooldown <= 0 && (triggerCandidate || beatCandidate || onsetCandidate || fillCandidate);
    var strength = 0;
    if (emitted) {
      strength = Math.max(
        triggerCandidate ? trigger : 0,
        beatCandidate ? beat : 0,
        onsetCandidate ? onsetStrength : 0,
        fillCandidate ? 0.42 + activeEnergy * 0.30 : 0
      );
      strength = Math.max(0.34, clamp01(strength));
      nextAge = 0;
      nextCooldown = ROAD_TRACK_MIN_EVENT_GAP;
    }
    return {
      emitted: emitted,
      strength: strength,
      onsetStrength: onsetStrength,
      fillCandidate: fillCandidate,
      cueAge: nextAge,
      cooldown: nextCooldown
    };
  }

  function rhythmTrackEventFrame(currentBands, previousBands, previousTrackPulses, beat, trigger, eventIndex, lastLane) {
    var candidates = new Array(ROAD_BAND_COUNT);
    var eventStrength = clamp01(trigger);
    var eventBeat = clamp01(beat) * eventStrength;
    for (var band = 0; band < ROAD_BAND_COUNT; band++) {
      var current = clamp01(currentBands && currentBands[band]);
      var previous = clamp01(previousBands && previousBands[band]);
      candidates[band] = spectrumPulseForBand(current, previous, band, eventBeat, eventStrength);
    }
    var rankedBands = candidates.map(function (value, band) {
      return { band: band, value: value };
    }).sort(function (a, b) {
      return b.value - a.value || a.band - b.band;
    });
    var pulses = new Array(ROAD_TRACK_LANE_COUNT);
    for (var lane = 0; lane < ROAD_TRACK_LANE_COUNT; lane++) {
      var laneBands = ROAD_TRACK_LANE_BANDS[lane];
      var laneEnergy = Math.max(
        clamp01(currentBands && currentBands[laneBands[0]]),
        clamp01(currentBands && currentBands[laneBands[1]])
      );
      pulses[lane] = clamp01(previousTrackPulses && previousTrackPulses[lane]) * (laneEnergy > 0.18 ? 0.62 : 0.36);
    }
    var safeEventIndex = Math.max(0, Math.floor(Number(eventIndex) || 0));
    var safeLastLane = Number(lastLane);
    var eventLanes = [];
    if (eventStrength > 0.28 && rankedBands.length) {
      var dominantLane = roadTrackLaneForBand(rankedBands[0].band);
      var sequenceLane = ROAD_TRACK_LANE_SEQUENCE[safeEventIndex % ROAD_TRACK_LANE_SEQUENCE.length];
      var primaryLane = positiveModulo(sequenceLane + dominantLane, ROAD_TRACK_LANE_COUNT);
      if (primaryLane === safeLastLane) {
        primaryLane = positiveModulo(primaryLane + (safeEventIndex % 2 === 0 ? 1 : -1), ROAD_TRACK_LANE_COUNT);
      }
      pulses[primaryLane] = Math.max(pulses[primaryLane], 0.68 + eventStrength * 0.32);
      eventLanes.push(primaryLane);
      if (eventStrength > 0.86 && safeEventIndex % 6 === 5) {
        var secondaryLane = positiveModulo(primaryLane + 2, ROAD_TRACK_LANE_COUNT);
        pulses[secondaryLane] = Math.max(pulses[secondaryLane], 0.52 + eventStrength * 0.28);
        eventLanes.push(secondaryLane);
      }
      safeEventIndex++;
      safeLastLane = primaryLane;
    }
    return {
      pulses: pulses,
      eventLanes: eventLanes,
      nextEventIndex: safeEventIndex,
      lastLane: isFinite(safeLastLane) ? safeLastLane : -1
    };
  }

  function resetSpectrumHistory() {
    state.spectrumEnergyHistory = new Float32Array(ROAD_SPECTRUM_SAMPLE_COUNT * ROAD_BAND_COUNT);
    state.spectrumPulseHistory = new Float32Array(ROAD_SPECTRUM_SAMPLE_COUNT * ROAD_BAND_COUNT);
    state.trackPulseHistory = new Float32Array(ROAD_SPECTRUM_SAMPLE_COUNT * ROAD_TRACK_LANE_COUNT);
    state.spectrumHead = -1;
    state.spectrumSamples = 0;
    state.spectrumDistance = 0;
    state.spectrumWavePeak = 0;
    state.trackNotePeak = 0;
    state.spectrumEventLanePeak = 0;
    state.pendingTrigger = 0;
    state.trackEventIndex = 0;
    state.lastTrackLane = -1;
    state.trackVisitedMask = 0;
    state.trackCueAge = 0;
    state.trackCueCooldown = 0;
    state.trackPreviousBeat = 0;
    state.trackPreviousBands = [0, 0, 0, 0, 0, 0, 0, 0];
  }

  function pushSpectrumHistorySample() {
    if (!state.spectrumEnergyHistory || !state.spectrumPulseHistory || !state.trackPulseHistory) resetSpectrumHistory();
    var previousHead = state.spectrumHead;
    var nextHead = positiveModulo(previousHead + 1, ROAD_SPECTRUM_SAMPLE_COUNT);
    var nextEnergyOffset = nextHead * ROAD_BAND_COUNT;
    var previousEnergyOffset = previousHead >= 0 ? previousHead * ROAD_BAND_COUNT : -1;
    var nextPulseOffset = nextHead * ROAD_BAND_COUNT;
    var previousPulseOffset = previousHead >= 0 ? previousHead * ROAD_BAND_COUNT : -1;
    var nextTrackOffset = nextHead * ROAD_TRACK_LANE_COUNT;
    var previousTrackOffset = previousHead >= 0 ? previousHead * ROAD_TRACK_LANE_COUNT : -1;
    var currentBands = new Array(ROAD_BAND_COUNT);
    var previousBands = new Array(ROAD_BAND_COUNT);
    for (var band = 0; band < ROAD_BAND_COUNT; band++) {
      var energy = clamp01(state.bands[band]);
      var previous = previousEnergyOffset >= 0 ? state.spectrumEnergyHistory[previousEnergyOffset + band] : 0;
      currentBands[band] = energy;
      previousBands[band] = previous;
      state.spectrumEnergyHistory[nextEnergyOffset + band] = energy;
      var previousPulse = previousPulseOffset >= 0 ? state.spectrumPulseHistory[previousPulseOffset + band] : 0;
      var detectedPulse = spectrumPulseForBand(energy, previous, band, state.beat, Math.max(state.boost * 0.42, state.pendingTrigger * 0.68));
      state.spectrumPulseHistory[nextPulseOffset + band] = Math.max(detectedPulse, previousPulse * 0.58);
    }
    var previousTrackPulses = new Array(ROAD_TRACK_LANE_COUNT);
    for (var lane = 0; lane < ROAD_TRACK_LANE_COUNT; lane++) {
      previousTrackPulses[lane] = previousTrackOffset >= 0 ? state.trackPulseHistory[previousTrackOffset + lane] : 0;
    }
    var trackFrame = rhythmTrackEventFrame(
      currentBands,
      previousBands,
      previousTrackPulses,
      state.beat,
      state.pendingTrigger,
      state.trackEventIndex,
      state.lastTrackLane
    );
    for (var pulseLane = 0; pulseLane < ROAD_TRACK_LANE_COUNT; pulseLane++) {
      state.trackPulseHistory[nextTrackOffset + pulseLane] = trackFrame.pulses[pulseLane];
    }
    state.trackEventIndex = trackFrame.nextEventIndex;
    state.lastTrackLane = trackFrame.lastLane;
    state.spectrumEventLanePeak = Math.max(state.spectrumEventLanePeak, trackFrame.eventLanes.length);
    for (var eventLaneIndex = 0; eventLaneIndex < trackFrame.eventLanes.length; eventLaneIndex++) {
      state.trackVisitedMask |= 1 << trackFrame.eventLanes[eventLaneIndex];
    }
    state.pendingTrigger = 0;
    state.spectrumHead = nextHead;
    state.spectrumSamples = Math.min(ROAD_SPECTRUM_SAMPLE_COUNT, state.spectrumSamples + 1);
  }

  function advanceSpectrumHistory(distance) {
    if (!state.spectrumEnergyHistory || !state.spectrumPulseHistory || !state.trackPulseHistory) resetSpectrumHistory();
    if (state.spectrumSamples === 0) pushSpectrumHistorySample();
    state.spectrumDistance += Math.max(0, Number(distance) || 0);
    var steps = Math.min(ROAD_SPECTRUM_SAMPLE_COUNT, Math.floor(state.spectrumDistance / ROAD_SPECTRUM_STEP));
    for (var index = 0; index < steps; index++) pushSpectrumHistorySample();
    state.spectrumDistance -= steps * ROAD_SPECTRUM_STEP;
  }

  function historyValueAtRow(row, channel, history, stride) {
    if (state.spectrumHead < 0) return 0;
    var slot = spectrumHistorySlotForRow(row, state.spectrumHead);
    var safeChannel = Math.max(0, Math.min(stride - 1, Math.round(Number(channel) || 0)));
    var offset = slot * stride + safeChannel;
    if (!history) return 0;
    var current = history[offset] || 0;
    if (row >= ROAD_SEGMENT_COUNT) return current;
    var nextSlot = spectrumHistorySlotForRow(row + 1, state.spectrumHead);
    var next = history[nextSlot * stride + safeChannel] || 0;
    var phase = clamp01(state.spectrumDistance / ROAD_SPECTRUM_STEP);
    return current + (next - current) * phase;
  }

  function spectrumValueAtRow(row, band) {
    return historyValueAtRow(row, band, state.spectrumEnergyHistory, ROAD_BAND_COUNT);
  }

  function spectrumPulseValueAtRow(row, band) {
    return historyValueAtRow(row, band, state.spectrumPulseHistory, ROAD_BAND_COUNT);
  }

  function trackPulseValueAtRow(row, lane) {
    return historyValueAtRow(row, lane, state.trackPulseHistory, ROAD_TRACK_LANE_COUNT);
  }

  function spectrumTrackLaneValueAtRow(row, lane, pulse) {
    var safeLane = Math.max(0, Math.min(ROAD_TRACK_LANE_COUNT - 1, Math.round(Number(lane) || 0)));
    if (pulse) return trackPulseValueAtRow(row, safeLane);
    var laneBands = ROAD_TRACK_LANE_BANDS[safeLane];
    return Math.max(
      spectrumValueAtRow(row, laneBands[0]),
      spectrumValueAtRow(row, laneBands[1])
    );
  }

  function updateRoadGeometry() {
    var step = ROAD_SPECTRUM_STEP;
    var rowSamples = new Array(ROAD_SEGMENT_COUNT + 1);
    state.spectrumWavePeak = 0;
    state.trackNotePeak = 0;
    for (var row = 0; row <= ROAD_SEGMENT_COUNT; row++) {
      var ahead = ROAD_NEAR + row * step;
      rowSamples[row] = localRoadSample(ahead);
      var distanceFade = 1 - smoothstep(ahead / ROAD_LENGTH);
      for (var column = 0; column < ROAD_COLUMN_COUNT; column++) {
        var vertex = row * ROAD_COLUMN_COUNT + column;
        var side = -1 + column * 2 / (ROAD_COLUMN_COUNT - 1);
        var trackLane = roadTrackLaneForSide(side);
        var band = roadBandForSide(side);
        var bandEnergy = spectrumValueAtRow(row, band);
        var bandPulse = spectrumPulseValueAtRow(row, band);
        var trackPulse = trackPulseValueAtRow(row, trackLane);
        var sideAmount = Math.abs(side);
        var ripple = Math.sin((state.travel + ahead) * (0.46 + band * 0.018) - state.time * (2.2 + band * 0.08) + band * 0.86);
        var beatRidge = Math.sin((state.travel + ahead) * 0.74 - state.time * 4.4);
        var energyLift = bandEnergy * (0.036 + sideAmount * 0.075) * ripple;
        var beatLift = state.beat * 0.026 * beatRidge;
        var pulseLift = bandPulse * (0.020 + sideAmount * 0.042);
        var trackLift = trackPulse * (0.040 + sideAmount * 0.032);
        var lift = (energyLift + beatLift + pulseLift + trackLift) * distanceFade;
        var offset = vertex * 3;
        state.roadPositions[offset] = rowSamples[row].x + side * ROAD_HALF_WIDTH;
        state.roadPositions[offset + 1] = ROAD_BASE_Y + rowSamples[row].y + lift;
        state.roadPositions[offset + 2] = -ahead;
        state.roadEnergy[vertex] = bandEnergy;
        state.roadPulse[vertex] = bandPulse;
        state.roadTrackPulse[vertex] = trackPulse;
        state.spectrumWavePeak = Math.max(state.spectrumWavePeak, bandPulse);
        state.trackNotePeak = Math.max(state.trackNotePeak, trackPulse);
      }
      var shoulderOffset = row * 6;
      state.shoulderPositions[shoulderOffset] = rowSamples[row].x - SHOULDER_HALF_WIDTH;
      state.shoulderPositions[shoulderOffset + 1] = ROAD_BASE_Y + rowSamples[row].y - 0.045;
      state.shoulderPositions[shoulderOffset + 2] = -ahead;
      state.shoulderPositions[shoulderOffset + 3] = rowSamples[row].x + SHOULDER_HALF_WIDTH;
      state.shoulderPositions[shoulderOffset + 4] = ROAD_BASE_Y + rowSamples[row].y - 0.045;
      state.shoulderPositions[shoulderOffset + 5] = -ahead;
    }
    state.road.geometry.attributes.position.needsUpdate = true;
    state.road.geometry.attributes.aBandEnergy.needsUpdate = true;
    state.road.geometry.attributes.aBandPulse.needsUpdate = true;
    state.road.geometry.attributes.aTrackPulse.needsUpdate = true;
    state.shoulder.geometry.attributes.position.needsUpdate = true;
    updateRails(rowSamples, step);
  }

  function updateRails(rowSamples, step) {
    for (var row = 0; row < ROAD_SEGMENT_COUNT; row++) {
      var aheadA = ROAD_NEAR + row * step;
      var aheadB = aheadA + step;
      var leftOffset = row * 6;
      var leftEnergyA = spectrumTrackLaneValueAtRow(row, 0, false);
      var leftEnergyB = spectrumTrackLaneValueAtRow(row + 1, 0, false);
      var rightEnergyA = spectrumTrackLaneValueAtRow(row, ROAD_TRACK_LANE_COUNT - 1, false);
      var rightEnergyB = spectrumTrackLaneValueAtRow(row + 1, ROAD_TRACK_LANE_COUNT - 1, false);
      var leftLiftA = 0.12 + leftEnergyA * 0.08 + spectrumTrackLaneValueAtRow(row, 0, true) * 0.12;
      var leftLiftB = 0.12 + leftEnergyB * 0.08 + spectrumTrackLaneValueAtRow(row + 1, 0, true) * 0.12;
      var rightLiftA = 0.12 + rightEnergyA * 0.08 + spectrumTrackLaneValueAtRow(row, ROAD_TRACK_LANE_COUNT - 1, true) * 0.12;
      var rightLiftB = 0.12 + rightEnergyB * 0.08 + spectrumTrackLaneValueAtRow(row + 1, ROAD_TRACK_LANE_COUNT - 1, true) * 0.12;
      state.leftRailPositions[leftOffset] = rowSamples[row].x - ROAD_HALF_WIDTH - 0.36;
      state.leftRailPositions[leftOffset + 1] = ROAD_BASE_Y + rowSamples[row].y + leftLiftA;
      state.leftRailPositions[leftOffset + 2] = -aheadA;
      state.leftRailPositions[leftOffset + 3] = rowSamples[row + 1].x - ROAD_HALF_WIDTH - 0.36;
      state.leftRailPositions[leftOffset + 4] = ROAD_BASE_Y + rowSamples[row + 1].y + leftLiftB;
      state.leftRailPositions[leftOffset + 5] = -aheadB;
      state.rightRailPositions[leftOffset] = rowSamples[row].x + ROAD_HALF_WIDTH + 0.36;
      state.rightRailPositions[leftOffset + 1] = ROAD_BASE_Y + rowSamples[row].y + rightLiftA;
      state.rightRailPositions[leftOffset + 2] = -aheadA;
      state.rightRailPositions[leftOffset + 3] = rowSamples[row + 1].x + ROAD_HALF_WIDTH + 0.36;
      state.rightRailPositions[leftOffset + 4] = ROAD_BASE_Y + rowSamples[row + 1].y + rightLiftB;
      state.rightRailPositions[leftOffset + 5] = -aheadB;
    }
    state.leftRail.geometry.attributes.position.needsUpdate = true;
    state.rightRail.geometry.attributes.position.needsUpdate = true;
  }

  function setDummyTransform(mesh, index, x, y, z, scaleX, scaleY, scaleZ, rotationX, rotationY, rotationZ) {
    state.dummy.position.set(x, y, z);
    state.dummy.rotation.set(rotationX || 0, rotationY || 0, rotationZ || 0);
    state.dummy.scale.set(scaleX, scaleY, scaleZ);
    state.dummy.updateMatrix();
    mesh.setMatrixAt(index, state.dummy.matrix);
  }

  function setDummyMatrix(mesh, index, x, y, z, scaleX, scaleY, scaleZ) {
    setDummyTransform(mesh, index, x, y, z, scaleX, scaleY, scaleZ, 0, 0, 0);
  }

  function updateRoadsideLights() {
    var loopLength = LIGHT_PAIR_COUNT * LIGHT_SPACING;
    var phase = state.travel % LIGHT_SPACING;
    var lampPulse = 1 + state.beat * 0.32 + state.boost * 0.22;
    for (var index = 0; index < LIGHT_PAIR_COUNT; index++) {
      var ahead = 4.6 + index * LIGHT_SPACING - phase;
      if (ahead < ROAD_NEAR + 1.2) ahead += loopLength;
      var sample = localRoadSample(ahead);
      var leftX = sample.x - ROAD_HALF_WIDTH - 1.05;
      var rightX = sample.x + ROAD_HALF_WIDTH + 1.05;
      var baseY = ROAD_BASE_Y + sample.y;
      setDummyMatrix(state.poleMesh, index * 2, leftX, baseY + 0.56, -ahead, 1, 1, 1);
      setDummyMatrix(state.poleMesh, index * 2 + 1, rightX, baseY + 0.56, -ahead, 1, 1, 1);
      setDummyMatrix(state.leftLights, index, leftX, baseY + 1.15, -ahead, lampPulse, lampPulse, lampPulse);
      setDummyMatrix(state.rightLights, index, rightX, baseY + 1.15, -ahead, lampPulse, lampPulse, lampPulse);
    }
    state.poleMesh.instanceMatrix.needsUpdate = true;
    state.leftLights.instanceMatrix.needsUpdate = true;
    state.rightLights.instanceMatrix.needsUpdate = true;
  }

  function placeTree(counts, x, baseY, ahead, height, crownScale, palm, yaw) {
    var trunkIndex = counts.tree;
    if (trunkIndex >= SCENERY_INSTANCE_COUNT) return;
    setDummyTransform(
      state.treeTrunkMesh,
      trunkIndex,
      x,
      baseY + height * 0.5,
      -ahead,
      palm ? 0.72 : 0.92,
      height,
      palm ? 0.72 : 0.92,
      0,
      yaw,
      palm ? 0.055 * (trunkIndex % 2 ? 1 : -1) : 0
    );
    setDummyTransform(
      state.treeCrownMesh,
      trunkIndex,
      x,
      baseY + height + (palm ? 0.18 : 0.58),
      -ahead,
      crownScale * (palm ? 1.48 : 1),
      palm ? 0.34 : 0.92,
      crownScale * (palm ? 1.32 : 1),
      0,
      yaw,
      palm ? Math.PI : 0
    );
    counts.tree += 1;
  }

  function placeCactus(counts, x, baseY, ahead, height, yaw) {
    var stemIndex = counts.cactus;
    if (stemIndex >= SCENERY_INSTANCE_COUNT) return;
    setDummyTransform(state.cactusStemMesh, stemIndex, x, baseY + height * 0.5, -ahead, 1, height, 1, 0, yaw, 0);
    var armIndex = counts.cactusArm;
    if (armIndex < SCENERY_INSTANCE_COUNT * 2) {
      var armSide = stemIndex % 2 ? 1 : -1;
      setDummyTransform(
        state.cactusArmMesh,
        armIndex,
        x + armSide * 0.24,
        baseY + height * 0.62,
        -ahead,
        0.48,
        0.11,
        0.12,
        0,
        yaw,
        0
      );
      counts.cactusArm += 1;
    }
    counts.cactus += 1;
  }

  function setBlendedHexColor(target, currentHex, nextHex, blend) {
    var amount = clamp01(blend);
    target.setRGB(
      lerp((currentHex >> 16 & 255) / 255, (nextHex >> 16 & 255) / 255, amount),
      lerp((currentHex >> 8 & 255) / 255, (nextHex >> 8 & 255) / 255, amount),
      lerp((currentHex & 255) / 255, (nextHex & 255) / 255, amount)
    );
  }

  function applyBiomePalette(index, nextIndex, blend) {
    if (!state.sceneryMaterials || index < 0 || index >= BIOME_PALETTES.length) return;
    if (nextIndex == null || nextIndex < 0 || nextIndex >= BIOME_PALETTES.length) nextIndex = index;
    var palette = BIOME_PALETTES[index];
    var nextPalette = BIOME_PALETTES[nextIndex];
    setBlendedHexColor(state.shoulderMaterial.color, palette.ground, nextPalette.ground, blend);
    setBlendedHexColor(state.sceneryMaterials.mountain.color, palette.mountain, nextPalette.mountain, blend);
    setBlendedHexColor(state.sceneryMaterials.mound.color, palette.mound, nextPalette.mound, blend);
    setBlendedHexColor(state.sceneryMaterials.trunk.color, palette.trunk, nextPalette.trunk, blend);
    setBlendedHexColor(state.sceneryMaterials.crown.color, palette.crown, nextPalette.crown, blend);
    setBlendedHexColor(state.sceneryMaterials.cactus.color, palette.crown, nextPalette.crown, blend);
    setBlendedHexColor(state.sceneryMaterials.waterLeft.color, palette.water, nextPalette.water, blend);
    setBlendedHexColor(state.sceneryMaterials.waterRight.color, palette.water, nextPalette.water, blend);
  }

  function biomeWaterForSide(index, beachWaterSide, side) {
    if (index === 1) return 1;
    if (index === 4 && beachWaterSide === side) return 1;
    return 0;
  }

  function syncBiomeTransition(distance) {
    var biome = biomeStateAtDistance(distance, state.seed);
    state.biomeIndex = biome.index;
    state.nextBiomeIndex = biome.nextIndex;
    state.biomeBlend = biome.blend;
    state.biomeFade = 1;
    applyBiomePalette(biome.index, biome.nextIndex, biome.blend);
    var currentBeachWaterSide = biome.zone % 2 ? -1 : 1;
    var nextBeachWaterSide = (biome.zone + 1) % 2 ? -1 : 1;
    state.leftWaterAmount = lerp(
      biomeWaterForSide(biome.index, currentBeachWaterSide, -1),
      biomeWaterForSide(biome.nextIndex, nextBeachWaterSide, -1),
      biome.blend
    );
    state.rightWaterAmount = lerp(
      biomeWaterForSide(biome.index, currentBeachWaterSide, 1),
      biomeWaterForSide(biome.nextIndex, nextBeachWaterSide, 1),
      biome.blend
    );
    return biome;
  }

  function updateWeather(dt) {
    if (!state.skyMaterial || !state.precipitationMaterial) return;
    var weather = weatherStateAtDistance(state.travel + ROAD_LENGTH * 0.34, state.seed);
    state.weatherIndex = weather.index;
    state.nextWeatherIndex = weather.nextIndex;
    state.weatherBlend = weather.blend;
    state.celestialIndex = celestialIndexForZone(weather.zone, state.seed);
    state.nextCelestialIndex = celestialIndexForZone(weather.zone + 1, state.seed);
    state.rainAmount = (weather.index === 2 ? 1 - weather.blend : 0) + (weather.nextIndex === 2 ? weather.blend : 0);
    state.snowAmount = (weather.index === 3 ? 1 - weather.blend : 0) + (weather.nextIndex === 3 ? weather.blend : 0);

    state.skyMaterial.uniforms.uTime.value = state.time;
    state.skyMaterial.uniforms.uMode.value = weather.index;
    state.skyMaterial.uniforms.uNextMode.value = weather.nextIndex;
    state.skyMaterial.uniforms.uBlend.value = weather.blend;
    state.precipitationMaterial.uniforms.uTime.value = state.time;
    state.precipitationMaterial.uniforms.uRain.value = state.rainAmount;
    state.precipitationMaterial.uniforms.uSnow.value = state.snowAmount;
    state.precipitation.visible = Math.max(state.rainAmount, state.snowAmount) > 0.01;
    updateCelestialLayer(weather, dt);
  }

  function updateLandscape(dt) {
    if (!state.sceneryRoot || !state.sceneryMaterials) return;
    var biome = syncBiomeTransition(state.travel + ROAD_LENGTH * 0.34);
    var counts = { mountain: 0, mound: 0, tree: 0, cactus: 0, cactusArm: 0 };
    var zone = biome.zone;
    var beachWaterSide = zone % 2 ? -1 : 1;
    for (var index = 0; index < SCENERY_INSTANCE_COUNT; index++) {
      var placement = recycledWorldPlacement(index, SCENERY_SPACING, SCENERY_INSTANCE_COUNT, 8, state.travel, SCENERY_PASS_DISTANCE);
      var ahead = placement.ahead;
      if (ahead > ROAD_LENGTH + 8) continue;
      var slot = placement.slot;
      var slotBiome = biomeIndexAtDistance(placement.worldDistance, state.seed);
      var randomA = (hash1(slot, state.seed + 211) + 1) * 0.5;
      var randomB = (hash1(slot, state.seed + 337) + 1) * 0.5;
      var side = hash1(slot, state.seed + 449) >= 0 ? 1 : -1;
      var sample = localRoadSample(ahead);
      var baseY = ROAD_BASE_Y + sample.y - 0.04;
      var yaw = randomB * Math.PI * 2;

      if (slotBiome === 0) {
        var mountainHeight = 3.8 + randomA * 6.2;
        var mountainX = sample.x + side * (12.5 + randomB * 14);
        setDummyTransform(state.mountainMesh, counts.mountain++, mountainX, baseY + mountainHeight * 0.5, -ahead, 2.6 + randomB * 2.4, mountainHeight, 2.4 + randomA * 2.8, 0, yaw, 0);
        if (index % 2 === 0) placeTree(counts, sample.x + side * (7.8 + randomA * 4.6), baseY, ahead, 1.45 + randomB * 1.3, 0.72 + randomA * 0.46, false, yaw);
      } else if (slotBiome === 1) {
        if (index % 3 === 0) {
          var riverMoundScale = 2.4 + randomA * 3.2;
          setDummyTransform(state.moundMesh, counts.mound++, sample.x + side * (13 + randomB * 8), baseY - 0.55, -ahead, riverMoundScale, 1.0 + randomB, riverMoundScale * 0.82, 0, yaw, 0);
        }
        if (index % 2 === 0) placeTree(counts, sample.x + side * (7.6 + randomA * 4.8), baseY, ahead, 1.2 + randomB * 1.1, 0.68 + randomA * 0.42, false, yaw);
      } else if (slotBiome === 2) {
        var hillScale = 3.2 + randomA * 4.2;
        setDummyTransform(state.moundMesh, counts.mound++, sample.x + side * (10 + randomB * 10), baseY - 0.58, -ahead, hillScale, 1.15 + randomB * 1.25, hillScale * 0.86, 0, yaw, 0);
        if (index % 3 === 0) placeTree(counts, sample.x + side * (7.8 + randomA * 5.2), baseY, ahead, 1.15 + randomB, 0.70 + randomA * 0.38, false, yaw);
      } else if (slotBiome === 3) {
        var duneScale = 3.4 + randomA * 5.4;
        setDummyTransform(state.moundMesh, counts.mound++, sample.x + side * (10.5 + randomB * 10), baseY - 0.64, -ahead, duneScale, 0.72 + randomB * 0.86, duneScale * 1.18, 0, yaw, 0);
        if (index % 2 === 0) placeCactus(counts, sample.x + side * (8.4 + randomA * 6.6), baseY, ahead, 0.9 + randomB * 1.35, yaw);
      } else if (slotBiome === 4) {
        var landSide = -beachWaterSide;
        if (index % 2 === 0) {
          var beachMoundScale = 2.7 + randomA * 4.4;
          setDummyTransform(state.moundMesh, counts.mound++, sample.x + landSide * (11 + randomB * 11), baseY - 0.62, -ahead, beachMoundScale, 0.62 + randomB * 0.64, beachMoundScale, 0, yaw, 0);
          placeTree(counts, sample.x + landSide * (7.4 + randomA * 4.0), baseY, ahead, 1.75 + randomB * 1.25, 0.82 + randomA * 0.36, true, yaw);
        }
      } else {
        var grassScale = 3.1 + randomA * 4.6;
        setDummyTransform(state.moundMesh, counts.mound++, sample.x + side * (10 + randomB * 11), baseY - 0.64, -ahead, grassScale, 0.72 + randomB * 0.80, grassScale * 0.92, 0, yaw, 0);
        if (index % 4 === 0) placeTree(counts, sample.x + side * (8 + randomA * 5.8), baseY, ahead, 1.1 + randomB * 0.85, 0.66 + randomA * 0.35, false, yaw);
      }
    }

    state.mountainMesh.count = counts.mountain;
    state.moundMesh.count = counts.mound;
    state.treeTrunkMesh.count = counts.tree;
    state.treeCrownMesh.count = counts.tree;
    state.cactusStemMesh.count = counts.cactus;
    state.cactusArmMesh.count = counts.cactusArm;
    [state.mountainMesh, state.moundMesh, state.treeTrunkMesh, state.treeCrownMesh, state.cactusStemMesh, state.cactusArmMesh].forEach(function (mesh) {
      mesh.instanceMatrix.needsUpdate = true;
    });

    var waterSample = localRoadSample(ROAD_LENGTH * 0.52);
    state.leftWater.position.set(waterSample.x - 16, ROAD_BASE_Y + waterSample.y - 0.018, -ROAD_LENGTH * 0.52);
    state.rightWater.position.set(waterSample.x + 16, ROAD_BASE_Y + waterSample.y - 0.018, -ROAD_LENGTH * 0.52);
    state.leftWater.scale.set(22, ROAD_LENGTH * 1.18, 1);
    state.rightWater.scale.set(22, ROAD_LENGTH * 1.18, 1);
    state.leftWater.visible = state.leftWaterAmount > 0.01;
    state.rightWater.visible = state.rightWaterAmount > 0.01;
  }

  function updateLandmarks() {
    if (!state.landmarkRoot || !state.landmarks.length) return;
    state.visibleLandmark = '';
    state.landmarks.forEach(function (group, index) {
      var placement = recycledWorldPlacement(index, LANDMARK_SPACING, LANDMARK_NAMES.length, 58, state.travel, LANDMARK_PASS_DISTANCE);
      var ahead = placement.ahead;
      var visible = ahead >= -LANDMARK_PASS_DISTANCE && ahead <= ROAD_LENGTH + 4;
      group.visible = visible;
      if (!visible) return;
      var sample = localRoadSample(ahead);
      var side = index % 2 ? 1 : -1;
      var lateral = 9.5 + index % 3 * 1.45;
      group.position.set(sample.x + side * lateral, ROAD_BASE_Y + sample.y - 0.02, -ahead);
      group.rotation.set(0, side < 0 ? 0.16 : -0.16, 0);
      var scale = 1.14 + index % 3 * 0.14;
      group.scale.setScalar(scale);
      state.visibleLandmark = LANDMARK_NAMES[index];
    });
  }

  function targetRoadSpeed(audio, fx, lowDrive, boost, beat) {
    var speedControl = clamp(Number(fx && fx.speed) || 1, 0.25, 2.2);
    return (10.5 + speedControl * 5.8)
      + clamp01(audio && audio.energy) * 9.5
      + clamp01(lowDrive) * 8.6
      + clamp01(beat) * 7.2
      + clamp01(boost) * 15.5;
  }

  function updateAudioState(audio, fx, dt) {
    var intensity = clamp(Number(fx && fx.intensity) || 0.85, 0.1, 2.2);
    var chartCue = rhythmChartCueFrame(
      audio,
      state.trackPreviousBands,
      state.trackPreviousBeat,
      state.lastTrigger,
      state.trackCueAge,
      state.trackCueCooldown,
      dt
    );
    state.trackCueAge = chartCue.cueAge;
    state.trackCueCooldown = chartCue.cooldown;
    state.trackPreviousBeat = audio.beat;
    state.trackPreviousBands = audio.bands.slice();
    if (chartCue.emitted) state.pendingTrigger = Math.max(state.pendingTrigger, chartCue.strength);
    for (var index = 0; index < ROAD_BAND_COUNT; index++) {
      var target = clamp01(audio.bands[index]) * intensity;
      state.bands[index] = damp(state.bands[index], target, target > state.bands[index] ? 16 : 4.6, dt);
    }
    var triggerHit = audio.trigger > 0.28 && state.lastTrigger <= 0.28;
    if (triggerHit) {
      state.boost = Math.max(state.boost, 0.72 + audio.trigger * 0.28);
      state.pendingTrigger = Math.max(state.pendingTrigger, audio.trigger);
    }
    state.lastTrigger = audio.trigger;
    state.boost *= Math.exp(-2.9 * dt);
    state.beat = damp(state.beat, Math.max(audio.beat, audio.trigger * 0.84), audio.beat > state.beat ? 20 : 5.4, dt);
    var lowDrive = state.bands[0] * 0.48 + state.bands[1] * 0.52;
    var targetSpeed = targetRoadSpeed(audio, fx, lowDrive, state.boost, state.beat);
    state.speed = damp(state.speed, targetSpeed, targetSpeed > state.speed ? 7.8 : 2.4, dt);
  }

  function syncTheme(fx, dt) {
    var theme = readTheme(fx);
    var amount = 1 - Math.exp(-3.2 * Math.max(0.001, dt));
    var uniforms = state.roadMaterial.uniforms;
    uniforms.uPrimary.value.lerp(theme.primary, amount);
    uniforms.uSecondary.value.lerp(theme.secondary, amount);
    uniforms.uAccent.value.lerp(theme.accent, amount);
    state.leftRail.material.color.lerp(theme.primary, amount);
    state.rightRail.material.color.lerp(theme.secondary, amount);
    state.leftLightMaterial.color.lerp(theme.primary.clone().lerp(theme.accent, 0.16), amount);
    state.rightLightMaterial.color.lerp(theme.secondary.clone().lerp(theme.accent, 0.12), amount);
    if (state.landmarkMaterials) {
      state.landmarkMaterials.glass.color.lerp(theme.primary.clone().lerp(new THREE.Color('#2c8da5'), 0.48), amount);
      state.landmarkMaterials.light.color.lerp(theme.accent.clone().lerp(new THREE.Color('#f4d28a'), 0.42), amount);
    }
  }

  function syncOpacity() {
    var opacity = clamp01(state.opacity);
    state.root.visible = opacity > 0.01;
    state.roadMaterial.uniforms.uOpacity.value = opacity;
    if (state.skyMaterial) state.skyMaterial.uniforms.uOpacity.value = opacity;
    if (state.precipitationMaterial) state.precipitationMaterial.uniforms.uOpacity.value = opacity;
    var celestialOpacity = opacity * state.celestialOpacity;
    if (state.celestialMaterial) state.celestialMaterial.opacity = celestialOpacity;
    if (state.celestialRingMaterial) state.celestialRingMaterial.uniforms.uOpacity.value = celestialOpacity;
    state.shoulderMaterial.opacity = opacity * 0.90;
    state.leftRail.material.opacity = opacity * (0.78 + state.bands[6] * 0.22);
    state.rightRail.material.opacity = opacity * (0.78 + state.bands[5] * 0.22);
    state.poleMaterial.opacity = opacity * 0.82;
    state.leftLightMaterial.opacity = opacity * (0.86 + state.bands[6] * 0.14);
    state.rightLightMaterial.opacity = opacity * (0.86 + state.bands[5] * 0.14);
    var worldOpacity = opacity * state.biomeFade;
    if (state.sceneryRoot) state.sceneryRoot.visible = worldOpacity > 0.01;
    if (state.landmarkRoot) state.landmarkRoot.visible = worldOpacity > 0.01;
    if (state.sceneryMaterials) {
      state.sceneryMaterials.mountain.opacity = worldOpacity * 0.68;
      state.sceneryMaterials.mound.opacity = worldOpacity * 0.72;
      state.sceneryMaterials.trunk.opacity = worldOpacity * 0.78;
      state.sceneryMaterials.crown.opacity = worldOpacity * 0.78;
      state.sceneryMaterials.cactus.opacity = worldOpacity * 0.82;
      state.sceneryMaterials.waterLeft.opacity = worldOpacity * state.leftWaterAmount * (0.52 + state.bands[6] * 0.16);
      state.sceneryMaterials.waterRight.opacity = worldOpacity * state.rightWaterAmount * (0.52 + state.bands[6] * 0.16);
    }
    if (state.landmarkMaterials) {
      state.landmarkMaterials.body.opacity = worldOpacity * 0.76;
      state.landmarkMaterials.shadow.opacity = worldOpacity * 0.64;
      state.landmarkMaterials.glass.opacity = worldOpacity * 0.76;
      state.landmarkMaterials.light.opacity = worldOpacity * (0.78 + state.beat * 0.16);
    }
  }

  function clearLayer() {
    if (state.root && state.scene) state.scene.remove(state.root);
    var geometries = [];
    var materials = [];
    if (state.root) {
      state.root.traverse(function (object) {
        if (object.geometry && geometries.indexOf(object.geometry) === -1) geometries.push(object.geometry);
        var list = Array.isArray(object.material) ? object.material : [object.material];
        list.forEach(function (material) {
          if (material && materials.indexOf(material) === -1) materials.push(material);
        });
      });
    }
    geometries.forEach(function (geometry) { geometry.dispose(); });
    materials.forEach(function (material) { material.dispose(); });
    state.root = null;
    state.scene = null;
    state.road = null;
    state.roadMaterial = null;
    state.roadPositions = null;
    state.roadEnergy = null;
    state.roadPulse = null;
    state.roadTrackPulse = null;
    state.spectrumEnergyHistory = null;
    state.spectrumPulseHistory = null;
    state.trackPulseHistory = null;
    state.spectrumHead = -1;
    state.spectrumSamples = 0;
    state.spectrumDistance = 0;
    state.spectrumWavePeak = 0;
    state.trackNotePeak = 0;
    state.shoulder = null;
    state.leftRail = null;
    state.rightRail = null;
    state.poleMesh = null;
    state.leftLights = null;
    state.rightLights = null;
    state.sky = null;
    state.skyMaterial = null;
    state.precipitation = null;
    state.precipitationMaterial = null;
    state.celestialRoot = null;
    state.celestialMesh = null;
    state.celestialMaterial = null;
    state.celestialRing = null;
    state.celestialRingMaterial = null;
    state.sceneryRoot = null;
    state.sceneryMaterials = null;
    state.mountainMesh = null;
    state.moundMesh = null;
    state.treeTrunkMesh = null;
    state.treeCrownMesh = null;
    state.cactusStemMesh = null;
    state.cactusArmMesh = null;
    state.leftWater = null;
    state.rightWater = null;
    state.landmarkRoot = null;
    state.landmarks = [];
    state.landmarkMaterials = null;
    state.biomeIndex = -1;
    state.nextBiomeIndex = -1;
    state.biomeBlend = 0;
    state.biomeFade = 0;
    state.leftWaterAmount = 0;
    state.rightWaterAmount = 0;
    state.weatherIndex = 0;
    state.nextWeatherIndex = 0;
    state.weatherBlend = 0;
    state.celestialIndex = 0;
    state.nextCelestialIndex = 0;
    state.activeCelestialIndex = -1;
    state.activeCelestialZone = -1;
    state.celestialOpacity = 0;
    state.celestialAxialTilt = 0;
    state.celestialAxisAzimuth = 0;
    state.celestialAxisX = 0;
    state.celestialAxisZ = 0;
    state.rainAmount = 0;
    state.snowAmount = 0;
    state.visibleLandmark = '';
    state.initialized = false;
    state.opacity = 0;
  }

  function isActive(fx) {
    return !!(fx && Number(fx.preset) === INDEX);
  }

  function syncShelfSuppression(active) {
    var manager = global.shelfManager;
    if (manager && typeof manager.setVisualSuppressed === 'function') manager.setVisualSuppressed(active);
  }

  function update(dt, ctx) {
    ctx = ctx || {};
    var fx = ctx.fx || {};
    var active = isActive(fx);
    syncShelfSuppression(active);
    state.opacity = damp(state.opacity, active ? 1 : 0, active ? 4.2 : 2.8, dt);
    if (!active && state.opacity < 0.01) {
      if (state.root) state.root.visible = false;
      return;
    }
    ensureLayer(ctx.scene);
    if (!state.root || !ctx.camera) return;
    var audio = readAudio(ctx.audio);
    updateAudioState(audio, fx, dt);
    state.time += dt;
    state.travel += state.speed * dt;
    if (state.travel > 100000) state.travel -= 50000;
    advanceSpectrumHistory(state.speed * dt);
    state.root.position.copy(ctx.camera.position);
    state.root.quaternion.copy(ctx.camera.quaternion);
    var curveNow = roadCenterAt(state.travel + 18, state.seed) - roadCenterAt(state.travel - 18, state.seed);
    var targetRoll = clamp(-curveNow * 0.0009, -MAX_CAMERA_ROLL, MAX_CAMERA_ROLL);
    state.roll = damp(state.roll, targetRoll, CAMERA_ROLL_RESPONSE, dt);
    state.rollQuaternion.setFromAxisAngle(state.rollAxis, state.roll);
    state.root.quaternion.multiply(state.rollQuaternion);
    updateRoadGeometry();
    updateRoadsideLights();
    updateWeather(dt);
    updateLandscape(dt);
    updateLandmarks();
    syncTheme(fx, dt);
    state.roadMaterial.uniforms.uTime.value = state.time;
    state.roadMaterial.uniforms.uTravel.value = state.travel;
    state.roadMaterial.uniforms.uBeat.value = state.beat;
    state.roadMaterial.uniforms.uBoost.value = state.boost;
    syncOpacity();
  }

  function onPresetChange(prev, next, ctx) {
    syncShelfSuppression(next === INDEX);
    if (prev === INDEX && next !== INDEX) clearLayer();
    if (next === INDEX && ctx && ctx.scene) {
      state.seed = Math.random() * 900 + 100;
      state.travel = 0;
      state.time = 0;
      state.speed = 12;
      state.boost = 0;
      state.roll = 0;
      state.beat = 0;
      state.lastTrigger = 0;
      state.biomeIndex = -1;
      state.nextBiomeIndex = -1;
      state.biomeBlend = 0;
      state.biomeFade = 0;
      state.leftWaterAmount = 0;
      state.rightWaterAmount = 0;
      state.weatherIndex = 0;
      state.nextWeatherIndex = 0;
      state.weatherBlend = 0;
      state.celestialIndex = 0;
      state.nextCelestialIndex = 0;
      state.activeCelestialIndex = -1;
      state.activeCelestialZone = -1;
      state.celestialOpacity = 0;
      state.celestialAxialTilt = 0;
      state.celestialAxisAzimuth = 0;
      state.celestialAxisX = 0;
      state.celestialAxisZ = 0;
      state.rainAmount = 0;
      state.snowAmount = 0;
      state.visibleLandmark = '';
      state.bands = [0, 0, 0, 0, 0, 0, 0, 0];
      resetSpectrumHistory();
      ensureLayer(ctx.scene);
    }
  }

  function snapshot() {
    return {
      active: !!(state.root && state.root.visible),
      initialized: state.initialized,
      travel: state.travel,
      speed: state.speed,
      roll: state.roll,
      opacity: state.opacity,
      bands: state.bands.slice(),
      biome: state.biomeIndex >= 0 ? BIOME_NAMES[state.biomeIndex] : '',
      nextBiome: state.nextBiomeIndex >= 0 ? BIOME_NAMES[state.nextBiomeIndex] : '',
      biomeBlend: state.biomeBlend,
      leftWaterAmount: state.leftWaterAmount,
      rightWaterAmount: state.rightWaterAmount,
      weather: WEATHER_NAMES[state.weatherIndex] || '',
      nextWeather: WEATHER_NAMES[state.nextWeatherIndex] || '',
      weatherBlend: state.weatherBlend,
      celestial: state.celestialOpacity > 0.01 && state.activeCelestialIndex >= 0 ? CELESTIAL_NAMES[state.activeCelestialIndex] || '' : '',
      nextCelestial: state.nextWeatherIndex >= 4 ? CELESTIAL_NAMES[state.nextCelestialIndex] || '' : '',
      celestialSide: state.activeCelestialZone >= 0 && state.celestialRoot ? (state.celestialRoot.position.x < 0 ? 'left' : 'right') : '',
      celestialPosition: state.activeCelestialZone >= 0 && state.celestialRoot ? {
        x: state.celestialRoot.position.x,
        y: state.celestialRoot.position.y,
        z: state.celestialRoot.position.z
      } : null,
      celestialAxialTilt: state.celestialAxialTilt,
      celestialAxisAzimuth: state.celestialAxisAzimuth,
      celestialAxis: state.activeCelestialZone >= 0 ? { x: state.celestialAxisX, z: state.celestialAxisZ } : null,
      celestial3D: !!(state.celestialMesh && state.celestialMesh.geometry && state.celestialMesh.geometry.type === 'SphereGeometry'),
      celestialMeshCount: state.celestialMesh ? 1 + (state.celestialRing ? 1 : 0) : 0,
      celestialTexturesReady: celestialTextureReadyCount(),
      rainAmount: state.rainAmount,
      snowAmount: state.snowAmount,
      precipitationCount: state.precipitation ? PRECIPITATION_COUNT : 0,
      visibleLandmark: state.visibleLandmark,
      sceneryInstances: state.mountainMesh
        ? state.mountainMesh.count + state.moundMesh.count + state.treeTrunkMesh.count + state.cactusStemMesh.count
        : 0,
      roadVertices: (ROAD_SEGMENT_COUNT + 1) * ROAD_COLUMN_COUNT,
      roadWaveVertices: state.roadPulse ? state.roadPulse.length : 0,
      roadTrackVertices: state.roadTrackPulse ? state.roadTrackPulse.length : 0,
      spectrumHistorySamples: state.spectrumSamples,
      spectrumWavePeak: state.spectrumWavePeak,
      trackNotePeak: state.trackNotePeak,
      spectrumEventLanePeak: state.spectrumEventLanePeak,
      trackEventCount: state.trackEventIndex,
      trackVisitedLanes: [0, 1, 2, 3].filter(function (lane) { return state.trackVisitedMask & (1 << lane); }).length,
      lastTrackLane: state.lastTrackLane,
      spectrumTravelPhase: clamp01(state.spectrumDistance / ROAD_SPECTRUM_STEP),
      lightPairs: LIGHT_PAIR_COUNT
    };
  }

  global.MineradioHighwayDrive = {
    INDEX: INDEX,
    isActive: isActive,
    update: update,
    clear: clearLayer,
    onPresetChange: onPresetChange,
    snapshot: snapshot,
    _test: {
      roadCenterAt: roadCenterAt,
      roadElevationAt: roadElevationAt,
      roadBandForSide: roadBandForSide,
      roadTrackLaneForSide: roadTrackLaneForSide,
      roadTrackLaneCenter: roadTrackLaneCenter,
      roadTrackLaneForBand: roadTrackLaneForBand,
      spectrumHistorySlotForRow: spectrumHistorySlotForRow,
      spectrumPulseForBand: spectrumPulseForBand,
      rhythmChartCueFrame: rhythmChartCueFrame,
      rhythmTrackEventFrame: rhythmTrackEventFrame,
      biomeIndexAtDistance: biomeIndexAtDistance,
      biomeStateAtDistance: biomeStateAtDistance,
      weatherStateAtDistance: weatherStateAtDistance,
      celestialIndexForZone: celestialIndexForZone,
      celestialPositionForZone: celestialPositionForZone,
      celestialAxialTiltForZone: celestialAxialTiltForZone,
      landmarkIndexAtDistance: landmarkIndexAtDistance,
      recycledWorldPlacement: recycledWorldPlacement,
      readAudio: readAudio,
      targetRoadSpeed: targetRoadSpeed,
      setJourneyForQa: function (distance, seed) {
        state.travel = Math.max(0, Number(distance) || 0);
        if (seed != null) state.seed = Number(seed) || 0;
        syncBiomeTransition(state.travel + ROAD_LENGTH * 0.34);
        var weather = weatherStateAtDistance(state.travel + ROAD_LENGTH * 0.34, state.seed);
        state.weatherIndex = weather.index;
        state.nextWeatherIndex = weather.nextIndex;
        state.weatherBlend = weather.blend;
        state.celestialIndex = celestialIndexForZone(weather.zone, state.seed);
        state.nextCelestialIndex = celestialIndexForZone(weather.zone + 1, state.seed);
      },
      constants: {
        segmentCount: ROAD_SEGMENT_COUNT,
        columnCount: ROAD_COLUMN_COUNT,
        bandCount: ROAD_BAND_COUNT,
        spectrumSampleCount: ROAD_SPECTRUM_SAMPLE_COUNT,
        trackMaxEventLanes: ROAD_TRACK_MAX_EVENT_LANES,
        trackMinEventGap: ROAD_TRACK_MIN_EVENT_GAP,
        trackOnsetThreshold: ROAD_TRACK_ONSET_THRESHOLD,
        trackLaneCount: ROAD_TRACK_LANE_COUNT,
        trackLaneBands: ROAD_TRACK_LANE_BANDS.map(function (bands) { return bands.slice(); }),
        lightPairCount: LIGHT_PAIR_COUNT,
        sceneryInstanceCount: SCENERY_INSTANCE_COUNT,
        scenerySpacing: SCENERY_SPACING,
        sceneryPassDistance: SCENERY_PASS_DISTANCE,
        biomeZoneLength: BIOME_ZONE_LENGTH,
        biomeNames: BIOME_NAMES.slice(),
        weatherNames: WEATHER_NAMES.slice(),
        celestialNames: CELESTIAL_NAMES.slice(),
        weatherTransitionStart: WEATHER_TRANSITION_START,
        precipitationCount: PRECIPITATION_COUNT,
        landmarkNames: LANDMARK_NAMES.slice(),
        landmarkSpacing: LANDMARK_SPACING,
        landmarkPassDistance: LANDMARK_PASS_DISTANCE,
        maxCameraRoll: MAX_CAMERA_ROLL,
        cameraRollResponse: CAMERA_ROLL_RESPONSE
      }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
