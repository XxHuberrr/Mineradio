const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

function requestJson(port, path, method, value) {
  const body = value === undefined ? '' : JSON.stringify(value);
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path,
      method,
      headers: body ? {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      } : {},
    }, res => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(text) }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

test('POST /api/custom-source/resolve delegates to the injected resolver', async t => {
  process.env.PORT = '0';
  process.env.HOST = '127.0.0.1';
  const server = require('../../server');
  t.after(async () => {
    if (typeof server.setCustomSourceResolver === 'function') server.setCustomSourceResolver(null);
    if (server.listening) await new Promise(resolve => server.close(resolve));
  });
  server.setCustomSourceResolver(async ({ song, quality, signal }) => {
    assert.equal(signal.aborted, false);
    return {
      active: true,
      handled: true,
      url: `https://audio/${song.id}.mp3`,
      level: quality,
    };
  });
  await new Promise(resolve => server.listening ? resolve() : server.once('listening', resolve));

  const result = await requestJson(server.address().port, '/api/custom-source/resolve', 'POST', {
    song: { provider: 'netease', id: 42 },
    quality: 'standard',
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.url, 'https://audio/42.mp3');
  assert.equal(result.body.level, 'standard');
});

test('custom source route reports inactive and resolver failures without falling through', async t => {
  process.env.PORT = '0';
  process.env.HOST = '127.0.0.1';
  delete require.cache[require.resolve('../../server')];
  const server = require('../../server');
  t.after(async () => {
    if (typeof server.setCustomSourceResolver === 'function') server.setCustomSourceResolver(null);
    if (server.listening) await new Promise(resolve => server.close(resolve));
  });
  await new Promise(resolve => server.listening ? resolve() : server.once('listening', resolve));

  const inactive = await requestJson(server.address().port, '/api/custom-source/resolve', 'POST', {
    song: { provider: 'qq', id: 'x' },
  });
  assert.deepEqual(inactive.body, { active: false, handled: false });

  server.setCustomSourceResolver(async () => { throw new Error('source exploded'); });
  const failed = await requestJson(server.address().port, '/api/custom-source/resolve', 'POST', {
    song: { provider: 'qq', id: 'x' },
  });
  assert.equal(failed.status, 502);
  assert.equal(failed.body.active, true);
  assert.equal(failed.body.error, 'source exploded');
});
