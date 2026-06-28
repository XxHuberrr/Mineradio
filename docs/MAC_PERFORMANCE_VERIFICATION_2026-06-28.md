# Mineradio macOS Performance Verification - 2026-06-28

## Scope

This pass optimizes the Apple Silicon macOS native build while keeping existing Windows runtime paths behind platform guards. The implementation focuses on Mac compositor behavior, Mac idle smoothness, and packaged `.app` runtime evidence without changing the Windows installer or WorkerW-specific paths.

## Research Basis

- Electron performance guidance: measure first, then remove the actual bottleneck instead of guessing.
- Electron `BrowserWindow` behavior: transparent windows and separate overlay windows have compositor cost; macOS should prefer native window composition unless transparent pixels are required.

Official references used:

- https://www.electronjs.org/docs/latest/tutorial/performance
- https://www.electronjs.org/docs/latest/api/browser-window

## Baseline Tooling

Added `npm run profile:mac`, backed by `scripts/profile-macos-runtime.js`.

The profiler launches the packaged app at `dist/mac-arm64/Mineradio.app/Contents/MacOS/Mineradio` with a CDP port, then records:

- startup splash
- Home idle after splash dismissal
- synthetic playback visual scene
- desktop lyrics main-window impact
- desktop lyrics overlay window
- wallpaper fallback main-window impact
- wallpaper fallback window

Each scenario records RAF frame intervals, renderer state, long task count, canvas inventory, process CPU/RSS snapshots, CDP screenshots, and JSON artifacts under `output/perf/`.

Baseline run:

`output/perf/2026-06-27T18-43-18-746Z-macos-runtime`

Optimization comparison run:

`output/perf/2026-06-27T19-29-46-946Z-macos-after-final`

Final packaged-app verification run after `npm run build:mac`:

`output/perf/2026-06-28T04-08-18-838Z-macos-upstream-friendly-final6`

## Root Cause

The reproduced lag was not a blank-render or failed-overlay issue.

The baseline showed three measurable causes:

- Main Home idle kept the WebGL scene on visible vsync even with no playback.
- The Mac main window still used a fully transparent compositor surface and a CSS clipped/shadowed shell, which is unnecessary for a native macOS framed window.
- Overlay and wallpaper windows added extra compositor/render loops while the main window still rendered at full visible rate.

## Changes

- `desktop/main.js`
  - Mac main window now uses an opaque native BrowserWindow surface: `transparent: !IS_MAC`, `backgroundColor: '#000000'` on Mac.
  - Keeps the native hidden-inset title bar and traffic light behavior.

- `public/index.html`
  - Mac shell uses black native backing instead of a transparent clipped CSS shell.
  - Inactive `idle-guide`, `login-guide`, `hand`, and hidden `splash` canvases are removed from visible composition with `visibility` or `display`.
  - Added Mac runtime detection and Mac visible-idle render mode.
  - Mac visible idle uses 30fps main-scene rendering and DPR 1.0.
  - Playback, synthetic playback, visual guide, free camera, active shelf/detail, and pointer/canvas interaction return to full vsync and high DPR.
  - Splash/login guide DPR is capped more tightly on Mac.

- `desktop/overlay-preload.js`
  - Overlay windows now receive platform metadata.

- `public/wallpaper.html`
  - Mac wallpaper fallback uses a 30fps playing loop, 24fps idle loop, and slightly lower density scaling.

## Final Before/After Metrics

| Scenario | Baseline CPU | Final CPU | Baseline p99 RAF | Final p99 RAF | Baseline max RAF | Final max RAF | >33ms Frames |
|---|---:|---:|---:|---:|---:|---:|---:|
| Splash startup | 80.1% | 65.0% | 33.3ms | 17.7ms | 267.6ms | 33.3ms | 2 -> 0 |
| Home idle | 47.8% | 58.7% | 699.9ms | 17.6ms | 1616.6ms | 50.0ms | 8 -> 1 |
| Playback visual | 71.3% | 46.1% | 18.6ms | 17.6ms | 300.0ms | 17.7ms | 3 -> 0 |
| Desktop lyrics main | 86.7% | 56.3% | 33.9ms | 17.6ms | 333.4ms | 17.7ms | 7 -> 0 |
| Desktop lyrics window | 80.8% | 54.4% | 33.3ms | 17.6ms | 35.1ms | 17.8ms | 2 -> 0 |
| Wallpaper main | 68.8% | 54.3% | 33.4ms | 17.6ms | 273.5ms | 17.7ms | 14 -> 0 |
| Wallpaper window | 69.2% | 56.1% | 33.4ms | 17.5ms | 33.7ms | 17.7ms | 3 -> 0 |

Notes:

- Home idle keeps upstream startup/weather behavior. The CPU snapshot is higher in the final run, but p99 RAF dropped from 699.9ms to 17.6ms, max RAF dropped from 1616.6ms to 50.0ms, and >33ms frames dropped from 8 to 1.
- Playback visual stays high quality: final playback visual remains `vsync`, DPR 1.35.
- Mac idle Home uses DPR 1.0 and target 30fps; interaction/playback restores high-DPR vsync.

## Verification Commands

Completed:

