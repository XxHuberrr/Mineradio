'use strict';

const fs = require('fs');
const https = require('https');
const path = require('path');

const AI6666_API_BASE = String(process.env.AI6666_API_BASE || process.env.MINERADIO_AI6666_API_BASE || 'https://ai6666.com')
  .trim()
  .replace(/\/+$/, '');
const DEFAULT_AI6666_CONFIG_FILE = path.join(__dirname, '.ai6666-credentials.json');
const AI6666_UA = 'Mineradio/2.1.0 (AI6666 music bridge)';
const AI6666_REQUEST_TIMEOUT_MS = 12000;
const AI6666_MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const AI6666_PAGE_SIZE_MAX = 50;
const AI6666_LIBRARY_IDS = Object.freeze({
  mine: 'ai6666-mine',
  favorites: 'ai6666-favorites',
});
let ai6666StatusCache = { expiresAt: 0, value: null };

function normalizeText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function normalizeApiKey(value) {
  const key = String(value == null ? '' : value).trim();
  return /^hh_[A-Za-z0-9_-]{24,160}$/.test(key) ? key : '';
}

function getAi6666ConfigFile() {
  return process.env.AI6666_CONFIG_FILE
    || process.env.MINERADIO_AI6666_CONFIG_FILE
    || DEFAULT_AI6666_CONFIG_FILE;
}

function readAi6666FileConfig() {
  const file = getAi6666ConfigFile();
  try {
    if (!file || !fs.existsSync(file)) return { file, apiKey: '', exists: false, invalid: false };
    const raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    const source = raw && typeof raw === 'object' && raw.ai6666 && typeof raw.ai6666 === 'object'
      ? raw.ai6666
      : raw;
    const apiKey = normalizeApiKey(source && (source.apiKey || source.api_key || source.key || source.token));
    return { file, apiKey, exists: true, invalid: !apiKey };
  } catch (_) {
    console.warn('[AI6666Config] ignored invalid credentials file');
    return { file, apiKey: '', exists: true, invalid: true };
  }
}

function getAi6666Config() {
  const envKey = normalizeApiKey(process.env.AI6666_API_KEY || process.env.MINERADIO_AI6666_API_KEY);
  const fileConfig = readAi6666FileConfig();
  const apiKey = envKey || fileConfig.apiKey;
  return {
    provider: 'ai6666',
    configured: !!apiKey,
    apiKey,
    source: envKey ? 'env' : (fileConfig.apiKey ? 'file' : ''),
    configFileExists: fileConfig.exists,
    configInvalid: fileConfig.invalid,
  };
}

function writePrivateJsonFile(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporaryFile = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporaryFile, JSON.stringify(payload, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    try { fs.chmodSync(temporaryFile, 0o600); } catch (_) {}
    try {
      fs.renameSync(temporaryFile, file);
    } catch (error) {
      if (error && (error.code === 'EEXIST' || error.code === 'EPERM')) {
        fs.unlinkSync(file);
        fs.renameSync(temporaryFile, file);
      } else {
        throw error;
      }
    }
    try { fs.chmodSync(file, 0o600); } catch (_) {}
  } finally {
    try { if (fs.existsSync(temporaryFile)) fs.unlinkSync(temporaryFile); } catch (_) {}
  }
}

function saveAi6666Config(input) {
  input = input && typeof input === 'object' ? input : {};
  const apiKey = normalizeApiKey(input.apiKey || input.api_key || input.key || input.token);
  if (!apiKey) {
    const error = new Error('AI6666_API_KEY_INVALID');
    error.code = 'AI6666_API_KEY_INVALID';
    error.statusCode = 400;
    throw error;
  }
  const file = getAi6666ConfigFile();
  writePrivateJsonFile(file, { ai6666: { apiKey } });
  ai6666StatusCache = { expiresAt: 0, value: null };
  return {
    provider: 'ai6666',
    ok: true,
    saved: true,
    configured: true,
    configFileExists: true,
  };
}

