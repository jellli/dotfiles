// Foreign tool cards: the host seam, the skip rules, and the two card shapes.
// Run: node .pi/agent/extensions/test/foreign-tool-cards.test.mjs
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestJiti, here } from "./jiti-setup.mjs";

const extensionsDir = join(here, "..");
const jiti = createTestJiti(extensionsDir);
const mod = await jiti(join(extensionsDir, "ui/foreign-tool-cards.ts"));

const plain = (text) => text.replace(/\x1b\[[0-9;]*m/g, "");
// The Text component pads to the render width; compare content, not padding.
const plainLine = (line) => plain(line).trimEnd();
const theme = {
  fg: (_color, text) => text,
  bg: (_color, text) => text,
  bold: (text) => text,
};

// --- exception list ---------------------------------------------------------

const match = mod.exceptionMatcher(["mcp__x", "figma_*", "  "]);
assert.equal(match("mcp__x"), true, "exact name matches");
assert.equal(match("figma_get_file"), true, "prefix pattern matches");
assert.equal(match("mcp__y"), false, "unrelated name does not match");
assert.equal(mod.exceptionMatcher([])("anything"), false, "empty list matches nothing");

assert.deepEqual(mod.readExceptionList("/definitely/missing/tool-cards.json"), [], "missing file means no exceptions");
const dir = mkdtempSync(join(tmpdir(), "tool-cards-"));
const good = join(dir, "good.json");
writeFileSync(good, JSON.stringify({ exceptions: ["a", 7, "  ", "b*"] }));
assert.deepEqual(mod.readExceptionList(good), ["a", "b*"], "reads strings and drops the rest");
const bad = join(dir, "bad.json");
writeFileSync(bad, "{ not json");
assert.deepEqual(mod.readExceptionList(bad), [], "broken file means no exceptions");

// --- header data ------------------------------------------------------------

assert.equal(plain(mod.argDetail({ server: "figma", tool: "get_file" }, theme)), "[figma]", "first short string argument becomes the header detail");
assert.equal(mod.argDetail({ path: "x".repeat(200) }, theme), "", "an over-long argument is skipped");
assert.equal(mod.argDetail({ depth: 3 }, theme), "", "non-string arguments are skipped");
assert.equal(mod.argDetail({}, theme), "", "no argument means no detail");
assert.equal(plain(mod.outputSummary("only line", theme)), "only line", "a single-line output shows itself");
assert.equal(plain(mod.outputSummary("a\nb\nc", theme)), "3 lines", "a longer output shows a count");

assert.deepEqual(mod.runDisplay({ display: "milestone" }), { name: "milestone" }, "a bare display string becomes the name");
assert.deepEqual(
  mod.runDisplay({ display: { name: "n", description: "d" } }),
  { name: "n", description: "d" },
  "display name and description are read",
);
assert.deepEqual(mod.runDisplay({ display: { name: "  " } }), {}, "blank display fields are dropped");
assert.deepEqual(mod.runDisplay({}), {}, "no display means no title");

// --- background stripping ---------------------------------------------------

assert.equal(mod.stripBackground("\x1b[48;2;1;2;3mtext\x1b[49m"), "text", "a truecolor background is dropped");
assert.equal(plain(mod.stripBackground("\x1b[41mred\x1b[0m")), "red", "a basic background is dropped");
assert.ok(
  mod.stripBackground("\x1b[38;2;1;2;3mx\x1b[39m").includes("\x1b[38;2;1;2;3m"),
  "the foreground color survives",
);

// --- install: wrap, skip, cache, dispose ------------------------------------

const execute = async () => ({ content: [], details: {} });
const definition = (name) => ({ name, label: name, description: "", parameters: {}, execute });

const calls = [];
const aggregation = {
  wrap(tool, options) {
    calls.push(tool.name);
    return { ...tool, renderShell: "self", renderCall: () => null, renderResult: () => null };
  },
};

class FakeRunner {
  constructor(tools) {
    this.tools = tools;
  }
  getAllRegisteredTools() {
    return this.tools;
  }
}

// An in-repo tool that already draws a card, and one that never adopted the
// card language: only the first is skipped.
const cardedOwnDefinition = {
  ...definition("codegraph_query"),
  renderCall: () => null,
};
const foreignTool = { definition: definition("figma_get_file"), sourceInfo: { path: "/tmp/node_modules/pi-figma/index.ts" } };
const ownTool = { definition: cardedOwnDefinition, sourceInfo: { path: join(extensionsDir, "codegraph/index.ts") } };
const plainOwnTool = { definition: definition("figma_plain"), sourceInfo: { path: join(extensionsDir, "figma/index.ts") } };
const exceptedTool = { definition: definition("brave_web_search"), sourceInfo: { path: "/tmp/node_modules/pi-brave/index.ts" } };
const runner = new FakeRunner([foreignTool, ownTool, plainOwnTool, exceptedTool]);

let wrappedNames = [];
const install = mod.installForeignToolCards({
  constructors: [FakeRunner],
  aggregation,
  isExcepted: mod.exceptionMatcher(["brave_*"]),
  ownRoot: extensionsDir,
  onWrapped: (names) => {
    wrappedNames = names;
  },
});

const first = runner.getAllRegisteredTools();
assert.equal(first[0].definition.renderShell, "self", "a foreign tool gets the card");
assert.equal(first[0].definition.execute, execute, "execution is untouched");
assert.deepEqual(
  calls,
  ["figma_get_file", "figma_plain"],
  "foreign tools and in-repo tools without a card go through the wrapper",
);
assert.equal(first[1], ownTool, "an in-repo tool that already draws a card is left alone");
assert.equal(first[2].definition.renderShell, "self", "an in-repo tool without a card gets one");
assert.equal(first[3], exceptedTool, "an excepted tool is left alone");
assert.deepEqual(
  wrappedNames,
  ["figma_get_file", "figma_plain"],
  "the wrapped names are reported",
);

const second = runner.getAllRegisteredTools();
assert.equal(second[0].definition, first[0].definition, "the card is cached per definition");

install.dispose();
assert.equal(runner.getAllRegisteredTools()[0].definition, foreignTool.definition, "dispose removes the listener");

// --- card for a tool that draws its own content -----------------------------

const childLines = ["child header", "child body"];
const child = {
  render: (width) => childLines.map((line) => line.slice(0, Math.max(1, width))),
  invalidate() {},
};
const withRenderer = {
  ...definition("mcp"),
  renderShell: "self",
  renderCall: () => child,
  renderResult: () => child,
};
const card = mod.wrapForeignDefinition(withRenderer, "mcp", aggregation);

const context = {
  args: { server: "figma", tool: "get_file" },
  toolCallId: "call-1",
  isPartial: false,
  isError: false,
  expanded: false,
  state: {},
  lastComponent: undefined,
  invalidate() {},
};
const result = { content: [{ type: "text", text: "line one\nline two" }] };

const call = card.renderCall(context.args, theme, context).render(80).map(plainLine);
assert.ok(call[0].includes("MCP"), "the badge carries the tool label");
assert.ok(call[0].includes("[figma]"), "the header carries the argument detail");
assert.ok(call[1].includes("child header"), "the tool's own card follows the header");

const collapsed = card
  .renderResult(result, { isPartial: false, expanded: false }, theme, context)
  .render(80)
  .map(plainLine);
assert.ok(collapsed[0].includes("child header"), "the body shows without expanding");

const expanded = card
  .renderResult(result, { isPartial: false, expanded: true }, theme, context)
  .render(80)
  .map(plainLine);
assert.ok(expanded[1].includes("child body"), "every body line shows");

// The badge is the tool's identity; display.description becomes the detail.
const displayArgs = {
  display: { name: "Add badge helper", description: "Wire the badge into the header" },
};
const displayCall = card
  .renderCall(displayArgs, theme, { ...context, args: displayArgs })
  .render(80)
  .map(plainLine);
assert.ok(displayCall[0].includes("MCP"), "the badge stays the tool label");
assert.ok(
  displayCall[0].includes("Wire the badge into the header"),
  "display.description becomes the header detail",
);

// The tool's own card renders untouched: nothing is removed from it.
const titled = {
  ...definition("mcp"),
  renderCall: () => ({
    render: () => ["mcp server figma", "body line"],
    invalidate() {},
  }),
};
const titledCall = mod
  .wrapForeignDefinition(titled, "mcp", aggregation)
  .renderCall(context.args, theme, context)
  .render(80)
  .map(plainLine);
assert.ok(
  titledCall.some((line) => line.includes("mcp server figma")),
  "the tool's own title line stays",
);
assert.ok(titledCall.some((line) => line.includes("body line")), "every body line stays");

// A renderer with nothing to draw falls back to the summary result line.
const empty = {
  ...definition("mcp"),
  renderCall: () => ({ render: () => [], invalidate() {} }),
  renderResult: () => ({ render: () => [], invalidate() {} }),
};
const emptyCard = mod.wrapForeignDefinition(empty, "mcp", aggregation);
const emptyResult = emptyCard
  .renderResult(result, { isPartial: false, expanded: false }, theme, context)
  .render(80)
  .map(plainLine);
assert.equal(emptyResult[0], " └─ 2 lines", "an empty body falls back to the summary");

const single = emptyCard
  .renderResult({ content: [{ type: "text", text: "ok" }] }, { isPartial: false, expanded: false }, theme, context)
  .render(80)
  .map(plainLine);
assert.equal(single[0], " └─ ok", "a single-line output shows itself");

// Folding stays the tool's own: the real expanded state passes through.
let seenCallExpanded;
let seenResultOptions;
const recorder = {
  ...definition("mcp"),
  renderCall: (_args, _theme, renderContext) => {
    seenCallExpanded = renderContext.expanded;
    return { render: () => ["body"], invalidate() {} };
  },
  renderResult: (_result, options) => {
    seenResultOptions = options;
    return { render: () => ["body"], invalidate() {} };
  },
};
const recorderCard = mod.wrapForeignDefinition(recorder, "mcp", aggregation);
const collapsedContext = { ...context, expanded: false, state: {} };
recorderCard.renderCall(context.args, theme, collapsedContext).render(80);
assert.equal(seenCallExpanded, false, "collapsed state reaches the tool's call renderer");
recorderCard
  .renderResult(result, { isPartial: false, expanded: false }, theme, collapsedContext)
  .render(80);
assert.equal(seenResultOptions.expanded, false, "collapsed state reaches the tool's result renderer");

const expandedContext = { ...context, expanded: true, state: {} };
recorderCard.renderCall(context.args, theme, expandedContext).render(80);
assert.equal(seenCallExpanded, true, "expanded state reaches the tool's call renderer");
recorderCard
  .renderResult(result, { isPartial: false, expanded: true }, theme, expandedContext)
  .render(80);
assert.equal(seenResultOptions.expanded, true, "expanded state reaches the tool's result renderer");

// --- probe: the host class is still reachable -------------------------------

const constructors = await mod.discoverRunnerConstructors();
assert.ok(
  constructors.length > 0,
  "no ExtensionRunner class found: pi changed ExtensionRunner.getAllRegisteredTools, so foreign cards silently stopped working",
);

// --- wiring: the real seam is patched, and the lifecycle hooks register ----

const events = [];
await mod.registerForeignToolCards({ on: (event) => events.push(event) });
assert.deepEqual(
  events.sort(),
  ["agent_settled", "agent_start", "session_shutdown", "tool_execution_start"],
  "the aggregation lifecycle hooks are registered",
);
const hub = Symbol.for("dotfiles.foreign-tool-cards.v1");
assert.equal(
  constructors.some((ctor) => Object.getOwnPropertySymbols(ctor.prototype).includes(hub)),
  true,
  "a real host runner class carries the hub",
);

console.log(`foreign-tool-cards: ok (${constructors.length} host class copies)`);
