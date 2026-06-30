// ============================================================
//  Mineradio — 01-three-core.js
// ============================================================

// ============================================================
//  Three.js 场景
// ============================================================
var scene = new THREE.Scene();
scene.background = null;
var camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
var RENDER_DPR_CAP = 1.35;
var RENDER_PIXEL_BUDGET = 5200000;
var RENDER_MIN_DPR = 0.72;
// 0 = display vsync. Keep visible playback high-refresh capable instead of capping 120Hz+ screens to 60/72.
var RENDER_VISIBLE_VSYNC = true;
var RENDER_ACTIVE_FPS = 0;
var RENDER_LARGE_FPS = 0;
var RENDER_HUGE_FPS = 0;
var RENDER_INTERACTION_FPS = 0;
var RENDER_INTERACTION_LARGE_FPS = 0;
var RENDER_INTERACTION_HUGE_FPS = 0;
var RENDER_INTERACTION_HOLD_MS = 900;
var renderInteractionBoostUntil = 0;
var renderInteractionReason = '';
function renderQualityProfile() {
  var quality = normalizePerformanceQuality(fx && fx.performanceQuality);
  if (quality === 'eco') return { cap: 0.95, min: 0.56, budget: 2400000 };
  if (quality === 'balanced') return { cap: 1.12, min: 0.66, budget: 3800000 };
  if (quality === 'ultra') return { cap: 1.75, min: 0.85, budget: 7800000 };
  return { cap: RENDER_DPR_CAP, min: RENDER_MIN_DPR, budget: RENDER_PIXEL_BUDGET };
}
function getRenderPixelRatio() {
  var device = window.devicePixelRatio || 1;
  if (isDeepBackgroundMode()) return Math.min(device, 0.30);
  var cssPixels = Math.max(1, innerWidth * innerHeight);
  var quality = renderQualityProfile();
  var budgetCap = Math.sqrt(quality.budget / cssPixels);
  var cap = Math.min(quality.cap, budgetCap);
  return Math.max(quality.min, Math.min(device, cap));
}
function getRenderPixelLoad() {
  var ratio = getRenderPixelRatio();
  return Math.max(1, innerWidth * innerHeight) * ratio * ratio;
}
function markRenderInteraction(reason, holdMs) {
  if (isDeepBackgroundMode()) return;
  var now = performance.now();
  renderInteractionBoostUntil = Math.max(renderInteractionBoostUntil, now + (holdMs || RENDER_INTERACTION_HOLD_MS));
  renderInteractionReason = reason || renderInteractionReason || 'interaction';
  if (typeof renderPerfState !== 'undefined' && renderPerfState) renderPerfState.lastRenderAt = 0;
}
function isRenderInteractionActive(now) {
  return (now || performance.now()) < renderInteractionBoostUntil;
}
function getRenderLoadTier() {
  var cssPixels = Math.max(1, innerWidth * innerHeight);
  var renderPixels = (typeof getRenderPixelLoad === 'function') ? getRenderPixelLoad() : cssPixels;
  if (cssPixels >= 7200000 || renderPixels >= 5000000) return 2;
  if (cssPixels >= 3200000 || renderPixels >= 3600000) return 1;
  return 0;
}
var renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' });
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(getRenderPixelRatio());
renderer.setSize(innerWidth, innerHeight);
renderer.domElement.style.background = 'transparent';
renderer.domElement.style.display = 'block';
renderer.domElement.style.width = '100%';
renderer.domElement.style.height = '100%';
renderer.domElement.tabIndex = 0;
document.getElementById('canvas-container').appendChild(renderer.domElement);

// ============================================================
//  相机系统 v7.1 — 分离 user offset / cinema offset
//   - userOrbit: 用户拖拽的目标 (永久保留, 不会被电影模式覆盖)
//   - cinemaOffset: 电影模式的微偏移 (始终叠加, 即使用户在拖)
//   - 最终 theta = userOrbit.theta + cinemaOffset.theta
//   - 回正按钮 / 双击屏幕: 让 userOrbit 缓慢归零
// ============================================================
var orbit = {
  userTheta: 0.0, userPhi: 0.08, userRadius: 6.6,
  cineTheta: 0.0, cinePhi: 0.0, cineRadius: 0.0,
  theta: 0.0, phi: 0.08, radius: 6.6,
  minPhi: -Math.PI*0.45, maxPhi: Math.PI*0.45,
  minRadius: 2.4, maxRadius: 14.0,
  baselineTheta: 0.0, baselinePhi: 0.08, baselineRadius: 6.6,
  rotating: false, last:{x:0,y:0},
  recentering: false,
  centerLocked: false,
  // v8: 镜头跟拍 (hover shelf / queue 时)
  lookAt: new THREE.Vector3(0,0,0),
  focus: {
    active: false,
    type: null,        // 'shelf-side' | 'shelf-stage' | 'queue'
    theta: 0.0, phi: 0.08, radius: 6.6,
    lookAt: new THREE.Vector3(0,0,0),
  },
  glowFollowX: 0,
  glowFollowY: 0,
  glowFollowRoll: 0,
  beatGlow: 0,
};
var ZERO_VEC = new THREE.Vector3(0,0,0);
var BASE_FOV = 45;
var camPunch = 0;
var cinemaT = 0;
function defaultFreeCameraState() {
  return {
    active: false,
    locked: false,
    position: new THREE.Vector3(0, 0, 6.6),
    yaw: 0,
    pitch: 0,
    roll: 0,
    fov: BASE_FOV,
    velocity: new THREE.Vector3(),
    keys: {},
    resetTween: null
  };
}
function readFreeCameraState() {
  var state = defaultFreeCameraState();
  try {
    var raw = JSON.parse(localStorage.getItem(FREE_CAMERA_STORE_KEY) || '{}') || {};
    if (raw.position) {
      state.position.set(
        clampRange(Number(raw.position.x) || 0, -80, 80),
        clampRange(Number(raw.position.y) || 0, -80, 80),
        clampRange(Number(raw.position.z) || 6.6, -80, 80)
      );
    }
    state.yaw = clampRange(Number(raw.yaw) || 0, -Math.PI * 8, Math.PI * 8);
    state.pitch = clampRange(Number(raw.pitch) || 0, -Math.PI * 0.49, Math.PI * 0.49);
    state.roll = clampRange(Number(raw.roll) || 0, -Math.PI, Math.PI);
    state.fov = clampRange(Number(raw.fov) || BASE_FOV, 26, 72);
    state.locked = !!(raw.locked || raw.active);
    state.active = false;
  } catch (e) {}
  return state;
}
var freeCamera = readFreeCameraState();
var FREE_CAMERA_MOVE = new THREE.Vector3();
var FREE_CAMERA_TARGET_VEL = new THREE.Vector3();
var FREE_CAMERA_SHAKE_DIR = new THREE.Vector3();
var FREE_CAMERA_EULER = new THREE.Euler(0, 0, 0, 'YXZ');
var FREE_CAMERA_RESET_MAT = new THREE.Matrix4();
var FREE_CAMERA_RESET_QUAT = new THREE.Quaternion();
var FREE_CAMERA_UP = new THREE.Vector3(0, 1, 0);
var freeCameraPointer = { seen: false, x: 0, y: 0 };
var freeCameraDeferredSaveTimer = 0;
function saveFreeCameraState() {
  if (!freeCamera) return;
  try {
    localStorage.setItem(FREE_CAMERA_STORE_KEY, JSON.stringify({
      locked: !!freeCamera.locked,
      active: !!freeCamera.active,
      position: { x: freeCamera.position.x, y: freeCamera.position.y, z: freeCamera.position.z },
      yaw: freeCamera.yaw,
      pitch: freeCamera.pitch,
      roll: freeCamera.roll,
      fov: freeCamera.fov
    }));
  } catch (e) {}
}
function scheduleFreeCameraStateSave(delay) {
  if (freeCameraDeferredSaveTimer) return;
  freeCameraDeferredSaveTimer = setTimeout(function(){
    freeCameraDeferredSaveTimer = 0;
    saveFreeCameraState();
  }, delay || 720);
}
function easeOutCubic01(t) {
  t = clamp01(t);
  return 1 - Math.pow(1 - t, 3);
}
function shortestAngleDelta(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}
function getDefaultFreeCameraResetPose() {
  var pose = {
    position: new THREE.Vector3(0, 0, 6.6),
    yaw: 0,
    pitch: 0,
    roll: 0,
    fov: BASE_FOV
  };
  if (typeof SKULL_PRESET_INDEX !== 'undefined' && fx && fx.preset === SKULL_PRESET_INDEX && typeof setSkullCameraTargetVectors === 'function') {
    var look = new THREE.Vector3();
    var shelfComposition = typeof isSkullShelfCompositionActive === 'function' && isSkullShelfCompositionActive();
    setSkullCameraTargetVectors(pose.position, look, innerHeight > innerWidth * 1.08, shelfComposition, 0);
    FREE_CAMERA_RESET_MAT.lookAt(pose.position, look, FREE_CAMERA_UP);
    FREE_CAMERA_RESET_QUAT.setFromRotationMatrix(FREE_CAMERA_RESET_MAT);
    FREE_CAMERA_EULER.setFromQuaternion(FREE_CAMERA_RESET_QUAT, 'YXZ');
    pose.pitch = FREE_CAMERA_EULER.x;
    pose.yaw = FREE_CAMERA_EULER.y;
    pose.roll = FREE_CAMERA_EULER.z;
  }
  return pose;
}
function captureFreeCameraFromCurrent() {
  if (!freeCamera) freeCamera = defaultFreeCameraState();
  camera.updateMatrixWorld(true);
  freeCamera.position.copy(camera.position);
  FREE_CAMERA_EULER.setFromQuaternion(camera.quaternion, 'YXZ');
  freeCamera.pitch = FREE_CAMERA_EULER.x;
  freeCamera.yaw = FREE_CAMERA_EULER.y;
  freeCamera.roll = FREE_CAMERA_EULER.z;
  freeCamera.fov = clampRange(camera.fov || BASE_FOV, 26, 72);
}
function applyFreeCameraToCamera() {
  if (!freeCamera || !(freeCamera.active || freeCamera.locked)) return false;
  var cameraShake = clampRange(Number(fx.cinemaShake) || 0, 0, 1.8);
  camera.position.copy(freeCamera.position);
  camera.rotation.order = 'YXZ';
  camera.rotation.set(
    freeCamera.pitch + beatCam.phiKick * cameraShake * 0.45,
    freeCamera.yaw + beatCam.thetaKick * cameraShake * 0.45,
    freeCamera.roll + beatCam.rollKick * cameraShake
  );
  if (cameraShake > 0 && Math.abs(beatCam.radiusKick) > 0.0001) {
    FREE_CAMERA_SHAKE_DIR.set(0, 0, -1).applyEuler(camera.rotation);
    camera.position.addScaledVector(FREE_CAMERA_SHAKE_DIR, beatCam.radiusKick * cameraShake * 0.52);
  }
  var cameraPunch = Math.max(camPunch * 0.55, beatCam.punch * 0.54 + beatCam.radiusKick * 0.16) * cameraShake;
  var targetFov = clampRange(freeCamera.fov || BASE_FOV, 26, 72) - cameraPunch * 1.75;
  camera.fov += (targetFov - camera.fov) * (targetFov < camera.fov ? 0.24 : 0.12);
  camera.updateProjectionMatrix();
  camPunch *= 0.86;
  return true;
}
function updateFreeCameraHint() {
  var el = document.getElementById('free-camera-hint');
  if (el) el.classList.toggle('show', !!(freeCamera && freeCamera.active));
}
function resetFreeCameraToDefault() {
  if (!freeCamera) return;
  if (freeCameraDeferredSaveTimer) {
    clearTimeout(freeCameraDeferredSaveTimer);
    freeCameraDeferredSaveTimer = 0;
  }
  var fromPos = freeCamera.position ? freeCamera.position.clone() : new THREE.Vector3(0, 0, 6.6);
  var resetPose = getDefaultFreeCameraResetPose();
  freeCamera.resetTween = {
    start: performance.now(),
    duration: 620,
    from: {
      position: fromPos,
      yaw: Number(freeCamera.yaw) || 0,
      pitch: Number(freeCamera.pitch) || 0,
      roll: Number(freeCamera.roll) || 0,
      fov: Number(freeCamera.fov) || BASE_FOV
    },
    to: {
      position: resetPose.position,
      yaw: resetPose.yaw,
      pitch: resetPose.pitch,
      roll: resetPose.roll,
      fov: resetPose.fov
    }
  };
  freeCamera.active = false;
  freeCamera.locked = true;
  freeCamera.keys = {};
  if (freeCamera.velocity) freeCamera.velocity.set(0, 0, 0);
  try { if (document.pointerLockElement === renderer.domElement) document.exitPointerLock(); } catch (e) {}
  updateFreeCameraHint();
  showToast('自由镜头正在平滑回正');
}
function toggleFreeCamera() {
  if (!freeCamera) freeCamera = defaultFreeCameraState();
  if (freeCamera.active) {
    freeCamera.active = false;
    freeCamera.locked = true;
    freeCamera.keys = {};
    if (freeCamera.velocity) freeCamera.velocity.set(0, 0, 0);
    try { if (document.pointerLockElement === renderer.domElement) document.exitPointerLock(); } catch (e) {}
    saveFreeCameraState();
    updateFreeCameraHint();
    showToast('自由镜头已固定');
    return;
  }
  captureFreeCameraFromCurrent();
  freeCamera.active = true;
  freeCamera.locked = true;
  freeCamera.resetTween = null;
  freeCamera.keys = {};
  freeCameraPointer.seen = false;
  if (!freeCamera.velocity) freeCamera.velocity = new THREE.Vector3();
  try { renderer.domElement.focus && renderer.domElement.focus({ preventScroll: true }); } catch (e) {
    try { renderer.domElement.focus && renderer.domElement.focus(); } catch (ignore) {}
  }
  saveFreeCameraState();
  updateFreeCameraHint();
  try {
    var lockResult = renderer.domElement.requestPointerLock && renderer.domElement.requestPointerLock();
    if (lockResult && lockResult.catch) lockResult.catch(function(){ freeCameraPointer.seen = false; });
  } catch (e) {
    freeCameraPointer.seen = false;
  }
  showToast('自由镜头: WASD 移动 · 鼠标转向 · K 回正');
}
function updateFreeCamera(dt) {
  if (!freeCamera) return;
  if (freeCamera.resetTween) {
    var tw = freeCamera.resetTween;
    var t = easeOutCubic01((performance.now() - tw.start) / Math.max(1, tw.duration || 620));
    freeCamera.position.copy(tw.from.position).lerp(tw.to.position, t);
    freeCamera.yaw = tw.from.yaw + shortestAngleDelta(tw.from.yaw, tw.to.yaw) * t;
    freeCamera.pitch = tw.from.pitch + (tw.to.pitch - tw.from.pitch) * t;
    freeCamera.roll = tw.from.roll + shortestAngleDelta(tw.from.roll, tw.to.roll) * t;
    freeCamera.fov = tw.from.fov + (tw.to.fov - tw.from.fov) * t;
    if (t >= 0.999) {
      freeCamera.position.copy(tw.to.position);
      freeCamera.yaw = tw.to.yaw;
      freeCamera.pitch = tw.to.pitch;
      freeCamera.roll = tw.to.roll;
      freeCamera.fov = tw.to.fov;
      freeCamera.resetTween = null;
      freeCamera.active = false;
      freeCamera.locked = false;
      saveFreeCameraState();
      updateFreeCameraHint();
      recenterCamera();
      showToast('自由镜头已回正');
    }
    return;
  }
  if (!freeCamera.active) return;
  var keys = freeCamera.keys || {};
  FREE_CAMERA_MOVE.set(0, 0, 0);
  if (keys.KeyW) FREE_CAMERA_MOVE.z -= 1;
  if (keys.KeyS) FREE_CAMERA_MOVE.z += 1;
  if (keys.KeyA) FREE_CAMERA_MOVE.x -= 1;
  if (keys.KeyD) FREE_CAMERA_MOVE.x += 1;
  if (keys.Space) FREE_CAMERA_MOVE.y += 1;
  if (keys.ControlLeft || keys.ControlRight) FREE_CAMERA_MOVE.y -= 1;
  if (!freeCamera.velocity) freeCamera.velocity = new THREE.Vector3();
  var targetVel = FREE_CAMERA_TARGET_VEL.set(0, 0, 0);
  if (FREE_CAMERA_MOVE.lengthSq() > 0) {
    FREE_CAMERA_MOVE.normalize();
    FREE_CAMERA_EULER.set(freeCamera.pitch, freeCamera.yaw, 0, 'YXZ');
    FREE_CAMERA_MOVE.applyEuler(FREE_CAMERA_EULER);
    var speed = (keys.ShiftLeft || keys.ShiftRight ? 6.2 : 2.35);
    targetVel.copy(FREE_CAMERA_MOVE).multiplyScalar(speed);
  }
  var ease = targetVel.lengthSq() > 0 ? 8.2 : 13.5;
  freeCamera.velocity.lerp(targetVel, clampRange(ease * Math.max(0.001, dt || 1 / 60), 0, 1));
  if (freeCamera.velocity.lengthSq() < 0.0004) freeCamera.velocity.set(0, 0, 0);
  freeCamera.position.addScaledVector(freeCamera.velocity, Math.max(0.001, dt || 1 / 60));
  var rollDir = (keys.KeyQ ? 1 : 0) - (keys.KeyE ? 1 : 0);
  if (rollDir) freeCamera.roll = clampRange(freeCamera.roll + rollDir * dt * 0.9, -Math.PI, Math.PI);
  scheduleFreeCameraStateSave(720);
}
function flushPersistentVisualState() {
  try { saveLyricLayout(); } catch (e) {}
  try { saveFreeCameraState(); } catch (e) {}
}
window.addEventListener('beforeunload', flushPersistentVisualState);
window.addEventListener('pagehide', flushPersistentVisualState);