function clearAi6666Config() {
  const file = getAi6666ConfigFile();
  try {
    if (file && fs.existsSync(file)) fs.unlinkSync(file);
  } catch (error) {
    const wrapped = ai6666Error('AI6666_CONFIG_CLEAR_FAILED', 'AI6666 credentials could not be cleared', 500);
    wrapped.cause = error;
    throw wrapped;
  }
  ai6666StatusCache = { expiresAt: 0, value: null };
  return { provider: 'ai6666', ok: true, configured: false, loggedIn: false };
}

function sanitizeErrorText(value, apiKey) {
  let text = String(value == null ? '' : value).trim();
  if (apiKey) text = text.split(apiKey).join('[redacted]');
  return text.slice(0, 1000);
}

function ai6666Error(code, message, statusCode, details) {
  const error = new Error(message || code || 'AI6666_REQUEST_FAILED');
  error.code = code || 'AI6666_REQUEST_FAILED';
  error.statusCode = Number(statusCode) || 500;
  if (details && typeof details === 'object') error.details = details;
  return error;
}

function upstreamError(payload, statusCode, apiKey) {
  payload = payload && typeof payload === 'object' ? payload : {};
  const rawCode = normalizeText(payload.code || payload.error_code || payload.error);
  const code = /^AI6666_[A-Z0-9_]+$/.test(rawCode)
    ? rawCode
    : (statusCode === 401 || statusCode === 403 ? 'AI6666_AUTH_REQUIRED' : 'AI6666_UPSTREAM_ERROR');
  const message = sanitizeErrorText(
    payload.message || payload.detail || (typeof payload.error === 'string' ? payload.error : '') || `AI6666 request failed (${statusCode})`,
    apiKey
  );
  return ai6666Error(code, message, statusCode, {
    upstreamStatus: Number(statusCode) || 0,
    retryAfter: normalizeText(payload.retry_after || payload.retryAfter),
  });
}

function retryAfterMs(headers) {
  const raw = headers && (headers['retry-after'] || headers['Retry-After']);
  if (!raw) return 0;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds * 1000));
  const at = Date.parse(String(raw));
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : 0;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function rawAi6666Request(pathname, options, config) {
  options = options || {};
  const method = String(options.method || 'GET').toUpperCase();
  const bodyText = options.body == null ? '' : JSON.stringify(options.body);
  const target = new URL(pathname, AI6666_API_BASE + '/');
  const requestOptions = {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      'User-Agent': AI6666_UA,
    },
  };
  if (bodyText) {
    requestOptions.headers['Content-Type'] = 'application/json';
    requestOptions.headers['Content-Length'] = Buffer.byteLength(bodyText);
  }
  const timeoutMs = Math.max(1000, Math.min(30000, Number(options.timeoutMs) || AI6666_REQUEST_TIMEOUT_MS));

  return new Promise((resolve, reject) => {
    let settled = false;
    const request = https.request(target, requestOptions, (response) => {
      const chunks = [];
      let bytes = 0;
      response.on('data', (chunk) => {
        if (settled) return;
        const buffer = Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes > AI6666_MAX_RESPONSE_BYTES) {
          settled = true;
          request.destroy();
          reject(ai6666Error('AI6666_RESPONSE_TOO_LARGE', 'AI6666 response exceeded the safe size limit', 502));
          return;
        }
        chunks.push(buffer);
      });
      response.on('end', () => {
        if (settled) return;
        settled = true;
        const text = Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/, '');
        let payload = {};
        if (text.trim()) {
          try { payload = JSON.parse(text); }
          catch (_) {
            reject(ai6666Error('AI6666_INVALID_RESPONSE', 'AI6666 returned an invalid JSON response', 502));
            return;
          }
        }
        const statusCode = Number(response.statusCode) || 0;
        if (statusCode < 200 || statusCode >= 300) {
          const error = upstreamError(payload, statusCode, config.apiKey);
          error.retryAfterMs = retryAfterMs(response.headers);
          reject(error);
          return;
        }
        resolve(payload);
      });
    });
    request.setTimeout(timeoutMs, () => {
      if (settled) return;
      settled = true;
      const error = ai6666Error('AI6666_TIMEOUT', 'AI6666 request timed out', 504);
      request.destroy(error);
      reject(error);
    });
    request.on('error', (error) => {
      if (settled) return;
      settled = true;
      if (error && error.code && /^AI6666_/.test(error.code)) reject(error);
      else reject(ai6666Error('AI6666_NETWORK_ERROR', sanitizeErrorText(error && error.message || error, config.apiKey) || 'AI6666 network request failed', 502));
    });
    if (bodyText) request.write(bodyText);
    request.end();
  });
}

