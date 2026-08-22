'use strict';

// 回归测试：加速器(全局/TUN)开启后网易云按海外出口 IP 返回地区受限，
// server.js 必须对所有 NeteaseCloudMusicApi 调用统一注入国内 realIP。
// 覆盖三种场景：默认注入 / 环境变量覆盖 / 空字符串关闭注入。
//
// 通过插桩 NeteaseCloudMusicApi 导出函数 + 清除 server.js 模块缓存
// 在同一进程内多次加载服务端，避免子进程管道在受限环境下不可用。

const assert = require('assert');
const http = require('http');
const path = require('path');
const os = require('os');

const API_PATH = require.resolve('NeteaseCloudMusicApi');
const SERVER_PATH = require.resolve('../server.js');

function getJson(port, requestPath, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { host: '127.0.0.1', port, path: requestPath, timeout: timeoutMs || 30000 },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
          catch (e) { reject(new Error('bad json response: ' + raw.slice(0, 240))); }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('request timeout')));
  });
}

async function loadServerAndProbe(realIPEnv) {
  process.env.PORT = '0';
  process.env.HOST = '127.0.0.1';
  process.env.COOKIE_FILE = path.join(os.tmpdir(), 'mineradio-test-cookie-' + process.pid + '-' + Date.now());
  if (realIPEnv === undefined) delete process.env.MINERADIO_NETEASE_REAL_IP;
  else process.env.MINERADIO_NETEASE_REAL_IP = realIPEnv;

  const api = require(API_PATH);
  const probes = [];
  function instrument(name) {
    const original = api[name];
    if (typeof original !== 'function') return;
    api[name] = function (data) {
      probes.push(name + '=' + (data && data.realIP ? data.realIP : '(none)'));
      return original(data);
    };
  }
  ['cloudsearch', 'song_url_v1', 'song_url'].forEach(instrument);

  delete require.cache[SERVER_PATH];
  const server = require(SERVER_PATH);
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;

  const search = await getJson(port, '/api/search?keywords=' + encodeURIComponent('晴天 周杰伦') + '&limit=3');
  let songUrlStatus = 'skipped';
  try {
    const songUrl = await getJson(port, '/api/song/url?id=33894312&quality=standard');
    songUrlStatus = 'status=' + songUrl.status +
      ' playable=' + !!songUrl.body.url +
      ' reason=' + (songUrl.body.reason || '') +
      ' restriction=' + (songUrl.body.restriction ? songUrl.body.restriction.category : '');
  } catch (e) {
    songUrlStatus = 'error=' + e.message;
  }

  server.close();
  return {
    probes,
    searchStatus: search.status,
    songCount: (search.body && search.body.songs) || [],
    songUrlStatus,
  };
}

function probeFor(probes, name) {
  const line = probes.find((l) => l.startsWith(name + '='));
  return line ? line.slice(name.length + 1) : '(no probe)';
}

async function testDefaultInjection() {
  const result = await loadServerAndProbe(undefined);
  assert.strictEqual(result.searchStatus, 200, 'search must return 200');
  assert.ok(result.songCount.length > 0, 'search must return songs, got: ' + JSON.stringify(result.songCount).slice(0, 120));
  assert.strictEqual(
    probeFor(result.probes, 'cloudsearch'),
    '116.25.146.177',
    'default realIP must be injected into cloudsearch, probes: ' + JSON.stringify(result.probes)
  );
  assert.strictEqual(
    probeFor(result.probes, 'song_url_v1'),
    '116.25.146.177',
    'default realIP must be injected into song_url_v1, probes: ' + JSON.stringify(result.probes)
  );
}

async function testEnvOverride() {
  const result = await loadServerAndProbe('1.2.3.4');
  assert.strictEqual(result.searchStatus, 200, 'search must return 200 with override');
  assert.strictEqual(
    probeFor(result.probes, 'cloudsearch'),
    '1.2.3.4',
    'MINERADIO_NETEASE_REAL_IP must override the default, probes: ' + JSON.stringify(result.probes)
  );
}

async function testDisableByEmptyEnv() {
  const result = await loadServerAndProbe('');
  assert.strictEqual(result.searchStatus, 200, 'search must return 200 with injection disabled');
  assert.strictEqual(
    probeFor(result.probes, 'cloudsearch'),
    '(none)',
    'empty MINERADIO_NETEASE_REAL_IP must disable injection, probes: ' + JSON.stringify(result.probes)
  );
}

(async () => {
  await testDefaultInjection();
  await testEnvOverride();
  await testDisableByEmptyEnv();
  console.log('netease-realip-injection: all checks passed');
  process.exit(0);
})().catch((err) => {
  console.error('netease-realip-injection: FAILED —', err.message);
  process.exit(1);
});
