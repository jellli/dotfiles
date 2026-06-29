---
type: source
title: "CustomEditor subclass: bottom border is not last line when autocomplete active"
slug: pi-custom-editor-bottom-border-vs-autocomplete
status: insight
created: 2026-06-29
updated: 2026-06-29
category: bugfix
---
# CustomEditor subclass: bottom border is not last line when autocomplete active
When subclassing pi's `CustomEditor` (or `Editor`) and post-processing `super.render(width)` output, the bottom border is **not** `lines[lines.length - 1]` when autocomplete is active.

## Base editor render structure

`Editor.render(width)` returns an array shaped like:

```
[0]                       top border (─ chars)
[1 .. N]                  visible content lines
[N+1]                     bottom border (─ chars OR `─── ↑N more` scroll hint)
[N+2 ..]                  autocomplete menu lines  ← appended AFTER bottom border
```

The bottom border line's visible content is purely `─` runes (borderColor = `theme.fg('borderMuted', text)`), possibly truncated to make room for a scroll indicator like `─── ↓ N more`.

Autocomplete menu lines come from `SelectList.render(contentWidth)` — they contain menu text, NOT border glyphs. They are appended after the bottom border and follow it.

## The bug this caused in vim-mode

`vim-editor.ts` had three locations assuming `lines.length - 1` is the bottom border:

1. `bottomBorderIdx = lines.length - 1` — used for recoloring the bottom border into `▀` glyphs, dim-bg application range, and content-area padding.
2. `last = lines.length - 1` — for injecting the vim mode label (`NORMAL`/`INSERT`) into the bottom border.
3. `rIdx >= renderedLines.length - 1` — break condition in the visual-selection highlight loop.

When autocomplete was active, all three broke:
- recolor corruption: turned the last autocomplete menu line into `▀` glyphs
- dim-bg loop missed autocomplete rows entirely
- mode label got written into the autocomplete last line instead of the bottom border
- visual highlight break condition triggered too late (stopped at autocomplete end, not the bottom border)

## Fix: locate bottom border by glyph, not position

Added `findBottomBorderIdx(lines, width)`: scan top-down for the first line whose **visible text** is a full-width run of `─` (optionally with a trailing ` ↑N more` / ` ↓N more` scroll hint). Autocomplete lines are menu text and never match, so they're correctly skipped.

All three call sites switched to use `findBottomBorderIdx`'s result. The visual-highlight function gained a `bottomBorderIdx` parameter and its break became `rIdx >= bottomBorderIdx`.

Fallback when no border-like line is found: `lines.length - 1` (preserves legacy behavior for safety).

## Side-effect worth noting

The dim-bg loop now stops at the real bottom border, so autocomplete rows are **not** given the dim background. This is actually correct — autocomplete is a menu with its own styling. Previously, the loop running to `lines.length-1` was tagging autocomplete rows with dim-bg as a side-effect, which was itself a bug.

## Why not the other two approaches

- **Heuristic scan backwards for first `─`-full line**: too fragile (scroll hints like `─── ↓ N more` had to be handled; what about partial-width borders?). Went with a forward scan since it's cheap.
- **Use base editor's `autocompleteState` / `autocompleteList`**: both `private`, inaccessible from subclasses.
- **Wrap `super.render()`**: not feasible — render is a black box returning a flat string array.

## Reusable pattern

If you write a `CustomEditor` subclass that post-processes `super.render()` output and needs to find structural boundaries (top border, content, bottom border, autocomplete), locate them by **glyph content**, not by array index. The array shape changes with autocomplete/scroll state — only glyph inspection is reliable. See `findBottomBorderIdx` in [[vim-editor-render-pipeline]] (`.pi/agent/extensions/vim-mode/vim-editor.ts`).
*Category: bugfix*
---
*Captured: 2026-06-29*
## Related
_Add links to related pages._