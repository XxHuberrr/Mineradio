'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../desktop/main.js'), 'utf8');
const startupSwitches = source.slice(
  source.indexOf('const CHROMIUM_SAFE_PERFORMANCE_SWITCHES ='),
  source.indexOf('const gotSingleInstanceLock =')
);

for (const platform of ['darwin', 'win32', 'linux']) {
  test(`${platform} selects a compatible graphics backend`, () => {
    const switches = new Map();
    vm.runInNewContext(startupSwitches, {
      process: { platform, env: {} },
      app: { commandLine: { appendSwitch: (key, value) => switches.set(key, value) } },
    });
    assert.equal(switches.get('use-angle'), platform === 'win32' ? 'd3d11' : undefined);
    assert.equal(switches.has('enable-gpu-rasterization'), platform !== 'darwin');
    assert.equal(switches.has('enable-zero-copy'), platform !== 'darwin');
    assert.equal(switches.has('ignore-gpu-blocklist'), false);
  });
}
