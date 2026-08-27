const assert = require('assert');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const test = require('node:test');

const ai6666 = require('../ai6666-api');
const api = ai6666._test;

const VALID_KEY = 'hh_' + 'a'.repeat(32);

function withTemporaryConfig(fileContent) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-ai6666-test-'));
  const file = path.join(root, '.ai6666-credentials.json');
  process.env.AI6666_CONFIG_FILE = file;
  if (fileContent) fs.writeFileSync(file, JSON.stringify(fileContent), 'utf8');
  return { root, file };
}

function cleanupEnv() {
  delete process.env.AI6666_CONFIG_FILE;
  delete process.env.MINERADIO_AI6666_CONFIG_FILE;
  delete process.env.AI6666_API_KEY;
  delete process.env.MINERADIO_AI6666_API_KEY;
  ai6666._test.resetAi6666RuntimeStateForTests();
}

function withHttpsMock(requestHandler, task) {
  const original = https.request;
  const calls = [];
  https.request = function mockedRequest(target, options, callback) {
    options = options || {};
    const request = new EventEmitter();
    request._bodyChunks = [];
    const requestBody = () => Buffer.concat(request._bodyChunks).toString('utf8');
    request.write = (chunk) => {
      if (chunk == null) return;
      request._bodyChunks.push(Buffer.from(String(chunk)));
    };
    request.setTimeout = (ms, fn) => {
      if (typeof fn === 'function') {
        request._timeoutTimer = setTimeout(() => {
          clearTimeout(request._timeoutTimer);
          request._timeoutTimer = null;
          fn();
        }, ms);
      }
    };
    request.destroy = (error) => {
      if (request._timeoutTimer) {
        clearTimeout(request._timeoutTimer);
        request._timeoutTimer = null;
      }
      process.nextTick(() => request.emit('error', error || new Error('destroyed')));
    };
    request.end = () => {
      const safeUrl = String(target);
      calls.push({ url: safeUrl, options, body: requestBody() });
      Promise.resolve().then(() => requestHandler({
        url: safeUrl,
        options,
        body: requestBody(),
      })).then((result) => {
        if (request._timeoutTimer) {
          clearTimeout(request._timeoutTimer);
          request._timeoutTimer = null;
        }
        if (result && result.error) throw result.error;
        result = result || {};
        const response = new EventEmitter();
        response.statusCode = Number(result.statusCode || 200);
        response.headers = result.headers || {};
        callback(response);
        const send = () => {
          if (result.body != null) {
            const text = typeof result.body === 'string' ? result.body : JSON.stringify(result.body);
            response.emit('data', Buffer.from(text));
          }
          response.emit('end');
        };
        if (result.delayMs) setTimeout(send, result.delayMs);
        else process.nextTick(send);
      }).catch((error) => request.emit('error', error));
    };
    return request;
  };

  return Promise.resolve().then(task).finally(() => {
    https.request = original;
    return { calls };
  });
}

