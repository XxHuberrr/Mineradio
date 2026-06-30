// ============================================================
//  Mineradio — 09-gesture.js
// ============================================================

// ============================================================
//  动态库加载
// ============================================================
function loadScriptOnce(src) {
  return new Promise(function(resolve, reject){
    var hit = document.querySelector('script[src="' + src + '"]');
    if (hit) { resolve(); return; }
    var sc = document.createElement('script'); sc.src = src; sc.async = true;
    sc.onload = resolve; sc.onerror = reject;
    document.head.appendChild(sc);
  });
}

// ============================================================
//  摄像头 / 手势 v8 — 仅保留手势, 头部追踪已下线
//   - 21 个关键点用 EMA 平滑滤波, 消除抖动
//   - 食指尖 + 手掌中心 共同推开粒子 (真实手感, 不再是单点小球)
//   - 在 hand-canvas 上画出手掌骨架, 视觉跟随手
//   - 捏合 = 拖动旋转封面 (Y 反向修正)
//   - 没有挥扫 / 没有手势切歌
// ============================================================
function startHeadTracking(){}     // stub: 兼容旧调用
function stopHeadTracking(){}      // stub

var gestureVideo = null, gestureCamera = null, gestureHands = null;
var gestureActive = false;
// 21 个关键点的平滑缓存 (EMA): [{x,y}, ...]
var handLmSmooth = null;
var handLmLastSeen = 0;
// 捏合状态
var pinchState = { active:false, lastX:0, lastY:0, lastT:0 };
// 物理旋转: 给 particles 一个角速度, 每帧衰减
var particleSpin = { vx: 0, vy: 0, damping: 0.90 };
// 手势驱动的总旋转 (累计角度), 输出到 particles
var gestureRotation = { x: 0, y: 0 };
var gestureGrip = { value: 0, target: 0, openness: 1, lastState: 'open', pulse: 0 };
var PARTICLE_POINTER_SPIN_X = 0.0032;
var PARTICLE_POINTER_SPIN_Y = 0.0034;
var PARTICLE_HAND_SPIN_X = 4.15;
var PARTICLE_HAND_SPIN_Y = 4.30;
var PARTICLE_SPIN_MAX = 6.2;

function clampParticleSpinVelocity(v) {
  if (!isFinite(v)) return 0;
  return Math.max(-PARTICLE_SPIN_MAX, Math.min(PARTICLE_SPIN_MAX, v));
}

function applyParticleSpinDrag(dx, dy, dt) {
  var rx = dy * PARTICLE_POINTER_SPIN_X;
  var ry = dx * PARTICLE_POINTER_SPIN_Y;
  gestureRotation.x += rx;
  gestureRotation.y += ry;
  if (dt > 0) {
    particleSpin.vx = clampParticleSpinVelocity(rx / dt * 0.46);
    particleSpin.vy = clampParticleSpinVelocity(ry / dt * 0.46);
  }
}

function resetParticleRotationTarget(syncVisual) {
  gestureRotation.x = 0;
  gestureRotation.y = 0;
  particleSpin.vx = 0;
  particleSpin.vy = 0;
  if (syncVisual && particles) {
    particles.rotation.set(0, 0, 0);
    if (bloomParticles) bloomParticles.rotation.set(0, 0, 0);
    if (floatGroup) floatGroup.rotation.set(0, 0, 0);
    if (backCoverGroup) backCoverGroup.rotation.set(0, 0, 0);
  }
}

function rebaseParticleRotationAxis(axis) {
  var limit = Math.PI * 10;
  if (Math.abs(gestureRotation[axis]) < limit) return;
  var offset = Math.round(gestureRotation[axis] / (Math.PI * 2)) * Math.PI * 2;
  gestureRotation[axis] -= offset;
  if (particles) particles.rotation[axis] -= offset;
  if (bloomParticles) bloomParticles.rotation[axis] -= offset;
  if (floatGroup) floatGroup.rotation[axis] -= offset;
  if (backCoverGroup) backCoverGroup.rotation[axis] -= offset;
  if (skullParticleGroup) skullParticleGroup.rotation[axis] -= offset;
  if (stageLyrics.group) stageLyrics.group.rotation[axis] -= offset;
}

