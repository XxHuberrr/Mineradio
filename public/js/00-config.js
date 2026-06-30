'use strict';
// ============================================================
//  Mineradio — 00-config.js
// ============================================================

// ============================================================
//  Global State
// ============================================================
var audio = null, audioCtx = null, source = null, analyser = null, beatAnalyser = null, gainNode = null, audioReady = false;
var uiSfxCtx = null, lastShelfSelectSfxAt = 0;
var FFT_SIZE = 2048;
var frequencyData = new Uint8Array(FFT_SIZE / 2);
var timeDomainData = new Uint8Array(FFT_SIZE);
var BEAT_FFT_SIZE = 2048;
var beatFrequencyData = new Uint8Array(BEAT_FFT_SIZE / 2);
var beatTimeDomainData = new Uint8Array(BEAT_FFT_SIZE);
var bass = 0, mid = 0, treble = 0, audioEnergy = 0, beatPulse = 0, prevEnergy = 0;
var lyricSunEnergy = 0, lyricSunTarget = 0, lyricSunHold = 0, lyricSunAvg = 0, lyricSunPeak = 0.55;
var smoothBass = 0, smoothMid = 0, smoothTreb = 0, smoothEnergy = 0;
var bassPeak = 0.12, midPeak = 0.10, treblePeak = 0.08, energyPeak = 0.10;
var beatOnsetFlag = false;        // beat 上升沿瞬时标志,每帧消费一次
var lastStrongDrop = 0;           // 用于 burst 预设的强 drop 时刻

