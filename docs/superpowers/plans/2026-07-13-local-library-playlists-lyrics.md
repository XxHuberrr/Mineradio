# Persistent Local Library, Playlists, and Lyrics Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a persistent multi-folder local library, local mixed-source playlists, login-aware deduplicated search, and three-state lyrics with seven-node scrolling and aligned translations.

**Architecture:** Electron main process owns a versioned JSON repository in `app.getPath('userData')`, rescans registered folders, and exposes narrow IPC methods. Two small UMD modules provide testable pure helpers for library/search selection and lyric alignment/windowing; `public/index.html` integrates them with the existing queue, stage lyric, cloud provider, and playlist panel flows.

**Tech Stack:** Electron, Node.js, vanilla JavaScript, Three.js stage lyrics, existing static Node tests, electron-builder.

---

## File Structure

- Create `desktop/local-library-store.js`: versioned JSON persistence, folder refresh, track availability, and local playlist CRUD.
- Modify `desktop/local-music-library.js`: stable path IDs, scan records, companion translation lyrics, and renderer-safe track serialization.
- Modify `desktop/main.js`: initialize the repository and register local-library IPC handlers.
- Modify `desktop/preload.js`: expose local-library and local-playlist methods.
- Create `public/local-library-core.js`: pure selection, source eligibility, normalization, sorting, and deduplication helpers.
- Create `public/lyric-display-core.js`: lyric mode cycling, translation alignment, bilingual merging, and seven-node window helpers.
- Modify `public/index.html`: UI, persisted lyric settings, local library/playlists, search integration, queue loading, and stage lyric rendering.
- Create `tests/local-library-store.test.js`: persistence and recovery behavior.
- Create `tests/local-library-core.test.js`: selection and login-aware search behavior.
- Create `tests/lyric-display-core.test.js`: lyric modes, translation alignment, and seven-node windows.
- Modify `tests/local-music-library.test.js`: stable identity and translation companion scanning.
- Replace `tests/lyric-double-line-static.test.js` with `tests/lyric-display-ui-static.test.js`: new button and translation UI assertions.
- Modify `tests/local-music-ui-static.test.js`: local library and playlist UI contracts.
- Modify `package.json`, `package-lock.json`, and `CHANGELOG.md`: release version and notes after verification.

### Task 1: Upgrade the local folder scanner

**Files:**
- Modify: `desktop/local-music-library.js`
- Modify: `tests/local-music-library.test.js`

- [ ] **Step 1: Write failing scanner tests**

Add cases that assert a track has a stable path-derived `id`, an internal absolute path is not exposed in the renderer object, a second scan keeps the same ID, and `Song.trans.lrc` is returned as `localTranslationText`.

```js
const first = scanLocalMusicDirectory(dir);
const second = scanLocalMusicDirectory(dir);
assert.strictEqual(first.tracks[0].id, second.tracks[0].id);
assert.strictEqual(first.tracks[0].filePath, undefined);
assert.strictEqual(first.tracks[0].localTranslationText.trim(), '[00:01.20]translated');
assert.strictEqual(resolveLocalTrackPath(first.tracks[0].id), path.join(dir, 'Artist - Song.mp3'));
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node tests/local-music-library.test.js`

Expected: FAIL because `localTranslationText` and `resolveLocalTrackPath` do not exist.

- [ ] **Step 3: Implement stable scan records**

Use a normalized absolute path hash for the stable ID, keep the current random playback token registry, add an internal track-path registry keyed by ID, and recognize `.trans`, `.translation`, `.cn`, and `.zh` lyric siblings.

```js
function stableLocalTrackId(filePath) {
  return `local:${crypto.createHash('sha1').update(path.resolve(filePath).toLowerCase()).digest('hex').slice(0, 20)}`;
}

function resolveLocalTrackPath(trackId) {
  return localTrackPathRegistry.get(String(trackId || '')) || '';
}
```

- [ ] **Step 4: Run scanner tests and verify GREEN**

