'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { WallpaperEngineRuntime } = require('../desktop/wallpaper-engine-runtime');

test('idle Wallpaper Engine runtime disposes as a verified clean state', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-we-idle-dispose-'));
  try {
    const runtime = new WallpaperEngineRuntime({
      nativeTempPath: tempRoot,
      desktopCapturer: null,
      useDesktopShellBroker: false,
      nativeSleep: async () => {},
    });
    const result = await runtime.dispose();
    assert.deepEqual(result, {
      ok: true,
      stopped: true,
      active: false,
      sessionId: '',
      reason: '',
    });
    assert.equal(runtime.active, null);
    assert.equal(runtime.pending, null);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
