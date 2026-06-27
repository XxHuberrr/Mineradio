# Final Hardening Pass Design

Date: 2026-06-27

## Goal

Extend pull request #73 with one final, narrowly scoped hardening pass. The changes address confirmed security and reliability defects without redesigning the application, changing dependencies, or touching the Windows installer.

## Confirmed Problems

1. Several renderer templates interpolate remote image URLs directly into quoted HTML attributes. Existing `escHtml` calls do not escape quotes, so an attacker-controlled URL can break out of `src` and inject attributes.
2. Renderer messages can reach Electron's `shell.openExternal` without a centralized protocol policy. Login popups also need an explicit navigation-domain policy.
3. Closing the desktop lyrics window does not stop its PowerShell mouse-position poller.
4. The dual-account display choice is kept only in memory and is lost after restart.
5. Clicking `+` on a search result while the queue is empty enqueues the item but leaves playback stopped.

## Scope

### 1. Escape dynamic image attributes

Add a small `escAttr(value)` renderer helper that escapes `&`, `<`, `>`, `"`, and `'`. Use it for every dynamic image URL interpolated into an HTML attribute, including locations that currently call `escHtml` in attribute context.

This is a targeted correction to existing string templates. It does not replace the renderer with a new templating system or alter layout and styling.

Verification will cover the helper's escaping behavior and assert that known dynamic image templates no longer insert raw URL expressions into quoted attributes.

### 2. Centralize external URL policy

Add `lib/security/external-url-policy.js` as a dependency-free CommonJS module. It will parse URLs and expose policy functions with these rules:

- `shell.openExternal` accepts only `http:` and `https:` URLs.
- QQ login navigation remains inside the expected QQ Music and QQ authentication domains.
- NetEase login navigation keeps its existing trusted-domain behavior while using the shared protocol validation for URLs opened externally.
- Invalid URLs and active-content protocols such as `javascript:`, `data:`, and `file:` are denied.

The main process will apply the policy at every renderer-to-`openExternal` boundary and in login popup navigation handlers. Denied input is ignored and logged without crashing the application.

Unit tests will exercise accepted protocols, rejected protocols, malformed input, exact trusted hosts, and subdomain-boundary cases.

### 3. Stop the desktop lyrics poller on close

Call the existing idempotent `stopDesktopLyricsMousePoller()` cleanup from the desktop lyrics window's `closed` handler before clearing window state. Existing cleanup during application shutdown remains in place.

A regression test will verify that the window-close lifecycle includes the cleanup call.

### 4. Persist dual-account display preference

Store the preference under a versioned local-storage key. Storage reads and writes will be wrapped in `try/catch` so unavailable or corrupted storage falls back safely.

The stored value represents the user's display preference. Dual-account UI is restored only when both providers are authenticated. Explicitly disabling dual-account mode or logging out clears the preference; transient startup ordering does not.

Tests will cover initialization, persistence on enable and disable, invalid stored values, and the requirement that both accounts be available before rendering dual-account state.

### 5. Play immediately when adding to an empty queue

For both normal song results and podcast results, the `+` action will start the selected item immediately when there is no playable current queue item. When a current queue exists, the existing “insert next” behavior is preserved.

Tests will cover empty-queue playback and non-empty-queue insertion without changing queue ordering semantics.

## Implementation Constraints

- Use Node's built-in test runner and the repository's existing test conventions.
- Write failing regression tests before each production change.
- Keep new security policy logic pure and independently testable.
- Do not add runtime dependencies.
- Do not bump the application version or modify release artifacts.
- Ensure the new `lib/security` module remains included by the current packaging configuration.

## Non-Goals

- Windows uninstall residue: changing installer deletion rules risks deleting user data and requires a maintainer-owned data-retention decision.
- Dependency audit findings: the available automatic changes include incompatible or downgraded packages and need a separate dependency migration.
- Fullscreen layout, intermittent audio, or camera behavior without a stable Windows reproduction.
- Code signing, which requires certificates and maintainer release infrastructure.
- A broad renderer HTML or state-management refactor.

## Acceptance Criteria

- All dynamic image URL attributes use attribute-context escaping.
- No renderer-controlled non-HTTP(S) URL reaches `shell.openExternal`.
- Login popup navigation cannot escape its trusted domain boundary through lookalike hostnames or active-content protocols.
- Closing desktop lyrics stops the PowerShell mouse poller.
- Dual-account display survives restart when both accounts remain authenticated.
- Clicking `+` with an empty queue starts playback; existing non-empty queue behavior remains unchanged.
- Existing tests and all new regression tests pass.
