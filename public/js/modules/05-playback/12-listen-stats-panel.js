// 收听统计面板 —— 复用 02-listen-stats.js 已记录的本地收听数据，展示总览 / 周期对比 / Top 排行 / 时段分布
// 数据源（均只读，不写入）：
//   - localStorage key "mineradio-listen-stats-v1"（HOME_LISTEN_STATS_KEY）：history / songs / artists
//   - localStorage key "mineradio-listen-rollup-v2"（HOME_LISTEN_ROLLUP_V2_KEY）：totalListenMs / sessions / daily
// 文件末尾自执行初始化并 try/catch 防护，避免中断 index-loader 模块链。

var LISTEN_STATS_PANEL_KEY = 'mineradio-listen-stats-v1';
var listenStatsPanelBound = false;
var listenStatsPanelOpen = false;

var LISTEN_STATS_SLOT_DEFS = [
  { key: 'dawn', label: '凌晨', start: 0, end: 5 },
  { key: 'morning', label: '上午', start: 6, end: 11 },
  { key: 'afternoon', label: '下午', start: 12, end: 17 },
  { key: 'evening', label: '晚上', start: 18, end: 22 },
  { key: 'night', label: '深夜', start: 23, end: 23 },
];

function listenStatsPanelEscape(text) {
  if (typeof escHtml === 'function') return escHtml(text);
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function listenStatsPanelState() {
  var state = (typeof listenStatsState !== 'undefined' && listenStatsState) ? listenStatsState : null;
  if (!state) {
    try {
      if (typeof loadListenStatsState === 'function') {
        state = loadListenStatsState();
      } else {
        var raw = localStorage.getItem(LISTEN_STATS_PANEL_KEY);
        state = raw ? JSON.parse(raw) : null;
      }
    } catch (e) { state = null; }
  }
  if (!state || !state.songs || typeof state.songs !== 'object') {
    state = { history: [], songs: {}, artists: {}, updatedAt: 0 };
  }
  return state;
}

function listenStatsPanelRollup() {
  try {
    if (typeof loadListenRollupV2 === 'function') return loadListenRollupV2();
  } catch (e) { }
  return { version: 2, totalListenMs: 0, sessions: 0, daily: {}, updatedAt: 0 };
}

function listenStatsPanelFormatDuration(ms) {
  var totalMinutes = Math.round(Math.max(0, Number(ms) || 0) / 60000);
  if (totalMinutes < 1) return totalMinutes > 0 ? '<1 分钟' : '0 分钟';
  var hours = Math.floor(totalMinutes / 60);
  var minutes = totalMinutes % 60;
  if (hours <= 0) return minutes + ' 分钟';
  if (minutes === 0) return hours + ' 小时';
  return hours + ' 小时 ' + minutes + ' 分钟';
}

function listenStatsPanelTopSongs(state, limit) {
  var list = [];
  Object.keys(state.songs || {}).forEach(function (key) {
    var song = state.songs[key];
    if (!song) return;
    list.push({
      key: key,
      name: song.name || '未知歌曲',
      artist: song.artist || '',
      plays: Math.max(0, Number(song.plays) || 0),
      listenMs: Math.max(0, Number(song.listenMs) || 0),
      cover: song.cover || '',
      lastPlayedAt: Number(song.lastPlayedAt) || 0,
    });
  });
  list.sort(function (a, b) {
    return (b.plays - a.plays) || (b.listenMs - a.listenMs) || (b.lastPlayedAt - a.lastPlayedAt);
  });
  return list.slice(0, limit || 10);
}

function listenStatsPanelTopArtists(state, limit) {
  var list = [];
  Object.keys(state.artists || {}).forEach(function (name) {
    var artist = state.artists[name];
    if (!artist) return;
    list.push({
      name: artist.name || name,
      plays: Math.max(0, Number(artist.plays) || 0),
      listenMs: Math.max(0, Number(artist.listenMs) || 0),
      lastPlayedAt: Number(artist.lastPlayedAt) || 0,
    });
  });
  list.sort(function (a, b) {
    return (b.plays - a.plays) || (b.listenMs - a.listenMs) || (b.lastPlayedAt - a.lastPlayedAt);
  });
  return list.slice(0, limit || 10);
}

// 本周 / 本月 / 年度收听时长（基于 rollup 的 daily 按天聚合）
function listenStatsPanelPeriodMs(daily) {
  var now = new Date();
  var todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  var dayOfWeek = now.getDay(); // 0 = 周日
  var monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((dayOfWeek + 6) % 7), 0, 0, 0, 0);
  var monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  var yearStart = new Date(now.getFullYear(), 0, 1);
  var weekMs = 0, monthMs = 0, yearMs = 0;
  Object.keys(daily || {}).forEach(function (key) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
    if (!match) return;
    var dayDate = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (isNaN(dayDate.getTime())) return;
    var time = dayDate.getTime();
    var listenMs = Math.max(0, Number(daily[key] && daily[key].listenMs) || 0);
    if (time >= monday.getTime() && time <= todayEnd.getTime()) weekMs += listenMs;
    if (time >= monthStart.getTime() && time <= todayEnd.getTime()) monthMs += listenMs;
    if (time >= yearStart.getTime() && time <= todayEnd.getTime()) yearMs += listenMs;
  });
  return { weekMs: weekMs, monthMs: monthMs, yearMs: yearMs };
}

