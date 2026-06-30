// ============================================================
//  Mineradio — 06-ui.js
// ============================================================

// ============================================================
async function fetchLyric(songOrId, token) {
  try {
    var song = (songOrId && typeof songOrId === 'object') ? songOrId : null;
    var provider = songProviderKey(song);
    var endpoint;
    if (provider === 'qq') {
      var mid = song.mid || song.songmid || song.id || '';
      var qqId = song.qqId || (/^\d+$/.test(String(song.id || '')) ? song.id : '');
      endpoint = '/api/qq/lyric?mid=' + encodeURIComponent(mid) + '&id=' + encodeURIComponent(qqId);
    } else {
      var songId = song ? song.id : songOrId;
      endpoint = '/api/lyric?id=' + encodeURIComponent(songId);
    }
    var r = await apiJson(endpoint);
    if (token !== trackSwitchToken) return;
    var nativeLines = parseYrcText(r.yrc || '');
    var lrcLines = parseLyricText(r.lyric || '');
    var hasNativeKaraoke = nativeLines.some(function(line){ return line.words && line.words.length; });
    var timingSource = hasNativeKaraoke ? 'yrc-word' : (nativeLines.length ? 'yrc-line' : (lrcLines.length ? 'lrc-line' : 'fallback'));
    var lines = withLyricFallback(nativeLines.length ? nativeLines : lrcLines);
    if (lines.length && lines[0].fallback) timingSource = 'fallback';
    setOriginalLyricsState(lines, hasNativeKaraoke, timingSource);
    applyPreferredLyricsForCurrent(true);
  } catch (e) {
    if (token !== trackSwitchToken) return;
    var fallbackLines = withLyricFallback([]);
    setOriginalLyricsState(fallbackLines, false, 'fallback');
    applyPreferredLyricsForCurrent(true);
  }
}
function currentLyricFallbackText() {
  var song = currentLyricSong() || {};
  var title = (song.name || document.getElementById('thumb-title').textContent || '').trim();
  var artist = (song.artist || document.getElementById('thumb-artist').textContent || '').trim();
  if (!title) return '';
  return artist ? title + ' - ' + artist : title;
}
function isNoLyricText(text) {
  var compact = String(text || '').replace(/\s+/g, '').replace(/[，,。.!！?？、~～]/g, '');
  return !compact ||
    compact === '纯音乐请欣赏' ||
    compact === '暂无歌词' ||
    compact === '暂无歌词敬请期待' ||
    compact === '此歌曲为没有填词的纯音乐请您欣赏';
}
function withLyricFallback(lines) {
  lines = Array.isArray(lines) ? lines.filter(function(line){ return line && String(line.text || '').trim(); }) : [];
  if (lines.length && !lines.every(function(line){ return isNoLyricText(line.text); })) return lines;
  var text = currentLyricFallbackText();
  return text ? [{ t:0, text:text, duration:9999, charCount:Math.max(1, text.length), fallback:true }] : [];
}
function lyricTagTimeToSeconds(min, sec, frac) {
  var t = (parseInt(min, 10) || 0) * 60 + (parseInt(sec, 10) || 0);
  if (frac) t += (parseInt(frac, 10) || 0) / Math.pow(10, Math.min(3, frac.length));
  return t;
}
function finalizeLyricLineDurations(lines) {
  lines.sort(function(a, b){ return a.t - b.t; });
  for (var i = 0; i < lines.length; i++) {
    var next = lines[i + 1];
    var inferred = next && next.t > lines[i].t ? next.t - lines[i].t : 4.8;
    if (!isFinite(lines[i].duration) || lines[i].duration <= 0) lines[i].duration = inferred;
    lines[i].duration = Math.max(0.45, Math.min(12, lines[i].duration));
    lines[i].charCount = Math.max(1, lines[i].charCount || String(lines[i].text || '').length);
  }
  return lines;
}
function parseLyricText(text) {
  var lines = [], reg = /\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\]/g;
  text.split(/\r?\n/).forEach(function(line){
    var times = [], m;
    reg.lastIndex = 0;
    while ((m = reg.exec(line))) times.push(lyricTagTimeToSeconds(m[1], m[2], m[3]));
    if (!times.length) return;
    var txt = line.replace(reg, '').trim();
    if (!txt) return;
    times.forEach(function(t){ lines.push({ t: t, text: txt, source:'lrc' }); });
  });
  return finalizeLyricLineDurations(lines);
}
function parseYrcText(text) {
  var lines = [];
  String(text || '').split(/\r?\n/).forEach(function(line){
    var m = line.match(/^\[(\d+),(\d+)\](.*)$/);
    if (!m) return;
    var lineStartMs = parseInt(m[1], 10) || 0;
    var lineDurMs = parseInt(m[2], 10) || 0;
    var body = m[3] || '';
    var words = [], fullText = '';
    var reg = /\((\d+),(\d+),\d+\)([^()]*)/g, wm;
    while ((wm = reg.exec(body))) {
      var txt = (wm[3] || '').replace(/\s+/g, ' ');
      if (!txt) continue;
      var rawStart = parseInt(wm[1], 10) || 0;
      var rawDur = parseInt(wm[2], 10) || 0;
      var absStartMs = rawStart >= lineStartMs - 500 ? rawStart : lineStartMs + rawStart;
      var c0 = fullText.length;
      fullText += txt;
      words.push({ text:txt, t:absStartMs / 1000, d:Math.max(0.06, rawDur / 1000), c0:c0, c1:fullText.length });
    }
    if (!fullText) fullText = body.replace(/\(\d+,\d+,\d+\)/g, '').replace(/\s+/g, ' ');
    var leading = (fullText.match(/^\s+/) || [''])[0].length;
    fullText = fullText.replace(/\s+/g, ' ').trim();
    if (!fullText) return;
    if (words.length) {
      words.forEach(function(w){
        w.c0 = Math.max(0, Math.min(fullText.length, w.c0 - leading));
        w.c1 = Math.max(w.c0, Math.min(fullText.length, w.c1 - leading));
      });
      words = words.filter(function(w){ return w.c1 > w.c0; });
    }
    lines.push({ t:lineStartMs / 1000, duration:lineDurMs / 1000, text:fullText, words:words, charCount:Math.max(1, fullText.length), source: words.length ? 'yrc-word' : 'yrc-line' });
  });
  return finalizeLyricLineDurations(lines);
}
function renderLyrics() {
  // v8: 歌词渲染由 stageLyrics 在每帧 tickLyricsParticles 里推动
  clearStageLyrics();
}
function toggleLyricsPanel(force) {
  if (force === false) fx.particleLyrics = false;
  else if (force === true) fx.particleLyrics = true;
  else fx.particleLyrics = !fx.particleLyrics;
  if (fx.particleLyrics) {
    createLyricsParticles();
    showToast('歌词已开启');
  } else {
    clearStageLyrics();
    showToast('歌词已关闭');
  }
  lyricsVisible = fx.particleLyrics;
}
function updateLyricsHighlight() { /* v8: 由 tickLyricsParticles 接管 */ }

