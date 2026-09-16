# Pi Tool Cards

Presentation vocabulary for the tool-transcript cards drawn by the tool card module (`agent/extensions/card/`) and the todo HUD.

## Language

**Tool card**:
The transcript block representing one tool execution: a header line plus its result. One module draws every card — `toolCard` in `agent/extensions/card/`; a tool contributes a **Card spec** and, at most, a body slot.
_Avoid_: tool call display, renderer

**Card spec**:
What an adapter hands `toolCard` for one tool: `detail` (header content behind the badge), `row` (content of one row inside an aggregated group), `summary` (collapsed result line), `body` (the one seam for geometry the **Frame** cannot derive), and `aggregate`. Anything derivable from the tool definition is not in it. All four derivation slots take one **Card input**, and the Frame derives `detail`, `row` and `summary` on every render, so a slot reads the result, the row's state and the session's cwd instead of recovering them from the text output.
_Avoid_: options, config

**Card input**:
What the **Frame** hands one slot for one render: `args`, `result`, `output` (the tool's text output), `options`, `theme`, `state` (the row's card state), `cwd`, and `redraw()`. All four derivation slots take the same card input; `body` takes one more field, `width` (the result column).
_Avoid_: props, context

**Frame**:
The half of a **Tool card** the module owns and no adapter draws: badge, header bracketing, result line, error preview, expansion, aggregation, spinner, elapsed clock, bounded memo. A body slot draws inside the Frame's result column, and the Frame draws the result line itself whenever the body yields nothing. The Frame is the only module that calls `context.invalidate`; a slot asks for a repaint through **Card input**'s `redraw()`, and the Frame routes it by its owner rule.
_Avoid_: shell, chrome, layout

**Foreign tool card**:
The card this repo attaches to a tool it does not own — a third-party package, an MCP adapter, or an SDK host. The card supplies the header: the badge carries the tool's identity (its label) and the detail carries the objective it declares (`display.description`, else the first short argument). A tool that draws its own card keeps drawing it under that header, untouched; backgrounds are the only thing removed, the real expanded state passes through, and the card never hides that body. A tool that draws nothing gets the local body. In-repo tools that already draw a card are not wrapped.
_Avoid_: generic card, external card

**Exception list**:
The `exceptions` list in `~/.pi/agent/tool-cards.json`: a matching tool name keeps its own rendering. A trailing `*` means prefix match; an empty list wraps every foreign tool.
_Avoid_: blacklist, whitelist

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

**Re-render**:
The full-document redraw triggered by every input event: the TUI walks all transcript components and rebuilds every line, so its cost grows with the length of the live transcript. The reason long sessions feel laggy while typing.
_Avoid_: repaint, refresh

**Aggregation**:
Collapsing consecutive same-tool calls under one badge header with `├─`/`└─` rows.
_Avoid_: grouping, merging

**HUD**:
The persistent todo overview widget above the editor; only the word "Todos" in its title carries a badge.