// 时段分布（基于 history 记录的播放时刻，按播放次数计数）
function listenStatsPanelSlots(state) {
  var slots = { dawn: 0, morning: 0, afternoon: 0, evening: 0, night: 0 };
  var total = 0;
  (state.history || []).forEach(function (record) {
    var playedAt = Number(record && record.playedAt);
    if (!playedAt) return;
    var hour = new Date(playedAt).getHours();
    for (var i = 0; i < LISTEN_STATS_SLOT_DEFS.length; i += 1) {
      var def = LISTEN_STATS_SLOT_DEFS[i];
      if (hour >= def.start && hour <= def.end) { slots[def.key] += 1; total += 1; break; }
    }
  });
  return { slots: slots, total: total };
}

function listenStatsPanelTotals(state, rollup) {
  var songsMs = 0, songsPlays = 0;
  Object.keys(state.songs || {}).forEach(function (key) {
    var song = state.songs[key];
    if (!song) return;
    songsMs += Math.max(0, Number(song.listenMs) || 0);
    songsPlays += Math.max(0, Number(song.plays) || 0);
  });
  var totalListenMs = Math.max(0, Number(rollup.totalListenMs) || 0) || songsMs;
  var totalPlays = Math.max(0, Number(rollup.sessions) || 0) || songsPlays;
  var totalSongs = Object.keys(state.songs || {}).length;
  var totalArtists = Object.keys(state.artists || {}).length;
  return { totalListenMs: totalListenMs, totalPlays: totalPlays, totalSongs: totalSongs, totalArtists: totalArtists };
}

function listenStatsPanelMetricCard(value, label, accent) {
  return '<div style="flex:1;min-width:0;padding:13px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.07);background:linear-gradient(145deg, rgba(255,255,255,.05), rgba(255,255,255,.018));">' +
    '<div style="font-size:20px;font-weight:700;line-height:1.25;color:' + (accent ? 'var(--home-accent)' : 'rgba(255,255,255,.94)') + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + value + '</div>' +
    '<div style="font-size:11px;color:rgba(255,255,255,.48);margin-top:5px">' + label + '</div>' +
    '</div>';
}

function listenStatsPanelPeriodBlock(items) {
  var max = 1;
  items.forEach(function (item) { if (item.ms > max) max = item.ms; });
  var html = '';
  items.forEach(function (item) {
    var pct = Math.round((item.ms / max) * 100);
    html += '<div style="flex:1;min-width:0;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.025);">' +
      '<div style="font-size:11px;color:rgba(255,255,255,.48);margin-bottom:6px">' + item.label + '</div>' +
      '<div style="font-size:15px;font-weight:700;color:rgba(255,255,255,.92);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + item.value + '</div>' +
      '<div style="height:4px;border-radius:2px;background:rgba(255,255,255,.08);margin-top:9px;overflow:hidden">' +
      '<div style="width:' + pct + '%;height:100%;border-radius:2px;background:linear-gradient(90deg, color-mix(in srgb, var(--home-accent) 55%, transparent), var(--home-accent))"></div>' +
      '</div></div>';
  });
  return '<div style="display:flex;gap:10px">' + html + '</div>';
}