function resetBeatCameraSync(t) {
  beatCam.nextIdx = 0;
  beatCam.events.length = 0;
  beatCam.punch = 0;
  beatCam.lastTriggerAt = -10;
  beatCam.lastRealtimeAt = -10;
  beatCam.thetaKick = 0;
  beatCam.phiKick = 0;
  beatCam.radiusKick = 0;
  beatCam.rollKick = 0;
  beatCam.prevAudioTime = isFinite(t) ? t : -1;
  camPunch = 0;
  beatCam.stats.map = 0;
  beatCam.stats.live = 0;
  beatCam.stats.merged = 0;
  beatCam.stats.liveBlocked = 0;
  liveCamAvg = 0;
  liveCamPeak = 0.28;
  liveCamLastRaw = 0;
  resetRealtimeBeatEngine();
}

function syncBeatCameraToTime(t) {
  resetBeatCameraSync(t);
  if (!currentBeatMap) return;
  alignBeatCameraCursorToTime(t);
}

function alignBeatCameraCursorToTime(t) {
  if (!currentBeatMap) return;
  var beats = currentBeatMap.cameraBeats || currentBeatMap.beats || currentBeatMap.kicks || [];
  beatCam.nextIdx = 0;
  while (beatCam.nextIdx < beats.length) {
    var bt = typeof beats[beatCam.nextIdx] === 'number' ? beats[beatCam.nextIdx] : beats[beatCam.nextIdx].time;
    if (bt >= t + beatCam.lookahead) break;
    beatCam.nextIdx++;
  }
}

function easeBeatCamera(x) {
  x = Math.max(0, Math.min(1, x));
  return x * x * (3 - 2 * x);
}

function updateCinemaDynamics(rawEnergy, rawLow) {
  var e = clamp01(rawEnergy || 0);
  var l = clamp01(rawLow || 0);
  var isDj = djMode.active;
  var composite = clamp01(e * (isDj ? 0.52 : 0.62) + l * (isDj ? 0.48 : 0.38));
  if (isDj) {
    var prevEnergy = djMode.sectionEnergy || 0;
    var prevLow = djMode.sectionLow || 0;
    djMode.sectionEnergy += (e - djMode.sectionEnergy) * (e > djMode.sectionEnergy ? 0.030 : 0.010);
    djMode.sectionLow += (l - djMode.sectionLow) * (l > djMode.sectionLow ? 0.036 : 0.012);
    var change = Math.abs(e - prevEnergy) * 0.46 + Math.abs(l - prevLow) * 0.62;
    djMode.sectionChange += (change - djMode.sectionChange) * (change > djMode.sectionChange ? 0.055 : 0.018);
    djMode.visualPulse *= Math.pow(0.30, 1 / 60);
  }
  cinemaDynamics.avg += (composite - cinemaDynamics.avg) * (composite > cinemaDynamics.avg ? (isDj ? 0.018 : 0.010) : (isDj ? 0.006 : 0.004));
  cinemaDynamics.lowAvg += (l - cinemaDynamics.lowAvg) * (l > cinemaDynamics.lowAvg ? (isDj ? 0.022 : 0.012) : (isDj ? 0.007 : 0.005));
  cinemaDynamics.peak = Math.max(isDj ? 0.36 : 0.30, cinemaDynamics.peak * (isDj ? 0.9980 : 0.9988), composite);
  var floor = Math.max(0.10, cinemaDynamics.avg * 0.82);
  var span = Math.max(0.18, cinemaDynamics.peak - floor);
  var lift = clamp01((composite - floor) / span);
  lift = lift * lift * (3 - 2 * lift);
  var target = isDj
    ? 0.50 + lift * 0.66 + clamp01((l - cinemaDynamics.lowAvg) / 0.30) * 0.18 + clamp01(djMode.sectionChange * 2.4) * 0.08
    : 0.42 + lift * 0.56 + clamp01((l - cinemaDynamics.lowAvg) / 0.36) * 0.12;
  if (cinemaDynamics.avg < 0.18 && l < 0.32) target *= isDj ? 0.88 : 0.78;
  if (e > 0.48 && l > 0.46) target = Math.max(target, isDj ? 1.02 : 0.92);
  target = clampRange(target, isDj ? 0.42 : 0.34, isDj ? 1.24 : 1.08);
  cinemaDynamics.scale += (target - cinemaDynamics.scale) * (target > cinemaDynamics.scale ? (isDj ? 0.070 : 0.045) : (isDj ? 0.030 : 0.022));
}

function cameraDynamicsScale(extra) {
  var isDj = djMode.active;
  var djBoost = isDj ? (1.06 + clamp01(djMode.sectionLow) * 0.16 + clamp01(rtBeat.tempoConfidence) * 0.08) : 1;
  return clampRange((cinemaDynamics.scale || 0.82) * (cinemaTrackProfile.scale || 1) * (extra == null ? 1 : extra) * djBoost, isDj ? 0.24 : 0.18, isDj ? 1.42 : 1.18);
}

function cinemaTrackNameHint(song) {
  var label = ((song && song.name) || '') + ' ' + ((song && song.artist) || '');
  label = label.toLowerCase().replace(/\s+/g, '');
  if (/after17/.test(label)) return 0.46;
  if (/joey/.test(label)) return 1.08;
  return 1.0;
}

function cinemaAnalysisProfileForSong(song) {
  var title = String((song && (song.name || song.title)) || '').toLowerCase().replace(/\s+/g, '');
  var artist = String((song && song.artist) || '').toLowerCase().replace(/\s+/g, '');
  var label = title + ' ' + artist;
  if (/日落大道|sunsetboulevard/.test(label)) {
    return {
      id: 'sunset-boulevard-soft-groove',
      softGroove: true,
      phaseScan: true,
      localRefine: true,
      sparseCamera: true,
      introPattern: true
    };
  }
  return { id: 'default', softGroove: false, phaseScan: false, localRefine: false, sparseCamera: false, introPattern: false };
}

function resetCinemaTrackProfile(song) {
  var isDj = isPodcastSong(song);
  cinemaTrackProfile.scale = isDj ? 1.08 : 1.0;
  cinemaTrackProfile.target = isDj ? 1.10 : 1.0;
  cinemaTrackProfile.nameHint = isDj ? 1.12 : cinemaTrackNameHint(song);
  cinemaTrackProfile.frames = 0;
  cinemaTrackProfile.energyAvg = 0;
  cinemaTrackProfile.lowAvg = 0;
  cinemaTrackProfile.vocalAvg = 0;
  cinemaTrackProfile.melodyAvg = 0;
  cinemaTrackProfile.punchPeak = 0.10;
  cinemaTrackProfile.density = 0;
}

function updateCinemaTrackProfile(sample) {
  if (!sample) return;
  var p = cinemaTrackProfile;
  p.frames++;
  function follow(cur, next, k) { return cur + (next - cur) * k; }
  var early = p.frames < 360;
  var k = early ? 0.020 : 0.006;
  p.energyAvg = follow(p.energyAvg, clamp01(sample.energy), k);
  p.lowAvg = follow(p.lowAvg, clamp01(sample.low), k);
  p.vocalAvg = follow(p.vocalAvg, clamp01(sample.vocal), k * 0.8);
  p.melodyAvg = follow(p.melodyAvg, clamp01(sample.melody), k * 0.8);
  var punchRaw = clamp01((sample.lowOnset || 0) * 2.4 + (sample.energyOnset || 0) * 1.5 + sample.low * 0.16);
  p.punchPeak = Math.max(0.10, p.punchPeak * 0.9975, punchRaw);
  var lowDrive = clamp01((p.lowAvg - 0.20) / 0.42);
  var loudDrive = clamp01((p.energyAvg - 0.18) / 0.40);
  var punchDrive = clamp01((p.punchPeak - 0.13) / 0.36);
  var vocalSoft = clamp01((p.vocalAvg * 0.72 + p.melodyAvg * 0.42 - p.lowAvg * 0.34 - 0.08) / 0.42);
  var quietSoft = clamp01((0.24 - p.energyAvg) / 0.18);
  var target = djMode.active
    ? 0.72 + lowDrive * 0.34 + loudDrive * 0.18 + punchDrive * 0.42 - vocalSoft * 0.12 - quietSoft * 0.06
    : 0.54 + lowDrive * 0.28 + loudDrive * 0.22 + punchDrive * 0.34 - vocalSoft * 0.34 - quietSoft * 0.18;
  if (p.density) target += clamp01((p.density - 0.55) / 1.6) * 0.14;
  target *= p.nameHint || 1;
  target = clampRange(target, djMode.active ? 0.68 : 0.28, djMode.active ? 1.26 : 1.12);
  p.target = target;
  p.scale += (target - p.scale) * (target > p.scale ? (djMode.active ? 0.045 : 0.030) : (djMode.active ? 0.030 : 0.045));
}

