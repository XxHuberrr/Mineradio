const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { pathToFileURL } = require('url');

const AUDIO_EXTS = new Set(['.mp3', '.wav', '.m4a', '.flac', '.ogg', '.aac']);

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 720,
    minWidth: 920,
    minHeight: 620,
    backgroundColor: '#0b1020',
    title: 'Mineradio MVP',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, 'index.html'));
}

async function collectAudioFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await collectAudioFiles(fullPath);
      files.push(...nested);
      continue;
    }

    if (!entry.isFile()) continue;

    const ext = path.extname(entry.name).toLowerCase();
    if (AUDIO_EXTS.has(ext)) {
      files.push({
        name: entry.name,
        path: fullPath,
        url: pathToFileURL(fullPath).href
      });
    }
  }

  return files;
}

app.whenReady().then(() => {
  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: '选择音乐文件夹'
    });

      if (result.canceled || !result.filePaths.length) return { files: [], dir: null };

    const dir = result.filePaths[0];
    const files = await collectAudioFiles(dir);

      const mapped = files
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
      .map((item) => ({
        ...item,
        title: path.parse(item.name).name
      }));

      // remember last folder
      try { await fs.writeFile(path.join(app.getPath('userData'), 'state.json'), JSON.stringify({ lastFolder: dir })); } catch (e) { /* ignore */ }

      return { files: mapped, dir };
    });

  // 读取本地文件内容（用于 .lrc 歌词等）
  ipcMain.handle('read-file', async (event, filePath) => {
    try {
      const txt = await fs.readFile(filePath, 'utf8');
      return txt;
    } catch (err) {
      return null;
    }
  });

  // 简单持久化：保存上次打开的文件夹路径
  const statePath = path.join(app.getPath('userData'), 'state.json');

  async function loadState() {
    try {
      const raw = await fs.readFile(statePath, 'utf8');
      return JSON.parse(raw || '{}');
    } catch (e) {
      return {};
    }
  }

  async function saveState(state) {
    try {
      await fs.writeFile(statePath, JSON.stringify(state || {}));
      return true;
    } catch (e) {
      return false;
    }
  }

  ipcMain.handle('get-state', async () => {
    return await loadState();
  });

  ipcMain.handle('save-state', async (event, state) => {
    return await saveState(state);
  });

  ipcMain.handle('scan-folder', async (event, dir) => {
    if (!dir) return { files: [], dir: null };
    const files = await collectAudioFiles(dir);
    return files
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
      .map((item) => ({
        ...item,
        title: path.parse(item.name).name
      }));
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
