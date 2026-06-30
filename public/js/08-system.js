// ============================================================
//  Mineradio — 08-system.js
// ============================================================

// ============================================================
//  更新提示预览
// ============================================================
function formatUpdateBytes(bytes) {
  bytes = Number(bytes) || 0;
  if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2).replace(/\.00$/, '') + ' GB';
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '') + ' MB';
  if (bytes >= 1024) return Math.round(bytes / 1024) + ' KB';
  return bytes + ' B';
}
function formatUpdateSpeed(bytesPerSecond) {
  bytesPerSecond = Number(bytesPerSecond) || 0;
  return bytesPerSecond > 0 ? (formatUpdateBytes(bytesPerSecond) + '/s') : '';
}
function updateProgressDetailText() {
  var parts = [];
  if (updatePreviewState.attempts > 1 && updatePreviewState.attempt > 0) {
    parts.push('线路 ' + updatePreviewState.attempt + '/' + updatePreviewState.attempts);
  }
  if (updatePreviewState.sourceLabel) parts.push(updatePreviewState.sourceLabel);
  if (updatePreviewState.received > 0) {
    parts.push(updatePreviewState.total > 0
      ? (formatUpdateBytes(updatePreviewState.received) + ' / ' + formatUpdateBytes(updatePreviewState.total))
      : ('已下载 ' + formatUpdateBytes(updatePreviewState.received)));
  }
  var speed = formatUpdateSpeed(updatePreviewState.speedBps);
  if (speed) parts.push(speed);
  if (updatePreviewState.etaSeconds > 0 && updatePreviewState.etaSeconds < 3600) parts.push('约 ' + updatePreviewState.etaSeconds + ' 秒');
  return parts.join(' · ');
}
function initUpdatePreview() {
  renderUpdatePreviewPanel();
  setUpdatePreviewVisible(true);
  checkLatestUpdate();
  setTimeout(startUpdateIconBreathing, 760);
}

function setUpdatePreviewVisible(visible) {
  updatePreviewState.visible = !!visible;
  var entry = document.getElementById('update-entry');
  if (!entry) return;
  entry.classList.toggle('available', updatePreviewState.visible);
  if (!updatePreviewState.visible && window.gsap) {
    window.gsap.killTweensOf(entry);
    window.gsap.set(entry, { autoAlpha: 0, y: 0, clearProps: 'boxShadow,filter,scale' });
    return;
  }
  if (updatePreviewState.visible && window.gsap) {
    window.gsap.fromTo(entry,
      { autoAlpha: 0, y: -6, scale: 0.92, filter: 'blur(6px)' },
      { autoAlpha: 1, y: 0, scale: 1, filter: 'blur(0px)', duration: 0.62, delay: 0.18, ease: 'expo.out', overwrite: true }
    );
  }
}

async function checkLatestUpdate() {
  try {
    var data = await apiJson('/api/update/latest?t=' + Date.now());
    applyLatestUpdateInfo(data);
  } catch (e) {
    updatePreviewState.preview = true;
    updatePreviewState.updateAvailable = false;
    updatePreviewState.hero = '当前版本，更新检测已就绪。';
    renderUpdatePreviewPanel();
    setUpdatePreviewVisible(true);
  }
}

function applyLatestUpdateInfo(data) {
  data = data || {};
  var release = data.release || {};
  updatePreviewState.currentVersion = data.currentVersion || updatePreviewState.currentVersion;
  updatePreviewState.version = data.latestVersion || release.version || updatePreviewState.currentVersion;
  updatePreviewState.configured = !!data.configured;
  updatePreviewState.preview = !!data.preview;
  updatePreviewState.updateAvailable = !!data.updateAvailable;
  updatePreviewState.releaseUrl = release.htmlUrl || data.htmlUrl || '';
  updatePreviewState.downloadUrl = release.downloadUrl || data.downloadUrl || '';
  updatePreviewState.patchAvailable = !!(release.patchAvailable && release.patch && release.patch.downloadUrl);
  updatePreviewState.patchUrl = updatePreviewState.patchAvailable ? release.patch.downloadUrl : '';
  updatePreviewState.patchFallbackTried = false;
  updatePreviewState.hero = release.summary || (updatePreviewState.updateAvailable ? '发现新版本，建议更新。' : '当前版本，更新检测已就绪。');
  if (Array.isArray(release.notes) && release.notes.length) {
    updatePreviewState.notes = release.notes.slice(0, 4);
  }
  renderUpdatePreviewPanel();
  setUpdatePreviewVisible(updatePreviewState.updateAvailable || updatePreviewState.preview);
}

function startUpdateIconBreathing() {
  var entry = document.getElementById('update-entry');
  if (!entry || !window.gsap) return;
  var ring = entry.querySelector('.update-ring');
  window.gsap.killTweensOf(entry, 'y,boxShadow');
  window.gsap.set(entry, { autoAlpha: 1 });
  if (ring) window.gsap.killTweensOf(ring);
  window.gsap.to(entry, {
    y: -1.4,
    boxShadow: '0 16px 44px rgba(0,0,0,.32),0 0 24px rgba(244,210,138,.18),0 0 13px rgba(157,184,207,.06),inset 0 1px 0 rgba(255,255,255,.11)',
    duration: 2.6,
    repeat: -1,
    yoyo: true,
    ease: 'sine.inOut'
  });
  if (ring) {
    window.gsap.to(ring, {
      rotate: 18,
      duration: 3.8,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut',
      transformOrigin: '50% 50%'
    });
  }
}

function renderUpdatePreviewPanel() {
  var version = document.getElementById('update-modal-version');
  var hero = document.getElementById('update-hero-main');
  var list = document.getElementById('update-list');
  if (version) version.textContent = 'v' + updatePreviewState.version;
  if (hero) hero.textContent = updatePreviewState.hero || '当前版本，更新检测已就绪。';
  if (list) {
    var notes = Array.isArray(updatePreviewState.notes) && updatePreviewState.notes.length ? updatePreviewState.notes : ['更新检测已就绪'];
    list.innerHTML = notes.map(function(text, i){
      return '<div class="update-item"><span class="update-item-dot" data-index="' + String(i + 1).padStart(2, '0') + '"></span><div class="update-item-text">' + escHtml(text) + '</div></div>';
    }).join('');
  }
  updateUpdatePreviewProgress(updatePreviewState.progress);
  syncUpdatePreviewStateClass();
}

function syncUpdatePreviewStateClass() {
  var entry = document.getElementById('update-entry');
  var modal = document.querySelector('#update-modal .update-modal');
  var isDownloading = updatePreviewState.status === 'downloading';
  var isReady = updatePreviewState.status === 'ready';
  var isError = updatePreviewState.status === 'error';
  var isOpening = updatePreviewState.status === 'opening';
  var isPatch = updatePreviewState.mode === 'patch';
  if (entry) {
    entry.classList.toggle('downloading', isDownloading || isOpening);
    entry.classList.toggle('ready', isReady);
  }
  if (modal) {
    modal.classList.toggle('ready', isReady);
    modal.classList.toggle('error', isError);
  }
  var label = document.getElementById('update-btn-label');
  var btn = document.getElementById('update-primary-btn');
  var canDownloadUpdate = updatePreviewState.configured && updatePreviewState.updateAvailable && updatePreviewState.downloadUrl;
  var canOpenRelease = updatePreviewState.configured && updatePreviewState.updateAvailable && !updatePreviewState.downloadUrl && updatePreviewState.releaseUrl;
  if (label) {
    if (isDownloading) label.textContent = (isPatch ? '快速补丁 ' : '正在下载 ') + Math.round(updatePreviewState.progress) + '%';
    else if (isOpening) label.textContent = '正在打开安装包';
    else if (isError && updatePreviewState.mode === 'patch' && updatePreviewState.downloadUrl) label.textContent = '下载完整安装包';
    else if (isError) label.textContent = updatePreviewState.mode === 'installer' ? '重试下载' : '重试更新';
    else if (isReady && isPatch && updatePreviewState.restartRequired) label.textContent = '重启生效';
    else if (isReady && isPatch) label.textContent = '补丁已应用';
    else if (isReady && updatePreviewState.installerOpened) label.textContent = '安装包已打开';
    else if (isReady && updatePreviewState.installerPath) label.textContent = updatePreviewState.cached ? '打开已下载安装包' : '打开安装包';
    else if (isReady) label.textContent = updatePreviewState.configured ? '打开安装包' : '预览完成';
    else label.textContent = updatePreviewState.patchAvailable ? '安装快速补丁' : ((canDownloadUpdate || canOpenRelease) ? '下载完整安装包' : '立即更新');
  }
  if (btn) btn.disabled = false;
  var foot = document.getElementById('update-footnote');
  if (foot) {
    if (isDownloading) foot.textContent = (updatePreviewState.message || (isPatch ? '正在下载快速补丁' : '正在下载完整安装包')) + (updateProgressDetailText() ? ' · ' + updateProgressDetailText() : '');
    else if (isError) foot.textContent = '下载失败：' + (updatePreviewState.errorReason || updatePreviewState.errorDetail || updatePreviewState.message || '请稍后重试') + (updatePreviewState.failedAttempts && updatePreviewState.failedAttempts.length ? ' · 已尝试 ' + updatePreviewState.failedAttempts.length + ' 条线路' : '');
    else if (isReady && isPatch) foot.textContent = updatePreviewState.restartRequired ? '快速补丁已应用，重启 Mineradio 后生效。' : '快速补丁已应用。';
    else if (isReady) foot.textContent = updatePreviewState.cached ? '已复用上次校验通过的安装包，不会重复下载。' : '安装包已准备好，点击按钮后再打开安装。';
    else if (updatePreviewState.patchAvailable) foot.textContent = '优先使用轻量补丁，只更新缺失或变更的资源文件；不适用时可下载完整安装包。';
    else foot.textContent = updatePreviewState.updateAvailable ? '没有可用快速补丁时会下载完整安装包。' : '当前版本已是最新。';
  }
}

function updateUpdatePreviewProgress(progress) {
  updatePreviewState.progress = clampRange(Number(progress) || 0, 0, 100);
  var fill = document.getElementById('update-btn-fill');
  if (fill) fill.style.width = updatePreviewState.progress + '%';
  var ring = document.getElementById('update-progress-ring');
  if (ring) {
    var circumference = 55.29;
    ring.style.strokeDashoffset = (circumference * (1 - updatePreviewState.progress / 100)).toFixed(2);
  }
  syncUpdatePreviewStateClass();
}

function openUpdatePanel() {
  var mask = document.getElementById('update-modal');
  var entry = document.getElementById('update-entry');
  if (!mask) return;
  renderUpdatePreviewPanel();
  if (entry && window.gsap) {
    window.gsap.fromTo(entry, { scale: 0.93 }, { scale: 1, duration: 0.42, ease: 'back.out(1.7)', overwrite: 'auto' });
  }
  openGsapModal(mask);
  updatePreviewState.open = true;
  animateUpdatePanelContents();
}

function closeUpdatePanel() {
  closeGsapModal(document.getElementById('update-modal'), function(){
    updatePreviewState.open = false;
  });
}

function animateUpdatePanelContents() {
  if (!window.gsap) return;
  var modal = document.querySelector('#update-modal .update-modal');
  if (!modal) return;
  var parts = [
    modal.querySelector('.update-kicker'),
    modal.querySelector('.update-version'),
    modal.querySelector('.update-hero')
  ].filter(Boolean);
  var items = Array.prototype.slice.call(modal.querySelectorAll('.update-item'));
  var actions = modal.querySelector('.update-actions');
  window.gsap.fromTo(parts,
    { autoAlpha: 0, x: -7, filter: 'blur(5px)' },
    { autoAlpha: 1, x: 0, filter: 'blur(0px)', duration: 0.50, ease: 'power3.out', stagger: 0.045, delay: 0.10, overwrite: true }
  );
  window.gsap.fromTo(items,
    { autoAlpha: 0, x: -8 },
    { autoAlpha: 1, x: 0, duration: 0.34, ease: 'power3.out', stagger: 0.055, delay: 0.25, overwrite: true }
  );
  if (actions) {
    window.gsap.fromTo(actions,
      { autoAlpha: 0, y: 8 },
      { autoAlpha: 1, y: 0, duration: 0.36, ease: 'power3.out', delay: 0.42, overwrite: true }
    );
  }
}

