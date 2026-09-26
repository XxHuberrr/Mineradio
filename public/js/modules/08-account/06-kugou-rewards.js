// 账号面板「今日奖励」区块（酷狗概念版）：每日领取 / 听歌奖励 / 广告奖励进度
// 数据来源：/api/kugou/vip/reward-summary（服务端已做兜底，任何失败都返回可展示的降级结果）
// 前端兜底原则：任何异常都不冒泡、不阻塞账号面板；拿不到线上数据就展示上次结果或占位符
var KUGOU_REWARD_POLL_MS = 10000;
var KUGOU_REWARD_POLL_MAX = 18; // 10s × 18 ≈ 3 分钟（服务端广告奖励每 30 秒一步、最多 8 步）
var kugouRewardSummary = null;
var kugouRewardClaimBusy = false;
var kugouRewardPollTimer = null;
var kugouRewardPollTicks = 0;
var kugouRewardFetchFailStreak = 0;

function kugouRewardSetText(id, text, tone) {
  var el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = 'kugou-reward-value' + (tone ? (' ' + tone) : '');
}

function kugouRewardFmtExpire(value) {
  var text = String(value || '').trim();
  if (!text) return '—';
  var m = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  return m ? (m[1] + '-' + m[2] + '-' + m[3] + ' ' + m[4] + ':' + m[5]) : text;
}

function kugouRewardFmtHours(hours) {
  var n = Number(hours) || 0;
  if (n <= 0) return '0 小时';
  return (Math.round(n * 100) / 100) + ' 小时';
}

function kugouRewardVipText(vip) {
  vip = vip || {};
  if (!vip.isVip) return '无会员';
  var expire = kugouRewardFmtExpire(vip.expireAt);
  return (vip.label || 'VIP') + (expire === '—' ? '' : (' · 至 ' + expire));
}

function kugouRewardAdText(ad) {
  ad = ad || {};
  if (ad.enabled === false) return '已关闭';
  var total = Number(ad.total) || 8;
  var done = Number(ad.done) || 0;
  if (ad.state === 'done') return done + '/' + total + ' 已领满';
  if (ad.state === 'running') return done + '/' + total + ' 领取中…';
  if (ad.state === 'throttled') return done + '/' + total + ' 间隔中';
  if (ad.state === 'pending') return done + '/' + total + ' · 剩 ' + (Number(ad.remain) || 0) + ' 次';
  if (ad.state === 'unknown') return '0/' + total + ' · 待领取';
  return '—';
}

function kugouRewardListenText(listen) {
  listen = listen || {};
  if (listen.state === 'claimed') return '今日已领取';
  if (listen.state === 'pending') return '待完成（播完一首歌自动上报）';
  return '—';
}

function kugouRewardDailyText(daily) {
  daily = daily || {};
  if (daily.state === 'claimed') return '今日已领取';
  if (daily.state === 'pending') return '待领取（听歌自动补领）';
  return '—';
}

function kugouRewardTipText() {
  if (kugouRewardClaimBusy) return '正在补领，每 30 秒领取一次';
  if (!kugouRewardSummary) return '';
  if (kugouRewardSummary.degraded && kugouRewardSummary.note) return kugouRewardSummary.note;
  var ad = kugouRewardSummary.ad || {};
  if (ad.enabled === false) return '广告奖励已关闭';
  if (ad.state === 'done') return '今日额度已领满，明天自动重置';
  if (ad.remainVipHour > 0) return '还可领 ' + kugouRewardFmtHours(ad.remainVipHour) + ' VIP';
  return '';
}

function renderKugouRewardPanel() {
  try {
    var panel = document.getElementById('kugou-reward-panel');
    if (!panel) return;
    var isKugou = (typeof activeAccountProvider !== 'undefined' && activeAccountProvider === 'kugou');
    var loggedIn = (typeof hasPlatformLogin === 'function') && hasPlatformLogin('kugou');
    if (!isKugou || !loggedIn) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    var s = kugouRewardSummary;
    var loading = !s;
    kugouRewardSetText('kugou-reward-vip', loading ? '读取中…' : kugouRewardVipText(s.vip), 'accent');
    kugouRewardSetText('kugou-reward-ad', loading ? '读取中…' : kugouRewardAdText(s.ad));
    kugouRewardSetText('kugou-reward-listen', loading ? '读取中…' : kugouRewardListenText(s.listen));
    kugouRewardSetText('kugou-reward-daily', loading ? '读取中…' : kugouRewardDailyText(s.daily));
    var tip = document.getElementById('kugou-reward-tip');
    if (tip) tip.textContent = kugouRewardTipText();
    var btn = document.getElementById('kugou-reward-claim-btn');
    if (btn) {
      var ad = (s && s.ad) || {};
      var finished = ad.state === 'done' || ad.state === 'disabled' || ad.enabled === false;
      btn.disabled = !!(kugouRewardClaimBusy || loading || finished);
      btn.textContent = kugouRewardClaimBusy ? '补领中…' : (ad.state === 'done' ? '已领满' : (ad.enabled === false ? '已关闭' : '补领奖励'));
      btn.style.display = (ad.enabled === false) ? 'none' : '';
    }
  } catch (e) {
    console.warn('[KugouReward] render failed:', e && e.message);
  }
}

