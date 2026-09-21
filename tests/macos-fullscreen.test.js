'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createMacFullscreenController } = require('../desktop/macos-fullscreen');

function setup() {
  const win = new EventEmitter();
  const calls = [];
  let fullscreen = false;
  win.isDestroyed = () => false;
  win.isFullScreen = () => fullscreen;
  win.isMaximized = () => false;
  win.getNormalBounds = () => ({ x: 1500, y: 80, width: 1100, height: 700 });
  win.setFullScreenable = (value) => calls.push(['fullscreenable', value]);
  win.setResizable = (value) => calls.push(['resizable', value]);
  win.setFullScreen = (value) => calls.push(['fullscreen', value]);
  win.maximize = () => calls.push(['maximize']);
  const controller = createMacFullscreenController(win, { restoreBounds: (bounds) => calls.push(['restore', bounds]) });
  function complete(value) {
    fullscreen = value;
    win.emit(value ? 'enter-full-screen' : 'leave-full-screen');
  }
  return { win, calls, controller, complete };
}

test('native fullscreen stays resizable and waits for the native event', () => {
  const { win, calls, controller, complete } = setup();
  controller.toggle();
  assert.equal(controller.isTransitioning(), true);
  assert.equal(win.isFullScreen(), false);
  assert.deepEqual(calls, [['fullscreenable', true], ['resizable', true], ['fullscreen', true]]);
  controller.toggle();
  assert.equal(calls.length, 3, 'repeated clicks must not race the Space animation');
  complete(true);
  assert.equal(controller.isTransitioning(), false);
  win.emit('closed');
});

test('exit restores the original window only after leave-full-screen', () => {
  const { win, calls, controller, complete } = setup();
  controller.toggle();
  complete(true);
  controller.exit();
  assert.equal(calls.some(([name]) => name === 'restore'), false);
  complete(false);
  assert.deepEqual(calls.at(-1), ['restore', { x: 1500, y: 80, width: 1100, height: 700 }]);
  controller.exit();
  assert.equal(calls.filter(([name]) => name === 'restore').length, 1);
  win.emit('closed');
});

test('Escape during entry queues an exit until the Space transition completes', () => {
  const { win, calls, controller, complete } = setup();
  controller.toggle();
  controller.exit();
  assert.equal(calls.filter(([name]) => name === 'fullscreen').length, 1);
  complete(true);
  assert.deepEqual(calls.at(-1), ['fullscreen', false]);
  complete(false);
  assert.equal(controller.isTransitioning(), false);
  win.emit('closed');
});

test('exiting fullscreen preserves a previously maximized window', () => {
  const { win, calls, controller, complete } = setup();
  win.isMaximized = () => true;
  controller.toggle();
  complete(true);
  controller.exit();
  complete(false);
  assert.deepEqual(calls.at(-1), ['maximize']);
  win.emit('closed');
});
