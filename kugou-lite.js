// ====================================================================
//  kugou-lite.js — 酷狗音乐概念版（lite）API 内嵌调用层
//  - 直接加载 kugou-server（KuGouMusicApi，EchoMusic 同源）的模块
//  - 设备注册 / 签名 / 请求全部复用 kugou-server 的 util
//  - 提供搜索 / 歌词 / 播放URL / 用户信息 / VIP 的概念版实现
// ====================================================================
'use strict';

process.env.platform = 'lite'; // 必须最先设置：util/index.js 加载时读取

const path = require('path');
const fs = require('fs');

const KUGOU_SERVER_DIR = path.join(__dirname, 'kugou-server');

let _requestFactory = null;
let _crypto = null;
let _util = null;
let _cachedModules = Object.create(null);

function loadCore() {
  if (_requestFactory) return;
  _crypto = require(path.join(KUGOU_SERVER_DIR, 'util', 'crypto'));
  _util = require(path.join(KUGOU_SERVER_DIR, 'util', 'util'));
  const { createRequest } = require(path.join(KUGOU_SERVER_DIR, 'util', 'request'));
  _requestFactory = createRequest;
}

function loadModule(name) {
  if (_cachedModules[name]) return _cachedModules[name];
  const mod = require(path.join(KUGOU_SERVER_DIR, 'module', name + '.js'));
  _cachedModules[name] = mod;
  return mod;
}

// ---------- 设备状态 ----------
// 与 EchoMusic src/main/server.ts 一致：guid/mid/dev/mac/webgl 进程内生成一次
let _device = null;

function deviceState() {
  if (_device) return _device;
  loadCore();
  const guid = cryptoRandomGuid();
  const mid = _util.calculateMid(guid);
  const dev = _util.randomString(10).toUpperCase();
  const webgl = _util.generateWebGLHash();
  _device = { guid, mid, dev, mac: '02:00:00:00:00:00', webgl };
  return _device;
}

function cryptoRandomGuid() {
  return _crypto.cryptoMd5(_util.getGuid());
}

function deviceCookie(extra) {
  const d = deviceState();
  return Object.assign({
    KUGOU_API_MID: d.mid,
    KUGOU_API_GUID: d.guid,
    KUGOU_API_DEV: d.dev,
    KUGOU_API_MAC: d.mac,
    KUGOU_API_WEBGL: d.webgl,
    KUGOU_API_PLATFORM: 'lite',
  }, extra || {});
}

// ---------- dfid 注册（带缓存） ----------
let _dfid = null;
let _dfidPromise = null;

function ensureDfid() {
  if (_dfid) return Promise.resolve(_dfid);
  if (_dfidPromise) return _dfidPromise;
  _dfidPromise = (async () => {
    const res = await callModule('register_dev', {}, deviceCookie());
    const dfid = res && res.body && res.body.data && res.body.data.dfid;
    if (!dfid) throw new Error('register_dev failed: no dfid');
    _dfid = dfid;
    return dfid;
  })().catch((e) => {
    _dfidPromise = null;
    throw e;
  });
  return _dfidPromise;
}

// ---------- 通用模块调用 ----------
// 与 EchoMusic handleApiRequest 对齐：params + cookie 合并后交给 module
function callModule(name, params, cookie) {
  const mod = loadModule(name);
  return mod(Object.assign({}, params || {}, { cookie: cookie || {} }), (config) => {
    config.ip = '';
    return _requestFactory(config);
  });
}

// 概念版专用 cookie：设备标识 + 用户登录态 + dfid
function buildLiteCookie(kugouCookie) {
  const base = deviceCookie();
  const extra = { userid: '0', token: '' };
  if (kugouCookie) {
    const text = String(kugouCookie || '');
    // 兼容 token=xxx;userid=xxx 或 KuGoo=... 复合 cookie
    const parts = text.split(/;\s*/);
    for (const part of parts) {
      const eq = part.indexOf('=');
      if (eq < 1) continue;
      const key = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      if (!key || !value) continue;
      if (key === 'token' || key === 'Token') extra.token = value;
      else if (/^userid$/i.test(key)) extra.userid = value;
      else if (key === 'dfid' || key === 'kg_dfid') base.dfid = value;
    }
    // 从 KuGoo 复合字段也尝试提取
    const kuGoo = text.match(/KuGoo=([^;]+)/);
    if (kuGoo && kuGoo[1]) {
      const t = kuGoo[1].match(/\bt=([^&]+)/);
      if (t && !extra.token) extra.token = decodeURIComponent(t[1]);
      const uid = kuGoo[1].match(/KugooID=([^&]+)/);
      if (uid && (!extra.userid || extra.userid === '0')) extra.userid = decodeURIComponent(uid[1]);
    }
  }
  return Object.assign({}, base, extra);
}

