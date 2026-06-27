# Final Hardening Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the five approved security and reliability fixes in pull request #73 without dependencies, release changes, or unrelated refactoring.

**Architecture:** Keep reusable URL trust decisions in a pure CommonJS security module and make the smallest possible edits to Electron lifecycle handlers and the existing inline renderer. Renderer regressions are tested by extracting focused functions into a VM and by source-level assertions for security-sensitive integration points.

**Tech Stack:** Electron, browser JavaScript, CommonJS, Node.js built-in test runner (`node:test`)

---

## File Map

- Create `lib/security/external-url-policy.js`: parse external URLs and enforce protocol and login-host allowlists.
- Create `test/external-url-policy.test.js`: unit tests for protocols, malformed URLs, exact hosts, subdomains, and lookalikes.
- Create `test/frontend-hardening.test.js`: renderer escaping, dual-account persistence, and empty-queue regression coverage.
- Create `test/desktop-lifecycle.test.js`: source integration checks for Electron URL handling and poller cleanup.
- Modify `desktop/main.js`: consume the external URL policy and stop the lyrics poller on window close.
- Modify `public/index.html`: add attribute escaping, persist dual-account preference, and play empty-queue additions immediately.

### Task 1: External URL and Login Navigation Policy

**Files:**
- Create: `lib/security/external-url-policy.js`
- Create: `test/external-url-policy.test.js`

- [ ] **Step 1: Write the failing policy tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isSafeExternalUrl,
  isTrustedLoginUrl,
} = require('../lib/security/external-url-policy');

test('allows only HTTP and HTTPS external URLs', () => {
  assert.equal(isSafeExternalUrl('https://example.com/path'), true);
  assert.equal(isSafeExternalUrl('http://example.com/path'), true);
  assert.equal(isSafeExternalUrl('javascript:alert(1)'), false);
  assert.equal(isSafeExternalUrl('data:text/html,test'), false);
  assert.equal(isSafeExternalUrl('file:///tmp/test'), false);
  assert.equal(isSafeExternalUrl('not a url'), false);
});

