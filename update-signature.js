'use strict';

const crypto = require('crypto');

const PATCH_ENVELOPE_TYPE = 'mineradio-resource-patch-envelope-v1';
const PATCH_PAYLOAD_TYPE = 'mineradio-resource-patch';
const PATCH_SIGNATURE_ALGORITHM = 'ed25519';

function signatureError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalJson(value) {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw signatureError('PATCH_CANONICALIZATION_FAILED', 'Patch contains a non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (!isPlainObject(value)) throw signatureError('PATCH_CANONICALIZATION_FAILED', 'Patch contains an unsupported value');
  const keys = Object.keys(value).sort();
  return '{' + keys.map(key => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
}

function decodeBase64Signature(value) {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > 512 || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized) || normalized.length % 4 !== 0) {
    throw signatureError('PATCH_SIGNATURE_INVALID', 'Patch signature is not valid base64');
  }
  const decoded = Buffer.from(normalized, 'base64');
  if (!decoded.length || decoded.toString('base64') !== normalized) {
    throw signatureError('PATCH_SIGNATURE_INVALID', 'Patch signature is not canonical base64');
  }
  return decoded;
}

function publicKeyFromConfig(value) {
  const raw = isPlainObject(value) ? value.publicKey || value.key || value.pem : value;
  const publicKey = String(raw || '').trim();
  if (!publicKey) throw signatureError('PATCH_SIGNING_KEY_INVALID', 'Patch signing public key is empty');
  if (/PRIVATE KEY/i.test(publicKey)) {
    throw signatureError('PATCH_SIGNING_KEY_INVALID', 'Private keys must not be configured in the application');
  }
  let key;
  try {
    key = crypto.createPublicKey(publicKey);
  } catch (error) {
    throw signatureError('PATCH_SIGNING_KEY_INVALID', 'Patch signing public key cannot be parsed');
  }
  if (key.type !== 'public' || key.asymmetricKeyType !== PATCH_SIGNATURE_ALGORITHM) {
    throw signatureError('PATCH_SIGNING_KEY_INVALID', 'Patch signing key must be an Ed25519 public key');
  }
  return key;
}

function createPatchSignatureVerifier(configuredKeys) {
  const keys = new Map();
  const source = isPlainObject(configuredKeys) ? configuredKeys : {};
  Object.keys(source).forEach(keyId => {
    const normalizedId = String(keyId || '').trim();
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(normalizedId)) {
      throw signatureError('PATCH_SIGNING_KEY_ID_INVALID', 'Patch signing key id is invalid');
    }
    keys.set(normalizedId, publicKeyFromConfig(source[keyId]));
  });

  function verifyEnvelope(envelope) {
    if (!isPlainObject(envelope) || envelope.type !== PATCH_ENVELOPE_TYPE) {
      throw signatureError('PATCH_SIGNATURE_MISSING', 'Signed patch envelope is required');
    }
    if (!isPlainObject(envelope.payload) || envelope.payload.type !== PATCH_PAYLOAD_TYPE) {
      throw signatureError('INVALID_PATCH_PAYLOAD', 'Patch payload is missing or unsupported');
    }
    if (!isPlainObject(envelope.signature)) {
      throw signatureError('PATCH_SIGNATURE_MISSING', 'Patch signature is missing');
    }

    const algorithm = String(envelope.signature.algorithm || '').trim().toLowerCase();
    const keyId = String(envelope.signature.keyId || '').trim();
    if (algorithm !== PATCH_SIGNATURE_ALGORITHM) {
      throw signatureError('PATCH_SIGNATURE_ALGORITHM_UNSUPPORTED', 'Patch signature algorithm must be Ed25519');
    }
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(keyId)) {
      throw signatureError('PATCH_SIGNING_KEY_ID_INVALID', 'Patch signing key id is invalid');
    }
    if (!keys.size) {
      throw signatureError('PATCH_SIGNING_KEY_UNAVAILABLE', 'No trusted patch signing key is configured');
    }
    const key = keys.get(keyId);
    if (!key) throw signatureError('PATCH_SIGNING_KEY_UNKNOWN', 'Patch signing key is not trusted');

    const signature = decodeBase64Signature(envelope.signature.value);
    const signedBytes = Buffer.from(canonicalJson(envelope.payload), 'utf8');
    let valid = false;
    try {
      valid = crypto.verify(null, signedBytes, key, signature);
    } catch (_) {
      valid = false;
    }
    if (!valid) throw signatureError('PATCH_SIGNATURE_INVALID', 'Patch signature verification failed');
    return {
      payload: envelope.payload,
      signature: { algorithm, keyId },
    };
  }

  return {
    configured: keys.size > 0,
    keyIds: Array.from(keys.keys()),
    verifyEnvelope,
  };
}

module.exports = {
  PATCH_ENVELOPE_TYPE,
  PATCH_PAYLOAD_TYPE,
  PATCH_SIGNATURE_ALGORITHM,
  canonicalJson,
  createPatchSignatureVerifier,
};
