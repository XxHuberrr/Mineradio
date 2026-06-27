const test = require('node:test');
const assert = require('node:assert/strict');

const {
  directMetadataCandidates,
  assertMirrorPayloadVerifiable,
} = require('../lib/security/update-trust-policy');

test('metadata candidates contain only the direct GitHub URL', () => {
  const url = 'https://github.com/XxHuberrr/Mineradio/releases/latest/download/latest.yml';
  assert.deepEqual(directMetadataCandidates(url), [{
    url,
    label: 'GitHub 直连',
    mirrored: false,
  }]);
});

test('allows direct GitHub API metadata URLs', () => {
  const url = 'https://api.github.com/repos/XxHuberrr/Mineradio/releases/latest';
  assert.equal(directMetadataCandidates(url)[0].url, url);
});

test('rejects non-HTTPS and non-GitHub metadata origins', () => {
  assert.throws(
    () => directMetadataCandidates('https://mirror.example/latest.yml'),
    /UPDATE_METADATA_ORIGIN_DENIED/,
  );
  assert.throws(
    () => directMetadataCandidates('http://github.com/example/latest.yml'),
    /UPDATE_METADATA_ORIGIN_DENIED/,
  );
});

test('requires a digest before using a mirrored payload', () => {
  assert.throws(
    () => assertMirrorPayloadVerifiable({ mirrored: true }, {}),
    /MIRROR_HASH_MISSING/,
  );
  assert.doesNotThrow(() => assertMirrorPayloadVerifiable(
    { mirrored: true },
    { sha256: 'abc' },
  ));
  assert.doesNotThrow(() => assertMirrorPayloadVerifiable(
    { mirrored: true },
    { sha512: 'def' },
  ));
});

test('allows direct payloads without a digest', () => {
  assert.doesNotThrow(() => assertMirrorPayloadVerifiable(
    { mirrored: false },
    {},
  ));
});
