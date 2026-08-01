// ============================================================
// 离线音乐管理面板 (独立 modal)
// 依赖全局: offlineCachePrefs / saveOfflineCachePrefs /
//           offlineAudioManifest / getOfflineStats / deleteOfflineAudio /
//           clearAllOfflineAudio / loadOfflineAudioManifest (19-offline-cache-core)
//           showToast / escHtml (09-idle-toast-libraries)
// 触发: 设置页「离线音乐管理」按钮 -> #offline-cache-modal
// ============================================================
'use strict';

// 自含样式(暗色主题, 与 cache-storage-panel 一致)
(function injectOfflinePanelStyles() {
  try {
    var st = document.createElement('style');
    st.textContent =
      '.offline-cache-panel{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:10px 11px 12px;margin:8px 0 4px}' +
      '.offline-cache-row{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:11.5px;color:rgba(255,255,255,.72);padding:5px 0}' +
      '.offline-cache-select{background:rgba(0,0,0,.32);color:#fff;border:1px solid rgba(255,255,255,.14);border-radius:7px;padding:4px 7px;font-size:11.5px;max-width:150px;outline:none}' +
      '.offline-cache-select:focus{border-color:rgba(120,200,255,.6)}' +
      '.offline-cache-list{margin-top:8px;max-height:240px;overflow-y:auto;border-top:1px solid rgba(255,255,255,.07);padding-top:6px}' +
      '.offline-cache-empty{font-size:11px;color:rgba(255,255,255,.4);padding:8px 2px;line-height:1.5}' +
      '.offline-cache-item{display:flex;align-items:center;gap:8px;padding:5px 2px;border-bottom:1px solid rgba(255,255,255,.05)}' +
      '.offline-cache-item-main{flex:1;min-width:0}' +
      '.offline-cache-item-name{font-size:11.5px;color:rgba(255,255,255,.86);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.offline-cache-item-sub{font-size:10.5px;color:rgba(255,255,255,.42)}' +
      '.offline-cache-del{flex:0 0 auto;width:22px;height:22px;border:0;border-radius:6px;background:transparent;color:rgba(255,255,255,.45);cursor:pointer;font-size:12px;line-height:1}' +
      '.offline-cache-del:hover{background:rgba(255,90,90,.16);color:#ff9a9a}';
    document.head.appendChild(st);
  } catch (e) {}
})();

function escOfflineAttr(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatOfflineBytes(n) {
  if (typeof formatMineradioCacheBytes === 'function') return formatMineradioCacheBytes(n);
  var b = Number(n) || 0;
  if (b < 1024) return b + ' B';
  var units = ['KB', 'MB', 'GB', 'TB'];
  var i = -1;
  do { b /= 1024; i++; } while (i < units.length - 1 && b >= 1024);
  return b.toFixed(b < 10 ? 2 : b < 100 ? 1 : 0) + ' ' + units[i];
}

function openOfflineCacheDir() {
  if (window.desktopWindow && typeof window.desktopWindow.openOfflineDir === 'function') {
    window.desktopWindow.openOfflineDir().catch(function () {});
  } else if (typeof showToast === 'function') {
    showToast('仅桌面版支持打开离线目录');
  }
}

function openOfflineCacheModal() {
  var modal = document.getElementById('offline-cache-modal');
  if (!modal) return;
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
  refreshOfflineCachePanel();
  document.body.classList.add('offline-cache-modal-open');
}

function closeOfflineCacheModal() {
  var modal = document.getElementById('offline-cache-modal');
  if (!modal) return;
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('offline-cache-modal-open');
}

function onOfflineCacheModalKey(ev) {
  if (ev.key === 'Escape' && document.getElementById('offline-cache-modal') && document.getElementById('offline-cache-modal').classList.contains('show')) {
    closeOfflineCacheModal();
  }
}

function clearAllOfflineCacheConfirm() {
  var stats = (typeof getOfflineStats === 'function') ? getOfflineStats() : { count: 0 };
  if (!stats.count) {
    if (typeof showToast === 'function') showToast('没有可清空的离线歌曲');
    return;
  }
  if (typeof window.confirm === 'function' && !window.confirm('确定清空全部 ' + stats.count + ' 首离线歌曲吗？此操作不可恢复。')) return;
  if (typeof showToast === 'function') showToast('正在清空离线缓存…');
  clearAllOfflineAudio().then(function () {
    if (typeof showToast === 'function') showToast('已清空离线缓存');
    renderOfflineCachePanel();
  });
}

function deleteOfflineCacheItem(key) {
  if (!key) return;
  deleteOfflineAudio(key).then(function () {
    renderOfflineCachePanel();
  });
}

// P3: 为已下载(但可能缺标签)的离线文件批量补写 FLAC/MP3 标签
function backfillOfflineTags() {
  var keys = Object.keys(offlineAudioManifest || {});
  if (!keys.length) {
    if (typeof showToast === 'function') showToast('没有可补全的离线歌曲');
    return;
  }
  if (typeof showToast === 'function') showToast('正在补全 ' + keys.length + ' 首文件标签…');
  var i = 0;
  function step() {
    if (i >= keys.length) {
      if (typeof showToast === 'function') showToast('标签补全完成');
      renderOfflineCachePanel();
      return;
    }
    var k = keys[i++];
    apiJson('/api/offline-tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: k }),
      timeoutMs: 60000,
    }).then(function () { step(); }, function () { step(); });
  }
  step();
}