Run: `node tests/local-music-library.test.js`

Expected: `local-music-library tests passed`.

- [ ] **Step 5: Commit the scanner change**

```powershell
git add desktop/local-music-library.js tests/local-music-library.test.js
git commit -m "feat: enrich persistent local music scanning"
```

### Task 2: Add the persistent local library repository

**Files:**
- Create: `desktop/local-library-store.js`
- Create: `tests/local-library-store.test.js`

- [ ] **Step 1: Write failing persistence tests**

Cover adding two folders without replacement, reopening the JSON store, duplicate folder refresh, missing-folder availability, playlist create/rename/delete, duplicate item skipping, and deletion not touching source files.

```js
const store = createLocalLibraryStore({ dataFile, scanDirectory });
store.addFolder(folderA);
store.addFolder(folderB);
assert.strictEqual(store.getLibrary().folders.length, 2);

const playlist = store.createPlaylist('夜间');
const result = store.addPlaylistItems(playlist.id, [localSong, localSong, qqSong]);
assert.strictEqual(result.added, 2);
assert.strictEqual(store.getPlaylist(playlist.id).items.length, 2);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node tests/local-library-store.test.js`

Expected: FAIL with module not found.

- [ ] **Step 3: Implement the repository**

Implement `createLocalLibraryStore({ dataFile, scanDirectory })` with schema version `1`, atomic `dataFile.tmp` replacement, synchronous serialized operations, `refreshAllFolders()`, renderer-safe snapshots, and playlist item references plus cloud snapshots.

```js
const DEFAULT_STATE = { version: 1, folders: [], tracks: {}, playlists: [] };

function writeStateAtomic(filePath, state) {
  const tempPath = `${filePath}.tmp`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tempPath, filePath);
}
```

- [ ] **Step 4: Run repository and scanner tests**

Run: `node tests/local-library-store.test.js; node tests/local-music-library.test.js`

Expected: both pass.

- [ ] **Step 5: Commit the repository**

```powershell
git add desktop/local-library-store.js tests/local-library-store.test.js
git commit -m "feat: persist local library and playlists"
```

### Task 3: Expose narrow Electron APIs

**Files:**
- Modify: `desktop/main.js`
- Modify: `desktop/preload.js`
- Create: `tests/local-library-ipc-static.test.js`

- [ ] **Step 1: Write failing IPC contract tests**

Assert handlers and preload methods exist for library read/refresh, folder import, playlist create/rename/delete, and playlist item add/remove.

```js
assert.ok(main.includes("ipcMain.handle('mineradio-local-library-get'"));
assert.ok(preload.includes('getLocalLibrary:'));
assert.ok(preload.includes('createLocalPlaylist:'));
assert.ok(preload.includes('addLocalPlaylistItems:'));
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node tests/local-library-ipc-static.test.js`

Expected: FAIL because the handlers are absent.

- [ ] **Step 3: Initialize and expose the repository**

Create the store after Electron is ready using `path.join(app.getPath('userData'), 'local-library-v1.json')`. Replace the old one-shot folder handler with import-and-merge behavior, but preserve `pickLocalMusicFolder()` compatibility until the renderer migration is complete.

Expose these preload methods:

```js
getLocalLibrary: () => ipcRenderer.invoke('mineradio-local-library-get'),
refreshLocalLibrary: () => ipcRenderer.invoke('mineradio-local-library-refresh'),
pickLocalMusicFolder: () => ipcRenderer.invoke('mineradio-pick-local-music-folder'),
createLocalPlaylist: (name) => ipcRenderer.invoke('mineradio-local-playlist-create', { name }),
renameLocalPlaylist: (id, name) => ipcRenderer.invoke('mineradio-local-playlist-rename', { id, name }),
deleteLocalPlaylist: (id) => ipcRenderer.invoke('mineradio-local-playlist-delete', { id }),
addLocalPlaylistItems: (id, items) => ipcRenderer.invoke('mineradio-local-playlist-add-items', { id, items }),
removeLocalPlaylistItems: (id, refs) => ipcRenderer.invoke('mineradio-local-playlist-remove-items', { id, refs }),
```

