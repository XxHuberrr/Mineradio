const btnOpen = document.getElementById('btnOpen');
const listEl = document.getElementById('list');
const searchEl = document.getElementById('search');
const audio = document.getElementById('audio');
const playBtn = document.getElementById('play');
const prevBtn = document.getElementById('prev');
const nextBtn = document.getElementById('next');
const nowEl = document.getElementById('now');
const nowMeta = document.getElementById('nowMeta');
const statusText = document.getElementById('statusText');
const trackCount = document.getElementById('trackCount');
const currentTimeEl = document.getElementById('currentTime');
const totalTimeEl = document.getElementById('totalTime');
const progressEl = document.getElementById('progress');
const lyricsEl = document.getElementById('lyrics');
const favBtn = document.getElementById('btnFav');
const loadLrcBtn = document.getElementById('btnLoadLrc');
const visualizer = document.getElementById('visualizer');

let tracks = [];
let filtered = [];
let index = -1;
let currentTrack = null;

// Audio visualizer setup
let audioCtx = null;
let analyser = null;
let dataArray = null;
let rafId = null;
const canvas = visualizer;
const ctx = canvas.getContext('2d');
let particles = [];

function initAudioAnalysis() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  try {
    const src = audioCtx.createMediaElementSource(audio);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);
    src.connect(analyser);
    analyser.connect(audioCtx.destination);
    createParticles(80);
    tickVisualizer();
  } catch (e) {
    console.warn('Audio analysis init failed', e);
  }
}

function createParticles(n) {
  const w = canvas.width = Math.max(480, canvas.clientWidth);
  const h = canvas.height = 180;
  particles = [];
  for (let i = 0; i < n; i++) {
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6,
      size: 2 + Math.random() * 4,
      hue: 180 + Math.random() * 120
n    });
  }
}

function tickVisualizer() {
  if (!analyser) return;
  analyser.getByteFrequencyData(dataArray);
  const avg = dataArray.reduce((s, v) => s + v, 0) / dataArray.length / 255;

  // draw background
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(8,12,20,0.2)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // update particles
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    p.x += p.vx + (Math.random() - 0.5) * 0.4;
    p.y += p.vy + (Math.random() - 0.5) * 0.4;

    // wrap
    if (p.x < -10) p.x = canvas.width + 10;
    if (p.x > canvas.width + 10) p.x = -10;
    if (p.y < -10) p.y = canvas.height + 10;
    if (p.y > canvas.height + 10) p.y = -10;

    const s = p.size * (1 + avg * 3);
    ctx.beginPath();
    ctx.fillStyle = `hsla(${p.hue}, 80%, 60%, ${0.6 + avg * 0.4})`;
    ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
    ctx.fill();
  }

  // waveform bar at bottom
  const barW = canvas.width / dataArray.length;
  for (let i = 0; i < dataArray.length; i++) {
    const v = dataArray[i] / 255;
    ctx.fillStyle = `rgba(120,214,255,${0.15 + v * 0.6})`;
    ctx.fillRect(i * barW, canvas.height - v * 50 - 6, barW * 0.9, v * 50 + 6);
  }

  rafId = requestAnimationFrame(tickVisualizer);
}

function stopVisualizer() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
}

// Simple LRC parser
function parseLRC(text) {
  const lines = text.split(/\r?\n/);
  const entries = [];
  const timeRe = /\[(\d+):(\d+)(?:\.(\d+))?\]/g;
  for (const line of lines) {
    let m;
    let lastIndex = 0;
    while ((m = timeRe.exec(line)) !== null) {
      lastIndex = timeRe.lastIndex;
      const min = parseInt(m[1], 10);
      const sec = parseInt(m[2], 10);
      const ms = m[3] ? parseInt((m[3] + '00').slice(0,3), 10) : 0;
      const t = min * 60 + sec + ms / 1000;
      const textPart = line.slice(lastIndex).trim();
      if (textPart) entries.push({ time: t, text: textPart });
    }
  }
  entries.sort((a,b)=>a.time-b.time);
  return entries;
}