// ============================================================
//  播放列表面板
// ============================================================
function animateListItems(container, selector, opts) {
  if (!container || !window.gsap) return;
  opts = opts || {};
  var items = Array.prototype.slice.call(container.querySelectorAll(selector));
  if (!items.length) return;
  var limit = opts.limit || 18;
  var targets = items.slice(0, limit);
  window.gsap.killTweensOf(targets);
  window.gsap.fromTo(targets, {
    autoAlpha: 0,
    y: opts.y == null ? 8 : opts.y,
    x: opts.x == null ? -6 : opts.x
  }, {
    autoAlpha: 1,
    y: 0,
    x: 0,
    duration: opts.duration || 0.22,
    stagger: opts.stagger || 0.012,
    ease: opts.ease || 'power2.out',
    force3D: true,
    overwrite: true
  });
}
function smoothScrollToItem(scroller, item, opts) {
  if (!scroller || !item) return;
  opts = opts || {};
  var target = item.offsetTop - Math.max(0, (scroller.clientHeight - item.offsetHeight) * (opts.align == null ? 0.42 : opts.align));
  target = Math.max(0, Math.min(target, Math.max(0, scroller.scrollHeight - scroller.clientHeight)));
  if (window.gsap) {
    if (typeof scroller.__syncSmoothWheelTarget === 'function') scroller.__syncSmoothWheelTarget(target);
    window.gsap.killTweensOf(scroller);
    window.gsap.to(scroller, { scrollTop: target, duration: opts.duration || 0.30, ease: opts.ease || 'power2.out', overwrite: true });
  } else if (scroller.scrollTo) {
    scroller.scrollTo({ top: target, behavior: 'smooth' });
  } else {
    scroller.scrollTop = target;
  }
}
function bindSmoothWheelScroll(scroller) {
  if (!scroller || scroller.__smoothWheelBound) return;
  scroller.__smoothWheelBound = true;
  var targetTop = scroller.scrollTop;
  var tween = null;
  scroller.__syncSmoothWheelTarget = function(top){
    if (tween) {
      tween.kill();
      tween = null;
    }
    targetTop = isFinite(top) ? top : scroller.scrollTop;
  };
  scroller.addEventListener('wheel', function(e){
    if (!window.gsap || e.ctrlKey) return;
    var max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    if (max <= 0 || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    var delta = e.deltaY;
    if (e.deltaMode === 1) delta *= 18;
    else if (e.deltaMode === 2) delta *= scroller.clientHeight;
    var current = tween ? targetTop : scroller.scrollTop;
    var next = Math.max(0, Math.min(max, current + delta));
    if (next === current && ((delta < 0 && scroller.scrollTop <= 0) || (delta > 0 && scroller.scrollTop >= max - 1))) {
      targetTop = scroller.scrollTop;
      return;
    }
    e.preventDefault();
    targetTop = next;
    if (tween) tween.kill();
    tween = window.gsap.to(scroller, {
      scrollTop: targetTop,
      duration: 0.24,
      ease: 'power2.out',
      overwrite: true,
      onComplete: function(){
        tween = null;
        targetTop = scroller.scrollTop;
      }
    });
  }, { passive: false });
  scroller.addEventListener('scroll', function(){
    if (!tween) targetTop = scroller.scrollTop;
  }, { passive: true });
}
function bindSmoothQueueScrolling() {
  if (smoothWheelScrollBound) return;
  smoothWheelScrollBound = true;
  [
    'mini-queue-list',
    'search-results',
    'fx-panel',
    'playlist-panel',
    'track-detail-body'
  ].forEach(function(id){
    bindSmoothWheelScroll(document.getElementById(id));
  });
}
function animateVisiblePanelList(listEl, selector, scroller, activeSelector, opts) {
  if (!listEl) return;
  opts = opts || {};
  requestAnimationFrame(function(){
    animateListItems(listEl, selector, { x: -8, y: 6, stagger: 0.01, duration: 0.20, limit: 16 });
    var active = activeSelector ? listEl.querySelector(activeSelector) : null;
    if (active && scroller && opts.scrollActive !== false) smoothScrollToItem(scroller, active, { duration: 0.32 });
  });
}
function miniQueueSkeleton() {
  return '<div class="mini-queue-skeleton"></div><div class="mini-queue-skeleton"></div><div class="mini-queue-skeleton"></div>';
}
function togglePlaylistPanel(force) {
  var el = document.getElementById('playlist-panel');
  if (force === false) el.classList.remove('show');
  else if (force === true) el.classList.add('show');
  else el.classList.toggle('show');
  if (el.classList.contains('show')) {
    if (window.gsap) window.gsap.fromTo(el, { x: -12, autoAlpha: 0.92 }, { x: 0, autoAlpha: 1, duration: 0.22, ease: 'power2.out', overwrite: true });
    scheduleUiWarmTask(function(){
      flushDeferredQueuePanel('playlist-panel-open');
      if (!playQueue.length && queueViewTab === 'queue') switchPlaylistTab('playlists');
      if (playQueue.length && currentIdx >= 0 && queueViewTab !== 'queue') switchPlaylistTab('queue');
      if (queueViewTab === 'queue') animateVisiblePanelList(document.getElementById('queue-list'), '.queue-item', el, '.queue-item.now', { scrollActive: false });
      else if (queueViewTab === 'playlists') animateVisiblePanelList(document.getElementById('pl-list'), '.pl-card', el);
      else animateVisiblePanelList(document.getElementById('podcast-list'), '.pl-card', el);
    }, 180);
  }
}
function applyPlaylistPanelPinState(openPanel) {
  var panel = document.getElementById('playlist-panel');
  var btn = document.getElementById('playlist-pin-btn');
  if (panel) {
    panel.classList.toggle('pinned', !!playlistPanelPinned);
    if (playlistPanelPinned || openPanel) {
      panel.dataset.preserveTabOnOpen = '1';
      setPeek(panel, true, 'pl');
    }
  }
  if (btn) {
    btn.classList.toggle('active', !!playlistPanelPinned);
    btn.title = playlistPanelPinned ? '取消常开歌单' : '常开歌单';
  }
}
function setPlaylistPanelPinned(on, silent) {
  playlistPanelPinned = !!on;
  saveBooleanPreference(PLAYLIST_PANEL_PIN_STORE_KEY, playlistPanelPinned);
  applyPlaylistPanelPinState(playlistPanelPinned);
  if (!silent) showToast(playlistPanelPinned ? '左侧歌单已常开' : '左侧歌单已恢复自动隐藏');
}
function togglePlaylistPanelPinned() {
  setPlaylistPanelPinned(!playlistPanelPinned);
}
function scrollPlaylistPanelToCurrent() {
  var panel = document.getElementById('playlist-panel');
  var list = document.getElementById('queue-list');
  if (!panel || !list || queueViewTab !== 'queue') return;
  var now = performance.now();
  if (panel.__lastCurrentScrollAt && now - panel.__lastCurrentScrollAt < 650) return;
  panel.__lastCurrentScrollAt = now;
  requestAnimationFrame(function(){
    smoothScrollToItem(panel, list.querySelector('.queue-item.now'), { duration: 0.28, align: 0.34 });
  });
}
function switchPlaylistTab(tab) {
  tab = tab === 'podcasts' ? 'podcasts' : (tab === 'playlists' ? 'playlists' : 'queue');
  queueViewTab = tab;
  document.getElementById('tab-queue').classList.toggle('active', tab === 'queue');
  document.getElementById('tab-pl').classList.toggle('active', tab === 'playlists');
  var podcastTab = document.getElementById('tab-podcast');
  if (podcastTab) podcastTab.classList.toggle('active', tab === 'podcasts');
  document.getElementById('queue-pane').style.display = tab === 'queue' ? '' : 'none';
  document.getElementById('pl-pane').style.display = tab === 'playlists' ? '' : 'none';
  var podcastPane = document.getElementById('podcast-pane');
  if (podcastPane) podcastPane.style.display = tab === 'podcasts' ? '' : 'none';
  if (tab === 'playlists' || tab === 'podcasts') refreshUserPlaylists();
  if (tab === 'queue') animateVisiblePanelList(document.getElementById('queue-list'), '.queue-item', document.getElementById('playlist-panel'), '.queue-item.now');
  if (tab === 'playlists') animateVisiblePanelList(document.getElementById('pl-list'), '.pl-card', document.getElementById('playlist-panel'));
  if (tab === 'podcasts') animateVisiblePanelList(document.getElementById('podcast-list'), '.pl-card', document.getElementById('playlist-panel'));
}
function setMiniQueueOpen(open) {
  miniQueueOpen = !!open;
  var pop = document.getElementById('mini-queue-popover');
  var btn = document.getElementById('mini-queue-btn');
  if (pop) pop.classList.toggle('show', miniQueueOpen);
  if (btn) btn.classList.toggle('active', miniQueueOpen);
  if (miniQueueOpen) {
    var seq = ++miniQueueRenderSeq;
    requestAnimationFrame(function(){
      if (seq !== miniQueueRenderSeq || !miniQueueOpen) return;
      renderMiniQueuePanel({ animate: true, scrollCurrent: true });
    });
    revealBottomControls(1300);
  }
}
function toggleMiniQueue(e) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  setMiniQueueOpen(!miniQueueOpen);
}
function closeMiniQueue() {
  setMiniQueueOpen(false);
}
function openPlaylistPanelTab(tab, preserve) {
  tab = tab === 'podcasts' ? 'podcasts' : (tab === 'playlists' ? 'playlists' : 'queue');
  var panel = document.getElementById('playlist-panel');
  if (panel && panel.dataset && preserve !== false) panel.dataset.preserveTabOnOpen = '1';
  switchPlaylistTab(tab);
  setPeek(panel, true, 'pl');
}
function renderMiniQueuePanel(opts) {
  opts = opts || {};
  var $list = document.getElementById('mini-queue-list');
  var $count = document.getElementById('mini-queue-count');
  if (!$list || !$count) return;
  var total = playQueue.length;
  $count.textContent = total ? (total + ' 首' + (currentIdx >= 0 ? ' · 正在播放 ' + (currentIdx + 1) : '')) : '0 首';
  if (!miniQueueOpen && !opts.animate && !opts.scrollCurrent) return;
  if (!total) {
    $list.innerHTML = '<div class="mini-queue-empty">队列为空，先搜索或打开歌单</div>';
    return;
  }
  $list.innerHTML = playQueue.map(function(song, i){
    var thumb = songCoverSrc(song, 60);
    var imgTag = thumb ? '<img src="' + thumb + '" alt="" loading="lazy" decoding="async" onerror="this.style.opacity=0.2">' : '<div class="mini-queue-cover"></div>';
    return '<div class="mini-queue-item' + (i === currentIdx ? ' now' : '') + '" onclick="playQueueAt(' + i + ')">' +
      imgTag +
      '<div class="mini-queue-info"><div class="mini-queue-name">' + escHtml(song.name) + '</div><div class="mini-queue-sub">' + escHtml(song.artist || '') + '</div></div>' +
      '<button class="mini-queue-remove mini-queue-next" onclick="event.stopPropagation();queueIndexNext(' + i + ')" title="下一首播放">下</button>' +
      '<button class="mini-queue-remove" onclick="event.stopPropagation();removeFromQueue(' + i + ')" title="移除">×</button>' +
    '</div>';
  }).join('');
  if (opts.animate || opts.scrollCurrent) {
    requestAnimationFrame(function(){
      if (opts.animate) animateListItems($list, '.mini-queue-item', { x: 0, y: 6, stagger: 0.01, duration: 0.20, limit: 16 });
      if (opts.scrollCurrent) smoothScrollToItem($list, $list.querySelector('.mini-queue-item.now'), { duration: 0.30, align: 0.42 });
    });
  }
}
document.addEventListener('click', function(e){
  if (miniQueueOpen && !(e.target && e.target.closest && e.target.closest('#bottom-bar'))) closeMiniQueue();
});
bindSmoothQueueScrolling();
bindPlaylistPanelLazyRender();
bindModalBackdropClose();
function renderQueuePanel(opts) {
  opts = opts || {};
  var $ql = document.getElementById('queue-list');
  var seq = ++queueRenderSeq;
  if (!playQueue.length) {
    $ql.innerHTML = '<div style="text-align:center;padding:24px 0;color:rgba(255,255,255,.32);font-size:11.5px">队列为空，搜索后点 + 设为下一首</div>';
    renderMiniQueuePanel();
    var panel = document.getElementById('playlist-panel');
    if (panel && (panel.classList.contains('show') || panel.classList.contains('peek')) && queueViewTab === 'queue') switchPlaylistTab('playlists');
    return;
  }
  $ql.innerHTML = playQueue.map(function(song, i){
    var thumb = songCoverSrc(song, 60);
    var imgTag = thumb ? '<img src="' + thumb + '" alt="" loading="lazy" decoding="async" onerror="this.style.opacity=0.2">' : '<div style="width:38px;height:38px;border-radius:6px;background:rgba(255,255,255,.06);flex-shrink:0"></div>';
    return '<div class="queue-item' + (i === currentIdx ? ' now' : '') + '" onclick="playQueueAt(' + i + ')">' +
      imgTag +
      '<div class="qi-info"><div class="qi-name">' + escHtml(song.name) + '</div><div class="qi-sub"><button class="queue-artist-link" type="button" onclick="event.stopPropagation();openQueueArtist(' + i + ')">' + escHtml(song.artist || '未知歌手') + '</button></div></div>' +
      '<div class="qi-act">' +
        '<button class="' + (isSongLiked(song) ? 'liked' : '') + '" onclick="event.stopPropagation();toggleLikeQueueIndex(' + i + ')" title="' + (isSongLiked(song) ? '取消红心' : '红心喜欢') + '">' + heartIconSvg() + '</button>' +
        '<button class="queue-next" onclick="event.stopPropagation();queueIndexNext(' + i + ')" title="下一首播放">下</button>' +
        '<button onclick="event.stopPropagation();collectQueueIndex(' + i + ')" title="收藏到歌单">' + playlistPlusIconSvg() + '</button>' +
        '<button onclick="event.stopPropagation();removeFromQueue(' + i + ')" title="移除">×</button>' +
      '</div>' +
    '</div>';
  }).join('');
  if (opts.animate && seq === queueRenderSeq) animateVisiblePanelList($ql, '.queue-item', document.getElementById('playlist-panel'), '.queue-item.now');
  renderMiniQueuePanel({ scrollCurrent: miniQueueOpen });
}
async function refreshUserPlaylists(force) {
  if (!loginStatus.loggedIn && !qqLoginStatus.loggedIn) {
    resetPlaylistPanelRenderLimit();
    document.getElementById('pl-list').innerHTML = '<div style="text-align:center;padding:24px 0;color:rgba(255,255,255,.32);font-size:11.5px">登录后显示个人歌单</div>';
    var podcastListLoggedOut = document.getElementById('podcast-list');
    if (podcastListLoggedOut) podcastListLoggedOut.innerHTML = '<div style="text-align:center;padding:14px 0;color:rgba(255,255,255,.28);font-size:11.5px">登录后显示我的播客</div>';
    return;
  }
  if (force) resetPlaylistPanelRenderLimit();
  var hasCachedQQPlaylists = userPlaylists.some(function(pl){ return pl && pl.provider === 'qq'; });
  var needsQQRefresh = qqLoginStatus.loggedIn && !hasCachedQQPlaylists;
  if (!force && !needsQQRefresh && (userPlaylists.length || myPodcastCollections.length)) {
    var cachedAnimate = isPlaylistPanelVisibleForRender();
    renderUserPlaylistsList({ animate: cachedAnimate });
    renderMyPodcastCollections({ animate: cachedAnimate });
    return;
  }
  var $pl = document.getElementById('pl-list');
  if ($pl) {
    $pl.innerHTML = miniQueueSkeleton();
    if (window.gsap) animateListItems($pl, '.mini-queue-skeleton', { x: 0, y: 6, stagger: 0.018, duration: 0.18, limit: 3 });
  }
  var $pod = document.getElementById('podcast-list');
  if ($pod) $pod.innerHTML = miniQueueSkeleton();
  try {
    var result = await Promise.all([
      loginStatus.loggedIn ? apiJson('/api/user/playlists') : Promise.resolve({ playlists: [] }),
      loginStatus.loggedIn ? apiJson('/api/podcast/my') : Promise.resolve({ collections: [], loggedIn: false }),
      qqLoginStatus.loggedIn ? apiJson('/api/qq/user/playlists') : Promise.resolve({ playlists: [] })
    ]);
    var neteaseLists = (result[0].playlists || []).map(function(pl){ pl.provider = 'netease'; pl.source = 'netease'; return pl; });
    qqPlaylists = (result[2].playlists || []).map(function(pl){ pl.provider = 'qq'; pl.source = 'qq'; return pl; });
    userPlaylists = neteaseLists.concat(qqPlaylists);
    myPodcastCollections = result[1].collections || [];
    var animatePanel = isPlaylistPanelVisibleForRender();
    renderUserPlaylistsList({ animate: animatePanel, reset: true });
    renderMyPodcastCollections({ animate: animatePanel });
    if (emptyHomeActive) renderHomeDiscover();
    scheduleShelfRebuild('refresh-user-playlists', true);
  } catch (e) { console.warn(e); }
}
var playlistPanelDetailState = { key: '', loading: false, playlist: null, tracks: [], token: 0, renderLimit: PLAYLIST_DETAIL_INITIAL_RENDER };
function playlistPanelKey(provider, id) {
  return (provider === 'qq' ? 'qq' : 'netease') + ':' + String(id || '');
}
function playlistPanelProviderId(provider, id) {
  return provider === 'qq' ? ('qq:' + id) : id;
}
function playlistPanelDetailHtml(pl, provider) {
  var key = playlistPanelKey(provider, pl && pl.id);
  if (playlistPanelDetailState.key !== key) return '';
  var tracks = playlistPanelDetailState.tracks || [];
  var loading = playlistPanelDetailState.loading;
  var cover = pl && pl.cover ? (provider === 'qq' ? pl.cover : (pl.cover + '?param=96y96')) : '';
  var img = cover ? '<img class="pl-detail-cover" src="' + escHtml(cover) + '" alt="" decoding="async" onerror="this.style.opacity=0.2">' : '<div class="pl-detail-cover"></div>';
  var renderLimit = loading ? 0 : Math.max(PLAYLIST_DETAIL_INITIAL_RENDER, playlistPanelDetailState.renderLimit || PLAYLIST_DETAIL_INITIAL_RENDER);
  renderLimit = Math.min(tracks.length, renderLimit);
  var visibleTracks = loading ? [] : tracks.slice(0, renderLimit);
  var rows = loading
    ? '<div class="pl-detail-row"><div style="width:34px;height:34px;border-radius:7px;background:rgba(255,255,255,.06)"></div><div style="flex:1;min-width:0"><div class="pl-detail-row-title">正在载入歌单</div><div class="pl-detail-row-artist">请稍候</div></div></div>'
    : visibleTracks.map(function(song, i){
        var thumb = songCoverSrc(song, 60);
        var imgTag = thumb ? '<img src="' + escHtml(thumb) + '" alt="" loading="lazy" decoding="async" onerror="this.style.opacity=0.2">' : '<div style="width:34px;height:34px;border-radius:7px;background:rgba(255,255,255,.06);flex:0 0 auto"></div>';
        return '<div class="pl-detail-row" data-pl-detail-row="' + i + '">' +
          imgTag +
          '<div style="flex:1;min-width:0"><div class="pl-detail-row-title">' + escHtml(song.name || '') + '</div>' +
          '<button type="button" class="pl-detail-row-artist" data-pl-detail-artist="' + i + '">' + escHtml(song.artist || '未知歌手') + '</button></div>' +
        '</div>';
      }).join('');
  if (!loading && !rows) rows = '<div style="text-align:center;padding:14px 0;color:rgba(255,255,255,.30);font-size:11.5px">歌单暂无可播放歌曲</div>';
  if (!loading && tracks.length > renderLimit) {
    rows += '<button type="button" class="fx-mini-btn ghost pl-detail-load-more" data-pl-detail-load-more="1">加载更多 ' + renderLimit + '/' + tracks.length + '</button>';
  } else if (!loading && tracks.length > PLAYLIST_DETAIL_INITIAL_RENDER) {
    rows += '<div class="pl-detail-progress">已显示全部 ' + tracks.length + ' 首</div>';
  }
  return '<div class="pl-inline-detail" data-pl-detail="' + escHtml(key) + '">' +
    '<div class="pl-detail-sticky">' +
      '<div class="pl-detail-head">' + img + '<div style="flex:1;min-width:0"><div class="pl-detail-title">' + escHtml(pl.name || '歌单详情') + '</div><div class="pl-detail-sub">' + escHtml((pl.trackCount || tracks.length || 0) + ' 首 · ' + (pl.creator || (provider === 'qq' ? 'QQ 音乐' : '网易云音乐'))) + '</div></div><div class="pl-detail-count">' + (loading ? '载入中' : (renderLimit + '/' + tracks.length)) + '</div></div>' +
      '<div class="pl-detail-actions"><button class="pl-detail-play" type="button" data-pl-detail-play="' + escHtml(key) + '"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>播放歌单</button><button class="fx-mini-btn ghost pl-detail-top-btn" type="button" data-pl-detail-top="1">回到顶部</button></div>' +
    '</div>' +
    '<div class="pl-detail-list">' + rows + '</div>' +
  '</div>';
}
function renderPlaylistPanelDetailState() {
  renderUserPlaylistsList();
}
function scrollPlaylistPanelToTop() {
  var panel = document.getElementById('playlist-panel');
  if (!panel) return;
  try { panel.scrollTo({ top: 0, behavior: 'smooth' }); }
  catch (e) { panel.scrollTop = 0; }
}
function scrollPlaylistPanelDetailIntoView(key) {
  var panel = document.getElementById('playlist-panel');
  if (!panel || !key) return;
  requestAnimationFrame(function(){
    var detail = null;
    Array.prototype.some.call(panel.querySelectorAll('[data-pl-detail]'), function(node){
      if (node.getAttribute('data-pl-detail') === key) {
        detail = node;
        return true;
      }
      return false;
    });
    if (!detail) return;
    var anchor = detail.previousElementSibling || detail;
    var top = Math.max(0, anchor.offsetTop - 10);
    try { panel.scrollTo({ top: top, behavior: 'smooth' }); }
    catch (e) { panel.scrollTop = top; }
  });
}
async function openPlaylistPanelDetail(provider, pid, title) {
  if (!pid) return;
  provider = provider === 'qq' ? 'qq' : 'netease';
  var key = playlistPanelKey(provider, pid);
  var pl = userPlaylists.find(function(item){ return playlistPanelKey(item.provider === 'qq' ? 'qq' : 'netease', item.id) === key; }) || { id: pid, provider: provider, name: title || '歌单详情' };
  if (playlistPanelDetailState.key === key && !playlistPanelDetailState.loading && playlistPanelDetailState.tracks.length) {
    playlistPanelDetailState.key = '';
    playlistPanelDetailState.tracks = [];
    playlistPanelDetailState.playlist = null;
    playlistPanelDetailState.renderLimit = PLAYLIST_DETAIL_INITIAL_RENDER;
    renderPlaylistPanelDetailState();
    return;
  }
  var token = ++playlistPanelDetailState.token;
  playlistPanelDetailState = { key: key, loading: true, playlist: pl, tracks: [], token: token, renderLimit: PLAYLIST_DETAIL_INITIAL_RENDER };
  renderPlaylistPanelDetailState();
  scrollPlaylistPanelDetailIntoView(key);
  try {
    var r = provider === 'qq'
      ? await apiJson('/api/qq/playlist/tracks?id=' + encodeURIComponent(pid))
      : await apiJson('/api/playlist/tracks?id=' + encodeURIComponent(pid));
    if (playlistPanelDetailState.token !== token) return;
    playlistPanelDetailState.loading = false;
    playlistPanelDetailState.tracks = (r && r.tracks || []).map(cloneSong);
    playlistPanelDetailState.renderLimit = Math.min(playlistPanelDetailState.tracks.length, PLAYLIST_DETAIL_INITIAL_RENDER);
    renderPlaylistPanelDetailState();
  } catch (e) {
    console.warn('[PlaylistPanelDetail]', pid, e);
    if (playlistPanelDetailState.token !== token) return;
    playlistPanelDetailState.loading = false;
    playlistPanelDetailState.tracks = [];
    playlistPanelDetailState.renderLimit = PLAYLIST_DETAIL_INITIAL_RENDER;
    renderPlaylistPanelDetailState();
    showToast('歌单详情加载失败');
  }
}
function playPlaylistPanelDetail() {
  var st = playlistPanelDetailState;
  if (!st || !st.key) return;
  var parts = st.key.split(':');
  var provider = parts[0] === 'qq' ? 'qq' : 'netease';
  var pid = parts.slice(1).join(':');
  loadPlaylistIntoQueueById(playlistPanelProviderId(provider, pid), true, st.playlist && st.playlist.name || '');
}
function playPlaylistPanelDetailTrack(index) {
  var tracks = playlistPanelDetailState.tracks || [];
  if (!tracks[index]) return;
  playQueue = tracks.map(cloneSong);
  currentIdx = index;
  safeRenderQueuePanel('playlist-panel-detail');
  safeSwitchPlaylistTab('queue', 'playlist-panel-detail');
  safeShelfRebuild('playlist-panel-detail', true);
  forcePlaybackControlsInteractive();
  playQueueAt(index).catch(function(e){ console.warn('[PlaylistPanelDetailPlay]', e); });
}
function openPlaylistPanelDetailArtist(index) {
  var song = playlistPanelDetailState.tracks && playlistPanelDetailState.tracks[index];
  if (song) openArtistDetailForSong(song);
}
function growPlaylistPanelDetailRenderLimit(amount) {
  var st = playlistPanelDetailState;
  var total = st && st.tracks ? st.tracks.length : 0;
  if (!st || st.loading || !st.key || !total) return false;
  var current = Math.max(PLAYLIST_DETAIL_INITIAL_RENDER, st.renderLimit || PLAYLIST_DETAIL_INITIAL_RENDER);
  var next = Math.min(total, current + (amount || PLAYLIST_DETAIL_BATCH_SIZE));
  if (next <= current) return false;
  var panel = document.getElementById('playlist-panel');
  var keepTop = panel ? panel.scrollTop : 0;
  st.renderLimit = next;
  renderPlaylistPanelDetailState();
  if (panel) panel.scrollTop = keepTop;
  return true;
}
function maybeGrowPlaylistPanelDetailRenderLimit() {
  var panel = document.getElementById('playlist-panel');
  var st = playlistPanelDetailState;
  if (!panel || !st || st.loading || !st.key || !st.tracks || st.renderLimit >= st.tracks.length) return;
  if (panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 240) {
    growPlaylistPanelDetailRenderLimit();
  }
}
function resetPlaylistPanelRenderLimit() {
  playlistPanelRenderLimit = PLAYLIST_PANEL_BATCH_SIZE;
}
function growPlaylistPanelRenderLimit() {
  if (!userPlaylists.length) return;
  var next = Math.min(userPlaylists.length, (playlistPanelRenderLimit || PLAYLIST_PANEL_BATCH_SIZE) + PLAYLIST_PANEL_BATCH_SIZE);
  if (next <= playlistPanelRenderLimit) return;
  playlistPanelRenderLimit = next;
  renderUserPlaylistsList({ animate: true });
}
function bindPlaylistPanelLazyRender() {
  var panel = document.getElementById('playlist-panel');
  if (!panel || playlistPanelLazyBound) return;
  playlistPanelLazyBound = true;
  panel.addEventListener('scroll', function(){
    maybeGrowPlaylistPanelDetailRenderLimit();
    if (queueViewTab !== 'playlists' || playlistPanelRenderLimit >= userPlaylists.length) return;
    if (panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 180) growPlaylistPanelRenderLimit();
  }, { passive: true });
}
function renderUserPlaylistsList(opts) {
  opts = opts || {};
  var $pl = document.getElementById('pl-list');
  var seq = ++playlistRenderSeq;
  if (!userPlaylists.length) {
    $pl.innerHTML = '<div style="text-align:center;padding:24px 0;color:rgba(255,255,255,.32);font-size:11.5px">未找到歌单</div>';
    return;
  }
  function playlistCardHtml(pl) {
    var provider = pl.provider === 'qq' ? 'qq' : 'netease';
    var providerLabel = provider === 'qq' ? 'QQ' : 'NE';
    var thumb = pl.cover ? (provider === 'qq' ? pl.cover : (pl.cover + '?param=88y88')) : '';
    var imgTag = thumb ? '<img src="' + thumb + '" alt="" loading="lazy" decoding="async" onerror="this.style.opacity=0.2">' : '<div style="width:44px;height:44px;border-radius:8px;background:rgba(255,255,255,.06);flex-shrink:0"></div>';
    var key = playlistPanelKey(provider, pl.id);
    var expanded = playlistPanelDetailState.key === key ? ' expanded' : '';
    return '<div class="pl-card' + expanded + '" data-playlist-provider="' + provider + '" data-playlist-id="' + escHtml(String(pl.id || '')) + '" data-playlist-title="' + escHtml(pl.name || '') + '">' +
      imgTag +
      '<div style="flex:1;min-width:0"><div class="pl-name">' + escHtml(pl.name) + '<span class="tag-source ' + provider + '" style="margin-left:6px;vertical-align:1px">' + providerLabel + '</span></div><div class="pl-sub">' + pl.trackCount + ' 首 · ' + escHtml(pl.creator || '') + '</div></div>' +
    '</div>' + playlistPanelDetailHtml(pl, provider);
  }
  var groups = [
    { key:'netease', label:'网易云歌单', items:userPlaylists.filter(function(pl){ return pl.provider !== 'qq'; }) },
    { key:'qq', label:'QQ 音乐歌单', items:userPlaylists.filter(function(pl){ return pl.provider === 'qq'; }) }
  ];
  if (opts.reset) resetPlaylistPanelRenderLimit();
  playlistPanelRenderLimit = Math.max(PLAYLIST_PANEL_BATCH_SIZE, Math.min(userPlaylists.length, playlistPanelRenderLimit || PLAYLIST_PANEL_BATCH_SIZE));
  var renderedCount = 0;
  function visibleGroupItems(items) {
    var room = playlistPanelRenderLimit - renderedCount;
    if (room <= 0) return [];
    var visible = items.slice(0, room);
    renderedCount += visible.length;
    return visible;
  }
  $pl.innerHTML = groups.map(function(group){
    var items = visibleGroupItems(group.items);
    if (!items.length) return '';
    return '<div class="pl-section-label">' + group.label + '</div>' + items.map(playlistCardHtml).join('');
  }).join('') || '<div style="text-align:center;padding:24px 0;color:rgba(255,255,255,.32);font-size:11.5px">未找到歌单</div>';
  if (userPlaylists.length > renderedCount) {
    $pl.insertAdjacentHTML('beforeend', '<button type="button" class="fx-mini-btn ghost pl-load-more" data-pl-load-more="1">加载更多 ' + renderedCount + '/' + userPlaylists.length + '</button>');
  }
  if (opts.animate && seq === playlistRenderSeq) animateVisiblePanelList($pl, '.pl-card', document.getElementById('playlist-panel'));
}
function renderMyPodcastCollections(opts) {
  opts = opts || {};
  var $pod = document.getElementById('podcast-list');
  if (!$pod) return;
  if (!loginStatus.loggedIn) {
    $pod.innerHTML = '<div style="text-align:center;padding:14px 0;color:rgba(255,255,255,.28);font-size:11.5px">登录后显示我的播客</div>';
    return;
  }
  var items = myPodcastCollections || [];
  if (!items.length) {
    $pod.innerHTML = '<div style="text-align:center;padding:14px 0;color:rgba(255,255,255,.28);font-size:11.5px">暂无播客数据</div>';
    return;
  }
  $pod.innerHTML = items.map(function(pc){
    var thumb = pc.cover ? coverUrlWithSize(pc.cover, 88) : '';
    var imgTag = thumb ? '<img src="' + thumb + '" alt="" loading="lazy" decoding="async" onerror="this.style.opacity=0.2">' : '<div style="width:44px;height:44px;border-radius:8px;background:rgba(0,245,212,.07);flex-shrink:0"></div>';
    return '<div class="pl-card podcast-card" data-podcast-key="' + escHtml(pc.key || '') + '" data-podcast-title="' + escHtml(pc.title || '') + '">' +
      imgTag +
      '<div style="flex:1;min-width:0"><div class="pl-name">' + escHtml(pc.title || '') + '</div><div class="pl-sub">' + (pc.count || 0) + ' 项 · ' + escHtml(pc.sub || '') + '</div></div>' +
    '</div>';
  }).join('');
  if (opts.animate) animateVisiblePanelList($pod, '.pl-card', document.getElementById('playlist-panel'));
}
document.getElementById('pl-list').addEventListener('click', function(e){
  var loadMore = e.target && e.target.closest ? e.target.closest('[data-pl-load-more]') : null;
  if (loadMore) {
    e.preventDefault();
    e.stopPropagation();
    growPlaylistPanelRenderLimit();
    return;
  }
  var detailLoadMore = e.target && e.target.closest ? e.target.closest('[data-pl-detail-load-more]') : null;
  if (detailLoadMore) {
    e.preventDefault();
    e.stopPropagation();
    growPlaylistPanelDetailRenderLimit();
    return;
  }
  var detailTop = e.target && e.target.closest ? e.target.closest('[data-pl-detail-top]') : null;
  if (detailTop) {
    e.preventDefault();
    e.stopPropagation();
    scrollPlaylistPanelToTop();
    return;
  }
  var playDetail = e.target && e.target.closest ? e.target.closest('[data-pl-detail-play]') : null;
  if (playDetail) {
    e.preventDefault();
    e.stopPropagation();
    playPlaylistPanelDetail();
    return;
  }
  var artist = e.target && e.target.closest ? e.target.closest('[data-pl-detail-artist]') : null;
  if (artist) {
    e.preventDefault();
    e.stopPropagation();
    openPlaylistPanelDetailArtist(Number(artist.getAttribute('data-pl-detail-artist')));
    return;
  }
  var row = e.target && e.target.closest ? e.target.closest('[data-pl-detail-row]') : null;
  if (row) {
    e.preventDefault();
    e.stopPropagation();
    playPlaylistPanelDetailTrack(Number(row.getAttribute('data-pl-detail-row')));
    return;
  }
  var card = e.target && e.target.closest ? e.target.closest('.pl-card') : null;
  if (!card) return;
  var provider = card.getAttribute('data-playlist-provider') || 'netease';
  var pid = card.getAttribute('data-playlist-id') || '';
  openPlaylistPanelDetail(provider, pid, card.getAttribute('data-playlist-title') || '');
});
var podcastListEl = document.getElementById('podcast-list');
if (podcastListEl) {
  podcastListEl.addEventListener('click', function(e){
    if (e.target && e.target.closest && e.target.closest('[data-podcast-back]')) {
      renderMyPodcastCollections({ animate: true });
      return;
    }
    var radioCard = e.target && e.target.closest ? e.target.closest('[data-podcast-radio-id]') : null;
    if (radioCard) {
      loadPodcastRadioIntoQueue(radioCard.getAttribute('data-podcast-radio-id'), true, radioCard.getAttribute('data-podcast-title') || '');
      return;
    }
    var card = e.target && e.target.closest ? e.target.closest('[data-podcast-key]') : null;
    if (!card) return;
    openMyPodcastCollection(card.getAttribute('data-podcast-key'), card.getAttribute('data-podcast-title') || '');
  });
}
function renderMyPodcastRadioItems(key, title, items) {
  var $pod = document.getElementById('podcast-list');
  if (!$pod) return;
  if (!items.length) {
    $pod.innerHTML = '<div class="podcast-inline-head"><div class="pl-section-label">' + escHtml(title || '我的播客') + '</div><button class="fx-mini-btn ghost" data-podcast-back="1" style="height:24px;padding:0 9px;font-size:10.5px">返回</button></div>' +
      '<div style="text-align:center;padding:14px 0;color:rgba(255,255,255,.28);font-size:11.5px">暂无内容</div>';
    return;
  }
  $pod.innerHTML = '<div class="podcast-inline-head"><div class="pl-section-label">' + escHtml(title || '我的播客') + '</div><button class="fx-mini-btn ghost" data-podcast-back="1" style="height:24px;padding:0 9px;font-size:10.5px">返回</button></div>' +
    items.map(function(r){
      var thumb = r.cover ? coverUrlWithSize(r.cover, 88) : '';
      var imgTag = thumb ? '<img src="' + thumb + '" alt="" loading="lazy" decoding="async" onerror="this.style.opacity=0.2">' : '<div style="width:44px;height:44px;border-radius:8px;background:rgba(0,245,212,.07);flex-shrink:0"></div>';
      return '<div class="pl-card podcast-card podcast-child" data-podcast-radio-id="' + escHtml(String(r.id || r.radioId || '')) + '" data-podcast-title="' + escHtml(r.name || '') + '">' +
        imgTag +
        '<div style="flex:1;min-width:0"><div class="pl-name">' + escHtml(r.name || '') + '</div><div class="pl-sub">' + escHtml((r.djName || r.artist || 'Podcast') + (r.programCount ? (' · ' + r.programCount + ' 集') : '')) + '</div></div>' +
      '</div>';
    }).join('');
  animateVisiblePanelList($pod, '.pl-card', document.getElementById('playlist-panel'));
}
async function openMyPodcastCollection(key, title) {
  if (!key) return;
  showLoading();
  try {
    var r = await apiJson('/api/podcast/my/items?key=' + encodeURIComponent(key) + '&limit=36');
    if (r && r.loggedIn === false) { showLoginModal(); return; }
    var items = r.items || [];
    myPodcastItems[key] = items;
    if (!items.length) {
      showToast('暂无内容: ' + (title || key));
      renderMyPodcastRadioItems(key, title, []);
      return;
    }
    if (r.itemType === 'voice' || (items[0] && items[0].type === 'podcast')) {
      playQueue = items.map(cloneSong);
      currentIdx = 0;
      safeRenderQueuePanel('podcast-collection-voice');
      safeSwitchPlaylistTab('queue', 'podcast-collection-voice');
      safeShelfRebuild('podcast-collection-voice', true);
      forcePlaybackControlsInteractive();
      await playQueueAt(0);
      showToast('载入: ' + (title || '喜欢的声音'));
      return;
    }
    renderMyPodcastRadioItems(key, title, items);
  } catch (e) {
    console.warn(e);
    showToast('播客加载失败');
  } finally {
    hideLoading();
  }
}
async function loadPodcastRadioIntoQueue(id, autoplay, title) {
  if (!id) return;
  showLoading();
  try {
    var r = await apiJson('/api/podcast/programs?id=' + encodeURIComponent(id) + '&limit=36');
    if (r.error) { showToast('播客加载失败: ' + r.error); return; }
    if (!r.programs || !r.programs.length) { showToast('播客暂无可播放节目'); return; }
    playQueue = r.programs.map(cloneSong);
    currentIdx = 0;
    safeRenderQueuePanel('podcast-radio');
    safeSwitchPlaylistTab('queue', 'podcast-radio');
    safeShelfRebuild('podcast-radio', true);
    forcePlaybackControlsInteractive();
    if (autoplay) await playQueueAt(0);
    showToast('载入: ' + (title || '播客'));
  } catch (e) {
    console.warn(e);
    showToast('播客加载失败');
  } finally {
    hideLoading();
  }
}
async function loadPlaylistIntoQueueById(id, autoplay, title) {
  if (!id) return;
  homeForcedOpen = false;
  homeSuppressed = false;
  updateEmptyHomeVisibility();
  showLoading();
  var qqPlaylistId = String(id || '').indexOf('qq:') === 0 ? String(id).slice(3) : '';
  var r = null;
  try {
    r = qqPlaylistId
      ? await apiJson('/api/qq/playlist/tracks?id=' + encodeURIComponent(qqPlaylistId))
      : await apiJson('/api/playlist/tracks?id=' + encodeURIComponent(id));
  } catch (e) {
    console.warn('[PlaylistLoadApi]', id, e);
    showToast('歌单加载失败');
    hideLoading();
    return;
  }
  try {
    if (r.error) { showToast('歌单加载失败: ' + r.error); return; }
    if (!r.tracks || !r.tracks.length) { showToast('歌单为空'); return; }
    playQueue = r.tracks.map(cloneSong);
    if (!qqPlaylistId && isLikedPlaylistContext(id, title, r.playlist)) markSongsLiked(playQueue, true);
    if (!qqPlaylistId) syncLikeStatusForSongs(playQueue);
    currentIdx = 0;
    safeRenderQueuePanel('playlist-load');
    safeSwitchPlaylistTab('queue', 'playlist-load');
    safeShelfRebuild('playlist-load', true);
    forcePlaybackControlsInteractive();
    if (autoplay) {
      try {
        await playQueueAt(0);
      } catch (playErr) {
        console.warn('[PlaylistAutoplay]', id, playErr);
        showToast('歌单已载入，播放启动失败');
      }
    }
    forcePlaybackControlsInteractive();
    showToast('载入: ' + (title || ('歌单 ' + id)));
  } catch (e) {
    console.warn('[PlaylistLoadState]', id, e);
    forcePlaybackControlsInteractive();
    showToast('歌单已载入，界面刷新失败');
  } finally {
    hideLoading();
  }
}