- [ ] **Step 4: Run IPC and syntax checks**

Run: `node tests/local-library-ipc-static.test.js; node --check desktop/main.js; node --check desktop/preload.js`

Expected: all pass.

- [ ] **Step 5: Commit the IPC layer**

```powershell
git add desktop/main.js desktop/preload.js tests/local-library-ipc-static.test.js
git commit -m "feat: expose local library desktop APIs"
```

### Task 4: Add pure lyric mode and translation helpers

**Files:**
- Create: `public/lyric-display-core.js`
- Create: `tests/lyric-display-core.test.js`

- [ ] **Step 1: Write failing lyric core tests**

Test `off -> single -> scroll -> off`, seven-node centered windows with edge placeholders omitted, exact translation matches, shifted matches within dynamic tolerance, no duplicate reuse, rejection beyond `3.5` seconds, and exact-timestamp bilingual LRC merging.

```js
assert.strictEqual(nextLyricDisplayMode('off'), 'single');
assert.strictEqual(nextLyricDisplayMode('single'), 'scroll');
assert.deepStrictEqual(lyricWindow(lines, 3, 7).map((item) => item.index), [0,1,2,3,4,5,6]);
assert.strictEqual(alignTranslations(original, translated)[0].translation, 'Hello');
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node tests/lyric-display-core.test.js`

Expected: FAIL with module not found.

- [ ] **Step 3: Implement the UMD lyric core**

Export for Node tests and attach `window.MineradioLyricCore` in Electron. Keep all functions pure and use monotonic nearest matching with exact threshold `0.35` seconds and maximum dynamic threshold `3.5` seconds.

```js
function nextLyricDisplayMode(mode) {
  return mode === 'off' ? 'single' : (mode === 'single' ? 'scroll' : 'off');
}
```

- [ ] **Step 4: Run lyric core tests and verify GREEN**

Run: `node tests/lyric-display-core.test.js`

Expected: `lyric display core tests passed`.

- [ ] **Step 5: Commit lyric helpers**

```powershell
git add public/lyric-display-core.js tests/lyric-display-core.test.js
git commit -m "feat: add lyric display and translation core"
```

### Task 5: Add pure local selection and search helpers

**Files:**
- Create: `public/local-library-core.js`
- Create: `tests/local-library-core.test.js`

- [ ] **Step 1: Write failing core tests**

Cover source eligibility for no login/QQ/Netease/both, normalization, priority sorting, automatic deduplication, unavailable local fallback, select all, invert selection, and stable item references.

```js
assert.deepStrictEqual(eligibleSearchProviders({ qq: false, netease: false }), ['local']);
assert.deepStrictEqual(eligibleSearchProviders({ qq: true, netease: true }), ['local', 'qq', 'netease']);
assert.strictEqual(dedupeSearchResults([neteaseSong, qqSong, localSong])[0].provider, 'local');
assert.deepStrictEqual(invertSelection(['a', 'b', 'c'], new Set(['a'])), new Set(['b', 'c']));
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node tests/local-library-core.test.js`

Expected: FAIL with module not found.

- [ ] **Step 3: Implement the UMD local-library core**

Normalize title and primary artist by lowercase conversion, whitespace collapse, and common punctuation removal. Assign priority `local: 0`, `qq: 1`, `netease: 2`; skip unavailable local entries during deduplication preference.

- [ ] **Step 4: Run core tests and verify GREEN**

Run: `node tests/local-library-core.test.js`

Expected: `local library core tests passed`.

- [ ] **Step 5: Commit search helpers**

```powershell
git add public/local-library-core.js tests/local-library-core.test.js
git commit -m "feat: add local search and selection core"
```

### Task 6: Build local library and local playlist UI flows

