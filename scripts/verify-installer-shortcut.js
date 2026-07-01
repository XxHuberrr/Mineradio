const fs = require('fs');

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const nsis = pkg && pkg.build && pkg.build.nsis;

if (!nsis) {
  console.error('Missing build.nsis configuration.');
  process.exit(1);
}

if (nsis.createDesktopShortcut !== 'always') {
  console.error('Desktop shortcut should be recreated on reinstall/update. Set build.nsis.createDesktopShortcut to "always".');
  process.exit(1);
}

if (nsis.createStartMenuShortcut !== true) {
  console.error('Start menu shortcut should stay enabled.');
  process.exit(1);
}

console.log('Installer shortcut configuration is present.');