// 进度条
var progressDragState = { active: false, lastParticleAt: 0 };
function normalizePlaybackDurationSeconds(value) {
  var raw = Number(value);
  if (!isFinite(raw) || raw <= 0) return 0;
  return raw > 1000 ? raw / 1000 : raw;
}
function playbackDurationFromSong(song) {
  if (!song) return 0;
  return normalizePlaybackDurationSeconds(song.duration || song.durationMs || song.dt || 0);
}
function getPlaybackDurationSeconds() {
  if (audio && isFinite(audio.duration) && audio.duration > 0) return audio.duration;
  return playbackDurationFromSong(currentCoverSong());
}
function getPlaybackCurrentSeconds() {
  return audio && isFinite(audio.currentTime) && audio.currentTime > 0 ? audio.currentTime : 0;
}
function setProgressVisual(percent) {
  percent = clampRange(percent || 0, 0, 100);
  var fill = document.getElementById('progress-fill');
  var thumb = document.getElementById('progress-thumb');
  if (fill) fill.style.width = percent + '%';
  if (thumb) thumb.style.left = percent + '%';
}
function updatePlaybackProgressUi() {
  var durationSec = getPlaybackDurationSeconds();
  var currentSec = getPlaybackCurrentSeconds();
  if (durationSec > 0 && currentSec > durationSec) currentSec = durationSec;
  setProgressVisual(durationSec > 0 ? (currentSec / durationSec * 100) : 0);
  var timeDisplay = document.getElementById('time-display');
  if (timeDisplay) timeDisplay.textContent = formatProgramTime(currentSec) + ' / ' + (durationSec > 0 ? formatProgramTime(durationSec) : '0:00');
}
function bindPlaybackProgressEvents(audioEl) {
  if (!audioEl || audioEl._mineradioProgressBound) return;
  audioEl._mineradioProgressBound = true;
  ['loadedmetadata', 'durationchange', 'timeupdate', 'seeked', 'play', 'pause', 'emptied'].forEach(function(name){
    audioEl.addEventListener(name, updatePlaybackProgressUi);
  });
  ['play', 'playing', 'pause', 'ended', 'emptied', 'abort', 'error'].forEach(function(name){
    audioEl.addEventListener(name, function(){ syncPlaybackStateFromAudioEvent(name); });
  });
}
function emitProgressDragParticles(x, y) {
  var now = performance.now();
  if (now - progressDragState.lastParticleAt < 46) return;
  progressDragState.lastParticleAt = now;
  for (var i = 0; i < 3; i++) {
    var dot = document.createElement('span');
    dot.className = 'progress-drag-particle';
    var dx = (Math.random() - 0.5) * 34;
    var dy = -10 - Math.random() * 28;
    dot.style.setProperty('--px', x + 'px');
    dot.style.setProperty('--py', y + 'px');
    dot.style.setProperty('--dx', dx + 'px');
    dot.style.setProperty('--dy', dy + 'px');
    document.body.appendChild(dot);
    setTimeout((function(el){ return function(){ if (el && el.parentNode) el.parentNode.removeChild(el); }; })(dot), 700);
  }
}
function seekFromProgressPointer(e, emitParticles) {
  var durationSec = getPlaybackDurationSeconds();
  if (!audio || !durationSec) return;
  var bar = document.getElementById('progress-bar');
  var rect = bar.getBoundingClientRect();
  var ratio = clampRange((e.clientX - rect.left) / rect.width, 0, 1);
  audio.currentTime = ratio * durationSec;
  setProgressVisual(ratio * 100);
  syncBeatMapPlaybackCursor(audio.currentTime);
  if (emitParticles) emitProgressDragParticles(e.clientX, rect.top + rect.height / 2);
}
var progressBar = document.getElementById('progress-bar');
progressBar.addEventListener('pointerdown', function(e){
  if (!audio || !audio.duration) return;
  progressDragState.active = true;
  progressBar.classList.add('is-dragging');
  try { progressBar.setPointerCapture(e.pointerId); } catch (err) {}
  seekFromProgressPointer(e, true);
});
progressBar.addEventListener('pointermove', function(e){
  if (!progressDragState.active) return;
  seekFromProgressPointer(e, true);
});
function endProgressDrag(e) {
  if (!progressDragState.active) return;
  progressDragState.active = false;
  progressBar.classList.remove('is-dragging');
  try { progressBar.releasePointerCapture(e.pointerId); } catch (err) {}
}
progressBar.addEventListener('pointerup', endProgressDrag);
progressBar.addEventListener('pointercancel', endProgressDrag);
progressBar.addEventListener('lostpointercapture', function(){ progressDragState.active = false; progressBar.classList.remove('is-dragging'); });
setInterval(function(){
  if (!audio) { updatePlaybackProgressUi(); return; }
  updateListenStatsTick(false);
  updatePlaybackProgressUi();
  if (audio.currentTime) updateLyricsHighlight();
}, 200);

