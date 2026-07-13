# Apple Music Web POC

Status: approved for an isolated, open-source macOS proof of concept on 2026-07-13.

## Outcome

Add a macOS-first Apple Music provider that uses the subscriber's own interactive `music.apple.com` session. Neither the end user nor a source builder supplies a MusicKit developer token, Music User Token, Apple private key, or Apple Developer team identifier.

The POC must demonstrate catalog search, full-track playback control, now-playing metadata, and real-time frequency data without downloading, proxying, decoding, or exposing protected stream URLs.

## Architecture

- `desktop/apple-music-web-controller.js`: owns one persistent, sandboxed Apple Music `BrowserWindow` and a narrow command allowlist.
- `desktop/apple-music-web-preload.js`: forwards validated page events to the main process; it exposes no Node API to Apple content.
- `desktop/apple-music-web-hook.js`: runs in the Apple page's main world, observes its existing MusicKit instance, and attaches an `AnalyserNode` to `#apple-music-player`.
- `desktop/apple-music-web-protocol.js`: validates commands and removes unknown or credential-like event fields.
- `public/apple-music-web-poc.html`: isolated Mineradio UI for opening the login/player window, searching, controlling playback, and displaying analyser diagnostics.

Apple owns authentication and protected playback. Mineradio stores no copied credentials; Chromium persists the Apple site's own cookies in Electron's dedicated `persist:mineradio-apple-music` partition. The supplied mainland-China information URL, `https://www.apple.com.cn/apple-music/`, is kept as an external reference; the controllable player is pinned to its mainland storefront at `https://music.apple.com/cn`.

## Authentication behavior

The Apple sign-in form loads successfully inside Apple's own cross-origin frame and remains in the dedicated Apple Music session. HTTPS authentication windows are retained in that session only for the exact hosts used by Apple Music (`auth.music.apple.com` and `idmsa.apple.com`); unrelated links still open externally.

The cross-device passkey QR sheet shown by Chrome is browser-owned WebAuthn UI, not HTML created by Apple Music. Electron 42 added `app.configureWebAuthn()` for a device-bound Touch ID / Secure Enclave authenticator, but its implementation explicitly provides only the native biometric sheet and no Chromium Views authenticator picker. It therefore does not reproduce Chrome's phone/tablet QR flow or expose a user's existing iCloud Keychain Apple-account passkey. It also requires a matching keychain entitlement and signed app.

The open-source `electron-webauthn-mac` add-on can present macOS AuthenticationServices UI, including cross-device pairing, for relying-party domains controlled and associated by the app publisher. It cannot authorize Mineradio for Apple's `apple.com` relying party, and cannot safely replace a credential request made inside Apple's frame. The supported POC login path is consequently Apple account password plus Apple's normal two-factor verification. Opening the same page in Chrome can show the QR UI, but that browser session cannot be copied into Electron without violating the no-cookie-export boundary.

## Distribution boundary

The web player needs Widevine. macOS and Windows production playback in an Electron wrapper requires a CastLabs Electron build with production VMP signing. Source builds and unsigned DMGs remain useful for UI, protocol, login, metadata, and EME diagnostics, but full playback must only be claimed after testing a production-VMP-signed build with a subscribed account.

CastLabs EVS credentials are local/CI release credentials. They are not Apple Music tokens, are never stored in the repository, and are not requested from end users.

## Constraints

- No developer-token setting, token service, Apple `.p8` key, or Apple Developer team configuration.
- No cookie export, browser-state export, credential logging, stream URL scraping, HLS reconstruction, preview substitution, recording, or DRM bypass.
- Only `https://music.apple.com` is loaded as the Apple player main frame; unrelated links open in the system browser.
- The POC does not claim Chrome-compatible cross-device passkey UI; embedded sign-in uses password and two-factor verification.
- Existing Windows, NetEase, QQ Music, installer, and default renderer behavior remain unchanged.
- The POC is opened only by `npm run start:apple-music` or an explicit environment flag until live playback and non-zero analyser values are verified.

## Acceptance

1. Protocol tests reject unknown commands and strip unknown/secret-shaped fields.
2. The Apple window supports interactive sign-in and persists its own session without copying cookies.
3. The POC can search the catalog and issue play/pause/next/previous/seek commands through the page's existing MusicKit instance.
4. Now-playing events and 64 analyser bins reach the local POC.
5. A macOS arm64 DMG is built and checked for accidental credentials.
6. Validation distinguishes static/EME readiness from live subscribed playback and production VMP signing.

## GitHub research decision

| Project | End-user token setup | Maintainer Apple key | Full catalog playback | Real-time audio data | Decision |
| --- | --- | --- | --- | --- | --- |
| `Parachord/parachord` | None | Native MusicKit signing/App Service | Yes on signed macOS build | Not provided | Best long-term native control path, but not publisher-credential-free |
| `seayniclabs/sound` | None | Native MusicKit signing/App Service | Yes on signed macOS build | Not provided | Confirms native authorization boundary |
| `wimpysworld/sidra` | None | None | Yes through Apple web player | Intentionally untouched | Best current tokenless wrapper and session precedent |
| `ciderapp/Apple-Music-Electron` | None | None | Yes through Apple web player | `createMediaElementSource` proven | Deprecated, but proves the analyser bridge |
| `ciderapp/Cider` | None for users | Hosted developer-token service | Yes | `createMediaElementSource` proven | UX proof, but requires project infrastructure and is AGPL |
| `Zeryther/musictron` | None for users | Team ID, key ID, `.p8` or token server | Yes | Web Audio capable | Does not meet publisher-tokenless constraint |
| `katolikov/auralis` | N/A | None | External Music.app only | ScreenCaptureKit FFT | Strong alternative for analysing Music.app, not a catalog/player integration |
| `wpowiertowski/amplibre.app` | Intended none | Native MusicKit signing/App Service | Planned | Explicitly unavailable for DRM tracks | Architecture document is aspirational; current source does not meet the requirement |
| AppleScript/JXA MCP projects | None | None | Library-dependent | No | Cannot reliably play arbitrary cloud-only catalog tracks |
| Playwright Apple Music MCP | None | None | Uses logged-in Apple web session | No | Confirms tokenless catalog calls; storing exported browser state is not copied here |

## Longer-term option

If the maintainer later provides an Apple Developer identity with MusicKit App Service, a native `ApplicationMusicPlayer` helper is the more stable supported integration. For visualization, a ScreenCaptureKit/Core Audio tap like Auralis can analyse system output without accessing protected files. That path still requires user screen/audio-capture permission and publisher signing, so it is not the default POC requested here.
