# Pi UI Evolution Plan

Scope: improve local Pi transcript/tool UI while preserving native tool execution and explicit renderer ownership.

## Priority Order

### 1. Extract Shared UI Primitives

Create a small internal UI helper module shared by `pi-diff.ts` and `compact-tool-cards.ts`.

Initial scope:

- ANSI-safe visible-width fitting with `visibleWidth` and `truncateToWidth`.
- Stable line padding for rows with backgrounds or frames.
- Shared success/partial/error status markers.
- Shared tool-header construction where behavior is identical.

Do not abstract diff-only frames or tool-specific layout. Keep one owner per built-in tool.

Verification:

- Both extensions load in a clean Pi process.
- Existing write/edit and read/grep/find/ls/bash behavior remains intact.
- Rendered lines stay within terminal width at narrow and wide sizes.
- `git diff --check` passes.

### 2. Consecutive Read Aggregation

Group consecutive `read` calls into one compact visual group when no other tool call interrupts the sequence.

Design:

- One file header per read.
- Content collapsed by default.
- Group expands as one unit.
- Group closes when another tool result appears.
- Preserve native read execution and result content.

Verification: single read, consecutive reads, interrupted reads, errors, partial results, and expand/collapse behavior.

### 3. Word-Level Diff Highlighting

Pair adjacent deletion/addition rows and apply stronger highlighting only to changed words or characters. Keep the existing row backgrounds and unified/split threshold.

Large diffs should fall back to row-level highlighting to bound cost.

Verification: replacements, pure insert/delete, multiline changes, long lines, empty diff, narrow/wide terminals.

### 4. UI Density Modes

Add minimal `compact`, `comfortable`, and `verbose` modes. Expose a small slash command such as `/ui-density` and keep configuration precedence deterministic.

Mode changes should affect presentation only, not tool execution or ownership.

Verification: switch modes during a session, reload, invalid config, and all existing renderer states.

### 5. Settings Modal

Only after density behavior stabilizes, add a settings modal for live UI controls. Keep actions icon-based where a familiar symbol exists and persist sanitized values.

Verification: open, change, cancel, persist, reload, and invalid-value recovery.

## Supporting UI Rules

### Tool Card Language

- Success marker: `sqrt`-style `v`/`check` marker used by the existing theme implementation.
- Partial/running marker: braille spinner.
- Error marker: `x`.
- Paths use the accent color.
- Secondary details use dim/muted colors.
- Use borders only for genuinely multi-line or review-oriented output such as diffs.
- Keep read/search/bash cards unframed and dense.

### Working Indicator

Keep the current spinner as the default. Treat shimmer/KITT takeover as a separate opt-in change because it owns a live widget and needs lifecycle cleanup.

### Verification Matrix

Every renderer change should cover:

- terminal widths 24, 80, 120, 150, and 200;
- ANSI-colored output and CJK paths;
- empty, success, partial, and error states;
- long bash commands;
- write/edit on the same path, including concurrent mutation safety;
- reload and session replacement where timers or widgets are involved.

For every rendered line, assert `visibleWidth(line) <= width`.

## Explicit Constraints

- `compact-tool-cards.ts` owns `read`, `grep`, `find`, `ls`, and `bash`.
- `pi-diff.ts` owns `write` and `edit`.
- `oh-my-pi-todo.ts` owns the todo HUD.
- Do not load full `pi-pretty` or `pi-facelift` on top of these owners.
- Pi extensions cannot reliably filter arbitrary core transcript rows; use tool renderers, widgets, custom entries, or isolated patches only.
