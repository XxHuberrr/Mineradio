# Local API and Update Security Design

## Goal

Harden Mineradio's localhost HTTP service and update metadata flow without changing music playback behavior, visual behavior, account UX, or the install-directory safety rules introduced in v1.1.1.

## Confirmed Risks

1. The local API returns `Access-Control-Allow-Origin: *` and accepts cross-site browser requests.
2. State-changing routes do not consistently require `POST`, so cross-site `GET` requests can trigger actions such as logout or update download.
3. The audio and cover proxy paths accept arbitrary remote URLs and can fetch loopback or private-network resources.
4. `server.js` defaults to `0.0.0.0` when started outside Electron, exposing account-backed APIs to the local network.
5. When GitHub API access fails, update metadata can be fetched through the same third-party mirrors used for binaries. A compromised mirror could replace both metadata and payload.

## Scope

### Local service boundary

- Change the default host to `127.0.0.1` while preserving explicit `HOST` overrides for development.
- Validate the HTTP `Host` header against the active loopback host and port.
- Reject requests carrying a non-local `Origin`.
- Reject browser requests with `Sec-Fetch-Site: cross-site`.
- Remove wildcard CORS response headers. The application UI is same-origin and does not require CORS.
- Return a JSON `403` response for rejected API requests without exposing account data.

Requests without browser origin metadata remain allowed when they target the valid loopback host. This preserves local diagnostics and avoids treating local command-line access as a security boundary.

### HTTP method enforcement

Introduce a small route-method policy for state-changing API endpoints. These endpoints will require `POST`; unsupported methods will return `405` with an `Allow: POST` header.

The policy covers account-cookie import, logout, update download/apply, beat-map writes, like operations, playlist creation, and playlist mutation. Read-only endpoints remain `GET` compatible.

### Proxy destination validation

- Accept only `http:` and `https:` proxy targets.
- Reject `localhost`, loopback addresses, unspecified addresses, link-local ranges, RFC 1918 IPv4 ranges, carrier-grade NAT, and IPv6 unique-local ranges.
- Resolve DNS names before fetching and reject the request if any resolved address is non-public.
- Validate every redirect target instead of allowing `fetch` to follow redirects without inspection.
- Apply the same destination policy to audio and cover proxy requests.

The validator will not use a narrow music-domain allowlist because Mineradio receives media from multiple CDN families and is designed to add providers later.

### Update metadata trust

- Fetch GitHub Releases API metadata directly from GitHub.
- Fetch fallback `latest.yml` directly from GitHub with mirrors disabled.
- Continue allowing mirrors for installer and patch payloads only when a digest from direct metadata is present.
- Preserve the existing digest, size, cache-reuse, and invalid-file quarantine behavior.

If direct metadata cannot be obtained, update discovery will fail closed and show the existing network error state. It will not trust mirror-provided metadata.

## Structure

Create focused CommonJS modules under `lib/security/`:

- `local-request-policy.js`: loopback host/origin checks, fetch-metadata checks, and route-method policy.
- `proxy-target-policy.js`: URL validation, DNS classification, and redirect-aware safe fetching.

`server.js` will call these modules near the HTTP entry point and from the cover/audio proxy paths. Update candidate construction remains in `server.js`, with metadata callers explicitly disabling mirrors.

This keeps security rules testable without requiring `server.js`, which starts a live server as a module side effect.

## Error Handling

- Local request policy rejection: `403` JSON with a stable error code.
- Wrong method: `405` JSON plus the appropriate `Allow` header.
- Unsafe proxy target: `400` JSON for API-style proxy responses or a plain `400` response for streamed media paths, with no upstream request attempted.
- DNS failure and excessive redirects: existing proxy failure behavior with a non-sensitive error message.
- Direct update metadata failure: existing update fallback UI, without mirror metadata fallback.

Error messages must not include Cookie values, tokens, or complete private URLs.

## Tests

Use Node's built-in `node:test` runner and add `npm test`.

Tests will cover:

- allowed loopback Host and same-origin requests;
- rejected foreign Origin, cross-site fetch metadata, and invalid Host;
- `POST` enforcement for every state-changing route;
- public media URLs accepted;
- IPv4 and IPv6 loopback/private/link-local/CGNAT destinations rejected;
- DNS results containing a private address rejected;
- redirects revalidated before following;
- update metadata candidates excluding mirrors;
- installer/patch mirrors still requiring a trusted digest;
- syntax checks for the modified JavaScript files.

Tests for each behavior will be observed failing before the production implementation is added.

## Explicit Non-Goals

- Do not change the v1.1.1 installer/uninstaller deletion model in this PR.
- Do not introduce recursive deletion under the installation root.
- Do not upgrade `NeteaseCloudMusicApi` or force an incompatible `music-metadata` major version.
- Do not add code signing credentials or alter the release version.
- Do not change UI, playback selection, visual effects, or account presentation.

Installer residue cleanup and dependency vulnerability remediation should be separate changes because both require Windows compatibility testing beyond this focused security boundary.