function applyCinemaProfileFromBeatMap(map) {
  if (!map || !map.duration) return;
  var events = (map.cameraBeats || map.beats || []).filter(function(b){ return b && typeof b !== 'number' && b.camera !== false; });
  if (!events.length) return;
  var sumImpact = 0, sumLow = 0, primary = 0;
  events.forEach(function(b){
    sumImpact += Math.max(b.impact || 0, b.strength || 0);
    sumLow += b.low || 0;
    if (b.primary !== false) primary++;
  });
  var avgImpact = sumImpact / events.length;
  var avgLow = sumLow / events.length;
  var density = events.length / Math.max(20, map.duration);
  cinemaTrackProfile.density = density;
  var target = 0.44 + clamp01((avgImpact - 0.20) / 0.55) * 0.38 + clamp01((avgLow - 0.24) / 0.48) * 0.18 + clamp01((density - 0.45) / 1.65) * 0.20 + clamp01(primary / Math.max(1, events.length)) * 0.08;
  target *= cinemaTrackProfile.nameHint || 1;
  target = clampRange(target, 0.28, 1.12);
  cinemaTrackProfile.target = target;
  cinemaTrackProfile.scale += (target - cinemaTrackProfile.scale) * (target < cinemaTrackProfile.scale ? 0.55 : 0.22);
}

function resetRealtimeBeatEngine() {
  rtBeat.subFast = rtBeat.subSlow = rtBeat.lowFast = rtBeat.lowSlow = 0;
  rtBeat.bodyFast = rtBeat.bodySlow = rtBeat.vocalFast = rtBeat.vocalSlow = rtBeat.snapFast = rtBeat.snapSlow = 0;
  rtBeat.prevSub = rtBeat.prevLow = rtBeat.prevBody = rtBeat.prevVocal = rtBeat.prevSnap = rtBeat.prevRms = 0;
  rtBeat.onsetAvg = 0.012;
  rtBeat.onsetPeak = 0.060;
  rtBeat.subPeak = 0.14;
  rtBeat.lowPeak = 0.18;
  rtBeat.bodyPeak = 0.16;
  rtBeat.vocalPeak = 0.16;
  rtBeat.snapPeak = 0.14;
  rtBeat.lastHitAt = -10;
  rtBeat.tempoGap = 0;
  rtBeat.tempoConfidence = 0;
  rtBeat.beatCount = 0;
  rtBeat.primedFrames = 0;
  rtBeat.warmupUntil = (audio && isFinite(audio.currentTime) ? audio.currentTime : 0) + (djMode.active ? 0.34 : 1.15);
  rtBeat.pulse = 0;
  rtBeat.score = 0;
  rtBeat.stats.hits = 0;
  rtBeat.stats.blocked = 0;
  rtBeat.stats.assisted = 0;
  rtBeat.stats.strong = 0;
  rtBeat.stats.rejected = 0;
}

function resetAudioVisualState() {
  bass = 0;
  mid = 0;
  treble = 0;
  audioEnergy = 0;
  beatPulse = 0;
  prevEnergy = 0;
  smoothBass = 0;
  smoothMid = 0;
  smoothTreb = 0;
  smoothEnergy = 0;
  bassPeak = 0.12;
  midPeak = 0.10;
  treblePeak = 0.08;
  energyPeak = 0.10;
  scheduledBeatPulse = 0;
  scheduledBeatFlag = false;
  beatOnsetFlag = false;
  cinemaDynamics.avg = 0;
  cinemaDynamics.lowAvg = 0;
  cinemaDynamics.peak = 0.30;
  cinemaDynamics.scale = 0.82;
  if (djMode.active) resetDjModeMeter();
}

function beatEventTime(ev) {
  return typeof ev === 'number' ? ev : (ev && isFinite(ev.time) ? ev.time : Infinity);
}

function yieldToPaint() {
  return new Promise(function(resolve) {
    if (isHiddenForBackgroundOptimization() || typeof requestAnimationFrame !== 'function') {
      setTimeout(resolve, 0);
    } else {
      requestAnimationFrame(function(){ setTimeout(resolve, 0); });
    }
  });
}

function yieldToIdle(timeout) {
  return new Promise(function(resolve) {
    if (isHiddenForBackgroundOptimization()) {
      setTimeout(resolve, Math.min(timeout || 80, 80));
      return;
    }
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(function(){ resolve(); }, { timeout: timeout || 1200 });
    } else {
      setTimeout(resolve, timeout ? Math.min(timeout, 600) : 160);
    }
  });
}

function scheduleAnalysisTask(fn, timeout) {
  if (typeof fn !== 'function') return;
  if (isHiddenForBackgroundOptimization()) {
    setTimeout(fn, 0);
    return;
  }
  if (window.requestIdleCallback) {
    requestIdleCallback(fn, { timeout: timeout || 900 });
  } else {
    setTimeout(fn, Math.min(timeout || 420, 420));
  }
}

function scheduleVisualApply(fn, delay, timeout) {
  if (typeof fn !== 'function') return;
  setTimeout(function(){
    if (isHiddenForBackgroundOptimization() || typeof requestAnimationFrame !== 'function') {
      fn();
      return;
    }
    var run = function(){ requestAnimationFrame(fn); };
    if (window.requestIdleCallback) requestIdleCallback(run, { timeout: timeout || 360 });
    else run();
  }, delay || 0);
}

function scheduleUiWarmTask(fn, timeout) {
  if (typeof fn !== 'function') return;
  var run = function(){ requestAnimationFrame(fn); };
  if (isHiddenForBackgroundOptimization() || typeof requestAnimationFrame !== 'function') {
    setTimeout(fn, 0);
  } else if (window.requestIdleCallback) {
    requestIdleCallback(run, { timeout: timeout || 220 });
  } else {
    requestAnimationFrame(fn);
  }
}

function cancelBeatAnalysisTimer() {
  if (beatAnalysisTimer) {
    clearTimeout(beatAnalysisTimer);
    beatAnalysisTimer = null;
  }
}

function cancelBeatPrefetchTimer() {
  if (beatPrefetchTimer) {
    clearTimeout(beatPrefetchTimer);
    beatPrefetchTimer = null;
  }
}

function beatAnalysisYieldMs(options, currentMs, prefetchMs) {
  options = options || {};
  if (options.prefetch) return prefetchMs == null ? 620 : prefetchMs;
  if (options.background) return currentMs == null ? 120 : currentMs;
  return Math.min(currentMs == null ? 120 : currentMs, 160);
}

function beatBandRms(data, sampleRate, fftSize, hz0, hz1) {
  var binHz = sampleRate / fftSize;
  var a = Math.max(1, Math.floor(hz0 / binHz));
  var b = Math.min(data.length - 1, Math.ceil(hz1 / binHz));
  var sum = 0, count = 0;
  for (var i = a; i <= b; i++) {
    var v = data[i] / 255;
    sum += v * v;
    count++;
  }
  return count ? Math.sqrt(sum / count) : 0;
}

