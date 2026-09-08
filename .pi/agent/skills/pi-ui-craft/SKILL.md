---
name: pi-ui-craft
description: Design and implement polished Pi TUI extensions, tool cards, diff/read/bash renderers, widgets, statuslines, themes, and settings overlays. Use when modifying Pi terminal UI, renderer output, tool cards, layout, ANSI styling, Shiki highlighting, widgets, or when evaluating pi-diff, pi-pretty, pi-facelift, or oh-my-pi UI patterns.
---

# Pi UI Craft

## Mission

Build dense, readable, theme-aware Pi terminal UI. Preserve tool behavior. Change presentation through render hooks, Components, widgets, and config rather than rewriting domain logic.

## Before Editing

1. Read local extension ownership and registration order.
2. Check whether another extension already owns the tool name. Never register `read`, `write`, `edit`, `bash`, `find`, `grep`, or `ls` twice.
3. Inspect Pi SDK types for `renderCall`, `renderResult`, `renderShell`, `context.lastComponent`, `context.invalidate`, `options.isPartial`, and `options.expanded`.
4. State layout assumptions: terminal width, collapsed behavior, error state, streaming state, and theme.

## Renderer Recipe

- Start from the SDK factory definition and spread/wrap it.
- Keep original `execute()` safety, validation, abort, queues, and result shape.
- Use `renderShell: "self"` only when the renderer owns the complete block.
- Keep `renderCall` cheap; return a stable `Text` or custom `Component`.
- Keep component state in `context.state` or `context.lastComponent`.
- For async Shiki work: cache by theme/language/content, render a fallback, then call `context.invalidate()`.
- Handle partial, error, empty, collapsed, expanded, narrow, and wide states explicitly.

## Terminal Layout Rules

- Measure visible cells with `visibleWidth`; truncate with `truncateToWidth`.
- Pad to stable widths before applying row backgrounds or borders.
- Reserve columns for rails, dividers, line numbers, and outer frames before rendering code.
- Prefer an open-right frame for inline tool output; use closed boxes for overlays/settings.
- Use `theme.fg`, `theme.bg`, `theme.bold`, and `theme.get*Ansi`; do not hardcode one palette when Pi theme tokens exist.
- Keep sections unframed unless they are a real tool, modal, repeated item, or overlay.
- Do not nest cards or add explanatory UI copy that the user does not need.

## Diff UI

Use a structured diff model: context/add/del/separator rows with old/new line numbers and stats. Render unified on narrow terminals; split only when both sides fit. Add subtle line/gutter backgrounds, compact line numbers, dim separators, hunk labels, and word-level emphasis for paired replacements. Make layout and palette configurable, but keep one layout per multi-edit call when consistency matters.

## Widgets and Statusline

Use `ctx.ui.setWidget(key, component, { placement: "aboveEditor" })` for live rows. Own the host loader only when restoring it on disable/end/reload. Dispose timers. For statuslines, render ordered blocks from normalized config; sub-toggles control content inside a block, not ordering.

## Config and Interaction

Use precedence `environment > project config > global config > defaults`. Sanitize unknown/invalid values. Persist settings atomically. Use a settings modal for multiple live controls; use a slash command for status/reset. Keep visual controls compact: icons for actions, toggles for booleans, menus for choices, sliders/steppers for numbers.

## Verification

- Load the extension in a clean Pi process.
- Run focused unit tests for pure layout, ANSI width, config normalization, and tool execution preservation.
- Smoke-test `write -> edit`, errors, empty diffs, partial renders, and concurrent same-path mutations.
- Inspect at narrow and wide widths, with ANSI stripped and visible width measured.
- Confirm async highlighting eventually invalidates and no renderer ownership conflict exists.
- Reload Pi before judging a changed extension in an existing session.
- Confirm aggregated rows show real tail-first paths (`fitPath`), and cross-reload flags (e.g. HUD auto-cleared) persist via session entries, not module globals.

## Session & Token Debugging (when asked about input-token bloat)

Session JSONL (`~/.pi/agent/sessions/<project>/<id>.jsonl`) exposes per-request `message.usage.input`; compaction entries carry a `summary` that is re-sent in full every request and grows without bound (observations accumulate). Compaction fires near `contextWindow − reserveTokens` (deepseek-v4-flash: 128k → ~111k). Levers: `keepRecentTokens` (post-compact thinness), `reserveTokens` (earlier trigger), one-off compact with `customInstructions`, or a fresh session. Details in [REFERENCE.md](REFERENCE.md).

## Local Map

- `extensions/ui/compact-tool-cards.ts`: compact `read`, `grep`, `find`, `ls`, `bash` cards.
- `extensions/ui/pi-diff.ts`: local `write`/`edit` diff owner, Shiki, unified/split rendering.
- `extensions/todo/index.ts`: task HUD and live widget patterns.
- `extensions/statusline.ts`: statusline/widget customization.
- `extensions/vim-mode/`: editor-level TUI customization.

See [PLAN.md](PLAN.md) for the prioritized local UI evolution sequence. See [REFERENCE.md](REFERENCE.md) for patterns extracted from `pi-diff`, `pi-pretty`, and `pi-facelift`.