async function startRealUpdateDownload() {
  if (updatePreviewState.status === 'downloading' || updatePreviewState.status === 'opening') return;
  if (updatePreviewState.status === 'ready' && updatePreviewState.installerPath) {
    openDownloadedUpdateInstaller(updatePreviewState.installerPath);
    return;
  }
  if (updatePreviewState.timer) clearInterval(updatePreviewState.timer);
  if (updatePreviewState.pollTimer) clearInterval(updatePreviewState.pollTimer);
  updatePreviewState.status = 'downloading';
  updatePreviewState.progress = 0;
  updatePreviewState.mode = 'installer';
  updatePreviewState.downloadJobId = '';
  updatePreviewState.installerPath = '';
  updatePreviewState.installerOpened = false;
  updatePreviewState.cached = false;
  updatePreviewState.received = 0;
  updatePreviewState.total = 0;
  updatePreviewState.speedBps = 0;
  updatePreviewState.etaSeconds = 0;
  updatePreviewState.sourceLabel = '';
  updatePreviewState.attempt = 0;
  updatePreviewState.attempts = 0;
  updatePreviewState.errorReason = '';
  updatePreviewState.errorDetail = '';
  updatePreviewState.failedAttempts = [];
  updatePreviewState.message = '正在下载完整安装包';
  updateUpdatePreviewProgress(0);
  try {
    var job = await apiJson('/api/update/download', { method: 'POST' });
    if (!job || job.ok === false || !job.id) throw new Error((job && job.error) || 'UPDATE_DOWNLOAD_START_FAILED');
    updatePreviewState.downloadJobId = job.id;
    applyUpdateDownloadJob(job);
    updatePreviewState.pollTimer = setInterval(function(){
      pollUpdateDownloadJob(job.id);
    }, 360);
  } catch (e) {
    updatePreviewState.status = 'error';
    updatePreviewState.errorReason = (e && e.message) || '更新下载启动失败';
    updatePreviewState.errorDetail = updatePreviewState.errorReason;
    updatePreviewState.message = updatePreviewState.errorReason;
    updateUpdatePreviewProgress(0);
    showToast('更新下载启动失败：' + updatePreviewState.errorReason);
  }
}
async function startRealUpdatePatch() {
  if (updatePreviewState.status === 'downloading' || updatePreviewState.status === 'opening') return;
  if (updatePreviewState.status === 'ready' && updatePreviewState.mode === 'patch') {
    restartForAppliedPatch();
    return;
  }
  if (updatePreviewState.timer) clearInterval(updatePreviewState.timer);
  if (updatePreviewState.pollTimer) clearInterval(updatePreviewState.pollTimer);
  updatePreviewState.status = 'downloading';
  updatePreviewState.mode = 'patch';
  updatePreviewState.progress = 0;
  updatePreviewState.patchJobId = '';
  updatePreviewState.installerPath = '';
  updatePreviewState.installerOpened = false;
  updatePreviewState.cached = false;
  updatePreviewState.received = 0;
  updatePreviewState.total = 0;
  updatePreviewState.speedBps = 0;
  updatePreviewState.etaSeconds = 0;
  updatePreviewState.sourceLabel = '';
  updatePreviewState.attempt = 0;
  updatePreviewState.attempts = 0;
  updatePreviewState.errorReason = '';
  updatePreviewState.errorDetail = '';
  updatePreviewState.failedAttempts = [];
  updatePreviewState.patchFallbackTried = false;
  updatePreviewState.message = '正在下载快速补丁';
  updateUpdatePreviewProgress(0);
  try {
    var job = await apiJson('/api/update/patch', { method: 'POST' });
    if (!job || job.ok === false || !job.id) throw new Error((job && job.error) || 'UPDATE_PATCH_START_FAILED');
    updatePreviewState.patchJobId = job.id;
    applyUpdateDownloadJob(job);
    updatePreviewState.pollTimer = setInterval(function(){
      pollUpdatePatchJob(job.id);
    }, 320);
  } catch (e) {
    updatePreviewState.status = 'error';
    updatePreviewState.errorReason = (e && e.message) || '快速补丁不可用';
    updatePreviewState.errorDetail = updatePreviewState.errorReason;
    updatePreviewState.message = updatePreviewState.errorReason;
    updateUpdatePreviewProgress(0);
    updatePreviewState.patchFallbackTried = true;
    showToast('快速补丁不可用，可手动下载完整安装包');
  }
}

async function pollUpdateDownloadJob(id) {
  if (!id) return;
  try {
    var job = await apiJson('/api/update/download/status?id=' + encodeURIComponent(id) + '&t=' + Date.now());
    applyUpdateDownloadJob(job);
  } catch (e) {
    if (updatePreviewState.pollTimer) clearInterval(updatePreviewState.pollTimer);
    updatePreviewState.pollTimer = null;
    updatePreviewState.status = 'error';
    updatePreviewState.errorReason = '更新下载状态读取失败';
    updatePreviewState.errorDetail = (e && e.message) || updatePreviewState.errorReason;
    updatePreviewState.message = updatePreviewState.errorReason;
    updateUpdatePreviewProgress(updatePreviewState.progress || 0);
    showToast('更新下载状态读取失败');
  }
}
async function pollUpdatePatchJob(id) {
  if (!id) return;
  try {
    var job = await apiJson('/api/update/patch/status?id=' + encodeURIComponent(id) + '&t=' + Date.now());
    applyUpdateDownloadJob(job);
  } catch (e) {
    if (updatePreviewState.pollTimer) clearInterval(updatePreviewState.pollTimer);
    updatePreviewState.pollTimer = null;
    updatePreviewState.status = 'error';
    updatePreviewState.errorReason = '快速补丁状态读取失败';
    updatePreviewState.errorDetail = (e && e.message) || updatePreviewState.errorReason;
    updatePreviewState.message = updatePreviewState.errorReason;
    updateUpdatePreviewProgress(updatePreviewState.progress || 0);
    showToast('快速补丁状态读取失败');
  }
}

function applyUpdateDownloadJob(job) {
  if (!job || job.ok === false || job.status === 'error') {
    if (updatePreviewState.pollTimer) clearInterval(updatePreviewState.pollTimer);
    updatePreviewState.pollTimer = null;
    updatePreviewState.mode = (job && job.mode) || updatePreviewState.mode || 'installer';
    updatePreviewState.received = Number(job && job.received || 0);
    updatePreviewState.total = Number(job && job.total || 0);
    updatePreviewState.speedBps = Number(job && job.speedBps || 0);
    updatePreviewState.etaSeconds = Number(job && job.etaSeconds || 0);
    updatePreviewState.sourceLabel = (job && job.sourceLabel) || updatePreviewState.sourceLabel || '';
    updatePreviewState.attempt = Number(job && job.attempt || 0);
    updatePreviewState.attempts = Number(job && job.attempts || 0);
    updatePreviewState.errorReason = (job && (job.errorReason || job.message || job.error)) || '请稍后重试';
    updatePreviewState.errorDetail = (job && job.errorDetail) || '';
    updatePreviewState.failedAttempts = Array.isArray(job && job.failedAttempts) ? job.failedAttempts : [];
    updatePreviewState.message = (job && job.message) || updatePreviewState.errorReason;
    updatePreviewState.status = 'error';
    updateUpdatePreviewProgress(job && job.progress || updatePreviewState.progress || 0);
    if (updatePreviewState.mode === 'patch' && updatePreviewState.downloadUrl && !updatePreviewState.patchFallbackTried) {
      updatePreviewState.patchFallbackTried = true;
      showToast('快速补丁失败，可手动下载完整安装包：' + updatePreviewState.errorReason);
      return;
    }
    showToast('更新下载失败：' + updatePreviewState.errorReason);
    return;
  }
  if (job.id) updatePreviewState.downloadJobId = job.id;
  updatePreviewState.mode = job.mode || updatePreviewState.mode || 'installer';
  if (updatePreviewState.mode === 'patch') updatePreviewState.patchJobId = job.id || updatePreviewState.patchJobId;
  updatePreviewState.received = Number(job.received || 0);
  updatePreviewState.total = Number(job.total || 0);
  updatePreviewState.speedBps = Number(job.speedBps || 0);
  updatePreviewState.etaSeconds = Number(job.etaSeconds || 0);
  updatePreviewState.sourceLabel = job.sourceLabel || '';
  updatePreviewState.attempt = Number(job.attempt || 0);
  updatePreviewState.attempts = Number(job.attempts || 0);
  updatePreviewState.errorReason = job.errorReason || '';
  updatePreviewState.errorDetail = job.errorDetail || '';
  updatePreviewState.failedAttempts = Array.isArray(job.failedAttempts) ? job.failedAttempts : [];
  updatePreviewState.message = job.message || '';
  updatePreviewState.restartRequired = !!job.restartRequired;
  updatePreviewState.cached = !!job.cached;
  if (job.status === 'downloading' || job.status === 'queued') {
    updatePreviewState.status = 'downloading';
    updateUpdatePreviewProgress(job.progress || 0);
    return;
  }
  if (job.status === 'ready') {
    if (updatePreviewState.pollTimer) clearInterval(updatePreviewState.pollTimer);
    updatePreviewState.pollTimer = null;
    updatePreviewState.status = 'ready';
    updatePreviewState.installerPath = job.filePath || '';
    updateUpdatePreviewProgress(100);
    pulseUpdateReady();
    if (updatePreviewState.mode === 'patch') {
      showToast(updatePreviewState.restartRequired ? '快速补丁已应用，重启后生效' : '快速补丁已应用');
    } else if (updatePreviewState.installerPath) {
      showToast(updatePreviewState.cached ? '已复用上次下载的安装包' : '安装包已下载，点击按钮打开');
    }
  }
}
async function restartForAppliedPatch() {
  if (!updatePreviewState.restartRequired) return;
  try {
    if (window.desktopWindow && typeof window.desktopWindow.restartApp === 'function') {
      await window.desktopWindow.restartApp();
      return;
    }
  } catch (e) {}
  showToast('请手动重启 Mineradio 让补丁生效');
}

async function openDownloadedUpdateInstaller(filePath) {
  if (!filePath) return;
  if (updatePreviewState.installerOpened) return;
  updatePreviewState.status = 'opening';
  syncUpdatePreviewStateClass();
  try {
    if (window.desktopWindow && window.desktopWindow.openUpdateInstaller) {
      var result = await window.desktopWindow.openUpdateInstaller(filePath);
      if (!result || result.ok === false) throw new Error((result && result.error) || 'OPEN_UPDATE_FAILED');
      updatePreviewState.installerOpened = true;
      updatePreviewState.status = 'ready';
      syncUpdatePreviewStateClass();
      showToast('安装包已打开');
      return;
    }
    throw new Error('DESKTOP_BRIDGE_MISSING');
  } catch (e) {
    updatePreviewState.status = 'ready';
    syncUpdatePreviewStateClass();
    if (updatePreviewState.releaseUrl) window.open(updatePreviewState.releaseUrl, '_blank');
    showToast('无法自动打开安装包，已尝试打开更新页面');
  }
}

function startUpdatePreviewDownload() {
  var releaseLink = updatePreviewState.downloadUrl || updatePreviewState.releaseUrl;
  if (updatePreviewState.status === 'ready' && updatePreviewState.mode === 'patch') {
    restartForAppliedPatch();
    return;
  }
  if (updatePreviewState.configured && updatePreviewState.updateAvailable) {
    if (updatePreviewState.patchAvailable && updatePreviewState.patchUrl && !updatePreviewState.patchFallbackTried) {
      startRealUpdatePatch();
    } else if (updatePreviewState.downloadUrl) {
      startRealUpdateDownload();
    } else if (releaseLink) {
      window.open(releaseLink, '_blank');
      showToast('已打开更新页面');
    } else {
      showToast('这个版本还没有可用下载链接');
    }
    return;
  }
  if (updatePreviewState.status === 'ready') {
    if (window.gsap) {
      var modal = document.querySelector('#update-modal .update-modal');
      if (modal) window.gsap.fromTo(modal, { boxShadow: '0 30px 100px rgba(0,0,0,.62),0 0 0 1px rgba(244,210,138,.16)' }, { boxShadow: '0 30px 100px rgba(0,0,0,.62),0 0 34px rgba(244,210,138,.18)', duration: 0.52, yoyo: true, repeat: 1, ease: 'sine.inOut' });
    }
    showToast('正式接入后将重启并安装新版');
    return;
  }
  if (updatePreviewState.status === 'downloading') return;
  if (updatePreviewState.timer) clearInterval(updatePreviewState.timer);
  updatePreviewState.status = 'downloading';
  updateUpdatePreviewProgress(0);
  var btn = document.getElementById('update-primary-btn');
  if (btn && window.gsap) window.gsap.fromTo(btn, { scale: 0.985 }, { scale: 1, duration: 0.34, ease: 'back.out(1.45)', overwrite: true });
  updatePreviewState.timer = setInterval(function(){
    var next = updatePreviewState.progress + 3.2 + Math.random() * 7.5;
    if (next >= 100) {
      clearInterval(updatePreviewState.timer);
      updatePreviewState.timer = null;
      updatePreviewState.status = 'ready';
      updateUpdatePreviewProgress(100);
      pulseUpdateReady();
    } else {
      updateUpdatePreviewProgress(next);
    }
  }, 260);
}

