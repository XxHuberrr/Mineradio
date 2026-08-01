// ============================================================
// 离线缓存 UI (P1: 搜索结果行下载按钮; P2: 歌单行/整页下载)
// 依赖全局: downloadOfflineAudio / hasOfflineAudio / downloadOfflineAudioBatch /
//           playlistPanelDetailState / renderPlaylistPanelDetailRows (19 / 02-playlist-detail)
//           showToast (09-idle-toast-libraries)
//           searchMusicRenderState (07-search)
// ============================================================
'use strict';

// 注入极简样式: 下载按钮基础态 / 已离线(绿) / 下载中(半透明)
(function injectOfflineCacheStyles() {
  try {
    var st = document.createElement('style');
    st.textContent =
      '.offline-dl-btn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border:0;background:transparent;color:rgba(255,255,255,.5);cursor:pointer;border-radius:6px;flex:0 0 auto;margin-left:6px;transition:color .15s,background .15s}' +
      '.offline-dl-btn:hover{color:#fff;background:rgba(255,255,255,.08)}' +
      '.offline-dl-btn.cached{color:#4ade80}' +
      '.offline-dl-btn.loading{opacity:.5;pointer-events:none}';
    document.head.appendChild(st);
  } catch (e) {}
})();

function downloadIconSvg() {
  return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>';
}

function downloadSearchResultOffline(i) {
  var song = searchMusicRenderState && searchMusicRenderState.songs && searchMusicRenderState.songs[i];
  if (!song) return;
  var btn = document.querySelector('[data-offline-index="' + i + '"]');
  if (btn) { btn.classList.add('loading'); btn.title = '下载中…'; }
  if (typeof showToast === 'function') showToast('开始下载：' + (song.name || '歌曲'));
  downloadOfflineAudio(song).then(function (r) {
    if (!btn) return;
    btn.classList.remove('loading');
    if (r && r.ok) {
      btn.classList.add('cached');
      btn.title = '已离线';
      if (typeof showToast === 'function') showToast('已离线：' + (song.name || '歌曲'));
      // P6: 若本次下载来自「为某首歌找相似版本」的上下文, 关联到原曲
      if (typeof offlineFallbackOrigSong !== 'undefined' && offlineFallbackOrigSong) {
        if (typeof aliasOfflineAudioForOriginal === 'function') aliasOfflineAudioForOriginal(offlineFallbackOrigSong, song);
        var _origName = offlineFallbackOrigSong.name || offlineFallbackOrigSong.title || '原歌曲';
        if (typeof showToast === 'function') showToast('已为《' + _origName + '》关联缓存：' + (song.name || '相似版本'));
        if (typeof clearOfflineFallbackContext === 'function') clearOfflineFallbackContext();
      }
    } else {
      var msg;
      if (r && r.reason === 'TRIAL_FORBIDDEN') msg = '该歌曲仅试听，无法离线下载';
      else if (r && r.reason === 'PODCAST_NOT_CACHED') msg = '播客暂不支持离线';
      else if (r && r.reason === 'NO_URL') {
        var why = r.detail ? ('：' + r.detail) : '：该歌曲源站未返回可用下载地址（版权 / 会员 / 地区限制等）';
        msg = '无法缓存' + why + '，已自动搜索相似版本，点下载即可关联';
        if (typeof openSimilarVersionSearchForOffline === 'function') openSimilarVersionSearchForOffline(song);
      } else msg = '下载失败：' + (r && r.reason || '未知错误');
      btn.title = (r && r.reason === 'NO_URL' && r.detail) ? ('下载失败：' + r.detail) : '下载失败';
      if (typeof showToast === 'function') showToast(msg);
    }
  });
}

// ---------- 歌单详情行下载 ----------
function downloadPlaylistDetailOffline(i) {
  var st = playlistPanelDetailState;
  var song = st && st.tracks && st.tracks[i];
  if (!song) return;
  var btn = document.querySelector('[data-offline-pl-index="' + i + '"]');
  if (btn) { btn.classList.add('loading'); btn.title = '下载中…'; }
  if (typeof showToast === 'function') showToast('开始下载：' + (song.name || '歌曲'));
  downloadOfflineAudio(song).then(function (r) {
    if (!btn) {
      // 行已重渲, 直接整页刷新缓存标记
      if (typeof renderPlaylistPanelDetailRows === 'function') renderPlaylistPanelDetailRows();
      return;
    }
    btn.classList.remove('loading');
    if (r && r.ok) {
      btn.classList.add('cached');
      btn.title = '已离线';
      btn.innerHTML = '✓';
      if (typeof showToast === 'function') showToast('已离线：' + (song.name || '歌曲'));
    } else {
      var msg;
      if (r && r.reason === 'TRIAL_FORBIDDEN') msg = '该歌曲仅试听，无法离线下载';
      else if (r && r.reason === 'PODCAST_NOT_CACHED') msg = '播客暂不支持离线';
      else if (r && r.reason === 'NO_URL') {
        var why = r.detail ? ('：' + r.detail) : '：该歌曲源站未返回可用下载地址（版权 / 会员 / 地区限制等）';
        msg = '无法缓存' + why + '，已自动搜索相似版本，点下载即可关联';
        if (typeof openSimilarVersionSearchForOffline === 'function') openSimilarVersionSearchForOffline(song);
      } else msg = '下载失败：' + (r && r.reason || '未知错误');
      btn.title = (r && r.reason === 'NO_URL' && r.detail) ? ('下载失败：' + r.detail) : '下载失败';
      if (typeof showToast === 'function') showToast(msg);
    }
  });
}

// ---------- 歌单整页缓存 ----------
function downloadPlaylistDetailAllOffline() {
  var st = playlistPanelDetailState;
  if (!st || !st.tracks || !st.tracks.length) {
    if (typeof showToast === 'function') showToast('歌单暂无可缓存歌曲');
    return;
  }
  var songs = st.tracks.filter(Boolean);
  if (typeof showToast === 'function') showToast('开始缓存整页（' + songs.length + ' 首）');
  var lastToast = 0;
  downloadOfflineAudioBatch(songs, {
    onProgress: function (p) {
      var now = Date.now();
      if (now - lastToast > 1200 || p.done === p.total) {
        lastToast = now;
        if (typeof showToast === 'function') showToast('缓存中 ' + p.done + ' / ' + p.total);
      }
    }
  }).then(function (res) {
    if (typeof showToast === 'function') {
      var parts = ['缓存完成：成功 ' + res.ok, '已存在 ' + res.skipped];
      if (res.failed.length) parts.push('失败 ' + res.failed.length);
      showToast(parts.join('，'));
    }
    if (typeof renderPlaylistPanelDetailRows === 'function') renderPlaylistPanelDetailRows();
  });
}