**Files:**
- Modify: `public/index.html`
- Modify: `tests/local-music-ui-static.test.js`

- [ ] **Step 1: Write failing UI contract tests**

Assert the left panel contains local library and local playlist tabs, import/select/invert/clear/add controls, row checkboxes, playlist create/rename/delete/play handlers, and startup library restoration.

```js
assert.ok(html.includes('id="local-library-list"'));
assert.ok(html.includes('onclick="selectAllLocalTracks()"'));
assert.ok(html.includes('onclick="invertLocalTrackSelection()"'));
assert.ok(html.includes('function loadPersistentLocalLibrary'));
assert.ok(html.includes('function playLocalPlaylist'));
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node tests/local-music-ui-static.test.js`

Expected: FAIL on the new local library contracts.

- [ ] **Step 3: Integrate scripts and persistent library state**

Load `local-library-core.js` and `lyric-display-core.js` before the main inline script. Add renderer state for library folders, tracks, local playlists, selected refs, active local view, and incremental rendering cursors.

Change `openLocalMusicFolder()` to merge the IPC result, retain prior tracks, render the local library, and avoid automatic replacement of the queue. Restore the library during startup with `getLocalLibrary()` and refresh it in the background.

- [ ] **Step 4: Implement local library selection and playlist actions**

Use fixed-height toolbar controls and checkboxes. Render tracks in batches, keep selection by stable refs, call the preload playlist APIs, confirm deletion, and load a selected local playlist into `playQueue` without removing unavailable entries from storage.

- [ ] **Step 5: Run UI and existing local tests**

Run: `node tests/local-music-ui-static.test.js; node tests/local-library-core.test.js; node tests/local-library-store.test.js; node tests/local-music-library.test.js`

Expected: all pass.

- [ ] **Step 6: Commit the local UI**

```powershell
git add public/index.html tests/local-music-ui-static.test.js
git commit -m "feat: add persistent local library and playlists UI"
```

### Task 7: Integrate login-aware search and three-state stage lyrics

**Files:**
- Modify: `public/index.html`
- Create: `tests/search-login-routing-static.test.js`
- Create: `tests/lyric-display-ui-static.test.js`
- Delete: `tests/lyric-double-line-static.test.js`

- [ ] **Step 1: Write failing search and lyric UI tests**

Assert comprehensive search uses `eligibleSearchProviders()` and `dedupeSearchResults()`, explicit provider tabs do not auto-open login, the lyric button contains a main word and subscript status span, `lyricDisplayMode` persists, and `lyricShowTranslation` replaces `lyricDoubleLine`.

```js
assert.ok(html.includes('class="lyrics-mode-sub"'));
assert.ok(html.includes("lyricDisplayMode: 'single'"));
assert.ok(html.includes('lyricShowTranslation'));
assert.ok(html.includes('MineradioLocalLibraryCore.dedupeSearchResults'));
```

- [ ] **Step 2: Run both tests and verify RED**

Run: `node tests/search-login-routing-static.test.js; node tests/lyric-display-ui-static.test.js`

Expected: both fail on missing integration.

- [ ] **Step 3: Implement login-aware search**

Search local tracks synchronously, query only logged-in cloud providers, merge settled results, sort/dedupe with the core helper, and keep explicit QQ/NE tabs non-popup when logged out. Preserve source tags and original provider playback objects.

- [ ] **Step 4: Replace the lyric button state**

Render the fixed-width button as:

```html
<button id="lyrics-mode-btn" class="ctrl-btn lyrics-toggle-btn" onclick="cycleLyricDisplayMode()">
  <span class="lyrics-word-icon">词</span><span id="lyrics-mode-sub" class="lyrics-mode-sub">（开）</span>
</button>
```

Persist `off`, `single`, or `scroll` in the existing visual archive. Replace the old double-line toggle with a `显示译文` toggle and migrate old saved `lyricDoubleLine` values only when the new field is absent.

