# Two-Line Lyric Scroll Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore a current-plus-next lyric switch and replace the seven-line rebuilding scroll renderer with a smooth two-slot reusable renderer.

**Architecture:** Keep the existing Three.js lyric world transform and materials. Change pure windowing to two nodes, persist `lyricDoubleLine`, and manage two scroll slots that reuse meshes across index changes; only the newly entering lyric may replace one slot's resources.

**Tech Stack:** Vanilla JavaScript, Three.js, Electron, Node static tests, electron-builder.

---

### Task 1: Lock the two-line behavior with failing tests

**Files:**
- Modify: `tests/lyric-display-core.test.js`
- Modify: `tests/lyric-display-ui-static.test.js`
- Create: `tests/lyric-scroll-reuse-static.test.js`

- [ ] Write a core assertion that `lyricWindow(lines, 3, 2)` returns indexes `3` and `4`.
- [ ] Replace translation-toggle assertions with `lyricDoubleLine`, label “歌词双行显示”, and persistence assertions.
- [ ] Assert `showStageScroll()` does not call `clearStageScrollMeshes()` during ordinary index changes and uses a two-slot update helper.
- [ ] Run all three tests and verify they fail for the missing behavior.

### Task 2: Restore the double-line switch

**Files:**
- Modify: `public/index.html`

- [ ] Replace `lyricShowTranslation` with `lyricDoubleLine` in defaults, saved layout, user archives, toggle UI, input synchronization, and toast text.
- [ ] Update `composeStageLyricText(lines, index, allowDouble)` so single display mode returns current plus next only when the switch is enabled.
- [ ] Keep translation parsing data attached to lyric lines but do not compose translation text into stage lyrics.
- [ ] Run `tests/lyric-display-ui-static.test.js` and verify it passes.

### Task 3: Implement two reusable scroll slots

**Files:**
- Modify: `public/index.html`
- Modify: `public/lyric-display-core.js`
- Modify: `tests/lyric-display-core.test.js`
- Modify: `tests/lyric-scroll-reuse-static.test.js`

- [ ] Change scroll window requests from `7` to `2`.
- [ ] Add `ensureStageScrollSlot(slotIndex, lyricIndex, text)` that reuses an existing mesh when its text is unchanged and replaces only that slot when necessary.
- [ ] On index advance, promote the previous next-slot mesh to current, recycle the old current slot for the new next line, and update slot offsets without clearing both meshes.
- [ ] Keep position, scale, opacity, karaoke progress, shelf-detail dimming, and world transforms updated through the existing frame loop.
- [ ] Add diagnostic counters under `stageLyrics.scrollStats` for mesh creation, reuse, and replacement.
- [ ] Run the core and reuse tests and verify they pass.

### Task 4: Verify behavior and regressions

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/PROJECT_MEMORY.md`

- [ ] Run every `tests/*.test.js` file.
- [ ] Run Node syntax checks for server, Electron files, and both public helper modules.
- [ ] Parse all inline scripts in `public/index.html` with `new Function`.
- [ ] Run `git diff --check`.
- [ ] Start Electron and confirm a responsive Mineradio window without browser automation.
- [ ] Record the two-slot reuse rule and the meaning of the double-line switch in project memory.

### Task 5: Rebuild Windows artifacts

**Files:**
- Rebuild: `dist/win-unpacked/Mineradio.exe`
- Rebuild: `dist/Mineradio-1.1.3-Setup.exe`

- [ ] Run `npm run build:win:dir`.
- [ ] Launch the rebuilt EXE and confirm the main window responds.
- [ ] Run `npm run build:win`.
- [ ] Calculate SHA256 and Authenticode status for the rebuilt EXE and installer.
- [ ] Commit source, tests, changelog, and memory updates without adding ignored `dist` artifacts.

## Plan Self-Review

- The plan addresses the measured root cause: full seven-mesh destruction and reconstruction at each lyric index.
- The scroll renderer remains Three.js-based and keeps existing visual hierarchy behavior.
- The double-line switch is unambiguously current lyric plus next lyric, not translation.
- Tests precede production changes and verify both behavior and the absence of full-window rebuilding.