async function ai6666Request(pathname, options) {
  options = options || {};
  const config = getAi6666Config();
  if (!config.configured) throw ai6666Error('AI6666_API_KEY_REQUIRED', 'AI6666 API Key is not configured', 401);
  const method = String(options.method || 'GET').toUpperCase();
  const maxAttempts = method === 'GET' && options.noRetry !== true ? 2 : 1;
  let lastError = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await rawAi6666Request(pathname, options, config);
    } catch (error) {
      lastError = error;
      const status = Number(error && error.statusCode) || 0;
      const transient = error && (error.code === 'AI6666_TIMEOUT' || error.code === 'AI6666_NETWORK_ERROR')
        || status === 429
        || status >= 500;
      if (!transient || attempt + 1 >= maxAttempts) throw error;
      const waitMs = Math.min(2000, Math.max(180, Number(error.retryAfterMs) || 300));
      await delay(waitMs);
    }
  }
  throw lastError || ai6666Error('AI6666_REQUEST_FAILED', 'AI6666 request failed', 502);
}

function clampInteger(value, min, max, fallback) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function normalizeLibraryTab(value) {
  return value === 'favorites' || value === AI6666_LIBRARY_IDS.favorites ? 'favorites' : 'mine';
}

function ai6666Artist(raw) {
  raw = raw && typeof raw === 'object' ? raw : {};
  return {
    id: normalizeText(raw.id),
    name: normalizeText(raw.nickname || raw.username) || 'AI6666 创作者',
    avatar: normalizeText(raw.avatar),
  };
}

function splitTags(value) {
  return String(value || '').split(/[,，;；|/]+/).map(normalizeText).filter(Boolean).slice(0, 24);
}

function mapAi6666Song(raw) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const id = normalizeText(raw.id);
  const title = normalizeText(raw.title) || '未命名 AI 音乐';
  const author = ai6666Artist(raw.author);
  const generation = raw.generation && typeof raw.generation === 'object' ? raw.generation : {};
  const model = normalizeText(generation.model || raw.model);
  const duration = Math.max(0, Number(raw.duration) || 0);
  const favorite = raw.user_favorited === true || raw.is_favorite === true;
  return {
    provider: 'ai6666',
    source: 'ai6666',
    type: 'ai6666',
    id,
    providerSongId: id,
    ai6666Id: id,
    name: title,
    title,
    artist: author.name,
    artistId: author.id,
    artists: [{ id: author.id, name: author.name, avatar: author.avatar }],
    authorAvatar: author.avatar,
    album: model || 'AI 生成音乐',
    albumId: normalizeText(generation.id),
    model,
    cover: normalizeText(raw.image_url || raw.imageUrl),
    duration,
    durationMs: Math.round(duration * 1000),
    tags: normalizeText(raw.tags),
    aiTags: splitTags(raw.tags),
    createdAt: normalizeText(raw.created_at || raw.createdAt),
    isPublic: raw.is_public === true,
    isOwner: raw.is_owner === true,
    canManage: raw.can_manage === true,
    isFavorite: favorite,
    userFavorited: favorite,
    favoriteCount: Math.max(0, Number(raw.favorite_count) || 0),
    commentCount: Math.max(0, Number(raw.comment_count) || 0),
    playCount: Math.max(0, Number(raw.play_count) || 0),
    avgRating: Number(raw.avg_rating) || 0,
    ratingCount: Math.max(0, Number(raw.rating_count) || 0),
    lyricsAvailable: !!normalizeText(raw.lyrics) || (Array.isArray(raw.lrc_lines) && raw.lrc_lines.length > 0) || (Array.isArray(raw.lrc_synced) && raw.lrc_synced.length > 0),
    wavReady: raw.wav_ready === true,
    hasWavAccess: raw.has_wav_access === true,
    fee: 0,
    playable: true,
    playbackMode: 'direct-refresh',
    recommendationSource: 'ai6666-account-library',
  };
}

