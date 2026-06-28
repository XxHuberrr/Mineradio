/**
 * @name Basic Test Source
 * @version 1.0.0
 */
if (globalThis.lx) {
  if (typeof require !== 'undefined' || typeof process !== 'undefined') throw new Error('sandbox escape');
  const { EVENT_NAMES, on, send } = globalThis.lx;

  on(EVENT_NAMES.request, ({ action, info }) => {
    if (action !== 'musicUrl') return Promise.reject(new Error('unsupported'));
    return Promise.resolve(`https://audio.example/${info.musicInfo.meta.songId}/${info.type}.mp3`);
  });

  send(EVENT_NAMES.inited, {
    sources: {
      wy: { name: 'WY', type: 'music', actions: ['musicUrl'], qualitys: ['128k', '320k', 'flac'] },
      tx: { name: 'TX', type: 'music', actions: ['musicUrl'], qualitys: ['128k'] },
    },
  });
}