// 每次调用都确保 dfid（未注册时先注册）
async function liteCall(name, params, kugouCookie) {
  loadCore();
  const dfid = await ensureDfid();
  const cookie = buildLiteCookie(kugouCookie);
  cookie.dfid = dfid;
  return callModule(name, params, cookie);
}

// ====================================================================
//  业务封装（返回值对齐 Mineradio 现有格式，尽量复用 kugou-api 转换）
// ====================================================================

const kugouApi = require('./kugou-api');

// 搜索：概念版返回 data.lists → mapKugouSearchItem（字段完全兼容）
async function liteSearch(keywords, limit, kugouCookie, offset) {
  const kw = String(keywords || '').trim();
  if (!kw) return [];
  const lim = Math.max(1, Math.min(Number(limit) || 10, 20));
  const start = Math.max(0, Number(offset) || 0);
  const pageSize = lim;
  const page = Math.floor(start / pageSize) + 1;
  const res = await liteCall('search', {
    keywords: kw,
    type: 'song',
    page,
    pagesize: pageSize,
  }, kugouCookie);
  const body = res && res.body;
  const lists = body && body.data && Array.isArray(body.data.lists) ? body.data.lists : [];
  return lists
    .map((item) => {
      // 概念版返回 FileName="歌手 - 歌名"，SongName 为空；补 OriSongName 到 SongName 让转换层取到纯歌名
      if (item && !item.SongName && item.OriSongName) item.SongName = item.OriSongName;
      return typeof kugouApi.mapKugouSearchItem === 'function' ? kugouApi.mapKugouSearchItem(item) : item;
    })
    .filter((s) => s && s.name && (s.hash || s.id));
}

// 歌词：search/lyric → candidates[0] → lyric(fmt=lrc, decode)
async function liteLyric(hash, albumAudioId, durationSec, kugouCookie) {
  const fileHash = String(hash || '').trim();
  if (!fileHash) return { provider: 'kugou', error: 'Missing Kugou hash', lyric: '' };
  const durationMs = Math.max(0, Number(durationSec) || 0) * 1000;
  try {
    const searchRes = await liteCall('search_lyric', {
      hash: fileHash,
      duration: durationMs || 0,
      album_audio_id: String(albumAudioId || 0),
      man: 'no',
    }, kugouCookie);
    const candidates = (searchRes.body && searchRes.body.candidates) || [];
    const cand = candidates[0];
    if (!cand || !cand.id) return { provider: 'kugou', hash: fileHash, lyric: '', trans: '' };
    const lyricRes = await liteCall('lyric', {
      id: cand.id,
      accesskey: cand.accesskey || '',
      fmt: 'lrc',
      decode: 'true',
    }, kugouCookie);
    const content = lyricRes.body && lyricRes.body.content;
    let lyric = '';
    if (content) {
      try { lyric = Buffer.from(String(content), 'base64').toString('utf8').replace(/^\uFEFF/, ''); } catch (_) { lyric = ''; }
    }
    return { provider: 'kugou', hash: fileHash, lyric, trans: '' };
  } catch (e) {
    console.warn('[KugouLiteLyric]', e && (e.message || e));
    return { provider: 'kugou', hash: fileHash, lyric: '', trans: '' };
  }
}

