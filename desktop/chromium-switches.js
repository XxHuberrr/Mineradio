'use strict';

const BASE_CHROMIUM_PERFORMANCE_SWITCHES = [
  ['autoplay-policy', 'no-user-gesture-required'],
  ['ignore-gpu-blocklist'],
  ['enable-gpu-rasterization'],
  ['enable-oop-rasterization'],
  ['enable-zero-copy'],
  ['enable-accelerated-2d-canvas'],
  ['disable-background-timer-throttling'],
  ['disable-renderer-backgrounding'],
  ['disable-backgrounding-occluded-windows'],
];

function getChromiumPerformanceSwitches(platform = process.platform) {
  const switches = BASE_CHROMIUM_PERFORMANCE_SWITCHES.map(item => item.slice());

  if (platform === 'win32') {
    switches.push(['force_high_performance_gpu']);
    switches.push(['use-angle', 'd3d11']);
  } else if (platform === 'darwin') {
    switches.push(['use-angle', 'metal']);
  }

  return switches;
}

module.exports = { getChromiumPerformanceSwitches };
