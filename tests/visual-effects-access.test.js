'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const html = read('public', 'index.html');
const css = read('public', 'css', 'index.css');
const presetSource = read('public', 'js', 'modules', '07-fx', '00-preset-archive-data.js');
const presetUi = read('public', 'js', 'modules', '07-fx', '04-preset-grid-uniforms.js');
const bindings = read('public', 'js', 'modules', '07-fx', '07-bindings-shelf-immersive.js');
const guide = read('public', 'js', 'modules', '09-idle-toast-libraries.js');
const shortcuts = read('public', 'js', 'modules', '10-shell', '01-viewport-resize-shortcuts.js');

const metaMatch = presetSource.match(/var presetMeta = (\[[\s\S]*?\n\]);\nvar presetIcons/);
const orderMatch = presetSource.match(/var presetDisplayOrder = (\[[^\n]+\]);/);
assert(metaMatch && orderMatch, 'visual preset metadata must remain statically inspectable');
const context = {};
vm.runInNewContext(`this.presetMeta = ${metaMatch[1]}; this.order = ${orderMatch[1]};`, context);
assert.strictEqual(context.presetMeta.length, 11, 'all eleven visual presets must ship');
assert.deepStrictEqual(Array.from(new Set(Array.from(context.order))).sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'display order must expose every preset exactly once');

assert(/id="fx-fab"[^>]*onclick="toggleFxPanel\(\)"[^>]*aria-controls="fx-panel"/.test(html), 'visual launcher must be an explicit accessible button');
assert(html.includes('11 PRESETS · 点击按钮固定打开 · P 快捷键'), 'visual panel must explain its preset count and access methods');
assert(presetUi.includes('<button class="preset-card" type="button"'), 'each visual preset must be keyboard-focusable');
assert(!/body\.simple-mode #fx-fab[\s\S]{0,120}display:\s*none/.test(css), 'simple mode must not hide the visual launcher');
assert(!/body\.simple-mode #fx-panel[\s\S]{0,120}display:\s*none/.test(css), 'simple mode must not hide the visual panel');
assert(!/html\.simple-mode-preload #fx-fab[\s\S]{0,160}display:\s*none/.test(css), 'persistent simple-mode preload state must not hide the visual launcher');
assert(!/html\.simple-mode-preload #fx-panel[\s\S]{0,160}display:\s*none/.test(css), 'persistent simple-mode preload state must not hide the visual panel');
assert(!bindings.includes("showToast('开启 DIY 玩家模式后可打开视觉控制台')"), 'visual presets must not be gated behind DIY mode');
assert(/force === false \|\| \(currentlyOpen && force !== true\)/.test(bindings), 'visual launcher must toggle closed as well as open');
assert(bindings.includes("el.classList.add('show')"), 'clicking the visual launcher must pin the panel open');
assert(bindings.includes("openFab.setAttribute('aria-expanded', 'true')"), 'visual launcher expanded state must be announced');
assert(/else if \(e\.code === 'KeyP'\) \{\s*if \(!immersiveMode\) toggleFxPanel\(\);/.test(shortcuts), 'P must open visual presets without requiring DIY mode');
assert(/body\.desktop-shell #desktop-window-shell\s*\{[\s\S]{0,220}overflow:\s*clip/.test(css), 'the desktop shell must clip overflow without becoming a scroll container');
assert(/function resetDesktopWindowShellScroll\(\)[\s\S]{0,360}shell\.scrollLeft = 0/.test(shortcuts), 'viewport refresh must recover a stale horizontal shell offset');
assert(/desktopWindowShell\.addEventListener\('scroll', resetDesktopWindowShellScroll/.test(shortcuts), 'desktop shell scrolling must be corrected immediately');

assert(guide.includes("title: '不是一个特效：这里有 11 套视觉预设'"), 'startup guide must state that multiple visual effects exist');
assert(guide.includes("action: 'open-visual-presets'"), 'visual guide step must expose a direct action');
assert(/function runVisualGuideAction\(\)[\s\S]{0,420}closeVisualGuide\(true\)[\s\S]{0,420}toggleFxPanel\(true\)/.test(guide), 'guide action must finish the guide and open the visual presets');
assert(html.includes('id="visual-guide-action"'));
assert(/\.visual-guide-actions \.visual-guide-action\.show\s*\{[\s\S]{0,220}flex:\s*1 0 100%/.test(css), 'visual guide action must occupy its own row instead of crowding navigation controls');

console.log('[OK] all eleven visual presets are directly reachable in simple and DIY modes.');