// 播放 URL：概念版 /song/url（encryptKey 签名音源）
async function liteSongUrl(params, kugouCookie) {
  params = params || {};
  const hash = String(params.hash || params.fileHash || params.id || '').trim();
  if (!hash) return { provider: 'kugou', url: '', playable: false, error: 'MISSING_HASH' };
  // 音质映射：Mineradio 的 jymaster/hires/lossless/exhigh/standard → 概念版参数
  // 注意：酷狗概念版最高音质为 FLAC（无损），不支持 Hi-Res/至臻 → 自动降级
  const requestedQuality = String(params.quality || '').trim() || 'standard';
  let liteQuality = '128';
  let qualityLevel = 'standard';
  const q = requestedQuality.toLowerCase();
  if (q === 'jymaster' || q === 'hires' || q === 'lossless' || q === 'sq') {
    liteQuality = 'flac';
    qualityLevel = 'lossless';
  } else if (q === 'exhigh' || q === '320') {
    liteQuality = '320';
    qualityLevel = 'exhigh';
  }
  // 按音质选择对应 hash（hq/sq/res），否则用主 hash
  let playHash = hash;
  if (qualityLevel === 'jymaster') playHash = params.resHash || params.sqHash || params.hqHash || hash;
  else if (qualityLevel === 'hires' || qualityLevel === 'lossless') playHash = params.sqHash || params.resHash || params.hqHash || hash;
  else if (qualityLevel === 'exhigh') playHash = params.hqHash || params.sqHash || params.resHash || hash;
  try {
    const res = await liteCall('song_url', {
      hash: playHash,
      quality: liteQuality,
      album_id: String(params.albumId || params.album_id || 0),
      album_audio_id: String(params.albumAudioId || params.album_audio_id || params.mixSongId || 0),
      ppage_id: '',
    }, kugouCookie);
    const body = res && res.body;
    if (body && Number(body.status) === 1 && body.url) {
      // 概念版返回逗号分隔的多地址（主+备用），前端代理只接受单个 URL，取第一个
      const rawUrls = String(body.url).split(',').map(s => s.trim()).filter(Boolean);
      const primary = rawUrls[0] || '';
      if (!primary) {
        return { provider: 'kugou', url: '', playable: false, reason: 'url_unavailable', message: '概念版未返回有效播放地址', requestedQuality, level: qualityLevel };
      }
      return {
        provider: 'kugou',
        url: primary,
        playable: true,
        level: qualityLevel,
        quality: qualityLevel,
        requestedQuality,
        source: 'kugou-lite',
        hash: playHash,
      };
    }
    const msg = body && (body.error_msg || body.msg) || '';
    if (/会员|vip|付费|权限/i.test(String(msg)) || Number(body && body.error_code) === 20010) {
      return { provider: 'kugou', url: '', playable: false, reason: 'vip_required', message: msg || '需要酷狗会员', requestedQuality, level: qualityLevel };
    }
    return { provider: 'kugou', url: '', playable: false, reason: 'url_unavailable', message: msg || '概念版未返回播放地址', status: body && body.status, requestedQuality, level: qualityLevel };
  } catch (e) {
    console.warn('[KugouLiteSongUrl]', e && (e.message || e));
    return { provider: 'kugou', url: '', playable: false, error: (e && e.message) || 'LITE_SONG_URL_FAILED', requestedQuality, level: qualityLevel };
  }
}

// 用户信息（概念版 /user/detail）
async function liteUserDetail(kugouCookie) {
  try {
    const res = await liteCall('user_detail', {}, kugouCookie);
    const body = res && res.body;
    if (body && Number(body.status) === 1 && body.data) {
      const d = body.data;
      return {
        ok: true,
        userid: String(d.userid || d.kugouid || d.user_id || ''),
        nickname: String(d.nickname || d.user_name || d.name || ''),
        avatar: String(d.avatar || d.head_img || d.pic || ''),
        gender: d.gender,
      };
    }
    return { ok: false, error_code: body && body.error_code };
  } catch (e) {
    return { ok: false, error: (e && e.message) || 'USER_DETAIL_FAILED' };
  }
}

// VIP 信息（概念版 /user/vip/detail）
async function liteVipDetail(kugouCookie) {
  try {
    const res = await liteCall('user_vip_detail', {}, kugouCookie);
    const body = res && res.body;
    if (body && Number(body.status) === 1 && body.data) {
      const d = body.data;
      // 顶层字段 + busi_vip 数组（每日畅听会员/概念版会员在 busi_vip 里）
      const busiVips = Array.isArray(d.busi_vip) ? d.busi_vip : [];
      const anyBusiVip = busiVips.some((b) => b && (Number(b.is_vip) === 1 || Number(b.is_paid_vip) === 1));
      const anyBusiSvip = busiVips.some((b) => b && Number(b.is_vip) === 1 && /svip/i.test(String(b.product_type || '')));
      const topVip = Number(d.is_vip || d.vip_type || 0) > 0;
      const topSvip = Number(d.svip_type || d.svip_level || 0) > 0;
      const isVip = topVip || anyBusiVip;
      const isSvip = topSvip || anyBusiSvip;
      return {
        ok: true,
        isVip,
        isSvip,
        vipLevel: isSvip ? 'svip' : (isVip ? 'vip' : 'none'),
        expireAt: d.vip_end_time || (busiVips[0] && busiVips[0].vip_end_time) || '',
        raw: d,
      };
    }
    return { ok: false, error_code: body && body.error_code };
  } catch (e) {
    return { ok: false, error: (e && e.message) || 'VIP_DETAIL_FAILED' };
  }
}

