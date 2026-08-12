const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  scanFolder: (dir) => ipcRenderer.invoke('scan-folder', dir),
  getState: () => ipcRenderer.invoke('get-state'),
  saveState: (s) => ipcRenderer.invoke('save-state', s),
  readFile: (path) => ipcRenderer.invoke('read-file', path)
});