let currentLrc = [];
let lrcIndex = 0;

function updateLyrics(time) {
  if (!currentLrc.length) return;
  while (lrcIndex + 1 < currentLrc.length && time >= currentLrc[lrcIndex+1].time) lrcIndex++;
  while (lrcIndex > 0 && time < currentLrc[lrcIndex].time) lrcIndex--;
  const nowLine = currentLrc[lrcIndex] ? currentLrc[lrcIndex].text : '';
  lyricsEl.textContent = nowLine || '—';
}

async function tryLoadLrcFor(track) {
  if (!track || !track.path) return false;
  const base = track.path.replace(/\.[^.]+$/, '');
  const candidates = [base + '.lrc', base + '.LRC'];
  for (const c of candidates) {
    const text = await window.api.readFile(c);
    if (text) {
      currentLrc = parseLRC(text);
      lrcIndex = 0;
      lyricsEl.textContent = currentLrc.length ? currentLrc[0].text : '无歌词内容';
      return true;
    }
  }
  return false;
}

// favorites & recent (localStorage)
function loadMeta() {
  try { return JSON.parse(localStorage.getItem('mr.meta') || '{}'); } catch { return {}; }
}
function saveMeta(meta) { localStorage.setItem('mr.meta', JSON.stringify(meta)); }
function toggleFavorite(track) {
  if (!track) return;
  const meta = loadMeta();
  meta.favorites = meta.favorites || {};
  if (meta.favorites[track.path]) delete meta.favorites[track.path];
  else meta.favorites[track.path] = { title: track.title || track.name, at: Date.now() };
  saveMeta(meta);
  updateFavButton(track);
}
function updateFavButton(track) {
  const meta = loadMeta();
  const isFav = track && meta.favorites && meta.favorites[track.path];
  favBtn.textContent = isFav ? '★ 已收藏' : '☆ 收藏';
}
function pushRecent(track) {
  if (!track) return;
  const meta = loadMeta();
  meta.recent = meta.recent || [];
  meta.recent = meta.recent.filter(r => r.path !== track.path);
  meta.recent.unshift({ path: track.path, title: track.title || track.name, at: Date.now() });
  if (meta.recent.length > 100) meta.recent.length = 100;
  saveMeta(meta);
}

// wiring
favBtn.addEventListener('click', () => { toggleFavorite(currentTrack); });
loadLrcBtn.addEventListener('click', async () => {
  if (!currentTrack) return;
  const ok = await tryLoadLrcFor(currentTrack);
  if (!ok) updateStatus('未找到对应 .lrc 文件');
});

function formatTime(value) {
  if (!Number.isFinite(value) || value < 0) return '00:00';
  const totalSeconds = Math.floor(value);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function setPlayButtonState(paused) {
  playBtn.textContent = paused ? '播放' : '暂停';
}

function renderList(items) {
  listEl.innerHTML = '';

  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'empty-state';
    li.textContent = '暂无匹配歌曲';
    listEl.appendChild(li);
    return;
  }

  items.forEach((track, i) => {
    const li = document.createElement('li');
    li.dataset.index = String(i);
    li.className = currentTrack && currentTrack.path === track.path ? 'active' : '';

    const idx = document.createElement('span');
    idx.className = 'track-index';
    idx.textContent = String(i + 1);

    const title = document.createElement('span');
    title.className = 'track-title';
    title.textContent = track.title || track.name;

    li.append(idx, title);
    li.addEventListener('click', () => playIndex(i));
    listEl.appendChild(li);
  });
}

function updateTrackLabel(track) {
  if (!track) {
    nowEl.textContent = '未播放';
    nowMeta.textContent = '请选择本地音乐文件夹';
    return;
  }

  nowEl.textContent = track.title || track.name;
  nowMeta.textContent = `${track.name}`;
  updateFavButton(track);
}

function updateStatus(message) {
  statusText.textContent = message;
}

