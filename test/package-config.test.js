const test = require('node:test');
const assert = require('node:assert/strict');
const packageJson = require('../package.json');

test('package build files include platform utility module used at runtime', () => {
  const files = Array.isArray(packageJson.build && packageJson.build.files)
    ? packageJson.build.files
    : [];

  assert.equal(files.includes('platform-utils.js'), true);
});