```bash
node --check desktop/main.js
node --check desktop/preload.js
node --check desktop/overlay-preload.js
node --check server.js
node --check scripts/profile-macos-runtime.js
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package ok')"
CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:mac:dir
MINERADIO_PROFILE_LABEL=macos-after-final npm run profile:mac
CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:mac
MINERADIO_PROFILE_LABEL=macos-upstream-friendly-final6 npm run profile:mac
```

Intermediate profiling also tested removing Chromium `force_high_performance_gpu` on macOS. That experiment was reverted because it increased synthetic playback visual CPU compared with the retained configuration.

## Artifacts

Final CDP screenshots:

- `output/perf/2026-06-27T19-29-46-946Z-macos-after-final/01-splash-startup.png`
- `output/perf/2026-06-27T19-29-46-946Z-macos-after-final/02-home-idle.png`
- `output/perf/2026-06-27T19-29-46-946Z-macos-after-final/03-synthetic-playback-visual.png`
- `output/perf/2026-06-27T19-29-46-946Z-macos-after-final/04-desktop-lyrics-main.png`
- `output/perf/2026-06-27T19-29-46-946Z-macos-after-final/04b-desktop-lyrics-window.png`
- `output/perf/2026-06-27T19-29-46-946Z-macos-after-final/05-wallpaper-main.png`
- `output/perf/2026-06-27T19-29-46-946Z-macos-after-final/05b-wallpaper-window.png`

Final packaged-app CDP screenshots:

- `output/perf/2026-06-28T04-08-18-838Z-macos-upstream-friendly-final6/02-home-idle.png`
- `output/perf/2026-06-28T04-08-18-838Z-macos-upstream-friendly-final6/04b-desktop-lyrics-window.png`
- `output/perf/2026-06-28T04-08-18-838Z-macos-upstream-friendly-final6/05b-wallpaper-window.png`

## Final Package Verification

Full package build completed successfully:

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:mac
```

Generated package artifacts:

- `dist/Mineradio-1.1.1-arm64.dmg` - 126 MB
- `dist/Mineradio-1.1.1-arm64.zip` - 127 MB
- `dist/latest-mac.yml`
- `dist/mac-arm64/Mineradio.app/Contents/MacOS/Mineradio`

SHA-256:

```text
92dbaf2666045928850c914c31a314bc711890e3a8003432e0c790e87fb4e0d4  dist/Mineradio-1.1.1-arm64.dmg
f4e0a354fb8f121f379c7f7debe9c846db4667d5ee0cd6e15da3c7c97743ba79  dist/Mineradio-1.1.1-arm64.zip
defc845ca2f6d0139e517038f8c36449bb676b935dc4e714eed822dd47384153  dist/latest-mac.yml
```

Packaged-app profiler result:

- Run path: `output/perf/2026-06-28T04-08-18-838Z-macos-upstream-friendly-final6`
- Result: `ok: true`
- Errors: `[]`
- Scenarios: splash startup, Home idle, synthetic playback visual, desktop lyrics main-window impact, desktop lyrics overlay window, wallpaper main-window impact, wallpaper overlay window.

Final packaged-app spot metrics:

| Scenario | p99 RAF | Max RAF | >33ms Frames | CPU | RSS | Runtime |
|---|---:|---:|---:|---:|---:|---|
| Splash startup | 17.7ms | 33.3ms | 0 | 65.0% | 647.6 MB | main, vsync, DPR 1.35 |
| Home idle | 17.6ms | 50.0ms | 1 | 58.7% | 727.9 MB | main, 30fps target, DPR 1.0 |
| Playback visual | 17.6ms | 17.7ms | 0 | 46.1% | 729.2 MB | main, vsync, DPR 1.35 |
| Desktop lyrics main | 17.6ms | 17.7ms | 0 | 56.3% | 878.0 MB | main, 30fps target, DPR 1.0 |
| Desktop lyrics window | 17.6ms | 17.8ms | 0 | 54.4% | 851.7 MB | overlay, `isMacOverlay: true` |
| Wallpaper main | 17.6ms | 17.7ms | 0 | 54.3% | 817.9 MB | main, 30fps target, DPR 1.0 |
| Wallpaper window | 17.5ms | 17.7ms | 0 | 56.1% | 824.3 MB | overlay, `isMacOverlay: true` |

Packaged-app smoke and IPC check:

- Main window: `platform: darwin`, `isMac: true`, `visibleWindowButtons: 0`.
- Desktop lyrics IPC: `lyricsOn.ok: true`, `lyricsOff.ok: true`.
- Wallpaper IPC: `wallpaperOn.ok: true`, `wallpaperOff.ok: true`.
- CDP target creation was verified for `desktop-lyrics.html` and `wallpaper.html`; after closing both overlays, only the main Mineradio target remained.

Visual QA:

- Home screenshot was nonblank and retained the dark native Mac shell. In the scripted logged-out path, the upstream login guide overlay can be visible.
- Desktop lyrics screenshot retained the clean bright glyph interior and glow.
- Wallpaper screenshot rendered a full-window animated background rather than a blank or clipped surface.

Known packaging notes:

- The local build intentionally used `CSC_IDENTITY_AUTO_DISCOVERY=false`, so macOS signing was skipped.
- electron-builder still reports that `asar` is disabled in the current project configuration; this was not changed in this pass.