function processRealtimeBeatEngine(dt) {
  if (!beatAnalyser || !audioCtx || !audio || audio.paused) return null;
  dt = Math.max(0.001, Math.min(0.080, dt || 0.016));
  var dj = djMode.active;
  beatAnalyser.getByteFrequencyData(beatFrequencyData);
  beatAnalyser.getByteTimeDomainData(beatTimeDomainData);
  var sr = audioCtx.sampleRate || 44100;
  var sub = beatBandRms(beatFrequencyData, sr, beatAnalyser.fftSize, 38, 74);
  var kick = beatBandRms(beatFrequencyData, sr, beatAnalyser.fftSize, 52, 165);
  var body = beatBandRms(beatFrequencyData, sr, beatAnalyser.fftSize, 165, 420);
  var vocal = beatBandRms(beatFrequencyData, sr, beatAnalyser.fftSize, 420, 2600);
  var snap = beatBandRms(beatFrequencyData, sr, beatAnalyser.fftSize, 1800, 9200);
  var low = Math.min(1, kick * 0.86 + sub * 0.42);
  var rms = 0;
  for (var i = 0; i < beatTimeDomainData.length; i++) {
    var tv = (beatTimeDomainData[i] - 128) / 128;
    rms += tv * tv;
  }
  rms = Math.sqrt(rms / beatTimeDomainData.length);

  function follow(cur, next, upTau, downTau) {
    var tau = next > cur ? upTau : downTau;
    return cur + (next - cur) * (1 - Math.exp(-dt / Math.max(0.001, tau)));
  }
  var fastMul = dj ? 0.86 : 1;
  var downMul = dj ? 0.94 : 1;
  var slowMul = dj ? 1.06 : 1;
  rtBeat.subFast = follow(rtBeat.subFast, sub, 0.018 * fastMul, 0.064 * downMul);
  rtBeat.subSlow = follow(rtBeat.subSlow, sub, 0.320 * slowMul, 0.520 * slowMul);
  rtBeat.lowFast = follow(rtBeat.lowFast, low, 0.016 * fastMul, 0.070 * downMul);
  rtBeat.lowSlow = follow(rtBeat.lowSlow, low, 0.300 * slowMul, 0.540 * slowMul);
  rtBeat.bodyFast = follow(rtBeat.bodyFast, body, 0.020 * fastMul, 0.082 * downMul);
  rtBeat.bodySlow = follow(rtBeat.bodySlow, body, 0.360 * slowMul, 0.600 * slowMul);
  rtBeat.vocalFast = follow(rtBeat.vocalFast, vocal, 0.026 * fastMul, 0.090 * downMul);
  rtBeat.vocalSlow = follow(rtBeat.vocalSlow, vocal, 0.340 * slowMul, 0.580 * slowMul);
  rtBeat.snapFast = follow(rtBeat.snapFast, snap, 0.012 * fastMul, 0.060 * downMul);
  rtBeat.snapSlow = follow(rtBeat.snapSlow, snap, 0.300 * slowMul, 0.520 * slowMul);

  var peakDecay = dj ? 0.988 : 0.990;
  rtBeat.subPeak = Math.max(rtBeat.subPeak * Math.pow(peakDecay, dt * 60), sub, 0.045);
  rtBeat.lowPeak = Math.max(rtBeat.lowPeak * Math.pow(dj ? 0.987 : 0.989, dt * 60), low, 0.060);
  rtBeat.bodyPeak = Math.max(rtBeat.bodyPeak * Math.pow(peakDecay, dt * 60), body, 0.040);
  rtBeat.vocalPeak = Math.max(rtBeat.vocalPeak * Math.pow(peakDecay, dt * 60), vocal, 0.040);
  rtBeat.snapPeak = Math.max(rtBeat.snapPeak * Math.pow(peakDecay, dt * 60), snap, 0.035);

  var subFlux = Math.max(0, sub - rtBeat.prevSub);
  var lowFlux = Math.max(0, low - rtBeat.prevLow);
  var bodyFlux = Math.max(0, body - rtBeat.prevBody);
  var vocalFlux = Math.max(0, vocal - rtBeat.prevVocal);
  var snapFlux = Math.max(0, snap - rtBeat.prevSnap);
  var rmsFlux = Math.max(0, rms - rtBeat.prevRms);
  var subRise = Math.max(0, rtBeat.subFast - rtBeat.subSlow);
  var lowRise = Math.max(0, rtBeat.lowFast - rtBeat.lowSlow);
  var bodyRise = Math.max(0, rtBeat.bodyFast - rtBeat.bodySlow);
  var vocalRise = Math.max(0, rtBeat.vocalFast - rtBeat.vocalSlow);
  var snapRise = Math.max(0, rtBeat.snapFast - rtBeat.snapSlow);
  var drumOnset = subRise * 0.88 + subFlux * 0.66 + lowRise * 1.62 + lowFlux * 1.34;
  var musicalOnset = bodyRise * 0.34 + bodyFlux * 0.24 + vocalRise * 0.52 + vocalFlux * 0.36 + snapRise * 0.08 + snapFlux * 0.06 + rmsFlux * 0.20;
  var onset = dj ? drumOnset * 1.05 + musicalOnset * 0.07 : drumOnset + musicalOnset * 0.16;

  var avgTau = onset > rtBeat.onsetAvg ? (dj ? 0.88 : 1.10) : (dj ? 0.30 : 0.34);
  rtBeat.onsetAvg = follow(rtBeat.onsetAvg, onset, avgTau, avgTau);
  rtBeat.onsetPeak = Math.max(rtBeat.onsetPeak * Math.pow(dj ? 0.986 : 0.988, dt * 60), onset, 0.032);
  var floor = rtBeat.onsetAvg * (dj ? 0.88 : 0.84);
  var score = clamp01((onset - floor) / Math.max(dj ? 0.013 : 0.014, rtBeat.onsetPeak - floor));
  var subNorm = clamp01(sub / Math.max(0.045, rtBeat.subPeak * (dj ? 0.72 : 0.70)));
  var lowNorm = clamp01(low / Math.max(0.060, rtBeat.lowPeak * (dj ? 0.74 : 0.72)));
  var bodyNorm = clamp01(body / Math.max(0.045, rtBeat.bodyPeak * (dj ? 0.74 : 0.72)));
  var vocalNorm = clamp01(vocal / Math.max(0.045, rtBeat.vocalPeak * 0.72));
  var snapNorm = clamp01(snap / Math.max(0.040, rtBeat.snapPeak * (dj ? 0.78 : 0.72)));
  var nowT = audio.currentTime || 0;
  rtBeat.primedFrames++;
  var warmingUp = nowT < rtBeat.warmupUntil || rtBeat.primedFrames < (dj ? 8 : 18);
  var gapFromLast = nowT - rtBeat.lastHitAt;
  var expectedGap = rtBeat.tempoGap > 0 ? rtBeat.tempoGap : 0;
  var phaseErr = expectedGap > 0 ? Math.abs(gapFromLast - expectedGap) : 99;
  var phaseWindow = expectedGap > 0 ? Math.max(dj ? 0.055 : 0.055, Math.min(dj ? 0.105 : 0.105, expectedGap * (dj ? 0.16 : 0.16))) : 0;
  var tempoDue = expectedGap > 0 && gapFromLast > expectedGap - phaseWindow && gapFromLast < expectedGap + phaseWindow;
  var lowPresence = Math.max(lowNorm, subNorm * 0.74);
  var lowAttack = lowRise + lowFlux * 0.72 + subRise * 0.58 + subFlux * 0.40;
  var lowDominance = low / Math.max(0.001, vocal * 0.84 + body * 0.36 + snap * 0.10);
  var lowFluxDominance = (lowFlux + subFlux * 0.58) / Math.max(0.001, vocalFlux * 0.72 + bodyFlux * 0.42 + snapFlux * 0.16);
  var voiceMask = dj
    ? (vocalNorm > 0.62 && lowDominance < 0.92 && lowFluxDominance < 1.06 && subNorm < 0.54)
    : (vocalNorm > 0.58 && lowDominance < 0.86 && lowFluxDominance < 1.10);
  var drumGate = lowPresence > (dj ? 0.42 : 0.38) && lowAttack > Math.max(dj ? 0.015 : 0.014, rtBeat.onsetAvg * (dj ? 0.38 : 0.34)) && !voiceMask;
  drumGate = drumGate && (lowDominance > (dj ? 0.86 : 0.72) || lowFluxDominance > (dj ? 1.14 : 1.02) || subNorm > (dj ? 0.62 : 0.56));
  var strongTransient = drumGate && score > (dj ? 0.55 : 0.54) && drumOnset > rtBeat.onsetAvg * (dj ? 0.92 : 0.84);
  var kickTransient = drumGate && score > (dj ? 0.43 : 0.40) && lowAttack > Math.max(dj ? 0.020 : 0.018, rtBeat.onsetAvg * (dj ? 0.54 : 0.46));
  var tempoAssist = tempoDue && rtBeat.tempoConfidence > (dj ? 0.40 : 0.42) && drumGate && lowPresence > (dj ? 0.48 : 0) && score > (dj ? 0.30 : 0.22) && lowAttack > Math.max(0.016, rtBeat.onsetAvg * (dj ? 0.44 : 0.34));
  var candidateHit = strongTransient || kickTransient || tempoAssist;
  if (warmingUp) candidateHit = false;
  var hasTempoLock = expectedGap >= (dj ? 0.32 : 0.42) && expectedGap <= (dj ? 0.92 : 0.88) && rtBeat.tempoConfidence > (dj ? 0.36 : 0.38);
  var lockedWindow = hasTempoLock ? Math.max(dj ? 0.062 : 0.070, Math.min(dj ? 0.118 : 0.110, expectedGap * (dj ? 0.17 : 0.16))) : 0;
  var gapRaw = nowT - rtBeat.lastHitAt;
  var rhythmAccept = false;
  if (candidateHit) {
    if (rtBeat.lastHitAt < 0) {
      rhythmAccept = strongTransient && score > (dj ? 0.58 : 0.62) && lowPresence > (dj ? 0.50 : 0.48);
    } else if (hasTempoLock) {
      var oneBeatErr = Math.abs(gapRaw - expectedGap);
      var twoBeatErr = Math.abs(gapRaw - expectedGap * 2);
      rhythmAccept = oneBeatErr <= lockedWindow && (kickTransient || strongTransient);
      rhythmAccept = rhythmAccept || (twoBeatErr <= lockedWindow * 1.35 && strongTransient && score > (dj ? 0.54 : 0.58));
      rhythmAccept = rhythmAccept || (gapRaw > expectedGap * 1.55 && strongTransient && lowPresence > (dj ? 0.50 : 0.44));
      if (dj) {
        rhythmAccept = rhythmAccept || (gapRaw > expectedGap * 1.24 && strongTransient && score > 0.56 && lowDominance > 0.92);
      }
    } else {
      rhythmAccept = gapRaw >= (dj ? 0.340 : beatCam.realtimeMinInterval) && strongTransient && score > (dj ? 0.56 : 0.58) && lowPresence > (dj ? 0.50 : 0.44);
    }
  }
  var hit = candidateHit && rhythmAccept;
  if (!hit && (candidateHit || score > 0.42 || vocalNorm > 0.62 || bodyNorm > 0.54)) rtBeat.stats.rejected++;
  var minGap = hasTempoLock ? Math.max(dj ? 0.315 : 0.400, Math.min(dj ? 0.500 : 0.540, expectedGap * (dj ? 0.64 : 0.72))) : (dj ? 0.340 : beatCam.realtimeMinInterval);
  if (hit && gapRaw < minGap) {
    rtBeat.stats.blocked++;
    hit = false;
  }

  rtBeat.prevSub = sub;
  rtBeat.prevLow = low;
  rtBeat.prevBody = body;
  rtBeat.prevVocal = vocal;
  rtBeat.prevSnap = snap;
  rtBeat.prevRms = rms;
  rtBeat.score = score;
  rtBeat.pulse *= Math.pow(dj ? 0.24 : 0.18, dt);
  rtBeat.tempoConfidence *= Math.pow(dj ? 0.992 : 0.996, dt * 60);

  if (!hit) {
    if (dj) {
      djMode.tempoGap = rtBeat.tempoGap;
      djMode.tempoConfidence = rtBeat.tempoConfidence;
    }
    return { hit: false, score: score, low: lowNorm, body: bodyNorm, vocal: vocalNorm, snap: snapNorm, tempoConfidence: rtBeat.tempoConfidence };
  }

  var gapShift = 0;
  if (rtBeat.lastHitAt > 0) {
    var gap = nowT - rtBeat.lastHitAt;
    while (gap > (dj ? 0.96 : 0.88)) gap *= 0.5;
    while (gap < (dj ? 0.32 : 0.42)) gap *= 2.0;
    if (gap >= (dj ? 0.32 : 0.42) && gap <= (dj ? 0.96 : 0.88)) {
      gapShift = rtBeat.tempoGap ? Math.abs(gap - rtBeat.tempoGap) / Math.max(0.001, rtBeat.tempoGap) : 0;
      var tempoEase = hasTempoLock ? (dj ? 0.12 : 0.10) : (dj ? 0.24 : 0.22);
      if (dj && gapShift > 0.16 && strongTransient && lowDominance > 0.95) tempoEase = Math.min(0.36, tempoEase + gapShift * 0.45);
      rtBeat.tempoGap = rtBeat.tempoGap ? rtBeat.tempoGap * (1 - tempoEase) + gap * tempoEase : gap;
      rtBeat.tempoConfidence = Math.min(1, rtBeat.tempoConfidence + (tempoAssist ? (dj ? 0.04 : 0.04) : (dj ? 0.16 : 0.18)));
    }
  }
  rtBeat.lastHitAt = nowT;
  rtBeat.beatCount++;
  rtBeat.stats.hits++;
  if (tempoAssist) rtBeat.stats.assisted++;
  if (strongTransient || kickTransient) rtBeat.stats.strong++;
  var strength = dj
    ? clamp01(0.18 + score * 0.38 + lowPresence * 0.34 + Math.min(1.35, lowDominance) * 0.08 + rmsFlux * 0.72)
    : clamp01(0.24 + score * 0.36 + lowPresence * 0.34 + Math.min(1.25, lowDominance) * 0.07 + rmsFlux * 0.95);
  if (tempoAssist) strength = Math.max(strength, (dj ? 0.46 : 0.48) + rtBeat.tempoConfidence * (dj ? 0.10 : 0.10) + lowPresence * (dj ? 0.14 : 0.14));
  var comboSlot = (rtBeat.beatCount - 1) % 4;
  var combo = comboSlot === 0 ? 'downbeat' : (comboSlot === 1 ? 'push' : (comboSlot === 2 ? 'drop' : 'rebound'));
  if (strength > 0.84 && comboSlot !== 0) combo = 'accent';
  if (dj && strength > 0.78 && snapNorm > 0.56 && comboSlot !== 0) combo = 'accent';
  if (dj && gapShift > 0.14 && strongTransient && lowPresence > 0.52) combo = 'downbeat';
  rtBeat.pulse = Math.max(rtBeat.pulse, strength);
  if (dj) {
    djMode.tempoGap = rtBeat.tempoGap;
    djMode.tempoConfidence = rtBeat.tempoConfidence;
    djMode.sectionChange = Math.max(djMode.sectionChange, Math.min(1, gapShift * 1.4));
    djMode.visualPulse = Math.max(djMode.visualPulse, strength);
    djMode.lastBeatAt = nowT;
  }
  return {
    hit: true,
    time: dj ? Math.max(0, nowT - 0.026) : nowT,
    strength: strength,
    confidence: dj ? clamp01(score * 0.58 + lowPresence * 0.30 + rtBeat.tempoConfidence * 0.12) : clamp01(score * 0.62 + lowPresence * 0.26 + rtBeat.tempoConfidence * 0.12),
    low: Math.max(0.05, lowPresence),
    body: Math.max(0.02, bodyNorm * (dj ? 0.50 : 0.62)),
    snap: Math.max(0.02, snapNorm * (dj ? 0.86 : 1)),
    mass: dj ? clamp01(lowPresence * 0.84 + bodyNorm * 0.10) : clamp01(lowPresence * 0.76 + bodyNorm * 0.20),
    sharpness: dj ? clamp01(snapNorm * 0.58 + bodyNorm * 0.10) : clamp01(snapNorm * 0.70 + bodyNorm * 0.12),
    tempoAssist: tempoAssist,
    tempoGap: rtBeat.tempoGap,
    combo: combo,
    score: score,
    lowDominance: lowDominance,
    dj: dj
  };
}

function mergeRealtimeBeatCamera(time, amp, tone) {
  var best = null;
  var bestDist = beatCam.realtimeMergeWindow;
  for (var i = 0; i < beatCam.events.length; i++) {
    var dist = Math.abs((beatCam.events[i].hit || 0) - time);
    if (dist < bestDist) {
      best = beatCam.events[i];
      bestDist = dist;
    }
  }
  if (!best) return false;
  var nowT = audio ? audio.currentTime : uniforms.uTime.value;
  best.hit = time;
  best.start = nowT - (best.attack || beatCam.attack) * 0.42;
  var mergeMaxAmp = ((tone && tone.dj) || djMode.active) ? 0.62 : 0.62;
  best.amp = Math.min(mergeMaxAmp, Math.max(best.amp || 0, amp));
  if (tone) {
    best.zoomAmp = Math.max(best.zoomAmp || 0, tone.zoomAmp);
    best.thetaAmp = Math.max(best.thetaAmp || 0, tone.thetaAmp);
    best.phiAmp = Math.max(best.phiAmp || 0, tone.phiAmp);
    best.rollAmp = Math.max(best.rollAmp || 0, tone.rollAmp || 0);
    best.low = Math.max(best.low || 0, tone.low);
    best.body = Math.max(best.body || 0, tone.body);
    best.snap = Math.max(best.snap || 0, tone.snap);
    best.mode = tone.mode || best.mode;
    best.dj = !!tone.dj || !!best.dj;
  }
  best.source = 'hybrid';
  beatCam.stats.merged++;
  return true;
}

