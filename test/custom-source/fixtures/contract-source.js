/**
 * @name Contract Test Source
 * @version 1.0.0
 */
if (globalThis.lx) (async () => {
  if (typeof require !== 'undefined' || typeof process !== 'undefined') throw new Error('sandbox escape');
  const { EVENT_NAMES, on, send, request, utils } = globalThis.lx;
  const baseUrl = '__BASE_URL__';
  const publicKey = __PUBLIC_KEY__;
  const call = (path, options) => new Promise((resolve, reject) => {
    request(baseUrl + path, options || {}, (error, response, body) => error ? reject(error) : resolve({ response, body }));
  });
  const abc = utils.buffer.from('abc');
  if (utils.buffer.bufToString(abc, 'utf8') !== 'abc') throw new Error('buffer contract');
  if (utils.crypto.md5('abc') !== '900150983cd24fb0d6963f7d28e17f72') throw new Error('md5 contract');
  if (utils.crypto.randomBytes(16).length !== 16) throw new Error('random contract');
  const zipped = await utils.zlib.deflate(abc);
  const unzipped = await utils.zlib.inflate(zipped);
  if (utils.buffer.bufToString(unzipped, 'utf8') !== 'abc') throw new Error('zlib contract');
  const key = utils.buffer.from('0123456789abcdef');
  const iv = utils.buffer.from('abcdef0123456789');
  if (!utils.crypto.aesEncrypt(abc, 'aes-128-cbc', key, iv).length) throw new Error('aes contract');
  if (utils.crypto.rsaEncrypt(abc, publicKey).length !== 128) throw new Error('rsa contract');
  if (!(await call('/json')).body.ok) throw new Error('json request');
  if ((await call('/text')).body !== 'plain text') throw new Error('text request');
  if ((await call('/echo', { method: 'POST', body: 'raw-body' })).body !== 'raw-body') throw new Error('body request');
  if ((await call('/echo', { method: 'POST', form: { a: '1', b: 'two' } })).body !== 'a=1&b=two') throw new Error('form request');
  const formDataBody = (await call('/echo', { method: 'POST', formData: { a: 'one' } })).body;
  if (!String(formDataBody).includes('one')) throw new Error('formData request');
  const cancelled = await new Promise(resolve => {
    const cancel = request(baseUrl + '/slow', { timeout: 60000 }, error => resolve(!!error));
    setTimeout(cancel, 30);
  });
  if (!cancelled) throw new Error('cancel request');
  await send(EVENT_NAMES.updateAlert, { log: 'contract update', updateUrl: 'https://example.com/update' });
  let duplicateRejected = false;
  try { await send(EVENT_NAMES.updateAlert, { log: 'duplicate' }); } catch { duplicateRejected = true; }
  if (!duplicateRejected) throw new Error('update alert contract');
  await on(EVENT_NAMES.request, ({ source, action, info }) => {
    if (source === 'local' && action === 'lyric') return { lyric: '[00:00.00]a', tlyric: 'a', rlyric: 'a', lxlyric: 'a' };
    if (source === 'local' && action === 'pic') return 'https://img.example/cover.jpg';
    if (action === 'musicUrl') return `https://audio.example/${info.musicInfo.meta.songId}/${info.type}.mp3`;
    throw new Error('unsupported action');
  });
  await send(EVENT_NAMES.inited, { sources: {
    wy: { name: 'WY', type: 'music', actions: ['musicUrl'], qualitys: ['128k', '320k', 'flac'] },
    local: { name: 'Local', type: 'music', actions: ['musicUrl', 'lyric', 'pic'], qualitys: [] },
  } });
})().catch(error => { throw error; });