function pulseUpdateReady() {
  var entry = document.getElementById('update-entry');
  var btn = document.getElementById('update-primary-btn');
  if (!window.gsap) return;
  if (entry) {
    window.gsap.fromTo(entry,
      { scale: 0.96, filter: 'drop-shadow(0 0 0 rgba(244,210,138,0))' },
      { scale: 1.04, filter: 'drop-shadow(0 0 14px rgba(244,210,138,.28))', duration: 0.34, yoyo: true, repeat: 1, ease: 'sine.inOut', overwrite: 'auto' }
    );
  }
  if (btn) {
    window.gsap.fromTo(btn,
      { boxShadow: '0 0 0 rgba(244,210,138,0), inset 0 1px 0 rgba(255,255,255,.09)' },
      { boxShadow: '0 0 24px rgba(244,210,138,.16), inset 0 1px 0 rgba(255,255,255,.11)', duration: 0.42, yoyo: true, repeat: 1, ease: 'sine.inOut', overwrite: true }
    );
  }
}

// ============================================================
//  登录系统
// ============================================================
function openGsapModal(mask) {
  if (!mask) return;
  var panel = mask.querySelector('.modal');
  mask.classList.add('show');
  if (window.gsap) {
    window.gsap.killTweensOf(mask);
    if (panel) window.gsap.killTweensOf(panel);
    window.gsap.set(mask, { display: 'flex', visibility: 'visible' });
    window.gsap.fromTo(mask,
      { autoAlpha: 0 },
      { autoAlpha: 1, duration: 0.38, ease: 'power2.out', overwrite: true }
    );
    if (panel) {
      window.gsap.fromTo(panel,
        { autoAlpha: 0, y: 26, scale: 0.965, filter: 'blur(12px)' },
        { autoAlpha: 1, y: 0, scale: 1, filter: 'blur(0px)', duration: 0.68, ease: 'expo.out', overwrite: true }
      );
    }
  } else {
    mask.style.display = 'flex';
    mask.style.visibility = 'visible';
    mask.style.opacity = '1';
  }
}
function closeGsapModal(mask, afterClose) {
  if (!mask || !mask.classList.contains('show')) {
    if (afterClose) afterClose();
    return;
  }
  var panel = mask.querySelector('.modal');
  function finish() {
    mask.classList.remove('show');
    if (window.gsap) {
      window.gsap.set(mask, { clearProps: 'display,visibility,opacity' });
      if (panel) window.gsap.set(panel, { clearProps: 'opacity,visibility,transform,filter' });
    } else {
      mask.style.display = '';
      mask.style.visibility = '';
      mask.style.opacity = '';
    }
    if (afterClose) afterClose();
  }
  if (window.gsap) {
    window.gsap.killTweensOf(mask);
    if (panel) {
      window.gsap.killTweensOf(panel);
      window.gsap.to(panel, { autoAlpha: 0, y: 18, scale: 0.976, filter: 'blur(8px)', duration: 0.28, ease: 'power2.in', overwrite: true });
    }
    window.gsap.to(mask, { autoAlpha: 0, duration: 0.34, ease: 'power2.inOut', overwrite: true, onComplete: finish });
  } else {
    finish();
  }
}
function bindModalBackdropClose() {
  [
    ['track-detail-modal', closeTrackDetailModal],
    ['login-modal', closeLoginModal],
    ['user-modal', closeUserModal],
    ['custom-lyric-modal', closeCustomLyricModal],
    ['update-modal', closeUpdatePanel]
  ].forEach(function(pair){
    var mask = document.getElementById(pair[0]);
    var close = pair[1];
    if (!mask || mask.__backdropCloseBound) return;
    mask.__backdropCloseBound = true;
    mask.addEventListener('click', function(e){
      if (e.target === mask) close();
    });
  });
}
function onUserBtnClick() {
  if (hasAnyPlatformLogin()) showUserModal();
  else showLoginModal();
}
function platformMeta(provider) {
  if (provider === 'qq') return { key: 'qq', short: 'QQ', label: 'QQ 音乐', app: 'QQ 音乐 App', dot: 'qq' };
  return { key: 'netease', short: 'NE', label: '网易云音乐', app: '网易云音乐 App', dot: 'netease' };
}
function platformStatus(provider) {
  return provider === 'qq' ? qqLoginStatus : loginStatus;
}
function providerVipType(provider, status) {
  status = status || platformStatus(provider) || {};
  return Number(status.vipType || status.vip_type || status.vip || status.isVip || status.is_vip || 0) || 0;
}
function providerVipLevel(provider, status) {
  status = status || platformStatus(provider) || {};
  var raw = String(status.vipLevel || status.vip_level || '').toLowerCase();
  if (raw === 'svip' || raw === 'vip' || raw === 'none') return raw;
  var vip = providerVipType(provider, status);
  if (provider === 'netease') {
    if (status.isSvip || status.is_svip || vip >= 10) return 'svip';
    if (status.isVip || status.is_vip || vip > 0) return 'vip';
    return 'none';
  }
  return vip > 0 ? 'vip' : 'none';
}
function hasProviderVip(provider, status) {
  return providerVipLevel(provider, status) !== 'none';
}
function hasProviderSvip(provider, status) {
  return provider === 'netease' && providerVipLevel(provider, status) === 'svip';
}
function providerVipBadge(provider, status, idAttr) {
  if (!hasProviderVip(provider, status)) return '';
  var id = idAttr ? ' id="' + idAttr + '"' : '';
  var cls = 'top-account-vip' + (provider === 'qq' ? ' qq' : '');
  var level = providerVipLevel(provider, status);
  var label = provider === 'qq' ? 'QQ VIP' : (level === 'svip' ? 'SVIP' : 'VIP');
  return '<span' + id + ' class="' + cls + '">' + label + '</span>';
}
function hasPlatformLogin(provider) {
  var st = platformStatus(provider);
  return !!(st && st.loggedIn);
}
function hasAnyPlatformLogin() {
  return hasPlatformLogin('netease') || hasPlatformLogin('qq');
}
function firstLoggedProvider() {
  if (hasPlatformLogin(activeAccountProvider)) return activeAccountProvider;
  if (hasPlatformLogin('netease')) return 'netease';
  if (hasPlatformLogin('qq')) return 'qq';
  return 'netease';
}
function providerAvatarSrc(provider, status) {
  status = status || platformStatus(provider) || {};
  if (status.avatar) return avatarSrc(status.avatar);
  var meta = platformMeta(provider);
  var fill = provider === 'qq' ? '#bfd66b' : '#d95b67';
  var bg = provider === 'qq' ? '#11150b' : '#180b0f';
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="48" fill="' + bg + '"/><circle cx="48" cy="48" r="34" fill="' + fill + '" opacity=".16"/><text x="48" y="56" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" font-weight="700" fill="' + fill + '">' + meta.short + '</text></svg>';
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
}
function renderTopAccountPill(provider) {
  var st = platformStatus(provider);
  if (!st || !st.loggedIn) return '';
  var meta = platformMeta(provider);
  var displayName = (provider === 'qq' && st.preview) ? '待接入' : (st.nickname || meta.label);
  var vipTag = providerVipBadge(provider, st);
  return '<span class="top-account-pill">' +
    '<img src="' + providerAvatarSrc(provider, st) + '" alt="">' +
    '<span class="top-account-name">' + escHtml(displayName) + '</span>' +
    vipTag +
  '</span>';
}
async function refreshLoginStatus(force) {
  try {
    var info = await apiJson('/api/login/status?t=' + Date.now());
    loginStatusChecked = true;
    loginStatusCheckFailed = false;
    loginStatus = info || { loggedIn: false };
    if (loginStatus.loggedIn && !hasPlatformLogin(activeAccountProvider)) activeAccountProvider = 'netease';
    renderUserBtn();
    if (info && info.loggedIn) {
      homeDiscoverState.loaded = false;
      homeDiscoverState.loggedIn = true;
      refreshUserPlaylists(true);
      loadHomeDiscover(true);
      syncLikeStatusForSongs(playQueue.concat(playlist || []));
    } else {
      userPlaylists = qqPlaylists.slice();
      myPodcastCollections = [];
      myPodcastItems = {};
      likedSongMap = {};
      updateLikeButtons();
    }
    return info;
  } catch (e) {
    console.warn(e);
    loginStatusChecked = true;
    loginStatusCheckFailed = true;
    renderUserBtn();
    return null;
  }
}
function normalizeQQLoginStatus(info) {
  var fallback = { provider: 'qq', loggedIn: false, preview: false, nickname: 'QQ 音乐', userId: '', avatar: '', vipType: 0, stale: false, playbackKeyReady: false };
  if (!info || !info.loggedIn) return Object.assign({}, fallback, info || {}, {
    provider: 'qq',
    loggedIn: false,
    nickname: info && info.nickname || fallback.nickname,
    userId: info && (info.userId || info.uin) || '',
    avatar: info && info.avatar || '',
    vipType: Number(info && (info.vipType || info.vip_type) || 0) || 0,
    stale: !!(info && info.stale)
  });
  return Object.assign({}, fallback, info, {
    provider: 'qq',
    loggedIn: true,
    nickname: info.nickname || fallback.nickname,
    userId: info.userId || info.uin || '',
    avatar: info.avatar || '',
    vipType: Number(info.vipType || info.vip_type || 0) || 0,
    playbackKeyReady: !!info.playbackKeyReady,
    stale: !!info.stale || !!(info.profileUnavailable && !(info.nickname && info.avatar))
  });
}
async function refreshQQLoginStatus() {
  try {
    var info = await apiJson('/api/qq/login/status?t=' + Date.now());
    var prevLogged = !!qqLoginStatus.loggedIn;
    qqLoginStatus = normalizeQQLoginStatus(info);
    if (!qqLoginStatus.loggedIn) {
      if (prevLogged || qqLoginWasLoggedIn) showToast(qqLoginStatus.stale ? 'QQ 音乐登录已失效' : 'QQ 音乐已掉登录');
      qqPlaylists = [];
      userPlaylists = userPlaylists.filter(function(pl){ return pl.provider !== 'qq'; });
      homeDiscoverState.loaded = false;
    } else if (!userPlaylists.some(function(pl){ return pl && pl.provider === 'qq'; })) {
      homeDiscoverState.loaded = false;
      homeDiscoverState.loggedIn = true;
      loadHomeDiscover(true);
      refreshUserPlaylists(true);
    } else if (qqLoginStatus.stale) {
      showToast('QQ 音乐登录状态可能已失效');
    }
    qqLoginWasLoggedIn = !!qqLoginStatus.loggedIn;
    if (!hasPlatformLogin(activeAccountProvider)) activeAccountProvider = firstLoggedProvider();
    renderUserBtn();
    return qqLoginStatus;
  } catch (e) {
    console.warn('QQ login status failed:', e);
    qqLoginStatus = normalizeQQLoginStatus(null);
    renderUserBtn();
    return qqLoginStatus;
  }
}
function startQQLoginStatusAutoRefresh() {
  if (qqLoginAutoRefreshTimer) clearInterval(qqLoginAutoRefreshTimer);
  qqLoginAutoRefreshTimer = setInterval(function(){
    refreshQQLoginStatus().catch(function(e){ console.warn('QQ login auto refresh failed:', e); });
  }, 45000);
}
function renderUserBtn() {
  var btn = document.getElementById('user-btn');
  if (!btn) return;
  btn.classList.remove('multi-account');
  if (dualAccountMode && hasAnyPlatformLogin()) {
    activeAccountProvider = firstLoggedProvider();
    btn.classList.add('logged-in', 'multi-account');
    btn.classList.remove('logged-out');
    btn.title = '账号信息 · 双平台登录状态';
    btn.innerHTML = renderTopAccountPill('netease') + renderTopAccountPill('qq');
  } else if (hasAnyPlatformLogin()) {
    activeAccountProvider = firstLoggedProvider();
    var st = platformStatus(activeAccountProvider);
    var meta = platformMeta(activeAccountProvider);
    btn.classList.add('logged-in');
    btn.classList.remove('logged-out');
    btn.title = dualAccountMode ? '账号信息 · 已启用双平台展示' : ((st.nickname || meta.label) + ' · 账号信息');
    btn.innerHTML = '<img id="user-avatar" src="' + providerAvatarSrc(activeAccountProvider, st) + '">' +
                    '<span>' + escHtml(st.nickname || meta.label) + '</span>' +
                    providerVipBadge(activeAccountProvider, st, 'user-vip-tag');
  } else {
    btn.classList.remove('logged-in');
    btn.classList.add('logged-out');
    btn.title = '登录账号';
    btn.innerHTML = '<span class="login-word">登录</span>';
  }
  updatePlaybackQualityUi();
}
async function showLoginModal(opts) {
  opts = opts || {};
  if (opts.provider) loginProvider = opts.provider === 'qq' ? 'qq' : 'netease';
  var modal = document.getElementById('login-modal');
  openGsapModal(modal);
  updateLoginProviderUi();
  await refreshQr();
}
function closeLoginModal() {
  stopQrPoll();
  closeGsapModal(document.getElementById('login-modal'));
}
function setLoginProvider(provider, silent) {
  loginProvider = provider === 'qq' ? 'qq' : 'netease';
  updateLoginProviderUi();
  if (!silent && document.getElementById('login-modal').classList.contains('show')) refreshQr();
}
function updateLoginProviderUi() {
  var meta = platformMeta(loginProvider);
  var isQQ = loginProvider === 'qq';
  var title = document.getElementById('login-modal-title');
  var desc = document.getElementById('login-modal-desc');
  var shell = document.getElementById('qr-shell');
  var st = document.getElementById('qr-status');
  var refreshBtn = document.getElementById('refresh-qr-btn');
  var qqPanel = document.getElementById('qq-cookie-panel');
  var qqCookieToggle = document.getElementById('qq-cookie-toggle-btn');
  var qqCard = document.getElementById('qq-web-login-card');
  var neteaseBtn = document.getElementById('login-provider-netease');
  var qqBtn = document.getElementById('login-provider-qq');
  var canOpenNeteaseWeb = !!(window.desktopWindow && typeof window.desktopWindow.openNeteaseMusicLogin === 'function');
  if (neteaseBtn) neteaseBtn.classList.toggle('active', loginProvider === 'netease');
  if (qqBtn) qqBtn.classList.toggle('active', isQQ);
  if (title) title.textContent = '扫码登录' + meta.label;
  if (desc) desc.innerHTML = isQQ
    ? '打开 <b>QQ 音乐官方网页登录窗口</b> 扫码，成功后会自动同步账号会话。'
    : (canOpenNeteaseWeb
      ? '打开 <b>网易云音乐官方网页登录窗口</b> 扫码，避开接口二维码风控；成功后会自动同步账号会话。'
      : '使用 <b>网易云音乐 App</b> 扫码，可同步歌单、红心与播客。');
  if (shell) {
    shell.classList.toggle('web-login-preview', isQQ || canOpenNeteaseWeb);
    shell.classList.toggle('qq-preview', isQQ);
    shell.classList.toggle('netease-preview', !isQQ && canOpenNeteaseWeb);
  }
  if (qqPanel) qqPanel.classList.toggle('show', isQQ && qqManualCookieOpen);
  if (qqCookieToggle) {
    qqCookieToggle.classList.toggle('show', isQQ);
    qqCookieToggle.textContent = qqManualCookieOpen ? '收起导入' : '手动导入';
  }
  if (qqCard) {
    qqCard.disabled = isQQ ? !!qqWebLoginBusy : !!neteaseWebLoginBusy;
    var cardMark = qqCard.querySelector('b');
    var cardLabel = qqCard.querySelector('span');
    if (cardMark) cardMark.textContent = isQQ ? 'QQ' : 'NE';
    if (cardLabel) cardLabel.textContent = isQQ
      ? (qqWebLoginBusy ? '等待扫码确认' : '打开官方扫码窗口')
      : (neteaseWebLoginBusy ? '等待扫码确认' : '打开官方登录窗口');
  }
  if (st) {
    st.className = isQQ ? 'preview' : '';
    st.textContent = isQQ
      ? (qqLoginStatus.loggedIn ? ('已保存 QQ 音乐会话 · ' + (qqLoginStatus.nickname || '')) : '点击“扫码登录”打开 QQ 音乐官方窗口')
      : (canOpenNeteaseWeb ? '点击“网页登录”打开网易云官方窗口' : '正在生成二维码…');
  }
  if (refreshBtn) {
    refreshBtn.disabled = isQQ ? !!qqWebLoginBusy : !!neteaseWebLoginBusy;
    refreshBtn.textContent = isQQ ? (qqWebLoginBusy ? '等待扫码…' : '扫码登录') : (canOpenNeteaseWeb ? (neteaseWebLoginBusy ? '等待扫码…' : '网页登录') : '刷新二维码');
    refreshBtn.onclick = isQQ ? openQQWebLogin : (canOpenNeteaseWeb ? openNeteaseWebLogin : refreshQr);
  }
}
async function refreshQr() {
  stopQrPoll();
  updateLoginProviderUi();
  if (loginProvider === 'qq') {
    qrKey = null;
    var qqStatus = document.getElementById('qr-status');
    var qqImg = document.getElementById('qr-img');
    if (qqImg) qqImg.src = '';
    var info = await refreshQQLoginStatus();
    if (qqStatus) {
      qqStatus.textContent = info && info.loggedIn ? ('已保存 QQ 音乐会话 · ' + (info.nickname || '')) : '点击“扫码登录”打开 QQ 音乐官方窗口';
      qqStatus.className = 'preview';
    }
    return;
  }
  if (window.desktopWindow && typeof window.desktopWindow.openNeteaseMusicLogin === 'function') {
    qrKey = null;
    var neImg = document.getElementById('qr-img');
    var neStatus = document.getElementById('qr-status');
    if (neImg) neImg.src = '';
    if (neStatus) {
      neStatus.textContent = loginStatus.loggedIn ? ('已保存网易云会话 · ' + (loginStatus.nickname || '')) : '点击“网页登录”打开网易云官方窗口';
      neStatus.className = 'preview';
    }
    return;
  }
  try {
    var k = await apiJson('/api/login/qr/key');
    if (!k.key) throw new Error('获取 key 失败');
    qrKey = k.key;
    var q = await apiJson('/api/login/qr/create?key=' + encodeURIComponent(qrKey));
    if (!q.img) throw new Error('生成二维码失败');
    document.getElementById('qr-img').src = q.img;
    document.getElementById('qr-status').textContent = '请使用网易云音乐 App 扫码';
    startQrPoll();
  } catch (e) {
    document.getElementById('qr-status').textContent = '出错: ' + e.message;
    document.getElementById('qr-status').className = 'fail';
  }
}
function startQrPoll() { if (qrPollTimer) clearInterval(qrPollTimer); qrPollTimer = setInterval(checkQr, 2000); }
function stopQrPoll() { if (qrPollTimer) { clearInterval(qrPollTimer); qrPollTimer = null; } }
function toggleQQCookiePanel() {
  qqManualCookieOpen = !qqManualCookieOpen;
  updateLoginProviderUi();
}
function openProviderWebLogin() {
  if (loginProvider === 'qq') return openQQWebLogin();
  return openNeteaseWebLogin();
}
async function openNeteaseWebLogin() {
  if (neteaseWebLoginBusy) return;
  var statusEl = document.getElementById('qr-status');
  var api = window.desktopWindow;
  if (!api || !api.isDesktop || typeof api.openNeteaseMusicLogin !== 'function') {
    if (statusEl) { statusEl.textContent = '当前环境不支持官方网页登录，正在尝试旧二维码…'; statusEl.className = 'fail'; }
    return refreshQr();
  }

  neteaseWebLoginBusy = true;
  updateLoginProviderUi();
  if (statusEl) { statusEl.textContent = '已打开网易云窗口，请在官方页面扫码登录…'; statusEl.className = 'preview'; }
  try {
    var result = await api.openNeteaseMusicLogin();
    if (!result || !result.ok || !result.cookie) {
      throw new Error((result && (result.message || result.error)) || '网易云登录未完成');
    }
    if (statusEl) { statusEl.textContent = '正在同步网易云会话…'; statusEl.className = 'preview'; }
    var info = await apiJson('/api/login/cookie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie: result.cookie })
    });
    if (!info || !info.loggedIn) throw new Error((info && (info.message || info.error)) || '网易云会话不可用');
    loginStatus = info;
    activeAccountProvider = 'netease';
    renderUserBtn();
    refreshUserPlaylists(true);
    loadHomeDiscover(true);
    if (statusEl) { statusEl.textContent = '网易云会话已保存'; statusEl.className = 'scan'; }
    setTimeout(function(){
      closeLoginModal();
      showToast('网易云已登录: ' + (info.nickname || info.userId || ''));
    }, 420);
  } catch (e) {
    neteaseWebLoginBusy = false;
    updateLoginProviderUi();
    if (statusEl) { statusEl.textContent = e && e.message ? e.message : '网易云登录失败'; statusEl.className = 'fail'; }
  } finally {
    if (neteaseWebLoginBusy) {
      neteaseWebLoginBusy = false;
      updateLoginProviderUi();
    }
  }
}
async function openQQWebLogin() {
  if (qqWebLoginBusy) return;
  var statusEl = document.getElementById('qr-status');
  var api = window.desktopWindow;
  if (!api || !api.isDesktop || typeof api.openQQMusicLogin !== 'function') {
    qqManualCookieOpen = true;
    updateLoginProviderUi();
    if (statusEl) { statusEl.textContent = '当前环境不支持自动网页登录，可先使用手动导入。'; statusEl.className = 'fail'; }
    return;
  }

  qqWebLoginBusy = true;
  updateLoginProviderUi();
  if (statusEl) { statusEl.textContent = '已打开 QQ 音乐窗口，请扫码并确认登录…'; statusEl.className = 'preview'; }
  try {
    var result = await api.openQQMusicLogin();
    if (!result || !result.ok || !result.cookie) {
      throw new Error((result && (result.message || result.error)) || 'QQ 登录未完成');
    }
    if (statusEl) { statusEl.textContent = '正在同步 QQ 音乐会话…'; statusEl.className = 'preview'; }
    var info = await apiJson('/api/qq/login/cookie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie: result.cookie })
    });
    if (!info || !info.loggedIn) throw new Error((info && (info.message || info.error)) || 'QQ 会话不可用');
    qqLoginStatus = info;
    activeAccountProvider = 'qq';
    qqManualCookieOpen = false;
    renderUserBtn();
    refreshUserPlaylists(true);
    var qqPlaybackReady = !!info.playbackKeyReady && !result.partial;
    if (statusEl) { statusEl.textContent = qqPlaybackReady ? 'QQ 音乐会话已保存' : 'QQ 账号已同步，播放授权不完整，部分歌曲会自动换源'; statusEl.className = 'scan'; }
    setTimeout(function(){
      closeLoginModal();
      showToast((qqPlaybackReady ? 'QQ 音乐已登录: ' : 'QQ 账号已同步: ') + (info.nickname || info.userId || ''));
    }, 420);
  } catch (e) {
    qqWebLoginBusy = false;
    updateLoginProviderUi();
    if (statusEl) { statusEl.textContent = e && e.message ? e.message : 'QQ 登录失败'; statusEl.className = 'fail'; }
  } finally {
    if (qqWebLoginBusy) {
      qqWebLoginBusy = false;
      updateLoginProviderUi();
    }
  }
}
async function submitQQCookieLogin() {
  if (qqCookieBusy) return;
  var input = document.getElementById('qq-cookie-input');
  var statusEl = document.getElementById('qr-status');
  var saveBtn = document.getElementById('qq-cookie-save-btn');
  var cookie = input ? input.value.trim() : '';
  if (!cookie) {
    if (statusEl) { statusEl.textContent = '先粘贴 QQ 音乐 cookie'; statusEl.className = 'fail'; }
    return;
  }
  qqCookieBusy = true;
  if (saveBtn) saveBtn.classList.add('busy');
  if (statusEl) { statusEl.textContent = '正在保存 QQ 会话…'; statusEl.className = 'preview'; }
  try {
    var info = await apiJson('/api/qq/login/cookie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie: cookie })
    });
    if (!info || !info.loggedIn) throw new Error((info && (info.message || info.error)) || 'QQ 会话不可用');
    qqLoginStatus = info;
    activeAccountProvider = 'qq';
    if (input) input.value = '';
    renderUserBtn();
    refreshUserPlaylists(true);
    var manualQQPlaybackReady = !!info.playbackKeyReady;
    if (statusEl) { statusEl.textContent = manualQQPlaybackReady ? 'QQ 音乐会话已保存' : 'QQ 账号已同步，播放授权不完整，部分歌曲会自动换源'; statusEl.className = 'scan'; }
    setTimeout(function(){
      closeLoginModal();
      showToast((manualQQPlaybackReady ? 'QQ 音乐已登录: ' : 'QQ 账号已同步: ') + (info.nickname || info.userId || ''));
    }, 420);
  } catch (e) {
    if (statusEl) { statusEl.textContent = e && e.message ? e.message : 'QQ 会话保存失败'; statusEl.className = 'fail'; }
  } finally {
    qqCookieBusy = false;
    if (saveBtn) saveBtn.classList.remove('busy');
  }
}
async function checkQr() {
  if (!qrKey) return;
  try {
    var r = await apiJson('/api/login/qr/check?key=' + encodeURIComponent(qrKey));
    var $st = document.getElementById('qr-status');
    if (r.code === 800) { $st.textContent = '二维码已过期, 请刷新'; $st.className = 'fail'; stopQrPoll(); }
    else if (r.code === 801) { $st.textContent = '请在 App 中扫码'; $st.className = ''; }
    else if (r.code === 802) { $st.textContent = '已扫码, 请在手机确认…'; $st.className = 'scan'; }
    else if (r.code === 803 && (r.loggedIn || r.hasCookie)) {
      $st.textContent = r.pendingProfile ? '登录成功，正在同步账号资料…' : '登录成功！'; $st.className = 'scan';
      stopQrPoll();
      loginStatus = r.loggedIn ? r : Object.assign({}, r, { loggedIn: true, pendingProfile: true, nickname: r.nickname || '网易云用户' });
      activeAccountProvider = 'netease';
      renderUserBtn();
      setTimeout(async function(){
        var fresh = await refreshLoginStatus(true);
        if (!fresh || !fresh.loggedIn) {
          loginStatus = Object.assign({}, loginStatus, { loggedIn: true, pendingProfile: true });
          renderUserBtn();
          fresh = loginStatus;
        }
        closeLoginModal();
        showToast('欢迎 ' + (fresh && fresh.nickname ? fresh.nickname : ''));
      }, r.pendingProfile ? 1200 : 500);
    } else if (r.code === 803) {
      $st.textContent = '扫码已确认，但没有拿到登录凭证，请刷新二维码重试'; $st.className = 'fail';
      stopQrPoll();
    }
  } catch (e) { console.warn(e); }
}
function updateUserModalUi() {
  activeAccountProvider = firstLoggedProvider();
  var st = platformStatus(activeAccountProvider);
  var meta = platformMeta(activeAccountProvider);
  var chip = document.getElementById('account-provider-chip');
  var avatar = document.getElementById('user-modal-avatar');
  var name = document.getElementById('user-modal-name');
  var vipEl = document.getElementById('user-modal-vip');
  var hint = document.getElementById('account-hint');
  var logoutBtn = document.getElementById('account-logout-btn');
  var addNetease = document.getElementById('account-add-netease');
  var addQQ = document.getElementById('account-add-qq');
  if (chip) {
    chip.className = 'account-provider-chip ' + activeAccountProvider;
    chip.innerHTML = '<span class="account-source-dot ' + meta.dot + '"></span><span>' + meta.label + '</span>';
  }
  if (avatar) avatar.src = providerAvatarSrc(activeAccountProvider, st);
  if (name) name.textContent = (st && st.nickname) || meta.label;
  if (vipEl) {
    if (activeAccountProvider === 'netease') {
      var neVipLevel = providerVipLevel('netease', st);
      var vipLabel = neVipLevel === 'svip' ? '网易云 SVIP' : (neVipLevel === 'vip' ? '网易云 VIP' : '普通用户');
      vipEl.textContent = 'UID: ' + ((st && st.userId) || '-') + '  ·  ' + vipLabel;
      vipEl.style.color = hasProviderVip('netease', st) ? 'rgba(244,210,138,0.86)' : 'rgba(255,255,255,0.5)';
    } else {
      var qqVipLabel = hasProviderVip('qq', st) ? 'QQ VIP 会员' : 'QQ 音乐会话';
      vipEl.textContent = 'UID: ' + ((st && st.userId) || '-') + '  ·  ' + qqVipLabel;
      vipEl.style.color = hasProviderVip('qq', st) ? 'rgba(0,245,212,0.82)' : 'rgba(0,245,212,0.58)';
    }
  }
  ['netease','qq','both'].forEach(function(key){
    var btn = document.getElementById('user-provider-' + key);
    if (btn) btn.classList.toggle('active', key === 'both' ? dualAccountMode : (!dualAccountMode && activeAccountProvider === key));
  });
  if (addNetease) addNetease.style.display = hasPlatformLogin('netease') ? 'none' : '';
  if (addQQ) addQQ.textContent = hasPlatformLogin('qq') ? '查看 QQ 音乐' : '补登 QQ 音乐';
  if (logoutBtn) logoutBtn.textContent = activeAccountProvider === 'qq' ? '退出 QQ 音乐' : '退出网易云';
  if (hint) hint.textContent = dualAccountMode
    ? '右上角已切换为双平台并排展示。'
    : '可切换右上角展示的平台；“我两个都要”会并排放两个登录状态。';
}
function showUserModal() {
  if (!hasAnyPlatformLogin()) return showLoginModal();
  updateUserModalUi();
  openGsapModal(document.getElementById('user-modal'));
}
function closeUserModal() { closeGsapModal(document.getElementById('user-modal')); }
function setActiveAccountProvider(provider) {
  provider = provider === 'qq' ? 'qq' : 'netease';
  if (!hasPlatformLogin(provider)) {
    openProviderLogin(provider);
    return;
  }
  activeAccountProvider = provider;
  dualAccountMode = false;
  renderUserBtn();
  updateUserModalUi();
}
function enableDualAccountView() {
  if (!hasPlatformLogin('netease') && !hasPlatformLogin('qq')) {
    openProviderLogin('netease');
    return;
  }
  if (!hasPlatformLogin('netease')) {
    openProviderLogin('netease');
    return;
  }
  if (!hasPlatformLogin('qq')) {
    openProviderLogin('qq');
    return;
  }
  dualAccountMode = true;
  renderUserBtn();
  updateUserModalUi();
  showToast('已启用双平台账号展示');
}
function requestDualLoginMode() {
  enableDualAccountView();
}
function openProviderLogin(provider) {
  provider = provider === 'qq' ? 'qq' : 'netease';
  closeUserModal();
  loginProvider = provider;
  showLoginModal({ provider: provider });
}
async function logoutActiveAccount() {
  if (activeAccountProvider === 'qq') {
    try { await apiJson('/api/qq/logout'); } catch (e) {}
    try {
      if (window.desktopWindow && typeof window.desktopWindow.clearQQMusicLogin === 'function') {
        await window.desktopWindow.clearQQMusicLogin();
      }
    } catch (e) {}
    qqLoginStatus = { provider: 'qq', loggedIn: false, preview: false, nickname: 'QQ 音乐', userId: '', avatar: '', vipType: 0 };
    qqPlaylists = [];
    userPlaylists = userPlaylists.filter(function(pl){ return pl.provider !== 'qq'; });
    dualAccountMode = false;
    activeAccountProvider = firstLoggedProvider();
    renderUserBtn();
    if (hasAnyPlatformLogin()) updateUserModalUi();
    else closeUserModal();
    showToast('已退出 QQ 音乐');
    return;
  }
  doLogout();
}
async function doLogout() {
  await apiJson('/api/logout');
  try {
    if (window.desktopWindow && typeof window.desktopWindow.clearNeteaseMusicLogin === 'function') {
      await window.desktopWindow.clearNeteaseMusicLogin();
    }
  } catch (e) {}
  loginStatus = { loggedIn: false };
  if (!hasPlatformLogin('netease') || !hasPlatformLogin('qq')) dualAccountMode = false;
  activeAccountProvider = firstLoggedProvider();
  userPlaylists = qqPlaylists.slice();
  myPodcastCollections = [];
  myPodcastItems = {};
  likedSongMap = {};
  closeCollectModal();
  updateLikeButtons();
  safeRenderQueuePanel('logout', { scrollCurrent: miniQueueOpen });
  renderUserBtn();
  safeShelfRebuild('logout');
  closeUserModal();
  showToast('已退出登录');
}
var startupLoginGuideShown = false;
var loginGuideAnimating = false;
var loginGuideRaf = null;
function runLoginGuideParticles(done) {
  var canvas = document.getElementById('login-guide-canvas');
  if (!canvas || reduceSplashMotion) {
    if (done) setTimeout(done, 120);
    return;
  }
  if (loginGuideAnimating) {
    if (done) setTimeout(done, 720);
    return;
  }
  loginGuideAnimating = true;
  document.body.classList.add('login-guide-active');
  var ctx = canvas.getContext('2d');
  var dpr = Math.min(window.devicePixelRatio || 1, 1.8);
  var w = window.innerWidth, h = window.innerHeight;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  var cx = w * 0.5;
  var cy = h * 0.5 - 10;
  var maxR = Math.max(w, h);
  var particles = [];
  for (var i = 0; i < 92; i++) {
    var ang = Math.random() * Math.PI * 2;
    var ring = maxR * (0.30 + Math.random() * 0.35);
    var arcBias = Math.random() < 0.42 ? Math.PI * 0.5 : 0;
    particles.push({
      sx: cx + Math.cos(ang + arcBias) * ring + (Math.random() - 0.5) * 80,
      sy: cy + Math.sin(ang) * ring * 0.72 + (Math.random() - 0.5) * 80,
      tx: cx + (Math.random() - 0.5) * 172,
      ty: cy + (Math.random() - 0.5) * 172,
      r: 0.8 + Math.random() * 1.9,
      delay: Math.random() * 0.22,
      hue: Math.random(),
      spin: Math.random() * Math.PI * 2
    });
  }
  var started = performance.now();
  var duration = 1050;
  if (loginGuideRaf) cancelAnimationFrame(loginGuideRaf);
  function draw(now) {
    var raw = Math.min(1, (now - started) / duration);
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    var centerPulse = Math.sin(Math.PI * raw);
    var halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.28);
    halo.addColorStop(0, 'rgba(255,255,255,' + (0.060 * centerPulse) + ')');
    halo.addColorStop(0.55, 'rgba(255,255,255,' + (0.026 * centerPulse) + ')');
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h);

    for (var j = 0; j < particles.length; j++) {
      var p = particles[j];
      var lt = Math.max(0, Math.min(1, (raw - p.delay) / (1 - p.delay)));
      var e = 1 - Math.pow(1 - lt, 3);
      var wobble = Math.sin(lt * Math.PI * 2 + p.spin) * (1 - lt) * 18;
      var x = p.sx + (p.tx - p.sx) * e + Math.cos(p.spin) * wobble;
      var y = p.sy + (p.ty - p.sy) * e + Math.sin(p.spin) * wobble * 0.6;
      var alpha = Math.sin(Math.PI * lt) * (0.18 + p.hue * 0.18);
      if (alpha <= 0) continue;
      var warm = false;
      ctx.beginPath();
      ctx.arc(x, y, p.r * (0.75 + lt * 0.45), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,' + alpha + ')';
      ctx.fill();
      if (lt > 0.08 && lt < 0.92) {
        var tx = p.sx + (p.tx - p.sx) * Math.max(0, e - 0.045);
        var ty = p.sy + (p.ty - p.sy) * Math.max(0, e - 0.045);
        ctx.strokeStyle = 'rgba(255,255,255,' + (alpha * 0.20) + ')';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    }
    if (raw < 1) {
      loginGuideRaf = requestAnimationFrame(draw);
    } else {
      function finish() {
        ctx.clearRect(0, 0, w, h);
        document.body.classList.remove('login-guide-active');
        loginGuideAnimating = false;
        loginGuideRaf = null;
        if (done) done();
      }
      if (window.gsap) {
        window.gsap.to(canvas, { opacity: 0, duration: 0.28, ease: 'power2.out', onComplete: function(){
          finish();
          window.gsap.set(canvas, { clearProps: 'opacity' });
        }});
      } else {
        finish();
      }
    }
  }
  loginGuideRaf = requestAnimationFrame(draw);
}
function maybeRunStartupLoginGuide(source) {
  if (startupLoginGuideShown || loginGuideAnimating) return;
  if (visualGuideActive) return;
  if (document.body.classList.contains('splash-active')) return;
  if (immersiveMode) return;
  if (!loginStatusChecked || loginStatusCheckFailed || loginStatus.loggedIn || playing) return;
  var loginModal = document.getElementById('login-modal');
  var userModal = document.getElementById('user-modal');
  if ((loginModal && loginModal.classList.contains('show')) || (userModal && userModal.classList.contains('show'))) return;
  startupLoginGuideShown = true;
  setTimeout(function(){
    if (loginStatus.loggedIn || playing || immersiveMode || document.body.classList.contains('splash-active')) return;
    runLoginGuideParticles(function(){ showLoginModal({ guided: true, source: source || 'startup' }); });
  }, source === 'splash' ? 6200 : 2600);
}

