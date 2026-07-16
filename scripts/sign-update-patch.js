'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  PATCH_ENVELOPE_TYPE,
  PATCH_PAYLOAD_TYPE,
  canonicalJson,
} = require('../update-signature');

function readArguments(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) throw new Error('Missing value for --' + key);
    out[key] = value;
    i += 1;
  }
  return out;
}

function atomicWriteJson(filePath, value) {
  const target = path.resolve(filePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = target + '.tmp-' + process.pid;
  try {
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', 'utf8');
    fs.renameSync(temporary, target);
  } finally {
    try { fs.unlinkSync(temporary); } catch (_) {}
  }
}

function main() {
  const args = readArguments(process.argv.slice(2));
  const inputPath = args.input;
  const outputPath = args.output;
  const privateKeyPath = args.key || process.env.MINERADIO_UPDATE_PATCH_PRIVATE_KEY_FILE;
  const keyId = String(args['key-id'] || process.env.MINERADIO_UPDATE_PATCH_KEY_ID || '').trim();
  if (!inputPath || !outputPath || !privateKeyPath || !keyId) {
    throw new Error('Usage: npm run sign:patch -- --input unsigned.json --output signed.patch.json --key /secure/private.pem --key-id release-2026');
  }
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(keyId)) throw new Error('Invalid patch signing key id');

  const payload = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8').replace(/^\uFEFF/, ''));
  if (!payload || payload.type !== PATCH_PAYLOAD_TYPE) {
    throw new Error('Input must be an unsigned mineradio-resource-patch payload');
  }
  const privatePem = fs.readFileSync(path.resolve(privateKeyPath), 'utf8');
  const privateKey = crypto.createPrivateKey(privatePem);
  if (privateKey.type !== 'private' || privateKey.asymmetricKeyType !== 'ed25519') {
    throw new Error('Patch signing key must be an Ed25519 private key');
  }

  const signature = crypto.sign(null, Buffer.from(canonicalJson(payload), 'utf8'), privateKey).toString('base64');
  atomicWriteJson(outputPath, {
    type: PATCH_ENVELOPE_TYPE,
    payload,
    signature: {
      algorithm: 'ed25519',
      keyId,
      value: signature,
    },
  });
  console.log('[patch-sign] Signed patch written:', path.resolve(outputPath));
}

try {
  main();
} catch (error) {
  console.error('[patch-sign]', error.message || error);
  process.exitCode = 1;
}
