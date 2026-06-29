---
type: source
title: "Switch fake-cursor shape per vim mode without touching hardware cursor"
slug: pi-fake-cursor-per-mode-shape
status: insight
created: 2026-06-29
updated: 2026-06-29
category: design
---
# Switch fake-cursor shape per vim mode without touching hardware cursor
Pi's TUI **hides the terminal hardware cursor by default** and renders a "fake cursor" inline in editor content via reverse-video SGR (`\x1b[7m{grapheme}\x1b[0m`). To make a vim-mode cursor change shape per mode (block in normal/visual, underline/beam in insert) without touching the hardware-cursor machinery, post-process the fake cursor's ANSI sequences.

## Pi's cursor architecture (relevant facts)

- `Terminal` interface has `hideCursor()` / `showCursor()` but **no** `setCursorStyle` / DECSCUSR API. You can `terminal.write()` raw bytes (incl. DECSCUSR `\x1b[N q`) if you really want to, but...
- TUI default `showHardwareCursor = false`. A hardware cursor is only enabled via `setShowHardwareCursor(true)` / `showHardwareCursor` setting / `PI_HARDWARE_CURSOR=1`, and is intended for IME candidate-window positioning, not for showing the input cursor.
- The *visible* cursor is the fake one: in `Editor.render()`, the line containing the cursor gets the grapheme under it wrapped as `\x1b[7m{firstGrapheme}\x1b[0m` (block on a character), or `\x1b[7m \x1b[0m` (reverse-video space) when the cursor is at end-of-line.
- `CURSOR_MARKER` (`\x1b_pi:c\x07`, APC) is a zero-width marker positioned at the cursor; TUI strips it and positions the hardware cursor there for IME. Do NOT remove it when rewriting cursor styling.

## Per-mode cursor shape (workable approach)

Implement the rewrite in the `CustomEditor` subclass's `render()`, **after** `applyDimBackground` (or any other line transform) runs and **before** returning lines:

```ts
if (this.vimState.mode === "insert") {
  for (let i = 1; i < bottomBorderIdx; i++) {
    lines[i] = lines[i]!.replace(
      /\x1b\[7m([^\x1b]*)\x1b\[0m/g,
      "\x1b[4m$1\x1b[0m",   // reverse (7) → underline (4)
    );
  }
}
```

- Insert mode: swap SGR `7` (reverse) → `4` (underline). Character keeps its colour, gains an underline. Looks like a thin underline cursor.
- Normal / visual / replace / etc.: leave the base `\x1b[7m` block alone (block cursor).

## Why only trigger on insert

Visual selection highlighting (`highlightRenderedLine` in vim-editor) **also uses `\x1b[7m`** for the selection range. If you rewrote cursor styling in visual mode too, the regex would corrupt the visual-selection highlight. Insert mode never co-occurs with a visual selection, so gating on `mode === "insert"` is the safe boundary.

## Why not DECSCUSR (hardware cursor)

- Would require enabling `setShowHardwareCursor(true)` globally (affects whole TUI, not just your editor).
- Would need to suppress the fake cursor (base editor always emits `\x1b[7m`; you'd have to strip it in post or hack base, both fragile).
- DECSCUSR support varies by terminal; the fake-cursor rewrite is terminal-agnostic.
- Keeps `CURSOR_MARKER` (IME) intact — important for any text input.

## SGR quick reference

| code | effect |
|---|---|
| `\x1b[7m` | reverse video (block cursor) |
| `\x1b[4m` | underline (thin cursor) |
| `\x1b[0m` | reset all attributes |
| `\x1b[5 q` | DECSCUSR beam (hardware only, needs showHardwareCursor) |
| `\x1b[2 q` | DECSCUSR block (hardware only) |

Keep `\x1b[0m` resets — `applyDimBackground` and other transforms depend on lines being re-settable, and the dim-bg re-inject runs on every reset.

## Reference

`.pi/agent/extensions/vim-mode/vim-editor.ts` — `render()`, after the dim-bg loop. See [[pi-custom-editor-bottom-border-vs-autocomplete]] for the surrounding render pipeline this sits in.
*Category: design*
---
*Captured: 2026-06-29*
## Related
_Add links to related pages._