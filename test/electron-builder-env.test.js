'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildElectronBuilderEnv } = require('../desktop/run-electron-builder');

test('packaging ignores machine-wide Electron download mirrors', () => {
  const source = {
    PATH: '/usr/bin',
    ELECTRON_MIRROR: 'https://example.invalid/electron/',
    npm_config_electron_mirror: 'https://example.invalid/npm-electron/',
    NPM_CONFIG_ELECTRON_CUSTOM_DIR: 'custom-electron',
    npm_config_electron_custom_filename: 'custom.zip',
  };

  const env = buildElectronBuilderEnv(source);

  assert.equal(env.PATH, '/usr/bin');
  assert.equal(Object.hasOwn(env, 'ELECTRON_MIRROR'), false);
  assert.equal(Object.hasOwn(env, 'npm_config_electron_mirror'), false);
  assert.equal(Object.hasOwn(env, 'NPM_CONFIG_ELECTRON_CUSTOM_DIR'), false);
  assert.equal(Object.hasOwn(env, 'npm_config_electron_custom_filename'), false);
});