// 用户歌单（概念版 /user/playlist）
async function liteUserPlaylists(kugouCookie) {
  try {
    const res = await liteCall('user_playlist', { page: 1, pagesize: 50 }, kugouCookie);
    const body = res && res.body;
    const data = body && body.data;
    // 概念版返回 data.info（数组），兼容 data.list / data.lists
    const lists = (data && (data.info || data.list || data.lists)) || [];
    if (!Array.isArray(lists)) return { ok: false, playlists: [] };
    // 只保留本人创建的歌单：list_create_userid === 当前 userid（收藏的他人歌单 type=1/source=2 不展示）
    const myUserId = String(kugouCookie ? extractLiteUserid(kugouCookie) : '');
    const playlists = lists
      .filter((item) => {
        if (!item) return false;
        const ownerId = String(item.list_create_userid || item.user_id || '');
        if (myUserId && ownerId && ownerId !== myUserId) return false;
        return true;
      })
      .map((item) => {
        const pid = String(item.global_collection_id || item.specialid || item.listid || item.id || '');
        if (!pid) return null;
        return {
          id: pid,
          globalCollectionId: String(item.global_collection_id || ''),
          name: String(item.specialname || item.list_name || item.name || item.list_create_name || '未命名歌单'),
          cover: String(item.img || item.pic || item.cover || item.create_user_pic || ''),
          count: Number(item.songcount || item.count || item.song_count || item.per_num || item.m_count || 0) || 0,
          creator: String(item.username || item.nickname || item.list_create_username || ''),
          provider: 'kugou',
        };
      })
      .filter(Boolean);
    return { ok: true, playlists };
  } catch (e) {
    console.warn('[KugouLitePlaylists]', e && (e.message || e));
    return { ok: false, playlists: [] };
  }
}
function extractLiteUserid(cookieText) {
  const text = String(cookieText || '');
  const m = text.match(/userid=(\d+)/i);
  return m ? m[1] : '';
}

// 歌单曲目（概念版 /playlist/track/all）
async function litePlaylistTracks(playlistId, kugouCookie) {
  const pid = String(playlistId || '').trim();
  if (!pid) return { ok: false, songs: [] };
  try {
    const res = await liteCall('playlist_track_all', { id: pid, page: 1, pagesize: 50 }, kugouCookie);
    const body = res && res.body;
    const data = body && body.data;
    // 概念版返回 data.songs（数组），兼容 plist/list/lists
    const lists = (data && (data.songs || data.plist || data.list || data.lists)) || [];
    if (!Array.isArray(lists)) return { ok: false, songs: [] };
    const songs = lists
      .map((item) => {
        // 概念版 songs 元素字段：name/hash/mixsongid/album_id/timelen/relate_goods
        const norm = Object.assign({}, item);
        // 歌单接口 name 是"歌手 - 歌名"格式，拆出纯歌名（搜索接口有 OriSongName 但歌单没有）
        if (norm.name && !norm.SongName) {
          const rawName = String(norm.name);
          const m = rawName.match(/^(.*?)\s*[-–—]\s*(.+)$/);
          if (m) {
            norm.SongName = m[2].trim();
            if (!norm.singerinfo && !norm.SingerName) norm.SingerName = m[1].trim();
          } else {
            norm.SongName = rawName;
          }
        }
        if (norm.hash && !norm.FileHash) norm.FileHash = norm.hash;
        if (norm.singerinfo && Array.isArray(norm.singerinfo)) {
          norm.Singers = norm.singerinfo.map((s) => ({ name: s.singer_name || s.name || '', id: s.singer_id || s.id || '' }));
        }
        if (norm.album_id != null && !norm.AlbumID) norm.AlbumID = norm.album_id;
        if (norm.mixsongid != null && !norm.MixSongID) norm.MixSongID = norm.mixsongid;
        if (norm.timelen != null && !norm.Duration) norm.Duration = Math.round(Number(norm.timelen) / 1000);
        if (norm.privilege != null && !norm.Privilege) norm.Privilege = norm.privilege;
        // relate_goods 里有高音质 hash
        if (Array.isArray(norm.relate_goods)) {
          for (const g of norm.relate_goods) {
            if (!g || !g.hash) continue;
            const bitrate = Number(g.bitrate) || 0;
            if (bitrate >= 320 && !norm.HQFileHash) norm.HQFileHash = g.hash;
            if (bitrate >= 800 && !norm.SQFileHash) norm.SQFileHash = g.hash;
          }
        }
        return typeof kugouApi.mapKugouSearchItem === 'function' ? kugouApi.mapKugouSearchItem(norm) : norm;
      })
      .filter((s) => s && s.name && (s.hash || s.id));
    return { ok: true, songs };
  } catch (e) {
    console.warn('[KugouLitePlaylistTracks]', e && (e.message || e));
    return { ok: false, songs: [] };
  }
}

// 重置设备（登出时调用）
function resetDevice() {
  _dfid = null;
  _dfidPromise = null;
  _device = null;
  _cachedModules = Object.create(null);
}

module.exports = {
  liteSearch,
  liteLyric,
  liteSongUrl,
  liteUserDetail,
  liteVipDetail,
  liteUserPlaylists,
  litePlaylistTracks,
  resetDevice,
  _test: { buildLiteCookie, deviceCookie, ensureDfid },
};
