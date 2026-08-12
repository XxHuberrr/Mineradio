'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appRoot = path.resolve(__dirname, '..');
const mainText = fs.readFileSync(path.join(appRoot, 'desktop', 'main.js'), 'utf8');
const runtimeText = fs.readFileSync(path.join(appRoot, 'desktop', 'wallpaper-engine-runtime.js'), 'utf8');
const htmlText = fs.readFileSync(path.join(appRoot, 'public', 'index.html'), 'utf8');

function sourceBlock(text, startNeedle, endNeedle) {
  const start = text.indexOf(startNeedle);
  assert(start >= 0, `missing source block: ${startNeedle}`);
  const end = text.indexOf(endNeedle, start + startNeedle.length);
  assert(end > start, `missing source block terminator: ${endNeedle}`);
  return text.slice(start, end);
}

function testLoginWishTitle() {
  assert.match(
    htmlText,
    /<h1>\s*心愿是\s*<\/h1>/,
    '彩蛋解锁面板标题必须保持为“心愿是”'
  );
  assert.doesNotMatch(
    htmlText,
    /<h1>\s*我希望\s*<\/h1>/,
    '旧的“我希望”标题不应回归'
  );
}

function testWallpaperEngineElevationBroker() {
  assert.doesNotMatch(
    mainText,
    /WALLPAPER_ENGINE_HOST_ELEVATED/,
    '主进程不得再因管理员 host 直接阻断 Wallpaper Engine'
  );
  [
    /function controlBrokerScript/,
    /GetShellWindow\(\)/,
    /GetIntegrityRid\(explorerToken\)/,
    /PROC_THREAD_ATTRIBUTE_PARENT_PROCESS/,
    /CreateProcessW\(/,
    /Wallpaper Engine child is not medium integrity/,
    /async _spawnControlViaDesktopShell/,
    /const elevated = this\.useDesktopShellBroker && await this\._hostIsElevated\(\)/,
    /if \(elevated\)\s*\{\s*return this\._spawnControlViaDesktopShell\(executable, args\)/,
  ].forEach(pattern => assert.match(
    runtimeText,
    pattern,
    `Wallpaper Engine Explorer integrity broker contract missing: ${pattern}`
  ));
}

function testRendererGoneDelayedRecovery() {
  const recoveryBlock = sourceBlock(
    mainText,
    'function recoverMainWindowAfterRendererGone(win, details = {}, cleanupPromise = null)',
    'async function loadMainWindowWithRetry(win)'
  );
  assert.match(recoveryBlock, /await startupDelay\(\d+\)/, '渲染进程退出后必须延迟恢复');
  assert.match(recoveryBlock, /await ensureLocalServerStarted\(\)/, '恢复前必须确保本地服务可用');
  assert.match(recoveryBlock, /await loadMainWindowWithRetry\(win\)/, '恢复必须走有界重载链路');
  assert.match(recoveryBlock, /mainWindowRendererRecoveryPromise/, '同一时刻只能有一个恢复任务');
  assert.match(recoveryBlock, /reserveMainWindowRendererRecoveryAttempt\(\)/, '恢复必须有循环上限');
  assert.match(
    recoveryBlock,
    /if \(cleanupPromise\) await Promise\.resolve\(cleanupPromise\)[\s\S]{0,260}await loadMainWindowWithRetry\(win\)/,
    '重载主页前必须先等待 WE 与桌面模式清理收口'
  );
  assert.match(recoveryBlock, /const keepIntentionallyHidden = win\.__mineradioIntentionalHide === true/, '恢复必须快照托盘主动隐藏状态');
  assert.match(
    recoveryBlock,
    /win\.__mineradioIntentionalHide = keepIntentionallyHidden;\s*if \(!keepIntentionallyHidden\) showMainWindowSafely\(win, `renderer-recovered-\$\{attempt\}`\);\s*else sendWindowState\(win\)/,
    '托盘主动隐藏期间的渲染恢复不得擅自 show 主窗口'
  );

  const goneBlock = sourceBlock(
    mainText,
    "win.webContents.on('render-process-gone'",
    "win.on('unresponsive'"
  );
  assert.match(goneBlock, /startupCompleted/, '启动期与运行期渲染崩溃必须区分');
  assert.match(goneBlock, /const cleanupPromise = Promise\.allSettled\(\[/, '渲染退出必须合并跟踪 WE 与桌面模式清理');
  assert.match(goneBlock, /setTimeout\(\(\) => recoverMainWindowAfterRendererGone\(win, details, cleanupPromise\), 0\)/, '不得在 render-process-gone 回调栈内同步导航');
  assert.match(goneBlock, /details\.reason[\s\S]{0,120}clean-exit/, '正常退出不得触发崩溃恢复');
}

function testFullscreenVisibilityAndSystemWakeGuards() {
  const visibilityBlock = sourceBlock(
    mainText,
    'function shouldRestoreUnexpectedFullscreenVisibility(win)',
    'function reserveMainWindowRendererRecoveryAttempt()'
  );
  assert.match(visibilityBlock, /win\.__mineradioIntentionalHide === true/, '托盘主动隐藏必须跳过可见性守护');
  assert.match(visibilityBlock, /fullDesktopModeHostVisibilityTransitionDepth > 0/, '桌面嵌入切换期间必须跳过守护');
  assert.match(visibilityBlock, /fullDesktopModeRuntime\.getStatus\('fullscreen-visibility-guard'\)\.enabled === true/, '桌面模式不得被普通全屏守护拉回顶层');
  assert.match(visibilityBlock, /!win\.isFullScreen\(\)/, '守护只应修复全屏窗口');
  assert.match(visibilityBlock, /win\.isMinimized\(\)/, '用户主动最小化不得被自动拉起');
  assert.match(visibilityBlock, /win\.isVisible\(\)/, '已可见窗口不得重复 show');
  assert.match(visibilityBlock, /setInterval\([\s\S]{0,160}restoreUnexpectedFullscreenVisibility\(win, 'fullscreen-watchdog'\)/, '全屏可见性必须有低频运行期守护');

  assert.match(mainText, /win\.__mineradioIntentionalHide = true;[\s\S]{0,180}win\.hide\(\)/, '托盘隐藏必须先标记为 intentional');
  assert.match(mainText, /win\.on\('show'[\s\S]{0,120}win\.__mineradioIntentionalHide = false/, '重新显示后必须解除 intentional hide');
  assert.match(mainText, /win\.on\('enter-full-screen'[\s\S]{0,220}startMainWindowFullscreenVisibilityGuard\(win\)/, '进入全屏必须启动守护');
  assert.match(mainText, /win\.on\('leave-full-screen'[\s\S]{0,180}clearMainWindowFullscreenVisibilityGuard\(\)/, '退出全屏必须停止守护');
  assert.match(mainText, /const\s+\{[^}]*\bpowerMonitor\b[^}]*\}\s*=\s*require\('electron'\)/, '主进程必须引入 powerMonitor');
  assert.match(mainText, /powerMonitor\.on\('resume',[\s\S]{0,120}restoreUnexpectedFullscreenVisibility\(mainWindow, 'system-resume'\)/, '系统唤醒后必须检查全屏可见性');
  assert.match(mainText, /powerMonitor\.on\('unlock-screen',[\s\S]{0,140}restoreUnexpectedFullscreenVisibility\(mainWindow, 'screen-unlock'\)/, '解锁屏幕后必须检查全屏可见性');
}

testLoginWishTitle();
testWallpaperEngineElevationBroker();
testRendererGoneDelayedRecovery();
testFullscreenVisibilityAndSystemWakeGuards();

console.log('[OK] Main-window runtime recovery preserves elevated WE broker launch and restores unexpected fullscreen loss.');
