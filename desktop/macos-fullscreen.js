'use strict';

// macOS owns the Space transition and its animation. Do not resize or lock the
// window while that transition is in progress.
function createMacFullscreenController(win, { restoreBounds, onError = console.warn }) {
  let pending = null;
  let timer = null;
  let savedBounds = null;
  let savedMaximized = false;
  let exitAfterEnter = false;

  function settle() {
    clearTimeout(timer);
    timer = null;
    pending = null;
  }

  function request(value) {
    if (win.isDestroyed()) return;
    if (pending !== null) {
      if (!value && pending === true) exitAfterEnter = true;
      return;
    }
    if (win.isFullScreen() === value) return;
    if (value) {
      savedBounds = win.getNormalBounds();
      savedMaximized = win.isMaximized();
    }
    pending = value;
    timer = setTimeout(() => {
      settle();
      exitAfterEnter = false;
      onError('[macOS] Fullscreen transition timed out');
    }, 10000);
    try {
      win.setFullScreenable(true);
      win.setResizable(true);
      win.setFullScreen(value);
    } catch (error) {
      settle();
      exitAfterEnter = false;
      throw error;
    }
  }

  win.on('enter-full-screen', () => {
    settle();
    if (exitAfterEnter) {
      exitAfterEnter = false;
      request(false);
    }
  });
  win.on('leave-full-screen', () => {
    settle();
    exitAfterEnter = false;
    if (savedBounds) {
      restoreBounds(savedBounds);
      if (savedMaximized) win.maximize();
      savedBounds = null;
    }
  });
  win.once('closed', settle);

  return {
    toggle: () => {
      if (pending === null) request(!win.isFullScreen());
    },
    exit: () => request(false),
    isTransitioning: () => pending !== null,
  };
}

module.exports = { createMacFullscreenController };
