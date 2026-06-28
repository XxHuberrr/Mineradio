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

// 对打包产物做 castLabs EVS 生产 VMP 签名，让公开分发的 Mineradio.exe 带有效的 Mineradio.exe.sig，
// 否则下载用户的 Spotify 整曲播放会被 Widevine 生产 license 服务器拒绝。
// 必须在 rcedit 改写 exe 之后签名（改 exe 会让旧签名失效）。
// 凭据走 EVS 缓存（-n 非交互，绝不在此输入密码）；缺凭据时 -n 会干净失败。
function signVmp(appOutDir) {
  if (process.env.SKIP_VMP_SIGN) {
    console.log('  • VMP 签名已跳过 (SKIP_VMP_SIGN)');
    return;
  }
  const python = process.env.EVS_PYTHON || 'python';
  const strict = !!process.env.MINERADIO_REQUIRE_VMP;
  try {
    console.log(`  • VMP 生产签名 (EVS sign-pkg)  ${appOutDir}`);
    execFileSync(python, ['-m', 'castlabs_evs.vmp', '-n', 'sign-pkg', appOutDir], { stdio: 'inherit' });
    try {
      execFileSync(python, ['-m', 'castlabs_evs.vmp', '-n', 'verify-pkg', appOutDir], { stdio: 'inherit' });
    } catch (e) { /* verify 仅信息性，失败不阻断 */ }
    console.log('  • VMP 签名完成：Mineradio.exe.sig 已写入打包目录');
  } catch (err) {
    const msg = [
      '',
      '  ====================================================================',
      '  !! VMP 生产签名失败 —— 这个发布包不带有效证书，',
      '  !! 下载用户的 Spotify 整曲播放将无法工作（Widevine 会拒绝）。',
      '  !! 请确保已 castlabs-evs 登录，然后手动重签打包目录：',
      `  !!   ${python} -m castlabs_evs.vmp sign-pkg "${appOutDir}"`,
      `  !! 原因: ${err && err.message ? err.message : err}`,
      '  ====================================================================',
      ''
    ].join('\n');
    if (strict) throw new Error('VMP 签名失败且 MINERADIO_REQUIRE_VMP 已设置：' + (err && err.message ? err.message : err));
    console.warn(msg);
  }
}

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

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

  // 图标/版本注入改写了 exe，此时再做 VMP 生产签名，保证发布包带有效证书。
  signVmp(context.appOutDir);
};
