const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function findNewestRceditInCache(cacheRoot) {
  if (!cacheRoot || !fs.existsSync(cacheRoot)) return null;
  var newest = null;
  var stack = [cacheRoot];
  while (stack.length) {
    var dir = stack.pop();
    var entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { continue; }
    entries.forEach(function(entry) {
      var fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        return;
      }
      if (entry.isFile() && entry.name.toLowerCase() === 'rcedit-x64.exe') {
        var stat = fs.statSync(fullPath);
        if (!newest || stat.mtimeMs > newest.mtimeMs) newest = { path: fullPath, mtimeMs: stat.mtimeMs };
      }
    });
  }
  return newest && newest.path;
}

function resolveRcedit(projectDir) {
  var candidates = [
    path.join(projectDir, 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe')
  ];
  var localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    var cached = findNewestRceditInCache(path.join(localAppData, 'electron-builder', 'Cache', 'winCodeSign'));
    if (cached) candidates.push(cached);
  }
  candidates.push(path.join(projectDir, 'node_modules', 'electron-winstaller', 'vendor', 'rcedit.exe'));
  var hit = candidates.find(function(candidate) { return candidate && fs.existsSync(candidate); });
  if (!hit) throw new Error('No usable rcedit executable was found for Mineradio icon injection.');
  return hit;
}

module.exports = async function afterPack(context) {
  if (context.electronPlatformName === 'win32') {
    const appName = context.packager.appInfo.productFilename || 'Mineradio';
    const exePath = path.join(context.appOutDir, `${appName}.exe`);
    const iconPath = path.join(context.packager.info.buildResourcesDir, 'icon.ico');
    const rceditPath = resolveRcedit(context.packager.projectDir);

    if (!fs.existsSync(exePath)) throw new Error(`Mineradio executable was not found: ${exePath}`);
    if (!fs.existsSync(iconPath)) throw new Error(`Mineradio icon was not found: ${iconPath}`);

    const version = context.packager.appInfo.version;
    console.log(`  • injecting Mineradio resources  rcedit=${rceditPath}`);
    execFileSync(rceditPath, [
      exePath,
      '--set-icon', iconPath,
      '--set-version-string', 'FileDescription', 'Mineradio',
      '--set-version-string', 'ProductName', 'Mineradio',
      '--set-version-string', 'CompanyName', 'Mineradio',
      '--set-version-string', 'OriginalFilename', `${appName}.exe`,
      '--set-file-version', version,
      '--set-product-version', version
    ], { stdio: 'inherit' });
  }

  const shouldVmpSign = context.electronPlatformName === 'darwin'
    || context.electronPlatformName === 'win32';
  const hasEvsCredentials = !!(process.env.EVS_ACCOUNT_NAME && process.env.EVS_PASSWD);
  const explicitlyRequested = process.env.MINERADIO_EVS_SIGN === '1';
  if (!shouldVmpSign || (!hasEvsCredentials && !explicitlyRequested)) {
    if (shouldVmpSign) console.log('  • EVS production VMP signing skipped (credentials not configured)');
    return;
  }

  console.log('  • signing CastLabs package with EVS production VMP keys');
  execFileSync('uvx', [
    '--from', 'castlabs-evs',
    'evs-vmp', 'sign-pkg', context.appOutDir
  ], { stdio: 'inherit' });
};