- [ ] **Step 5: Parse and align translations**

Parse `r.tlyric` independently, call `alignTranslations()`, attach `translation` to original lyric nodes, and apply the same logic to local separate translation text and exact-timestamp bilingual LRC.

- [ ] **Step 6: Implement seven-node stage lyric rendering**

Maintain at most seven stage lyric meshes. Rebuild only when the active lyric index or display mode changes, reuse the existing world transform and detail-page opacity profile, position nodes at stable line-height offsets, interpolate vertical movement, and apply karaoke progress only to the center node.

- [ ] **Step 7: Run search, lyric, and legacy tests**

Run: `node tests/search-login-routing-static.test.js; node tests/lyric-display-ui-static.test.js; node tests/lyric-display-core.test.js; node tests/guest-login-static.test.js`

Expected: all pass.

- [ ] **Step 8: Commit search and lyric integration**

```powershell
git add public/index.html tests/search-login-routing-static.test.js tests/lyric-display-ui-static.test.js tests/lyric-double-line-static.test.js
git commit -m "feat: add login-aware search and scrolling lyrics"
```

### Task 8: Full verification, versioning, Electron QA, and packaging

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `CHANGELOG.md`
- Modify: `docs/PROJECT_MEMORY.md`

- [ ] **Step 1: Run the complete automated suite**

Run every `tests/*.test.js` file, then:

```powershell
node --check server.js
node --check desktop/main.js
node --check desktop/preload.js
node --check desktop/local-music-library.js
node --check desktop/local-library-store.js
git diff --check
```

Expected: zero failures and zero whitespace errors.

- [ ] **Step 2: Parse all inline HTML scripts**

Run a Node script that extracts non-`src` script blocks from `public/index.html` and compiles each with `new Function(code)`.

Expected: all inline scripts parse.

- [ ] **Step 3: Perform Electron behavior QA**

Use temporary fixture folders to verify: importing folder A then B retains both; restart restores both without copying files; missing files show unavailable; create/rename/delete playlists; select all/invert/add; play mixed playlists; no-login search is local-only; logged-in source rules; duplicate result preference; lyric off/single/scroll states; seven visible nodes; translation toggle and shifted timestamps; playback controls and 3D shelf remain interactive.

- [ ] **Step 4: Record accepted behavior in project memory**

Append a dated entry describing persistent path-only storage, local playlist boundaries, search priority, lyric labels, seven-node rendering, and translation alignment limits.

- [ ] **Step 5: Bump to version 1.1.3**

Update `package.json`, `package-lock.json`, and the top of `CHANGELOG.md` with the completed feature list and compatibility notes.

- [ ] **Step 6: Build the unpacked application**

Run: `npm run build:win:dir`

Expected: `dist/win-unpacked/Mineradio.exe` exists and launches a responsive `Mineradio` window.

- [ ] **Step 7: Build the installer**

Run: `npm run build:win`

Expected: `dist/Mineradio-1.1.3-Setup.exe`, blockmap, and `latest.yml` exist.

- [ ] **Step 8: Verify artifacts**

Calculate SHA256 for the unpacked executable and installer, inspect Authenticode status, launch the unpacked executable, confirm the main window responds, and close only the test processes.

- [ ] **Step 9: Commit release metadata**

```powershell
git add package.json package-lock.json CHANGELOG.md docs/PROJECT_MEMORY.md
git commit -m "chore: prepare Mineradio 1.1.3"
```

## Plan Self-Review

- Every design requirement maps to a task: persistence Tasks 1-3, playlists Task 6, search Tasks 5 and 7, lyrics Tasks 4 and 7, verification and packaging Task 8.
- New behavior is introduced only after a failing test in each task.
- Existing uncommitted guest login, local import, and double-line lyric work must be preserved and evolved; no task may revert unrelated user changes.
- The plan does not alter the movie visual system, glass texture, installer deletion rules, or cloud playlist write APIs.
