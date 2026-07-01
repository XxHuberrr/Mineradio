const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getPreferredReleaseAsset,
  getDefaultUpdateAssetName,
  getDefaultBeatMapCacheDir,
  getChromiumPerformanceSwitches,
  getAppIconPath,
  getUpdateOpenStrategy,
} = require('../platform-utils');

test('prefers AppImage assets on Linux releases', () => {
  const asset = getPreferredReleaseAsset([
    { name: 'Mineradio-1.1.1-Setup.exe', browser_download_url: 'https://example.com/setup.exe' },
    { name: 'Mineradio-1.1.1.AppImage', browser_download_url: 'https://example.com/appimage' },
  ], 'linux');

  assert.equal(asset.name, 'Mineradio-1.1.1.AppImage');
});

test('prefers Windows installer assets on Windows releases', () => {
  const asset = getPreferredReleaseAsset([
    { name: 'Mineradio-1.1.1.AppImage', browser_download_url: 'https://example.com/appimage' },
    { name: 'Mineradio-1.1.1-Setup.exe', browser_download_url: 'https://example.com/setup.exe' },
  ], 'win32');

  assert.equal(asset.name, 'Mineradio-1.1.1-Setup.exe');
});

test('uses Linux-friendly default update asset names', () => {
  assert.equal(getDefaultUpdateAssetName('1.1.1', 'linux'), 'Mineradio-1.1.1.AppImage');
  assert.equal(getDefaultUpdateAssetName('1.1.1', 'win32'), 'Mineradio-1.1.1-Setup.exe');
});

test('limits platform behavior changes to Linux', () => {
  assert.equal(getDefaultUpdateAssetName('1.1.1', 'darwin'), 'Mineradio-1.1.1-Setup.exe');
  assert.equal(getDefaultBeatMapCacheDir('darwin'), 'D:\\MineradioCache\\beatmaps');
  assert.equal(getAppIconPath('/repo/build', 'darwin'), '/repo/build/icon.ico');
  assert.equal(
    getChromiumPerformanceSwitches('darwin').some(([name, value]) => name === 'use-angle' && value === 'd3d11'),
    true
  );
});

test('uses Linux cache path under the user cache directory', () => {
  const dir = getDefaultBeatMapCacheDir('linux', '/home/tester');
  assert.equal(dir, '/home/tester/.cache/Mineradio/beatmaps');
});

test('uses platform-appropriate Chromium switches', () => {
  const linuxSwitches = getChromiumPerformanceSwitches('linux');
  const winSwitches = getChromiumPerformanceSwitches('win32');

  assert.equal(linuxSwitches.some(([name, value]) => name === 'use-angle' && value === 'd3d11'), false);
  assert.equal(winSwitches.some(([name, value]) => name === 'use-angle' && value === 'd3d11'), true);
});

test('uses PNG icon on Linux and ICO on Windows', () => {
  assert.equal(getAppIconPath('/repo/build', 'linux'), '/repo/build/icon.png');
  assert.equal(getAppIconPath('/repo/build', 'win32'), '/repo/build/icon.ico');
});

test('relaunches Linux AppImage updates after the current instance exits', () => {
  assert.equal(getUpdateOpenStrategy('/tmp/Mineradio-1.2.0.AppImage', 'linux'), 'relaunch');
  assert.equal(getUpdateOpenStrategy('/tmp/Mineradio-1.2.0.exe', 'win32'), 'open');
});
