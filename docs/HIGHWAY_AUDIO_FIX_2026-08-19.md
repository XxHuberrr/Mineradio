# Highway Drive and AI6666 Playback Fix

Date: 2026-08-19

## Scope

- Fixed roadside scenery and landmarks disappearing before they passed the camera.
- Fixed AI6666 playback reporting a playing state while the media clock stayed frozen and no audio reached the output path.

## Implementation

### Highway Drive

- Replaced phase/index-based scenery recycling with stable world-slot placement.
- Kept each object visible until it passes behind the camera, then recycled only that object.
- Derived object type from the slot's world biome so biome boundaries do not replace the whole roadside population at once.
- Removed the global biome fade-down that temporarily hid all scenery.
- Applied the same stable pass-by lifecycle to roadside landmarks.
- Kept water visibility tied to the current road biome rather than the last processed scenery slot.

### AI6666 Playback

- Added an opt-in fresh media lifetime when resetting the playback graph for an AI6666 track switch.
- Kept direct `HTMLAudioElement` output active and used `captureStream` only for analysis.
- Extended track-switch stall recovery to every provider whose playback URL can be refreshed, including AI6666.

## Verification

- `node --test tests/highway-drive-preset.test.js tests/playback-audio-graph-recovery.test.js`: passed.
- `npm test`: 124 tests passed, 0 failed.
- Highway Drive live CDP checks passed at 1440x900 and 820x720; both canvases were nonblank and the expected biome and landmark rendered.
- AI6666 live playback advanced from 59.51 seconds to 61.17 seconds in 1.7 seconds.
- Media state: `paused=false`, `readyState=4`, no error, `muted=false`, volume `1`.
- Audio graph state: context `running`, capture analysis active, analyser signal `0.332`.

The live checks used the existing Electron instance on CDP port 9237. Tooling verified media-clock advancement and a nonzero audio signal; it did not perform a human listening test.