// ============================================================
//  空场待机引导
// ============================================================
var idleGuideCanvas = null;
var idleGuideCtx = null;
var idleGuideW = 0, idleGuideH = 0, idleGuideDpr = 1;
var idleGuideParticles = [];
var idleGuideTrails = [[], [], [], []];
var idleGuideStartedAt = performance.now();
var idleGuideVisible = false;
var idleGuideLastFrameAt = performance.now();
var idleGuideDelayTimer = null;
// Keep Wallpaper as the only startup idle background.
var IDLE_GUIDE_BACKGROUND_ENABLED = false;
var idleGuideInteraction = {
  angle: 0,
  velocity: 0,
  rotX: -0.12,
  rotY: 0,
  spinX: 0,
  spinY: 0,
  zoom: 1,
  zoomTarget: 1,
  zoomPulse: 0,
  dragging: false,
  lastX: 0,
  lastY: 0,
  lastT: 0,
  pointerX: 0.5,
  pointerY: 0.5,
  pointerActive: false,
  focus: 0,
  press: 0,
  tiltX: 0,
  tiltY: 0
};
function setIdleGuideVisible(show, interactive) {
  document.body.classList.toggle('idle-guide-on', show);
  document.body.classList.toggle('idle-guide-interactive', !!interactive);
  if (!interactive) document.body.classList.remove('idle-guide-dragging');
  if (idleGuideVisible === show) return;
  idleGuideVisible = show;
}
function shouldShowIdleGuide() {
  if (!IDLE_GUIDE_BACKGROUND_ENABLED) return false;
  if (document.body.classList.contains('splash-active')) return false;
  if (immersiveMode) return false;
  if (playing) return false;
  if (loginGuideAnimating) return false;
  if (document.querySelector('.modal-mask.show')) return false;
  if (uniforms && uniforms.uHasCover && uniforms.uHasCover.value > 0.5) return false;
  return true;
}
function shouldShowShelfHoverCue(value) {
  if (document.body.classList.contains('splash-active')) return false;
  if (!shelfHoverCue.guide && document.querySelector('.modal-mask.show')) return false;
  if (!shelfHoverCue.guide) {
    if (shelfPinnedOpen) return false;
    if (!shelfManager || !shelfManager.canInteract || !shelfManager.canInteract()) return false;
    if (shelfManager.hasOpenContent && shelfManager.hasOpenContent()) return false;
    if (!shelfManager.getMode || shelfManager.getMode() !== 'side') return false;
  }
  return shelfHoverCue.guide || shelfHoverCue.target > 0 || (value || shelfHoverCue.value) > 0.015;
}
function shouldHandleIdleGuidePointer(e) {
  if (!idleGuideCanvas || !shouldShowIdleGuide()) return false;
  if (isPointerOverUi(e)) return false;
  return true;
}
function clampIdleGuideSpin(v) {
  if (!isFinite(v)) return 0;
  return Math.max(-4.8, Math.min(4.8, v));
}
function idleGuidePointerDown(e) {
  if (!shouldHandleIdleGuidePointer(e)) return;
  idleGuideInteraction.dragging = true;
  idleGuideInteraction.pointerActive = true;
  idleGuideInteraction.lastX = e.clientX;
  idleGuideInteraction.lastY = e.clientY;
  idleGuideInteraction.lastT = performance.now();
  idleGuideInteraction.pointerX = e.clientX / Math.max(1, idleGuideW || innerWidth);
  idleGuideInteraction.pointerY = e.clientY / Math.max(1, idleGuideH || innerHeight);
  document.body.classList.add('idle-guide-dragging');
}
function idleGuidePointerMove(e) {
  if (!idleGuideCanvas) return;
  var canReact = shouldHandleIdleGuidePointer(e) || idleGuideInteraction.dragging;
  idleGuideInteraction.pointerActive = canReact;
  if (canReact) {
    idleGuideInteraction.pointerX = e.clientX / Math.max(1, idleGuideW || innerWidth);
    idleGuideInteraction.pointerY = e.clientY / Math.max(1, idleGuideH || innerHeight);
  }
  if (!idleGuideInteraction.dragging) return;
  var now = performance.now();
  var dt = Math.max(1 / 120, Math.min(0.08, (now - idleGuideInteraction.lastT) / 1000 || 1 / 60));
  var dx = e.clientX - idleGuideInteraction.lastX;
  var dy = e.clientY - idleGuideInteraction.lastY;
  var rx = -dy * 0.0032;
  var ry = dx * 0.0034;
  idleGuideInteraction.rotX += rx;
  idleGuideInteraction.rotY += ry;
  idleGuideInteraction.angle += ry * 0.22;
  idleGuideInteraction.spinX = clampIdleGuideSpin(rx / dt * 0.46);
  idleGuideInteraction.spinY = clampIdleGuideSpin(ry / dt * 0.46);
  idleGuideInteraction.velocity = Math.sqrt(idleGuideInteraction.spinX * idleGuideInteraction.spinX + idleGuideInteraction.spinY * idleGuideInteraction.spinY);
  idleGuideInteraction.lastX = e.clientX;
  idleGuideInteraction.lastY = e.clientY;
  idleGuideInteraction.lastT = now;
}
function idleGuidePointerUp() {
  if (!idleGuideInteraction.dragging) return;
  idleGuideInteraction.dragging = false;
  document.body.classList.remove('idle-guide-dragging');
}
function idleGuidePointerLeave() {
  if (!idleGuideInteraction.dragging) idleGuideInteraction.pointerActive = false;
}
function idleGuideWheel(e) {
  if (!shouldHandleIdleGuidePointer(e)) return false;
  var guide = idleGuideInteraction;
  guide.pointerActive = true;
  guide.pointerX = e.clientX / Math.max(1, idleGuideW || innerWidth);
  guide.pointerY = e.clientY / Math.max(1, idleGuideH || innerHeight);
  var nextZoom = guide.zoomTarget * Math.exp(-e.deltaY * 0.0012);
  guide.zoomTarget = Math.max(0.58, Math.min(1.82, nextZoom));
  guide.zoomPulse = Math.min(1, guide.zoomPulse + Math.min(0.28, Math.abs(e.deltaY) * 0.0014));
  return true;
}
function resizeIdleGuideCanvas() {
  if (!idleGuideCanvas) return;
  idleGuideDpr = Math.min(window.devicePixelRatio || 1, 1.6);
  idleGuideW = window.innerWidth;
  idleGuideH = window.innerHeight;
  idleGuideCanvas.width = Math.max(1, Math.floor(idleGuideW * idleGuideDpr));
  idleGuideCanvas.height = Math.max(1, Math.floor(idleGuideH * idleGuideDpr));
  idleGuideCanvas.style.width = idleGuideW + 'px';
  idleGuideCanvas.style.height = idleGuideH + 'px';
  idleGuideCtx.setTransform(idleGuideDpr, 0, 0, idleGuideDpr, 0, 0);
  idleGuideParticles = [];
  resetIdleGuideTrails();
  if (!IDLE_GUIDE_BACKGROUND_ENABLED) return;
  var minDim = Math.min(idleGuideW, idleGuideH);
  var maxDim = Math.max(idleGuideW, idleGuideH);
  var count = idleGuideW < 800 ? 150 : 240;
  for (var i = 0; i < count; i++) {
    var ring = i < count * 0.76;
    var a = Math.random() * Math.PI * 2;
    var r = ring
      ? (minDim * 0.035 + Math.pow(Math.random(), 0.58) * minDim * 0.335)
      : (Math.pow(Math.random(), 0.82) * maxDim * 0.58);
    var wobbleAmp = minDim * (ring ? (0.012 + Math.random() * 0.035) : (0.010 + Math.random() * 0.055));
    idleGuideParticles.push({
      a: a,
      r: r,
      cx: ring ? 0.5 : Math.random(),
      cy: ring ? 0.5 : Math.random(),
      size: ring ? (0.30 + Math.random() * 0.62) : (0.18 + Math.random() * 0.44),
      speed: ((ring ? 0.018 : 0.010) + Math.random() * (ring ? 0.045 : 0.030)) * (Math.random() < 0.5 ? -1 : 1),
      phase: Math.random() * Math.PI * 2,
      wobbleAmp: wobbleAmp,
      wobbleSpeed: 0.18 + Math.random() * 0.76,
      oval: 0.56 + Math.random() * 0.36,
      zAmp: 0.34 + Math.random() * 0.82,
      driftX: (Math.random() * 2 - 1) * wobbleAmp * 0.75,
      driftY: (Math.random() * 2 - 1) * wobbleAmp * 0.75,
      layer: Math.random(),
      z: (Math.random() * 2 - 1) * (ring ? minDim * 0.28 : maxDim * 0.42),
      ring: ring
    });
  }
}
function projectIdleGuidePoint(x, y, z, rot, cx, cy, depth) {
  var x1 = x * rot.cy + z * rot.sy;
  var z1 = -x * rot.sy + z * rot.cy;
  var y1 = y * rot.cx - z1 * rot.sx;
  var z2 = y * rot.sx + z1 * rot.cx;
  var scale = depth / (depth - z2 * 0.72);
  scale = Math.max(0.52, Math.min(1.74, scale));
  return {
    x: cx + x1 * scale,
    y: cy + y1 * scale,
    z: z2,
    scale: scale
  };
}
function resetIdleGuideTrails() {
  idleGuideTrails = [[], [], [], []];
}
function pushIdleGuideTrail(index, pt, alpha, now) {
  var trail = idleGuideTrails[index];
  if (!trail) trail = idleGuideTrails[index] = [];
  var last = trail[trail.length - 1];
  var dx = last ? pt.x - last.x : 999;
  var dy = last ? pt.y - last.y : 999;
  if (!last || Math.sqrt(dx * dx + dy * dy) > 1.4 || now - last.t > 42) {
    trail.push({ x: pt.x, y: pt.y, scale: pt.scale || 1, alpha: alpha || 1, t: now });
  }
  while (trail.length > 26) trail.shift();
}
function drawIdleGuideTrail(ctx, trail, now, alpha, energy) {
  if (!trail || trail.length < 2) return;
  while (trail.length && now - trail[0].t > 680) trail.shift();
  if (trail.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (var i = 1; i < trail.length; i++) {
    var prev = trail[i - 1];
    var cur = trail[i];
    var age = (now - cur.t) / 680;
    var order = i / Math.max(1, trail.length - 1);
    var fade = Math.max(0, 1 - age) * order;
    if (fade <= 0) continue;
    ctx.strokeStyle = 'rgba(255,255,255,' + (alpha * fade * (0.18 + energy * 0.24)).toFixed(3) + ')';
    ctx.lineWidth = (0.7 + cur.scale * 0.9 + energy * 1.2) * fade;
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    var mx = (prev.x + cur.x) * 0.5;
    var my = (prev.y + cur.y) * 0.5;
    ctx.quadraticCurveTo(mx, my, cur.x, cur.y);
    ctx.stroke();
  }
  ctx.restore();
}
function scheduleIdleGuideFrame(delay) {
  if (idleGuideDelayTimer) {
    clearTimeout(idleGuideDelayTimer);
    idleGuideDelayTimer = null;
  }
  if (delay && delay > 0) {
    idleGuideDelayTimer = setTimeout(function(){
      idleGuideDelayTimer = null;
      requestAnimationFrame(drawIdleGuideFrame);
    }, delay);
  } else {
    requestAnimationFrame(drawIdleGuideFrame);
  }
}
function drawIdleGuideFrame() {
  if (!idleGuideCanvas || !idleGuideCtx) return;
  var ctx = idleGuideCtx;
  var nowFrame = performance.now();
  var dtFrame = Math.max(1 / 120, Math.min(0.05, (nowFrame - idleGuideLastFrameAt) / 1000 || 1 / 60));
  idleGuideLastFrameAt = nowFrame;
  var idleShow = shouldShowIdleGuide();
  var shelfCueValue = tickShelfHoverCue(dtFrame);
  var shelfCueShow = shouldShowShelfHoverCue(shelfCueValue);
  var show = idleShow || shelfCueShow;
  setIdleGuideVisible(show, idleShow);
  if (!show) {
    idleGuideCtx.clearRect(0, 0, idleGuideW, idleGuideH);
    resetIdleGuideTrails();
    scheduleIdleGuideFrame(140);
    return;
  }
  var t = (nowFrame - idleGuideStartedAt) / 1000;
  if (!idleShow) {
    ctx.clearRect(0, 0, idleGuideW, idleGuideH);
    resetIdleGuideTrails();
    ctx.globalCompositeOperation = 'lighter';
    drawShelfGuideCue(ctx, t, shelfCueValue);
    ctx.globalCompositeOperation = 'source-over';
    scheduleIdleGuideFrame(0);
    return;
  }
  var cx = idleGuideW * 0.5;
  var cy = idleGuideH * 0.50;
  var guide = idleGuideInteraction;
  if (!guide.dragging) {
    guide.rotX += guide.spinX * dtFrame;
    guide.rotY += guide.spinY * dtFrame;
    guide.spinX *= Math.pow(0.90, dtFrame * 60);
    guide.spinY *= Math.pow(0.90, dtFrame * 60);
    if (Math.abs(guide.spinX) < 0.01) guide.spinX = 0;
    if (Math.abs(guide.spinY) < 0.01) guide.spinY = 0;
  }
  guide.rotY += 0.012 * dtFrame;
  guide.angle += guide.spinY * dtFrame * 0.20 + 0.010 * dtFrame;
  guide.velocity = Math.sqrt(guide.spinX * guide.spinX + guide.spinY * guide.spinY);
  var targetFocus = guide.pointerActive ? 1 : 0;
  var targetPress = guide.dragging ? 1 : 0;
  guide.focus += (targetFocus - guide.focus) * 0.10;
  guide.press += (targetPress - guide.press) * 0.16;
  guide.zoom += (guide.zoomTarget - guide.zoom) * 0.13;
  guide.zoomPulse *= Math.pow(0.84, dtFrame * 60);
  if (guide.zoomPulse < 0.002) guide.zoomPulse = 0;
  guide.tiltX += (((guide.pointerX - 0.5) * 0.26) - guide.tiltX) * 0.08;
  guide.tiltY += (((guide.pointerY - 0.5) * 0.18) - guide.tiltY) * 0.08;
  ctx.clearRect(0, 0, idleGuideW, idleGuideH);
  ctx.globalCompositeOperation = 'lighter';

  var breathe = 0.5 + 0.5 * Math.sin(t * 0.72);
  var zoom = guide.zoom;
  var zoomBoost = guide.zoomPulse;
  var halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(idleGuideW, idleGuideH) * ((0.36 + breathe * 0.035 + guide.press * 0.018) * zoom));
  halo.addColorStop(0, 'rgba(255,255,255,' + (0.034 + breathe * 0.020 + guide.focus * 0.014 + guide.press * 0.018 + zoomBoost * 0.018).toFixed(3) + ')');
  halo.addColorStop(0.44, 'rgba(255,255,255,' + (0.014 + guide.focus * 0.010).toFixed(3) + ')');
  halo.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, idleGuideW, idleGuideH);

  var ringPts = [];
  var pointerX = guide.pointerX * idleGuideW;
  var pointerY = guide.pointerY * idleGuideH;
  var spinEnergy = Math.min(1, guide.velocity / 1.5 + guide.press * 0.42);
  var rot = {
    sx: Math.sin(guide.rotX),
    cx: Math.cos(guide.rotX),
    sy: Math.sin(guide.rotY),
    cy: Math.cos(guide.rotY)
  };
  var depth = Math.max(520, Math.min(idleGuideW, idleGuideH) * 0.92);
  for (var i = 0; i < idleGuideParticles.length; i++) {
    var p = idleGuideParticles[i];
    var localA = p.a + t * p.speed;
    var wanderA = p.phase + t * p.wobbleSpeed;
    var wobble = Math.sin(wanderA) * p.wobbleAmp + Math.sin(t * (p.wobbleSpeed * 0.57 + 0.11) + p.phase * 1.7) * p.wobbleAmp * 0.45;
    var x, y;
    var projected = null;
    var pointScale = 1;
    if (p.ring) {
      var rr = (p.r + wobble + breathe * 12) * zoom * (1 + guide.press * 0.030 + zoomBoost * 0.018);
      var baseX = Math.cos(localA) * rr + Math.sin(wanderA * 0.73) * p.wobbleAmp * 0.54 + p.driftX;
      var baseY = Math.sin(localA + Math.sin(wanderA) * 0.10) * rr * p.oval + Math.sin(t * 0.33 + p.phase) * p.wobbleAmp * 0.68 + p.driftY;
      var baseZ = (Math.sin(localA * 0.84 + p.phase * 0.31) * rr * p.zAmp + p.z * 0.54 + Math.cos(wanderA * 0.91) * p.wobbleAmp) * zoom;
      projected = projectIdleGuidePoint(baseX, baseY, baseZ, rot, cx, cy, depth);
      pointScale = projected.scale;
      x = projected.x + guide.tiltX * projected.z * 0.020;
      y = projected.y + guide.tiltY * projected.z * 0.018;
      var nDx = pointerX - x, nDy = pointerY - y;
      var near = guide.focus * Math.max(0, 1 - Math.sqrt(nDx * nDx + nDy * nDy) / 210);
      x += nDx * near * 0.040;
      y += nDy * near * 0.040;
      ringPts.push({ x:x, y:y, z:projected.z, scale:projected.scale, alpha:0.08 + breathe * 0.04 + near * 0.08 });
    } else {
      var driftX = ((p.cx - 0.5) * idleGuideW * 0.92 + Math.cos(localA) * (12 + p.wobbleAmp * 0.28) + wobble * 0.28) * zoom;
      var driftY = ((p.cy - 0.5) * idleGuideH * 0.72 + Math.sin(localA * 0.8 + p.phase * 0.2) * (12 + p.wobbleAmp * 0.24)) * zoom;
      var driftZ = (p.z + Math.sin(localA + p.phase) * (32 + p.wobbleAmp * 0.32)) * zoom;
      var fieldPt = projectIdleGuidePoint(driftX, driftY, driftZ, rot, cx, cy, depth * 1.16);
      pointScale = fieldPt.scale;
      x = fieldPt.x;
      y = fieldPt.y;
    }
    var depthGlow = p.ring && projected ? (0.66 + projected.scale * 0.20) : 1;
    var aP = p.ring ? ((0.070 + breathe * 0.065 + Math.sin(t * (0.8 + p.layer) + p.phase) * 0.024 + spinEnergy * 0.032) * depthGlow) : (0.034 + guide.focus * 0.010);
    ctx.beginPath();
    ctx.arc(x, y, p.size * pointScale * Math.sqrt(zoom) * (1 + spinEnergy * (p.ring ? 0.24 : 0.08) + zoomBoost * 0.12), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,' + Math.max(0, aP).toFixed(3) + ')';
    ctx.fill();
  }

  ctx.lineWidth = 1;
  for (var j = 0; j < ringPts.length; j += 3) {
    var aPt = ringPts[j];
    var bPt = ringPts[(j + 7) % ringPts.length];
    if (!aPt || !bPt) continue;
    var dx = aPt.x - bPt.x, dy = aPt.y - bPt.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > Math.min(idleGuideW, idleGuideH) * 0.17) continue;
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.018 + breathe * 0.020 + guide.focus * 0.012 + spinEnergy * 0.018).toFixed(3) + ')';
    ctx.beginPath();
    ctx.moveTo(aPt.x, aPt.y);
    ctx.lineTo(bPt.x, bPt.y);
    ctx.stroke();
  }

  if (guide.focus > 0.03 || spinEnergy > 0.05) {
    var orbitR = Math.min(idleGuideW, idleGuideH) * (0.305 + guide.press * 0.018) * zoom;
    var anchorAlpha = Math.min(0.68, 0.16 + guide.focus * 0.24 + spinEnergy * 0.38);
    for (var k = 0; k < 4; k++) {
      var anchorA = guide.angle + t * 0.08 + k * 1.72 + (k === 2 ? 0.38 : 0);
      var anchorPt = projectIdleGuidePoint(
        Math.cos(anchorA) * orbitR,
        Math.sin(anchorA) * orbitR * 0.52,
        Math.sin(anchorA + k * 0.54) * orbitR * 0.48,
        rot, cx, cy, depth
      );
      pushIdleGuideTrail(k, anchorPt, anchorAlpha, nowFrame);
      drawIdleGuideTrail(ctx, idleGuideTrails[k], nowFrame, anchorAlpha, spinEnergy);
      ctx.beginPath();
      ctx.arc(anchorPt.x, anchorPt.y, (2.0 + spinEnergy * 1.8 + (k === 0 ? guide.press * 1.8 : 0)) * anchorPt.scale, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,' + anchorAlpha.toFixed(3) + ')';
      ctx.fill();
    }
  }

  if (guide.focus > 0.03) {
    var handleA = guide.angle + t * 0.36;
    var handleR = Math.min(idleGuideW, idleGuideH) * (0.315 + breathe * 0.012 + guide.press * 0.012) * zoom;
    var handlePt = projectIdleGuidePoint(
      Math.cos(handleA) * handleR,
      Math.sin(handleA) * handleR * 0.52,
      Math.sin(handleA + 0.62) * handleR * 0.48,
      rot, cx, cy, depth
    );
    var hx = handlePt.x;
    var hy = handlePt.y;
    var handleGlow = ctx.createRadialGradient(hx, hy, 0, hx, hy, 28 + guide.press * 12);
    handleGlow.addColorStop(0, 'rgba(255,255,255,' + (0.22 * guide.focus + 0.16 * guide.press).toFixed(3) + ')');
    handleGlow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = handleGlow;
    ctx.beginPath();
    ctx.arc(hx, hy, 28 + guide.press * 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(hx, hy, 2.4 + guide.press * 1.6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,' + (0.54 * guide.focus + 0.24 * guide.press).toFixed(3) + ')';
    ctx.fill();
  }

  if (shelfCueShow) drawShelfGuideCue(ctx, t, shelfCueValue);
  ctx.globalCompositeOperation = 'source-over';
  scheduleIdleGuideFrame(0);
}
function idleRoundRect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  r = Math.min(r || 0, Math.abs(w) * 0.5, Math.abs(h) * 0.5);
  var x2 = x + w, y2 = y + h;
  ctx.moveTo(x + r, y);
  ctx.lineTo(x2 - r, y);
  ctx.quadraticCurveTo(x2, y, x2, y + r);
  ctx.lineTo(x2, y2 - r);
  ctx.quadraticCurveTo(x2, y2, x2 - r, y2);
  ctx.lineTo(x + r, y2);
  ctx.quadraticCurveTo(x, y2, x, y2 - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}