function scheduleBeatCamera(beat, source) {
  if (!fx.cinema) return;
  var time = typeof beat === 'number' ? beat : beat.time;
  if (!isFinite(time)) return;
  var strength = typeof beat === 'number' ? 0.72 : Math.max(0, Math.min(1, beat.strength || 0.72));
  var confidence = typeof beat === 'number' ? 0.72 : Math.max(0, Math.min(1, beat.confidence || 0.72));
  var isPrimary = typeof beat === 'number' ? true : beat.primary !== false;
  var visualImpact = typeof beat === 'number' ? strength : Math.max(0, Math.min(1, beat.impact == null ? strength : beat.impact));
  var isDjMapSource = source === 'djmap';
  var isMapSource = source === 'map' || !source;
  var isLiveSource = source === 'live' || source === 'fallback';
  var livePreview = !!(isLiveSource && beat && beat.preview);
  var dj = djMode.active && (isLiveSource || isDjMapSource || (beat && beat.dj));
  if (isMapSource && !isPrimary) return;
  if (isMapSource && visualImpact < 0.18 && strength < 0.56) return;
  if (isMapSource && confidence < 0.30 && strength < 0.68) return;
  var trackScale = cinemaTrackProfile.scale || 1;
  if (trackScale < 0.58 && isMapSource && strength < 0.72 && visualImpact < 0.46) return;
  if (trackScale < 0.50 && isLiveSource && strength < (dj ? 0.58 : 0.84) && visualImpact < (dj ? 0.42 : 0.56)) return;
  var lowTone = typeof beat === 'number' ? 0.62 : Math.max(0, beat.low == null ? 0.62 : beat.low);
  var bodyTone = typeof beat === 'number' ? 0.22 : Math.max(0, beat.body == null ? 0.22 : beat.body);
  var snapTone = typeof beat === 'number' ? 0.16 : Math.max(0, beat.snap == null ? 0.16 : beat.snap);
  var rawLowTone = lowTone;
  var rawBodyTone = bodyTone;
  var rawSnapTone = snapTone;
  var toneSum = Math.max(0.001, lowTone + bodyTone + snapTone);
  lowTone /= toneSum;
  bodyTone /= toneSum;
  snapTone /= toneSum;
  var sharpness = typeof beat === 'number' ? snapTone : Math.max(0, Math.min(1, beat.sharpness == null ? snapTone : beat.sharpness));
  var mass = typeof beat === 'number' ? lowTone : Math.max(0, Math.min(1, beat.mass == null ? (lowTone * 0.72 + bodyTone * 0.36 + strength * 0.20) : beat.mass));
  var nowT = audio ? audio.currentTime : uniforms.uTime.value;
  var mode = 'deep';
  if (dj) {
    if (rawSnapTone > 0.58 && rawSnapTone > rawLowTone * 0.86 && rawSnapTone > rawBodyTone * 1.08) mode = 'snap';
    else if (rawBodyTone > 0.36 && rawBodyTone > rawLowTone * 0.56) mode = 'body';
  } else {
    if (snapTone > 0.42 && snapTone > lowTone * 1.18 && snapTone > bodyTone * 1.08) mode = 'snap';
    else if (bodyTone > 0.46 && bodyTone > lowTone * 1.12) mode = 'body';
  }
  var amp;
  if (dj) {
    var lowDrive = clamp01((rawLowTone - 0.42) / 0.54);
    var bodyDrive = clamp01((rawBodyTone - 0.24) / 0.58);
    var snapDrive = clamp01((rawSnapTone - 0.30) / 0.60);
    if (mode === 'deep') amp = 0.16 + strength * 0.20 + lowDrive * 0.25 + confidence * 0.05;
    else if (mode === 'body') amp = 0.12 + strength * 0.15 + bodyDrive * 0.18 + lowDrive * 0.06;
    else amp = 0.08 + strength * 0.11 + snapDrive * 0.13;
  } else {
    amp = Math.max(0.18, Math.min(0.72, 0.15 + strength * 0.34 + confidence * 0.06 + mass * 0.13 + snapTone * 0.04));
  }
  if (isMapSource) amp *= 0.68 + visualImpact * 0.46;
  if (!isPrimary) amp *= 0.62;
  if (source === 'fallback') amp *= 0.74;
  if (source === 'live') amp *= dj ? 0.62 : (livePreview ? 0.78 : 0.92);
  if (mode === 'deep' && !dj) amp = Math.min(0.62, amp * 1.12);
  var dynScale = cameraDynamicsScale(0.92 + visualImpact * 0.12 + mass * 0.08);
  amp *= dj ? clampRange(dynScale, 0.72, 1.16) : dynScale;
  var attack = dj
    ? (mode === 'snap' ? 0.010 : (mode === 'body' ? 0.015 : 0.017))
    : Math.max(0.014, Math.min(0.038, beatCam.attack * (1.18 - sharpness * 0.55)));
  var hold = dj
    ? (mode === 'deep' ? 0.038 + lowTone * 0.014 : (mode === 'body' ? 0.026 : 0.014))
    : Math.max(0.014, Math.min(0.052, beatCam.hold * (0.62 + lowTone * 0.55 + bodyTone * 0.25)));
  var release = dj
    ? (mode === 'deep' ? 0.178 + mass * 0.040 : (mode === 'body' ? 0.140 : 0.104))
    : Math.max(0.110, Math.min(0.255, beatCam.release * (0.76 + mass * 0.56 + bodyTone * 0.18 - sharpness * 0.18)));
  var idx = typeof beat === 'number' ? Math.floor(time * 2.7) : (beat.index || Math.floor(time * 2.7));
  var combo = typeof beat === 'number' ? null : beat.combo;
  if (!combo) {
    var comboSlot = Math.abs(idx) % 4;
    combo = comboSlot === 0 ? 'downbeat' : (comboSlot === 1 ? 'push' : (comboSlot === 2 ? 'drop' : 'rebound'));
  }
  var zoomAmp = 0.070 + mass * 0.190 + (mode === 'deep' ? 0.095 : 0.018) + strength * 0.045;
  var thetaAmp = 0.00035;
  var phiAmp = 0.002 + (mode === 'body' ? 0.012 : (mode === 'snap' ? 0.005 : 0.002));
  var rollAmp = mode === 'snap' ? (0.003 + snapTone * 0.004) : 0.0008;
  zoomAmp *= 0.76 + dynScale * 0.28;
  phiAmp *= 0.82 + dynScale * 0.20;
  rollAmp *= 0.78 + dynScale * 0.24;
  if (dj) {
    var lowDrive2 = clamp01((rawLowTone - 0.42) / 0.54);
    var bodyDrive2 = clamp01((rawBodyTone - 0.24) / 0.58);
    var snapDrive2 = clamp01((rawSnapTone - 0.30) / 0.60);
    if (mode === 'deep') {
      zoomAmp = 0.115 + lowDrive2 * 0.170 + strength * 0.036;
      phiAmp = 0.0016 + bodyDrive2 * 0.0022;
      thetaAmp = 0.0006 + bodyDrive2 * 0.0012;
      rollAmp = 0.0006 + snapDrive2 * 0.0016;
    } else if (mode === 'body') {
      zoomAmp = 0.052 + lowDrive2 * 0.052;
      phiAmp = 0.0075 + bodyDrive2 * 0.018;
      thetaAmp = 0.0018 + bodyDrive2 * 0.0046;
      rollAmp = 0.0014 + snapDrive2 * 0.0022;
    } else {
      zoomAmp = 0.026 + lowDrive2 * 0.024;
      phiAmp = 0.0024 + bodyDrive2 * 0.0040;
      thetaAmp = 0.0009 + snapDrive2 * 0.0018;
      rollAmp = 0.0048 + snapDrive2 * 0.0095;
    }
    if (combo === 'downbeat') {
      amp *= 1.12;
      zoomAmp *= mode === 'deep' ? 1.28 : 1.06;
      phiAmp *= 0.76;
    } else if (combo === 'push') {
      amp *= mode === 'deep' ? 0.76 : 0.68;
      zoomAmp *= 0.62;
      thetaAmp *= 1.15;
    } else if (combo === 'drop') {
      amp *= 0.82;
      zoomAmp *= 0.50;
      phiAmp *= 1.38;
    } else if (combo === 'rebound') {
      amp *= 0.62;
      zoomAmp *= 0.40;
      phiAmp *= 0.70;
    } else if (combo === 'accent') {
      amp *= mode === 'snap' ? 0.78 : 0.94;
      zoomAmp *= mode === 'snap' ? 0.42 : 0.78;
      rollAmp *= 1.58;
    }
    if (isDjMapSource) {
      var offlineContrast = Math.pow(clamp01((visualImpact - 0.16) / 0.72), 1.06);
      var offlineDrive = 0.72 + offlineContrast * 0.94 + Math.pow(strength, 1.22) * 0.14;
      var sectionLowGate = clamp01(((djMode.sectionLow || 0) - 0.030) / 0.32);
      var sectionEnergyGate = clamp01(((djMode.sectionEnergy || 0) - 0.045) / 0.40);
      var liveSectionGate = Math.max(sectionLowGate * 0.58 + sectionEnergyGate * 0.34, visualImpact * 0.82);
      var weakSectionScale = 0.54 + Math.pow(clamp01(liveSectionGate), 0.78) * 0.46;
      var comboDrive = combo === 'downbeat'
        ? 0.96 + offlineContrast * 0.38
        : (combo === 'drop'
          ? 0.80 + offlineContrast * 0.26
          : (combo === 'accent'
            ? 0.74 + offlineContrast * 0.30
            : (combo === 'push' ? 0.68 + offlineContrast * 0.16 : 0.52 + offlineContrast * 0.12)));
      if (mode === 'deep') {
        amp *= offlineDrive * comboDrive * 1.38;
        zoomAmp *= 1.14 + offlineContrast * 0.68 + lowDrive2 * 0.20;
        phiAmp *= 0.72 + offlineContrast * 0.22;
        thetaAmp *= 0.72 + offlineContrast * 0.20;
        release *= 0.98 + offlineContrast * 0.20;
      } else if (mode === 'body') {
        amp *= offlineDrive * comboDrive * 1.24;
        zoomAmp *= 0.90 + offlineContrast * 0.32;
        phiAmp *= 1.00 + offlineContrast * 0.42 + bodyDrive2 * 0.18;
        thetaAmp *= 0.98 + offlineContrast * 0.36 + bodyDrive2 * 0.14;
        release *= 0.96 + offlineContrast * 0.12;
      } else {
        amp *= offlineDrive * comboDrive * 0.94;
        zoomAmp *= 0.52 + offlineContrast * 0.24;
        phiAmp *= 0.84 + offlineContrast * 0.28;
        thetaAmp *= 0.86 + offlineContrast * 0.30;
        rollAmp *= 1.02 + offlineContrast * 0.76 + snapDrive2 * 0.22;
        attack *= 0.92;
        release *= 0.78 + offlineContrast * 0.14;
      }
      if (combo === 'downbeat') {
        zoomAmp *= mode === 'deep' ? (1.04 + offlineContrast * 0.18) : (0.96 + offlineContrast * 0.12);
      } else if (combo === 'drop') {
        phiAmp *= 0.96 + offlineContrast * 0.28;
      } else if (combo === 'accent') {
        rollAmp *= 1.02 + offlineContrast * 0.34;
        zoomAmp *= 0.72 + offlineContrast * 0.20;
      }
      var peakTame = Math.pow(clamp01((visualImpact - 0.76) / 0.24), 1.35);
      if (peakTame > 0) {
        var downbeatTame = combo === 'downbeat' ? 1.0 : 0.58;
        amp *= 1 - peakTame * (0.070 + downbeatTame * 0.050);
        zoomAmp *= 1 - peakTame * (0.060 + downbeatTame * 0.050);
        phiAmp *= 1 - peakTame * 0.035;
        release *= 1 - peakTame * 0.045;
      }
      if (visualImpact < 0.12 && liveSectionGate < 0.18) {
        var softScale = Math.min(1, weakSectionScale * (0.72 + visualImpact * 1.10));
        amp *= softScale;
        zoomAmp *= 0.58 + softScale * 0.34;
        phiAmp *= 0.62 + softScale * 0.30;
        thetaAmp *= 0.62 + softScale * 0.28;
        rollAmp *= 0.66 + softScale * 0.24;
        release *= 0.86 + softScale * 0.16;
      }
    }
  } else if (combo === 'downbeat') {
    amp *= 1.10;
    zoomAmp *= 1.18;
    phiAmp *= 0.72;
  } else if (combo === 'push') {
    amp *= 0.84;
    zoomAmp *= 0.88;
    phiAmp *= 0.62;
  } else if (combo === 'drop') {
    amp *= 0.96;
    zoomAmp *= 0.72;
    phiAmp *= 1.22;
  } else if (combo === 'rebound') {
    amp *= 0.74;
    zoomAmp *= 0.62;
    phiAmp *= 0.78;
  } else if (combo === 'accent') {
    amp *= 1.14;
    zoomAmp *= 1.08;
    rollAmp *= 1.35;
  }
  if (livePreview && !dj) {
    var previewTone = clamp01(visualImpact * 0.54 + rawLowTone * 0.22 + confidence * 0.18 + strength * 0.06);
    amp *= 0.72 + previewTone * 0.16;
    zoomAmp *= 0.62 + previewTone * 0.18;
    phiAmp *= 0.70 + previewTone * 0.12;
    thetaAmp *= 0.70 + previewTone * 0.12;
    rollAmp *= 0.54 + previewTone * 0.16;
    release *= 1.08 + previewTone * 0.08;
  }
  if (dj && isDjMapSource && amp > 0.74) amp = 0.74 + (amp - 0.74) * 0.56;
  if (dj && isDjMapSource && zoomAmp > 0.30) zoomAmp = 0.30 + (zoomAmp - 0.30) * 0.52;
  amp = Math.max(dj ? (isDjMapSource ? 0.018 : 0.040) : 0.08, Math.min(dj ? (isDjMapSource ? 0.92 : 0.34) : 0.68, amp));
  if (isLiveSource) {
    var liveMinInterval = dj ? Math.max(0.315, Math.min(0.500, rtBeat.tempoGap ? rtBeat.tempoGap * 0.62 : 0.360)) : beatCam.realtimeMinInterval;
    if (time - beatCam.lastRealtimeAt < liveMinInterval && strength < (dj ? 0.74 : 0.78)) {
      beatCam.stats.liveBlocked++;
      return;
    }
    beatCam.lastRealtimeAt = time;
    if (mergeRealtimeBeatCamera(time, amp, {
      zoomAmp: zoomAmp, thetaAmp: thetaAmp, phiAmp: phiAmp, rollAmp: rollAmp, mode: mode,
      low: lowTone, body: bodyTone, snap: snapTone, dj: dj
    })) {
      beatCam.lastTriggerAt = Math.max(beatCam.lastTriggerAt, time);
      return;
    }
    for (var ei = beatCam.events.length - 1; ei >= 0; ei--) {
      var pending = beatCam.events[ei];
      if (pending.source === 'map' && pending.hit > time && pending.hit - time < beatCam.realtimeMergeWindow) {
        beatCam.events.splice(ei, 1);
      }
    }
  }
  if (isDjMapSource) {
    var djGap = time - beatCam.lastTriggerAt;
    var djMinGap = Math.max(0.255, Math.min(0.470, (beat && beat.step ? beat.step * 0.52 : 0.320)));
    if (djGap < djMinGap && strength < 0.86) return;
    beatCam.lastTriggerAt = time;
    beatCam.stats.map++;
  } else if (!isLiveSource) {
    var gap = time - beatCam.lastTriggerAt;
    var minGap = beatCam.minInterval;
    if (isMapSource && isPrimary) minGap *= 0.82;
    if (gap < minGap && strength < 0.88) return;
    beatCam.lastTriggerAt = time;
    beatCam.stats.map++;
  } else {
    beatCam.lastTriggerAt = Math.max(beatCam.lastTriggerAt, time);
    beatCam.stats.live++;
  }
  beatCam.events.push({
    start: isLiveSource ? nowT - attack * 0.42 : nowT + (time - nowT) - attack,
    hit: time,
    amp: amp,
    attack: attack,
    hold: hold,
    release: release,
    zoomAmp: zoomAmp,
    thetaAmp: thetaAmp,
    phiAmp: phiAmp,
    rollAmp: rollAmp,
    mode: mode,
    combo: combo,
    phase: idx * 2.399963 + (snapTone - lowTone) * 1.4,
    low: lowTone,
    body: bodyTone,
    snap: snapTone,
    mass: mass,
    source: source || 'map',
    dj: dj
  });
  var maxEvents = djMode.active ? 12 : 8;
  if (beatCam.events.length > maxEvents) beatCam.events.splice(0, beatCam.events.length - maxEvents);
}