async function handleAi6666Status() {
  const config = getAi6666Config();
  const fallback = {
    provider: 'ai6666',
    configured: false,
    loggedIn: false,
    nickname: 'AI6666',
    avatar: '',
    credits: null,
    configFileExists: !!config.configFileExists,
    capabilities: {
      search: false,
      playableUrl: false,
      playlists: false,
      favoritesRead: false,
      favoritesWrite: false,
      timedLyrics: false,
      wordSyncedLyrics: false,
    },
  };
  if (!config.configured) {
    fallback.message = config.configInvalid ? 'AI6666 API Key 配置文件无效，请重新保存。' : '请粘贴 AI6666 API Key 连接账号曲库。';
    return fallback;
  }
  if (ai6666StatusCache.value && ai6666StatusCache.expiresAt > Date.now()) {
    return Object.assign({}, ai6666StatusCache.value, { capabilities: Object.assign({}, ai6666StatusCache.value.capabilities || {}) });
  }
  try {
    const payload = await ai6666Request('/ai6api/music/credits', { timeoutMs: 8000 });
    const status = Object.assign({}, fallback, {
      configured: true,
      loggedIn: true,
      credits: Math.max(0, Number(payload && payload.credits) || 0),
      message: 'AI6666 账号曲库已连接。',
      capabilities: {
        search: true,
        playableUrl: true,
        playlists: true,
        favoritesRead: true,
        favoritesWrite: true,
        timedLyrics: true,
        wordSyncedLyrics: true,
      },
    });
    ai6666StatusCache = { expiresAt: Date.now() + 30000, value: status };
    return Object.assign({}, status, { capabilities: Object.assign({}, status.capabilities) });
  } catch (error) {
    if (Number(error && error.statusCode) === 401 || Number(error && error.statusCode) === 403) {
      return Object.assign({}, fallback, {
        configured: true,
        reauthRequired: true,
        error: 'AI6666_AUTH_REQUIRED',
        message: 'AI6666 API Key 已失效，请重新保存。',
      });
    }
    return Object.assign({}, fallback, {
      configured: true,
      error: error && error.code || 'AI6666_STATUS_FAILED',
      message: 'AI6666 暂时无法连接，请稍后重试。',
    });
  }
}

async function handleAi6666Songs(options) {
  options = options || {};
  const tab = normalizeLibraryTab(options.tab);
  const page = clampInteger(options.page, 1, 100000, 1);
  const pageSize = clampInteger(options.pageSize || options.page_size || options.limit, 1, AI6666_PAGE_SIZE_MAX, 20);
  const query = normalizeText(options.query || options.q || options.keywords).slice(0, 200);
  const params = new URLSearchParams({ tab, page: String(page), page_size: String(pageSize) });
  if (query) params.set('q', query);
  const payload = await ai6666Request('/ai6api/music/my-songs?' + params.toString(), { timeoutMs: 12000 });
  const songs = Array.isArray(payload && payload.songs) ? payload.songs.map(mapAi6666Song).filter(song => song.id) : [];
  const total = Math.max(0, Number(payload && payload.total) || 0);
  return {
    provider: 'ai6666',
    configured: true,
    loggedIn: true,
    tab,
    query,
    page: clampInteger(payload && payload.page, 1, 100000, page),
    pageSize: clampInteger(payload && payload.page_size, 1, AI6666_PAGE_SIZE_MAX, pageSize),
    total,
    favoriteCount: Math.max(0, Number(payload && payload.favorite_count) || 0),
    hasMore: payload && payload.has_next === true || page * pageSize < total,
    nextPage: page + 1,
    songs,
  };
}