function rebaseParticleRotationIfNeeded() {
  rebaseParticleRotationAxis('x');
  rebaseParticleRotationAxis('y');
}
// 手骨架 canvas
var handCanvas = null, handCanvasCtx = null;
// 平滑系数 (越小越平滑, 但反应越慢)
var HAND_SMOOTH_ALPHA = 0.35;

async function startGestureControl() {
  if (gestureActive) return;
  showToast('正在加载手势识别…');
  try {
    await loadScriptOnce('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
    await loadScriptOnce('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js');
    gestureVideo = document.createElement('video');
    gestureVideo.playsInline = true; gestureVideo.muted = true;
    gestureVideo.style.display = 'none';
    document.body.appendChild(gestureVideo);
    gestureHands = new Hands({ locateFile: function(f){ return 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/' + f; } });
    // modelComplexity:1 比 0 更稳定, 但仍流畅. 提高 confidence 减少误检
    gestureHands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.7 });
    gestureHands.onResults(function(res){
      if (!gestureActive) return;
      var lm = res.multiHandLandmarks && res.multiHandLandmarks[0];
      if (!lm) { onHandLost(); return; }
      processHandFrame(lm);
    });
    gestureCamera = new Camera(gestureVideo, { onFrame: async function(){ if (gestureHands) await gestureHands.send({ image: gestureVideo }); }, width: 480, height: 360 });
    await gestureCamera.start();
    gestureActive = true;
    // 准备 hand canvas
    handCanvas = document.getElementById('hand-canvas');
    handCanvasCtx = handCanvas.getContext('2d');
    resizeHandCanvas();
    handCanvas.classList.add('show');
    showToast('手势已开启: 手掌推开 · 捏合旋转 · 握拳收束');
    showGestureHUD('待命', 0, '把手放进视野');
  } catch (e) {
    console.warn('Gesture failed:', e);
    showToast('手势启动失败 (需要摄像头权限)');
    fx.cam = 'off';
    document.querySelectorAll('#cam-seg button').forEach(function(b){ b.classList.toggle('active', b.dataset.cam === 'off'); });
  }
}

function stopGestureControl() {
  if (!gestureActive) return;
  try { if (gestureCamera && gestureCamera.stop) gestureCamera.stop(); } catch(e){}
  try { if (gestureVideo && gestureVideo.srcObject) gestureVideo.srcObject.getTracks().forEach(function(t){ t.stop(); }); } catch(e){}
  try { if (gestureVideo) gestureVideo.remove(); } catch(e){}
  gestureVideo = null; gestureHands = null; gestureCamera = null;
  gestureActive = false;
  pinchState.active = false;
  handLmSmooth = null;
  uniforms.uHandActive.value = 0;
  if (uniforms.uGestureGrip) uniforms.uGestureGrip.value = 0;
  gestureGrip.value = 0;
  gestureGrip.target = 0;
  gestureGrip.openness = 1;
  document.getElementById('gesture-hud').classList.remove('show');
  if (handCanvas) {
    handCanvas.classList.remove('show');
    if (handCanvasCtx) handCanvasCtx.clearRect(0, 0, handCanvas.width, handCanvas.height);
  }
}

function resizeHandCanvas() {
  if (!handCanvas) return;
  var dpr = Math.min(devicePixelRatio || 1, 2);
  handCanvas.width = innerWidth * dpr;
  handCanvas.height = innerHeight * dpr;
  handCanvas.style.width = innerWidth + 'px';
  handCanvas.style.height = innerHeight + 'px';
  handCanvasCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resizeHandCanvas);

function onHandLost() {
  // 平滑淡出, 不立即清零 — 给一点缓冲
  if (pinchState.active) pinchState.active = false;
  gestureGrip.target = 0;
  uniforms.uHandActive.value *= 0.9;
  if (uniforms.uHandActive.value < 0.02) uniforms.uHandActive.value = 0;
  if (performance.now() - handLmLastSeen > 600) {
    handLmSmooth = null;
    if (handCanvasCtx) handCanvasCtx.clearRect(0, 0, innerWidth, innerHeight);
    showGestureHUD('待命', 0, '把手放进视野');
  }
}

// 把单帧 21 个 landmark 平滑到 handLmSmooth, 镜像 X (摄像头是反的)
function smoothLandmarks(lm) {
  if (!handLmSmooth) {
    handLmSmooth = lm.map(function(p){ return { x: 1 - p.x, y: p.y, z: p.z || 0 }; });
    return handLmSmooth;
  }
  var a = HAND_SMOOTH_ALPHA;
  for (var i = 0; i < 21; i++) {
    var srcX = 1 - lm[i].x;
    handLmSmooth[i].x += (srcX - handLmSmooth[i].x) * a;
    handLmSmooth[i].y += (lm[i].y - handLmSmooth[i].y) * a;
    handLmSmooth[i].z += ((lm[i].z || 0) - handLmSmooth[i].z) * a;
  }
  return handLmSmooth;
}

// 手掌中心 ≈ wrist(0) 和 mcp 平均 (5,9,13,17 是各指根)
function palmCenter(lm) {
  var px = (lm[0].x + lm[5].x + lm[9].x + lm[13].x + lm[17].x) / 5;
  var py = (lm[0].y + lm[5].y + lm[9].y + lm[13].y + lm[17].y) / 5;
  return { x: px, y: py };
}

function handOpenness(lm, palm) {
  var span = Math.hypot(lm[5].x - lm[17].x, lm[5].y - lm[17].y);
  span = Math.max(0.055, span);
  var tips = [8, 12, 16, 20];
  var avg = 0;
  for (var i = 0; i < tips.length; i++) avg += Math.hypot(lm[tips[i]].x - palm.x, lm[tips[i]].y - palm.y);
  avg /= tips.length;
  return clampRange((avg / span - 0.62) / 0.78, 0, 1);
}

function processHandFrame(rawLm) {
  handLmLastSeen = performance.now();
  var lm = smoothLandmarks(rawLm);

  // 推开粒子位置: 手掌中心 (而非单一食指)
  var palm = palmCenter(lm);
  var openness = handOpenness(lm, palm);
  gestureGrip.openness += (openness - gestureGrip.openness) * 0.28;
  var gripTarget = clampRange(1 - openness, 0, 1);
  gestureGrip.target = gripTarget > 0.55 ? gripTarget : 0;
  var ndcX = palm.x * 2 - 1;
  var ndcY = -(palm.y * 2 - 1);
  var handLocalX = ndcX * PLANE_SIZE * 0.62;
  var handLocalY = ndcY * PLANE_SIZE * 0.62;
  if (particleLocalPointFromNdc(ndcX, ndcY, particlePointerLocalHit)) {
    // 平滑推动 (避免 uHandXY 跳变)
    handLocalX = particlePointerLocalHit.x;
    handLocalY = particlePointerLocalHit.y;
  }
  var cur = uniforms.uHandXY.value;
  cur.x += (handLocalX - cur.x) * 0.48;
  cur.y += (handLocalY - cur.y) * 0.48;
  var tgtActive = 0.44 + openness * 0.56;
  uniforms.uHandActive.value += (tgtActive - uniforms.uHandActive.value) * 0.26;

  // 捏合检测 (拇指 4 与食指 8)
  var pinchDist = Math.hypot(lm[8].x - lm[4].x, lm[8].y - lm[4].y);
  var isPinch = pinchDist < 0.075 && openness > 0.28;
  var isFist = !isPinch && gripTarget > 0.68;

  if (isPinch && !pinchState.active) {
    unlockCenteredView();
    pinchState.active = true;
    pinchState.lastX = palm.x;
    pinchState.lastY = palm.y;
    pinchState.lastT = performance.now();
    particleSpin.vx = particleSpin.vy = 0;
    gestureGrip.target = Math.min(0.34, gestureGrip.target);
    showGestureHUD('捏合拖动', 1, '移动手掌 -> 旋转封面');
  } else if (isPinch && pinchState.active) {
    unlockCenteredView();
    var dx = palm.x - pinchState.lastX;
    var dy = palm.y - pinchState.lastY;
    var nowPinch = performance.now();
    var pinchDt = Math.max(1 / 120, Math.min(0.08, (nowPinch - pinchState.lastT) / 1000 || 1 / 60));
    // v8: 方向修正 - 上下手与封面旋转同向
    var spinY = dx * PARTICLE_HAND_SPIN_Y;
    var spinX = dy * PARTICLE_HAND_SPIN_X;
    gestureRotation.y += spinY;
    gestureRotation.x += spinX;
    particleSpin.vy = clampParticleSpinVelocity(spinY / pinchDt * 0.48);
    particleSpin.vx = clampParticleSpinVelocity(spinX / pinchDt * 0.48);
    pinchState.lastX = palm.x;
    pinchState.lastY = palm.y;
    pinchState.lastT = nowPinch;
    gestureGrip.target = Math.min(0.34, gestureGrip.target);
    showGestureHUD('拖动中', 1, '松手后保留惯性');
  } else if (!isPinch && pinchState.active) {
    pinchState.active = false;
    showGestureHUD('松开', 0.4, '可继续触碰或捏合');
  } else if (isFist) {
    if (gestureGrip.lastState !== 'fist') {
      gestureGrip.pulse = 1;
      uniforms.uBurstAmt.value = Math.max(uniforms.uBurstAmt.value, 0.26);
    }
    gestureGrip.lastState = 'fist';
    showGestureHUD('握拳收束', Math.max(0.55, gripTarget), '粒子向中心收缩');
  } else {
    if (gestureGrip.lastState === 'fist' && openness > 0.58) {
      uniforms.uBurstAmt.value = Math.max(uniforms.uBurstAmt.value, 0.18);
    }
    gestureGrip.lastState = openness > 0.62 ? 'open' : 'hover';
    showGestureHUD(openness > 0.62 ? '张开恢复' : '悬停', 0.30 + openness * 0.34, '手掌推开粒子 / 捏合旋转 / 握拳收束');
  }

  drawHandSkeleton(lm, isPinch, openness, isFist);
}

// 画手掌骨架: 连线 + 关节圆点
//   骨架连接表 (MediaPipe 标准)
var HAND_BONES = [
  [0,1],[1,2],[2,3],[3,4],        // 拇指
  [0,5],[5,6],[6,7],[7,8],        // 食指
  [0,9],[9,10],[10,11],[11,12],   // 中指
  [0,13],[13,14],[14,15],[15,16], // 无名指
  [0,17],[17,18],[18,19],[19,20], // 小指
  [5,9],[9,13],[13,17],           // 掌横连
];
function drawHandSkeleton(lm, isPinch, openness, isFist) {
  if (!handCanvasCtx) return;
  var ctx = handCanvasCtx;
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  var W = innerWidth, H = innerHeight;
  openness = clampRange(openness == null ? 1 : openness, 0, 1);
  var palm = palmCenter(lm);
  var px = palm.x * W, py = palm.y * H;
  var primary = isFist ? 'rgba(244,210,138,0.92)' : (isPinch ? 'rgba(156,255,223,0.95)' : 'rgba(226,247,255,0.92)');
  var soft = isFist ? 'rgba(244,210,138,0.18)' : (isPinch ? 'rgba(156,255,223,0.20)' : 'rgba(143,233,255,0.18)');
  var coreR = 26 + openness * 34;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  var aura = ctx.createRadialGradient(px, py, 0, px, py, coreR * 2.15);
  aura.addColorStop(0, isFist ? 'rgba(244,210,138,0.26)' : 'rgba(255,255,255,0.22)');
  aura.addColorStop(0.28, soft);
  aura.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(px, py, coreR * 2.15, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  var ringR = 34 + openness * 48;
  for (var r = 0; r < 3; r++) {
    var alpha = (0.18 - r * 0.045) + (isFist ? 0.08 : 0);
    ctx.strokeStyle = primary.replace(/0\.\d+\)/, alpha.toFixed(3) + ')');
    ctx.lineWidth = 1.2 + r * 0.55;
    ctx.beginPath();
    ctx.arc(px, py, ringR + r * 13 + Math.sin(uniforms.uTime.value * 1.5 + r) * 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  var tips = [4, 8, 12, 16, 20];
  for (var i = 0; i < tips.length; i++) {
    var p = lm[tips[i]];
    var tx = p.x * W, ty = p.y * H;
    var dx = tx - px, dy = ty - py;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var beamAlpha = clampRange(0.26 - dist / 720, 0.045, 0.18) * (0.55 + openness * 0.45);
    var grad = ctx.createLinearGradient(px, py, tx, ty);
    grad.addColorStop(0, 'rgba(255,255,255,' + (beamAlpha * 0.20).toFixed(3) + ')');
    grad.addColorStop(0.65, 'rgba(255,255,255,' + (beamAlpha * 0.42).toFixed(3) + ')');
    grad.addColorStop(1, primary.replace(/0\.\d+\)/, Math.min(0.72, beamAlpha + 0.14).toFixed(3) + ')'));
    ctx.strokeStyle = grad;
    ctx.lineWidth = tips[i] === 8 || tips[i] === 4 ? 1.7 : 1.05;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.quadraticCurveTo(px + dx * 0.42 - dy * 0.05, py + dy * 0.42 + dx * 0.05, tx, ty);
    ctx.stroke();
    var dotR = (tips[i] === 8 || tips[i] === 4 ? 4.2 : 3.0) + (isFist ? 0.8 : 0);
    var dot = ctx.createRadialGradient(tx, ty, 0, tx, ty, dotR * 4.2);
    dot.addColorStop(0, 'rgba(255,255,255,0.92)');
    dot.addColorStop(0.32, primary);
    dot.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = dot;
    ctx.beginPath();
    ctx.arc(tx, ty, dotR * 4.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(px, py, isFist ? 7.2 : 5.4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,' + (isFist ? 0.82 : 0.62).toFixed(3) + ')';
  ctx.fill();

  if (isPinch) {
    var t1 = lm[4], t2 = lm[8];
    ctx.strokeStyle = 'rgba(220,255,241,0.88)';
    ctx.lineWidth = 2.0;
    ctx.shadowColor = 'rgba(126,226,168,0.82)';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.moveTo(t1.x * W, t1.y * H);
    ctx.lineTo(t2.x * W, t2.y * H);
    ctx.stroke();
  }
  ctx.restore();
}

// 每帧调用 — 应用惯性旋转 + handActive 衰减
function tickGestureRotation(dt) {
  if (Math.abs(particleSpin.vx) > 0.0001 || Math.abs(particleSpin.vy) > 0.0001) {
    var rx = particleSpin.vx * dt;
    var ry = particleSpin.vy * dt;
    gestureRotation.x += rx;
    gestureRotation.y += ry;
    rebaseParticleRotationIfNeeded();
  }
  particleSpin.vx *= Math.pow(particleSpin.damping, dt * 60);
  particleSpin.vy *= Math.pow(particleSpin.damping, dt * 60);
  if (Math.abs(particleSpin.vx) < 0.01) particleSpin.vx = 0;
  if (Math.abs(particleSpin.vy) < 0.01) particleSpin.vy = 0;
  gestureGrip.value += (gestureGrip.target - gestureGrip.value) * (gestureGrip.target > gestureGrip.value ? 0.18 : 0.10);
  gestureGrip.pulse *= Math.pow(0.84, dt * 60);
  if (uniforms.uGestureGrip) uniforms.uGestureGrip.value = clampRange(gestureGrip.value + gestureGrip.pulse * 0.16, 0, 1);
  // hand active 自然衰减 (无手时)
  if (gestureActive && handLmSmooth && performance.now() - handLmLastSeen > 200) {
    uniforms.uHandActive.value *= 0.94;
    gestureGrip.target *= 0.92;
    if (uniforms.uHandActive.value < 0.02) uniforms.uHandActive.value = 0;
  }
}

function showGestureHUD(label, progress, detail) {
  var hud = document.getElementById('gesture-hud');
  if (!hud) return;
  document.getElementById('gesture-label').textContent = label || '待命';
  document.getElementById('gesture-confirm').textContent = detail || '将手放进摄像头视野';
  var fill = document.getElementById('gesture-fill');
  if (fill) fill.style.width = Math.max(0, Math.min(100, (progress || 0) * 100)) + '%';
  hud.classList.add('show');
}
function showGestureCursor(){}  // stub: 兼容旧调用
function hideGestureCursor(){}  // stub: 兼容旧调用