function stopKugouRewardPoll() {
  if (kugouRewardPollTimer) { clearTimeout(kugouRewardPollTimer); kugouRewardPollTimer = null; }
}

function startKugouRewardPoll() {
  stopKugouRewardPoll();
  kugouRewardPollTicks = 0;
  kugouRewardPollTimer = setTimeout(function tick() {
    kugouRewardPollTimer = null;
    if (!kugouRewardClaimBusy) return;
    kugouRewardPollTicks += 1;
    refreshKugouRewardPanel().then(function () {
      var ad = (kugouRewardSummary && kugouRewardSummary.ad) || {};
      var finished = ad.state === 'done' || ad.state === 'disabled' || ad.enabled === false;
      var stalled = kugouRewardFetchFailStreak >= 3;
      if (finished || stalled || kugouRewardPollTicks >= KUGOU_REWARD_POLL_MAX) {
        kugouRewardClaimBusy = false;
        renderKugouRewardPanel();
        if (finished) showToast('今日奖励已领满');
        else if (stalled) showToast('奖励状态刷新失败，稍后可再点补领');
        return;
      }
      if (kugouRewardClaimBusy) startKugouRewardPoll();
    });
  }, KUGOU_REWARD_POLL_MS);
}

function refreshKugouRewardPanel() {
  return apiJson('/api/kugou/vip/reward-summary?t=' + Date.now(), { timeoutMs: 12000 })
    .then(function (data) {
      kugouRewardFetchFailStreak = 0;
      if (data && data.provider === 'kugou') {
        kugouRewardSummary = data;
        if (data.loggedIn === false) kugouRewardClaimBusy = false;
        if (!data.ad || data.ad.state !== 'running') {
          // 服务端说不在领取中：若本地还在「补领中」状态，说明已收尾
          var wasBusy = kugouRewardClaimBusy;
          if (wasBusy && data.ad && (data.ad.state === 'done' || data.ad.state === 'disabled')) {
            kugouRewardClaimBusy = false;
          }
        }
      } else {
        kugouRewardFetchFailStreak += 1;
      }
      renderKugouRewardPanel();
      return kugouRewardSummary;
    })
    .catch(function (e) {
      kugouRewardFetchFailStreak += 1;
      console.warn('[KugouReward] summary fetch failed:', e && e.message);
      if (!kugouRewardSummary) {
        kugouRewardSummary = {
          provider: 'kugou', loggedIn: true, degraded: true, note: '读取失败，点击补领可重试',
          vip: { level: 'none', label: '—', expireAt: '', isVip: false },
          ad: { enabled: true, state: 'unknown', done: 0, total: 8, remain: 0, remainVipHour: 0 },
          listen: { state: 'unknown' }, daily: { state: 'unknown' }
        };
      }
      renderKugouRewardPanel();
      return kugouRewardSummary;
    });
}

function claimKugouRewardsNow() {
  if (kugouRewardClaimBusy) return;
  if (typeof hasPlatformLogin === 'function' && !hasPlatformLogin('kugou')) {
    showToast('请先登录酷狗概念版');
    return;
  }
  if (kugouRewardSummary && kugouRewardSummary.ad && kugouRewardSummary.ad.enabled === false) {
    showToast('广告奖励已在启动参数中关闭');
    return;
  }
  kugouRewardClaimBusy = true;
  kugouRewardFetchFailStreak = 0;
  renderKugouRewardPanel();
  apiJson('/api/kugou/vip/ad-claim?t=' + Date.now(), { method: 'POST', timeoutMs: 15000 })
    .then(function (res) {
      if (res && res.provider === 'kugou' && res.skipped === 'DISABLED') {
        kugouRewardClaimBusy = false;
        showToast('广告奖励已关闭');
        return null;
      }
      if (res && res.provider === 'kugou' && res.skipped === 'NOT_LOGGED_IN') {
        kugouRewardClaimBusy = false;
        showToast('请先登录酷狗概念版');
        return null;
      }
      showToast('已开始补领今日奖励');
      startKugouRewardPoll();
      return refreshKugouRewardPanel();
    })
    .catch(function (e) {
      kugouRewardClaimBusy = false;
      renderKugouRewardPanel();
      showToast('补领失败：' + ((e && e.message) || '请稍后重试'));
    });
}