// ============================================================
//  文件拖放
// ============================================================
document.getElementById('file-input').addEventListener('change', function(e){ handleFiles(e.target.files); e.target.value = ''; });
function handleFiles(files) {
  var audioFile = null, imgFile = null;
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    if (f.type.startsWith('audio/') || /\.(mp3|flac|wav|ogg|m4a)$/i.test(f.name)) audioFile = f;
    else if (f.type.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(f.name)) imgFile = f;
  }
  if (audioFile) {
    finalizeListenSession(false);
    var url = URL.createObjectURL(audioFile);
    var localTitle = audioFile.name.replace(/\.[^.]+$/, '');
    trackSwitchToken++;
    var token = trackSwitchToken;
    var firstVisualPlay = !firstPlayDone;
    if (localBeatAnalysis.active) cancelLocalBeatAnalysis();
    closeGsapModal(document.getElementById('local-beat-modal'));
    cancelBeatAnalysisTimer();
    cancelDjBeatAnalysisTimer();
    beatMapToken++;
    djBeatMapToken++;
    setDjModeActive(false);
    currentBeatMap = null;
    resetDjBeatMapState();
    beatMapNextIdx = 0;
    resetAudioVisualState();
    resetBeatCameraSync(0);
    currentIdx = -1;
    currentLocalSong = hydrateCustomCover({
      type: 'local',
      name: localTitle,
      artist: '本地文件',
      localKey: [audioFile.name, audioFile.size || 0, audioFile.lastModified || 0].join(':'),
      localUrl: url,
      duration: 0
    });
    updateCustomCoverButton();
    document.getElementById('hint').classList.add('hidden');
    document.getElementById('thumb-title').textContent = localTitle;
    document.getElementById('thumb-artist').textContent = '本地文件';
    updateControlTrackInfo({ name: localTitle, artist: '本地文件' });
    document.getElementById('thumb-wrap').classList.add('visible');
    safeRenderQueuePanel('play-local-file');
    safeShelfRebuild('play-local-file', true);
    suppressShelfPreviewForPlaybackSwitch();
    if (firstVisualPlay) { firstPlayDone = true; tweenParticleAlpha(uniforms.uAlpha.value || 0, 1.0, 260); }
    if (!audio) { audio = new Audio(); audio.crossOrigin = 'anonymous'; }
    else audio.pause();
    bindPlaybackProgressEvents(audio);
    applyVolumeToAudio();
    audio.src = url;
    updatePlaybackProgressUi();
    lyricSunEnergy = 0; lyricSunTarget = 0; lyricSunHold = 0; lyricSunAvg = 0; lyricSunPeak = 0.55;
    audio.onended = function(){ finalizeListenSession(true); playing = false; setPlayIcon(false); };
    audio.onloadedmetadata = function(){
      if (currentLocalSong && currentLocalSong.localUrl === url) {
        currentLocalSong.duration = audio && isFinite(audio.duration) ? audio.duration : 0;
        if (lyricSourceMode === 'custom') applyCustomLyricState(currentLocalSong, true);
      }
    };
    var localLyricLines = withLyricFallback([]);
    setOriginalLyricsState(localLyricLines, false, 'fallback');
    applyPreferredLyricsForCurrent(true);
    document.getElementById('trial-banner').classList.remove('show');
    audio.load();
    playAudio().then(function(ok){
      if (ok && currentLocalSong && currentLocalSong.localUrl === url) beginListenSession(currentLocalSong, null);
    });
    setTimeout(function(){
      if (currentLocalSong && currentLocalSong.localUrl === url) prepareLocalBeatAnalysis(currentLocalSong, url);
    }, 520);
    var localCover = getCustomCoverForSong(currentLocalSong);
    var localCoverOpts = { trackToken: token, deferHeavy: firstVisualPlay, delay: firstVisualPlay ? 60 : 0, timeout: firstVisualPlay ? 300 : 180 };
    if (localCover) applyCoverDataUrl(localCover, localCoverOpts);
    else if (!imgFile) loadCoverFromUrl('', localCoverOpts);
  }
  if (imgFile) {
    var uploadCoverOpts = audioFile
      ? { trackToken: trackSwitchToken, deferHeavy: !!firstVisualPlay, delay: firstVisualPlay ? 60 : 0, timeout: firstVisualPlay ? 300 : 180 }
      : null;
    loadCoverFromFile(imgFile, uploadCoverOpts);
  }
  if (!audioFile) updateCustomCoverButton();
}
var dropOv = document.getElementById('drop-overlay'), dragCount = 0;
document.addEventListener('dragenter', function(e){ e.preventDefault(); dragCount++; dropOv.classList.add('show'); });
document.addEventListener('dragleave', function(e){ e.preventDefault(); dragCount--; if (dragCount<=0){ dragCount=0; dropOv.classList.remove('show'); } });
document.addEventListener('dragover',  function(e){ e.preventDefault(); });
document.addEventListener('drop', function(e){
  e.preventDefault(); dragCount = 0; dropOv.classList.remove('show');
  if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
});

