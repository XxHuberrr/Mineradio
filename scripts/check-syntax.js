'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const javascriptFiles = [
  'server.js',
  'server-security.js',
  'cookie-storage.js',
  'update-signature.js',
  'update-patch.js',
  'dj-analyzer.js',
  'desktop/main.js',
  'desktop/preload.js',
  'desktop/overlay-preload.js',
  'build/after-pack.js',
  'scripts/check-syntax.js',
  'scripts/test-server-security.js',
  'scripts/test-cookie-storage.js',
  'scripts/test-update-signature.js',
  'scripts/test-update-patch.js',
  'scripts/test-update-patch-e2e.js',
  'scripts/test-electron-safe-storage.js',
  'scripts/sign-update-patch.js',
];
const htmlFiles = [
  'public/index.html',
  'public/desktop-lyrics.html',
  'public/wallpaper.html',
];
const jsonFiles = [
  'package.json',
  'package-lock.json',
  'public/default-user-fx-archive.json',
];

function fail(message) {
  console.error('[check] ' + message);
  process.exitCode = 1;
}

for (const relativePath of javascriptFiles) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, relativePath)], { encoding: 'utf8' });
  if (result.status !== 0) {
    fail(relativePath + '\n' + (result.stderr || result.stdout || 'syntax check failed'));
  } else {
    console.log('[check] JS OK:', relativePath);
  }
}

for (const relativePath of htmlFiles) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  let inlineIndex = 0;
  while ((match = scriptPattern.exec(source))) {
    const attributes = match[1] || '';
    if (/\bsrc\s*=/i.test(attributes)) continue;
    const typeMatch = attributes.match(/\btype\s*=\s*["']([^"']+)["']/i);
    const type = typeMatch ? typeMatch[1].toLowerCase() : '';
    if (type && !['text/javascript', 'application/javascript', 'module'].includes(type)) continue;
    inlineIndex += 1;
    try {
      new vm.Script(match[2], { filename: relativePath + '#inline-' + inlineIndex });
    } catch (error) {
      fail(relativePath + ' inline script ' + inlineIndex + '\n' + error.stack);
    }
  }
  if (!process.exitCode) console.log('[check] HTML scripts OK:', relativePath, '(' + inlineIndex + ')');
}

for (const relativePath of jsonFiles) {
  try {
    JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
    console.log('[check] JSON OK:', relativePath);
  } catch (error) {
    fail(relativePath + '\n' + error.message);
  }
}

const conflictPattern = /^(<{7}|={7}|>{7})(?:\s|$)/m;
const sourceFiles = javascriptFiles.concat(htmlFiles, jsonFiles, ['AGENTS.md', 'README.md', 'CHANGELOG.md']);
for (const relativePath of sourceFiles) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  if (conflictPattern.test(source)) fail('merge conflict marker found in ' + relativePath);
}

if (process.exitCode) process.exit(process.exitCode);
console.log('[check] All static checks passed.');