function updateBeatCamera(dt) {
  var t = audio ? audio.currentTime : uniforms.uTime.value;
  if (!audio || audio.paused) {
    beatCam.punch *= Math.pow(0.08, dt);
    beatCam.thetaKick *= Math.pow(0.05, dt);
    beatCam.phiKick *= Math.pow(0.05, dt);
    beatCam.radiusKick *= Math.pow(0.05, dt);
    beatCam.rollKick *= Math.pow(0.05, dt);
    beatCam.events.length = 0;
    beatCam.prevAudioTime = t;
    return;
  }
  if (beatCam.prevAudioTime >= 0 && Math.abs(t - beatCam.prevAudioTime) > 0.55) {
    if (djMode.active) syncPodcastDjMapCursor(t, false);
    else syncBeatCameraToTime(t);
  }
  beatCam.prevAudioTime = t;

  var punch = 0;
  var thetaKick = 0;
  var phiKick = 0;
  var radiusKick = 0;
  var rollKick = 0;
  var leadEvent = null;
  var leadPunch = 0;
  var leadVal = 0;
  for (var i = beatCam.events.length - 1; i >= 0; i--) {
    var ev = beatCam.events[i];
    var attack = ev.attack || beatCam.attack;
    var hold = ev.hold || beatCam.hold;
    var release = ev.release || beatCam.release;
    var local = t - ev.start;
    var val = 0;
    if (local < 0) {
      val = 0;
    } else if (local < attack) {
      val = easeBeatCamera(local / attack);
    } else if (local < attack + hold) {
      val = 1;
    } else if (local < attack + hold + release) {
      var r = (local - attack - hold) / release;
      val = 1 - easeBeatCamera(r);
    } else {
      beatCam.events.splice(i, 1);
      continue;
    }
    var evPunch = val * ev.amp;
    punch = Math.max(punch, evPunch);
    if (evPunch > leadPunch) {
      leadEvent = ev;
      leadPunch = evPunch;
      leadVal = val;
    }
  }
  if (leadEvent) {
    var sign = Math.sin(leadEvent.phase) >= 0 ? 1 : -1;
    var snapFlick = 1.0 - Math.min(1, Math.max(0, leadVal - 0.25) / 0.75);
    var combo = leadEvent.combo || 'downbeat';
    if (combo === 'downbeat') {
      radiusKick = leadPunch * leadEvent.zoomAmp;
      phiKick = -leadPunch * 0.0032;
    } else if (combo === 'push') {
      radiusKick = leadPunch * leadEvent.zoomAmp * 0.72;
      phiKick = -leadPunch * 0.0014;
    } else if (combo === 'drop') {
      radiusKick = leadPunch * leadEvent.zoomAmp * 0.46;
      phiKick = leadPunch * leadEvent.phiAmp * 0.92;
    } else if (combo === 'rebound') {
      radiusKick = leadPunch * leadEvent.zoomAmp * 0.30;
      phiKick = -leadPunch * leadEvent.phiAmp * 0.22;
    } else if (combo === 'accent') {
      radiusKick = leadPunch * leadEvent.zoomAmp * 0.90;
      phiKick = -leadPunch * 0.0022;
      rollKick = sign * leadPunch * (leadEvent.rollAmp || 0) * (0.45 + snapFlick * 0.30);
    } else if (leadEvent.mode === 'deep') {
      radiusKick = leadPunch * leadEvent.zoomAmp;
      phiKick = -leadPunch * 0.003;
    }
    if (leadEvent.dj) {
      var djSide = sign * leadPunch * (leadEvent.thetaAmp || 0.0012) * (0.70 + (leadEvent.body || 0) * 0.65 + (leadEvent.snap || 0) * 0.35);
      thetaKick += djSide;
      if (leadEvent.mode === 'snap' || combo === 'accent') {
        rollKick += sign * leadPunch * (leadEvent.rollAmp || 0.003) * (0.52 + snapFlick * 0.34);
      }
      if (combo === 'downbeat') radiusKick *= 1.06;
      else if (combo === 'drop') phiKick *= 1.18;
      punch = Math.min(0.90, punch * (1.04 + (leadEvent.mass || 0) * 0.10));
    }
  }
  var djEase = djMode.active;
  beatCam.punch += (punch - beatCam.punch) * (punch > beatCam.punch ? (djEase ? 0.82 : 0.72) : (djEase ? 0.44 : 0.38));
  beatCam.thetaKick += (thetaKick - beatCam.thetaKick) * (Math.abs(thetaKick) > Math.abs(beatCam.thetaKick) ? (djEase ? 0.80 : 0.70) : (djEase ? 0.42 : 0.36));
  beatCam.phiKick += (phiKick - beatCam.phiKick) * (Math.abs(phiKick) > Math.abs(beatCam.phiKick) ? (djEase ? 0.80 : 0.70) : (djEase ? 0.42 : 0.36));
  beatCam.radiusKick += (radiusKick - beatCam.radiusKick) * (radiusKick > beatCam.radiusKick ? (djEase ? 0.82 : 0.72) : (djEase ? 0.40 : 0.34));
  beatCam.rollKick += (rollKick - beatCam.rollKick) * (Math.abs(rollKick) > Math.abs(beatCam.rollKick) ? (djEase ? 0.82 : 0.72) : (djEase ? 0.44 : 0.38));
}

function unlockCenteredView() {
  orbit.centerLocked = false;
}

function clearCenteredViewOffsets() {
  pointerTarget.x = 0;
  pointerTarget.y = 0;
  pointerParallax.x = 0;
  pointerParallax.y = 0;
  mouseWorld.set(-999, -999, 0);
  mouseActive = false;
  headParallax.x = 0;
  headParallax.y = 0;
  headParallax.active = false;
  headNeutral = null;
  if (typeof gestureRotation !== 'undefined') {
    gestureRotation.x = 0;
    gestureRotation.y = 0;
  }
  if (typeof particleSpin !== 'undefined') {
    particleSpin.vx = 0;
    particleSpin.vy = 0;
  }
  if (typeof pinchState !== 'undefined') pinchState.active = false;
  if (typeof particlePointerSpin !== 'undefined') particlePointerSpin.active = false;
  if (typeof resetParticleRotationTarget === 'function') resetParticleRotationTarget(false);
  if (typeof uniforms !== 'undefined' && uniforms.uHandActive) {
    uniforms.uHandActive.value = 0;
    uniforms.uHandXY.value.set(-999, -999);
    if (uniforms.uGestureGrip) uniforms.uGestureGrip.value = 0;
  }
}

function updateCamera() {
  if (applyFreeCameraToCamera()) return;
  if (orbit.recentering) {
    orbit.userTheta  += (orbit.baselineTheta - orbit.userTheta)  * 0.04;
    orbit.userPhi    += (orbit.baselinePhi   - orbit.userPhi)    * 0.04;
    orbit.userRadius += (orbit.baselineRadius- orbit.userRadius) * 0.04;
    if (Math.abs(orbit.userTheta - orbit.baselineTheta) < 0.005 &&
        Math.abs(orbit.userPhi - orbit.baselinePhi) < 0.005 &&
        Math.abs(orbit.userRadius - orbit.baselineRadius) < 0.05) {
      orbit.userTheta = orbit.baselineTheta;
      orbit.userPhi   = orbit.baselinePhi;
      orbit.userRadius= orbit.baselineRadius;
      orbit.recentering = false;
    }
  }

  // v8: focus 优先, 否则用 user + cine 复合姿态
  var fa = orbit.focus.active;
  var targetTheta, targetPhi, targetRadius, tLookAt;
  if (fa) {
    targetTheta = orbit.focus.theta;
    targetPhi   = orbit.focus.phi;
    targetRadius = orbit.focus.radius;
    tLookAt = orbit.focus.lookAt;
  } else if (orbit.centerLocked) {
    targetTheta = orbit.baselineTheta + orbit.cineTheta;
    targetPhi = Math.max(orbit.minPhi, Math.min(orbit.maxPhi, orbit.baselinePhi + orbit.cinePhi));
    targetRadius = Math.max(orbit.minRadius, Math.min(orbit.maxRadius, orbit.baselineRadius + orbit.cineRadius));
    tLookAt = ZERO_VEC;
  } else {
    targetTheta = orbit.userTheta + orbit.cineTheta;
    targetPhi   = Math.max(orbit.minPhi, Math.min(orbit.maxPhi, orbit.userPhi + orbit.cinePhi));
    targetRadius= Math.max(orbit.minRadius, Math.min(orbit.maxRadius, orbit.userRadius + orbit.cineRadius));
    tLookAt = ZERO_VEC;
  }
  // 丝滑变速: 线性 lerp 自然给出 "快→慢" 缓出曲线
  var focusEase = fa ? 0.16 : 0.10;
  var radiusEase = fa ? 0.12 : 0.07;
  if (beatCam.punch > 0.01) {
    focusEase = Math.max(focusEase, 0.12 + beatCam.punch * 0.12);
    radiusEase = Math.max(radiusEase, 0.09 + beatCam.punch * 0.12);
  }
  orbit.theta  += (targetTheta  - orbit.theta)  * focusEase;
  orbit.phi    += (targetPhi    - orbit.phi)    * focusEase;
  orbit.radius += (targetRadius - orbit.radius) * radiusEase;
  orbit.lookAt.x += (tLookAt.x - orbit.lookAt.x) * focusEase;
  orbit.lookAt.y += (tLookAt.y - orbit.lookAt.y) * focusEase;
  orbit.lookAt.z += (tLookAt.z - orbit.lookAt.z) * focusEase;

  var cy = Math.cos(orbit.phi), sy = Math.sin(orbit.phi);
  var ct = Math.cos(orbit.theta), st = Math.sin(orbit.theta);
  camera.position.set(
    orbit.lookAt.x + orbit.radius * cy * st,
    orbit.lookAt.y + orbit.radius * sy,
    orbit.lookAt.z + orbit.radius * cy * ct
  );
  camera.lookAt(orbit.lookAt);
  var cameraShake = clampRange(Number(fx.cinemaShake) || 0, 0, 1.8);
  camera.rotation.z += beatCam.rollKick * cameraShake;

  var cameraPunch = Math.max(camPunch * 0.55, beatCam.punch * 0.54 + beatCam.radiusKick * 0.16) * cameraShake;
  var targetFOV = BASE_FOV - cameraPunch * (djMode.active ? 2.62 : 2.35);
  var fovEase = targetFOV < camera.fov ? 0.24 : 0.12;
  camera.fov += (targetFOV - camera.fov) * fovEase;
  camera.updateProjectionMatrix();
  camPunch *= 0.86;
}

