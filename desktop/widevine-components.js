'use strict';

function createWidevineComponentsInitializer(components, logger = console) {
  let readinessPromise = null;

  return function ensureWidevineComponentsReady() {
    if (readinessPromise) return readinessPromise;

    const attempt = (async () => {
      if (!components || typeof components.whenReady !== 'function') {
        logger.warn('Widevine component manager is unavailable in this Electron build.');
        return { ok: false, unavailable: true };
      }
      try {
        await components.whenReady();
        const statuses = typeof components.status === 'function'
          ? Object.values(components.status())
          : [];
        const cdm = statuses.find((item) => /widevine/i.test([
          item && item.id,
          item && item.name,
          item && item.title,
        ].filter(Boolean).join(' '))) || statuses[0] || null;
        if (cdm) {
          logger.log(`Widevine CDM ready: ${cdm.title || 'Widevine'} ${cdm.version || ''} (${cdm.status || 'ready'})`);
        } else {
          logger.log('Widevine component manager is ready.');
        }
        return { ok: true, cdm };
      } catch (error) {
        logger.warn(`Widevine component initialization failed: ${error.message}`);
        return { ok: false, error: error.message };
      }
    })();
    readinessPromise = attempt;
    attempt.then((result) => {
      if (!result.ok && readinessPromise === attempt) readinessPromise = null;
    });

    return attempt;
  };
}

module.exports = { createWidevineComponentsInitializer };