function renderOfflineCachePanel() {
  var totalNode = document.getElementById('offline-cache-total');
  var pathNode = document.getElementById('offline-cache-path');
  var listNode = document.getElementById('offline-cache-list');
  if (!listNode) return;
  var qSel = document.getElementById('offline-cache-quality');
  var nSel = document.getElementById('offline-cache-naming');
  if (qSel && qSel.value !== (offlineCachePrefs.quality || 'default')) qSel.value = offlineCachePrefs.quality || 'default';
  if (nSel && nSel.value !== (offlineCachePrefs.naming || 'title-artist')) nSel.value = offlineCachePrefs.naming || 'title-artist';

  var stats = (typeof getOfflineStats === 'function') ? getOfflineStats() : { count: 0, totalBytes: 0 };
  if (totalNode) totalNode.textContent = stats.count + ' 首 · ' + formatOfflineBytes(stats.totalBytes);
  if (pathNode && window.desktopWindow && typeof window.desktopWindow.getCacheSettings === 'function') {
    window.desktopWindow.getCacheSettings().then(function (snap) {
      var p = (snap && snap.settings && snap.settings.offlinePath) || '离线目录/offline';
      pathNode.textContent = p;
    }).catch(function () {});
  }

  var keys = Object.keys(offlineAudioManifest || {});
  if (!keys.length) {
    listNode.innerHTML = '<div class="offline-cache-empty">还没有离线歌曲。在搜索或歌单里点下载按钮即可缓存到本地。</div>';
    return;
  }
  listNode.innerHTML = keys.map(function (k) {
    var e = offlineAudioManifest[k] || {};
    var label = [e.name || '未知歌曲', e.artist || ''].filter(Boolean).join(' - ');
    var size = e.size ? formatOfflineBytes(e.size) : '';
    var tagOk = e.tagStatus && e.tagStatus !== 'SKIPPED' && String(e.tagStatus).indexOf('failed') !== 0;
    var tagText = tagOk ? '已写标签' : (e.tagStatus && String(e.tagStatus).indexOf('failed') === 0 ? '标签失败' : '');
    var sub = [e.quality || '', size, tagText].filter(Boolean).join(' · ');
    return '<div class="offline-cache-item">' +
      '<div class="offline-cache-item-main"><div class="offline-cache-item-name">' + escHtml(label) + '</div>' +
      '<div class="offline-cache-item-sub">' + escHtml(sub) + '</div></div>' +
      '<button type="button" class="offline-cache-del" title="删除" data-offline-del="' + escOfflineAttr(k) + '">✕</button>' +
      '</div>';
  }).join('');
}

function refreshOfflineCachePanel() {
  loadOfflineAudioManifest().then(renderOfflineCachePanel);
}

function bindOfflineCachePanel() {
  var qSel = document.getElementById('offline-cache-quality');
  var nSel = document.getElementById('offline-cache-naming');
  var listNode = document.getElementById('offline-cache-list');
  if (qSel && !qSel._offlineBound) {
    qSel._offlineBound = true;
    qSel.addEventListener('change', function () {
      offlineCachePrefs.quality = qSel.value || 'default';
      saveOfflineCachePrefs();
      if (typeof showToast === 'function') showToast('离线音质已设为：' + (offlineCachePrefs.quality === 'default' ? '跟随播放默认' : offlineCachePrefs.quality));
    });
  }
  if (nSel && !nSel._offlineBound) {
    nSel._offlineBound = true;
    nSel.addEventListener('change', function () {
      offlineCachePrefs.naming = nSel.value || 'title-artist';
      saveOfflineCachePrefs();
      if (typeof showToast === 'function') showToast('文件命名规则已更新（下次下载生效）');
    });
  }
  if (listNode && !listNode._offlineBound) {
    listNode._offlineBound = true;
    listNode.addEventListener('click', function (ev) {
      var del = ev.target && ev.target.closest ? ev.target.closest('[data-offline-del]') : null;
      if (del) {
        ev.stopPropagation();
        deleteOfflineCacheItem(del.getAttribute('data-offline-del'));
      }
    });
  }
  if (!document._offlineKeyBound) {
    document._offlineKeyBound = true;
    document.addEventListener('keydown', onOfflineCacheModalKey);
  }
}

bindOfflineCachePanel();
refreshOfflineCachePanel();