test('matches trusted login hosts without accepting lookalikes', () => {
  assert.equal(isTrustedLoginUrl('https://y.qq.com/n/ryqq/profile', ['qq.com']), true);
  assert.equal(isTrustedLoginUrl('https://xui.ptlogin2.qq.com/login', ['qq.com']), true);
  assert.equal(isTrustedLoginUrl('https://music.163.com/login', ['163.com']), true);
  assert.equal(isTrustedLoginUrl('https://qq.com.attacker.example/', ['qq.com']), false);
  assert.equal(isTrustedLoginUrl('https://evilqq.com/', ['qq.com']), false);
  assert.equal(isTrustedLoginUrl('javascript:alert(1)', ['qq.com']), false);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test test/external-url-policy.test.js`

Expected: FAIL because `lib/security/external-url-policy.js` does not exist.

- [ ] **Step 3: Implement the minimal pure policy**

```js
function parseHttpUrl(value) {
  try {
    const parsed = new URL(String(value));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed : null;
  } catch (error) {
    return null;
  }
}

function isSafeExternalUrl(value) {
  return !!parseHttpUrl(value);
}

function isTrustedLoginUrl(value, allowedDomains) {
  const parsed = parseHttpUrl(value);
  if (!parsed) return false;
  const hostname = parsed.hostname.toLowerCase();
  return allowedDomains.some((domain) => {
    const normalized = String(domain).toLowerCase();
    return hostname === normalized || hostname.endsWith(`.${normalized}`);
  });
}

module.exports = { isSafeExternalUrl, isTrustedLoginUrl };
```

- [ ] **Step 4: Run the test and verify GREEN**

Run: `node --test test/external-url-policy.test.js`

Expected: all policy tests PASS.

- [ ] **Step 5: Commit the policy**

```bash
git add lib/security/external-url-policy.js test/external-url-policy.test.js
git commit -m "feat: restrict external and login URLs"
```

### Task 2: Apply URL Policy and Desktop Lyrics Cleanup

**Files:**
- Create: `test/desktop-lifecycle.test.js`
- Modify: `desktop/main.js`

- [ ] **Step 1: Write failing integration assertions**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'main.js'), 'utf8');

test('main process imports and applies external URL policy', () => {
  assert.match(source, /require\(['"]\.\.\/lib\/security\/external-url-policy['"]\)/);
  assert.doesNotMatch(source, /shell\.openExternal\(url\)(?!\s*\.catch)/);
  assert.match(source, /isTrustedLoginUrl\(url, QQ_LOGIN_DOMAINS\)/);
  assert.match(source, /isTrustedLoginUrl\(url, NETEASE_LOGIN_DOMAINS\)/);
});

test('desktop lyrics window close stops its mouse poller', () => {
  const closedHandler = source.match(/desktopLyricsWindow\.on\('closed', \(\) => \{([\s\S]*?)\n  \}\);/);
  assert.ok(closedHandler);
  assert.match(closedHandler[1], /stopDesktopLyricsMousePoller\(\)/);
});
```

- [ ] **Step 2: Run the integration test and verify RED**

Run: `node --test test/desktop-lifecycle.test.js`

Expected: FAIL because the policy import and close-handler cleanup are absent.

- [ ] **Step 3: Apply the policy at every open boundary**

Import `isSafeExternalUrl` and `isTrustedLoginUrl`, define immutable domain lists for NetEase (`163.com`, `netease.com`) and QQ (`qq.com`), and route every `shell.openExternal(url)` call through:

```js
function openSafeExternalUrl(url) {
  if (!isSafeExternalUrl(url)) {
    console.warn('Blocked unsafe external URL');
    return;
  }
  shell.openExternal(url).catch((error) => {
    console.warn('External URL open failed:', error.message);
  });
}
```

For each login popup, load the URL inside the login window only when `isTrustedLoginUrl(url, ..._LOGIN_DOMAINS)` is true. Otherwise call `openSafeExternalUrl(url)`, which denies active-content protocols.

In the desktop lyrics close handler, add cleanup before state reset:

```js
desktopLyricsWindow.on('closed', () => {
  stopDesktopLyricsMousePoller();
  desktopLyricsWindow = null;
  desktopLyricsMouseIgnored = null;
});
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `node --test test/external-url-policy.test.js test/desktop-lifecycle.test.js`

Expected: all focused tests PASS.

- [ ] **Step 5: Commit Electron integration**

```bash
git add desktop/main.js test/desktop-lifecycle.test.js
git commit -m "fix: harden external navigation lifecycle"
```

### Task 3: Escape Dynamic Image Attributes

**Files:**
- Create: `test/frontend-hardening.test.js`
- Modify: `public/index.html`

- [ ] **Step 1: Write failing escaping tests**

Read `public/index.html`, extract the `escAttr` function body into a VM context, and assert:

```js
assert.equal(escAttr('https://img.test/a?x=" onerror="alert(1)'),
  'https://img.test/a?x=&quot; onerror=&quot;alert(1)');
assert.equal(escAttr("<&>'"), '&lt;&amp;&gt;&#39;');
```

Also assert that every dynamic image `src` expression in renderer string templates is wrapped in `escAttr(...)`, including the account-avatar templates near `renderTopAccountPill()` and `renderUserBtn()`.

- [ ] **Step 2: Run the frontend test and verify RED**

Run: `node --test test/frontend-hardening.test.js`

Expected: FAIL because `escAttr` is not defined and raw dynamic `src` expressions remain.

- [ ] **Step 3: Add attribute-context escaping and update image templates**

Add beside `escHtml`:

```js
function escAttr(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

Wrap every remote or data-derived image URL inserted into an HTML string, for example:

```js
'<img src="' + escAttr(thumb) + '" alt="">'
'<img id="user-avatar" src="' + escAttr(providerAvatarSrc(activeAccountProvider, st)) + '">'
```

Direct DOM property assignments such as `avatar.src = value` do not require HTML escaping and remain unchanged.

- [ ] **Step 4: Run the frontend test and verify GREEN**

Run: `node --test test/frontend-hardening.test.js`

Expected: escaping tests and template assertions PASS.

- [ ] **Step 5: Commit renderer escaping**

```bash
git add public/index.html test/frontend-hardening.test.js
git commit -m "fix: escape renderer image attributes"
```

### Task 4: Persist Dual-Account Preference

**Files:**
- Modify: `test/frontend-hardening.test.js`
- Modify: `public/index.html`

- [ ] **Step 1: Add failing persistence tests**

Extract the preference helpers into a VM with a mock `localStorage`. Verify that stored `1` restores the preference, missing or invalid values return false, storage exceptions return false, and writes use `1`/`0`. Add source assertions that enable, single-provider selection, and logout paths persist their new state.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/frontend-hardening.test.js`

Expected: FAIL because the preference key and helpers do not exist.

- [ ] **Step 3: Add safe storage helpers and wire state transitions**

```js
var DUAL_ACCOUNT_STORE_KEY = 'mineradio-dual-account-mode-v1';
function loadDualAccountPreference() {
  try { return localStorage.getItem(DUAL_ACCOUNT_STORE_KEY) === '1'; }
  catch (e) { return false; }
}
function saveDualAccountPreference(enabled) {
  try { localStorage.setItem(DUAL_ACCOUNT_STORE_KEY, enabled ? '1' : '0'); }
  catch (e) {}
}
var dualAccountMode = loadDualAccountPreference();
```

Call `saveDualAccountPreference(true)` only after both accounts are present and dual mode is enabled. Call `saveDualAccountPreference(false)` when selecting one provider or logging out. Render dual mode only when both providers are logged in:

```js
if (dualAccountMode && hasPlatformLogin('netease') && hasPlatformLogin('qq')) {
  // existing dual-account rendering
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test test/frontend-hardening.test.js`

Expected: all frontend tests PASS.

- [ ] **Step 5: Commit preference persistence**

```bash
git add public/index.html test/frontend-hardening.test.js
git commit -m "fix: persist dual account display"
```

### Task 5: Empty-Queue Search Actions Start Playback

**Files:**
- Modify: `test/frontend-hardening.test.js`
- Modify: `public/index.html`

- [ ] **Step 1: Add failing queue-action tests**

Extract `queueSearchResult` and `queuePodcastProgram` into a VM with spies for playback, queue insertion, and toast calls. Verify that an empty queue calls the relevant play function and does not call `queueSongNext`; verify that a queue with a valid `currentIdx` keeps the existing insert-next behavior.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/frontend-hardening.test.js`

Expected: FAIL because both functions always enqueue.

- [ ] **Step 3: Add the minimal empty-queue branches**

```js
function queueSearchResult(i) {
  var song = playlist[i]; if (!song) return;
  if (!playQueue.length || currentIdx < 0 || currentIdx >= playQueue.length) {
    playSearchResult(i);
    return;
  }
  queueSongNext(song);
  showToast('已设为下一首: ' + song.name);
}

function queuePodcastProgram(i) {
  var item = podcastPrograms[i]; if (!item) return;
  if (!playQueue.length || currentIdx < 0 || currentIdx >= playQueue.length) {
    playPodcastProgram(i);
    return;
  }
  queueSongNext(item);
  showToast('已设为下一首: ' + item.name);
}
```

The current `playPodcastProgram` incorrectly delegates an index to `playSearchResult`, which reads `playlist`. Extract the existing playback body into `playSearchSong(song)`, then make the two index adapters select from their own collections:

```js
function playPodcastProgram(i) {
  var item = podcastPrograms[i]; if (!item) return;
  playSearchSong(item);
}
function playSearchResult(i) {
  var song = playlist[i]; if (!song) return;
  playSearchSong(song);
}
```

`playSearchSong(song)` retains the current home-state reset, queue de-duplication, search-panel close, and `playQueueAt(currentIdx)` behavior. This extraction is limited to making the approved podcast empty-queue path functional.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test test/frontend-hardening.test.js`

Expected: empty queues start playback and non-empty queues still insert next.

- [ ] **Step 5: Commit queue behavior**

```bash
git add public/index.html test/frontend-hardening.test.js
git commit -m "fix: play additions when queue is empty"
```

### Task 6: Full Verification and PR Update

**Files:**
- Modify only if a verification failure identifies an in-scope regression.

- [ ] **Step 1: Run the complete test suite**

Run: `npm test`

Expected: all tests PASS with zero failures.

- [ ] **Step 2: Run syntax and whitespace checks**

Run: `node --check desktop/main.js && node --check lib/security/external-url-policy.js && git diff --check`

Expected: all commands exit 0 with no output.

- [ ] **Step 3: Inspect the final diff and scope**

Run: `git status --short && git diff fork/codex/harden-local-api-updates...HEAD --stat`

Expected: only the approved security, lifecycle, preference, queue, tests, and documentation files are present.

- [ ] **Step 4: Push and update pull request #73**

```bash
git push fork codex/harden-local-api-updates
gh pr edit 73 --repo XxHuberrr/Mineradio --ready
```

Expected: the branch push succeeds and PR #73 becomes ready for review.
