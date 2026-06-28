const test = require('node:test');
const assert = require('node:assert/strict');
const {
  LX_API_VERSION,
  parseScriptInfo,
  filterInitPayload,
  selectLxQuality,
  validateActionResponse,
} = require('../../desktop/custom-source/protocol');

test('parses LX metadata with LX length limits', () => {
  const info = parseScriptInfo(`/**
 * @name Test Source
 * @description URL resolver
 * @version 1.2.3
 * @author Mineradio
 * @homepage https://example.com/source
 */`);
  assert.equal(info.name, 'Test Source');
  assert.equal(info.version, '1.2.3');
  assert.equal(LX_API_VERSION, '2.0.0');
});

test('truncates long LX metadata within advertised maximum lengths', () => {
  const info = parseScriptInfo(`/**
 * @name ${'n'.repeat(100)}
 * @description ${'d'.repeat(100)}
 * @version ${'1'.repeat(100)}
 * @author ${'a'.repeat(100)}
 * @homepage https://example.com/${'h'.repeat(1100)}
 */`);
  assert.equal(info.name.length, 24);
  assert.ok(info.name.endsWith('...'));
  assert.ok(info.description.length <= 36);
  assert.ok(info.version.length <= 36);
  assert.ok(info.author.length <= 56);
  assert.ok(info.homepage.length <= 1024);
});

test('filters source actions and quality values to the LX contract', () => {
  const result = filterInitPayload({
    sources: {
      wy: { name: 'WY', type: 'music', actions: ['musicUrl', 'bad'], qualitys: ['128k', 'flac', 'bad'] },
      local: { name: 'Local', type: 'music', actions: ['musicUrl', 'lyric', 'pic'], qualitys: ['128k'] },
    },
  });
  assert.deepEqual(result.sources.wy.actions, ['musicUrl']);
  assert.deepEqual(result.sources.wy.qualitys, ['128k', 'flac']);
  assert.deepEqual(result.sources.local.actions, ['musicUrl', 'lyric', 'pic']);
  assert.deepEqual(result.sources.local.qualitys, []);
});

test('selects the highest declared LX quality not above the Mineradio target', () => {
  assert.equal(selectLxQuality('hires', ['128k', '320k', 'flac']), 'flac');
  assert.equal(selectLxQuality('standard', ['320k']), null);
});

test('validates URL and lyric responses', () => {
  assert.equal(validateActionResponse('musicUrl', 'https://example.com/a.mp3'), 'https://example.com/a.mp3');
  assert.throws(() => validateActionResponse('musicUrl', 'file:///tmp/a.mp3'), /INVALID_RESPONSE/);
  assert.equal(validateActionResponse('lyric', { lyric: '[00:00.00]a' }).lyric, '[00:00.00]a');
});

test('rejects malformed http-ish URL responses', () => {
  assert.equal(validateActionResponse('musicUrl', 'http://example.com/a.mp3'), 'http://example.com/a.mp3');
  assert.equal(validateActionResponse('pic', 'https://example.com/a.jpg'), 'https://example.com/a.jpg');
  assert.throws(() => validateActionResponse('musicUrl', 'https:foo'), /INVALID_RESPONSE/);
  assert.throws(() => validateActionResponse('pic', 'http:/bad'), /INVALID_RESPONSE/);
});

test('rejects musicUrl responses with raw whitespace or control characters', () => {
  for (const value of [
    'https://example.com/a.mp3\n',
    ' https://example.com/a.mp3',
    'https://example.com/a.mp3 ',
    'https://example.com/a.mp3\t',
    'https://example.com/a.mp3\r',
  ]) {
    assert.throws(() => validateActionResponse('musicUrl', value), /INVALID_RESPONSE/);
  }
});
