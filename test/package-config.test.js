const test = require('node:test');
const assert = require('node:assert/strict');
const packageJson = require('../package.json');

test('package build files include platform utility module used at runtime', () => {
  const files = Array.isArray(packageJson.build && packageJson.build.files)
    ? packageJson.build.files
    : [];

  assert.equal(files.includes('platform-utils.js'), true);
});

test('provides explicit AppImage and Debian build commands without changing the default target', () => {
  assert.equal(packageJson.homepage, 'https://github.com/XxHuberrr/Mineradio');
  assert.equal(packageJson.scripts['build:linux'], 'electron-builder --linux AppImage --x64');
  assert.equal(packageJson.scripts['build:linux:appimage'], 'electron-builder --linux AppImage --x64');
  assert.equal(packageJson.scripts['build:linux:deb'], 'electron-builder --linux deb --x64');
  assert.match(packageJson.build.linux.maintainer, /^.+ <[^<>\s]+@[^<>\s]+>$/);
  assert.deepEqual(packageJson.build.linux.target, [
    { target: 'AppImage', arch: ['x64'] },
  ]);
});
