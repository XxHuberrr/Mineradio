const os = require('os');
const path = require('path');

function normalizePlatform(platform) {
  return platform || process.platform;
}

function getReleaseAssetPatterns(platform) {
  switch (normalizePlatform(platform)) {
    case 'linux':
      return [/\.(AppImage)$/i, /\.(deb)$/i, /\.(rpm)$/i, /\.(tar\.gz|zip|7z)$/i];
    case 'win32':
    default:
      return [/\.(exe|msi)$/i, /\.(zip|7z)$/i];
  }
}

function getPreferredReleaseAsset(assets, platform) {
  const list = Array.isArray(assets) ? assets : [];
  const patterns = getReleaseAssetPatterns(platform);
  for (const pattern of patterns) {
    const hit = list.find((asset) => pattern.test(asset && asset.name || ''));
    if (hit) return hit;
  }
  return list[0] || null;
}

function getDefaultUpdateAssetName(version, platform) {
  const normalized = String(version || '').trim() || '0.0.0';
  switch (normalizePlatform(platform)) {
    case 'linux':
      return `Mineradio-${normalized}.AppImage`;
    case 'win32':
    default:
      return `Mineradio-${normalized}-Setup.exe`;
  }
}

function getDefaultBeatMapCacheDir(platform, homeDir = os.homedir()) {
  switch (normalizePlatform(platform)) {
    case 'linux':
      return path.join(homeDir, '.cache', 'Mineradio', 'beatmaps');
    case 'win32':
    default:
      return 'D:\\MineradioCache\\beatmaps';
  }
}

function getChromiumPerformanceSwitches(platform) {
  const base = [
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

  if (normalizePlatform(platform) !== 'linux') {
    base.push(['force_high_performance_gpu']);
    base.push(['use-angle', 'd3d11']);
  }

  return base;
}

function getAppIconPath(buildDir, platform) {
  const iconName = normalizePlatform(platform) === 'linux' ? 'icon.png' : 'icon.ico';
  return path.join(buildDir, iconName);
}

function getUpdateOpenStrategy(target, platform) {
  return normalizePlatform(platform) === 'linux' && /\.AppImage$/i.test(String(target || ''))
    ? 'relaunch'
    : 'open';
}

module.exports = {
  getPreferredReleaseAsset,
  getDefaultUpdateAssetName,
  getDefaultBeatMapCacheDir,
  getChromiumPerformanceSwitches,
  getAppIconPath,
  getUpdateOpenStrategy,
};
