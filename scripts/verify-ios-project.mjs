import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const requiredFiles = [
  'ios/MineradioIOS/MineradioIOS.xcodeproj/project.pbxproj',
  'ios/MineradioIOS/MineradioIOS/AppDelegate.swift',
  'ios/MineradioIOS/MineradioIOS/NeteaseLoginViewController.swift',
  'ios/MineradioIOS/MineradioIOS/SceneDelegate.swift',
  'ios/MineradioIOS/MineradioIOS/ViewController.swift',
  'ios/MineradioIOS/MineradioIOS/Info.plist',
  'ios/MineradioIOS/MineradioIOS/Resources/ios-compat.js',
  'ios/MineradioIOS/MineradioIOS/Resources/ios-compat.css',
  'public/index.html',
  'public/vendor/three.r128.min.js'
];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

for (const file of requiredFiles) {
  assert(fs.existsSync(path.join(root, file)), `Missing required file: ${file}`);
}

const project = read('ios/MineradioIOS/MineradioIOS.xcodeproj/project.pbxproj');
assert(project.includes('MineradioIOS.app'), 'Xcode project must build MineradioIOS.app');
assert(project.includes('iphoneos'), 'Xcode project must target iPhoneOS');
assert(project.includes('public'), 'Xcode project must copy the public web assets');
assert(project.includes('ios-compat.js'), 'Xcode project must copy ios-compat.js');

const viewController = read('ios/MineradioIOS/MineradioIOS/ViewController.swift');
assert(viewController.includes('WKWebView'), 'ViewController must host the app in WKWebView');
assert(viewController.includes('loadFileURL'), 'ViewController must load bundled public/index.html');
assert(
  viewController.includes('bundledTextResource(named: "ios-compat", extension: "js")'),
  'ViewController must inject ios-compat.js'
);
assert(
  viewController.includes('bundledTextResource(named: "ios-compat", extension: "css")'),
  'ViewController must inject ios-compat.css'
);
assert(viewController.includes('WKScriptMessageHandler'), 'ViewController must handle iOS JavaScript bridge messages');
assert(viewController.includes('openExternalURL'), 'ViewController must expose openExternalURL for iOS login handoff');
assert(viewController.includes('openNeteaseLogin'), 'ViewController must expose in-app Netease login');
assert(viewController.includes('__mineradioIOSBridgeResolve'), 'ViewController must resolve iOS JavaScript bridge promises');

const neteaseLoginController = read('ios/MineradioIOS/MineradioIOS/NeteaseLoginViewController.swift');
assert(neteaseLoginController.includes('https://music.163.com/#/login'), 'Netease login controller must load official login page');
assert(neteaseLoginController.includes('MUSIC_U'), 'Netease login controller must capture MUSIC_U cookie');
assert(neteaseLoginController.includes('WKHTTPCookieStoreObserver'), 'Netease login controller must observe WebKit cookies');
assert(neteaseLoginController.includes('customUserAgent'), 'Netease login controller must use a desktop user agent for QR login');
assert(neteaseLoginController.includes('javaScriptCanOpenWindowsAutomatically = true'), 'Netease login controller must allow login popups inside WKWebView');
assert(neteaseLoginController.includes('statusLabel'), 'Netease login controller must show visible login diagnostics');
assert(neteaseLoginController.includes('loginDiagnostics'), 'Netease login controller must return login diagnostics');
assert(neteaseLoginController.includes('didFailProvisionalNavigation'), 'Netease login controller must capture navigation failures');
assert(neteaseLoginController.includes('manuallyCheckLogin'), 'Netease login controller must allow manual completion checks');
assert(neteaseLoginController.includes('未检测到登录 Cookie'), 'Netease login controller must show missing cookie feedback');

const compatJs = read('ios/MineradioIOS/MineradioIOS/Resources/ios-compat.js');
assert(compatJs.includes('window.desktopWindow'), 'iOS compatibility script must stub desktopWindow');
assert(compatJs.includes('mineradio-ios-shell'), 'iOS compatibility script must mark the iOS shell');
assert(compatJs.includes('https://music.163.com/#/login'), 'iOS compatibility script must know Netease login URL');
assert(compatJs.includes('https://y.qq.com/n/ryqq/player'), 'iOS compatibility script must know QQ Music login URL');
assert(compatJs.includes('openExternalURL'), 'iOS compatibility script must request native external URL opening');
assert(compatJs.includes('openNeteaseLogin'), 'iOS compatibility script must request native in-app Netease login');
assert(compatJs.includes('__mineradioIOSBridgeResolve'), 'iOS compatibility script must resolve native bridge promises');
assert(compatJs.includes('MINERADIO_IOS_NETEASE_LOGIN'), 'iOS compatibility script must persist Netease login state');
assert(compatJs.includes('/api/login/cookie'), 'iOS compatibility script must handle Netease cookie login API locally');
assert(compatJs.includes('getNeteaseLoginDiagnostics'), 'iOS compatibility script must expose Netease login diagnostics');
assert(compatJs.includes('/api/ios/netease-login-diagnostics'), 'iOS compatibility script must expose diagnostics API locally');

const compatCss = read('ios/MineradioIOS/MineradioIOS/Resources/ios-compat.css');
assert(compatCss.includes('safe-area-inset-bottom'), 'iOS CSS must account for safe areas');
assert(compatCss.includes('pointer: coarse'), 'iOS CSS must include touch-oriented rules');

const indexHtml = read('public/index.html');
assert(
  indexHtml.includes('!api.isDesktop && !api.isIOS'),
  'Login web bridge must be allowed on iOS as well as desktop'
);

console.log('iOS project structure verified');
