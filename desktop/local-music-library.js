const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg', '.opus']);
const LYRIC_EXTENSIONS = new Set(['.lrc', '.lyr', '.txt']);
const MAX_LOCAL_TRACKS = 1000;
const MAX_SCAN_FILES = 8000;

const localAudioRegistry = new Map();
const localTrackPathRegistry = new Map();

function isSupportedAudioFile(filePath) {
  return AUDIO_EXTENSIONS.has(path.extname(String(filePath || '')).toLowerCase());
}

function isSupportedLyricFile(filePath) {
  return LYRIC_EXTENSIONS.has(path.extname(String(filePath || '')).toLowerCase());
}

function localAudioContentType(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  if (ext === '.flac') return 'audio/flac';
  if (ext === '.m4a' || ext === '.aac') return 'audio/mp4';
  if (ext === '.ogg') return 'audio/ogg';
  if (ext === '.opus') return 'audio/opus';
  if (ext === '.wav') return 'audio/wav';
  return 'audio/mpeg';
}

function readLyricText(filePath) {
  if (!filePath) return '';
  try {
    const data = fs.readFileSync(filePath);
    if (data.length >= 2 && data[0] === 0xff && data[1] === 0xfe) {
      return data.toString('utf16le').replace(/^\uFEFF/, '');
    }
    return data.toString('utf8').replace(/^\uFEFF/, '');
  } catch (e) {
    return '';
  }
}

function inferLocalTrackName(baseName) {
  const cleaned = String(baseName || '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  const match = cleaned.match(/^(.+?)\s+-\s+(.+)$/);
  if (!match) return { artist: '本地音乐', name: cleaned || '本地歌曲' };
  return {
    artist: match[1].trim() || '本地音乐',
    name: match[2].trim() || cleaned || '本地歌曲',
  };
}

function localTrackKey(filePath) {
  return crypto
    .createHash('sha1')
    .update(path.resolve(filePath).toLowerCase())
    .digest('hex')
    .slice(0, 20);
}

function registerLocalAudioPath(filePath) {
  const token = crypto.randomBytes(18).toString('base64url');
  localAudioRegistry.set(token, path.resolve(filePath));
  return token;
}

function lookupLocalAudioToken(token) {
  return localAudioRegistry.get(String(token || '')) || '';
}

function resolveLocalTrackPath(trackId) {
  return localTrackPathRegistry.get(String(trackId || '')) || '';
}

function clearLocalAudioRegistry() {
  localAudioRegistry.clear();
  localTrackPathRegistry.clear();
}

function walkDirectory(rootDir) {
  const files = [];
  const stack = [rootDir];
  let visited = 0;
  while (stack.length && visited < MAX_SCAN_FILES) {
    const dir = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
    for (const entry of entries) {
      if (visited >= MAX_SCAN_FILES) break;
      const fullPath = path.join(dir, entry.name);
      visited++;
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

function scanLocalMusicDirectory(folderPath) {
  const root = path.resolve(String(folderPath || ''));
  const stat = fs.statSync(root);
  if (!stat.isDirectory()) return { ok: false, error: 'NOT_DIRECTORY', tracks: [] };

  const lyricByBase = new Map();
  const audioFiles = [];
  for (const filePath of walkDirectory(root)) {
    const parsed = path.parse(filePath);
    const baseKey = path.join(parsed.dir, parsed.name).toLowerCase();
    if (isSupportedLyricFile(filePath) && !lyricByBase.has(baseKey)) lyricByBase.set(baseKey, filePath);
    if (isSupportedAudioFile(filePath)) audioFiles.push(filePath);
  }

  const tracks = audioFiles.slice(0, MAX_LOCAL_TRACKS).map((filePath) => {
    const parsed = path.parse(filePath);
    const title = inferLocalTrackName(parsed.name);
    const baseKey = path.join(parsed.dir, parsed.name).toLowerCase();
    const lyricPath = lyricByBase.get(baseKey) || '';
    const translationPath = ['.trans', '.translation', '.cn', '.zh']
      .map((suffix) => lyricByBase.get(`${baseKey}${suffix}`) || '')
      .find(Boolean) || '';
    const localKey = localTrackKey(filePath);
    const id = `local:${localKey}`;
    localTrackPathRegistry.set(id, path.resolve(filePath));
    return {
      id,
      type: 'local',
      provider: 'local',
      source: 'local',
      localKey,
      localAudioToken: registerLocalAudioPath(filePath),
      localLyricText: readLyricText(lyricPath),
      localTranslationText: readLyricText(translationPath),
      name: title.name,
      artist: title.artist,
      album: path.basename(path.dirname(filePath)) || '本地文件夹',
      cover: '',
      duration: 0,
      format: parsed.ext.replace(/^\./, '').toLowerCase(),
      fileName: parsed.base,
      folderName: path.basename(root),
      localRelativePath: path.relative(root, filePath),
    };
  });

  return {
    ok: true,
    folderPath: root,
    trackCount: tracks.length,
    truncated: audioFiles.length > tracks.length,
    tracks,
  };
}

module.exports = {
  AUDIO_EXTENSIONS,
  LYRIC_EXTENSIONS,
  isSupportedAudioFile,
  isSupportedLyricFile,
  localAudioContentType,
  scanLocalMusicDirectory,
  lookupLocalAudioToken,
  resolveLocalTrackPath,
  clearLocalAudioRegistry,
};
