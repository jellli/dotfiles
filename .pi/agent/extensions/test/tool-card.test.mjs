// The tool card interface: the badge/header, the result line, aggregation
// boundaries, the body slot, and the memos that keep a settled card cheap to
// redraw. Every assertion goes through `toolCard` or a helper it exports - the
// Frame's internals are not the subject.
// Run: node .pi/agent/extensions/test/tool-card.test.mjs
import assert from "node:assert/strict";
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
function hostRow(id, args = {}) {
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
    call(definition, nextArgs) {
      if (nextArgs !== undefined) row.args = nextArgs;
      const component = definition.renderCall(
        row.args,
        theme,
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
        theme,
        row.context("result"),
      );
      slots.result = component;
      return component;
    },
  };
  return row;
}

/** What the host draws on an updateDisplay: re-run the call slot, then render. */
const frame = (definition, row, width = 80) =>
  row.call(definition).render(width).map(plain);

// ---------------------------------------------------------------------------
// Badge, bracketed detail, result line
// ---------------------------------------------------------------------------

const read = mod.toolCard(pi, tool("read"), {
  detail: (args) => `${args.path} lines 1-80`,
  row: (args) => `row:${args.path}`,
  summary: (output) => `${output.split("\n").length} lines`,
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
  detail: (args) => `"${args.pattern}"`,
  row: (args) => `row:${args.pattern}`,
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
  detail: (args) => args.command,
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

assert.throws(
  () => mod.toolCard(pi, tool("bash"), { body: () => [], aggregate: true }),
  /body with aggregate/,
  "body + aggregate: true is rejected where the card is attached",
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

// ---------------------------------------------------------------------------
// The memos
// ---------------------------------------------------------------------------

let derived = 0;
const memo = mod.toolCard(pi, tool("memo"), {
  summary: (output) => {
    derived += 1;
    return `${output.length} chars`;
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
  "the key is (output, theme, width) with no component identity in it",
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

console.log("tool-card: ok");
