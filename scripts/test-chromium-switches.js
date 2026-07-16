'use strict';

const assert = require('assert');
const { getChromiumPerformanceSwitches } = require('../desktop/chromium-switches');

function switchMap(platform) {
  return new Map(getChromiumPerformanceSwitches(platform));
}

const windowsSwitches = switchMap('win32');
assert.strictEqual(windowsSwitches.get('use-angle'), 'd3d11');
assert.strictEqual(windowsSwitches.has('force_high_performance_gpu'), true);

const macSwitches = switchMap('darwin');
assert.strictEqual(macSwitches.get('use-angle'), 'metal');
assert.strictEqual(macSwitches.has('force_high_performance_gpu'), false);

const linuxSwitches = switchMap('linux');
assert.strictEqual(linuxSwitches.has('use-angle'), false);
assert.strictEqual(linuxSwitches.has('force_high_performance_gpu'), false);

for (const platform of ['win32', 'darwin', 'linux']) {
  const switches = getChromiumPerformanceSwitches(platform);
  assert.strictEqual(switches.some(([name]) => name === 'enable-gpu-rasterization'), true);
  assert.strictEqual(switches.some(([name]) => name === 'disable-background-timer-throttling'), true);
}

console.log('[chromium-switches-test] Platform-specific GPU backends passed.');