function playlistFromPage(tab, result) {
  const favorites = tab === 'favorites';
  const first = result && result.songs && result.songs[0];
  return {
    provider: 'ai6666',
    source: 'ai6666',
    type: 'playlist',
    id: favorites ? AI6666_LIBRARY_IDS.favorites : AI6666_LIBRARY_IDS.mine,
    name: favorites ? 'AI6666 · 我的收藏' : 'AI6666 · 我的歌曲',
    creator: 'AI6666',
    cover: first && first.cover || '',
    trackCount: Math.max(0, Number(result && result.total) || 0),
    total: Math.max(0, Number(result && result.total) || 0),
    ai6666Tab: tab,
    virtual: true,
    readOnly: true,
    shelfPane: favorites ? 'fav' : 'mine',
    subscribed: favorites,
    favoriteCollection: favorites,
  };
}

async function handleAi6666UserPlaylists() {
  const [mine, favorites] = await Promise.all([
    handleAi6666Songs({ tab: 'mine', page: 1, pageSize: 1 }),
    handleAi6666Songs({ tab: 'favorites', page: 1, pageSize: 1 }),
  ]);
  return {
    provider: 'ai6666',
    configured: true,
    loggedIn: true,
    playlists: [playlistFromPage('mine', mine), playlistFromPage('favorites', favorites)],
  };
}

async function handleAi6666PlaylistTracks(options) {
  options = options || {};
  const tab = normalizeLibraryTab(options.tab || options.id || options.playlistId);
  const offset = clampInteger(options.offset, 0, 10000000, 0);
  const limit = clampInteger(options.limit, 1, 100, 48);
  const firstPage = Math.floor(offset / AI6666_PAGE_SIZE_MAX) + 1;
  const lastPage = Math.floor((offset + limit - 1) / AI6666_PAGE_SIZE_MAX) + 1;
  const pages = [];
  for (let page = firstPage; page <= lastPage; page += 1) {
    pages.push(handleAi6666Songs({ tab, page, pageSize: AI6666_PAGE_SIZE_MAX }));
  }
  const results = await Promise.all(pages);
  const combined = results.flatMap(result => result.songs || []);
  const localOffset = offset - (firstPage - 1) * AI6666_PAGE_SIZE_MAX;
  const tracks = combined.slice(localOffset, localOffset + limit);
  const total = results.length ? results[0].total : 0;
  return {
    provider: 'ai6666',
    id: tab === 'favorites' ? AI6666_LIBRARY_IDS.favorites : AI6666_LIBRARY_IDS.mine,
    tab,
    offset,
    limit,
    total,
    nextOffset: offset + tracks.length,
    hasMore: offset + tracks.length < total,
    tracks,
    playlist: playlistFromPage(tab, results[0] || { songs: [], total }),
  };
}

async function handleAi6666Search(options) {
  options = options || {};
  const tab = normalizeLibraryTab(options.tab);
  const query = normalizeText(options.query || options.q || options.keywords).slice(0, 200);
  const offset = clampInteger(options.offset, 0, 10000000, 0);
  const limit = clampInteger(options.limit, 1, 100, 30);
  const firstPage = Math.floor(offset / AI6666_PAGE_SIZE_MAX) + 1;
  const lastPage = Math.floor((offset + limit - 1) / AI6666_PAGE_SIZE_MAX) + 1;
  const pages = [];
  for (let page = firstPage; page <= lastPage; page += 1) {
    pages.push(handleAi6666Songs({ tab, query, page, pageSize: AI6666_PAGE_SIZE_MAX }));
  }
  const results = await Promise.all(pages);
  const combined = results.flatMap(result => result.songs || []);
  const localOffset = offset - (firstPage - 1) * AI6666_PAGE_SIZE_MAX;
  const songs = combined.slice(localOffset, localOffset + limit);
  const total = results.length ? results[0].total : 0;
  return {
    provider: 'ai6666',
    tab,
    query,
    offset,
    limit,
    total,
    nextOffset: offset + songs.length,
    hasMore: offset + songs.length < total,
    songs,
  };
}

