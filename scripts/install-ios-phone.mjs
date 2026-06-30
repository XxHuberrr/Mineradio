import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const deviceId = process.env.MINERADIO_IOS_DEVICE_ID || 'C8CF6284-8E54-518D-963B-12A58C2604FE';
const appPath = process.env.MINERADIO_IOS_APP_PATH || '.codex-tmp/DerivedData-iPhone/Build/Products/Debug-iphoneos/MineradioIOS.app';
const bundleId = process.env.MINERADIO_IOS_BUNDLE_ID || 'com.tao666618.mineradio.ios';
const env = { ...process.env, DEVELOPER_DIR: '/Applications/Xcode.app/Contents/Developer' };

function run(command, args) {
  try {
    return {
      ok: true,
      stdout: execFileSync(command, args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env
      }),
      stderr: ''
    };
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout ? String(error.stdout) : '',
      stderr: error.stderr ? String(error.stderr) : '',
      status: error.status
    };
  }
}

if (!fs.existsSync(appPath)) {
  console.error(`Missing signed iOS app: ${appPath}`);
  console.error('Run `npm run build:ios:phone` first.');
  process.exit(1);
}

console.log(`Installing ${appPath} to ${deviceId}`);
const install = run('xcrun', ['devicectl', 'device', 'install', 'app', '--device', deviceId, appPath]);
process.stdout.write(install.stdout);
process.stderr.write(install.stderr);
if (!install.ok) process.exit(install.status || 1);

console.log(`Launching ${bundleId} on ${deviceId}`);
const launch = run('xcrun', ['devicectl', 'device', 'process', 'launch', '--device', deviceId, bundleId]);
process.stdout.write(launch.stdout);
process.stderr.write(launch.stderr);
if (!launch.ok) {
  const output = `${launch.stdout}\n${launch.stderr}`;
  if (/profile has not been explicitly trusted/.test(output)) {
    console.error('\nMineradio 已安装到 iPhone，但 iOS 尚未信任这个个人开发者证书。');
    console.error('请在 iPhone 上打开：设置 > 通用 > VPN 与设备管理，信任 3362045398@qq.com / Apple Development 开发者，然后重新运行 `npm run install:ios:phone` 或直接点手机上的 Mineradio 图标。');
  }
  process.exit(launch.status || 1);
}
