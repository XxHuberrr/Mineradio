'use strict';

const path = require('node:path');
const { spawn } = require('node:child_process');
const electronPath = require('electron');

const child = spawn(electronPath, ['.'], {
  cwd: path.join(__dirname, '..'),
  env: {
    ...process.env,
    MINERADIO_APPLE_MUSIC_POC: '1',
  },
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code == null ? 1 : code);
});

child.on('error', (error) => {
  console.error('Unable to launch the Apple Music POC:', error.message);
  process.exit(1);
});