var lyricsLines = [], lyricsVisible = false, lyricsHasNativeKaraoke = false, lyricsTimingSource = 'none';
var playlist = [], playQueue = [], currentIdx = -1, playing = false, playToggleBusy = false;
var searchMode = 'song', podcastResults = [], podcastPrograms = [], podcastCurrentRadio = null;
var loginStatus = { loggedIn: false, vipType: 0, vipLevel: 'none', isVip: false, isSvip: false, vipLabel: '无VIP' };
var qqLoginStatus = { provider: 'qq', loggedIn: false, preview: false, nickname: 'QQ 音乐', userId: '', avatar: '', vipType: 0 };
var qqLoginAutoRefreshTimer = null;
var qqLoginWasLoggedIn = false;
var loginProvider = 'netease';
var activeAccountProvider = 'netease';
var dualAccountMode = false;
var qqCookieBusy = false;
var neteaseWebLoginBusy = false;
var qqWebLoginBusy = false;
var qqManualCookieOpen = false;
var loginStatusChecked = false, loginStatusCheckFailed = false;
var qrPollTimer = null, qrKey = null;
var volumeTween = null, trackSwitchToken = 0;
var audioFadeTimer = null, audioElementFadeFrame = 0, audioFadeSerial = 0;
var AUDIO_FADE_IN_MS = 460;
var AUDIO_FADE_OUT_MS = 420;
var AUDIO_SILENCE_GAIN = 0.0001;
var userPlaylists = [], qqPlaylists = [], myPodcastCollections = [], myPodcastItems = {}, playlistCoverCache = {};
var CUSTOM_COVER_STORE_KEY = 'mineradio-custom-covers';
var CUSTOM_LYRIC_STORE_KEY = 'mineradio-custom-lyrics-v1';
var CUSTOM_LYRIC_PREF_STORE_KEY = 'mineradio-custom-lyric-prefs-v1';
var LYRIC_LAYOUT_STORE_KEY = 'mineradio-lyric-layout-v1';
var VISUAL_PRESET_SCHEMA = 'skull-preset-v2';
var PLAYBACK_QUALITY_STORE_KEY = 'mineradio-playback-quality-v1';
var UPLOAD_TIP_STORE_KEY = 'mineradio-upload-tip-seen';
var DIY_MODE_STORE_KEY = 'mineradio-diy-player-mode-v1';
var PLAYLIST_PANEL_PIN_STORE_KEY = 'mineradio-playlist-panel-pinned-v1';
var USER_CAPSULE_AUTO_HIDE_STORE_KEY = 'mineradio-user-capsule-auto-hide-v1';
var FX_FAB_AUTO_HIDE_STORE_KEY = 'mineradio-fx-fab-auto-hide-v1';
var CONTROLS_AUTO_HIDE_STORE_KEY = 'mineradio-controls-auto-hide-v1';
var FREE_CAMERA_STORE_KEY = 'mineradio-free-camera-v1';
var HOTKEY_SETTINGS_STORE_KEY = 'mineradio-hotkey-settings-v1';
var VISUAL_GUIDE_SEEN_STORE_KEY = 'mineradio-visual-guide-seen-v2';
var LOCAL_BEATMAP_STORE_KEY = 'mineradio-local-beatmaps-v1';
var LOCAL_BEAT_PREF_STORE_KEY = 'mineradio-local-beatmap-prefs-v1';
var LOCAL_BEAT_COMBOS = ['', 'downbeat', 'push', 'drop', 'rebound', 'accent'];
var HOTKEY_ACTIONS = [
  { key:'togglePlay', label:'播放 / 暂停', category:'播放', local:'Space', global:'Ctrl+Alt+Space' },
  { key:'prevTrack', label:'上一首', category:'播放', local:'ArrowLeft', global:'Ctrl+Alt+ArrowLeft' },
  { key:'nextTrack', label:'下一首', category:'播放', local:'ArrowRight', global:'Ctrl+Alt+ArrowRight' },
  { key:'volumeUp', label:'音量增加', category:'音量', local:'ArrowUp', global:'Ctrl+Alt+ArrowUp' },
  { key:'volumeDown', label:'音量降低', category:'音量', local:'ArrowDown', global:'Ctrl+Alt+ArrowDown' },
  { key:'toggleFullscreen', label:'全屏', category:'窗口', local:'KeyF', global:'Ctrl+Alt+KeyF' },
  { key:'toggleDesktopLyrics', label:'桌面歌词', category:'歌词', local:'Alt+KeyL', global:'Ctrl+Alt+KeyL' }
];
var hotkeyCaptureState = null;
var hotkeyGlobalStatus = {};
var diyPlayerMode = readDiyModePreference();
var customCoverMap = readCustomCoverMap();
var customLyricMap = readCustomLyricMap();
var customLyricPrefs = readCustomLyricPrefs();
var localBeatMapCache = readLocalBeatMapCache();
var localBeatMapPrefs = readLocalBeatPrefs();
var playbackQuality = readPlaybackQualityPreference();
var qqPlaybackQualityCeiling = '';
var coverCropState = null, coverCropBound = false;
var currentLocalSong = null;
var lyricSourceMode = 'original';
var originalLyricsState = { lines: [], hasNativeKaraoke: false, timingSource: 'none' };
var localBeatAnalysis = { song:null, audioUrl:'', mode:'mr', active:false, token:0 };
var likedSongMap = {}, likeBusyMap = {}, likeStatusToken = 0;
var collectTargetSong = null, collectBusy = false;
var uploadTipTimer = null, uploadTipAttempts = 0;
var visualGuideActive = false, visualGuideStep = 0, visualGuideResizeBound = false;
var visualGuideState = { bottomWasVisible: false, searchWasPeek: false, manual: false };
var emptyHomeActive = false;
var homeForcedOpen = false;
var homeSuppressed = false;
var homeDiscoverState = { loading: false, loaded: false, loggedIn: false, mode: 'starter', songs: [], playlists: [], podcasts: [], error: '', updatedAt: 0 };
var homeDiscoverToken = 0;
var homeVisualPresetActive = false;
var homeVisualPrevPreset = 0;
var HOME_LISTEN_STATS_KEY = 'mineradio-listen-stats-v1';
var HOME_WEATHER_CITY_KEY = 'mineradio-weather-city';
var homeWeatherRadioState = { loading: false, loaded: false, city: localStorage.getItem(HOME_WEATHER_CITY_KEY) || '上海', weather: null, radio: null, error: '', updatedAt: 0 };
var homeWeatherToken = 0;
var homeWeatherLoadTimer = null;
var homeWeatherLoadPromise = null;
var weatherRadioStartBusy = false;
var activeRadioContext = null;
var listenStatsState = loadListenStatsState();
var listenSession = null;
var appPerfMarks = [];
function markAppPerf(name) {
  try {
    var value = performance.now();
    appPerfMarks.push({ name: name, value: Math.round(value) });
    if (performance && performance.mark) performance.mark('mineradio:' + name);
    if (appPerfMarks.length <= 16) console.debug('[MineradioPerf]', name, Math.round(value) + 'ms');
  } catch (e) {}
}
markAppPerf('script-start');
function installStartupLongTaskObserver() {
  try {
    if (!('PerformanceObserver' in window)) return;
    var observer = new PerformanceObserver(function(list){
      list.getEntries().forEach(function(entry){
        if (entry.startTime > 15000) return;
        console.debug('[MineradioPerf] longtask', Math.round(entry.startTime) + 'ms', Math.round(entry.duration) + 'ms');
      });
    });
    observer.observe({ entryTypes: ['longtask'] });
    setTimeout(function(){ try { observer.disconnect(); } catch (e) {} }, 16000);
  } catch (e) {}
}
installStartupLongTaskObserver();
var queueViewTab = 'queue', playMode = 'loop', miniQueueOpen = false;
var miniQueueRenderSeq = 0, queueRenderSeq = 0, playlistRenderSeq = 0;
var queuePanelDirty = false;
var PLAYLIST_PANEL_BATCH_SIZE = 28;
var playlistPanelRenderLimit = PLAYLIST_PANEL_BATCH_SIZE;
var playlistPanelLazyBound = false;
var PLAYLIST_DETAIL_INITIAL_RENDER = 64;
var PLAYLIST_DETAIL_BATCH_SIZE = 48;
var smoothWheelScrollBound = false;
var coverProcessToken = 0, aiDepthPipeline = null, aiDepthReady = false, aiDepthBusy = false, aiDepthFailUntil = 0;
var coverDepthCache = Object.create(null), coverDepthCacheKeys = [];
var aiDepthLastRunAt = 0, aiDepthMinGapMs = 18000;
var updatePreviewState = {
  visible: false,
  open: false,
  status: 'idle',
  progress: 0,
  timer: null,
  pollTimer: null,
  downloadJobId: '',
  patchJobId: '',
  mode: 'installer',
  installerPath: '',
  installerOpened: false,
  cached: false,
  currentVersion: '0.9.11',
  version: '1.1.0',
  configured: false,
  preview: true,
  updateAvailable: false,
  releaseUrl: '',
  downloadUrl: '',
  patchAvailable: false,
  patchUrl: '',
  received: 0,
  total: 0,
  speedBps: 0,
  etaSeconds: 0,
  sourceLabel: '',
  attempt: 0,
  attempts: 0,
  errorReason: '',
  errorDetail: '',
  failedAttempts: [],
  message: '',
  restartRequired: false,
  patchFallbackTried: false,
  hero: '当前版本，更新检测已就绪。',
  notes: [
    '安装包文字对比修复',
    '安装目录可自由选择',
    '单实例与快捷方式修复'
  ]
};
function readSavedVolume() {
  try {
    var v = parseFloat(localStorage.getItem('apex-player-volume'));
    return isFinite(v) ? Math.max(0, Math.min(1, v)) : 1.0;
  } catch (e) {
    return 1.0;
  }
}
function readDiyModePreference() {
  try { return localStorage.getItem(DIY_MODE_STORE_KEY) === '1'; } catch (e) { return false; }
}
function saveDiyModePreference(on) {
  try { localStorage.setItem(DIY_MODE_STORE_KEY, on ? '1' : '0'); } catch (e) {}
}
function readBooleanPreference(key, fallback) {
  try {
    var raw = localStorage.getItem(key);
    if (raw == null) return !!fallback;
    return raw === '1';
  } catch (e) {
    return !!fallback;
  }
}
function saveBooleanPreference(key, on) {
  try { localStorage.setItem(key, on ? '1' : '0'); } catch (e) {}
}
function applyUserCapsuleAutoHideState() {
  document.body.classList.toggle('user-capsule-auto-hide', !!userCapsuleAutoHide);
  var btn = document.getElementById('user-capsule-hide-btn');
  if (btn) {
    btn.classList.toggle('on', !!userCapsuleAutoHide);
    btn.textContent = userCapsuleAutoHide ? '›' : '‹';
    btn.title = userCapsuleAutoHide ? '取消自动隐藏账号胶囊' : '自动隐藏账号胶囊';
  }
}
function toggleUserCapsuleAutoHide(e) {
  if (e && e.stopPropagation) e.stopPropagation();
  userCapsuleAutoHide = !userCapsuleAutoHide;
  saveBooleanPreference(USER_CAPSULE_AUTO_HIDE_STORE_KEY, userCapsuleAutoHide);
  applyUserCapsuleAutoHideState();
  showToast(userCapsuleAutoHide ? '账号胶囊已自动隐藏' : '账号胶囊已固定显示');
}
function updateUserCapsuleAutoHideFromPointer(x, y) {
  if (!userCapsuleAutoHide || immersiveMode) {
    document.body.classList.remove('user-capsule-peek');
    return;
  }
  var nearTopRight = x > innerWidth - 112 && y < 126;
  document.body.classList.toggle('user-capsule-peek', nearTopRight);
}
function applyFxFabAutoHideState(opts) {
  opts = opts || {};
  document.body.classList.toggle('fx-fab-auto-hide', !!fxFabAutoHide);
  if (!fxFabAutoHide) {
    document.body.classList.remove('fx-fab-peek');
    fxFabAutoHideRevealArmed = true;
  } else if (opts.forceHidden) {
    document.body.classList.remove('fx-fab-peek');
    fxFabAutoHideRevealArmed = false;
  }
  var btn = document.getElementById('fx-fab-hide-btn');
  if (btn) {
    btn.classList.toggle('on', !!fxFabAutoHide);
    btn.textContent = fxFabAutoHide ? '›' : '‹';
    btn.title = fxFabAutoHide ? '取消自动隐藏视觉控制台' : '自动隐藏视觉控制台';
  }
}
function toggleFxFabAutoHide(e) {
  if (e && e.stopPropagation) e.stopPropagation();
  fxFabAutoHide = !fxFabAutoHide;
  saveBooleanPreference(FX_FAB_AUTO_HIDE_STORE_KEY, fxFabAutoHide);
  applyFxFabAutoHideState({ forceHidden: fxFabAutoHide });
  showToast(fxFabAutoHide ? '视觉控制台按钮已自动隐藏' : '视觉控制台按钮已固定显示');
}
function updateFxFabAutoHideFromPointer(x, y) {
  if (!fxFabAutoHide || !diyPlayerMode || immersiveMode) {
    document.body.classList.remove('fx-fab-peek');
    fxFabAutoHideRevealArmed = true;
    return;
  }
  var panel = document.getElementById('fx-panel');
  var panelOpen = !!(panel && (panel.classList.contains('peek') || panel.classList.contains('show')));
  var nearBottomRight = x > innerWidth - 126 && y > innerHeight - 158;
  if (!nearBottomRight) fxFabAutoHideRevealArmed = true;
  document.body.classList.toggle('fx-fab-peek', panelOpen || (nearBottomRight && fxFabAutoHideRevealArmed));
}
function layoutFullscreenDiyZone() {
  var width = innerWidth < 820 ? 104 : 128;
  var height = innerWidth < 720 ? 48 : 52;
  var left = innerWidth - 510;
  var top = 24;
  var anchor = document.querySelector('#top-right .top-account-pill') || document.getElementById('user-btn') || document.getElementById('top-right');
  if (anchor) {
    var rect = anchor.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      var gap = innerWidth < 820 ? 8 : 12;
      left = rect.left + rect.width / 2 - width / 2;
      top = rect.bottom + gap;
    }
  }
  left = Math.max(12, Math.min(innerWidth - width - 12, left));
  top = Math.max(8, Math.min(innerHeight - height - 8, top));
  document.documentElement.style.setProperty('--fullscreen-diy-left', left.toFixed(1) + 'px');
  document.documentElement.style.setProperty('--fullscreen-diy-top', top.toFixed(1) + 'px');
  document.documentElement.style.setProperty('--fullscreen-diy-width', width + 'px');
  return { left: left, top: top, width: width, height: height };
}
function shouldSuppressFullscreenDiyPeek() {
  var fxPanel = document.getElementById('fx-panel');
  var hotkeyModal = document.getElementById('hotkey-modal');
  var fxPanelOpen = !!(fxPanel && (fxPanel.classList.contains('peek') || fxPanel.classList.contains('show')));
  var hotkeyOpen = !!(hotkeyModal && hotkeyModal.classList.contains('show'));
  return !!(visualGuideActive || fxPanelOpen || hotkeyOpen);
}
function updateFullscreenDiyPeekFromPointer(x, y) {
  var isFullscreen = !!(desktopRuntimeState.fullscreen || desktopFullscreenActive || document.fullscreenElement || document.body.classList.contains('desktop-fullscreen'));
  if (!isFullscreen || immersiveMode || shouldSuppressFullscreenDiyPeek()) {
    document.body.classList.remove('fullscreen-diy-peek');
    return;
  }
  var rect = layoutFullscreenDiyZone();
  var anchor = document.querySelector('#top-right .top-account-pill') || document.getElementById('user-btn') || document.getElementById('top-right');
  var anchorRect = anchor ? anchor.getBoundingClientRect() : rect;
  var hitLeft = Math.min(rect.left, anchorRect.left) - 26;
  var hitRight = Math.max(rect.left + rect.width, anchorRect.right) + 26;
  var hitTop = Math.min(rect.top, anchorRect.top) - 18;
  var hitBottom = Math.max(rect.top + rect.height, anchorRect.bottom) + 16;
  var active = x >= hitLeft && x <= hitRight && y >= hitTop && y <= hitBottom;
  document.body.classList.toggle('fullscreen-diy-peek', active);
}
function isDiyMode() {
  return !!diyPlayerMode;
}
function syncDiyModeButton() {
  ['diy-mode-btn', 'fullscreen-diy-btn'].forEach(function(id) {
    var btn = document.getElementById(id);
    if (!btn) return;
    btn.classList.toggle('on', diyPlayerMode);
    btn.setAttribute('aria-pressed', diyPlayerMode ? 'true' : 'false');
    btn.title = diyPlayerMode ? '关闭 DIY 玩家模式' : '开启 DIY 玩家模式';
    btn.setAttribute('aria-label', btn.title);
  });
}
function applyDiyMode(on, opts) {
  opts = opts || {};
  diyPlayerMode = !!on;
  document.documentElement.classList.toggle('diy-mode-preload', diyPlayerMode);
  document.documentElement.classList.toggle('simple-mode-preload', !diyPlayerMode);
  document.body.classList.toggle('diy-mode', diyPlayerMode);
  document.body.classList.toggle('simple-mode', !diyPlayerMode);
  syncDiyModeButton();
  if (opts.save) saveDiyModePreference(diyPlayerMode);
  if (!diyPlayerMode) {
    toggleFxPanel(false);
    togglePlaylistPanel(false);
    closeUploadTip(false);
    var quality = document.getElementById('quality-control');
    var volume = document.getElementById('volume-control');
    if (quality) quality.classList.remove('open');
    if (volume) volume.classList.remove('open');
  }
  if (opts.toast) showToast(diyPlayerMode ? 'DIY 玩家模式已开启' : '已切回简约模式');
  if (opts.animate && window.gsap) {
    ['diy-mode-btn', 'fullscreen-diy-btn'].forEach(function(id) {
      var btn = document.getElementById(id);
      if (btn) window.gsap.fromTo(btn, { scale: 0.94 }, { scale: 1, duration: 0.34, ease: 'back.out(1.8)', overwrite: true });
    });
  }
}
function toggleDiyMode() {
  applyDiyMode(!diyPlayerMode, { save: true, toast: true, animate: true });
  if (visualGuideActive) {
    visualGuideState.mode = diyPlayerMode ? 'diy' : 'simple';
    showVisualGuideStep(0);
  }
}
var targetVolume = readSavedVolume();
var lastNonZeroVolume = targetVolume > 0.01 ? targetVolume : 0.8;
var volumeCloseTimer = null;

