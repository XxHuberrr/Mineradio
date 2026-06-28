# Mineradio macOS Native Port Plan

Date: 2026-06-28
Branch: `mac-native-port`
Target repo: `https://github.com/XxHuberrr/Mineradio`

## Goal

Deliver Mineradio as a first-class macOS desktop app without regressing the existing Windows release line. The Mac build must produce a usable Apple Silicon `.app`, `.dmg`, and `.zip`; use platform-aware packaging, update, cache, menu, window, desktop lyrics, and wallpaper behavior; and remain ready for Developer ID signing and notarization once credentials are available.

## Scope

- Keep the Windows NSIS installer, shortcut behavior, WorkerW wallpaper attach, and installer safety rules intact.
- Add macOS build targets and metadata in the existing Electron Builder configuration.
- Add macOS application menu, Dock-friendly activation behavior, and platform metadata exposed to the renderer.
- Replace Windows-only default paths with app/user-data paths injected by the Electron main process.
- Make update asset selection platform-aware so Mac builds do not download Windows `.exe` installers.
- Keep desktop lyrics visual quality from `docs/DESKTOP_LYRICS_VISUAL.md`.
- Implement macOS desktop lyrics as a native overlay window using Electron-supported always-on-top/panel behavior.
- Implement macOS wallpaper mode as a click-through desktop-level visual window where supported by Electron/macOS, with a documented fallback to a borderless all-workspaces background window.
- Produce verification evidence from dependency install, syntax checks, Mac build, package inspection, and runtime smoke tests.

## Out Of Scope For This Branch

- Rewriting `public/index.html` visual systems or changing the approved SVG glass/3D shelf look.
- Replacing macOS system wallpaper through private APIs.
- Claiming Apple notarization success without valid Apple Developer credentials.
- Publishing GitHub Releases assets until local packaging and runtime checks pass.

## macOS Distribution Model

Mac artifacts are:

- `Mineradio-${version}-arm64.dmg` for user installation.
- `Mineradio-${version}-arm64-mac.zip` for update tooling compatibility and fallback distribution.
- `mac-arm64/Mineradio.app` for local smoke testing.

When Developer ID credentials are absent, the build uses ad-hoc/local signing only and documents the blocker. When credentials are present, the same config should support hardened runtime and notarization through Electron Builder environment variables or `electron-builder` notarize options.

## Platform Behavior

### Windows

Windows remains the current baseline:

- NSIS installer and installer safety fixes remain unchanged.
- Desktop shortcut creation stays Windows-only.
- Desktop lyrics middle-click polling remains Windows-only via PowerShell and Win32 APIs.
- Wallpaper mode keeps WorkerW attach.

### macOS

Mac behavior is separate and explicit:

- The app uses a native macOS application menu.
- Window close follows normal macOS behavior: closing the last window does not quit; Dock activation reopens/focuses.
- Desktop lyrics use a transparent always-on-top overlay. Since macOS does not provide the same click-through global middle-click polling path without accessibility/event-tap privileges, lock/unlock is exposed through renderer controls and keyboard shortcuts. This is a product fallback, not a silent broken feature.
- Wallpaper mode uses an Electron desktop-level or all-workspaces click-through background window. It should not block Finder/Desktop clicks. If macOS disallows true desktop embedding, the fallback is a non-focusable, click-through visual layer behind normal app windows.

## Update Compatibility

Update selection must use runtime platform and architecture:

- `darwin` prefers `.dmg`, then `mac.zip`/`.zip`, and rejects `.exe`/`.msi`.
- `win32` prefers `.exe`/`.msi`, then `.zip`/`.7z`.
- `linux` is not a release target yet and only uses generic archives if present.

Manifest and latest-yml parsing must default to platform-appropriate filenames instead of hard-coding `Setup.exe`.

## Verification Gates

Before calling this port complete, collect evidence for:

- `npm ci`
- `node --check desktop/main.js`
- `node --check desktop/preload.js`
- `node --check server.js`
- `npm run build:mac:dir`
- `npm run build:mac`
- `.app` launch smoke test that keeps the app alive long enough for the local server to start.
- `plutil` inspection of `Info.plist`.
- `codesign -dv` inspection documenting ad-hoc or Developer ID signing state.
- A local update manifest simulation proving Mac asset selection chooses `.dmg`/`.zip`, not `.exe`.

## Completion Notes

This document is a product and engineering boundary for the Mac port. It should be updated if the implementation discovers a stronger macOS-native approach for desktop lyrics or wallpaper mode, but it must not be weakened to hide missing behavior.