function drawShelfGuideCue(ctx, t, strength) {
  strength = Math.max(0, Math.min(1, strength == null ? shelfHoverCue.value : strength));
  if (strength <= 0.01) return;
  var r = shelfCueRect();
  var c = shelfCueCenter();
  var pulse = 0.5 + 0.5 * Math.sin(t * 1.55);
  var floatY = Math.sin(t * 0.92) * 8 * strength;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  var glow = ctx.createLinearGradient(r.left, 0, r.right, 0);
  glow.addColorStop(0, 'rgba(255,255,255,0)');
  glow.addColorStop(0.58, 'rgba(255,255,255,' + (0.010 * strength).toFixed(3) + ')');
  glow.addColorStop(0.82, 'rgba(244,210,138,' + (0.024 * strength + pulse * 0.012 * strength).toFixed(3) + ')');
  glow.addColorStop(1, 'rgba(255,255,255,' + (0.035 * strength).toFixed(3) + ')');
  ctx.fillStyle = glow;
  ctx.fillRect(r.left, r.top - 26, r.width + 18, r.height + 52);

  var halo = ctx.createRadialGradient(c.x + r.width * 0.18, c.y + floatY, 0, c.x + r.width * 0.18, c.y + floatY, r.width * 0.62);
  halo.addColorStop(0, 'rgba(244,210,138,' + (0.070 * strength + pulse * 0.026 * strength).toFixed(3) + ')');
  halo.addColorStop(0.45, 'rgba(255,255,255,' + (0.020 * strength).toFixed(3) + ')');
  halo.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(r.left, r.top - 40, r.width, r.height + 80);

  for (var i = 0; i < 10; i++) {
    var seed = i * 19.17;
    var phase = (t * (0.10 + (i % 4) * 0.014) + i * 0.113) % 1;
    var x = r.left + r.width * (0.45 + (i % 4) * 0.13) + Math.sin(t * 0.44 + seed) * 12;
    var y = r.top + r.height * (0.18 + ((i * 0.137 + Math.sin(seed)) % 0.64)) + floatY * (0.42 + (i % 3) * 0.10);
    var alpha = (0.035 + Math.sin(Math.PI * phase) * 0.050) * strength;
    if (alpha <= 0) continue;
    ctx.beginPath();
    ctx.arc(x, y, 0.9 + (i % 3) * 0.26 + pulse * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(244,210,138,' + alpha.toFixed(3) + ')';
    ctx.fill();
  }
  ctx.restore();
}
function initIdleGuideCanvas() {
  idleGuideCanvas = document.getElementById('idle-guide-canvas');
  if (!idleGuideCanvas) return;
  idleGuideCtx = idleGuideCanvas.getContext('2d');
  if (!idleGuideCtx) return;
  idleGuideStartedAt = performance.now();
  resizeIdleGuideCanvas();
  window.addEventListener('resize', resizeIdleGuideCanvas);
  drawIdleGuideFrame();
}

// ============================================================
//  toast
// ============================================================
var toastTimer = null;
function showToast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ t.classList.remove('show'); }, 2600);
}

