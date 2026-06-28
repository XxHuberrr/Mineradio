# macOS Build Verification - 2026-06-28

Branch: `mac-native-port`
Repo: local working tree for `XxHuberrr/Mineradio`
Host: Apple Silicon macOS

## Commands Run

```bash
npm ci
node --check desktop/main.js
node --check desktop/preload.js
node --check desktop/overlay-preload.js
node --check server.js
CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:mac:dir
CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:mac
```

## Build Artifacts

```text
dist/mac-arm64/Mineradio.app
dist/Mineradio-1.1.1-arm64.dmg
dist/Mineradio-1.1.1-arm64.zip
dist/Mineradio-1.1.1-arm64.dmg.blockmap
dist/Mineradio-1.1.1-arm64.zip.blockmap
dist/latest-mac.yml
```

Artifact sizes observed:

```text
319M  dist/mac-arm64/Mineradio.app
128M  dist/Mineradio-1.1.1-arm64.dmg
128M  dist/Mineradio-1.1.1-arm64.zip
```

SHA256:

```text
92dbaf2666045928850c914c31a314bc711890e3a8003432e0c790e87fb4e0d4  dist/Mineradio-1.1.1-arm64.dmg
f4e0a354fb8f121f379c7f7debe9c846db4667d5ee0cd6e15da3c7c97743ba79  dist/Mineradio-1.1.1-arm64.zip
defc845ca2f6d0139e517038f8c36449bb676b935dc4e714eed822dd47384153  dist/latest-mac.yml
```

## Runtime Smoke Test

The packaged app binary stayed alive for 10 seconds and started the local service:

```text
SMOKE_STATUS=still_running_after_10s
粒子音乐可视化 v2  ->  http://localhost:3000
登录态: 未登录
```

## UI Runtime Check

Electron was launched with a local Chrome DevTools Protocol port. The renderer reported:

```json
{
  "title": "Mineradio",
  "url": "http://127.0.0.1:3000/",
  "bodyClass": "desktop-shell desktop-platform-darwin desktop-mac",
  "desktopShell": true,
  "desktopMac": true,
  "visibleWindowButtons": 0,
  "canvasCount": 5,
  "buttonCount": 140,
  "hasDesktopApi": true,
  "platform": "darwin",
  "isMac": true
}
```

Screenshot artifact:

```text
output/playwright/mineradio-mac-app-smoke.png
```

## Overlay Runtime Check

The renderer successfully opened and closed the macOS desktop lyrics and wallpaper fallback windows through the existing desktop IPC API:

```json
{
  "lyricsOn": { "ok": true },
  "lyricsOff": { "ok": true },
  "wallpaperOn": { "ok": true },
  "wallpaperOff": { "ok": true }
}
```

## Update Asset Selection Check

A local manifest containing `.exe`, `.dmg`, and `.zip` assets was served with:

```bash
MINERADIO_UPDATE_PLATFORM=darwin
MINERADIO_UPDATE_ARCH=arm64
```

The update endpoint selected the Mac DMG:

```json
{
  "downloadUrl": "https://example.invalid/Mineradio-9.9.9-arm64.dmg",
  "assetName": "Mineradio-9.9.9-arm64.dmg",
  "candidates": [
    "https://gh.llkk.cc/https://example.invalid/Mineradio-9.9.9-arm64.dmg",
    "https://ghfast.top/https://example.invalid/Mineradio-9.9.9-arm64.dmg",
    "https://gh-proxy.com/https://example.invalid/Mineradio-9.9.9-arm64.dmg",
    "https://example.invalid/Mineradio-9.9.9-arm64.dmg"
  ]
}
```

## Package Inspection

`Info.plist` includes:

```text
CFBundleIdentifier = com.mineradio.desktop
CFBundleIconFile = icon.icns
LSApplicationCategoryType = public.app-category.music
LSMinimumSystemVersion = 12.0
NSLocalNetworkUsageDescription = Mineradio runs a local playback and API service on 127.0.0.1.
```

Signing state:

```text
Signature=adhoc
TeamIdentifier=not set
```

This is expected because Developer ID credentials were not available in the environment. The build is configured with hardened runtime entitlements and is ready for Developer ID signing/notarization once credentials are provided.