function playIndex(i) {
  if (!filtered[i]) return;

  const selected = filtered[i];
  index = i;

  currentTrack = selected;
  audio.src = selected.url;
  audio.play();
  updateTrackLabel(selected);
  renderList(filtered);
  setPlayButtonState(false);
  updateStatus(`正在播放：${selected.title || selected.name}`);

  // audio analysis start
  initAudioAnalysis();
  pushRecent(selected);

  // attempt automatic .lrc load
  tryLoadLrcFor(selected).then(ok => { if (!ok) { /* silent */ } });
}

function syncFromTracks() {
  filtered = tracks.slice();
  renderList(filtered);
  trackCount.textContent = String(filtered.length);
  if (!filtered.length) {
    updateStatus('待加载音乐');
    updateTrackLabel(null);
    currentTimeEl.textContent = '00:00';
    totalTimeEl.textContent = '00:00';
    progressEl.value = 0;
  }
}

btnOpen.addEventListener('click', async () => {
  const res = await window.api.selectFolder();
  const files = (res && res.files) ? res.files : [];
  const dir = (res && res.dir) ? res.dir : null;
  tracks = files;
  syncFromTracks();

  if (dir) {
    try { await window.api.saveState({ lastFolder: dir }); } catch (e) { /* ignore */ }
  }

  if (tracks.length) {
    updateStatus(`已加载 ${tracks.length} 首音乐`);
    if (!audio.src) {
      playIndex(0);
    }
  }
});

searchEl.addEventListener('input', () => {
  const q = searchEl.value.trim().toLowerCase();
  filtered = tracks.filter((track) => {
    const combined = `${track.name} ${track.title || ''}`.toLowerCase();
    return combined.includes(q);
  });

  trackCount.textContent = String(filtered.length);
  renderList(filtered);
  updateStatus(q ? `搜索结果：${filtered.length} 首` : `已加载 ${tracks.length} 首音乐`);

  if (filtered.length === 0) {
    currentTrack = null;
    updateTrackLabel(null);
  }
});

playBtn.addEventListener('click', () => {
  if (!audio.src && filtered.length) {
    playIndex(0);
    return;
  }

  if (!audio.src) {
    updateStatus('请先选择音乐文件夹');
    return;
  }

  if (audio.paused) {
    audio.play();
    setPlayButtonState(false);
    updateStatus(`继续播放：${currentTrack ? currentTrack.title || currentTrack.name : '当前歌曲'}`);
  } else {
    audio.pause();
    setPlayButtonState(true);
    updateStatus('已暂停');
  }
});

prevBtn.addEventListener('click', () => {
  if (!filtered.length) return;
  if (index <= 0) {
    index = filtered.length - 1;
  } else {
    index -= 1;
  }
  playIndex(index);
});

nextBtn.addEventListener('click', () => {
  if (!filtered.length) return;
  index = (index + 1) % filtered.length;
  playIndex(index);
});

audio.addEventListener('ended', () => {
  nextBtn.click();
});

audio.addEventListener('play', () => {
  setPlayButtonState(false);
});

audio.addEventListener('pause', () => {
  setPlayButtonState(true);
});

audio.addEventListener('timeupdate', () => {
  if (!audio.duration || Number.isNaN(audio.duration)) return;
  const value = (audio.currentTime / audio.duration) * 100;
  progressEl.value = value;
  currentTimeEl.textContent = formatTime(audio.currentTime);
  totalTimeEl.textContent = formatTime(audio.duration);
  updateLyrics(audio.currentTime);
});

progressEl.addEventListener('input', () => {
  if (!audio.duration || Number.isNaN(audio.duration)) return;
  const ratio = Number(progressEl.value) / 100;
  audio.currentTime = audio.duration * ratio;
});

syncFromTracks();

// 初始化：尝试加载上次打开的文件夹
(async function init() {
  try {
    const state = await window.api.getState();
    if (state && state.lastFolder) {
      const res = await window.api.scanFolder(state.lastFolder);
      tracks = (res && res.files) ? res.files : [];
      syncFromTracks();
      updateStatus(`已加载 ${tracks.length} 首音乐（来自上次文件夹）`);
      if (tracks.length && !audio.src) playIndex(0);
    }
  } catch (e) {
    // ignore
  }
})();