// v7.2: 离线节拍预解析
//   每次切歌, fetch 完整音频 → OfflineAudioContext 分析 → 标出真鼓点
//   缓存按 song.id 存, 避免重复
var beatMapCache = {};       // { songId: { kicks: [t1, t2, ...], duration: ... } }
var currentBeatMap = null;   // 当前播放的歌的 beatMap
var beatMapNextIdx = 0;      // 下一个待触发的 kick index
var beatMapBusy = false;     // 正在分析中
var beatMapToken = 0;        // 取消旧分析
var beatAnalysisTimer = null;
var beatAnalysisStartedAt = 0;
var beatPrefetchTimer = null;
var beatPrefetchBusy = false;
var beatPrefetchToken = 0;
var beatPrefetchLastKey = '';
var BEAT_PREFETCH_LIMIT = 2;
var beatDiskCacheStatus = { checked:false, enabled:false, mode:'unknown', reason:'' };
var beatDiskCacheNoticeLogged = false;
var djBeatMapCache = {};
var currentDjBeatMap = null;
var djBeatMapNextIdx = 0;
var djBeatPulseNextIdx = 0;
var djBeatMapBusy = false;
var djBeatMapToken = 0;
var djBeatAnalysisTimer = null;
var beatAnalysisConfig = {
  delayMs: 1600,
  minPlaybackSec: 1.2,
  idleTimeout: 1400,
  skipMusicTempoWhilePlaying: false
};
var beatCam = {
  nextIdx: 0,
  events: [],
  punch: 0,
  lookahead: 0.075,
  lastTriggerAt: -10,
  lastRealtimeAt: -10,
  minInterval: 0.500,
  fallbackMinInterval: 0.320,
  realtimeMinInterval: 0.460,
  realtimeMergeWindow: 0.135,
  attack: 0.028,
  hold: 0.030,
  release: 0.185,
  thetaKick: 0,
  phiKick: 0,
  radiusKick: 0,
  rollKick: 0,
  prevAudioTime: -1,
  stats: { map: 0, live: 0, merged: 0, liveBlocked: 0 }
};
var liveCamAvg = 0, liveCamPeak = 0.28, liveCamLastRaw = 0;
var cinemaDynamics = { avg: 0, lowAvg: 0, peak: 0.30, scale: 0.82 };
var cinemaTrackProfile = {
  scale: 1.0,
  target: 1.0,
  nameHint: 1.0,
  frames: 0,
  energyAvg: 0,
  lowAvg: 0,
  vocalAvg: 0,
  melodyAvg: 0,
  punchPeak: 0.10,
  density: 0
};
var rtBeat = {
  subFast: 0, subSlow: 0, lowFast: 0, lowSlow: 0,
  bodyFast: 0, bodySlow: 0, vocalFast: 0, vocalSlow: 0, snapFast: 0, snapSlow: 0,
  prevSub: 0, prevLow: 0, prevBody: 0, prevVocal: 0, prevSnap: 0, prevRms: 0,
  onsetAvg: 0.012, onsetPeak: 0.060,
  subPeak: 0.14, lowPeak: 0.18, bodyPeak: 0.16, vocalPeak: 0.16, snapPeak: 0.14,
  lastHitAt: -10,
  tempoGap: 0,
  tempoConfidence: 0,
  beatCount: 0,
  primedFrames: 0,
  warmupUntil: 0,
  pulse: 0,
  score: 0,
  stats: { hits: 0, blocked: 0, assisted: 0, strong: 0, rejected: 0 }
};
var djMode = {
  active: false,
  songKey: '',
  startedAt: 0,
  lastNoticeAt: -100000,
  tempoGap: 0,
  tempoConfidence: 0,
  sectionEnergy: 0,
  sectionLow: 0,
  sectionChange: 0,
  visualPulse: 0,
  lastBeatAt: -10
};

