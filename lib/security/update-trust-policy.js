const TRUSTED_METADATA_HOSTS = new Set(['github.com', 'api.github.com']);

function directMetadataCandidates(input) {
  let url;
  try {
    url = new URL(String(input || ''));
  } catch (_) {
    throw new Error('UPDATE_METADATA_ORIGIN_DENIED');
  }

  if (url.protocol !== 'https:'
    || url.username
    || url.password
    || !TRUSTED_METADATA_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error('UPDATE_METADATA_ORIGIN_DENIED');
  }

  return [{
    url: url.href,
    label: 'GitHub 直连',
    mirrored: false,
  }];
}

function assertMirrorPayloadVerifiable(candidate, digest = {}) {
  if (!candidate || !candidate.mirrored) return;
  if (digest.sha256 || digest.sha512) return;
  throw new Error('MIRROR_HASH_MISSING');
}

module.exports = {
  directMetadataCandidates,
  assertMirrorPayloadVerifiable,
};