// 焦点跟拍 (hover 0.5s 后镜头移到目标)
var focusHover = { wantType: null, pendingTimer: null, exitTimer: null };
function shouldUseWallpaperSafeShelfCamera() {
  return !!(fx && Number(fx.preset) === 5);
}
function shouldUseSkullSafeShelfCamera() {
  return !!(fx && Number(fx.preset) === SKULL_PRESET_INDEX);
}
function shouldUseWallpaperLyricCameraLock() {
  return !!(fx && Number(fx.preset) === 5 && fx.lyricCameraLock);
}
function requestStageLyricCameraSnap(frames) {
  if (typeof stageLyrics === 'undefined' || !stageLyrics) return;
  stageLyrics.snapCameraLockFrames = Math.max(stageLyrics.snapCameraLockFrames || 0, frames || 8);
}
function shouldDimWallpaperForShelf() {
  if (!shouldUseWallpaperSafeShelfCamera()) return false;
  if (!shelfManager || !shelfManager.getMode || shelfManager.getMode() !== 'side') return false;
  if (shelfPinnedOpen) return true;
  return !!(shelfManager.hasOpenContent && shelfManager.hasOpenContent());
}
function shouldOffsetLyricsForShelfDetail() {
  if (!shelfManager || !shelfManager.getMode || shelfManager.getMode() !== 'side') return false;
  return !!(shelfManager.hasOpenContent && shelfManager.hasOpenContent());
}
function shouldAvoidStageLyricsForShelf() {
  if (!shelfManager || !shelfManager.getMode || shelfManager.getMode() !== 'side') return false;
  if (shelfAlwaysVisible()) return true;
  if (shelfPinnedOpen) return true;
  if (shelfManager.hasOpenContent && shelfManager.hasOpenContent()) return true;
  return !!(shelfVisibility > 0.24 || (shelfHoverCue && shelfHoverCue.value > 0.28));
}
function activateFocusZone(type) {
  unlockCenteredView();
  orbit.focus.active = true;
  orbit.focus.type = type;
  var shelfProfile = shelfLayoutProfile();
  if (type === 'shelf-side') {
    if (shouldUseWallpaperSafeShelfCamera()) {
      orbit.focus.theta  = shelfProfile.portrait ? 0.18 : 0.24;
      orbit.focus.phi    = shelfProfile.portrait ? 0.00 : 0.02;
      orbit.focus.radius = shelfProfile.portrait ? 5.74 : 5.32;
      orbit.focus.lookAt.set(shelfProfile.portrait ? 1.04 : 2.24, -0.08, 0.78);
      camPunch = Math.max(camPunch, 0.28);
      requestStageLyricCameraSnap(10);
    } else {
      // 侧栏 (右): 近一点、侧一点，让歌单架打开时有明确的镜头推近。
      orbit.focus.theta  = shelfProfile.portrait ? 0.24 : 0.42;
      orbit.focus.phi    = shelfProfile.portrait ? -0.06 : -0.12;
      orbit.focus.radius = shelfProfile.portrait ? 5.28 : 4.20;
      orbit.focus.lookAt.set(shelfProfile.portrait ? 1.08 : 2.32, shelfProfile.portrait ? -0.18 : -0.10, 0.72);
      camPunch = Math.max(camPunch, 0.82);
    }
  } else if (type === 'shelf-detail') {
    if (shouldUseWallpaperSafeShelfCamera()) {
      orbit.focus.theta  = shelfProfile.portrait ? 0.16 : 0.26;
      orbit.focus.phi    = shelfProfile.portrait ? -0.02 : 0.02;
      orbit.focus.radius = shelfProfile.portrait ? 5.88 : 5.18;
      orbit.focus.lookAt.set(shelfProfile.portrait ? 0.72 : 2.28, shelfProfile.portrait ? -0.36 : -0.32, 0.84);
      camPunch = Math.max(camPunch, 0.30);
      requestStageLyricCameraSnap(10);
    } else {
      orbit.focus.theta  = shelfProfile.portrait ? 0.16 : 0.34;
      orbit.focus.phi    = shelfProfile.portrait ? -0.03 : -0.06;
      orbit.focus.radius = shelfProfile.portrait ? 5.90 : 4.86;
      orbit.focus.lookAt.set(shelfProfile.portrait ? 0.62 : 1.74, shelfProfile.portrait ? -0.08 : 0.02, 0.82);
      camPunch = Math.max(camPunch, 0.38);
    }
  } else if (type === 'shelf-stage') {
    // 舞台: 居中仰拍
    orbit.focus.theta  = 0.0;
    orbit.focus.phi    = shelfProfile.portrait ? -0.24 : -0.32;
    orbit.focus.radius = shelfProfile.portrait ? 4.8 : 3.8;
    orbit.focus.lookAt.set(0, shelfProfile.portrait ? -1.86 : -1.7, 0.8);
  } else if (type === 'queue') {
    // 队列在左侧 HTML 面板, 相机微微左移 + 抬升
    orbit.focus.theta  = 0.40;
    orbit.focus.phi    = 0.05;
    orbit.focus.radius = 5.8;
    orbit.focus.lookAt.set(-1.2, 0, 0);
  }
}
function setFocusZone(type, immediate) {
  if (type && !shouldUseShelfDynamicCamera(type)) {
    if (/^shelf-/.test(String(orbit.focus.type || ''))) orbit.focus.active = false;
    type = null;
  }
  if (focusHover.wantType === type) return;
  focusHover.wantType = type;
  if (focusHover.pendingTimer) { clearTimeout(focusHover.pendingTimer); focusHover.pendingTimer = null; }
  if (focusHover.exitTimer) { clearTimeout(focusHover.exitTimer); focusHover.exitTimer = null; }
  if (!type) {
    // 立刻退出 focus, 让相机回主姿态 (但插值是平滑的)
    var exitDelay = orbit.focus.type === 'queue' ? PEEK_HIDE_DELAY : 120;
    focusHover.exitTimer = setTimeout(function(){
      focusHover.exitTimer = null;
      if (!focusHover.wantType) orbit.focus.active = false;
    }, exitDelay);
    return;
  }
  if (immediate) {
    activateFocusZone(type);
    return;
  }
  // 延迟 500ms 激活
  focusHover.pendingTimer = setTimeout(function(){
    focusHover.pendingTimer = null;
    if (focusHover.wantType !== type) return;
    activateFocusZone(type);
  }, 260);
}

// 电影镜头 v8: 振幅大幅减小, 节拍 punch 加冷却 + 强度门槛
//   - cineTheta/Phi 是非常缓慢的低频漂移, 不再让人 motion sick
//   - punch zoom 只在 真·强主拍 触发, 至少间隔 0.45s, 振幅 ×0.5
var lastCamPunchAt = -10;
var CAM_PUNCH_MIN_INTERVAL = 0.45;     // 秒
var CAM_PUNCH_BEAT_THRESHOLD = 0.55;   // 必须够强才触发
function updateCinema(dt) {
  cinemaT += dt;
  updateBeatCamera(dt);
  if (!fx.cinema) {
    orbit.cineTheta  *= 0.95;
    orbit.cinePhi    *= 0.95;
    orbit.cineRadius *= 0.95;
    return;
  }
  var damp = orbit.rotating ? 0.25 : 1.0;
  // v8: 振幅减半, 周期更长 (更优雅)
  var dj = djMode.active;
  var shake = clampRange(Number(fx.cinemaShake) || 0, 0, 1.8);
  var beatDamp = (orbit.focus.active ? (dj ? 0.66 : 0.55) : (dj ? 1.12 : 1.0)) * shake;
  var idleDamp = damp * (dj ? 0.72 : 1.0) * shake;
  orbit.cineTheta  = Math.sin(cinemaT * 0.08) * 0.012 * idleDamp + beatCam.thetaKick * beatDamp;
  orbit.cinePhi    = Math.sin(cinemaT * 0.06 + 1.0) * 0.010 * idleDamp + beatCam.phiKick * beatDamp;
  orbit.cineRadius = Math.sin(cinemaT * 0.04 + 2.0) * 0.080 * idleDamp - beatCam.radiusKick * beatDamp * (dj ? 1.22 : 1.18);
}
updateCamera();

function recenterCamera() {
  orbit.centerLocked = true;
  orbit.recentering = true;
  clearCenteredViewOffsets();
  if (typeof skullWheelZoomTarget !== 'undefined') {
    skullWheelZoomTarget = 0;
    if (!(fx && fx.preset === SKULL_PRESET_INDEX)) skullWheelZoom = 0;
  }
  // 同时解除任何镜头跟拍
  if (focusHover) {
    focusHover.wantType = null;
    if (focusHover.pendingTimer) { clearTimeout(focusHover.pendingTimer); focusHover.pendingTimer = null; }
    if (focusHover.exitTimer) { clearTimeout(focusHover.exitTimer); focusHover.exitTimer = null; }
  }
  orbit.focus.active = false;
  if (fx && fx.preset === SKULL_PRESET_INDEX) {
    resetSkullPresetView(false, { smooth:true, keepLyricLock:true });
  } else {
    resetSkullPresetView(true);
  }
  if (!(fx && fx.preset === SKULL_PRESET_INDEX) && ((fx && fx.lyricCameraLock) || shouldUseWallpaperLyricCameraLock())) requestStageLyricCameraSnap(14);
  showToast('视角回正');
}

function hasActivePlaybackControls() {
  return !!(playing || (audio && !audio.paused) || (Array.isArray(playQueue) && currentIdx >= 0 && playQueue[currentIdx]));
}

function setControlsHidden(hidden) {
  var bar = document.getElementById('bottom-bar');
  if (!bar) return;
  if (hidden && (controlsHovering || miniQueueOpen)) hidden = false;
  bar.classList.toggle('soft-hidden', !!hidden && controlsAutoHide && bar.classList.contains('visible'));
  bar.style.pointerEvents = '';
  updateControlsChromeState();
}

function isBottomControlsSuppressedForShelf() {
  var shelfContentOpen = false;
  try {
    shelfContentOpen = !!(typeof shelfManager !== 'undefined' && shelfManager && shelfManager.hasOpenContent && shelfManager.hasOpenContent());
  } catch (e) {}
  return !!(shelfPinnedOpen || shelfContentOpen || (controlsShelfSuppressUntil && performance.now() < controlsShelfSuppressUntil));
}

function suppressBottomControlsForShelf(duration) {
  controlsShelfSuppressUntil = performance.now() + (duration == null ? 900 : duration);
  controlsHovering = false;
  if (controlsHideTimer) {
    clearTimeout(controlsHideTimer);
    controlsHideTimer = null;
  }
  document.body.classList.remove('controls-handle-awake');
  if (miniQueueOpen) closeMiniQueue();
  var bar = document.getElementById('bottom-bar');
  if (bar) {
    bar.classList.remove('visible', 'soft-hidden');
    bar.style.pointerEvents = '';
  }
  updateControlsChromeState();
}

function scheduleControlsHide(delay) {
  if (controlsHideTimer) clearTimeout(controlsHideTimer);
  if (!controlsAutoHide) return;
  controlsHideTimer = setTimeout(function(){
    controlsHideTimer = null;
    if (!controlsHovering) setControlsHidden(true);
  }, delay == null ? 480 : delay);
}

function revealBottomControls(delay) {
  if (document.body.classList.contains('home-controls-locked')) return;
  var bar = document.getElementById('bottom-bar');
  if (isBottomControlsSuppressedForShelf()) return;
  if (bar) bar.classList.add('visible');
  wakeBottomHandle();
  setControlsHidden(false);
  if (controlsAutoHide) scheduleControlsHide(delay == null ? 520 : delay);
}

function updateControlsChromeState() {
  var bar = document.getElementById('bottom-bar');
  var handle = document.getElementById('bottom-handle');
  var active = !!(bar && bar.classList.contains('visible') && !bar.classList.contains('soft-hidden'));
  document.body.classList.toggle('controls-visible', active);
  if (handle) handle.classList.toggle('active', active);
}

function wakeBottomHandle(duration) {
  document.body.classList.add('controls-handle-awake');
  if (controlsHandleDimTimer) clearTimeout(controlsHandleDimTimer);
  controlsHandleDimTimer = setTimeout(function(){
    controlsHandleDimTimer = null;
    document.body.classList.remove('controls-handle-awake');
  }, duration == null ? 2000 : duration);
}

function forcePlaybackControlsInteractive() {
  if (!hasActivePlaybackControls()) return;
  try {
    document.body.classList.remove('home-controls-locked');
    var bar = document.getElementById('bottom-bar');
    if (bar) {
      bar.style.pointerEvents = '';
      if (!controlsAutoHide) {
        bar.classList.add('visible');
        bar.classList.remove('soft-hidden');
      }
    }
    ['play-btn', 'prev-btn', 'next-btn', 'mini-queue-btn', 'heart-btn', 'play-mode-btn', 'collect-btn'].forEach(function(id){
      var btn = document.getElementById(id);
      if (!btn) return;
      btn.disabled = false;
      btn.classList.remove('busy');
    });
    updateControlsChromeState();
    if (bar && bar.classList.contains('visible') && controlsAutoHide && !controlsHovering) scheduleControlsHide(220);
  } catch (e) {
    console.warn('[PlaybackControlsRestore]', e);
  }
}

function toggleBottomControlsFromHandle() {
  var bar = document.getElementById('bottom-bar');
  if (!bar || document.body.classList.contains('home-controls-locked')) return;
  if (isBottomControlsSuppressedForShelf()) return;
  revealBottomControls(900);
}

function updateControlsAutoHideFromPointer(x, y) {
  if (document.body.classList.contains('home-controls-locked')) return;
  if (isBottomControlsSuppressedForShelf()) return;
  var bar = document.getElementById('bottom-bar');
  if (!bar || !bar.classList.contains('visible')) return;
  if (!controlsAutoHide) { setControlsHidden(false); return; }
  if (diyPlayerMode) {
    var fxPanel = document.getElementById('fx-panel');
    var fxFab = document.getElementById('fx-fab');
    var fr = fxPanel ? fxPanel.getBoundingClientRect() : null;
    var br = fxFab ? fxFab.getBoundingClientRect() : null;
    var overFxPanel = fxPanel && (fxPanel.classList.contains('peek') || fxPanel.classList.contains('show')) && fr && x >= fr.left - 18 && x <= fr.right + 18 && y >= fr.top - 18 && y <= fr.bottom + 18;
    var overFxFab = br && x >= br.left - 18 && x <= br.right + 18 && y >= br.top - 18 && y <= br.bottom + 18;
    if (overFxPanel || overFxFab) {
      scheduleControlsHide(80);
      return;
    }
  }
  controlsLastMoveAt = performance.now();
  var rect = bar.getBoundingClientRect();
  var handle = document.getElementById('bottom-handle');
  var hr = handle ? handle.getBoundingClientRect() : null;
  var overHandle = hr && x >= hr.left - 18 && x <= hr.right + 18 && y >= hr.top - 12 && y <= hr.bottom + 14;
  var overBar = x >= rect.left - 18 && x <= rect.right + 18 && y >= rect.top - 18 && y <= rect.bottom + 14;
  var mini = document.getElementById('mini-queue-popover');
  var miniRect = mini ? mini.getBoundingClientRect() : null;
  var overMini = miniQueueOpen && miniRect && x >= miniRect.left - 16 && x <= miniRect.right + 16 && y >= miniRect.top - 16 && y <= miniRect.bottom + 16;
  if (overHandle) wakeBottomHandle();
  if (overBar || overMini || overHandle) revealBottomControls(overHandle ? 900 : 520);
  else scheduleControlsHide(70);
}

