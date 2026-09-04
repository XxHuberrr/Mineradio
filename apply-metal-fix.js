const fs = require('fs');
const path = 'desktop/main.js';
let content = fs.readFileSync(path, 'utf8');

// 如果已经修复，跳过
if (content.includes("process.platform === 'darwin'")) {
  console.log('Metal 修复已存在，跳过');
  process.exit(0);
}

// 移除 ['use-angle', 'd3d11']
content = content.replace(/,\s*\['use-angle', 'd3d11'\]/, '');

// 在 gotSingleInstanceLock 之前添加 Metal 检测代码
const metalCode = `
// macOS 使用 Metal，Windows 使用 D3D11
if (process.platform === 'darwin') {
  app.commandLine.appendSwitch('use-angle', 'metal');
  // macOS 内存优化
  app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512');
  app.commandLine.appendSwitch('disable-gpu-sandbox');
} else if (process.platform === 'win32') {
  app.commandLine.appendSwitch('use-angle', 'd3d11');
}
`;

content = content.replace(
  'const gotSingleInstanceLock = app.requestSingleInstanceLock();',
  metalCode + '\nconst gotSingleInstanceLock = app.requestSingleInstanceLock();'
);

fs.writeFileSync(path, content);
console.log('Metal 修复已应用');
