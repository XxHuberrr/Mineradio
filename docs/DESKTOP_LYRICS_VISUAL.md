# Desktop Lyrics Visual Baseline

Last saved: 2026-06-22

## Approved Effect

- The approved desktop lyrics effect keeps the lyric fill color true to the in-app lyric color. Do not tint the glyph interior gray, yellow, green, or black for contrast.
- White-background readability is handled by a neutral outside feather only:
  - `.lyric-viewport` uses `filter: drop-shadow(0 1px 2.4px rgba(4,6,12,.58)) drop-shadow(0 0 4.8px rgba(4,6,12,.30))`.
  - `.line` uses a very light white stroke: `-webkit-text-stroke:.18px rgba(255,255,255,.72)`.
  - `.line` text glow stays color-based and subtle: `text-shadow:0 0 1px rgba(255,255,255,.34), ... var(--lyric-shadow-soft), ... var(--lyric-shadow-glow)`.
- The dark/black background result must remain crisp: white lyric core, restrained glow, no gray fog covering the text.
- Highlight-follow may show a soft lyric-progress gold/cyan transition, but the non-highlighted glyph interior must not become dirty or split into gray/yellow bands.

## Interaction Baseline

- Locked desktop lyrics must not block operations behind the lyric window. In locked state, the Electron overlay should be mouse-through.
- Unlock/lock is handled by the main process middle-mouse poller using `GetAsyncKeyState(4)` and the lyric hot bounds. This lets middle-click work even when the overlay is click-through.
- Renderer hover logic must not call pointer capture while locked. Locked hover may show the delayed hint, but it must keep `setPointerCapture(false)`.
- Unlocked state may capture pointer for dragging and the close button only.

## Do Not Regress

- Do not restore `mix-blend-mode`, `difference`, `multiply`, `.line::before`, or `.line::after` contrast layers for lyric readability.
- Do not use dark pseudo text layers or heavy dark strokes that turn the glyph interior gray.
- Do not reintroduce magnet/snap behavior for dragging unless the user explicitly asks.
- Do not make the locked lyric window intercept background clicks in order to support middle-click; keep middle-click in the main-process poller.
- Verify both white and black backgrounds after changes. White should be readable without color pollution; black should stay clear and bright.