function isPodcastSong(song) {
  return !!(song && song.type === 'podcast');
}

function djSongKey(song) {
  if (!song) return '';
  if (song.localKey) return 'local:' + song.localKey;
  return 'podcast:' + (song.programId || song.id || song.name || '');
}

function resetDjModeMeter() {
  djMode.tempoGap = 0;
  djMode.tempoConfidence = 0;
  djMode.sectionEnergy = 0;
  djMode.sectionLow = 0;
  djMode.sectionChange = 0;
  djMode.visualPulse = 0;
  djMode.lastBeatAt = -10;
}

function resetDjBeatMapState() {
  currentDjBeatMap = null;
  djBeatMapNextIdx = 0;
  djBeatPulseNextIdx = 0;
}

function cancelDjBeatAnalysisTimer() {
  if (djBeatAnalysisTimer) {
    clearTimeout(djBeatAnalysisTimer);
    djBeatAnalysisTimer = null;
  }
}

function setDjModeActive(active, song) {
  active = !!active;
  var key = active ? djSongKey(song) : '';
  var changed = djMode.active !== active || djMode.songKey !== key;
  djMode.active = active;
  djMode.songKey = key;
  if (changed) {
    djMode.startedAt = performance.now();
    resetDjModeMeter();
  }
  if (active) {
    currentBeatMap = null;
    beatMapNextIdx = 0;
    cancelBeatAnalysisTimer();
    hideBeatChip();
  } else {
    djBeatMapToken++;
    cancelDjBeatAnalysisTimer();
    resetDjBeatMapState();
  }
}

