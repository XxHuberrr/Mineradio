// ---- 全局热键扩展动作（渲染端新增：红心收藏 / 队列显隐，沿用 hotkeySettings 存储） ----
var MUSIC_WIDGET_EXTRA_HOTKEY_ACTIONS = [
  { key: 'toggleLike', label: '红心收藏 / 取消收藏', category: '播放', local: '', global: 'Ctrl+Alt+KeyH' },
  { key: 'toggleQueue', label: '显示 / 隐藏队列', category: '播放', local: '', global: 'Ctrl+Alt+KeyQ' }
];
function allHotkeyActions() {
  var base = (typeof HOTKEY_ACTIONS !== 'undefined' && HOTKEY_ACTIONS) ? HOTKEY_ACTIONS : [];
  // MUSIC_WIDGET_EXTRA_HOTKEY_ACTIONS 可能在 07-ui-playback-runtime 顶层调用
  // readHotkeySettings 时尚未赋值（var 提升后为 undefined）——concat(undefined) 会把
  // undefined 加入数组导致 forEach 时 action.key 崩溃，必须判空
  var extra = (typeof MUSIC_WIDGET_EXTRA_HOTKEY_ACTIONS !== 'undefined' && MUSIC_WIDGET_EXTRA_HOTKEY_ACTIONS) ? MUSIC_WIDGET_EXTRA_HOTKEY_ACTIONS : [];
  return base.concat(extra);
}
// 新增动作首次运行补入 hotkeySettings，避免旧存档缺失默认绑定
function ensureMusicWidgetHotkeyDefaults() {
  if (typeof hotkeySettings === 'undefined' || !hotkeySettings) return;
  var changed = false;
  MUSIC_WIDGET_EXTRA_HOTKEY_ACTIONS.forEach(function (action) {
    if (!hotkeySettings.global) hotkeySettings.global = {};
    if (!hotkeySettings.local) hotkeySettings.local = {};
    if (hotkeySettings.global[action.key] == null) { hotkeySettings.global[action.key] = action.global || ''; changed = true; }
    if (hotkeySettings.local[action.key] == null) { hotkeySettings.local[action.key] = action.local || ''; changed = true; }
  });
  if (changed) saveHotkeySettings();
}
try {
  ensureMusicWidgetHotkeyDefaults();
} catch (e) { }
function getHotkeyDefaults() {
  var defaults = { local: {}, global: {}, mediaKeysEnabled: true };
  allHotkeyActions().forEach(function (action) {
    if (!action || !action.key) return;
    defaults.local[action.key] = action.local || '';
    defaults.global[action.key] = action.global || '';
  });
  return defaults;
}
function readHotkeySettings() {
  var defaults = getHotkeyDefaults();
  try {
    var raw = JSON.parse(localStorage.getItem(HOTKEY_SETTINGS_STORE_KEY) || '{}') || {};
    return {
      local: Object.assign({}, defaults.local, raw.local || {}),
      global: Object.assign({}, defaults.global, raw.global || {}),
      mediaKeysEnabled: raw.mediaKeysEnabled !== false
    };
  } catch (e) {
    return defaults;
  }
}
function saveHotkeySettings() {
  try { localStorage.setItem(HOTKEY_SETTINGS_STORE_KEY, JSON.stringify(hotkeySettings || getHotkeyDefaults())); } catch (e) { }
}
function hotkeyActionMeta(actionKey) {
  var actions = allHotkeyActions();
  for (var i = 0; i < actions.length; i++) {
    if (actions[i].key === actionKey) return actions[i];
  }
  return null;
}
function isModifierKeyCode(code) {
  return /^(ControlLeft|ControlRight|ShiftLeft|ShiftRight|AltLeft|AltRight|MetaLeft|MetaRight)$/i.test(String(code || ''));
}
function normalizeHotkeyEvent(e) {
  if (!e || isModifierKeyCode(e.code)) return '';
  var mods = [];
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (e.metaKey) mods.push('Meta');
  var code = e.code || '';
  if (!code && e.key) code = String(e.key).length === 1 ? 'Key' + String(e.key).toUpperCase() : String(e.key);
  if (!code) return '';
  return mods.concat([code]).join('+');
}
function hotkeyDisplayPart(part) {
  if (part === 'Ctrl') return 'Ctrl';
  if (part === 'Alt') return 'Alt';
  if (part === 'Shift') return 'Shift';
  if (part === 'Meta') return 'Win';
  if (part === 'Space') return 'Space';
  if (part === 'ArrowLeft') return 'Left';
  if (part === 'ArrowRight') return 'Right';
  if (part === 'ArrowUp') return 'Up';
  if (part === 'ArrowDown') return 'Down';
  if (/^Key[A-Z]$/.test(part)) return part.slice(3);
  if (/^Digit[0-9]$/.test(part)) return part.slice(5);
  if (/^Numpad[0-9]$/.test(part)) return 'Num' + part.slice(6);
  return part.replace(/^Equal$/, '=').replace(/^Minus$/, '-');
}
function formatHotkey(hotkey) {
  hotkey = String(hotkey || '').trim();
  if (!hotkey) return '未设置';
  return hotkey.split('+').map(hotkeyDisplayPart).join(' + ');
}
function hotkeyToAccelerator(hotkey) {
  var parts = String(hotkey || '').split('+').filter(Boolean);
  if (!parts.length) return '';
  return parts.map(function (part) {
    if (part === 'Ctrl') return 'Control';
    if (part === 'Alt') return 'Alt';
    if (part === 'Shift') return 'Shift';
    if (part === 'Meta') return 'Super';
    if (part === 'Space') return 'Space';
    if (part === 'ArrowLeft') return 'Left';
    if (part === 'ArrowRight') return 'Right';
    if (part === 'ArrowUp') return 'Up';
    if (part === 'ArrowDown') return 'Down';
    if (/^Key[A-Z]$/.test(part)) return part.slice(3);
    if (/^Digit[0-9]$/.test(part)) return part.slice(5);
    return part;
  }).join('+');
}
function hotkeyDuplicateMap(scope) {
  var map = {};
  var source = (hotkeySettings && hotkeySettings[scope]) || {};
  Object.keys(source).forEach(function (action) {
    var key = String(source[action] || '').trim();
    if (!key) return;
    map[key] = (map[key] || 0) + 1;
  });
  return map;
}
function executeHotkeyAction(actionKey, source) {
  if (actionKey === 'togglePlay') return togglePlay();
  if (actionKey === 'prevTrack') return prevTrack(true);
  if (actionKey === 'nextTrack') return nextTrack(true);
  if (actionKey === 'volumeUp' || actionKey === 'volume-up') return adjustVolumeByKeyboard(0.05);
  if (actionKey === 'volumeDown' || actionKey === 'volume-down') return adjustVolumeByKeyboard(-0.05);
  if (actionKey === 'toggleLike' || actionKey === 'toggle-like') return toggleLikeCurrent();
  if (actionKey === 'toggleQueue' || actionKey === 'toggle-queue') return toggleMiniQueue();
  if (actionKey === 'toggleFullscreen') return toggleFullscreen();
  if (actionKey === 'toggleDesktopInteraction') {
    var api = getDesktopWindowApi && getDesktopWindowApi();
    if (!api || typeof api.getState !== 'function') return;
    return api.getState().then(function (state) {
      if (state && state.isDesktopEmbedded) {
        fx.wallpaperMode = false;
        updateFxInputs();
        return applyWallpaperModeState(true).then(function (result) {
          if (result && result.ok === true) showToast('已退出完整桌面模式');
          return result;
        });
      }
      fx.wallpaperMode = true;
      updateFxInputs();
      return applyWallpaperModeState(true).then(function (result) {
        if (result && result.ok === true) showToast('完整桌面模式已开启 · ' + desktopInteractionHotkeyHint());
        return result;
      });
    }).catch(function () { });
  }
  if (actionKey === 'toggleDesktopLyrics') return toggleFx('desktopLyrics');
}
function desktopInteractionHotkeyHint() {
  var binding = hotkeySettings && hotkeySettings.global && hotkeySettings.global.toggleDesktopInteraction;
  return binding ? ('按 ' + formatHotkey(binding) + ' 进入 / 退出完整桌面模式') : '可在热键设置中配置完整桌面模式切换';
}
function handleConfiguredLocalHotkey(e) {
  if (!hotkeySettings || !hotkeySettings.local || isTypingTarget(e.target)) return false;
  if (hotkeyCaptureState || document.getElementById('hotkey-modal') && document.getElementById('hotkey-modal').classList.contains('show')) return false;
  if (freeCamera && freeCamera.active && /^(KeyW|KeyA|KeyS|KeyD|KeyQ|KeyE|Space|ShiftLeft|ShiftRight|ControlLeft|ControlRight)$/.test(e.code)) return false;
  var combo = normalizeHotkeyEvent(e);
  if (!combo) return false;
  var duplicate = hotkeyDuplicateMap('local');
  var actions = allHotkeyActions();
  for (var i = 0; i < actions.length; i++) {
    var action = actions[i];
    if (hotkeySettings.local[action.key] !== combo) continue;
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat && !/^volume/.test(action.key)) return true;
    if (duplicate[combo] > 1) return true;
    executeHotkeyAction(action.key, 'local');
    return true;
  }
  return false;
}
function shouldSuppressDefaultConfiguredHotkey(e) {
  if (!hotkeySettings || !hotkeySettings.local) return false;
  var combo = normalizeHotkeyEvent(e);
  if (!combo) return false;
  var actions = allHotkeyActions();
  for (var i = 0; i < actions.length; i++) {
    var action = actions[i];
    if (action.local === combo && hotkeySettings.local[action.key] !== combo) return true;
  }
  return false;
}
function ensureHotkeySettingsButton() {
  var panel = document.getElementById('fx-panel');
  var head = panel && panel.querySelector('.fx-head');
  if (!head || document.getElementById('hotkey-settings-btn')) return;
  if (head.firstElementChild) head.firstElementChild.classList.add('fx-head-main');
  var actions = document.createElement('div');
  actions.className = 'fx-head-actions';
  var btn = document.createElement('button');
  btn.id = 'hotkey-settings-btn';
  btn.type = 'button';
  btn.className = 'fx-mini-btn ghost';
  btn.textContent = '热键';
  btn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); openHotkeySettings(); });
  actions.appendChild(btn);
  head.appendChild(actions);
}
function ensureHotkeyModal() {
  var modal = document.getElementById('hotkey-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'hotkey-modal';
  modal.className = 'hotkey-modal';
  modal.innerHTML =
    '<div class="hotkey-dialog" role="dialog" aria-modal="true" aria-label="热键设置">' +
    '<div class="hotkey-head">' +
    '<div><div class="hotkey-title">热键设置</div><div class="hotkey-sub">局内热键只在 Mineradio 窗口内生效；全局热键会向系统注册，并检测是否被占用。</div></div>' +
    '<button class="hotkey-close" type="button" data-hotkey-close aria-label="关闭">×</button>' +
    '</div>' +
    '<div class="hotkey-toolbar">' +
    '<div class="hotkey-tabs"><button type="button" data-hotkey-scope="local" class="active">局内热键</button><button type="button" data-hotkey-scope="global">全局热键</button></div>' +
    '<div class="hotkey-note">按 Backspace / Delete 可清空当前功能热键</div>' +
    '</div>' +
    '<div id="hotkey-local-section" class="hotkey-section active"></div>' +
    '<div id="hotkey-media-keys-row" class="hotkey-row hotkey-media-row">' +
    '<div class="hotkey-name hotkey-media-name"><span>系统媒体键</span><span class="hotkey-media-note">播放 / 暂停、上一首、下一首（含任务栏缩略图按钮）</span></div>' +
    '<label class="hotkey-switch"><input type="checkbox" id="hotkey-media-keys-toggle"><span class="hotkey-switch-track"></span></label>' +
    '<div class="hotkey-media-status" id="hotkey-media-keys-status">已开启</div>' +
    '</div>' +
    '<div id="hotkey-global-section" class="hotkey-section"></div>' +
    '<div class="hotkey-capture-tip" id="hotkey-capture-tip">正在录入组合键，按 Esc 取消。</div>' +
    '</div>';
  document.body.appendChild(modal);
  // 注入系统媒体键开关行样式（与热键面板现有样式保持一致）
  if (!document.getElementById('mineradio-hotkey-media-style')) {
    var hotkeyMediaStyle = document.createElement('style');
    hotkeyMediaStyle.id = 'mineradio-hotkey-media-style';
    hotkeyMediaStyle.textContent =
      '.hotkey-media-row{grid-template-columns:minmax(180px,1fr) auto minmax(96px,1fr)}' +
      '.hotkey-media-name{display:flex;flex-direction:column;gap:3px;white-space:normal}' +
      '.hotkey-media-note{font-size:10.5px;font-weight:560;color:rgba(255,255,255,.42)}' +
      '.hotkey-switch{position:relative;display:inline-flex;align-items:center;justify-content:center;width:44px;height:26px;cursor:pointer}' +
      '.hotkey-switch input{position:absolute;opacity:0;width:100%;height:100%;margin:0;cursor:pointer}' +
      '.hotkey-switch-track{position:relative;width:40px;height:22px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.30);transition:background .18s ease,border-color .18s ease;pointer-events:none}' +
      '.hotkey-switch-track::after{content:"";position:absolute;left:3px;top:50%;width:15px;height:15px;border-radius:50%;background:rgba(255,255,255,.62);transform:translateY(-50%);transition:transform .18s ease,background .18s ease}' +
      '.hotkey-switch input:checked + .hotkey-switch-track{border-color:rgba(var(--fc-accent-rgb),.55);background:rgba(var(--fc-accent-rgb),.26)}' +
      '.hotkey-switch input:checked + .hotkey-switch-track::after{transform:translate(18px,-50%);background:#fff}' +
      '.hotkey-media-status{font-size:11px;font-weight:700;text-align:right;color:rgba(255,255,255,.55)}';
    document.head.appendChild(hotkeyMediaStyle);
  }
  var mediaKeysToggle = document.getElementById('hotkey-media-keys-toggle');
  if (mediaKeysToggle && !mediaKeysToggle.__mineradioMediaKeysBound) {
    mediaKeysToggle.__mineradioMediaKeysBound = true;
    mediaKeysToggle.addEventListener('change', function () {
      setMediaKeysEnabled(mediaKeysToggle.checked);
    });
  }
  modal.addEventListener('click', function (e) {
    if (e.target === modal || e.target.closest('[data-hotkey-close]')) closeHotkeySettings();
    var scopeBtn = e.target.closest('[data-hotkey-scope]');
    if (scopeBtn) setHotkeyModalScope(scopeBtn.getAttribute('data-hotkey-scope'));
    var bindBtn = e.target.closest('[data-hotkey-bind]');
    if (bindBtn) startHotkeyCapture(bindBtn.getAttribute('data-hotkey-action'), bindBtn.getAttribute('data-hotkey-bind'));
    var resetBtn = e.target.closest('[data-hotkey-reset]');
    if (resetBtn) resetHotkeyBinding(resetBtn.getAttribute('data-hotkey-action'), resetBtn.getAttribute('data-hotkey-reset'));
  });
  return modal;
}
function hotkeyStatusMarkup(scope, actionKey, binding, duplicate) {
  if (!binding) return '<span class="hotkey-status">未设置</span>';
  if (duplicate && duplicate[binding] > 1) return '<span class="hotkey-status conflict"><span class="source-icon">!</span>Mineradio 内部重复</span>';
  if (scope === 'local') return '<span class="hotkey-status ok">可用</span>';
  var status = hotkeyGlobalStatus[actionKey];
  if (!status) return '<span class="hotkey-status">待检测</span>';
  if (status.ok) return '<span class="hotkey-status ok">可用</span>';
  var source = status.conflict && status.conflict.sourceName || '系统 / 其他软件';
  return '<span class="hotkey-status conflict"><span class="source-icon">!</span>' + escHtml(source) + '</span>';
}
function renderHotkeyScope(scope) {
  var wrap = document.getElementById(scope === 'global' ? 'hotkey-global-section' : 'hotkey-local-section');
  if (!wrap) return;
  var duplicate = hotkeyDuplicateMap(scope);
  var html = '';
  var groups = {};
  allHotkeyActions().forEach(function (action) {
    (groups[action.category] = groups[action.category] || []).push(action);
  });
  Object.keys(groups).forEach(function (category) {
    html += '<div class="hotkey-group"><div class="hotkey-group-title">' + escHtml(category) + '</div>';
    groups[category].forEach(function (action) {
      var binding = (hotkeySettings[scope] && hotkeySettings[scope][action.key]) || '';
      html += '<div class="hotkey-row">' +
        '<div class="hotkey-name">' + escHtml(action.label) + '</div>' +
        '<button class="hotkey-key' + (hotkeyCaptureState && hotkeyCaptureState.scope === scope && hotkeyCaptureState.action === action.key ? ' capturing' : '') + '" type="button" data-hotkey-bind="' + scope + '" data-hotkey-action="' + action.key + '">' + escHtml(hotkeyCaptureState && hotkeyCaptureState.scope === scope && hotkeyCaptureState.action === action.key ? '按下组合键...' : formatHotkey(binding)) + '</button>' +
        '<button class="hotkey-reset" type="button" data-hotkey-reset="' + scope + '" data-hotkey-action="' + action.key + '">默认</button>' +
        hotkeyStatusMarkup(scope, action.key, binding, duplicate) +
        '</div>';
    });
    html += '</div>';
  });
  wrap.innerHTML = html;
}
function renderHotkeySettings() {
  var modal = ensureHotkeyModal();
  var active = modal.getAttribute('data-scope') || 'local';
  modal.classList.toggle('capturing', !!hotkeyCaptureState);
  modal.querySelectorAll('[data-hotkey-scope]').forEach(function (btn) {
    btn.classList.toggle('active', btn.getAttribute('data-hotkey-scope') === active);
  });
  var local = document.getElementById('hotkey-local-section');
  var global = document.getElementById('hotkey-global-section');
  if (local) local.classList.toggle('active', active === 'local');
  if (global) global.classList.toggle('active', active === 'global');
  // 系统媒体键开关行只在「全局热键」标签下显示
  var mediaRow = document.getElementById('hotkey-media-keys-row');
  if (mediaRow) mediaRow.style.display = active === 'global' ? '' : 'none';
  renderHotkeyScope('local');
  renderHotkeyScope('global');
  // 同步系统媒体键开关状态
  var mediaToggle = document.getElementById('hotkey-media-keys-toggle');
  if (mediaToggle) {
    var mediaEnabled = !hotkeySettings || hotkeySettings.mediaKeysEnabled !== false;
    mediaToggle.checked = mediaEnabled;
    var mediaStatus = document.getElementById('hotkey-media-keys-status');
    if (mediaStatus) mediaStatus.textContent = mediaEnabled ? '已开启' : '已关闭';
  }
}
function setHotkeyModalScope(scope) {
  var modal = ensureHotkeyModal();
  modal.setAttribute('data-scope', scope === 'global' ? 'global' : 'local');
  renderHotkeySettings();
}
function openHotkeySettings() {
  var modal = ensureHotkeyModal();
  modal.classList.add('show');
  modal.setAttribute('data-scope', modal.getAttribute('data-scope') || 'local');
  renderHotkeySettings();
  registerGlobalHotkeys();
  registerMediaKeys();
}
function closeHotkeySettings() {
  hotkeyCaptureState = null;
  var modal = document.getElementById('hotkey-modal');
  if (modal) modal.classList.remove('show', 'capturing');
}
function startHotkeyCapture(action, scope) {
  hotkeyCaptureState = { action: action, scope: scope === 'global' ? 'global' : 'local' };
  var modal = ensureHotkeyModal();
  modal.setAttribute('data-scope', hotkeyCaptureState.scope);
  renderHotkeySettings();
}
function setHotkeyBinding(action, scope, value) {
  if (!hotkeySettings) hotkeySettings = getHotkeyDefaults();
  if (!hotkeySettings[scope]) hotkeySettings[scope] = {};
  hotkeySettings[scope][action] = value || '';
  saveHotkeySettings();
  renderHotkeySettings();
  if (scope === 'global') registerGlobalHotkeys();
}
function resetHotkeyBinding(action, scope) {
  var meta = hotkeyActionMeta(action);
  if (!meta) return;
  setHotkeyBinding(action, scope, scope === 'global' ? meta.global : meta.local);
}
function registerGlobalHotkeys() {
  var api = getDesktopWindowApi && getDesktopWindowApi();
  if (!api || typeof api.configureGlobalHotkeys !== 'function') {
    hotkeyGlobalStatus = {};
    renderHotkeySettings();
    return Promise.resolve();
  }
  var duplicate = hotkeyDuplicateMap('global');
  var bindings = [];
  allHotkeyActions().forEach(function (action) {
    var key = hotkeySettings.global && hotkeySettings.global[action.key];
    if (!key || duplicate[key] > 1) return;
    var accelerator = hotkeyToAccelerator(key);
    if (accelerator) bindings.push({ action: action.key, accelerator: accelerator });
  });
  return api.configureGlobalHotkeys(bindings).then(function (res) {
    var next = {};
    (res && res.results || []).forEach(function (item) {
      next[item.action] = item;
    });
    hotkeyGlobalStatus = next;
    renderHotkeySettings();
  }).catch(function () {
    hotkeyGlobalStatus = {};
    renderHotkeySettings();
  });
}
// 系统媒体键：默认开启，可在热键设置面板中开关
function registerMediaKeys() {
  var api = getDesktopWindowApi && getDesktopWindowApi();
  if (!api || typeof api.configureMediaKeys !== 'function') return Promise.resolve();
  var enabled = !hotkeySettings || hotkeySettings.mediaKeysEnabled !== false;
  return api.configureMediaKeys(enabled).catch(function () { });
}
function setMediaKeysEnabled(enabled) {
  if (!hotkeySettings) hotkeySettings = getHotkeyDefaults();
  hotkeySettings.mediaKeysEnabled = enabled !== false;
  saveHotkeySettings();
  renderHotkeySettings();
  registerMediaKeys();
}
// 播放状态轮询：任务栏缩略图按钮图标随播放/暂停切换（仅桌面环境启用）
var thumbarPlayingWatcherActive = false;
var thumbarPlayingLast = null;
function startThumbarPlayingWatcher() {
  var api = getDesktopWindowApi && getDesktopWindowApi();
  if (!api || typeof api.setThumbarPlaying !== 'function' || thumbarPlayingWatcherActive) return;
  thumbarPlayingWatcherActive = true;
  var check = function () {
    if (!thumbarPlayingWatcherActive) return;
    var next = typeof playing === 'boolean' ? playing : false;
    if (next !== thumbarPlayingLast) {
      thumbarPlayingLast = next;
      // preload 的 setThumbarPlaying 走 ipcRenderer.send（返回 undefined），
      // 不能直接 .catch——先判空再取 catch，避免 TypeError 中断 bindFxPanel 绑定链
      try {
        var thumbarResult = api.setThumbarPlaying(next);
        if (thumbarResult && typeof thumbarResult.catch === 'function') thumbarResult.catch(function () { });
      } catch (e) { }
    }
  };
  check();
  setInterval(check, 300);
}
var globalHotkeyListenerBound = false;
function bindHotkeySettings() {
  ensureHotkeySettingsButton();
  ensureHotkeyModal();
  if (!globalHotkeyListenerBound) {
    var api = getDesktopWindowApi && getDesktopWindowApi();
    if (api && typeof api.onGlobalHotkey === 'function') {
      globalHotkeyListenerBound = true;
      api.onGlobalHotkey(function (payload) {
        if (!payload || !payload.action) return;
        executeHotkeyAction(payload.action, 'global');
      });
    }
  }
  registerGlobalHotkeys();
  registerMediaKeys();
  startThumbarPlayingWatcher();
  mountMusicWidgetEntryButton();
  bindMusicWidgetSeek();
}
// ---- 桌面音乐小组件：渲染端控制器 ----
var musicWidgetPushTimer = 0;
var musicWidgetPushActive = false;
var musicWidgetSeekBound = false;
function musicWidgetDesktopApi() {
  return getDesktopWindowApi && getDesktopWindowApi();
}
function buildMusicWidgetStatePayload() {
  var meta = (typeof currentDesktopSongMeta === 'function') ? currentDesktopSongMeta() : {};
  var lyric = (typeof currentDesktopLyricSnapshot === 'function') ? currentDesktopLyricSnapshot() : { text: '', progress: 0 };
  var t = (typeof audio !== 'undefined' && audio && isFinite(audio.currentTime)) ? Number(audio.currentTime) : 0;
  var d = (typeof audio !== 'undefined' && audio && isFinite(audio.duration)) ? Number(audio.duration) : 0;
  return {
    enabled: musicWidgetPushActive,
    title: meta.title || '',
    artist: meta.artist || '',
    cover: meta.cover || '',
    lyric: lyric.text || '',
    lyricProgress: lyric.progress || 0,
    playing: typeof playing === 'boolean' ? playing : false,
    currentTime: t,
    duration: d
  };
}
function pushMusicWidgetState() {
  var api = musicWidgetDesktopApi();
  if (!api || typeof api.updateMusicWidget !== 'function') return;
  try {
    var result = api.updateMusicWidget(buildMusicWidgetStatePayload());
    if (result && typeof result.catch === 'function') result.catch(function (e) { console.warn('music widget update failed:', e); });
  } catch (e) { }
}
function startMusicWidgetPush() {
  if (musicWidgetPushTimer) return;
  musicWidgetPushActive = true;
  musicWidgetPushTimer = setInterval(pushMusicWidgetState, 800);
  pushMusicWidgetState();
}
function stopMusicWidgetPush() {
  musicWidgetPushActive = false;
  if (musicWidgetPushTimer) {
    clearInterval(musicWidgetPushTimer);
    musicWidgetPushTimer = 0;
  }
}
function toggleMusicWidgetDesktop() {
  var api = musicWidgetDesktopApi();
  if (!api || typeof api.toggleMusicWidget !== 'function') {
    showToast('桌面小组件仅桌面版可用');
    return Promise.resolve({ ok: false, enabled: false, error: 'MUSIC_WIDGET_DESKTOP_API_UNAVAILABLE' });
  }
  return api.toggleMusicWidget({}).then(function (res) {
    if (res && res.ok === true) {
      showToast(res.enabled ? '桌面小组件已开启' : '桌面小组件已关闭');
      if (res.enabled) startMusicWidgetPush();
      else stopMusicWidgetPush();
    }
    return res;
  }).catch(function (e) {
    console.warn('music widget toggle failed:', e);
    return { ok: false, enabled: false, error: 'MUSIC_WIDGET_TOGGLE_FAILED' };
  });
}
function mountMusicWidgetEntryButton() {
  // 用户要求：悬浮窗（桌面小组件）选项放到播放列表面板 tab 行、均衡器按钮后面。
  // 需等 DOMContentLoaded 后再挂载（EQ 按钮在 DOMContentLoaded 创建，同步执行时 #eq-control 还不存在）
  function doMount() {
    var tabsRow = document.querySelector('#playlist-panel .panel-tabs');
    if (!tabsRow || document.getElementById('music-widget-btn')) return;
    var eqWrap = document.getElementById('eq-control');
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-left:4px';
    var btn = document.createElement('button');
    btn.id = 'music-widget-btn';
    btn.type = 'button';
    // 与均衡器按钮同尺寸（ctrl-btn 图标按钮），自定义悬浮窗图标（窗口 + 时钟）
    btn.className = 'ctrl-btn';
    btn.title = '桌面悬浮窗（时钟 + 封面 + 歌词 + 进度）';
    btn.setAttribute('aria-label', '桌面悬浮窗');
    btn.innerHTML = '<svg width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true">'
      + '<rect x="3.5" y="4.5" width="17" height="13" rx="2.2"/>'
      + '<circle cx="12" cy="12.5" r="3.4"/>'
      + '<path d="M12 10.6v1.9l1.2.9"/></svg>';
    btn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); toggleMusicWidgetDesktop(); });
    row.appendChild(btn);
    if (eqWrap && eqWrap.parentNode) eqWrap.parentNode.insertBefore(row, eqWrap.nextSibling);
    else tabsRow.appendChild(row);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', doMount);
  else doMount();
}
function bindMusicWidgetSeek() {
  if (musicWidgetSeekBound) return;
  var api = musicWidgetDesktopApi();
  if (!api || typeof api.onMusicWidgetSeek !== 'function') return;
  musicWidgetSeekBound = true;
  api.onMusicWidgetSeek(function (payload) {
    if (!payload || !isFinite(Number(payload.ratio))) return;
    var d = (typeof audio !== 'undefined' && audio && isFinite(audio.duration)) ? Number(audio.duration) : 0;
    if (d <= 0) return;
    var target = Math.max(0, Math.min(d, Number(payload.ratio) * d));
    // 走正式 seek 链路（含快照保存/cuefield 重置/暂停恢复），保持当前播放状态
    if (typeof commitProgressSeek === 'function') {
      commitProgressSeek(target, !!(audio && !audio.paused));
    } else if (audio) {
      audio.currentTime = target;
    }
    // 立即回推最新进度（不等 800ms 轮询），悬浮窗进度条即时到位
    if (typeof pushMusicWidgetState === 'function') pushMusicWidgetState();
  });
  // 悬浮窗播放控制：上一曲 / 播放暂停 / 下一曲
  if (typeof api.onMusicWidgetControl === 'function') {
    api.onMusicWidgetControl(function (payload) {
      var action = payload && payload.action;
      if (action === 'prev' && typeof prevTrack === 'function') prevTrack();
      else if (action === 'next' && typeof nextTrack === 'function') nextTrack();
      else if (action === 'toggle' && typeof togglePlay === 'function') togglePlay();
      if (typeof pushMusicWidgetState === 'function') pushMusicWidgetState();
    });
  }
  if (typeof api.onMusicWidgetClosed === 'function') {
    api.onMusicWidgetClosed(function () { stopMusicWidgetPush(); });
  }
}
document.addEventListener('keydown', function (e) {
  var hotkeyModal = document.getElementById('hotkey-modal');
  if (!hotkeyCaptureState) {
    if (hotkeyModal && hotkeyModal.classList.contains('show') && e.code === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeHotkeySettings();
    }
    return;
  }
  e.preventDefault();
  e.stopPropagation();
  if (e.code === 'Escape') {
    hotkeyCaptureState = null;
    renderHotkeySettings();
    return;
  }
  if (e.code === 'Backspace' || e.code === 'Delete') {
    var clearTarget = hotkeyCaptureState;
    hotkeyCaptureState = null;
    setHotkeyBinding(clearTarget.action, clearTarget.scope, '');
    return;
  }
  var combo = normalizeHotkeyEvent(e);
  if (!combo) return;
  var target = hotkeyCaptureState;
  hotkeyCaptureState = null;
  setHotkeyBinding(target.action, target.scope, combo);
}, true);