test('AI6666 key format/save/read/clear and DTO excludes api key', async () => {
  const { root, file } = withTemporaryConfig();
  try {
    const normalized = ai6666._test.normalizeApiKey('  hh_' + 'a'.repeat(32) + '  ');
    assert.strictEqual(normalized, VALID_KEY);
    assert.strictEqual(ai6666._test.normalizeApiKey('invalid'), '');

    await assert.rejects(
      (async () => {
        ai6666.saveAi6666Config({ apiKey: 'bad' });
      })(),
      error => {
        assert.strictEqual(error.code, 'AI6666_API_KEY_INVALID');
        return true;
      }
    );

    const saved = ai6666.saveAi6666Config({ apiKey: VALID_KEY });
    assert.strictEqual(saved.provider, 'ai6666');
    assert.ok(saved.ok);
    assert.ok(saved.saved);
    assert.strictEqual(saved.configured, true);
    assert.ok(!Object.prototype.hasOwnProperty.call(saved, 'apiKey'));

    const filePayload = api.readAi6666FileConfig();
    assert.strictEqual(filePayload.apiKey, VALID_KEY);
    assert.strictEqual(filePayload.exists, true);
    assert.strictEqual(filePayload.invalid, false);
    assert.strictEqual(filePayload.file, file);

    const config = ai6666.getAi6666Config();
    assert.strictEqual(config.configured, true);
    assert.strictEqual(config.source, 'file');
    assert.strictEqual(config.apiKey, VALID_KEY);

    const cleared = ai6666.clearAi6666Config();
    assert.strictEqual(cleared.provider, 'ai6666');
    assert.strictEqual(cleared.configured, false);
    assert.ok(!Object.prototype.hasOwnProperty.call(cleared, 'apiKey'));
    assert.strictEqual(fs.existsSync(file), false);
    assert.strictEqual(ai6666.getAi6666Config().configured, false);
  } finally {
    cleanupEnv();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('AI6666 Authorization header uses Bearer and my-songs mapping works', async () => {
  const { root } = withTemporaryConfig({ ai6666: { apiKey: VALID_KEY } });
  try {
    let songsCall;
    await withHttpsMock(({ options }) => {
      songsCall = {
        method: options.method,
        auth: options.headers && (options.headers.Authorization || options.headers.authorization),
      };
      return {
        body: {
          page: 1,
          page_size: 20,
          total: 1,
          songs: [{
            id: 'song-1',
            title: 'Hello',
            author: { id: 'author-1', nickname: 'Alice', avatar: 'a' },
            duration: 180,
            tags: 'tag1,tag2',
            created_at: '2024-01-01',
          }],
        },
      };
    }, async () => {
      const result = await ai6666.handleAi6666Songs({ tab: 'mine', page: 1, pageSize: 20 });
      assert.strictEqual(songsCall.method, 'GET');
      assert.strictEqual(songsCall.auth, `Bearer ${VALID_KEY}`);
      assert.strictEqual(result.songs.length, 1);
      const song = result.songs[0];
      assert.strictEqual(song.provider, 'ai6666');
      assert.strictEqual(song.id, 'song-1');
      assert.strictEqual(song.name, 'Hello');
      assert.strictEqual(song.artist, 'Alice');
      assert.strictEqual(song.artistId, 'author-1');
      assert.strictEqual(song.authorAvatar, 'a');
      assert.strictEqual(song.duration, 180);
    });
  } finally {
    cleanupEnv();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('AI6666 search and playlist pagination crosses 50-item boundary', async () => {
  const { root } = withTemporaryConfig({ ai6666: { apiKey: VALID_KEY } });
  try {
    const pageResults = {
      1: Array.from({ length: 50 }, (_, idx) => ({
        id: `search-1-${idx + 1}`,
        title: `Search 1-${idx + 1}`,
        author: { id: 'a', nickname: 'Artist' },
        duration: 60,
      })),
      2: Array.from({ length: 50 }, (_, idx) => ({
        id: `search-2-${idx + 1}`,
        title: `Search 2-${idx + 1}`,
        author: { id: 'a', nickname: 'Artist' },
        duration: 60,
      })),
      3: Array.from({ length: 20 }, (_, idx) => ({
        id: `search-3-${idx + 1}`,
        title: `Search 3-${idx + 1}`,
        author: { id: 'a', nickname: 'Artist' },
        duration: 60,
      })),
    };
    const pageRequests = [];
    await withHttpsMock(({ url }) => {
      const parsed = new URL(url);
      const page = Number(parsed.searchParams.get('page'));
      pageRequests.push(page);
      return {
        body: {
          page,
          page_size: 50,
          total: 120,
          songs: pageResults[page],
        },
      };
    }, async () => {
      const searchResult = await ai6666.handleAi6666Search({ tab: 'mine', offset: 49, limit: 4, query: 'q' });
      assert.ok(Array.isArray(pageRequests) && pageRequests.length >= 2);
      assert.strictEqual(searchResult.songs.length, 4);
      assert.strictEqual(searchResult.songs[0].id, 'search-1-50');
      assert.strictEqual(searchResult.songs[1].id, 'search-2-1');
      assert.strictEqual(searchResult.hasMore, true);
      assert.strictEqual(searchResult.total, 120);

      pageRequests.length = 0;
      const playlistTracks = await ai6666.handleAi6666PlaylistTracks({ tab: 'mine', offset: 49, limit: 52 });
      assert.ok(Array.isArray(pageRequests) && pageRequests.length >= 2);
      assert.strictEqual(playlistTracks.tracks.length, 52);
      assert.strictEqual(playlistTracks.tracks[0].id, 'search-1-50');
      assert.strictEqual(playlistTracks.tracks[1].id, 'search-2-1');
      assert.strictEqual(playlistTracks.hasMore, true);
    });
  } finally {
    cleanupEnv();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('AI6666 detail refreshes playable URL and returns lossless only when available', async () => {
  const { root } = withTemporaryConfig({ ai6666: { apiKey: VALID_KEY } });
  try {
    const responseBySong = new Map([
      ['song-detail', {
        id: 'song-detail',
        playable_url: 'https://cdn.example.com/mp3.mp3',
        wav_ready: true,
        has_wav_access: true,
        wav_url: 'https://cdn.example.com/lossless.wav',
      }],
      ['song-detail-std', {
        id: 'song-detail-std',
        playable_url: 'https://cdn.example.com/mp3.mp3',
      }],
    ]);
    await withHttpsMock(({ url }) => {
      const id = decodeURIComponent(new URL(url).pathname.replace('/ai6api/music/song/', ''));
      const payload = responseBySong.get(id);
      if (!payload) {
        throw new Error('unexpected id');
      }
      return { body: payload };
    }, async () => {
      const lossless = await ai6666.handleAi6666SongUrl({ id: 'song-detail', quality: 'lossless' });
      assert.strictEqual(lossless.playable, true);
      assert.strictEqual(lossless.url, 'https://cdn.example.com/lossless.wav');
      assert.strictEqual(lossless.format, 'wav');
      assert.strictEqual(lossless.quality, 'lossless');

      const standard = await ai6666.handleAi6666SongUrl({ id: 'song-detail-std', quality: 'hires' });
      assert.strictEqual(standard.playable, true);
      assert.strictEqual(standard.url, 'https://cdn.example.com/mp3.mp3');
      assert.strictEqual(standard.format, 'mp3');
    });
  } finally {
    cleanupEnv();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('AI6666 lyric mapping returns LRC/YRC and plain lyric source', async () => {
  const { root } = withTemporaryConfig({ ai6666: { apiKey: VALID_KEY } });
  try {
    let lyricCalls = 0;
    await withHttpsMock(() => {
      lyricCalls += 1;
      if (lyricCalls === 1) {
        return {
          body: {
            id: 'lyric-id',
            duration: 120,
            lrc_lines: [
              { startS: 0, endS: 1.2, text: 'hello world' },
              { startS: 2, endS: 3, text: 'next line' },
            ],
            lrc_synced: [
              { startS: 0.0, endS: 0.5, word: 'hello' },
              { startS: 0.5, endS: 0.9, word: 'world' },
              { startS: 2.0, endS: 2.3, word: 'next' },
            ],
            lyrics: 'plain one',
          },
        };
      }
      return {
        body: {
          id: 'lyric-id',
          duration: 120,
          lyrics: 'only plain',
          lrc_lines: [],
          lrc_synced: [],
        },
      };
    }, async () => {
      const synced = await ai6666.handleAi6666Lyric('lyric-id');
      assert.strictEqual(synced.source, 'ai6666-word-sync');
      assert.strictEqual(synced.plainLyric, 'plain one');
      assert.strictEqual(synced.lyric.includes('[00:00.00]hello world'), true);
      assert.match(synced.yrc, /\[0,\d+\]\(0,500,0\)hello/);
      assert.strictEqual(synced.duration, 120);

      const plain = await ai6666.handleAi6666Lyric('lyric-id');
      assert.strictEqual(plain.source, 'ai6666-plain');
      assert.strictEqual(plain.lyric, '');
      assert.strictEqual(plain.yrc, '');
      assert.strictEqual(plain.plainLyric, 'only plain');
    });
  } finally {
    cleanupEnv();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('AI6666 favorite desired state is idempotent and POST writes are not retried', async () => {
  const { root } = withTemporaryConfig({ ai6666: { apiKey: VALID_KEY } });
  try {
    let calls = 0;
    await withHttpsMock(({ url, options }) => {
      calls += 1;
      if (url.includes('/favorite')) {
        assert.strictEqual(options.method, 'POST');
        return { error: new Error('network retry should not happen') };
      }
      assert.strictEqual(options.headers.Authorization, `Bearer ${VALID_KEY}`);
      return {
        body: {
          song: {
            id: 'fav-id',
            user_favorited: true,
            is_favorite: true,
          },
        },
      };
    }, async () => {
      const idempotent = await ai6666.handleAi6666Favorite('fav-id', true);
      assert.strictEqual(idempotent.changed, false);
      assert.strictEqual(idempotent.userFavorited, true);
      assert.strictEqual(calls, 1);

      calls = 0;
      await withHttpsMock(({ url, options }) => {
        calls += 1;
        if (!url.includes('/favorite')) {
          return { body: { user_favorited: false } };
        }
        if (calls === 2) {
          return { body: { user_favorited: true, favorite_count: 1 } };
        }
        throw new Error('should not be called');
      }, async () => {
        const changed = await ai6666.handleAi6666Favorite('fav-id', true);
        assert.strictEqual(changed.changed, true);
        assert.strictEqual(changed.userFavorited, true);
        assert.strictEqual(changed.success, true);
      });
    });
  } finally {
    cleanupEnv();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('AI6666 GET requests retry on transient errors but POST requests do not retry', async () => {
  const { root } = withTemporaryConfig({ ai6666: { apiKey: VALID_KEY } });
  try {
    let getCalls = 0;
    await withHttpsMock(() => {
      getCalls += 1;
      if (getCalls === 1) {
        return { statusCode: 503, body: { error: 'temporary' } };
      }
      return { body: { total: 0, songs: [] } };
    }, async () => {
      const songs = await ai6666.handleAi6666Songs({ tab: 'mine', page: 1, pageSize: 1 });
      assert.deepStrictEqual(songs.songs, []);
      assert.strictEqual(getCalls, 2);
    });

    let postCalls = 0;
    await withHttpsMock(({ url }) => {
      if (url.includes('/favorite')) {
        postCalls += 1;
        return { statusCode: 503, body: { error: 'temporary' } };
      }
      return { body: { user_favorited: false } };
    }, async () => {
      await assert.rejects(
        () => ai6666.handleAi6666Favorite('fav-retry', true),
        error => error && error.code === 'AI6666_UPSTREAM_ERROR' && error.statusCode === 503
      );
      assert.strictEqual(postCalls, 1, 'POST request must not retry');
    });
  } finally {
    cleanupEnv();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('AI6666 upstream error messages never include API key', async () => {
  const { root } = withTemporaryConfig({ ai6666: { apiKey: VALID_KEY } });
  try {
    await withHttpsMock(() => ({
      statusCode: 401,
      body: { message: `${VALID_KEY} is rejected` },
    }), async () => {
      await assert.rejects(
        () => ai6666.handleAi6666Songs({ tab: 'mine', page: 1, pageSize: 1 }),
        error => {
          assert.strictEqual(error.code, 'AI6666_AUTH_REQUIRED');
          assert.strictEqual(error.statusCode, 401);
          assert.strictEqual(error.message.includes(VALID_KEY), false);
          return true;
        }
      );
    });
  } finally {
    cleanupEnv();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
