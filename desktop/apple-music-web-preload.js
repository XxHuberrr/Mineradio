'use strict';

const { ipcRenderer } = require('electron');

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const data = event.data;
  if (!data || data.source !== 'mineradio-apple-music' || !data.event) return;
  ipcRenderer.send('mineradio-apple-music-web-page-event', data.event);
});