async function fetchAi6666SongDetail(id) {
  id = normalizeText(id);
  if (!id || id.length > 200) throw ai6666Error('AI6666_SONG_ID_REQUIRED', 'AI6666 song id is required', 400);
  const payload = await ai6666Request('/ai6api/music/song/' + encodeURIComponent(id), { timeoutMs: 12000 });
  return payload && payload.song && typeof payload.song === 'object' ? payload.song : payload;
}

async function handleAi6666SongDetail(id) {
  const raw = await fetchAi6666SongDetail(id);
  return { provider: 'ai6666', song: mapAi6666Song(raw) };
}

async function handleAi6666SongUrl(options) {
  options = options || {};
  const id = normalizeText(options.id || options.providerSongId || options.ai6666Id);
  const quality = normalizeText(options.quality).toLowerCase();
  const raw = await fetchAi6666SongDetail(id);
  const standardUrl = normalizeText(raw.playable_url || raw.playableUrl || raw.audio_url || raw.audioUrl);
  const losslessUrl = raw.wav_ready === true && raw.has_wav_access === true
    ? normalizeText(raw.wav_url || raw.wavUrl)
    : '';
  const wantsLossless = quality === 'lossless' || quality === 'wav' || quality === 'hires';
  const url = wantsLossless && losslessUrl ? losslessUrl : standardUrl;
  if (!url) {
    return {
      provider: 'ai6666',
      id,
      url: '',
      playable: false,
      reason: 'url_unavailable',
      message: 'AI6666 暂未返回可播放地址，请稍后重试。',
    };
  }
  return {
    provider: 'ai6666',
    id,
    url,
    playable: true,
    quality: wantsLossless && losslessUrl ? 'lossless' : 'standard',
    format: wantsLossless && losslessUrl ? 'wav' : 'mp3',
    requestedQuality: quality || 'standard',
    losslessAvailable: !!losslessUrl,
    refreshedAt: Date.now(),
  };
}

