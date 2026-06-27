# Local API and Update Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent cross-site access to Mineradio's localhost APIs, block proxy requests to non-public destinations, and ensure update metadata is trusted only when fetched directly from GitHub.

**Architecture:** Add three focused CommonJS policy modules under `lib/security/` and call them from the existing `server.js` entry points. Keep the UI same-origin, retain digest-verified binary mirrors, and use Node's built-in test runner so policy behavior can be tested without starting Electron.

**Tech Stack:** Node.js CommonJS, `node:test`, Electron's embedded Node runtime, existing HTTP server and update code.

---

## File Map

- Create `lib/security/local-request-policy.js`: Host, Origin, fetch-metadata, and route-method decisions.
- Create `lib/security/proxy-target-policy.js`: public-address classification, DNS validation, and redirect-aware fetch.
- Create `lib/security/update-trust-policy.js`: direct metadata candidate and mirror digest rules.
- Create `test/local-request-policy.test.js`: localhost request and method-policy regression tests.
- Create `test/proxy-target-policy.test.js`: URL, address, DNS, and redirect regression tests.
- Create `test/update-trust-policy.test.js`: update metadata and mirrored-payload trust tests.
- Modify `server.js`: apply policies at the local HTTP boundary, proxy paths, and update metadata path.
- Modify `public/index.html`: send `POST` for state-changing API calls that currently use `GET`.
- Modify `package.json`: add the built-in test runner command.
- Modify `package-lock.json`: keep root script metadata synchronized if npm rewrites it.

### Task 1: Establish the test runner and local request policy

**Files:**
- Modify: `package.json`
- Create: `test/local-request-policy.test.js`
- Create: `lib/security/local-request-policy.js`

- [ ] **Step 1: Add the test command**

Add this entry to `package.json`:

```json
"test": "node --test"
```

- [ ] **Step 2: Write failing request-policy tests**

Create tests that import the not-yet-created module and assert the intended API:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  evaluateLocalRequest,
  requiredMethodFor,
} = require('../lib/security/local-request-policy');

test('allows a same-origin request to the active loopback port', () => {
  assert.deepEqual(evaluateLocalRequest({
    headers: {
      host: '127.0.0.1:34567',
      origin: 'http://127.0.0.1:34567',
      'sec-fetch-site': 'same-origin',
    },
  }, { port: 34567 }), { ok: true });
});

test('rejects a foreign browser origin', () => {
  assert.equal(evaluateLocalRequest({
    headers: { host: '127.0.0.1:34567', origin: 'https://attacker.example' },
  }, { port: 34567 }).error, 'LOCAL_API_ORIGIN_DENIED');
});

test('rejects cross-site fetch metadata even without Origin', () => {
  assert.equal(evaluateLocalRequest({
    headers: { host: '127.0.0.1:34567', 'sec-fetch-site': 'cross-site' },
  }, { port: 34567 }).error, 'LOCAL_API_CROSS_SITE_DENIED');
});

test('rejects a non-loopback Host header', () => {
  assert.equal(evaluateLocalRequest({
    headers: { host: '192.168.1.10:34567' },
  }, { port: 34567 }).error, 'LOCAL_API_HOST_DENIED');
});

test('requires POST for state-changing routes', () => {
  for (const path of [
    '/api/update/download', '/api/update/patch', '/api/qq/login/cookie',
    '/api/qq/logout', '/api/login/cookie', '/api/logout', '/api/song/like',
    '/api/playlist/create', '/api/playlist/add-song',
  ]) assert.equal(requiredMethodFor(path), 'POST', path);
  assert.equal(requiredMethodFor('/api/search'), '');
});
```

- [ ] **Step 3: Run the test and verify RED**

Run: `npm test -- --test-name-pattern='local|origin|cross-site|Host|POST'`

Expected: FAIL with `Cannot find module '../lib/security/local-request-policy'`.

- [ ] **Step 4: Implement the minimal request policy**

Implement `evaluateLocalRequest(req, { port })` with these rules:

```js
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const POST_ROUTES = new Set([
  '/api/update/download', '/api/update/patch', '/api/qq/login/cookie',
  '/api/qq/logout', '/api/login/cookie', '/api/logout', '/api/song/like',
  '/api/playlist/create', '/api/playlist/add-song',
]);