function toggleControlsAutoHide() {
  controlsAutoHide = !controlsAutoHide;
  saveBooleanPreference(CONTROLS_AUTO_HIDE_STORE_KEY, controlsAutoHide);
  var btn = document.getElementById('controls-hide-btn');
  if (btn) btn.classList.toggle('active', controlsAutoHide);
  setControlsHidden(false);
  if (controlsAutoHide) {
    scheduleControlsHide(520);
    showToast('控制条自动隐藏已开启');
  } else {
    if (controlsHideTimer) { clearTimeout(controlsHideTimer); controlsHideTimer = null; }
    showToast('控制条保持显示');
  }
}

function applyControlsAutoHidePreference() {
  var btn = document.getElementById('controls-hide-btn');
  if (btn) btn.classList.toggle('active', !!controlsAutoHide);
  if (!controlsAutoHide && controlsHideTimer) {
    clearTimeout(controlsHideTimer);
    controlsHideTimer = null;
  }
  setControlsHidden(false);
}

(function initControlsAutoHide() {
  var bar = document.getElementById('bottom-bar');
  var handle = document.getElementById('bottom-handle');
  if (!bar) return;
  function enterControls(){
    controlsHovering = true;
    wakeBottomHandle();
    setControlsHidden(false);
    if (controlsHideTimer) { clearTimeout(controlsHideTimer); controlsHideTimer = null; }
  }
  function leaveControls(){
    controlsHovering = false;
    scheduleControlsHide(70);
    wakeBottomHandle(900);
  }
  bar.addEventListener('mouseenter', enterControls);
  bar.addEventListener('mouseleave', leaveControls);
  if (handle) {
    handle.addEventListener('mouseenter', function(){
      controlsHovering = true;
      revealBottomControls(900);
    });
    handle.addEventListener('mouseleave', leaveControls);
    handle.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); toggleBottomControlsFromHandle(); });
  }
  updateControlsChromeState();
})();

function isCursorAutoHideMode() {
  return !document.hidden;
}

function clearCursorAutoHideTimer() {
  if (cursorHideTimer) {
    clearTimeout(cursorHideTimer);
    cursorHideTimer = null;
  }
}

function setCursorHidden(hidden) {
  document.body.classList.toggle('cursor-hidden', !!hidden && isCursorAutoHideMode());
}

function scheduleCursorHide(delay) {
  clearCursorAutoHideTimer();
  if (!isCursorAutoHideMode()) {
    setCursorHidden(false);
    return;
  }
  cursorHideTimer = setTimeout(function(){
    cursorHideTimer = null;
    setCursorHidden(true);
  }, delay == null ? CURSOR_HIDE_DELAY : delay);
}

function revealCursorForActivity() {
  if (!isCursorAutoHideMode()) {
    clearCursorAutoHideTimer();
    setCursorHidden(false);
    return;
  }
  setCursorHidden(false);
  scheduleCursorHide(CURSOR_HIDE_DELAY);
}

function syncCursorAutoHideMode() {
  if (isCursorAutoHideMode()) revealCursorForActivity();
  else {
    clearCursorAutoHideTimer();
    setCursorHidden(false);
  }
}

['mousemove', 'pointermove', 'mousedown', 'wheel', 'touchstart'].forEach(function(type){
  window.addEventListener(type, revealCursorForActivity, { passive:true, capture:true });
});
syncCursorAutoHideMode();

// ============================================================
//  指针 / 拖拽控制
//   v7.1: 用 userOrbit 替代 targetOrbit; 加 drag 距离判断
// ============================================================
var mouseWorld = new THREE.Vector3(-999, -999, 0);
var mouseActive = false;
var mouseDownAt = { x:0, y:0, t:0, hadDrag:false };
var particlePointerSpin = { active:false, lastX:0, lastY:0, lastT:0 };
var particlePointerRay = new THREE.Raycaster();
var particlePointerNdc = new THREE.Vector2();
var particlePointerPlane = new THREE.Plane();
var particlePointerPlanePoint = new THREE.Vector3();
var particlePointerPlaneNormal = new THREE.Vector3();
var particlePointerWorldHit = new THREE.Vector3();
var particlePointerLocalHit = new THREE.Vector3();
var particlePointerQuat = new THREE.Quaternion();
var particlePointerFrame = { dirty:false, ndcX:0, ndcY:0 };
var CLICK_THRESHOLD = 6;  // 像素, 拖动 > 6px 视为 drag
var UI_HIT_SELECTOR = '#search-area,#top-right,#fullscreen-diy-zone,#fx-panel,#fx-fab,#fx-fab-hide-btn,#playlist-panel,#bottom-bar,#thumb-wrap,#empty-home,#visual-guide,#trial-banner,#source-fallback-notice,.modal-mask,#toast,#ai-depth-chip,#beat-chip,#drop-overlay';

function isPointerOverUi(e) {
  if (!e) return false;
  var el = document.elementFromPoint(e.clientX, e.clientY);
  return !!(el && el.closest && el.closest(UI_HIT_SELECTOR));
}

function particleLocalPointFromNdc(ndcX, ndcY, out) {
  particlePointerNdc.set(ndcX, ndcY);
  particlePointerRay.setFromCamera(particlePointerNdc, camera);
  if (particles) {
    particles.updateMatrixWorld(true);
    particles.getWorldPosition(particlePointerPlanePoint);
    particles.getWorldQuaternion(particlePointerQuat);
    particlePointerPlaneNormal.set(0, 0, 1).applyQuaternion(particlePointerQuat).normalize();
    if (Math.abs(particlePointerPlaneNormal.dot(particlePointerRay.ray.direction)) < 0.16) return false;
    particlePointerPlane.setFromNormalAndCoplanarPoint(particlePointerPlaneNormal, particlePointerPlanePoint);
    if (particlePointerRay.ray.intersectPlane(particlePointerPlane, particlePointerWorldHit)) {
      out.copy(particlePointerWorldHit);
      particles.worldToLocal(out);
      return isFinite(out.x) && isFinite(out.y) && Math.abs(out.x) < 8.5 && Math.abs(out.y) < 8.5;
    }
  }
  particlePointerPlaneNormal.set(0, 0, 1);
  particlePointerPlane.set(particlePointerPlaneNormal, 0);
  if (particlePointerRay.ray.intersectPlane(particlePointerPlane, particlePointerWorldHit)) {
    out.copy(particlePointerWorldHit);
    return isFinite(out.x) && isFinite(out.y) && Math.abs(out.x) < 8.5 && Math.abs(out.y) < 8.5;
  }
  return false;
}

function queueParticlePointerFrame(clientX, clientY) {
  var mx = (clientX / innerWidth) * 2 - 1;
  var my = -(clientY / innerHeight) * 2 + 1;
  pointerTarget.x = mx; pointerTarget.y = my;
  particlePointerFrame.ndcX = mx;
  particlePointerFrame.ndcY = my;
  particlePointerFrame.dirty = true;
}

function updateParticlePointerFrame() {
  if (!particlePointerFrame.dirty) return;
  particlePointerFrame.dirty = false;
  if (particleLocalPointFromNdc(particlePointerFrame.ndcX, particlePointerFrame.ndcY, particlePointerLocalHit)) {
    mouseWorld.x = particlePointerLocalHit.x;
    mouseWorld.y = particlePointerLocalHit.y;
    mouseActive = true;
  } else {
    mouseWorld.set(-999, -999, 0);
    mouseActive = false;
  }
}

function beginParticlePointerDrag(e) {
  if (e.button === 2) return;
  if (isPointerOverUi(e)) return;
  markRenderInteraction('canvas-drag', 1200);
  idleGuidePointerDown(e);
  orbit.rotating = true; orbit.last.x = e.clientX; orbit.last.y = e.clientY;
  particlePointerSpin.active = true;
  particlePointerSpin.lastX = e.clientX;
  particlePointerSpin.lastY = e.clientY;
  particlePointerSpin.lastT = performance.now();
  if (typeof particleSpin !== 'undefined') particleSpin.vx = particleSpin.vy = 0;
  mouseDownAt.x = e.clientX; mouseDownAt.y = e.clientY;
  mouseDownAt.t = performance.now(); mouseDownAt.hadDrag = false;
}
renderer.domElement.addEventListener('mousedown', function(e){
  beginParticlePointerDrag(e);
});
window.addEventListener('mousedown', function(e){
  if (!(fx && fx.preset === SKULL_PRESET_INDEX)) return;
  if (orbit.rotating || e.target === renderer.domElement) return;
  beginParticlePointerDrag(e);
}, true);
window.addEventListener('mousemove', function(e){
  updateControlsAutoHideFromPointer(e.clientX, e.clientY);
  idleGuidePointerMove(e);
  if (freeCamera && freeCamera.active) {
    markRenderInteraction('free-camera', 900);
    var mdx = e.movementX || 0;
    var mdy = e.movementY || 0;
    if ((!mdx && !mdy) && freeCameraPointer.seen) {
      mdx = e.clientX - freeCameraPointer.x;
      mdy = e.clientY - freeCameraPointer.y;
    }
    freeCameraPointer.x = e.clientX;
    freeCameraPointer.y = e.clientY;
    freeCameraPointer.seen = true;
    freeCamera.yaw -= mdx * 0.00125;
    freeCamera.pitch = clampRange(freeCamera.pitch - mdy * 0.00125, -Math.PI * 0.49, Math.PI * 0.49);
    return;
  }
  if (isPointerOverUi(e) && !orbit.rotating) { mouseActive = false; return; }
  if (orbit.rotating) {
    markRenderInteraction('canvas-drag', 900);
    unlockCenteredView();
    var dx = e.clientX - orbit.last.x, dy = e.clientY - orbit.last.y;
    if (particlePointerSpin.active) {
      var nowSpin = performance.now();
      var spinDt = Math.max(1 / 120, Math.min(0.08, (nowSpin - particlePointerSpin.lastT) / 1000 || 1 / 60));
      applyParticleSpinDrag(dx, dy, spinDt);
      particlePointerSpin.lastX = e.clientX;
      particlePointerSpin.lastY = e.clientY;
      particlePointerSpin.lastT = nowSpin;
    }
    orbit.last.x = e.clientX; orbit.last.y = e.clientY;
    // drag 距离判断
    var totalDx = e.clientX - mouseDownAt.x, totalDy = e.clientY - mouseDownAt.y;
    if (Math.sqrt(totalDx*totalDx + totalDy*totalDy) > CLICK_THRESHOLD) mouseDownAt.hadDrag = true;
    if (orbit.recentering) orbit.recentering = false;
  }
  queueParticlePointerFrame(e.clientX, e.clientY);
});
window.addEventListener('mouseup', function(){
  orbit.rotating = false;
  particlePointerSpin.active = false;
  idleGuidePointerUp();
});
renderer.domElement.addEventListener('mouseleave', function(){
  particlePointerFrame.dirty = false;
  mouseWorld.set(-999, -999, 0);
  mouseActive = false;
  idleGuidePointerLeave();
});
renderer.domElement.addEventListener('wheel', function(e){
  if (isPointerOverUi(e)) return;
  e.preventDefault();
  markRenderInteraction('canvas-wheel', 900);
  if (freeCamera && freeCamera.active) {
    freeCamera.fov = clampRange((freeCamera.fov || BASE_FOV) + e.deltaY * 0.018, 26, 72);
    saveFreeCameraState();
    return;
  }
  if (fx && fx.preset === SKULL_PRESET_INDEX && typeof skullWheelZoomTarget !== 'undefined') {
    skullWheelZoomTarget = clampRange(skullWheelZoomTarget + e.deltaY * 0.00155, -0.95, 1.28);
    return;
  }
  idleGuideWheel(e);
  unlockCenteredView();
  orbit.userRadius = Math.max(orbit.minRadius, Math.min(orbit.maxRadius, orbit.userRadius + e.deltaY * 0.005));
  if (orbit.recentering) orbit.recentering = false;
}, { passive:false });

// 双击屏幕回正 — 不命中卡片时
renderer.domElement.addEventListener('dblclick', function(e){
  if (isPointerOverUi(e)) return;
  if (freeCamera && freeCamera.locked) {
    resetFreeCameraToDefault();
    resetSkullPresetView(false, { smooth:true, keepLyricLock:true });
    return;
  }
  if (shelfManager && shelfManager.getMode() !== 'off') {
    var mx = (e.clientX / innerWidth) * 2 - 1;
    var my = -(e.clientY / innerHeight) * 2 + 1;
    var rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(mx, my), camera);
    if (shelfManager.raycastCards(rc)) return;
  }
  recenterCamera();
