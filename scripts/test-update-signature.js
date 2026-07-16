'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  PATCH_ENVELOPE_TYPE,
  PATCH_PAYLOAD_TYPE,
  canonicalJson,
  createPatchSignatureVerifier,
} = require('../update-signature');

function errorCode(code) {
  return error => error && error.code === code;
}

function sourceSection(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notStrictEqual(start, -1, 'Missing server integration marker: ' + startMarker);
  assert.notStrictEqual(end, -1, 'Missing server integration marker: ' + endMarker);
  return source.slice(start, end);
}

function assertVerificationBeforeApply(section, label) {
  const verifyAt = section.indexOf('verifyAndNormalizePatchPackage(raw)');
  const applyAt = section.indexOf('PATCH_FILE_APPLIER.applyFiles(job.id, patch.files)');
  assert.notStrictEqual(verifyAt, -1, label + ' must verify the signed envelope');
  assert.notStrictEqual(applyAt, -1, label + ' must apply patch files transactionally');
  assert.ok(verifyAt < applyAt, label + ' must verify the signature before applying files');
}

function assertServerIntegrationGuards() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const verifySection = sourceSection(
    source,
    'function verifyAndNormalizePatchPackage(raw)',
    'function normalizePatchPayload(payload)'
  );
  assert.ok(
    verifySection.indexOf('PATCH_SIGNATURE_VERIFIER.verifyEnvelope(envelope)')
      < verifySection.indexOf('normalizePatchPayload(verified.payload)'),
    'Patch signature verification must happen before payload normalization'
  );

  assertVerificationBeforeApply(sourceSection(
    source,
    'async function downloadAndApplyPatch(job)',
    'async function downloadPatchBufferFromCandidate(job, candidate, index, total)'
  ), 'Direct patch application');
  assertVerificationBeforeApply(sourceSection(
    source,
    'async function downloadAndApplyPatchWithMirrors(job)',
    'function startUpdatePatchJob(info)'
  ), 'Mirrored patch application');

  const manifestSection = sourceSection(
    source,
    'function normalizeManifestUpdateInfo(data)',
    'async function readUpdateManifest(ref)'
  );
  assert.match(
    manifestSection,
    /patchAvailable:\s*!!\(PATCH_SIGNATURE_VERIFIER\.configured\s*&&\s*patchInfo/,
    'Manifest patch availability must require a configured signing key'
  );

  const githubSection = sourceSection(
    source,
    'async function fetchLatestUpdateInfo()',
    'function safeUpdateFileName(name, version)'
  );
  assert.match(
    githubSection,
    /patchAvailable:\s*!!\(PATCH_SIGNATURE_VERIFIER\.configured\s*&&\s*patch/,
    'GitHub patch availability must require a configured signing key'
  );

  const startSection = sourceSection(
    source,
    'function startUpdatePatchJob(info)',
    'function readRequestBody(req)'
  );
  assert.match(
    startSection,
    /if \(!PATCH_SIGNATURE_VERIFIER\.configured\) return \{ ok: false, error: 'PATCH_SIGNING_KEY_UNAVAILABLE' \};/,
    'Patch API must reject jobs when no trusted signing key is configured'
  );
}

function signPayload(payload, privateKey, keyId) {
  return {
    type: PATCH_ENVELOPE_TYPE,
    payload,
    signature: {
      algorithm: 'ed25519',
      keyId,
      value: crypto.sign(null, Buffer.from(canonicalJson(payload), 'utf8'), privateKey).toString('base64'),
    },
  };
}

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
const verifier = createPatchSignatureVerifier({ 'release-2026': publicPem });
const payload = {
  type: PATCH_PAYLOAD_TYPE,
  from: '1.1.1',
  to: '1.1.2',
  restartRequired: true,
  files: [
    {
      path: 'server.js',
      sha256: '00'.repeat(32),
      contentBase64: Buffer.from('test content').toString('base64'),
    },
  ],
};

assert.strictEqual(verifier.configured, true);
assert.deepStrictEqual(verifier.keyIds, ['release-2026']);
const signed = signPayload(payload, privateKey, 'release-2026');
const verified = verifier.verifyEnvelope(signed);
assert.deepStrictEqual(verified.payload, payload);
assert.deepStrictEqual(verified.signature, { algorithm: 'ed25519', keyId: 'release-2026' });

const reorderedPayload = {
  files: payload.files,
  restartRequired: true,
  to: '1.1.2',
  from: '1.1.1',
  type: PATCH_PAYLOAD_TYPE,
};
assert.strictEqual(canonicalJson(reorderedPayload), canonicalJson(payload));
assert.doesNotThrow(() => verifier.verifyEnvelope({ ...signed, payload: reorderedPayload }));

const tampered = JSON.parse(JSON.stringify(signed));
tampered.payload.to = '9.9.9';
assert.throws(() => verifier.verifyEnvelope(tampered), errorCode('PATCH_SIGNATURE_INVALID'));

assert.throws(() => verifier.verifyEnvelope(payload), errorCode('PATCH_SIGNATURE_MISSING'));
assert.throws(
  () => verifier.verifyEnvelope({ ...signed, signature: { ...signed.signature, keyId: 'unknown' } }),
  errorCode('PATCH_SIGNING_KEY_UNKNOWN')
);
assert.throws(
  () => verifier.verifyEnvelope({ ...signed, signature: { ...signed.signature, algorithm: 'rsa-sha256' } }),
  errorCode('PATCH_SIGNATURE_ALGORITHM_UNSUPPORTED')
);
assert.throws(
  () => createPatchSignatureVerifier({ 'release-2026': privateKey.export({ type: 'pkcs8', format: 'pem' }) }),
  errorCode('PATCH_SIGNING_KEY_INVALID')
);

const unconfigured = createPatchSignatureVerifier({});
assert.strictEqual(unconfigured.configured, false);
assert.throws(() => unconfigured.verifyEnvelope(signed), errorCode('PATCH_SIGNING_KEY_UNAVAILABLE'));

const signerRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-patch-sign-test-'));
try {
  const inputPath = path.join(signerRoot, 'unsigned.json');
  const outputPath = path.join(signerRoot, 'signed.patch.json');
  const privateKeyPath = path.join(signerRoot, 'private.pem');
  fs.writeFileSync(inputPath, JSON.stringify(payload));
  fs.writeFileSync(privateKeyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  const result = spawnSync(process.execPath, [
    path.join(__dirname, 'sign-update-patch.js'),
    '--input', inputPath,
    '--output', outputPath,
    '--key', privateKeyPath,
    '--key-id', 'release-2026',
  ], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  const signedByTool = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.deepStrictEqual(verifier.verifyEnvelope(signedByTool).payload, payload);
} finally {
  fs.rmSync(signerRoot, { recursive: true, force: true });
}

assertServerIntegrationGuards();

console.log('[update-signature-test] Signed patch verification, rejection paths and server integration guards passed.');