var visualGuideSteps = [
  {
    target: 'stage',
    kicker: '01 / Welcome',
    title: 'Mineradio 是用来听歌的视觉播放器',
    body: '它不是单纯歌单页：搜索或导入一首歌后，封面、歌词、粒子和镜头会跟着音乐一起动。'
  },
  {
    selector: '#search-box',
    kicker: '02 / Play',
    title: '从搜索或导入开始',
    body: '输入歌名、歌手或关键词即可播放；如果有本地音乐，也可以用导入入口直接放进舞台。'
  },
  {
    selector: '#bottom-bar',
    kicker: '03 / Control',
    title: '播放以后看底部控制台',
    body: '播放、切歌、进度、队列和歌词都集中在底部，先把它当作一个正常播放器使用就可以。'
  },
  {
    selector: '#user-btn',
    kicker: '04 / Account',
    title: '登录只是为了同步你的音乐库',
    body: '登录后会同步歌单、红心和播客；不登录也可以搜索和播放，不会强制卡住你。'
  },
  {
    target: 'shelf',
    kicker: '05 / Visual',
    title: '进阶视觉都放在舞台周围',
    body: '右侧 3D 歌单架和 DIY 玩家模式是进阶入口；先播放一首歌，再慢慢调视觉效果。'
  },
  {
    selector: '#diy-mode-btn',
    kicker: '06 / DIY',
    title: '高级功能在 DIY 玩家模式',
    body: '视觉控制台、上传/封面、自定义歌词、音质和更多面板都会在这里展开。'
  }
];
var visualGuideStepsDiy = [
  {
    selector: '#diy-mode-btn',
    kicker: '01 / DIY',
    title: 'DIY 玩家模式已展开',
    body: '这里可以随时切回默认模式。DIY 模式会显示完整控制台、上传、视觉面板和高级调参。'
  },
  {
    selector: '#search-box',
    kicker: '02 / Search',
    title: '搜索源和导入入口会展开',
    body: '顶部搜索支持更多来源切换，上传歌曲、封面等入口也会在 DIY 模式中显示。'
  },
  {
    selector: '#playlist-panel',
    kicker: '03 / Library',
    title: '左侧是完整歌单和队列',
    body: '靠近左侧边缘可以打开歌单/队列面板，在这里管理队列、个人歌单和播客。'
  },
  {
    selector: '#fx-panel',
    kicker: '04 / Visual Lab',
    title: '右侧是视觉控制台',
    body: '靠近右下角或点击视觉按钮，可以调节粒子、歌词、镜头、3D 歌单架和更多视觉参数。'
  },
  {
    selector: '#quality-control',
    kicker: '05 / Controls',
    title: '高级播放控制会补全',
    body: '音质、播放顺序、收藏、歌词源和更多按钮会在 DIY 模式中完整显示。'
  },
  {
    target: 'shelf',
    kicker: '06 / Shelf',
    title: '3D 歌单架支持直接打开',
    body: '右侧的 3D 歌单架会在靠近时半透明浮现，点击卡片可打开歌单，点卡片里的播放按钮可直接播放整张歌单。'
  }
];
function activeVisualGuideSteps() {
  return diyPlayerMode ? visualGuideStepsDiy : visualGuideSteps;
}
function visualGuideWasSeen() {
  try { return localStorage.getItem(VISUAL_GUIDE_SEEN_STORE_KEY) === '1'; } catch (e) { return true; }
}
function markVisualGuideSeen() {
  try { localStorage.setItem(VISUAL_GUIDE_SEEN_STORE_KEY, '1'); } catch (e) {}
}
function maybeRunStartupVisualGuide(source) {
  if (visualGuideWasSeen() || visualGuideActive || immersiveMode || playing) return false;
  if (source !== 'manual' && !hasAnyPlatformLogin()) return false;
  setTimeout(function(){
    if (!visualGuideWasSeen() || source === 'manual') startVisualGuide({ source: source || 'startup' });
  }, source === 'splash' ? 3600 : 1400);
  return true;
}
function startVisualGuide(opts) {
  opts = opts || {};
  if (document.body.classList.contains('splash-active')) {
    setTimeout(function(){ startVisualGuide(opts); }, 700);
    return;
  }
  if (immersiveMode) setImmersiveMode(false);
  closeMiniQueue();
  closeUploadTip(false);
  visualGuideActive = true;
  document.body.classList.add('visual-guide-active');
  visualGuideStep = 0;
  visualGuideState = {
    bottomWasVisible: !!(document.getElementById('bottom-bar') && document.getElementById('bottom-bar').classList.contains('visible')),
    searchWasPeek: !!(document.getElementById('search-area') && document.getElementById('search-area').classList.contains('peek')),
    fxWasPeek: !!(document.getElementById('fx-panel') && document.getElementById('fx-panel').classList.contains('peek')),
    plWasPeek: !!(document.getElementById('playlist-panel') && document.getElementById('playlist-panel').classList.contains('peek')),
    mode: diyPlayerMode ? 'diy' : 'simple',
    manual: !!opts.manual
  };
  var guide = document.getElementById('visual-guide');
  if (guide) {
    guide.classList.add('show');
    guide.setAttribute('aria-hidden', 'false');
  }
  if (!visualGuideResizeBound) {
    visualGuideResizeBound = true;
    window.addEventListener('resize', positionVisualGuideStep);
    window.addEventListener('scroll', positionVisualGuideStep, true);
  }
  showVisualGuideStep(0);
}
function prepareVisualGuideStep(step) {
  var search = document.getElementById('search-area');
  var bottom = document.getElementById('bottom-bar');
  var fxPanel = document.getElementById('fx-panel');
  var playlistPanel = document.getElementById('playlist-panel');
  if (typeof setShelfGuideCueActive === 'function') setShelfGuideCueActive(step && step.target === 'shelf');
  if (step && step.selector === '#search-box') setPeek(search, true, 'search');
  if (step && step.selector === '#playlist-panel') setPeek(playlistPanel, true, 'pl');
  else if (playlistPanel && !visualGuideState.plWasPeek) setPeek(playlistPanel, false, 'pl');
  if (step && step.selector === '#fx-panel') setPeek(fxPanel, true, 'fx');
  else if (fxPanel && !visualGuideState.fxWasPeek) setPeek(fxPanel, false, 'fx');
  if (step && (step.selector === '#bottom-bar' || step.selector === '#mini-queue-btn' || step.selector === '#immersive-btn' || step.selector === '#quality-control')) {
    if (bottom) bottom.classList.add('visible');
    revealBottomControls(1500);
  }
}
function scheduleVisualGuidePositioning() {
  requestAnimationFrame(positionVisualGuideStep);
  setTimeout(positionVisualGuideStep, 180);
  setTimeout(positionVisualGuideStep, 620);
}
function showVisualGuideStep(index) {
  var steps = activeVisualGuideSteps();
  visualGuideStep = Math.max(0, Math.min(steps.length - 1, index));
  var step = steps[visualGuideStep];
  prepareVisualGuideStep(step);
  var title = document.getElementById('visual-guide-title');
  var body = document.getElementById('visual-guide-body');
  var kicker = document.getElementById('visual-guide-kicker');
  var hint = document.getElementById('visual-guide-hint');
  var progress = document.getElementById('visual-guide-progress');
  var next = document.getElementById('visual-guide-next');
  if (title) title.textContent = step.title;
  if (body) body.textContent = step.body;
  if (kicker) kicker.textContent = step.kicker;
  if (hint) hint.textContent = visualGuideStep === steps.length - 1 ? '点击空白处完成引导' : '点击空白处也可以继续';
  if (progress) progress.textContent = (visualGuideStep + 1) + ' / ' + steps.length;
  if (next) next.textContent = visualGuideStep === steps.length - 1 ? '完成' : '下一步';
  scheduleVisualGuidePositioning();
}
function guideTargetRect(step) {
  if (step && step.target === 'stage') {
    var stageW = Math.min(620, Math.max(260, innerWidth - 72));
    var stageH = Math.min(310, Math.max(178, innerHeight * 0.34));
    var stageLeft = innerWidth * 0.5 - stageW * 0.5;
    var stageTop = Math.max(116, innerHeight * 0.32 - stageH * 0.5);
    return { left: stageLeft, top: stageTop, width: stageW, height: stageH, right: stageLeft + stageW, bottom: stageTop + stageH };
  }
  if (step && step.target === 'shelf' && typeof shelfCueRect === 'function') {
    var shelfRect = shelfCueRect();
    var shelfLeft = shelfRect.left;
    var shelfTop = shelfRect.top - 26;
    var shelfRight = Math.min(innerWidth - 12, shelfRect.right + 18);
    var shelfBottom = shelfRect.bottom + 26;
    return { left: shelfLeft, top: shelfTop, width: shelfRight - shelfLeft, height: shelfBottom - shelfTop, right: shelfRight, bottom: shelfBottom };
  }
  if (step && step.selector === '#bottom-bar') {
    var bar = document.getElementById('bottom-bar');
    var progress = document.getElementById('progress-bar');
    var controls = document.getElementById('controls');
    if (bar) {
      var br = bar.getBoundingClientRect();
      var left = br.left, top = br.top, right = br.right, bottom = br.bottom;
      [progress, controls].forEach(function(el){
        if (!el) return;
        var r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return;
        left = Math.min(left, r.left);
        top = Math.min(top, r.top);
        right = Math.max(right, r.right);
        bottom = Math.max(bottom, r.bottom);
      });
      return { left: left, top: top, width: right - left, height: bottom - top, right: right, bottom: bottom };
    }
  }
  var isFullscreenDiyStep = !!(step && step.selector === '#diy-mode-btn' && (desktopRuntimeState.fullscreen || desktopFullscreenActive || document.fullscreenElement || document.body.classList.contains('desktop-fullscreen')));
  var useFullscreenDiyTarget = isFullscreenDiyStep && !shouldSuppressFullscreenDiyPeek();
  if (useFullscreenDiyTarget) {
    layoutFullscreenDiyZone();
    document.body.classList.add('fullscreen-diy-peek');
  }
  var target = step && step.selector ? document.querySelector(useFullscreenDiyTarget ? '#fullscreen-diy-btn' : step.selector) : null;
  if (target) {
    var style = window.getComputedStyle(target);
    var rect = target.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden') return rect;
  }
  if (step && step.selector === '#diy-mode-btn') {
    var fallbackRight = Math.max(116, innerWidth - 26);
    var fallbackTop = 16;
    return { left: fallbackRight - 88, top: fallbackTop, width: 88, height: 38, right: fallbackRight, bottom: fallbackTop + 38 };
  }
  return { left: innerWidth * 0.5 - 120, top: innerHeight * 0.5 - 40, width: 240, height: 80, right: innerWidth * 0.5 + 120, bottom: innerHeight * 0.5 + 40 };
}
function positionVisualGuideStep() {
  if (!visualGuideActive) return;
  var guide = document.getElementById('visual-guide');
  var ring = document.getElementById('visual-guide-ring');
  var card = document.getElementById('visual-guide-card');
  if (!guide || !ring || !card) return;
  var step = activeVisualGuideSteps()[visualGuideStep];
  var rect = guideTargetRect(step);
  ring.classList.toggle('shelf-target', !!(step && step.target === 'shelf'));
  var pad = step && step.target === 'shelf' ? 14 : (step && step.selector === '#bottom-bar' ? 10 : 8);
  var left = Math.max(12, rect.left - pad);
  var top = Math.max(12, rect.top - pad);
  var width = Math.min(innerWidth - left - 12, rect.width + pad * 2);
  var height = Math.min(innerHeight - top - 12, rect.height + pad * 2);
  ring.style.left = left + 'px';
  ring.style.top = top + 'px';
  ring.style.width = Math.max(44, width) + 'px';
  ring.style.height = Math.max(38, height) + 'px';
  ring.style.borderRadius = step && step.target === 'shelf' ? '28px' : ((step && step.selector === '#bottom-bar') ? '20px' : '16px');
  var scrim = guide.querySelector('.visual-guide-scrim');
  if (scrim) {
    scrim.style.setProperty('--gx', ((rect.left + rect.width / 2) / Math.max(1, innerWidth) * 100).toFixed(2) + '%');
    scrim.style.setProperty('--gy', ((rect.top + rect.height / 2) / Math.max(1, innerHeight) * 100).toFixed(2) + '%');
  }
  var cardW = Math.min(326, innerWidth - 32);
  var cardH = card.offsetHeight || 170;
  var cardLeft = rect.left + rect.width / 2 - cardW / 2;
  cardLeft = Math.max(16, Math.min(innerWidth - cardW - 16, cardLeft));
  var below = rect.bottom + 18;
  var above = rect.top - cardH - 18;
  var cardTop = below + cardH < innerHeight - 16 ? below : Math.max(16, above);
  card.style.left = cardLeft + 'px';
  card.style.top = cardTop + 'px';
}
function nextVisualGuideStep() {
  var steps = activeVisualGuideSteps();
  if (visualGuideStep >= steps.length - 1) {
    closeVisualGuide(true);
    return;
  }
  showVisualGuideStep(visualGuideStep + 1);
}
function closeVisualGuide(markSeen) {
  var guide = document.getElementById('visual-guide');
  visualGuideActive = false;
  if (markSeen) markVisualGuideSeen();
  if (guide) {
    guide.classList.remove('show');
    guide.setAttribute('aria-hidden', 'true');
  }
  document.body.classList.remove('visual-guide-active');
  document.body.classList.remove('fullscreen-diy-peek');
  var search = document.getElementById('search-area');
  var bottom = document.getElementById('bottom-bar');
  var fxPanel = document.getElementById('fx-panel');
  var playlistPanel = document.getElementById('playlist-panel');
  if (typeof setShelfGuideCueActive === 'function') setShelfGuideCueActive(false);
  if (search && !visualGuideState.searchWasPeek && document.activeElement !== $input) setPeek(search, false, 'search');
  if (fxPanel && !visualGuideState.fxWasPeek) setPeek(fxPanel, false, 'fx');
  if (playlistPanel && !visualGuideState.plWasPeek) setPeek(playlistPanel, false, 'pl');
  if (bottom && !visualGuideState.bottomWasVisible && !playing) bottom.classList.remove('visible', 'soft-hidden');
}
function handleVisualGuideSurfaceClick(e) {
  if (!visualGuideActive) return;
  if (e && e.target && e.target.closest && e.target.closest('button')) return;
  if (e && e.preventDefault) e.preventDefault();
  nextVisualGuideStep();
}
(function bindVisualGuideSurfaceClick(){
  var guide = document.getElementById('visual-guide');
  if (guide) guide.addEventListener('click', handleVisualGuideSurfaceClick);
})();

