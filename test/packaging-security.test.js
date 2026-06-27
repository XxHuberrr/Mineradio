const test = require('node:test');
const assert = require('node:assert/strict');

const packageJson = require('../package.json');

test('packages runtime security modules with the desktop application', () => {
  assert.ok(
    packageJson.build.files.includes('lib/**/*'),
    'package.json build.files must include lib/**/*',
  );
});