function requiredMethodFor(pathname) {
  return POST_ROUTES.has(String(pathname || '')) ? 'POST' : '';
}
```

Parse bracketed IPv6 Hosts safely, require the active port, allow only loopback hostnames, reject foreign origins, and reject `sec-fetch-site: cross-site`. Export only the two tested functions.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `npm test`

Expected: all request-policy tests PASS.

- [ ] **Step 6: Commit the policy unit**

```bash
git add package.json package-lock.json test/local-request-policy.test.js lib/security/local-request-policy.js
git commit -m "test: define localhost API policy"
```

### Task 2: Enforce the localhost boundary and POST routes

**Files:**
- Modify: `server.js`
- Modify: `public/index.html`
- Modify: `test/local-request-policy.test.js`

- [ ] **Step 1: Add failing integration assertions**

Extend the request-policy test with the complete mutating route list and add a source regression assertion that `server.js` no longer contains `Access-Control-Allow-Origin': '*'`.

```js
const fs = require('node:fs');
const path = require('node:path');

test('server responses do not enable wildcard CORS', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.doesNotMatch(source, /Access-Control-Allow-Origin['"]?\s*:\s*['"]\*['"]/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- --test-name-pattern='wildcard CORS'`

Expected: FAIL because `server.js` still emits wildcard CORS.

- [ ] **Step 3: Integrate request enforcement in `server.js`**

Make these targeted changes:

```js
const { evaluateLocalRequest, requiredMethodFor } = require('./lib/security/local-request-policy');
const HOST = process.env.HOST || '127.0.0.1';
```

At the top of the request handler, after parsing `pn`:

```js
const access = evaluateLocalRequest(req, { port: Number(PORT) });
if (!access.ok) {
  sendJSON(res, { ok: false, error: access.error }, 403);
  return;
}
const requiredMethod = requiredMethodFor(pn);
if (requiredMethod && req.method !== requiredMethod) {
  res.setHeader('Allow', requiredMethod);
  sendJSON(res, { ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
  return;
}
```

Remove wildcard CORS from `sendJSON`, audio responses, and cover responses.

- [ ] **Step 4: Preserve UI behavior by updating callers**

Find each frontend call to a newly POST-only route and set `method: 'POST'`. Preserve existing headers and bodies. In particular, update logout and update-download/update-patch calls that currently rely on GET.

- [ ] **Step 5: Run tests and syntax checks**

Run:

```bash
npm test
node --check server.js
node --check lib/security/local-request-policy.js
```

Expected: all tests PASS and syntax checks exit 0.

- [ ] **Step 6: Commit the boundary enforcement**

```bash
git add server.js public/index.html test/local-request-policy.test.js
git commit -m "fix: restrict localhost API access"
```

### Task 3: Block SSRF in media proxies

**Files:**
- Create: `test/proxy-target-policy.test.js`
- Create: `lib/security/proxy-target-policy.js`
- Modify: `server.js`

- [ ] **Step 1: Write failing address and redirect tests**

Tests must cover public acceptance and unsafe rejection:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isPublicAddress,
  assertSafeProxyUrl,
  safeFetch,
} = require('../lib/security/proxy-target-policy');

test('classifies private and special-purpose addresses as unsafe', () => {
  for (const address of [
    '0.0.0.0', '127.0.0.1', '10.0.0.1', '100.64.0.1', '169.254.1.1',
    '172.16.0.1', '192.168.1.1', '::', '::1', 'fc00::1', 'fe80::1',
  ]) assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress('1.1.1.1'), true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
});

test('rejects a hostname resolving to a private address', async () => {
  await assert.rejects(
    assertSafeProxyUrl('https://media.example/song.mp3', {
      lookup: async () => [{ address: '127.0.0.1', family: 4 }],
    }),
    /PROXY_TARGET_PRIVATE/,
  );
});