function maybeAnnounceDjMode() {
  if (!djMode.active) return;
  var now = performance.now();
  if (now - djMode.lastNoticeAt > 8000) {
    djMode.lastNoticeAt = now;
    showToast('DJ Mode · 离线锁拍');
  }
}

// fx 状态: 预设 + 主滑块 + 开关 + 三态
var fxDefaults = {
  preset: 0,            // 0=emily cover, 1=tunnel, 2=orbit, 3=void, 4=vinyl, 5=wallpaper, 6=skull
  intensity: 0.85,
  cinemaShake: 0.5,
  depth: 1.0,
  coverResolution: 1.55,
  point: 1.0, speed: 1.0, twist: 0.0, color: 1.10, scatter: 0.0, bgFade: 0.20,
  bloomStrength: 0.62,
  lyricGlowStrength: 0.28,
  lyricScale: 1.0,
  lyricOffsetX: 0,
  lyricOffsetY: 0,
  lyricOffsetZ: 0,
  lyricTiltX: 0,
  lyricTiltY: 0,
  lyricColorMode: 'auto',
  lyricColor: '#a9b8c8',
  lyricHighlightMode: 'auto',
  lyricHighlightColor: '#fac900',
  lyricGlowLinked: true,
  lyricGlowColor: '#008aff',
  lyricFont: 'hei',
  lyricLetterSpacing: 0,
  lyricLineHeight: 1.0,
  lyricWeight: 900,
  visualTintMode: 'auto',
  visualTintColor: '#9db8cf',
  uiAccentColor: '#ffffff',
  homeAccentColor: '#ffffff',
  homeIconColor: '#ffffff',
  visualIconColor: '#ffffff',
  backgroundColorMode: 'cover',
  backgroundColor: '#000000',
  backgroundOpacity: 1,
  controlGlassChromaticOffset: 90,
  backgroundColorCustom: false,
  backgroundImage: '',
  backgroundMedia: null,
  desktopLyrics: false,
  desktopLyricsSize: 1.0,
  desktopLyricsOpacity: 0.92,
  desktopLyricsY: 0.76,
  desktopLyricsClickThrough: false,
  desktopLyricsCinema: true,
  desktopLyricsHighlight: false,
  desktopLyricsFps: 60,
  wallpaperMode: false,
  wallpaperOpacity: 1,
  floatLayer: false, cinema: true, edge: false, aiDepth: false, bloom: false, lyricGlow: true,
  lyricGlowBeat: true,
  lyricGlowParticles: false,
  lyricCameraLock: false,
  particleLyrics: true,    // v7.2: 粒子歌词
  backCover: false,        // 旧的封面背面粒子层关闭；浮空粒子层会跟随封面翻转
  shelf: 'side',
  shelfCameraMode: 'static',
  shelfPresence: 'always',
  shelfShowPodcasts: false,
  shelfMergeCollections: false,
  shelfSize: 1,
  shelfOffsetX: 0,
  shelfOffsetY: 0,
  shelfOffsetZ: 0,
  shelfAngleY: -15,
  shelfAngleYManual: false,
  shelfOpacity: 1,
  shelfBgOpacity: 0.90,
  shelfAccentColor: '#ffffff',
  performanceBackground: 'auto',
  performanceQuality: 'high',
  liveBackgroundKeep: false,
  cam: 'off',
};
var PACKAGED_DEFAULT_USER_FX_ARCHIVE_NAME = '默认测试';
var PACKAGED_DEFAULT_USER_FX_ARCHIVE_EXPORTED_AT = 1782276031784;
var PACKAGED_DEFAULT_USER_FX_ARCHIVE_SAVED_AT = 1782273019045;
var PACKAGED_DEFAULT_FX_SNAPSHOT = Object.freeze({
  visualPresetSchema: VISUAL_PRESET_SCHEMA,
  preset: 0,
  intensity: 0.85,
  cinemaShake: 0.5,
  depth: 1,
  coverResolution: 1.55,
  point: 1,
  speed: 1,
  twist: 0,
  color: 1.1,
  scatter: 0,
  bgFade: 0.2,
  bloomStrength: 0.62,
  lyricGlowStrength: 0.28,
  lyricScale: 1,
  lyricOffsetX: 0,
  lyricOffsetY: 0,
  lyricOffsetZ: 0,
  lyricTiltX: 0,
  lyricTiltY: 0,
  lyricCameraLock: false,
  lyricColorMode: 'auto',
  lyricColor: '#a9b8c8',
  lyricHighlightMode: 'auto',
  lyricHighlightColor: '#fac900',
  lyricGlowLinked: true,
  lyricGlowColor: '#008aff',
  lyricFont: 'hei',
  lyricLetterSpacing: 0,
  lyricLineHeight: 1,
  lyricWeight: 900,
  visualTintMode: 'auto',
  visualTintColor: '#9db8cf',
  uiAccentColor: '#ffffff',
  homeAccentColor: '#ffffff',
  homeIconColor: '#ffffff',
  visualIconColor: '#ffffff',
  backgroundColorMode: 'cover',
  backgroundColor: '#000000',
  backgroundOpacity: 1,
  controlGlassChromaticOffset: 90,
  backgroundColorCustom: false,
  floatLayer: false,
  cinema: true,
  edge: false,
  aiDepth: false,
  bloom: false,
  lyricGlow: true,
  lyricGlowBeat: true,
  lyricGlowParticles: false,
  desktopLyrics: false,
  desktopLyricsSize: 1,
  desktopLyricsOpacity: 0.92,
  desktopLyricsY: 0.76,
  desktopLyricsClickThrough: false,
  desktopLyricsCinema: true,
  desktopLyricsHighlight: false,
  desktopLyricsFps: 60,
  performanceBackground: 'auto',
  performanceQuality: 'high',
  liveBackgroundKeep: false,
  particleLyrics: true,
  backCover: false,
  shelf: 'side',
  shelfCameraMode: 'static',
  shelfPresence: 'always',
  shelfShowPodcasts: false,
  shelfMergeCollections: false,
  shelfSize: 1,
  shelfOffsetX: 0,
  shelfOffsetY: 0,
  shelfOffsetZ: 0,
  shelfAngleY: -15,
  shelfAngleYManual: false,
  shelfOpacity: 1,
  shelfBgOpacity: 0.9,
  shelfAccentColor: '#ffffff',
  cam: 'off'
});
function clonePackagedDefaultFxSnapshot() {
  return Object.assign({}, PACKAGED_DEFAULT_FX_SNAPSHOT);
}
function packagedDefaultLyricLayoutRaw() {
  return Object.assign({ desktopLyricsSchema: 'desktop-lyrics-v3' }, clonePackagedDefaultFxSnapshot());
}
var DEVELOPMENT_LOCKED_FX = {
  wallpaperMode: true
};
function isDevelopmentLockedFx(key) {
  return !!DEVELOPMENT_LOCKED_FX[key];
}
function normalizeDevelopmentLockedFxState() {
  if (!fx) return;
  fx.wallpaperMode = false;
}
function readSavedPlaybackVisualPreset() {
  try {
    var raw = JSON.parse(localStorage.getItem(LYRIC_LAYOUT_STORE_KEY) || '{}') || {};
    if (!Object.prototype.hasOwnProperty.call(raw, 'preset')) return fxDefaults.preset;
    var savedPreset = clampRange(Number(raw.preset) || 0, 0, 6);
    if (savedPreset === 3 && raw.visualPresetSchema !== VISUAL_PRESET_SCHEMA) savedPreset = 5;
    return savedPreset;
  } catch (e) {
    return fxDefaults.preset;
  }
}
var playbackVisualPreset = readSavedPlaybackVisualPreset();
var startupVisualPreviewActive = false;
var fx = Object.assign({}, fxDefaults, readSavedLyricLayout());
normalizeDevelopmentLockedFxState();
var presetTransition = { active:false, start:-10, duration:0.92, from:0, to:0 };
var controlsAutoHide = readBooleanPreference(CONTROLS_AUTO_HIDE_STORE_KEY, false);
var controlsHovering = false;
var controlsHideTimer = null;
var controlsHandleDimTimer = null;
var controlsLastMoveAt = 0;
var controlsShelfSuppressUntil = 0;
var cursorHideTimer = null;
var CURSOR_HIDE_DELAY = 2500;
var fxPanelPinned = false;
var playlistPanelPinned = readBooleanPreference(PLAYLIST_PANEL_PIN_STORE_KEY, false);
var userCapsuleAutoHide = readBooleanPreference(USER_CAPSULE_AUTO_HIDE_STORE_KEY, false);
var fxFabAutoHide = readBooleanPreference(FX_FAB_AUTO_HIDE_STORE_KEY, false);
var fxFabAutoHideRevealArmed = true;
var hotkeySettings = readHotkeySettings();
var immersiveMode = false;
var immersiveState = {
  shelfMode: null,
  shelfPinnedOpen: false,
  lyrics: true,
  controlsAutoHide: true,
  bottomVisible: false
};

