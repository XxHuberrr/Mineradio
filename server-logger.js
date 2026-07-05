/**
 * Mineradio 临时日志模块（服务端）
 *
 * 与 desktop/logger.js 共享相同的日志格式与级别控制。
 * 日志目录由环境变量 MINERADIO_LOG_DIR 决定：
 *   - 在 Electron 内由 desktop/main.js 设置为 app.getPath('userData')/logs
 *   - 独立运行 server.js 时默认 process.cwd()/logs
 *
 * 用法：
 *   const serverLogger = require('./server-logger.js');
 *   const kugouLog = serverLogger.createLogger('KugouAPI');
 *   kugouLog.info('message', { data: '...' });
 *   kugouLog.error('failed', err);
 */

const fs = require('fs');
const path = require('path');

const LEVELS = { DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40, OFF: 99 };
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const RETAIN_DAYS = 7;

function readLevelFromEnv() {
  const env = (process.env.MINERADIO_LOG_LEVEL || 'INFO').toUpperCase();
  if (LEVELS.hasOwnProperty(env)) return LEVELS[env];
  return LEVELS.INFO;
}

function resolveLogDir() {
  const fromEnv = process.env.MINERADIO_LOG_DIR;
  if (fromEnv) return fromEnv;
  // 默认：process.cwd()/logs（独立运行 server.js 时的兜底）
  return path.join(process.cwd(), 'logs');
}

let logDir = resolveLogDir();
let currentLevel = readLevelFromEnv();
let cleanedOnce = false;
let serverLogEnabled = false; // 日志功能开关，默认关闭

function ensureDir(dir) {
  try {
    if (!dir) return false;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return true;
  } catch (e) {
    return false;
  }
}

function pad(n, w) {
  const s = String(n);
  return s.length >= w ? s : '0'.repeat(w - s.length) + s;
}

function formatDate(d) {
  return (
    d.getFullYear() +
    '-' + pad(d.getMonth() + 1, 2) +
    '-' + pad(d.getDate(), 2)
  );
}

function formatTimestamp(d) {
  return (
    formatDate(d) +
    ' ' + pad(d.getHours(), 2) +
    ':' + pad(d.getMinutes(), 2) +
    ':' + pad(d.getSeconds(), 2) +
    '.' + pad(d.getMilliseconds(), 3)
  );
}

function safeStringify(data) {
  if (data === undefined) return '';
  if (typeof data === 'string') return data;
  if (data instanceof Error) return data.stack || data.message;
  try {
    return JSON.stringify(data);
  } catch (e) {
    try {
      return String(data);
    } catch (_) {
      return '[unserializable]';
    }
  }
}

function rotateIfNeeded(filePath) {
  try {
    if (!fs.existsSync(filePath)) return;
    const stat = fs.statSync(filePath);
    if (stat.size < MAX_FILE_SIZE) return;
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    let idx = 1;
    while (fs.existsSync(path.join(dir, `${base}-${idx}${ext}`))) idx++;
    fs.renameSync(filePath, path.join(dir, `${base}-${idx}${ext}`));
  } catch (e) {
    // 轮转失败不影响主流程
  }
}

function cleanOldLogs(dir) {
  if (cleanedOnce) return;
  cleanedOnce = true;
  try {
    const files = fs.readdirSync(dir);
    const now = Date.now();
    const cutoff = now - RETAIN_DAYS * 24 * 60 * 60 * 1000;
    for (const file of files) {
      if (!/^mineradio-\d{4}-\d{2}-\d{2}.*\.log$/.test(file)) continue;
      const fullPath = path.join(dir, file);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.mtimeMs < cutoff) {
          fs.unlinkSync(fullPath);
        }
      } catch (e) {
        // 单文件清理失败不影响其他
      }
    }
  } catch (e) {
    // 清理失败不影响主流程
  }
}

function writeLine(level, scope, message, data) {
  if (!serverLogEnabled) return; // 日志开关关闭时直接返回
  if (LEVELS[level] < currentLevel) return;
  if (!ensureDir(logDir)) return;
  cleanOldLogs(logDir);
  const now = new Date();
  const dateStr = formatDate(now);
  const filePath = path.join(logDir, `mineradio-${dateStr}.log`);
  rotateIfNeeded(filePath);
  const line =
    `[${formatTimestamp(now)}] [${level}] [${scope || '-'}] ${message || ''}` +
    (data !== undefined ? ' | ' + safeStringify(data) : '') +
    '\n';
  try {
    fs.appendFileSync(filePath, line, { encoding: 'utf8' });
  } catch (e) {
    // 写入失败静默丢弃
  }
}

function log(level, scope, message, data) {
  const lvl = (level || 'INFO').toUpperCase();
  if (!LEVELS.hasOwnProperty(lvl)) return;
  writeLine(lvl, scope, message, data);
}

function createLogger(scope) {
  return {
    debug: (message, data) => writeLine('DEBUG', scope, message, data),
    info: (message, data) => writeLine('INFO', scope, message, data),
    warn: (message, data) => writeLine('WARN', scope, message, data),
    error: (message, data) => writeLine('ERROR', scope, message, data),
  };
}

function setLogDir(dir) {
  logDir = dir || '';
  if (logDir) {
    ensureDir(logDir);
    cleanOldLogs(logDir);
  }
}

function getLogDir() {
  return logDir;
}

function setServerLogEnabled(enabled) {
  serverLogEnabled = Boolean(enabled);
}

function isServerLogEnabled() {
  return serverLogEnabled;
}

module.exports = {
  LEVELS,
  log,
  createLogger,
  setLogDir,
  getLogDir,
  setServerLogEnabled,
  isServerLogEnabled,
};
