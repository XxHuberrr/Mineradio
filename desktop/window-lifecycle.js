'use strict';

function closeAppleMusicWithMainWindow(controller) {
  if (controller && typeof controller.close === 'function') controller.close();
}

function shouldCreateMainWindow(mainWindow) {
  return !mainWindow || mainWindow.isDestroyed();
}

module.exports = {
  closeAppleMusicWithMainWindow,
  shouldCreateMainWindow,
};