// 鼠标 / 摄像头视差
var pointerParallax = { x:0, y:0 };
var pointerTarget = { x:0, y:0 };
var headParallax = { x:0, y:0, active:false };
var headNeutral = null;

function pulseObjectValue(target, key, amount, duration) {
  if (!target) return;
  target[key] = Math.max(target[key] || 0, amount || 1);
  if (window.gsap) {
    window.gsap.killTweensOf(target, key);
    var vars = { duration: duration || 0.42, ease: 'power3.out' };
    vars[key] = 0;
    window.gsap.to(target, vars);
  } else {
    setTimeout(function(){ if (target) target[key] = 0; }, (duration || 0.42) * 1000);
  }
}

var desktopRuntimeState = {
  desktop: !!window.desktopWindow,
  minimized: false,
  visible: true,
  focused: true,
  fullscreen: false
};
var renderPowerState = { mode: '', width: 0, height: 0, pixelRatio: 0 };
var backgroundCacheTrimTimer = 0;
var runtimePerfState = {
  lastCacheTrimAt: 0,
  cacheTrimCount: 0,
  lastCacheTrimReason: '',
  lastHeapSampleAt: 0,
  heapMB: 0,
  cacheCounts: {}
};
function isDeepBackgroundMode() {
  if (isLiveBackgroundKeepMode()) return false;
  return !!(document.hidden || desktopRuntimeState.minimized || desktopRuntimeState.visible === false);
}
function currentPerformanceBackgroundMode() {
  return normalizePerformanceBackgroundMode(fx && fx.performanceBackground, fx && fx.liveBackgroundKeep === true);
}
function isLiveBackgroundKeepMode() {
  return currentPerformanceBackgroundMode() === 'keep';
}
function isBackgroundReleaseMode() {
  return currentPerformanceBackgroundMode() === 'release';
}
function isHiddenForBackgroundOptimization() {
  return !!(document.hidden && !isLiveBackgroundKeepMode());
}
function isVisibleBackgroundMode() {
  return false;
}
function updateRenderPowerClasses() {
  document.body.classList.toggle('render-deep-sleep', isDeepBackgroundMode());
  document.body.classList.toggle('render-background-eco', isVisibleBackgroundMode());
}
function safeObjectKeys(obj) {
  try { return obj ? Object.keys(obj) : []; } catch (e) { return []; }
}
function markProtectedKey(map, key) {
  if (key) map[String(key)] = true;
}
function collectProtectedCoverUrls() {
  var keep = Object.create(null);
  function mark(url) { if (url) keep[String(url)] = true; }
  try {
    var song = (typeof currentCoverSong === 'function') ? currentCoverSong() : (playQueue && currentIdx >= 0 ? playQueue[currentIdx] : null);
    if (song) {
      mark(song.cover);
      if (typeof songCoverSrc === 'function') {
        mark(songCoverSrc(song, 60));
        mark(songCoverSrc(song, 360));
        mark(songCoverSrc(song, 400));
      }
    }
    if (typeof currentCoverSource !== 'undefined' && currentCoverSource && currentCoverSource.src) mark(currentCoverSource.src);
    if (typeof playlistPanelDetailState !== 'undefined' && playlistPanelDetailState && playlistPanelDetailState.playlist) {
      var cover = playlistPanelDetailState.playlist.cover;
      mark(cover);
      if (typeof coverUrlWithSize === 'function') {
        mark(coverUrlWithSize(cover, 88));
        mark(coverUrlWithSize(cover, 96));
      }
    }
    if (shelfManager && shelfManager.getCards) {
      shelfManager.getCards().forEach(function(card){
        if (card && card.item) mark(card.item.cover);
      });
    }
  } catch (e) {}
  return keep;
}
function collectProtectedBeatMapKeys() {
  var keep = Object.create(null);
  try {
    if (typeof beatMapSongKey === 'function' && playQueue && playQueue.length) {
      var start = Math.max(0, currentIdx - 5);
      var end = Math.min(playQueue.length - 1, currentIdx + 5);
      for (var i = start; i <= end; i++) markProtectedKey(keep, beatMapSongKey(playQueue[i]));
    }
    if (typeof beatPrefetchLastKey !== 'undefined') markProtectedKey(keep, beatPrefetchLastKey);
    if (typeof djMode !== 'undefined' && djMode && djMode.songKey) markProtectedKey(keep, djMode.songKey);
    if (typeof localBeatAnalysis !== 'undefined' && localBeatAnalysis && localBeatAnalysis.song && typeof beatMapSongKey === 'function') {
      markProtectedKey(keep, beatMapSongKey(localBeatAnalysis.song));
    }
  } catch (e) {}
  return keep;
}
function collectProtectedCoverDepthIds() {
  var keep = Object.create(null);
  try {
    if (typeof coverDepthCacheId !== 'function') return keep;
    var candidates = [];
    if (typeof currentCoverSource !== 'undefined' && currentCoverSource && currentCoverSource.src) candidates.push(currentCoverSource.src);
    var song = (typeof currentCoverSong === 'function') ? currentCoverSong() : null;
    if (song && typeof songCoverSrc === 'function') {
      candidates.push(songCoverSrc(song, 360));
      candidates.push(songCoverSrc(song, 400));
    }
    var texImg = (typeof coverTex !== 'undefined' && coverTex && coverTex.image) ? coverTex.image : null;
    var w = texImg && texImg.width ? texImg.width : 0;
    var h = texImg && texImg.height ? texImg.height : 0;
    candidates.forEach(function(src){
      if (src) markProtectedKey(keep, coverDepthCacheId(src + '|tex=' + w + 'x' + h));
    });
  } catch (e) {}
  return keep;
}
function trimObjectCache(cache, keep, protectedKeys, skipRecord) {
  var keys = safeObjectKeys(cache);
  if (!cache || keys.length <= keep) return 0;
  var drop = keys.length - keep;
  var dropped = 0;
  for (var i = 0; i < keys.length && drop > 0; i++) {
    var key = keys[i];
    if (protectedKeys && protectedKeys[key]) continue;
    var rec = cache[key];
    if (skipRecord && skipRecord(rec, key)) continue;
    delete cache[key];
    drop--;
    dropped++;
  }
  return dropped;
}
function trimCoverDepthCache(keep, protectedKeys) {
  if (!coverDepthCache || !coverDepthCacheKeys) return 0;
  var keys = coverDepthCacheKeys.filter(function(key){ return !!coverDepthCache[key]; });
  if (keys.length <= keep) {
    coverDepthCacheKeys = keys;
    return 0;
  }
  var keepSet = Object.create(null);
  var count = 0;
  for (var i = keys.length - 1; i >= 0 && count < keep; i--) {
    keepSet[keys[i]] = true;
    count++;
  }
  Object.keys(protectedKeys || {}).forEach(function(key){ keepSet[key] = true; });
  var dropped = 0;
  keys.forEach(function(key){
    if (keepSet[key]) return;
    delete coverDepthCache[key];
    dropped++;
  });
  coverDepthCacheKeys = keys.filter(function(key){ return !!coverDepthCache[key]; });
  return dropped;
}
function collectRuntimePerfSnapshot(now) {
  now = now || performance.now();
  runtimePerfState.cacheCounts = {
    playlistCovers: safeObjectKeys(playlistCoverCache).length,
    coverDepth: coverDepthCacheKeys ? coverDepthCacheKeys.length : 0,
    beatMaps: safeObjectKeys(beatMapCache).length,
    djBeatMaps: safeObjectKeys(djBeatMapCache).length
  };
  if (performance && performance.memory && now - runtimePerfState.lastHeapSampleAt > 12000) {
    runtimePerfState.lastHeapSampleAt = now;
    runtimePerfState.heapMB = Math.round((performance.memory.usedJSHeapSize || 0) / 1048576);
  }
  return {
    render: (typeof renderPerfState !== 'undefined') ? {
      mode: renderPerfState.mode,
      fps: renderPerfState.fps,
      skipped: renderPerfState.skipped,
      longFrames: renderPerfState.longFrames
    } : null,
    runtime: runtimePerfState,
    renderer: (typeof renderer !== 'undefined' && renderer && renderer.info) ? {
      geometries: renderer.info.memory && renderer.info.memory.geometries,
      textures: renderer.info.memory && renderer.info.memory.textures,
      calls: renderer.info.render && renderer.info.render.calls,
      triangles: renderer.info.render && renderer.info.render.triangles
    } : null,
    viewport: (typeof renderer !== 'undefined' && renderer && renderer.domElement) ? {
      width: innerWidth,
      height: innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
      renderPixelRatio: renderer.getPixelRatio ? Number(renderer.getPixelRatio().toFixed(3)) : 0,
      canvasWidth: renderer.domElement.width || 0,
      canvasHeight: renderer.domElement.height || 0,
      renderPixels: (renderer.domElement.width || 0) * (renderer.domElement.height || 0),
      targetFps: (typeof getAdaptiveRenderFps === 'function') ? getAdaptiveRenderFps() : 0,
      interactionBoost: (typeof isRenderInteractionActive === 'function') ? isRenderInteractionActive() : false,
      interactionReason: (typeof renderInteractionReason !== 'undefined') ? renderInteractionReason : ''
    } : null,
    deepSleep: isDeepBackgroundMode()
  };
}
window.__mineradioPerfSnapshot = collectRuntimePerfSnapshot;
function trimRuntimeCaches(reason, aggressive) {
  var protectedCovers = collectProtectedCoverUrls();
  var protectedBeats = collectProtectedBeatMapKeys();
  var dropped = 0;
  dropped += trimObjectCache(playlistCoverCache, aggressive ? 72 : 180, protectedCovers, function(rec){
    return rec && rec.loading;
  });
  dropped += trimCoverDepthCache(aggressive ? 4 : 10, collectProtectedCoverDepthIds());
  dropped += trimObjectCache(beatMapCache, aggressive ? 12 : 36, protectedBeats);
  dropped += trimObjectCache(djBeatMapCache, aggressive ? 4 : 12, protectedBeats);
  if (aggressive && typeof renderer !== 'undefined' && renderer && renderer.renderLists && renderer.renderLists.dispose) {
    try { renderer.renderLists.dispose(); } catch (e) {}
  }
  runtimePerfState.lastCacheTrimAt = performance.now();
  runtimePerfState.cacheTrimCount += 1;
  runtimePerfState.lastCacheTrimReason = reason || (aggressive ? 'deep' : 'active');
  collectRuntimePerfSnapshot(runtimePerfState.lastCacheTrimAt);
  return dropped;
}
function trimVisualCachesForBackground() {
  if (!isDeepBackgroundMode()) return;
  trimRuntimeCaches('deep-background', true);
}
function scheduleBackgroundCacheTrim() {
  if (!isDeepBackgroundMode()) return;
  if (backgroundCacheTrimTimer) clearTimeout(backgroundCacheTrimTimer);
  backgroundCacheTrimTimer = setTimeout(function(){
    backgroundCacheTrimTimer = 0;
    trimVisualCachesForBackground();
  }, 900);
}
function maybeTrimRuntimeCaches(now) {
  now = now || performance.now();
  var deep = isDeepBackgroundMode();
  var gap = deep ? (isBackgroundReleaseMode() ? 3600 : 7000) : 45000;
  if (!deep && now < 30000) return;
  if (now - runtimePerfState.lastCacheTrimAt < gap) return;
  trimRuntimeCaches(deep ? (isBackgroundReleaseMode() ? 'release-frame' : 'deep-frame') : 'active-frame', deep);
}
function applyRendererPowerMode() {
  if (typeof renderer === 'undefined' || !renderer) return;
  var deep = isDeepBackgroundMode();
  var width = deep ? 4 : Math.max(1, innerWidth);
  var height = deep ? 4 : Math.max(1, innerHeight);
  var pixelRatio = getRenderPixelRatio();
  var mode = deep ? 'sleep' : 'active';
  if (renderPowerState.mode === mode && renderPowerState.width === width && renderPowerState.height === height && Math.abs(renderPowerState.pixelRatio - pixelRatio) < 0.001) return;
  renderPowerState = { mode: mode, width: width, height: height, pixelRatio: pixelRatio };
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  if (typeof uniforms !== 'undefined' && uniforms && uniforms.uPixel) uniforms.uPixel.value = renderer.getPixelRatio();
  if (deep) {
    if (renderer.renderLists && renderer.renderLists.dispose) renderer.renderLists.dispose();
    scheduleBackgroundCacheTrim();
  }
}
function updateDesktopRuntimeState(state) {
  state = state || {};
  var wasFullscreen = desktopRuntimeState.fullscreen;
  var wasDeep = isDeepBackgroundMode();
  desktopRuntimeState.desktop = !!window.desktopWindow;
  desktopRuntimeState.minimized = !!state.isMinimized;
  desktopRuntimeState.visible = state.isVisible !== false;
  desktopRuntimeState.focused = state.isFocused !== false;
  desktopRuntimeState.fullscreen = !!(state.isFullScreen || state.isNativeFullScreen || state.isHtmlFullScreen || state.isWindowFullScreen);
  updateRenderPowerClasses();
  applyRendererPowerMode();
  if (fx && (fx.desktopLyrics || fx.wallpaperMode)) setTimeout(syncDesktopOverlayState, 0);
  if (wasDeep && !isDeepBackgroundMode()) recoverVisualsAfterBackground('desktop-runtime-state');
  if (desktopRuntimeState.fullscreen !== wasFullscreen) scheduleMainRendererViewportRefresh('desktop-runtime-state');
}
function installRenderPowerHooks() {
  updateRenderPowerClasses();
  document.addEventListener('visibilitychange', function(){
    updateRenderPowerClasses();
    applyRendererPowerMode();
    if (!isDeepBackgroundMode()) recoverVisualsAfterBackground('visibilitychange');
  });
  window.addEventListener('focus', function(){
    desktopRuntimeState.focused = true;
    updateRenderPowerClasses();
    applyRendererPowerMode();
    if (!isDeepBackgroundMode()) recoverVisualsAfterBackground('focus');
  });
  window.addEventListener('blur', function(){
    desktopRuntimeState.focused = false;
    updateRenderPowerClasses();
    applyRendererPowerMode();
  });
  if (window.desktopWindow && typeof window.desktopWindow.onStateChange === 'function') {
    window.desktopWindow.onStateChange(updateDesktopRuntimeState);
    if (typeof window.desktopWindow.getState === 'function') {
      window.desktopWindow.getState().then(updateDesktopRuntimeState).catch(function(){});
    }
  }
}

