'use strict';

const { spawnSync } = require('node:child_process');

const BLOCKED_ELECTRON_DOWNLOAD_ENV = new Set([
  'electron_mirror',
  'electron_custom_dir',
  'electron_custom_filename',
  'npm_config_electron_mirror',
  'npm_config_electron_custom_dir',
  'npm_config_electron_custom_filename',
]);

function buildElectronBuilderEnv(source = process.env) {
  return Object.fromEntries(
    Object.entries(source).filter(([key]) => !BLOCKED_ELECTRON_DOWNLOAD_ENV.has(key.toLowerCase()))
  );
}

function runElectronBuilder(args = process.argv.slice(2)) {
  const cli = require.resolve('electron-builder/cli.js');
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: process.cwd(),
    env: buildElectronBuilderEnv(),
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  return result.status == null ? 1 : result.status;
}

if (require.main === module) process.exitCode = runElectronBuilder();

module.exports = {
  buildElectronBuilderEnv,
  runElectronBuilder,
};