test('revalidates redirect destinations', async () => {
  const fetchImpl = async (url) => ({
    status: 302,
    headers: new Map([['location', 'http://127.0.0.1/internal']]),
  });
  await assert.rejects(safeFetch('https://media.example/song', {}, {
    fetchImpl,
    lookup: async () => [{ address: '1.1.1.1', family: 4 }],
  }), /PROXY_TARGET_PRIVATE/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test test/proxy-target-policy.test.js`

Expected: FAIL because `proxy-target-policy.js` does not exist.

- [ ] **Step 3: Implement destination validation**

Use `node:net` and `node:dns/promises`:

```js
async function assertSafeProxyUrl(input, options = {}) {
  const url = new URL(String(input || ''));
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('PROXY_TARGET_INVALID');
  }
  if (url.hostname.toLowerCase() === 'localhost') throw new Error('PROXY_TARGET_PRIVATE');
  const addresses = net.isIP(stripIpv6Brackets(url.hostname))
    ? [{ address: stripIpv6Brackets(url.hostname) }]
    : await (options.lookup || dns.lookup)(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) {
    throw new Error('PROXY_TARGET_PRIVATE');
  }
  return url;
}
```

Implement `safeFetch` with `redirect: 'manual'`, a maximum of five redirects, relative `Location` support, and validation before every request.

- [ ] **Step 4: Integrate safe fetches**

Replace direct `fetch(audioUrl, ...)` and cover-proxy fetches with `safeFetch`. Do not apply the media proxy policy to fixed first-party weather, GitHub, NetEase, or QQ API URLs.

- [ ] **Step 5: Run tests and reproduce the old SSRF path**

Run:

```bash
npm test
node --check lib/security/proxy-target-policy.js
```

Then start the isolated server with temporary Cookie paths and verify `/api/audio?url=http://127.0.0.1:<port>/api/app/version` returns `400` rather than the internal JSON.

- [ ] **Step 6: Commit SSRF protection**

```bash
git add server.js lib/security/proxy-target-policy.js test/proxy-target-policy.test.js
git commit -m "fix: block private media proxy targets"
```

### Task 4: Trust update metadata only from GitHub

**Files:**
- Create: `test/update-trust-policy.test.js`
- Create: `lib/security/update-trust-policy.js`
- Modify: `server.js`

- [ ] **Step 1: Write failing update trust tests**

```js
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

test('rejects non-GitHub metadata origins', () => {
  assert.throws(() => directMetadataCandidates('https://mirror.example/latest.yml'), /UPDATE_METADATA_ORIGIN_DENIED/);
});

test('requires a digest before using a mirrored payload', () => {
  assert.throws(() => assertMirrorPayloadVerifiable({ mirrored: true }, {}), /MIRROR_HASH_MISSING/);
  assert.doesNotThrow(() => assertMirrorPayloadVerifiable({ mirrored: true }, { sha256: 'abc' }));
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test test/update-trust-policy.test.js`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the trust policy**

Allow only HTTPS metadata URLs on `github.com` and `api.github.com`. Return one direct, non-mirrored candidate. Preserve mirror payloads only when `sha256` or `sha512` exists.

- [ ] **Step 4: Integrate the trust policy**

Use `directMetadataCandidates(latestYmlUrl)` inside `fetchLatestYmlUpdateInfo`. Replace the body of `ensureMirrorCanBeVerified` with `assertMirrorPayloadVerifiable(candidate, job)`. Keep the GitHub API request direct.

- [ ] **Step 5: Run tests and syntax checks**

Run:

```bash
npm test
node --check server.js
node --check lib/security/update-trust-policy.js
```

Expected: all tests PASS and syntax checks exit 0.

- [ ] **Step 6: Commit update trust hardening**

```bash
git add server.js lib/security/update-trust-policy.js test/update-trust-policy.test.js
git commit -m "fix: require direct update metadata"
```

### Task 5: Final verification and PR preparation

**Files:**
- Modify: `README.md` only if a short localhost security note is needed after implementation review.
- Inspect: all files changed on the branch.

- [ ] **Step 1: Install exactly locked dependencies**

Run: `npm ci`

Expected: exit 0. Record existing audit findings separately; do not force an incompatible dependency downgrade in this PR.

- [ ] **Step 2: Run the complete verification suite**

```bash
npm test
node --check server.js
node --check desktop/main.js
node --check desktop/preload.js
node --check lib/security/local-request-policy.js
node --check lib/security/proxy-target-policy.js
node --check lib/security/update-trust-policy.js
git diff --check origin/main...HEAD
```

Expected: every command exits 0.

- [ ] **Step 3: Re-run security PoCs**

With a temporary local server and empty Cookie files, verify:

- foreign Origin returns `403`;
- `Sec-Fetch-Site: cross-site` returns `403`;
- non-loopback Host returns `403`;
- `GET /api/logout` returns `405`;
- loopback audio proxy target returns `400`;
- same-origin `GET /api/app/version` still returns `200`;
- same-origin search and normal public media proxy requests remain reachable.

- [ ] **Step 4: Review scope and branch diff**

Run:

```bash
git status -sb
git diff --stat origin/main...HEAD
git diff origin/main...HEAD
```

Confirm no installer deletion behavior, account UI, playback selection, visual code, release version, or dependency major version changed.

- [ ] **Step 5: Push and open a Draft PR**

Push `codex/harden-local-api-updates` to the authenticated user's fork and open a Draft PR against `XxHuberrr/Mineradio:main`. The PR description must include confirmed PoCs, root cause, changes, compatibility impact, tests, and the intentionally deferred installer/dependency work.