function listenStatsPanelRankList(items, kind) {
  if (!items.length) {
    return '<div style="padding:16px 12px;text-align:center;font-size:12px;color:rgba(255,255,255,.4);border:1px dashed rgba(255,255,255,.08);border-radius:12px">暂无记录，播放几首歌后会出现在这里</div>';
  }
  var html = '';
  items.forEach(function (item, index) {
    var rank = index + 1;
    var rankColor = rank === 1 ? 'var(--home-accent)' : (rank <= 3 ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.4)');
    var title = item.name;
    var sub = kind === 'song' ? (item.artist || '未知艺人') : '';
    var cover = kind === 'song' && item.cover
      ? '<img src="' + listenStatsPanelEscape(item.cover) + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'" style="width:30px;height:30px;border-radius:6px;object-fit:cover;background:rgba(255,255,255,.06);flex-shrink:0">'
      : '<div style="width:30px;height:30px;border-radius:6px;background:rgba(255,255,255,.06);flex-shrink:0"></div>';
    html += '<div style="display:flex;align-items:center;gap:9px;padding:6px 10px;border-radius:10px;background:rgba(255,255,255,.032);margin-bottom:5px">' +
      '<span style="width:16px;text-align:center;font-size:11px;font-weight:700;color:' + rankColor + ';flex-shrink:0">' + rank + '</span>' +
      cover +
      '<div style="flex:1;min-width:0">' +
      '<div style="font-size:12.5px;color:rgba(255,255,255,.92);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + listenStatsPanelEscape(title) + '</div>' +
      (sub ? '<div style="font-size:10.5px;color:rgba(255,255,255,.42);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + listenStatsPanelEscape(sub) + '</div>' : '') +
      '</div>' +
      '<span style="font-size:11px;color:rgba(255,255,255,.55);white-space:nowrap;flex-shrink:0">' + item.plays + ' 次</span>' +
      '</div>';
  });
  return html;
}

function listenStatsPanelSlotRows(slots, total) {
  if (!total) {
    return '<div style="padding:16px 12px;text-align:center;font-size:12px;color:rgba(255,255,255,.4);border:1px dashed rgba(255,255,255,.08);border-radius:12px">暂无记录</div>';
  }
  var html = '';
  LISTEN_STATS_SLOT_DEFS.forEach(function (def) {
    var count = slots[def.key] || 0;
    var pct = Math.round((count / total) * 100);
    html += '<div style="display:flex;align-items:center;gap:9px;margin-bottom:7px">' +
      '<span style="width:32px;font-size:11px;color:rgba(255,255,255,.55);flex-shrink:0">' + def.label + '</span>' +
      '<div style="flex:1;height:6px;border-radius:3px;background:rgba(255,255,255,.08);overflow:hidden">' +
      '<div style="width:' + pct + '%;height:100%;border-radius:3px;background:linear-gradient(90deg, color-mix(in srgb, var(--home-accent) 55%, transparent), var(--home-accent))"></div>' +
      '</div>' +
      '<span style="width:60px;font-size:11px;color:rgba(255,255,255,.7);text-align:right;flex-shrink:0">' + count + ' 次 · ' + pct + '%</span>' +
      '</div>';
  });
  return html;
}

function listenStatsPanelSection(title, hint, body) {
  return '<div style="margin-top:16px">' +
    '<div style="font-size:13px;font-weight:700;color:rgba(255,255,255,.9);display:flex;align-items:center;gap:8px">' +
    '<span style="width:3px;height:12px;border-radius:2px;background:var(--home-accent);flex-shrink:0"></span>' + title + '</div>' +
    (hint ? '<div style="font-size:11px;color:rgba(255,255,255,.42);margin:5px 0 9px;line-height:1.5">' + hint + '</div>' : '<div style="height:9px"></div>') +
    body +
    '</div>';
}

function renderListenStatsPanel() {
  var body = document.getElementById('listen-stats-body');
  if (!body) return;
  var state = listenStatsPanelState();
  var rollup = listenStatsPanelRollup();
  var totals = listenStatsPanelTotals(state, rollup);
  var period = listenStatsPanelPeriodMs(rollup.daily);
  var slots = listenStatsPanelSlots(state);
  var topSongs = listenStatsPanelTopSongs(state, 10);
  var topArtists = listenStatsPanelTopArtists(state, 10);
  var noData = !totals.totalPlays && !totals.totalListenMs && !topSongs.length;

  var html = '';
  if (noData) {
    html += '<div style="padding:30px 20px;text-align:center;border:1px dashed rgba(255,255,255,.1);border-radius:14px">' +
      '<div style="font-size:14px;color:rgba(255,255,255,.85)">还没有收听记录</div>' +
      '<div style="font-size:12px;color:rgba(255,255,255,.42);margin-top:8px;line-height:1.6">播放几首歌后，这里会汇总你的总时长、周期对比、最爱歌曲 / 艺人<br>以及听歌时段分布。</div>' +
      '</div>';
    body.innerHTML = html;
    return;
  }

  html += '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
    listenStatsPanelMetricCard(listenStatsPanelFormatDuration(totals.totalListenMs), '总收听时长', true) +
    listenStatsPanelMetricCard(String(totals.totalPlays), '累计播放次数', false) +
    listenStatsPanelMetricCard(String(totals.totalSongs), '记录歌曲数', false) +
    listenStatsPanelMetricCard(String(totals.totalArtists), '记录艺人', false) +
    '</div>';

  html += listenStatsPanelSection('周期对比', '本周自周一 0 点起计，对比本月与年度累计', listenStatsPanelPeriodBlock([
    { label: '本周', ms: period.weekMs, value: listenStatsPanelFormatDuration(period.weekMs) },
    { label: '本月', ms: period.monthMs, value: listenStatsPanelFormatDuration(period.monthMs) },
    { label: '年度', ms: period.yearMs, value: listenStatsPanelFormatDuration(period.yearMs) },
  ]));

  html += listenStatsPanelSection('听歌时段分布', '基于最近记录的播放时刻，按播放次数计数', listenStatsPanelSlotRows(slots.slots, slots.total));

  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">' +
    listenStatsPanelSection('最爱歌曲 · TOP 10', '按播放次数排序', listenStatsPanelRankList(topSongs, 'song')) +
    listenStatsPanelSection('最爱艺人 · TOP 10', '按播放次数排序', listenStatsPanelRankList(topArtists, 'artist')) +
    '</div>';

  body.innerHTML = html;
}

function bindListenStatsPanel() {
  if (listenStatsPanelBound) return;
  listenStatsPanelBound = true;
  var mask = document.getElementById('listen-stats-mask');
  if (!mask) return;
  mask.addEventListener('click', function (event) {
    if (event.target === mask) closeListenStatsPanel();
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && listenStatsPanelOpen) closeListenStatsPanel();
  });
}

function openListenStatsPanel() {
  try {
    bindListenStatsPanel();
    var mask = document.getElementById('listen-stats-mask');
    if (!mask) return;
    renderListenStatsPanel();
    listenStatsPanelOpen = true;
    mask.classList.add('show');
    mask.setAttribute('aria-hidden', 'false');
  } catch (e) { }
}

function closeListenStatsPanel() {
  try {
    var mask = document.getElementById('listen-stats-mask');
    if (!mask) return;
    listenStatsPanelOpen = false;
    mask.classList.remove('show');
    mask.setAttribute('aria-hidden', 'true');
  } catch (e) { }
}

// 自执行初始化：入口按钮（index.html 内 onclick）在用户点击时调用 openListenStatsPanel，
// 此处仅绑定遮罩点击关闭与 Esc 关闭，异常不会中断模块链。
try {
  bindListenStatsPanel();
} catch (e) { }
