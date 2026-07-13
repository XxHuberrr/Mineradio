# Apple Music Web POC validation

Validated on 2026-07-13 with macOS arm64 and castLabs Electron `42.5.2+wvcus`.

## Automated checks

- `npm test`: 21 tests passed.
- Unknown renderer commands are rejected.
- Renderer events are bounded and credential-shaped fields are removed.
- Apple authentication popup hosts are exact-matched and HTTPS-only.
- Packaging removes machine-wide Electron mirror variables before invoking electron-builder.

## Fresh-session runtime checks

The POC was started with an empty Electron user-data directory and remote diagnostics enabled only for the validation run.

Widevine initialization is lazy: normal Mineradio startup does not call the component manager. The first Apple Music open shares one initialization promise across concurrent callers, then creates one player window.

| Check | Result |
| --- | --- |
| Widevine component initialization | Ready, version `4.10.3050.0` |
| Apple player landing page | `https://music.apple.com/cn/new` |
| MusicKit instance | Present |
| Mineradio page bridge | Version 1 present |
| Storefront | `cn` |
| Widevine EME request | Succeeded for `com.widevine.alpha` |
| Catalog search | `周杰伦` returned three results; first result was `晴天` |
| Apple sign-in UI | Apple's `/includes/commerce/authenticate` frame and controls loaded |
| WebAuthn JS API | `PublicKeyCredential` present |
| Electron platform authenticator | `isUserVerifyingPlatformAuthenticatorAvailable()` returned `false` without publisher entitlements |

The analyser path was also exercised without protected Apple content by playing a generated local WAV through the Apple page's media element. Non-zero energy, bass, and mid values reached the POC over the same renderer-to-main-to-local-renderer event path. This validates the Web Audio and IPC plumbing, not subscriber playback.

## Passkey finding

Chrome's phone/tablet QR prompt is Chromium-owned WebAuthn UI. Electron's current macOS implementation explicitly provides native Touch ID prompting without the Chromium authenticator picker, so the QR sheet is not expected to appear in the embedded player. The POC keeps Apple's own authentication frames and exact official popup hosts in the persistent Apple session, but directs users to the password and two-factor path.

The native `electron-webauthn-mac` add-on is not a viable Apple-account workaround: it requires an app association and signing entitlement for the WebAuthn relying-party domain, and Mineradio cannot associate itself with Apple's domain.

## Unverified production boundary

No Apple account credentials or subscription were entered during validation. Full protected-track playback, authorization persistence after a real sign-in, and non-zero analyser data from a DRM track therefore remain unclaimed. Before a release makes those claims, a maintainer must:

1. VMP-sign the packaged castLabs Electron app using release-only EVS credentials.
2. Sign in with a subscribed test account using password and two-factor authentication.
3. Play a full catalog track and confirm transport, metadata, and non-zero spectrum values.
4. Restart the app and confirm that Apple's own partition persists the session without exporting cookies.
