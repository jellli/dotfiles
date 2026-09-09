# Pi Tool Cards

Presentation vocabulary for the tool-transcript cards rendered by `agent/extensions/ui` and the todo HUD.

## Language

**Tool card**:
The transcript block representing one tool execution: a header line plus its result.
_Avoid_: tool call display, renderer

**Badge**:
The tool-name pill in a card header: the theme's toolTitle color painted as background with black text, one space of padding inside the color on each side. Fixed regardless of execution state — the result line already shows the outcome.
_Avoid_: chip, tag, pill

**Result line**:
The ` └─ ` line under a card header — one space of left margin; carries the spinner while running and the result once settled. For diff/bash boxes the connector attaches directly to the top border (` └─┌…`).
_Avoid_: footer, output line

**Summary**:
The derived one-line result shown on the result line for read/grep/find/ls (e.g. `23 matches in 9 files`), rendered in the muted color.
_Avoid_: stats, preview

**Diff box**:
The bordered diff viewer for edit/write, drawn directly after `└─ ` with the whole border indented to the result-line content column.

**Aggregation**:
Collapsing consecutive same-tool calls under one badge header with `├─`/`└─` rows.
_Avoid_: grouping, merging

**HUD**:
The persistent todo overview widget above the editor; only the word "Todos" in its title carries a badge.