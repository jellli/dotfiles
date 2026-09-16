// The tool card interface: the badge/header, the result line, aggregation
// boundaries, the body slot, and the memos that keep a settled card cheap to
// redraw. Every assertion goes through `toolCard` or a helper it exports - the
// Frame's internals are not the subject.
// Run: node .pi/agent/extensions/test/tool-card.test.mjs
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTestJiti, here } from "./jiti-setup.mjs";

const extensionsDir = join(here, "..");
const jiti = createTestJiti(extensionsDir);
const mod = await jiti(join(extensionsDir, "card/tool-card.ts"));

const plain = (line) => line.replace(/\x1b\[[0-9;]*m/g, "").trimEnd();
const theme = {
  fg: (_color, text) => text,
  bg: (_color, text) => text,
  bold: (text) => text,
};

const execute = async () => ({ content: [], details: {} });
const tool = (name, label = name) => ({
  name,
  label,
  description: "",
  parameters: {},
  execute,
});
const text = (value) => ({ content: [{ type: "text", text: value }] });

// The lifecycle boundaries the card module wires, and the pi they are wired to.
const events = {};
const pi = {
  on(event, handler) {
    events[event] = handler;
  },
  registerTool() {},
};

/**
 * One host tool row.
 *
 * The host keeps `state` per row, the live arguments, and one `lastComponent`
 * per render slot; emulating that here means a re-render behaves exactly like
 * `updateDisplay()` does (both slots re-run, then the component renders).
 */
function hostRow(id, args = {}, cardTheme = theme) {
  const slots = { call: undefined, result: undefined };
  const row = {
    id,
    args,
    state: {},
    // The host starts a row running and clears this when the final result lands.
    isPartial: true,
    isError: false,
    expanded: false,
    invalidations: 0,
    context(slot) {
      return {
        args: row.args,
        toolCallId: id,
        isPartial: row.isPartial,
        isError: row.isError,
        expanded: row.expanded,
        state: row.state,
        cwd: "/tmp",
        lastComponent: slots[slot],
        invalidate: () => {
          row.invalidations += 1;
        },
      };
    },
    call(definition, nextArgs, callTheme = cardTheme) {
      if (nextArgs !== undefined) row.args = nextArgs;
      const component = definition.renderCall(
        row.args,
        callTheme,
        row.context("call"),
      );
      slots.call = component;
      return component;
    },
    result(definition, result, options = {}) {
      row.isPartial = options.isPartial ?? false;
      if (options.isError !== undefined) row.isError = options.isError;
      if (options.expanded !== undefined) row.expanded = options.expanded;
      const component = definition.renderResult(
        result,
        { isPartial: row.isPartial, expanded: row.expanded },
        cardTheme,
        row.context("result"),
      );
      slots.result = component;
      return component;
    },
  };
  return row;
}

/** What the host draws on an updateDisplay: re-run the call slot, then render. */
const frame = (definition, row, width = 80, cardTheme) =>
  row.call(definition, undefined, cardTheme).render(width).map(plain);

// ---------------------------------------------------------------------------
// Badge, bracketed detail, result line
// ---------------------------------------------------------------------------

const read = mod.toolCard(pi, tool("read"), {
  detail: (input) => `${input.args.path} lines 1-80`,
  row: (input) => `row:${input.args.path}`,
  summary: (input) => `${input.output.split("\n").length} lines`,
});

const one = hostRow("read-1", { path: "a.ts" });
assert.deepEqual(
  frame(read, one),
  [" READ  [a.ts lines 1-80]", " └─ ●"],
  "a running call is the badge, the bracketed detail, and the spinner",
);

one.result(read, text("one\ntwo\nthree"));
assert.deepEqual(
  frame(read, one).at(-1),
  " └─ 3 lines",
  "a settled call shows its summary on the result line",
);

// ---------------------------------------------------------------------------
// Consecutive calls of one tool become one group
// ---------------------------------------------------------------------------

const grep = mod.toolCard(pi, tool("grep"), {
  detail: (input) => `"${input.args.pattern}"`,
  row: (input) => `row:${input.args.pattern}`,
});

const first = hostRow("grep-1", { pattern: "alpha" });
const second = hostRow("grep-2", { pattern: "beta" });
const owner = first.call(grep);
second.call(grep);
first.result(grep, text("one\ntwo"));

events.tool_execution_start({ toolName: "bash" });
// A result that lands after the close still reaches its own row.
second.result(grep, text("three\nfour\nfive"));

const grouped = first.call(grep).render(80).map(plain);
assert.ok(grouped[0].includes("GREP"), "the group header keeps the badge");
assert.ok(grouped[0].includes("×2"), "the group header counts its calls");
assert.deepEqual(
  grouped.slice(1),
  ["  ├─ row:alpha", "  └─ row:beta"],
  "rows carry the connector and the unbracketed row text",
);

assert.deepEqual(
  first.call(grep).render(80).map(plain).slice(1),
  ["  ├─ row:alpha", "  └─ row:beta"],
  "a closed group keeps every row when the host re-renders it",
);

first.expanded = true;
assert.deepEqual(
  first.call(grep).render(80).map(plain).slice(1),
  [
    "  ├─ row:alpha",
    "     │ one",
    "     │ two",
    "  └─ row:beta",
    "     │ three",
    "     │ four",
    "     │ five",
  ],
  "expanding a group shows every row's own output under a prefixed line",
);
first.expanded = false;

const later = hostRow("grep-3", { pattern: "gamma" });
assert.deepEqual(
  frame(grep, later),
  [' GREP  ["gamma"]', " └─ ●"],
  "another tool closes the group, so the next call starts a card of its own",
);

for (const boundary of ["agent_start", "agent_settled", "session_shutdown"]) {
  // Start from a closed store: a call after an agent boundary is its own card.
  events.agent_start();
  const before = hostRow(`grep-${boundary}-1`, { pattern: "one" });
  const after = hostRow(`grep-${boundary}-2`, { pattern: "two" });
  before.call(grep);
  after.call(grep);
  assert.ok(
    frame(grep, before)[0].includes("×2"),
    `${boundary}: consecutive calls group first`,
  );
  events[boundary]();
  const fresh = hostRow(`grep-${boundary}-3`, { pattern: "three" });
  assert.ok(
    !frame(grep, fresh)[0].includes("×"),
    `${boundary} closes the group`,
  );
}

assert.deepEqual(
  Object.keys(events).sort(),
  ["agent_settled", "agent_start", "session_shutdown", "tool_execution_start"],
  "the card module wires every aggregation boundary",
);

// ---------------------------------------------------------------------------
// Only the owner is refreshed, and it never propagates
// ---------------------------------------------------------------------------

const own = mod.toolCard(pi, tool("own"), { detail: () => "x" });
const ownerRow = hostRow("own-1", {});
const otherRow = hostRow("own-2", {});
const ownFrame = ownerRow.call(own);
otherRow.call(own);
assert.equal(
  ownerRow.invalidations,
  1,
  "a row joining the group refreshes the owner once",
);

otherRow.result(own, text("b"));
assert.equal(
  ownerRow.invalidations,
  2,
  "a non-owner settling notifies the owner exactly once",
);
otherRow.result(own, text("b again"), { isPartial: true });
assert.equal(
  ownerRow.invalidations,
  2,
  "a streaming non-owner does not notify the owner",
);
ownerRow.result(own, text("a"));
assert.equal(
  ownerRow.invalidations,
  2,
  "the owner settling does not invalidate anything, so it cannot bounce",
);
assert.ok(ownFrame.render(80).length > 0, "the owner still draws the row");

// ---------------------------------------------------------------------------
// aggregate: false
// ---------------------------------------------------------------------------

const find = mod.toolCard(pi, tool("find"), {
  summary: () => "2 results",
  aggregate: false,
});
const findOne = hostRow("find-1", {});
const findTwo = hostRow("find-2", {});
findOne.call(find);
findOne.result(find, text("a\nb"));
findTwo.call(find);
assert.deepEqual(
  frame(find, findOne),
  [" FIND", " └─ 2 results"],
  "a card that opted out draws its own header with no detail",
);
assert.deepEqual(
  frame(find, findTwo),
  [" FIND", " └─ ●"],
  "a consecutive call of the same tool does not join a group",
);

// ---------------------------------------------------------------------------
// The result slot adds nothing
// ---------------------------------------------------------------------------

const slot = mod.toolCard(pi, tool("slot"), { summary: () => "settled" });
const slotRow = hostRow("slot-1", {});
slotRow.call(slot);
const resultSlot = slotRow.result(slot, text("one\ntwo"));
assert.deepEqual(
  resultSlot.render(80),
  [],
  "the result slot draws nothing: the call slot already drew the settled row",
);
assert.equal(
  frame(slot, slotRow).filter((line) => line.includes("SLOT")).length,
  1,
  "so a rendered card carries one header, not two",
);

// ---------------------------------------------------------------------------
// Error preview and expansion
// ---------------------------------------------------------------------------

const edit = mod.toolCard(pi, tool("edit"), { detail: () => "a.ts" });
const failing = hostRow("edit-1", {});
failing.call(edit);
failing.result(edit, text("boom: first line\nsecond line"), { isError: true });
assert.deepEqual(
  frame(edit, failing),
  [" EDIT  [a.ts]", " └─ boom: first line ..."],
  "a collapsed error shows its first line and a muted marker",
);
failing.expanded = true;
assert.deepEqual(
  frame(edit, failing).slice(1),
  [" └─ boom: first line", "second line"],
  "expanding an error shows the whole output",
);

failing.expanded = false;
failing.isError = false;
failing.result(edit, text("one\ntwo"));
assert.deepEqual(frame(edit, failing).at(-1), " └─ 2 lines");
failing.expanded = true;
assert.deepEqual(
  frame(edit, failing).slice(1),
  ["     │ one", "     │ two"],
  "expanding a successful call shows the output block",
);

// ---------------------------------------------------------------------------
// The body slot
// ---------------------------------------------------------------------------

/** A box that fills the result column it is handed, borders included. */
const box = (width) => {
  const inner = Math.max(1, width - 2);
  return [
    `┌${"─".repeat(inner)}┐`,
    `│${" ".repeat(inner)}│`,
    `└${"─".repeat(inner)}┘`,
  ];
};
const bash = mod.toolCard(pi, tool("bash"), {
  detail: (input) => input.args.command,
  body: ({ width, options }) => (options.isPartial ? undefined : box(width)),
});

const shell = hostRow("bash-1", { command: "ls" });
assert.deepEqual(
  frame(bash, shell),
  [" BASH  [ls]", " └─ ●"],
  "a body that yields nothing while running leaves the Frame's spinner",
);

shell.result(bash, text("some output"));
const boxed = frame(bash, shell);
const [top, middle, bottom] = box(80 - 3);
assert.deepEqual(
  boxed,
  [" BASH  [ls]", ` └─${top}`, `   ${middle}`, `   ${bottom}`],
  "a body block glues to the connector and indents to the result column",
);
assert.equal(boxed[1].length, 80, "and a full-width box still fits the card");
assert.equal(
  boxed.filter((line) => line.includes("└─ ")).length,
  0,
  "the Frame draws no result line while the body hands rows over",
);

const quiet = mod.toolCard(pi, tool("quiet"), {
  detail: () => "ls",
  body: ({ options }) => (options.expanded ? box(70) : []),
  summary: () => "3 lines",
});
const quietRow = hostRow("quiet-1", {});
quietRow.call(quiet);
quietRow.result(quiet, text("one\ntwo"));
assert.deepEqual(
  frame(quiet, quietRow),
  [" QUIET  [ls]", " └─ 3 lines"],
  "a body yielding [] falls back to the summary",
);
quietRow.expanded = true;
assert.deepEqual(
  frame(quiet, quietRow).at(-1),
  `   ${box(70).at(-1)}`,
  "and to the body again once it has rows to draw",
);

const stats = mod.toolCard(pi, tool("stats"), {
  detail: () => "ls",
  body: () => ["exit 0 · 1.2s"],
});
const statsRow = hostRow("stats-1", {});
statsRow.call(stats);
statsRow.result(stats, text(""));
assert.deepEqual(
  frame(stats, statsRow).at(-1),
  " └─ exit 0 · 1.2s",
  "a single row from a body is result-line content",
);

const statsSecond = hostRow("stats-2", {});
statsSecond.call(stats);
assert.ok(
  !frame(stats, statsRow).join("\n").includes("×"),
  "a body card draws one card per call, never a group",
);

const listing = mod.toolCard(pi, tool("listing"), {
  detail: () => "ls",
  body: () => ["first row", "second row"],
});
const listingRow = hostRow("listing-1", {});
listingRow.call(listing);
listingRow.result(listing, text(""));
assert.deepEqual(
  frame(listing, listingRow),
  [" LISTING  [ls]", " └─first row", "   second row"],
  "a block glues to the connector and indents the rest under it",
);

// A real theme paints the border through `fg`, so the row starts with an SGR
// sequence: the connector rule reads the row count, never the first byte.
const painted = {
  fg: (_color, value) => `\x1b[38;2;100;100;100m${value}\x1b[39m`,
  bg: (_color, value) => value,
  bold: (value) => value,
};
const paintedBox = mod.toolCard(pi, tool("painted_box"), {
  detail: () => "ls",
  body: ({ theme: bodyTheme, width }) =>
    box(width).map((line) => bodyTheme.fg("accent", line)),
});
const paintedRow = hostRow("painted-1", {}, painted);
paintedRow.call(paintedBox);
paintedRow.result(paintedBox, text(""));
const paintedFrame = frame(paintedBox, paintedRow, 80, painted);
const [boxTop, ...boxRest] = box(80 - 3);
assert.deepEqual(
  paintedFrame,
  [
    " PAINTED_BOX  [ls]",
    ` └─${boxTop}`,
    ...boxRest.map((line) => `   ${line}`),
  ],
  "a box painted with SGR still glues to the connector and keeps its geometry",
);
assert.equal(
  paintedFrame[1].length,
  80,
  "so its right border lands flush with the card instead of being clipped",
);
assert.equal(paintedFrame.at(-1).length, 80, "bottom edge included");

assert.throws(
  () => mod.toolCard(pi, tool("bash"), { body: () => [], aggregate: true }),
  /body with aggregate/,
  "body + aggregate: true is rejected where the card is attached",
);
assert.throws(
  () =>
    mod.toolCard(
      pi,
      {
        ...tool("mcp_aggregated"),
        renderCall: () => ({ render: () => ["row"], invalidate() {} }),
      },
      { aggregate: true },
    ),
  /body with aggregate/,
  "and so is the body the Frame derives for a tool that draws its own card",
);

// ---------------------------------------------------------------------------
// Derived defaults, for a tool that hands in nothing
// ---------------------------------------------------------------------------

const foreign = mod.toolCard(pi, tool("figma_get_file"));
const foreignRow = hostRow("figma-1", { server: "figma", tool: "get_file" });
foreignRow.call(foreign);
assert.deepEqual(
  frame(foreign, foreignRow),
  [" FIGMA_GET_FILE  [figma]", " └─ ●"],
  "a tool that hands in nothing still gets the badge, a derived detail, and the spinner",
);
foreignRow.result(foreign, text("line one\nline two"));
assert.deepEqual(
  frame(foreign, foreignRow),
  [" FIGMA_GET_FILE  [figma]", " └─ 2 lines"],
  "and a derived result line",
);

// A fresh tool name per probe: two calls of one tool would group.
let probes = 0;
function derivedCard(args) {
  probes += 1;
  const definition = mod.toolCard(pi, tool(`derived_${probes}`));
  const row = hostRow(`derived-${probes}`, args);
  row.call(definition);
  return { definition, row };
}

/** The header detail the Frame derived for one set of call arguments. */
function detailOf(args) {
  const probe = derivedCard(args);
  return frame(probe.definition, probe.row)[0].match(/\[(.*)\]$/)?.[1] ?? "";
}

assert.equal(
  detailOf({ server: "figma", tool: "get_file" }),
  "figma",
  "the first short string argument becomes the header detail",
);
assert.equal(
  detailOf({ path: "x".repeat(200) }),
  "",
  "an over-long argument is skipped",
);
assert.equal(detailOf({ depth: 3 }), "", "non-string arguments are skipped");
assert.equal(detailOf({}), "", "no argument means no detail");
assert.equal(
  detailOf({ display: { description: "Wire the badge" } }),
  "Wire the badge",
  "display.description becomes the detail",
);
assert.equal(
  detailOf({ display: "milestone" }),
  "milestone",
  "a bare display string becomes the detail",
);
assert.equal(
  detailOf({ display: { name: "  " } }),
  "",
  "a blank display field is dropped",
);

const single = derivedCard({});
single.row.result(single.definition, text("only line"));
assert.deepEqual(
  frame(single.definition, single.row).at(-1),
  " └─ only line",
  "a single-line output shows itself on the result line",
);
const empty = derivedCard({});
empty.row.result(empty.definition, text(""));
const settled = frame(empty.definition, empty.row);
assert.equal(
  settled.length,
  1,
  "a settled call with no output draws nothing under the badge",
);
assert.ok(settled[0].includes("DERIVED_"), "and the badge is still there");

// A definition that hands in nothing still aggregates: consecutive calls of one
// tool share a header, the way read and grep do.
const derivedGroup = mod.toolCard(pi, tool("figma_grouped"));
const groupedOne = hostRow("figma-group-1", { server: "figma" });
const groupedTwo = hostRow("figma-group-2", { server: "figma" });
groupedOne.call(derivedGroup);
groupedTwo.call(derivedGroup);
assert.ok(
  frame(derivedGroup, groupedOne)[0].includes("×2"),
  "a tool that hands in nothing aggregates its consecutive calls",
);
assert.deepEqual(
  frame(derivedGroup, groupedOne).slice(1),
  ["  ├─ figma", "  └─ figma"],
  "and each row is the detail the Frame derived for that call",
);

// ---------------------------------------------------------------------------
// A tool that draws its own card: the Frame derives a body for it
// ---------------------------------------------------------------------------
// A third-party definition owns its renderer. The Frame keeps the badge, the
// header detail, the connector, and the fallback, and shows what the tool's own
// component draws inside the result column.

/** Stands in for a tool's own card: fixed rows, an invalidate of its own. */
const ownCard = (rows) => ({ render: () => rows, invalidate() {} });

/** A definition that draws its own card, the way a third-party package does. */
const drawingTool = (name, renderCall, renderResult = renderCall) => ({
  ...tool(name),
  renderShell: "self",
  renderCall,
  renderResult,
});

const painting = mod.toolCard(
  pi,
  drawingTool("mcp", () => ownCard(["child header", "child body"])),
);
const paintingRow = hostRow("mcp-1", { server: "figma", tool: "get_file" });
assert.deepEqual(
  frame(painting, paintingRow),
  [" MCP  [figma]", " └─child header", "   child body"],
  "the tool's own rows draw in the result column under the Frame's connector",
);

// The badge is the tool's identity; the objective it declares is the detail.
const declaredRow = hostRow("mcp-declared-1", {
  display: {
    name: "Add badge helper",
    description: "Wire the badge into the header",
  },
});
assert.equal(
  frame(
    mod.toolCard(
      pi,
      drawingTool("mcp_declared", () => ownCard(["call"])),
    ),
    declaredRow,
  )[0],
  " MCP_DECLARED  [Wire the badge into the header]",
  "display.description becomes the header detail of a tool's own card too",
);

// The Frame calls the tool's call renderer while the call runs and its result
// renderer once it settles - never one for the other.
const slots = mod.toolCard(
  pi,
  drawingTool(
    "mcp_slots",
    () => ownCard(["call card"]),
    () => ownCard(["result card"]),
  ),
);
const slotsRow = hostRow("mcp-slots-1", {});
assert.equal(
  frame(slots, slotsRow).at(-1),
  " └─ call card",
  "a running call draws the tool's own call component",
  // One row is result-line content; only a block glues to the connector.
);
slotsRow.result(slots, text("one\ntwo"));
assert.equal(
  frame(slots, slotsRow).at(-1),
  " └─ result card",
  "a settled call draws the tool's own result component",
);

// Backgrounds are the only thing taken from the tool's own rows.
const tinted = mod.toolCard(
  pi,
  drawingTool("mcp_tinted", () =>
    ownCard(["\x1b[48;2;1;2;3m\x1b[38;2;4;5;6mtinted\x1b[39m\x1b[49m"]),
  ),
);
const tintedRow = hostRow("mcp-tinted-1", {});
const tintedLine = tintedRow.call(tinted).render(80)[1];
assert.equal(
  plain(tintedLine),
  " └─ tinted",
  "the tool's row is drawn as it is",
);
assert.ok(!tintedLine.includes("\x1b[48;"), "its background is dropped");
assert.ok(
  tintedLine.includes("\x1b[38;2;4;5;6m"),
  "and its foreground survives",
);

// A renderer with nothing to draw leaves the Frame its own derivations.
const blank = mod.toolCard(
  pi,
  drawingTool("mcp_blank", () => ownCard([])),
);
const blankRow = hostRow("mcp-blank-1", {});
assert.deepEqual(
  frame(blank, blankRow),
  [" MCP_BLANK", " └─ ●"],
  "an empty own card leaves the Frame's spinner while the call runs",
);
blankRow.result(blank, text("one\ntwo"));
assert.deepEqual(
  frame(blank, blankRow),
  [" MCP_BLANK", " └─ 2 lines"],
  "the Frame's summary once it settles",
);
blankRow.result(blank, text("boom\nsecond line"), { isError: true });
assert.equal(
  frame(blank, blankRow).at(-1),
  " └─ boom ...",
  "and the error preview when it failed",
);
assert.deepEqual(
  frame(blank, blankRow)
    .slice(1)
    .map((line) => line.trimEnd()),
  [" └─ boom ..."],
  "so an empty body never doubles the Frame's own result line",
);

const okRow = hostRow("mcp-blank-2", {});
okRow.call(blank);
okRow.result(blank, text("ok"));
assert.equal(
  frame(blank, okRow).at(-1),
  " └─ ok",
  "a single-line output shows itself on the result line",
);

// The tool's own folding stays its own: the real expanded state reaches it, and
// the row hands its component back as `lastComponent` so its state survives.
let seenCallExpanded;
let seenResultOptions;
const seenComponents = [];
const folding = mod.toolCard(
  pi,
  drawingTool(
    "mcp_folding",
    (_args, _theme, renderContext) => {
      seenCallExpanded = renderContext.expanded;
      const component = renderContext.lastComponent ?? ownCard(["call"]);
      seenComponents.push(component);
      return component;
    },
    (_result, options, _theme, renderContext) => {
      seenResultOptions = options;
      return renderContext.lastComponent ?? ownCard(["result"]);
    },
  ),
);
const foldingRow = hostRow("mcp-folding-1", {});
frame(folding, foldingRow);
assert.equal(
  seenCallExpanded,
  false,
  "collapsed state reaches the tool's call renderer",
);
foldingRow.expanded = true;
frame(folding, foldingRow);
assert.equal(
  seenCallExpanded,
  true,
  "expanded state reaches the tool's call renderer",
);
foldingRow.result(folding, text("x"), { expanded: true });
frame(folding, foldingRow);
assert.deepEqual(
  seenResultOptions,
  { isPartial: false, expanded: true },
  "the tool's result renderer gets the real options",
);
assert.equal(
  seenComponents[0],
  seenComponents.at(-1),
  "the row hands the tool's own component back as lastComponent",
);

// A third-party renderer that invalidates while drawing cannot drive the Frame:
// re-running this render from inside it would never settle.
let ownRenders = 0;
const stormy = mod.toolCard(
  pi,
  drawingTool("mcp_storm", (_args, _theme, renderContext) => {
    ownRenders += 1;
    renderContext.invalidate();
    return ownCard(["row"]);
  }),
);
const stormRow = hostRow("mcp-storm-1", {});
frame(stormy, stormRow);
frame(stormy, stormRow);
assert.equal(ownRenders, 2, "the tool's renderer ran on both frames");
assert.equal(
  stormRow.invalidations,
  0,
  "and never reached the host's invalidate, so the Frame cannot re-enter",
);

// The host runs a renderer on every updateDisplay and re-renders the component
// it returned on every frame; the Frame re-derives on the same schedule, so a
// long transcript does not pay for every settled row on every keystroke.
let settledRenders = 0;
const settledOwn = mod.toolCard(
  pi,
  drawingTool(
    "mcp_settled",
    () => ownCard(["call"]),
    () => {
      settledRenders += 1;
      return ownCard([`result ${settledRenders}`]);
    },
  ),
);
const settledRow = hostRow("mcp-settled-1", {});
settledRow.call(settledOwn);
settledRow.result(settledOwn, text("one\ntwo"));
const settledFrame = settledRow.call(settledOwn);
const settledLines = settledFrame.render(80).map(plain);
assert.deepEqual(
  settledLines,
  [" MCP_SETTLED", " └─ result 1"],
  "a settled card draws what its renderer returned",
);
assert.equal(settledRenders, 1, "a settled card is derived once");
for (let redraw = 0; redraw < 4; redraw += 1) {
  assert.deepEqual(
    settledFrame.render(80).map(plain),
    settledLines,
    "a frame with no updateDisplay draws the rows the renderer last drew",
  );
}
assert.equal(
  settledRenders,
  1,
  "so a redraw alone does not run the tool's renderer again",
);
settledRow.result(settledOwn, text("one\ntwo\nthree"));
assert.deepEqual(
  settledFrame.render(80).map(plain),
  [" MCP_SETTLED", " └─ result 2"],
  "an updateDisplay re-derives, the way the host re-runs the slot",
);
assert.equal(settledRenders, 2, "once per repaint");

// A row that is still streaming is derived on every frame: its own card animates
// while it runs, and only the one live row is ever at stake.
let liveRenders = 0;
const liveOwn = mod.toolCard(
  pi,
  drawingTool("mcp_live", () => {
    liveRenders += 1;
    return ownCard([`frame ${liveRenders}`]);
  }),
);
const liveRow = hostRow("mcp-live-1", {});
const liveComponent = liveRow.call(liveOwn);
assert.deepEqual(
  liveComponent.render(80).map(plain),
  [" MCP_LIVE", " └─ frame 1"],
  "a running card draws what its renderer returned",
);
assert.deepEqual(
  liveComponent.render(80).map(plain),
  [" MCP_LIVE", " └─ frame 2"],
  "and is derived again on the next frame, so it keeps drawing",
);
assert.equal(liveRenders, 2, "a running row's renderer runs on every frame");

// Fitting is memoized per (width, ellipsis, minimumWidth): the key must keep
// them apart, or a card would draw a line fitted for another width.
const textMod = await jiti(join(extensionsDir, "card/text.ts"));
const longLine = `${"\x1b[38;2;1;2;3m"}${"x".repeat(40)}${"\x1b[39m"}`;
assert.equal(
  plain(textMod.fitLine(longLine, 20)).length,
  20,
  "a line too wide for the column is truncated to it",
);
assert.equal(
  textMod.fitLine(longLine, 40),
  longLine,
  "the same line at another width is fitted for that width",
);
assert.notEqual(
  textMod.fitLine(longLine, 20, "\u2026"),
  textMod.fitLine(longLine, 20),
  "and another ellipsis is fitted again",
);
assert.equal(
  plain(textMod.fitLine(longLine, 20)).length,
  20,
  "so the first width's line is not served to the second",
);

// ---------------------------------------------------------------------------
// The memos
// ---------------------------------------------------------------------------

let derived = 0;
const memo = mod.toolCard(pi, tool("memo"), {
  summary: (input) => {
    derived += 1;
    return `${input.output.length} chars`;
  },
});
const memoRow = hostRow("memo-1", {});
memoRow.call(memo);
memoRow.result(memo, text("hello"));
assert.deepEqual(frame(memo, memoRow).at(-1), " └─ 5 chars");
frame(memo, memoRow);
assert.equal(derived, 1, "a redraw of the same card reuses the derived line");

// The host drops `lastComponent` (a resize, an expand, /reload) and the module
// builds a new component: the memo lives on the row, so the new one still hits.
const rebuilt = memo.renderCall(memoRow.args, theme, {
  ...memoRow.context("call"),
  lastComponent: undefined,
});
assert.deepEqual(
  rebuilt.render(80).map(plain).at(-1),
  " └─ 5 chars",
  "a rebuilt component draws the same card",
);
assert.equal(
  derived,
  1,
  "the key is (epoch, theme, width) with no component identity in it",
);

// ---------------------------------------------------------------------------
// The card input: a slot reads the row
// ---------------------------------------------------------------------------
// Every slot takes the same card input: what the row holds (its result, the
// tool's text output, its own state, the session's cwd) plus the one way to ask
// for a repaint. Nothing parses the output to recover what the row already has,
// and nothing reaches into the host's context.

// (1) A summary reads the result itself.
const counted = mod.toolCard(pi, tool("counted"), {
  summary: (input) =>
    `${input.result.details.results.length} results in ${input.cwd}`,
});
events.agent_start();
const countedRow = hostRow("counted-1", {});
countedRow.call(counted);
countedRow.result(counted, {
  content: [{ type: "text", text: 'Results for "x" (3 results):' }],
  details: { results: ["a", "b", "c"] },
});
assert.deepEqual(
  frame(counted, countedRow),
  [" COUNTED", " └─ 3 results in /tmp"],
  "a summary reads the result's details and the row's cwd, not the text output",
);

// (2) A detail reads a value the row's own state carries, and the repaint it
// asks for is what shows it. No shiki here: the value is written straight into
// the state, which is exactly what the bash card's async highlight does.
let slotInput;
const stateful = mod.toolCard(pi, tool("stateful"), {
  detail: (input) => {
    slotInput = input;
    return input.state.highlight ?? input.args.command;
  },
});
events.agent_start();
const statefulRow = hostRow("stateful-1", { command: "echo hi" });
assert.deepEqual(
  frame(stateful, statefulRow),
  [" STATEFUL  [echo hi]", " └─ ●"],
  "a row with nothing in its state yet shows the raw call",
);
statefulRow.state.highlight = "cd /tmp && echo hi";
assert.equal(
  slotInput.redraw(),
  undefined,
  "a slot asks for a repaint through the card input's redraw()",
);
assert.equal(
  statefulRow.invalidations,
  1,
  "and redraw() reaches the host through the owner rule",
);
assert.deepEqual(
  frame(stateful, statefulRow),
  [" STATEFUL  [cd /tmp && echo hi]", " └─ ●"],
  "so the value the slot wrote into the row's state reaches the next frame",
);

// (3) A group's rows are derived when the card renders, each from its own call.
const paired = mod.toolCard(pi, tool("paired"), {
  row: (input) => `row:${input.args.pattern}`,
});
events.agent_start();
const pairedFirst = hostRow("paired-1", { pattern: "alpha" });
const pairedSecond = hostRow("paired-2", { pattern: "beta" });
pairedFirst.call(paired);
pairedSecond.call(paired);
const pairedFrame = frame(paired, pairedFirst);
assert.ok(pairedFrame[0].includes("×2"), "two calls draw one card");
assert.deepEqual(
  pairedFrame.slice(1),
  ["  ├─ row:alpha", "  └─ row:beta"],
  "each row is derived from its own call's arguments when the card renders",
);
assert.notEqual(
  pairedFrame[1],
  pairedFrame[2],
  "so the two rows read differently instead of repeating the owner's call",
);

// ---------------------------------------------------------------------------
// The elapsed clock
// ---------------------------------------------------------------------------

assert.ok(memoRow.state.startedAt > 0, "the Frame stamps the row's start time");

// No card surface shows wall time yet (bash's box does, from ticket 02 on), so
// the clock is asserted on the helper a body reads it through.
assert.match(
  mod.elapsedText(memoRow.state),
  /^[0-9.]+s$|^[0-9]+m[0-9]+s$/,
  "elapsed reads off the Frame's clock",
);
assert.equal(
  mod.elapsedText({ startedAt: Date.now() - 60_000 }),
  "1m0s",
  "a minute or more is shown in minutes and seconds",
);
assert.equal(mod.elapsedText({}), "", "a row with no start time shows nothing");

// ---------------------------------------------------------------------------
// The compact cards the extension ships
// ---------------------------------------------------------------------------
// `ui/compact-tool-cards.ts` keeps five Card specs, and the Frame draws them
// like any other card, so the shipped cards are asserted through the same
// interface as everything above instead of through their registration.

const compact = await jiti(join(extensionsDir, "ui/compact-tool-cards.ts"));

/** The Shiki highlight resolves through its own import, so poll for it. */
async function waitForHighlight(ready) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (ready()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("the bash header highlight never resolved");
}

/** Frozen so the bash box's wall clock reads `0.0s` on any machine. */
const realNow = Date.now;
Date.now = () => 1_700_000_000_000;

try {
  events.agent_start();

  const readCard = mod.toolCard(pi, tool("read"), compact.readSpec);
  const readRow = hostRow("compact-read-1", {
    path: "a.ts",
    offset: 10,
    limit: 5,
  });
  readRow.call(readCard);
  readRow.result(readCard, text("one\ntwo"));
  assert.deepEqual(
    frame(readCard, readRow),
    [" READ  [a.ts lines 10-14]", " └─ 2 lines"],
    "the shipped read card brackets its detail and summarizes on the result line",
  );

  const findCard = mod.toolCard(pi, tool("find"), compact.findSpec);
  const findOne = hostRow("compact-find-1", { pattern: "*.ts", path: "src" });
  findOne.call(findCard);
  findOne.result(findCard, text("a.ts\nb.ts"));
  assert.deepEqual(
    frame(findCard, findOne),
    [" FIND  [*.ts in src]", " └─ 2 results"],
    "the shipped find card is a spec: bracketed detail plus a summary",
  );

  const findTwo = hostRow("compact-find-2", { pattern: "*.md" });
  findTwo.call(findCard);
  assert.deepEqual(
    frame(findCard, findTwo),
    [" FIND  [*.md in .]", " └─ ●"],
    "a consecutive find still draws its own card",
  );
  assert.ok(
    !frame(findCard, findTwo)[0].includes("×"),
    "find opted out of aggregation rather than joining a group",
  );

  const lsCard = mod.toolCard(pi, tool("ls"), compact.lsSpec);
  const lsRow = hostRow("compact-ls-1", { path: "src" });
  lsRow.call(lsCard);
  lsRow.result(lsCard, text("a.ts\nb.ts\nc.ts"));
  assert.deepEqual(
    frame(lsCard, lsRow),
    [" LS  [src]", " └─ 3 entries"],
    "the shipped ls card is a spec too",
  );

  // The bash card: the command in the header, the output box in the body.
  const bashCard = mod.toolCard(pi, tool("bash"), compact.bashSpec);
  // A box the Frame hands the result column to: `inner` wide without borders.
  const inner = 80 - 3 - 2;
  const boxRow = (value) => `   │${value.padEnd(inner)}│`;
  const bottomEdge = (label) =>
    `   └─ ${label} ${"─".repeat(80 - 3 - 1 - `└─ ${label} `.length)}┘`;

  const shellRow = hostRow("compact-bash-1", { command: "ls" });
  const runningShell = frame(bashCard, shellRow);
  assert.equal(
    runningShell[0],
    " BASH  [ls]",
    "the header detail is the command, unbracketed by the card itself",
  );
  assert.match(
    runningShell.at(-1),
    /^ └─ [●•] 0\.0s$/,
    "a running call with no output yet is the spinner and the Frame's clock",
  );

  shellRow.result(bashCard, text("one\ntwo\nthree"));
  assert.deepEqual(
    frame(bashCard, shellRow),
    [
      " BASH  [ls]",
      ` └─┌${"─".repeat(inner)}┐`,
      boxRow("one"),
      boxRow("two"),
      boxRow("three"),
      bottomEdge("exit 0 · 0.0s"),
    ],
    "the box glues to the connector, fills the result column, and reports exit stats on its bottom edge",
  );

  const liveRow = hostRow("compact-bash-2", { command: "make" });
  liveRow.call(bashCard);
  liveRow.result(bashCard, text("building\nlinking"), { isPartial: true });
  const live = frame(bashCard, liveRow);
  assert.deepEqual(
    live.slice(0, 4),
    [
      " BASH  [make]",
      ` └─┌${"─".repeat(inner)}┐`,
      boxRow("building"),
      boxRow("linking"),
    ],
    "a streaming box draws the output it already has",
  );
  assert.match(
    live.at(-1),
    /^   └─ [●•] 0\.0s ─+┘$/,
    "and carries the spinner and the clock instead of exit stats",
  );

  const manyRow = hostRow("compact-bash-3", { command: "ls -la" });
  manyRow.call(bashCard);
  manyRow.result(bashCard, text("one\ntwo\nthree\nfour\nfive"));
  const preview = frame(bashCard, manyRow);
  assert.deepEqual(
    preview.slice(2, 5),
    [boxRow("three"), boxRow("four"), boxRow("five")],
    "a collapsed box previews the tail of the output",
  );
  assert.match(
    preview[5],
    /^ {3}│… 2 more lines \(.+ to expand\)/,
    "and says how much of it is hidden",
  );
  assert.equal(preview[5].length, 80, "inside a box fitted to the card width");

  const silentRow = hostRow("compact-bash-4", { command: "true" });
  silentRow.call(bashCard);
  silentRow.result(bashCard, text(""));
  assert.deepEqual(
    frame(bashCard, silentRow),
    [" BASH  [true]", " └─ exit 0 · 0.0s"],
    "a settled call with no output is exit stats on the result line, with no box",
  );

  const failedRow = hostRow("compact-bash-5", { command: "false" });
  failedRow.call(bashCard);
  failedRow.result(bashCard, text("boom: first line\nsecond line"), {
    isError: true,
  });
  const failed = frame(bashCard, failedRow);
  assert.deepEqual(
    failed.slice(0, 3),
    [
      " BASH  [false]",
      ` └─┌${"─".repeat(inner)}┐`,
      boxRow("boom: first line ..."),
    ],
    "a collapsed error box keeps the first line plus the muted marker",
  );
  assert.equal(
    failed.at(-1),
    bottomEdge("err · 0.0s"),
    "and reports the failure on its bottom edge",
  );

  failedRow.expanded = true;
  assert.deepEqual(
    frame(bashCard, failedRow).slice(2, 4),
    [boxRow("boom: first line"), boxRow("second line")],
    "expanding an error wraps every line of it inside the box",
  );

  // The header's Shiki highlight: the body primes it, the header reads it. The
  // row settles first, so the only thing that can ask for a redraw is the
  // highlight landing.
  const highlightedRow = hostRow("compact-bash-6", { command: "echo hi" });
  highlightedRow.call(bashCard);
  highlightedRow.result(bashCard, text("hi"));
  const plainHeader = " BASH  [echo hi]";
  const header = () => frame(bashCard, highlightedRow)[0];
  assert.equal(header(), plainHeader, "the header starts as the plain command");
  await waitForHighlight(() => header() !== plainHeader);
  assert.equal(
    header(),
    " BASH  [cd /tmp && echo hi]",
    "the body primes the highlight and the header picks it up on the redraw it asks for",
  );
  assert.equal(
    header(),
    " BASH  [cd /tmp && echo hi]",
    "a later frame reuses the cached highlight",
  );
  assert.equal(
    highlightedRow.invalidations,
    1,
    "one command is highlighted once, so no redraw is asked for twice",
  );

  // The specs above are only worth anything wired to the tool they belong to.
  events.agent_start();
  const registered = new Map();
  compact.registerCompactToolCards({
    on() {},
    registerTool(definition) {
      registered.set(definition.name, definition);
    },
  });
  assert.deepEqual(
    [...registered.keys()].sort(),
    ["bash", "find", "grep", "ls", "read"],
    "the extension registers the five compact cards",
  );

  /** The header the registered definition for `name` draws for one call. */
  const registeredHeader = (name, args) => {
    const row = hostRow(`registered-${name}`, args);
    return frame(registered.get(name), row)[0];
  };
  assert.equal(
    registeredHeader("read", { path: "a.ts", offset: 10, limit: 5 }),
    " READ  [a.ts lines 10-14]",
    "read is registered with the read spec",
  );
  assert.equal(
    registeredHeader("grep", { pattern: "x", path: "." }),
    ' GREP  ["x" in .]',
    "grep is registered with the grep spec",
  );
  assert.equal(
    registeredHeader("find", { pattern: "*.ts" }),
    " FIND  [*.ts in .]",
    "find is registered with the find spec",
  );
  assert.equal(
    registeredHeader("ls", { path: "src" }),
    " LS  [src]",
    "ls is registered with the ls spec",
  );
  assert.equal(
    registeredHeader("bash", { command: "git status" }),
    " BASH  [git status]",
    "bash is registered with the bash spec",
  );
  // The registered bash card primes the header highlight too, so a command
  // already highlighted shows up as such.
  await waitForHighlight(
    () => registeredHeader("bash", { command: "ls" }) !== " BASH  [ls]",
  );
  assert.equal(
    registeredHeader("bash", { command: "ls" }),
    " BASH  [cd /tmp && ls]",
    "and the highlight it primes reaches the header through that registration",
  );
  assert.equal(
    typeof registered.get("bash").execute,
    "function",
    "and the built-in execution is left untouched",
  );
} finally {
  Date.now = realNow;
}

// ---------------------------------------------------------------------------
// The web cards the extension ships
// ---------------------------------------------------------------------------
// brave-search and ollama-web-fetch hand the Frame a `detail` and a `summary`;
// the badge, the result line, the spinner, and the expansion are the Frame's.

const brave = await jiti(join(extensionsDir, "brave-search/index.ts"));
const webFetch = await jiti(join(extensionsDir, "ollama-web-fetch/index.ts"));

const braveCard = mod.toolCard(
  pi,
  tool("brave_web_search"),
  brave.braveSearchSpec,
);
const search = hostRow("brave-1", { query: "pi coding agent", count: 5 });
assert.deepEqual(
  frame(braveCard, search),
  [' BRAVE_WEB_SEARCH  ["pi coding agent" (count 5)]', " └─ ●"],
  "the shipped search card brackets the query and shows the Frame's spinner",
);

// The tool's own result: its text output plus the details the summary reads.
search.result(
  braveCard,
  brave.formatResults(
    "pi coding agent",
    [{ title: "a", url: "u", description: "d" }],
    false,
  ),
);
assert.equal(
  frame(braveCard, search).at(-1),
  " └─ 1 result",
  "the search card counts its results on the result line",
);

events.agent_start();
const cachedSearch = hostRow("brave-2", { query: "cached query", count: 5 });
cachedSearch.call(braveCard);
cachedSearch.result(
  braveCard,
  brave.formatResults(
    "cached query",
    [
      { title: "a", url: "u", description: "d" },
      { title: "b", url: "u2", description: "d2" },
    ],
    true,
  ),
);
assert.equal(
  frame(braveCard, cachedSearch).at(-1),
  " └─ 2 results · cached",
  "and marks a result served from the cache",
);

const fetchCard = mod.toolCard(
  pi,
  tool("ollama_web_fetch"),
  webFetch.webFetchSpec,
);
events.agent_start();
const page = hostRow("webfetch-1", { url: "https://example.com/page" });
assert.deepEqual(
  frame(fetchCard, page),
  [" OLLAMA_WEB_FETCH  [https://example.com/page]", " └─ ●"],
  "the shipped fetch card brackets the URL",
);
// The tool's own result: its text output plus the details the summary reads.
page.result(fetchCard, {
  content: [
    {
      type: "text",
      text: `${webFetch.fetchHeader("Example Page", 6000)}\n\nChars 1-3000 of 6000 (3000 remaining):\nhello\n\n# live query`,
    },
  ],
  details: { title: "Example Page", totalChars: 6000, links: null },
});
assert.equal(
  frame(fetchCard, page).at(-1),
  " └─ Example Page · 6000 chars",
  "the fetch card reports the page title and its size on the result line",
);

// ---------------------------------------------------------------------------
// The diff card the extension ships
// ---------------------------------------------------------------------------
// pi-diff keeps the diff box; the Frame draws the badge, the header, the
// connector, the column indent, the spinner, and the error preview. The box's
// own geometry is asserted in test/pi-diff.test.mjs.

const diff = await jiti(join(extensionsDir, "ui/pi-diff.ts"));
// A short prefix on purpose: the header fits a path of this length in 80
// columns, so the assertions below can name the whole line.
const diffDir = mkdtempSync("/tmp/tool-card-diff-");
const diffFile = join(diffDir, "a.ts");
writeFileSync(diffFile, "one\ntwo\nthree\n");

let diffTokenized = 0;
const diffTools = [];
diff.registerPiDiff(
  { registerTool: (toolDefinition) => diffTools.push(toolDefinition), on() {} },
  {
    tokenize: async (value) => {
      diffTokenized += 1;
      return [{ content: value }];
    },
  },
);
const diffEdit = diffTools.find(
  (toolDefinition) => toolDefinition.name === "edit",
);

/** One settled edit, drawn through the host's two slots. */
async function settledEdit(id, args) {
  events.agent_start();
  const result = await diffEdit.execute(
    id,
    args,
    new AbortController().signal,
    () => {},
    { cwd: diffDir },
  );
  const row = hostRow(id, args);
  row.call(diffEdit);
  row.result(diffEdit, result);
  frame(diffEdit, row); // the first frame primes the highlight batch
  await new Promise((resolve) => setTimeout(resolve, 0));
  return row;
}

const diffArgs = {
  path: diffFile,
  edits: [{ oldText: "two", newText: "TWO" }],
};
const editRow = await settledEdit("diff-1", diffArgs);
const editFrame = frame(diffEdit, editRow);
assert.equal(
  editFrame[0],
  ` EDIT  [${diffFile}]`,
  "the path is the header detail, bracketed by the Frame",
);
assert.ok(
  editFrame[1].startsWith(" └─┌") && editFrame[1].endsWith("┐"),
  "the diff box glues its top border to the Frame's connector",
);
assert.ok(
  editFrame.join("\n").includes("TWO"),
  "and the change is drawn inside it",
);

// The box lives on the row, so a redraw keeps the rows it already tokenized.
const tokenizedAtSettle = diffTokenized;
assert.ok(tokenizedAtSettle > 0, "the box tokenized the rows it drew");
frame(diffEdit, editRow);
assert.equal(
  diffTokenized,
  tokenizedAtSettle,
  "a redraw reuses that box instead of tokenizing the window again",
);
const diffFooter = editFrame.at(-1);
assert.match(
  diffFooter,
  /^ {3}└─ \d+ lines /,
  "the box closes with its row count, indented to the result column",
);
assert.ok(diffFooter.endsWith("┘"), "under the box's right edge");

// A running edit: the body has nothing to draw yet, so the Frame's spinner.
events.agent_start();
const runningEdit = hostRow("diff-running-1", { path: diffFile, edits: [] });
assert.deepEqual(
  frame(diffEdit, runningEdit),
  [` EDIT  [${diffFile}]`, " └─ ●"],
  "a running edit is the Frame's spinner",
);

// A failed edit draws no diff: the Frame's error preview stands.
events.agent_start();
const failedEdit = hostRow("diff-failed-1", { path: diffFile, edits: [] });
failedEdit.call(diffEdit);
failedEdit.result(
  diffEdit,
  { content: [{ type: "text", text: "boom: nope\nsecond line" }] },
  { isError: true },
);
assert.deepEqual(
  frame(diffEdit, failedEdit),
  [` EDIT  [${diffFile}]`, " └─ boom: nope ..."],
  "a failed edit gets the Frame's error preview instead of a box",
);

// The host re-renders the component it was handed: the Frame is handed back.
assert.equal(
  editRow.call(diffEdit),
  editRow.call(diffEdit),
  "a re-render of the call slot is the same Frame",
);

// A body turns aggregation off (invariant 2), so two consecutive edits draw two
// boxes: a group would have to pick which row's body draws the shared card.
events.agent_start();
const pairRows = [];
for (const name of ["pair-a.ts", "pair-b.ts"]) {
  const path = join(diffDir, name);
  writeFileSync(path, "one\ntwo\nthree\n");
  const args = { path, edits: [{ oldText: "two", newText: "TWO" }] };
  const id = `diff-two-${pairRows.length + 1}`;
  const result = await diffEdit.execute(
    id,
    args,
    new AbortController().signal,
    () => {},
    { cwd: diffDir },
  );
  const row = hostRow(id, args);
  row.call(diffEdit);
  row.result(diffEdit, result);
  pairRows.push({ row, path });
}
const pair = frame(diffEdit, pairRows[1].row);
assert.equal(
  pair[0],
  ` EDIT  [${pairRows[1].path}]`,
  "a consecutive edit draws its own header instead of a group row",
);
assert.ok(!pair.join("\n").includes("×"), "so a body card never groups");

console.log("tool-card: ok");
