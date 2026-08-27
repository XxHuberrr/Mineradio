/**
 * Niu Lai Dream Migration visual preset for Mineradio.
 * An original low-poly homage built only from bounded Three.js geometry.
 */
(function (global) {
  'use strict';

  var INDEX = 10;
  var BAND_COUNT = 8;
  var PARTICLE_COUNT = 144;
  var MOUNTAIN_COUNT = 14;
  var GRASS_COUNT = 56;
  var RIPPLE_COUNT = 8;
  var CHAPTER_DURATION = 22;
  var CHAPTER_TRANSITION_START = 0.72;
  var CHAPTER_NAMES = ['desert-lullaby', 'grassland-awakening', 'forest-stand', 'ink-dream'];
  var CHAPTER_PALETTES = [
    { sky: 0x141619, ground: 0x4a4638, mountain: 0x222b2d, grass: 0xd1ac54, portal: 0x78c7b7, sun: 0xe8b85f },
    { sky: 0x071b1b, ground: 0x245844, mountain: 0x173b36, grass: 0x78a15c, portal: 0x69b8a2, sun: 0xf0c779 },
    { sky: 0x071113, ground: 0x17362c, mountain: 0x102723, grass: 0x4b8064, portal: 0xbe4738, sun: 0xe77856 },
    { sky: 0x17191c, ground: 0x252c2d, mountain: 0x090b0c, grass: 0x71877d, portal: 0xd9d1bc, sun: 0xb9ddd4 }
  ];

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function clamp01(value) {
    return clamp(Number(value) || 0, 0, 1);
  }

  function damp(current, target, speed, dt) {
    return current + (target - current) * (1 - Math.exp(-Math.max(0, speed) * Math.max(0, dt)));
  }

  function smoothstep(value) {
    value = clamp01(value);
    return value * value * (3 - 2 * value);
  }

  function seeded(index, salt) {
    var value = Math.sin(index * 91.173 + salt * 47.319) * 43758.5453;
    return value - Math.floor(value);
  }

  function chapterStateAtTime(time) {
    var raw = Math.max(0, Number(time) || 0) / CHAPTER_DURATION;
    var chapter = Math.floor(raw);
    var progress = raw - chapter;
    var index = chapter % CHAPTER_NAMES.length;
    var nextIndex = (index + 1) % CHAPTER_NAMES.length;
    var blend = progress < CHAPTER_TRANSITION_START
      ? 0
      : smoothstep((progress - CHAPTER_TRANSITION_START) / (1 - CHAPTER_TRANSITION_START));
    return { index: index, nextIndex: nextIndex, progress: progress, blend: blend };
  }

  function readAudio(audio) {
    audio = audio || {};
    var bass = clamp01(audio.bass);
    var mid = clamp01(audio.mid);
    var treble = clamp01(audio.treble);
    var detailed = audio.sonicDetailed === true;
    var bands = detailed
      ? [audio.subBass, audio.bass, audio.lowMid, audio.mid, audio.highMid, audio.presence, audio.brilliance, audio.air]
      : [bass, bass * 0.92, bass * 0.54 + mid * 0.46, mid, mid * 0.48 + treble * 0.52, treble * 0.82, treble, treble * 0.72];
    return {
      bands: bands.map(clamp01),
      bass: clamp01(detailed ? Math.max(audio.subBass || 0, audio.bass || 0) : bass),
      mid: clamp01(detailed ? Math.max(audio.lowMid || 0, audio.mid || 0, audio.highMid || 0) : mid),
      treble: clamp01(detailed ? Math.max(audio.presence || 0, audio.brilliance || 0, audio.air || 0) : treble),
      energy: clamp01(audio.energy),
      beat: clamp01(Math.max(audio.beat || 0, audio.kickEnvelope || 0, audio.triggerPulse || 0))
    };
  }

  var state = {
    initialized: false,
    scene: null,
    root: null,
    opacity: 0,
    time: 0,
    journey: 0,
    beat: 0,
    bass: 0,
    mid: 0,
    treble: 0,
    bands: [0, 0, 0, 0, 0, 0, 0, 0],
    chapterIndex: 0,
    nextChapterIndex: 1,
    chapterBlend: 0,
    materials: [],
    colorScratch: null,
    dummy: null,
    skyMaterial: null,
    groundMaterial: null,
    mountainMaterial: null,
    grassMaterial: null,
    portalMaterials: [],
    sunMaterial: null,
    cow: null,
    cowBody: null,
    cowHead: null,
    cowLegs: [],
    cape: null,
    capeBasePositions: null,
    lark: null,
    larkWings: [],
    portalRoot: null,
    mountainRoot: null,
    mountainMesh: null,
    grassMesh: null,
    dreamParticles: null,
    dreamParticleMaterial: null,
    rippleRoot: null,
    rippleMaterials: [],
    rippleMeshes: [],
    sun: null,
    river: null,
    riverMaterial: null
  };

  function registerMaterial(material, opacity) {
    material.transparent = true;
    material.userData.niuBaseOpacity = opacity == null ? 1 : opacity;
    material.userData.niuFrameOpacity = null;
    state.materials.push(material);
    return material;
  }

  function phong(color, opacity, options) {
    options = options || {};
    return registerMaterial(new THREE.MeshPhongMaterial({
      color: color,
      flatShading: options.flatShading !== false,
      shininess: options.shininess == null ? 5 : options.shininess,
      specular: options.specular == null ? 0x2b2927 : options.specular,
      side: options.side || THREE.FrontSide,
      depthWrite: options.depthWrite !== false
    }), opacity);
  }

  function basic(color, opacity, options) {
    options = options || {};
    return registerMaterial(new THREE.MeshBasicMaterial({
      color: color,
      side: options.side || THREE.FrontSide,
      depthWrite: options.depthWrite !== false,
      blending: options.blending || THREE.NormalBlending
    }), opacity);
  }

  function mesh(parent, geometry, material, position, scale, rotation, name) {
    var item = new THREE.Mesh(geometry, material);
    if (position) item.position.set(position[0], position[1], position[2]);
    if (scale) item.scale.set(scale[0], scale[1], scale[2]);
    if (rotation) item.rotation.set(rotation[0], rotation[1], rotation[2]);
    if (name) item.name = name;
    item.frustumCulled = false;
    parent.add(item);
    return item;
  }

  function createCape(parent, material) {
    var columns = 7;
    var rows = 4;
    var positions = new Float32Array(columns * rows * 3);
    var indices = [];
    var cursor = 0;
    for (var row = 0; row < rows; row++) {
      for (var column = 0; column < columns; column++) {
        var reach = column / (columns - 1);
        var vertical = row / (rows - 1);
        positions[cursor++] = -0.56 - reach * 4.7;
        positions[cursor++] = 1.42 - vertical * (0.48 + reach * 1.05);
        positions[cursor++] = 0.12 + (vertical - 0.5) * 0.10 - reach * 0.16;
      }
    }
    for (var y = 0; y < rows - 1; y++) {
      for (var x = 0; x < columns - 1; x++) {
        var a = y * columns + x;
        var b = a + 1;
        var c = a + columns;
        var d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    state.capeBasePositions = new Float32Array(positions);
    state.cape = mesh(parent, geometry, material, null, null, null, 'niulai-red-cape');
  }

  function createCow() {
    var cow = new THREE.Group();
    cow.name = 'niulai-low-poly-calf';
    cow.position.set(0.8, -0.18, -15.5);
    cow.rotation.y = -0.08;

    var fur = phong(0xc78a35, 1, { shininess: 4, specular: 0x49331f });
    var furDark = phong(0x704322, 1, { shininess: 3, specular: 0x251a13 });
    var muzzle = phong(0xb97961, 1, { shininess: 7, specular: 0x4d302b });
    var horn = phong(0x3b2925, 1, { shininess: 9, specular: 0x5b4a43 });
    var eye = phong(0x090807, 1, { flatShading: false, shininess: 22, specular: 0xffffff });
    var capeMaterial = basic(0xc52f25, 0.96, { side: THREE.DoubleSide, depthWrite: false });

    state.cowBody = mesh(cow, new THREE.SphereGeometry(1, 10, 7), fur, [0, 0.54, 0], [1.72, 1.03, 0.94], null, 'niulai-calf-body');
    mesh(cow, new THREE.SphereGeometry(1, 9, 6), furDark, [0, 0.68, 0.78], [0.93, 0.91, 0.78]);
    state.cowHead = mesh(cow, new THREE.SphereGeometry(1, 9, 7), fur, [0, 1.36, 1.15], [0.74, 0.72, 0.62], null, 'niulai-calf-head');
    mesh(cow, new THREE.SphereGeometry(1, 9, 6), muzzle, [0, 1.14, 1.66], [0.63, 0.37, 0.39]);
    mesh(cow, new THREE.SphereGeometry(1, 8, 6), furDark, [0, 1.13, 1.98], [0.30, 0.16, 0.10]);

    [-1, 1].forEach(function (side) {
      mesh(cow, new THREE.ConeGeometry(0.18, 0.76, 7), horn, [side * 0.55, 2.02, 1.12], [1, 1, 1], [0, 0, side * -0.48]);
      mesh(cow, new THREE.ConeGeometry(0.24, 0.50, 6), furDark, [side * 0.71, 1.70, 1.13], [1, 1, 0.68], [0, 0, side * -1.08]);
      mesh(cow, new THREE.SphereGeometry(1, 8, 6), eye, [side * 0.27, 1.49, 1.70], [0.075, 0.086, 0.046]);
      mesh(cow, new THREE.SphereGeometry(1, 7, 5), muzzle, [side * 0.18, 1.13, 2.07], [0.055, 0.045, 0.025]);
    });

    var legGeometry = new THREE.BoxGeometry(0.26, 1.18, 0.30);
    var hoofGeometry = new THREE.BoxGeometry(0.32, 0.20, 0.42);
    [[-0.84, 0.48], [0.84, 0.48], [-0.82, -0.50], [0.82, -0.50]].forEach(function (position, index) {
      var pivot = new THREE.Group();
      pivot.position.set(position[0], -0.08, position[1]);
      mesh(pivot, legGeometry, furDark, [0, -0.57, 0]);
      mesh(pivot, hoofGeometry, horn, [0, -1.20, 0.08]);
      pivot.userData.phase = index % 2 ? Math.PI : 0;
      cow.add(pivot);
      state.cowLegs.push(pivot);
    });

    var tail = new THREE.Group();
    tail.position.set(0, 0.80, -0.90);
    mesh(tail, new THREE.CylinderGeometry(0.055, 0.075, 1.05, 6), furDark, [0, -0.42, -0.28], null, [0.72, 0, 0]);
    mesh(tail, new THREE.SphereGeometry(0.16, 7, 5), furDark, [0, -0.82, -0.66]);
    cow.add(tail);
    cow.userData.tail = tail;

    createCape(cow, capeMaterial);
    state.cow = cow;
    state.root.add(cow);
  }

  function triangleGeometry(points) {
    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    geometry.computeVertexNormals();
    return geometry;
  }

  function createLark() {
    var lark = new THREE.Group();
    lark.name = 'niulai-low-poly-lark';
    lark.position.set(-1.6, 3.15, -16.2);
    var bodyMaterial = phong(0xe7b34d, 1, { shininess: 5, specular: 0x4b3720 });
    var wingMaterial = basic(0xffd67b, 0.95, { side: THREE.DoubleSide, depthWrite: false });
    var darkMaterial = phong(0x3b3024, 1, { shininess: 3 });

    mesh(lark, new THREE.SphereGeometry(1, 7, 5), bodyMaterial, [0, 0, 0], [0.34, 0.22, 0.48]);
    mesh(lark, new THREE.SphereGeometry(1, 7, 5), bodyMaterial, [0, 0.12, 0.40], [0.23, 0.22, 0.24]);
    mesh(lark, new THREE.ConeGeometry(0.09, 0.40, 5), darkMaterial, [0, 0.10, 0.74], null, [Math.PI / 2, 0, 0]);
    [-1, 1].forEach(function (side) {
      var wing = mesh(lark, triangleGeometry([
        0, 0, 0.10,
        side * 1.18, 0.04, -0.20,
        side * 0.34, -0.16, -0.45
      ]), wingMaterial, null, null, null, side < 0 ? 'niulai-lark-wing-left' : 'niulai-lark-wing-right');
      wing.userData.side = side;
      state.larkWings.push(wing);
    });
    state.lark = lark;
    state.root.add(lark);
  }

  function createEnvironment() {
    state.skyMaterial = basic(CHAPTER_PALETTES[0].sky, 1, { depthWrite: false });
    var sky = mesh(state.root, new THREE.PlaneGeometry(130, 76), state.skyMaterial, [0, 5, -62]);
    sky.renderOrder = -120;

    state.sunMaterial = basic(CHAPTER_PALETTES[0].sun, 0.72, { side: THREE.DoubleSide, depthWrite: false });
    state.sun = mesh(state.root, new THREE.CircleGeometry(4.8, 40), state.sunMaterial, [-10, 7, -50]);
    state.sun.renderOrder = -116;

    state.groundMaterial = phong(CHAPTER_PALETTES[0].ground, 1, { shininess: 1, specular: 0x171311, side: THREE.DoubleSide });
    var groundGeometry = new THREE.PlaneGeometry(100, 100, 18, 18);
    var groundPositions = groundGeometry.attributes.position;
    for (var point = 0; point < groundPositions.count; point++) {
      var x = groundPositions.getX(point);
      var y = groundPositions.getY(point);
      groundPositions.setZ(point, Math.sin(x * 0.18) * 0.18 + Math.cos(y * 0.14) * 0.14);
    }
    groundGeometry.computeVertexNormals();
    mesh(state.root, groundGeometry, state.groundMaterial, [0, -3.05, -32], null, [-Math.PI / 2, 0, 0], 'niulai-dream-ground');

    state.riverMaterial = basic(0x3b9b91, 0.34, { side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    state.river = mesh(state.root, new THREE.PlaneGeometry(5.4, 72, 1, 12), state.riverMaterial, [5.8, -2.83, -31], null, [-Math.PI / 2, 0, 0], 'niulai-dream-river');

    state.mountainRoot = new THREE.Group();
    state.mountainRoot.name = 'niulai-ink-mountains';
    state.mountainMaterial = phong(CHAPTER_PALETTES[0].mountain, 0.94, { shininess: 1, specular: 0x080908 });
    state.mountainMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 5), state.mountainMaterial, MOUNTAIN_COUNT);
    state.mountainMesh.frustumCulled = false;
    for (var mountain = 0; mountain < MOUNTAIN_COUNT; mountain++) {
      var side = mountain % 2 ? 1 : -1;
      var distance = 25 + seeded(mountain, 2) * 25;
      var scaleX = 3.0 + seeded(mountain, 3) * 5.8;
      var scaleY = 6.5 + seeded(mountain, 4) * 13;
      var xPosition = side * (5 + seeded(mountain, 5) * 22);
      state.dummy.position.set(xPosition, -3 + scaleY * 0.48, -distance);
      state.dummy.scale.set(scaleX, scaleY, scaleX * (0.56 + seeded(mountain, 6) * 0.40));
      state.dummy.rotation.set(0, seeded(mountain, 7) * Math.PI, 0);
      state.dummy.updateMatrix();
      state.mountainMesh.setMatrixAt(mountain, state.dummy.matrix);
    }
    state.mountainMesh.instanceMatrix.needsUpdate = true;
    state.mountainRoot.add(state.mountainMesh);
    state.root.add(state.mountainRoot);

    state.grassMaterial = phong(CHAPTER_PALETTES[0].grass, 0.86, { shininess: 1, specular: 0x141a13 });
    state.grassMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.07, 0.72, 4), state.grassMaterial, GRASS_COUNT);
    state.grassMesh.frustumCulled = false;
    for (var grass = 0; grass < GRASS_COUNT; grass++) {
      var grassX = -18 + seeded(grass, 9) * 36;
      var grassZ = -8 - seeded(grass, 10) * 34;
      var grassScale = 0.65 + seeded(grass, 11) * 1.6;
      state.dummy.position.set(grassX, -2.70, grassZ);
      state.dummy.scale.set(grassScale, grassScale, grassScale);
      state.dummy.rotation.set(0, seeded(grass, 12) * Math.PI, (seeded(grass, 13) - 0.5) * 0.18);
      state.dummy.updateMatrix();
      state.grassMesh.setMatrixAt(grass, state.dummy.matrix);
    }
    state.grassMesh.instanceMatrix.needsUpdate = true;
    state.root.add(state.grassMesh);
  }

  function createPortal() {
    state.portalRoot = new THREE.Group();
    state.portalRoot.name = 'niulai-ink-dream-gate';
    state.portalRoot.position.set(-0.5, 1.7, -29);
    [
      { radius: 7.4, tube: 0.34, arc: Math.PI * 1.82, rotation: -0.52, opacity: 0.58 },
      { radius: 6.7, tube: 0.12, arc: Math.PI * 1.58, rotation: 0.70, opacity: 0.34 },
      { radius: 8.0, tube: 0.10, arc: Math.PI * 1.32, rotation: 1.52, opacity: 0.22 }
    ].forEach(function (config, index) {
      var material = basic(CHAPTER_PALETTES[0].portal, config.opacity, { side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
      state.portalMaterials.push(material);
      var stroke = mesh(state.portalRoot, new THREE.TorusGeometry(config.radius, config.tube, 6, 64, config.arc), material);
      stroke.rotation.z = config.rotation;
      stroke.userData.baseRotation = config.rotation;
      stroke.userData.direction = index % 2 ? -1 : 1;
    });
    state.root.add(state.portalRoot);
  }

  function createRipples() {
    state.rippleRoot = new THREE.Group();
    state.rippleRoot.name = 'niulai-eight-band-ground-echo';
    state.rippleRoot.position.set(0.5, -2.88, -15.2);
    for (var index = 0; index < RIPPLE_COUNT; index++) {
      var radius = 2.0 + index * 0.66;
      var material = basic(index < 3 ? 0xe0a542 : (index < 6 ? 0x67b6a6 : 0xd15a45), 0.18, {
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      state.rippleMaterials.push(material);
      var ring = mesh(state.rippleRoot, new THREE.RingGeometry(radius, radius + 0.035, 72), material, null, null, [-Math.PI / 2, 0, 0]);
      ring.userData.index = index;
      state.rippleMeshes.push(ring);
    }
    state.root.add(state.rippleRoot);
  }

  function createDreamParticles() {
    var positions = new Float32Array(PARTICLE_COUNT * 3);
    var colors = new Float32Array(PARTICLE_COUNT * 3);
    var palette = [new THREE.Color(0xf1c46f), new THREE.Color(0xc74232), new THREE.Color(0x7bc2b0)];
    for (var index = 0; index < PARTICLE_COUNT; index++) {
      positions[index * 3] = -13 + seeded(index, 20) * 26;
      positions[index * 3 + 1] = -1 + seeded(index, 21) * 12;
      positions[index * 3 + 2] = -10 - seeded(index, 22) * 28;
      var color = palette[index % palette.length];
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }
    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    state.dreamParticleMaterial = registerMaterial(new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.12,
      sizeAttenuation: true,
      vertexColors: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }), 0.62);
    state.dreamParticles = new THREE.Points(geometry, state.dreamParticleMaterial);
    state.dreamParticles.name = 'niulai-dream-particles';
    state.dreamParticles.frustumCulled = false;
    state.root.add(state.dreamParticles);
  }

  function ensureLayer(scene) {
    if (state.initialized && state.scene === scene) return;
    clearLayer();
    if (!scene || typeof THREE === 'undefined') return;
    state.scene = scene;
    state.materials = [];
    state.portalMaterials = [];
    state.rippleMaterials = [];
    state.rippleMeshes = [];
    state.cowLegs = [];
    state.larkWings = [];
    state.dummy = new THREE.Object3D();
    state.colorScratch = new THREE.Color();
    state.root = new THREE.Group();
    state.root.name = 'niulai-dream-root';
    createEnvironment();
    createPortal();
    createRipples();
    createCow();
    createLark();
    createDreamParticles();

    var hemisphere = new THREE.HemisphereLight(0xf6d69a, 0x102923, 0.82);
    var key = new THREE.DirectionalLight(0xffd9a0, 1.18);
    key.position.set(-8, 13, 4);
    state.root.add(hemisphere);
    state.root.add(key);

    state.root.visible = false;
    scene.add(state.root);
    state.initialized = true;
  }

  function applyColor(material, from, to, blend) {
    if (!material || !material.color) return;
    material.color.setHex(from).lerp(state.colorScratch.setHex(to), blend);
  }

  function updateChapter() {
    var chapter = chapterStateAtTime(state.time);
    state.chapterIndex = chapter.index;
    state.nextChapterIndex = chapter.nextIndex;
    state.chapterBlend = chapter.blend;
    var current = CHAPTER_PALETTES[chapter.index];
    var next = CHAPTER_PALETTES[chapter.nextIndex];
    applyColor(state.skyMaterial, current.sky, next.sky, chapter.blend);
    applyColor(state.groundMaterial, current.ground, next.ground, chapter.blend);
    applyColor(state.mountainMaterial, current.mountain, next.mountain, chapter.blend);
    applyColor(state.grassMaterial, current.grass, next.grass, chapter.blend);
    applyColor(state.sunMaterial, current.sun, next.sun, chapter.blend);
    state.portalMaterials.forEach(function (material) {
      applyColor(material, current.portal, next.portal, chapter.blend);
    });
    state.sunMaterial.userData.niuFrameOpacity = 0.70 - (chapter.index === 3 ? 0.34 : 0) + state.beat * 0.08;
    state.riverMaterial.userData.niuFrameOpacity = chapter.index === 0 ? 0.12 : (chapter.index === 1 ? 0.44 : 0.30);
  }

  function updateCape() {
    if (!state.cape || !state.capeBasePositions) return;
    var positions = state.cape.geometry.attributes.position.array;
    for (var index = 0; index < positions.length; index += 3) {
      var baseX = state.capeBasePositions[index];
      var reach = Math.abs(baseX + 0.56) / 4.7;
      var wave = Math.sin(state.time * (2.3 + state.treble * 2.4) + reach * 6.4 + state.capeBasePositions[index + 1] * 1.7);
      positions[index] = baseX;
      positions[index + 1] = state.capeBasePositions[index + 1] + wave * reach * (0.10 + state.treble * 0.30) + state.beat * reach * 0.08;
      positions[index + 2] = state.capeBasePositions[index + 2] + Math.cos(state.time * 1.8 + reach * 5.2) * reach * (0.06 + state.mid * 0.18);
    }
    state.cape.geometry.attributes.position.needsUpdate = true;
  }

  function updateCharacters(dt) {
    var stride = state.time * (2.6 + state.bass * 4.4);
    state.cow.position.y = -0.18 + Math.sin(stride * 2) * (0.035 + state.bass * 0.085) + state.beat * 0.10;
    state.cow.rotation.y = -0.08 + Math.sin(state.time * 0.34) * 0.055;
    state.cowBody.scale.y = 1.03 + state.bass * 0.045;
    state.cowHead.rotation.x = Math.sin(stride) * (0.025 + state.mid * 0.055) - state.beat * 0.035;
    state.cowLegs.forEach(function (leg) {
      leg.rotation.x = Math.sin(stride + leg.userData.phase) * (0.20 + state.bass * 0.34);
    });
    if (state.cow.userData.tail) state.cow.userData.tail.rotation.z = Math.sin(state.time * 2.7) * (0.18 + state.treble * 0.28);
    updateCape();

    var flight = state.time * (0.62 + state.treble * 0.18);
    state.lark.position.x = -1.6 + Math.sin(flight) * 1.0;
    state.lark.position.y = 3.15 + Math.cos(flight * 1.7) * 0.30 + state.treble * 0.18;
    state.lark.rotation.z = Math.sin(flight * 1.2) * 0.12;
    var flap = Math.sin(state.time * (7.2 + state.treble * 7.0));
    state.larkWings.forEach(function (wing) {
      wing.rotation.z = wing.userData.side * (0.24 + flap * (0.34 + state.treble * 0.28));
    });

    state.portalRoot.children.forEach(function (stroke) {
      stroke.rotation.z = stroke.userData.baseRotation + state.time * 0.018 * stroke.userData.direction;
      stroke.scale.setScalar(1 + state.beat * 0.018 + state.mid * 0.012);
    });
    state.mountainRoot.position.x = Math.sin(state.time * 0.075) * 0.42;
    state.dreamParticles.rotation.y += dt * (0.018 + state.treble * 0.035);
    state.dreamParticles.position.y = Math.sin(state.time * 0.35) * 0.18;
    state.dreamParticleMaterial.size = 0.10 + state.treble * 0.15 + state.beat * 0.04;
    state.dreamParticleMaterial.userData.niuFrameOpacity = 0.40 + state.treble * 0.36;
  }

  function updateRipples() {
    state.rippleMeshes.forEach(function (ring, index) {
      var band = state.bands[index];
      var phase = (state.time * (0.34 + index * 0.012) + index / RIPPLE_COUNT) % 1;
      var scale = 0.84 + phase * 0.34 + band * 0.10 + state.beat * (index < 2 ? 0.08 : 0.025);
      ring.scale.setScalar(scale);
      ring.position.y = 0.006 * index;
      state.rippleMaterials[index].userData.niuFrameOpacity = (1 - phase) * (0.08 + band * 0.42 + state.beat * 0.08);
    });
  }

  function syncOpacity() {
    state.materials.forEach(function (material) {
      var frameOpacity = material.userData.niuFrameOpacity;
      var opacity = frameOpacity != null && isFinite(frameOpacity) ? frameOpacity : material.userData.niuBaseOpacity;
      material.opacity = clamp01(opacity * state.opacity);
    });
    if (state.root) state.root.visible = state.opacity > 0.008;
  }

  function clearLayer() {
    if (state.root && state.root.parent) state.root.parent.remove(state.root);
    if (state.root) {
      var geometries = [];
      var materials = [];
      state.root.traverse(function (object) {
        if (object.geometry && geometries.indexOf(object.geometry) < 0) geometries.push(object.geometry);
        var objectMaterials = object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
        objectMaterials.forEach(function (material) {
          if (materials.indexOf(material) < 0) materials.push(material);
        });
      });
      geometries.forEach(function (geometry) { geometry.dispose(); });
      materials.forEach(function (material) { material.dispose(); });
    }
    state.scene = null;
    state.root = null;
    state.materials = [];
    state.colorScratch = null;
    state.dummy = null;
    state.skyMaterial = null;
    state.groundMaterial = null;
    state.mountainMaterial = null;
    state.grassMaterial = null;
    state.portalMaterials = [];
    state.sunMaterial = null;
    state.riverMaterial = null;
    state.rippleMaterials = [];
    state.rippleMeshes = [];
    state.cowLegs = [];
    state.larkWings = [];
    state.cow = null;
    state.cowBody = null;
    state.cowHead = null;
    state.cape = null;
    state.capeBasePositions = null;
    state.lark = null;
    state.portalRoot = null;
    state.mountainRoot = null;
    state.mountainMesh = null;
    state.grassMesh = null;
    state.dreamParticles = null;
    state.dreamParticleMaterial = null;
    state.rippleRoot = null;
    state.sun = null;
    state.river = null;
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
    dt = clamp(Number(dt) || 0, 0, 0.08);
    var fx = ctx.fx || {};
    var active = isActive(fx);
    syncShelfSuppression(active);
    state.opacity = damp(state.opacity, active ? 1 : 0, active ? 4.4 : 3.0, dt);
    if (!active && state.opacity < 0.01) {
      if (state.root) state.root.visible = false;
      return;
    }
    ensureLayer(ctx.scene);
    if (!state.root || !ctx.camera) return;
    var audio = readAudio(ctx.audio);
    for (var index = 0; index < BAND_COUNT; index++) {
      state.bands[index] = damp(state.bands[index], audio.bands[index], audio.bands[index] > state.bands[index] ? 9.5 : 3.6, dt);
    }
    state.bass = damp(state.bass, audio.bass, 6.2, dt);
    state.mid = damp(state.mid, audio.mid, 5.5, dt);
    state.treble = damp(state.treble, audio.treble, 5.8, dt);
    state.beat = Math.max(audio.beat, damp(state.beat, 0, 7.8, dt));
    state.time += dt * (0.90 + (Number(fx.speed) || 1) * 0.10);
    state.journey += dt * (0.42 + audio.energy * 1.45 + state.beat * 0.75);
    state.root.position.copy(ctx.camera.position);
    state.root.quaternion.copy(ctx.camera.quaternion);
    state.root.position.y += Math.sin(state.time * 0.28) * 0.025;
    updateChapter();
    updateCharacters(dt);
    updateRipples();
    syncOpacity();
  }

  function onPresetChange(prev, next, ctx) {
    syncShelfSuppression(next === INDEX);
    if (prev === INDEX && next !== INDEX) clearLayer();
    if (next === INDEX && ctx && ctx.scene) {
      state.time = 0;
      state.journey = 0;
      state.beat = 0;
      state.bass = 0;
      state.mid = 0;
      state.treble = 0;
      state.bands = [0, 0, 0, 0, 0, 0, 0, 0];
      ensureLayer(ctx.scene);
    }
  }

  function countMeshes() {
    var count = 0;
    if (state.root) state.root.traverse(function (object) { if (object.isMesh) count += 1; });
    return count;
  }

  function snapshot() {
    return {
      active: !!(state.root && state.root.visible),
      initialized: state.initialized,
      opacity: state.opacity,
      time: state.time,
      journey: state.journey,
      chapter: CHAPTER_NAMES[state.chapterIndex] || '',
      nextChapter: CHAPTER_NAMES[state.nextChapterIndex] || '',
      chapterBlend: state.chapterBlend,
      beat: state.beat,
      bands: state.bands.slice(),
      cow3D: !!(state.cowBody && state.cowBody.geometry && state.cowBody.geometry.type === 'SphereGeometry'),
      capeVisible: !!(state.cape && state.cape.visible),
      larkVisible: !!(state.lark && state.lark.visible),
      meshCount: countMeshes(),
      particleCount: state.dreamParticles ? PARTICLE_COUNT : 0,
      mountainInstances: state.mountainMesh ? state.mountainMesh.count : 0,
      grassInstances: state.grassMesh ? state.grassMesh.count : 0,
      rippleCount: state.rippleMeshes.length,
      motionPhase: state.cow ? state.cow.position.y : 0
    };
  }

  global.MineradioNiuLaiDream = {
    INDEX: INDEX,
    isActive: isActive,
    update: update,
    clear: clearLayer,
    onPresetChange: onPresetChange,
    snapshot: snapshot,
    _test: {
      readAudio: readAudio,
      chapterStateAtTime: chapterStateAtTime,
      setTimeForQa: function (time) {
        state.time = Math.max(0, Number(time) || 0);
        var chapter = chapterStateAtTime(state.time);
        state.chapterIndex = chapter.index;
        state.nextChapterIndex = chapter.nextIndex;
        state.chapterBlend = chapter.blend;
      },
      constants: {
        bandCount: BAND_COUNT,
        particleCount: PARTICLE_COUNT,
        mountainCount: MOUNTAIN_COUNT,
        grassCount: GRASS_COUNT,
        rippleCount: RIPPLE_COUNT,
        chapterDuration: CHAPTER_DURATION,
        chapterNames: CHAPTER_NAMES.slice()
      }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
