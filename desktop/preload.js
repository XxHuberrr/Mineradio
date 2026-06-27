const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopWindow', {
  isDesktop: true,
  platform: process.platform,
  minimize: () => ipcRenderer.invoke('desktop-window-minimize'),
  toggleMaximize: () => ipcRenderer.invoke('desktop-window-toggle-maximize'),
  toggleFullscreen: () => ipcRenderer.invoke('desktop-window-toggle-fullscreen'),
  exitFullscreenWindowed: () => ipcRenderer.invoke('desktop-window-exit-fullscreen-windowed'),
  getState: () => ipcRenderer.invoke('desktop-window-get-state'),
  close: () => ipcRenderer.invoke('desktop-window-close'),
  openNeteaseMusicLogin: () => ipcRenderer.invoke('netease-music-open-login'),
  clearNeteaseMusicLogin: () => ipcRenderer.invoke('netease-music-clear-login'),
  openQQMusicLogin: () => ipcRenderer.invoke('qq-music-open-login'),
  clearQQMusicLogin: () => ipcRenderer.invoke('qq-music-clear-login'),
  openUpdateInstaller: (filePath) => ipcRenderer.invoke('mineradio-open-update-installer', filePath),
  restartApp: () => ipcRenderer.invoke('mineradio-restart-app'),
  configureGlobalHotkeys: (bindings) => ipcRenderer.invoke('mineradio-hotkeys-configure-global', bindings || []),
  exportJsonFile: (payload) => ipcRenderer.invoke('mineradio-export-json-file', payload || {}),
  importJsonFile: () => ipcRenderer.invoke('mineradio-import-json-file'),
  onGlobalHotkey: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload || {});
    ipcRenderer.on('mineradio-global-hotkey', listener);
    return () => ipcRenderer.removeListener('mineradio-global-hotkey', listener);
  },
  setDesktopLyricsEnabled: (enabled, payload) => ipcRenderer.invoke('mineradio-desktop-lyrics-set-enabled', !!enabled, payload || {}),
  updateDesktopLyrics: (payload) => ipcRenderer.invoke('mineradio-desktop-lyrics-update', payload || {}),
  onDesktopLyricsLockState: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload || {});
    ipcRenderer.on('mineradio-desktop-lyrics-lock-state', listener);
    return () => ipcRenderer.removeListener('mineradio-desktop-lyrics-lock-state', listener);
  },
  onDesktopLyricsEnabledState: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload || {});
    ipcRenderer.on('mineradio-desktop-lyrics-enabled-state', listener);
    return () => ipcRenderer.removeListener('mineradio-desktop-lyrics-enabled-state', listener);
  },
  setWallpaperMode: (enabled, payload) => ipcRenderer.invoke('mineradio-wallpaper-set-enabled', !!enabled, payload || {}),
  updateWallpaperMode: (payload) => ipcRenderer.invoke('mineradio-wallpaper-update', payload || {}),
  onStateChange: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('desktop-window-state', listener);
    return () => ipcRenderer.removeListener('desktop-window-state', listener);
  },
});

function applyPlatformWindowChrome() {
  if (process.platform !== 'darwin') return;
  document.documentElement.classList.add('desktop-shell-darwin');
  document.body.classList.add('desktop-shell-darwin');
  if (document.getElementById('mineradio-darwin-window-chrome')) return;

  const style = document.createElement('style');
  style.id = 'mineradio-darwin-window-chrome';
  style.textContent = `
    body.desktop-shell.desktop-shell-darwin #desktop-titlebar {
      justify-content: space-between;
      padding: 0 18px 0 14px;
    }
    body.desktop-shell.desktop-shell-darwin #desktop-titlebar .desktop-drag-region {
      padding-left: 118px;
      padding-right: 180px;
    }
    body.desktop-shell.desktop-shell-darwin #desktop-titlebar .desktop-window-controls {
      position: absolute;
      top: 7px;
      left: 14px;
      right: auto;
      width: 108px;
      height: 30px;
      display: block;
      gap: 0;
    }
    body.desktop-shell.desktop-shell-darwin #desktop-titlebar .desktop-window-btn {
      position: absolute;
      top: 0;
      width: 28px;
      height: 28px;
      border-radius: 999px;
      color: rgba(18, 18, 18, .70);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.36), 0 8px 22px rgba(0,0,0,.18);
    }
    body.desktop-shell.desktop-shell-darwin #desktop-titlebar .desktop-window-btn.close {
      left: 0;
      background: #ff5f57;
    }
    body.desktop-shell.desktop-shell-darwin #desktop-titlebar .desktop-window-btn[data-window-action="minimize"] {
      left: 36px;
      background: #ffbd2e;
    }
    body.desktop-shell.desktop-shell-darwin #desktop-titlebar .desktop-window-btn[data-window-action="maximize"] {
      left: 72px;
      background: #28c840;
    }
    body.desktop-shell.desktop-shell-darwin #desktop-titlebar .desktop-window-btn svg {
      width: 12px;
      height: 12px;
      opacity: .78;
      stroke-width: 2.2;
    }
    body.desktop-shell.desktop-shell-darwin #desktop-titlebar .desktop-window-btn:hover {
      color: rgba(0, 0, 0, .86);
      transform: translateY(-1px);
      filter: brightness(1.05);
    }
    body.desktop-shell.desktop-shell-darwin #desktop-titlebar #diy-mode-btn {
      position: fixed;
      top: 7px;
      right: 14px;
      -webkit-app-region: no-drag;
      pointer-events: auto;
    }
    body.desktop-shell.desktop-shell-darwin #desktop-titlebar #visual-guide-btn {
      position: fixed;
      top: 7px;
      right: 88px;
      -webkit-app-region: no-drag;
      pointer-events: auto;
    }
    body.desktop-shell.desktop-shell-darwin #desktop-titlebar #update-entry {
      position: fixed;
      top: 7px;
      right: 124px;
      -webkit-app-region: no-drag;
      pointer-events: auto;
    }
    body.desktop-shell.desktop-shell-darwin #desktop-titlebar .desktop-mode-btn {
      margin-left: 0;
    }
    body.desktop-shell.desktop-shell-darwin #top-right {
      top: 58px;
      right: 24px;
    }
    @media (max-width:720px) {
      body.desktop-shell.desktop-shell-darwin #desktop-titlebar .desktop-mode-btn {
        min-width: 66px;
      }
      body.desktop-shell.desktop-shell-darwin #desktop-titlebar .desktop-drag-region {
        padding-left: 112px;
        padding-right: 150px;
      }
      body.desktop-shell.desktop-shell-darwin #desktop-titlebar #visual-guide-btn {
        right: 76px;
      }
      body.desktop-shell.desktop-shell-darwin #desktop-titlebar #update-entry {
        right: 112px;
      }
    }
  `;
  document.head.appendChild(style);
}

window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.classList.add('desktop-shell-root');
  document.body.classList.add('desktop-shell');
  applyPlatformWindowChrome();
});