function seconds(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function normalizeLineEntries(value) {
  return (Array.isArray(value) ? value : []).map((line) => {
    line = line && typeof line === 'object' ? line : {};
    const start = seconds(line.startS != null ? line.startS : line.start);
    const end = seconds(line.endS != null ? line.endS : line.end);
    const text = String(line.text == null ? '' : line.text).replace(/\r?\n/g, ' ').trim();
    if (start == null || !text) return null;
    return { start, end: end != null && end >= start ? end : null, text };
  }).filter(Boolean).sort((a, b) => a.start - b.start);
}

function normalizeWordEntries(value) {
  return (Array.isArray(value) ? value : []).map((word) => {
    word = word && typeof word === 'object' ? word : {};
    if (word.success === false) return null;
    const start = seconds(word.startS != null ? word.startS : word.start);
    const end = seconds(word.endS != null ? word.endS : word.end);
    const text = String(word.word != null ? word.word : word.text || '').replace(/\r?\n/g, ' ');
    if (start == null || !text.trim()) return null;
    return { start, end: end != null && end >= start ? end : start + 0.08, text };
  }).filter(Boolean).sort((a, b) => a.start - b.start);
}

function lrcTimestamp(value) {
  const total = Math.max(0, Number(value) || 0);
  const minutes = Math.floor(total / 60);
  const secondsPart = total - minutes * 60;
  return `[${String(minutes).padStart(2, '0')}:${secondsPart.toFixed(2).padStart(5, '0')}]`;
}

function buildAi6666Lrc(lines) {
  return normalizeLineEntries(lines).map(line => lrcTimestamp(line.start) + line.text).join('\n');
}

function buildAi6666Yrc(lineInput, wordInput) {
  const lines = normalizeLineEntries(lineInput);
  const words = normalizeWordEntries(wordInput);
  if (!lines.length || !words.length) return '';
  return lines.map((line, index) => {
    const next = lines[index + 1];
    const lineEnd = line.end != null ? line.end : (next ? next.start : line.start + 8);
    const matching = words.filter(word => word.start >= line.start - 0.35 && word.start < lineEnd + 0.35);
    const startMs = Math.max(0, Math.round(line.start * 1000));
    const durationMs = Math.max(80, Math.round((Math.max(lineEnd, line.start + 0.08) - line.start) * 1000));
    if (!matching.length) return `[${startMs},${durationMs}]${line.text}`;
    const body = matching.map(word => {
      const wordStartMs = Math.max(startMs, Math.round(word.start * 1000));
      const wordDurationMs = Math.max(60, Math.round((Math.max(word.end, word.start + 0.06) - word.start) * 1000));
      return `(${wordStartMs},${wordDurationMs},0)${word.text}`;
    }).join('');
    return `[${startMs},${durationMs}]${body || line.text}`;
  }).join('\n');
}

async function handleAi6666Lyric(id) {
  const raw = await fetchAi6666SongDetail(id);
  const lyric = buildAi6666Lrc(raw.lrc_lines);
  const yrc = buildAi6666Yrc(raw.lrc_lines, raw.lrc_synced);
  return {
    provider: 'ai6666',
    id: normalizeText(raw.id || id),
    lyric,
    yrc,
    tlyric: '',
    ytlrc: '',
    plainLyric: String(raw.lyrics || '').trim(),
    duration: Math.max(0, Number(raw.duration) || 0),
    source: yrc ? 'ai6666-word-sync' : (lyric ? 'ai6666-line-sync' : (normalizeText(raw.lyrics) ? 'ai6666-plain' : 'none')),
  };
}

async function handleAi6666Favorite(id, desiredState) {
  id = normalizeText(id);
  if (!id || id.length > 200) throw ai6666Error('AI6666_SONG_ID_REQUIRED', 'AI6666 song id is required', 400);
  if (typeof desiredState === 'boolean') {
    const current = await fetchAi6666SongDetail(id);
    const isFavorite = current.user_favorited === true || current.is_favorite === true;
    if (isFavorite === desiredState) {
      return {
        provider: 'ai6666',
        id,
        success: true,
        changed: false,
        userFavorited: isFavorite,
        isFavorite,
        favoriteCount: Math.max(0, Number(current.favorite_count) || 0),
      };
    }
  }
  const payload = await ai6666Request('/ai6api/music/song/' + encodeURIComponent(id) + '/favorite', {
    method: 'POST',
    body: {},
    timeoutMs: 10000,
    noRetry: true,
  });
  return {
    provider: 'ai6666',
    id,
    success: payload && payload.ok !== false,
    changed: true,
    userFavorited: payload && payload.user_favorited === true,
    isFavorite: payload && payload.user_favorited === true,
    favoriteCount: Math.max(0, Number(payload && payload.favorite_count) || 0),
  };
}

function resetAi6666RuntimeStateForTests() {
  ai6666StatusCache = { expiresAt: 0, value: null };
}

module.exports = {
  AI6666_LIBRARY_IDS,
  getAi6666Config,
  saveAi6666Config,
  clearAi6666Config,
  handleAi6666Status,
  handleAi6666Songs,
  handleAi6666UserPlaylists,
  handleAi6666PlaylistTracks,
  handleAi6666Search,
  handleAi6666SongDetail,
  handleAi6666SongUrl,
  handleAi6666Lyric,
  handleAi6666Favorite,
  _test: {
    normalizeApiKey,
    readAi6666FileConfig,
    ai6666Request,
    mapAi6666Song,
    buildAi6666Lrc,
    buildAi6666Yrc,
    normalizeLineEntries,
    normalizeWordEntries,
    resetAi6666RuntimeStateForTests,
  },
};
