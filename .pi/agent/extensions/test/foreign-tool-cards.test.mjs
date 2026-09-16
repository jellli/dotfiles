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
assert.equal(
  mod.exceptionMatcher([])("anything"),
  false,
  "empty list matches nothing",
);

assert.deepEqual(
  mod.readExceptionList("/definitely/missing/tool-cards.json"),
  [],
  "missing file means no exceptions",
);
const dir = mkdtempSync(join(tmpdir(), "tool-cards-"));
const good = join(dir, "good.json");
writeFileSync(good, JSON.stringify({ exceptions: ["a", 7, "  ", "b*"] }));
assert.deepEqual(
  mod.readExceptionList(good),
  ["a", "b*"],
  "reads strings and drops the rest",
);
const bad = join(dir, "bad.json");
writeFileSync(bad, "{ not json");
assert.deepEqual(
  mod.readExceptionList(bad),
  [],
  "broken file means no exceptions",
);

// --- header data ------------------------------------------------------------

// The header-default derivations (the first short argument, `display.*`, the
// summary for a text output) live in the card module now; their assertions are
// in test/tool-card.test.mjs.

// --- background stripping ---------------------------------------------------

// The stripping the Frame does for a card that draws itself lives in the card
// module now; the assertions stay here, next to the memo that keeps it cheap.
const stripMod = await jiti(join(extensionsDir, "card/strip-background.ts"));
const strip = (text) => stripMod.stripBackground(text);

assert.equal(
  strip("\x1b[48;2;1;2;3mtext\x1b[49m"),
  "text",
  "a truecolor background is dropped",
);
assert.equal(
  plain(strip("\x1b[41mred\x1b[0m")),
  "red",
  "a basic background is dropped",
);
assert.ok(
  strip("\x1b[38;2;1;2;3mx\x1b[39m").includes("\x1b[38;2;1;2;3m"),
  "the foreground color survives",
);
assert.equal(
  strip("\x1b[38;2;1;2;3mred\x1b[m"),
  "\x1b[38;2;1;2;3mred\x1b[m",
  "a bare reset survives: dropping it leaks the foreground into the next line",
);

// --- the strip memo evicts the oldest line, it does not wipe the table -------

const memoMod = await jiti(join(extensionsDir, "card/line-memo.ts"));

// One-character lines cost two bytes each in and out, so three of them fit.
let computed = 0;
const memo = memoMod.createTextMemo(6, (text) => {
  computed += 1;
  return text;
});

for (const line of ["a", "b", "c"]) memo.get(line);
assert.equal(computed, 3, "a cold line is computed once");

assert.equal(memo.get("b"), "b", "a retained line is served from the memo");
assert.equal(computed, 3, "a hit does not recompute");

memo.get("d"); // over budget
assert.ok(
  memo.size <= 3,
  `the memo stays within its budget (kept ${memo.size} entries)`,
);
assert.equal(memo.get("c"), "c", "an older retained line still hits");
assert.equal(computed, 4, "a retained line is not recomputed after eviction");

memo.get("a");
assert.equal(computed, 5, "the line the budget pushed out is recomputed");

// A card longer than an entry cap must still be a hit on the next frame: the
// acceptance for ticket 05 (3000 distinct lines, under 1/10 the cost from
// frame 2 on).
const esc = String.fromCharCode(27);
const frame = [];
for (let index = 0; index < 3000; index += 1)
  frame.push(`${esc}[38;2;1;2;3mline ${index}${esc}[39m`);

const passOverCard = () => {
  const start = performance.now();
  for (const line of frame) strip(line);
  return performance.now() - start;
};

const cold = passOverCard();
// A single frame's wall time is noisy, so the cache-hit cost is read off the
// fastest of 20 passes: a cache that dropped the card would make every pass cost
// the cold one.
let fastestWarm = Number.POSITIVE_INFINITY;
let warmTotal = 0;
for (let round = 0; round < 20; round += 1) {
  const elapsed = passOverCard();
  fastestWarm = Math.min(fastestWarm, elapsed);
  warmTotal += elapsed;
}

assert.ok(
  fastestWarm * 10 < cold,
  `a frame after the first costs a tenth of the cold frame (cold ${cold.toFixed(2)}ms, fastest warm ${fastestWarm.toFixed(3)}ms)`,
);
assert.ok(
  warmTotal < cold * 10,
  `20 frames stay near the price of one cold frame (cold ${cold.toFixed(2)}ms, 20 warm frames ${warmTotal.toFixed(2)}ms)`,
);

// --- install: wrap, skip, cache, dispose ------------------------------------

const execute = async () => ({ content: [], details: {} });
const definition = (name) => ({
  name,
  label: name,
  description: "",
  parameters: {},
  execute,
});

const calls = [];
/** Stands in for the card module's `toolCard`: records what it was handed. */
const cardFactory = (tool) => {
  calls.push(tool.name);
  return {
    ...tool,
    renderShell: "self",
    renderCall: () => null,
    renderResult: () => null,
  };
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
const foreignTool = {
  definition: definition("figma_get_file"),
  sourceInfo: { path: "/tmp/node_modules/pi-figma/index.ts" },
};
const ownTool = {
  definition: cardedOwnDefinition,
  sourceInfo: { path: join(extensionsDir, "codegraph/index.ts") },
};
const plainOwnTool = {
  definition: definition("figma_plain"),
  sourceInfo: { path: join(extensionsDir, "figma/index.ts") },
};
const exceptedTool = {
  definition: definition("brave_web_search"),
  sourceInfo: { path: "/tmp/node_modules/pi-brave/index.ts" },
};
const runner = new FakeRunner([
  foreignTool,
  ownTool,
  plainOwnTool,
  exceptedTool,
]);

let wrappedNames = [];
const install = mod.installForeignToolCards({
  constructors: [FakeRunner],
  card: cardFactory,
  isExcepted: mod.exceptionMatcher(["brave_*"]),
  ownRoot: extensionsDir,
  onWrapped: (names) => {
    wrappedNames = names;
  },
});

const first = runner.getAllRegisteredTools();
assert.equal(
  first[0].definition.renderShell,
  "self",
  "a foreign tool gets the card",
);
assert.equal(first[0].definition.execute, execute, "execution is untouched");
assert.deepEqual(
  calls,
  ["figma_get_file", "figma_plain"],
  "foreign tools and in-repo tools without a card go through the wrapper",
);
assert.equal(
  first[1],
  ownTool,
  "an in-repo tool that already draws a card is left alone",
);
assert.equal(
  first[2].definition.renderShell,
  "self",
  "an in-repo tool without a card gets one",
);
assert.equal(first[3], exceptedTool, "an excepted tool is left alone");
assert.deepEqual(
  wrappedNames,
  ["figma_get_file", "figma_plain"],
  "the wrapped names are reported",
);

const second = runner.getAllRegisteredTools();
assert.equal(
  second[0].definition,
  first[0].definition,
  "the card is cached per definition",
);

install.dispose();
assert.equal(
  runner.getAllRegisteredTools()[0].definition,
  foreignTool.definition,
  "dispose removes the listener",
);

// --- skip rule: the extensions root is a path boundary, not a prefix ---------

// A sibling directory whose name starts with the root is not this repo's code.
class BoundaryRunner {
  constructor(tools) {
    this.tools = tools;
  }
  getAllRegisteredTools() {
    return this.tools;
  }
}

const siblingTool = {
  definition: { ...definition("figma_sibling"), renderCall: () => null },
  sourceInfo: { path: `${extensionsDir}-extra/index.ts` },
};
const boundaryRunner = new BoundaryRunner([siblingTool]);
const boundary = mod.installForeignToolCards({
  constructors: [BoundaryRunner],
  card: cardFactory,
  isExcepted: () => false,
  ownRoot: extensionsDir,
});

assert.equal(
  boundaryRunner.getAllRegisteredTools()[0].definition.renderShell,
  "self",
  "a directory that only starts with the own root is not this repo's code",
);
boundary.dispose();

// --- reload hygiene: a re-install replaces the listener, it does not stack ---

const hubKey = Symbol.for("dotfiles.foreign-tool-cards.v1");

const reloadDefinition = (name) => ({
  ...definition(name),
  renderCall: () => ({
    render: () => [`the tool's own card: ${name}`],
    invalidate() {},
  }),
});

const reloadTool = {
  definition: reloadDefinition("figma_reload"),
  sourceInfo: { path: "/tmp/node_modules/pi-figma/index.ts" },
};
const reloadRunner = new FakeRunner([reloadTool]);

const badgeLines = (lines) =>
  lines.filter((line) => plain(line).includes("FIGMA_RELOAD")).length;

// One probe is one host row: the host gives every tool call its own id, and a
// row's state (the repaint counter the Frame keeps its card caches against)
// belongs to that row. Probing the same id twice would be the same row.
let probeRows = 0;
const renderOwnCard = (definition) =>
  definition
    .renderCall({}, theme, {
      args: {},
      toolCallId: `reload-call-${(probeRows += 1)}`,
      isPartial: false,
      isError: false,
      expanded: false,
      state: {},
      lastComponent: undefined,
      invalidate() {},
    })
    .render(80)
    .map(plainLine);

// The registry the extension wires to session_shutdown, exercised here on its own.
const lifecycleMod = await jiti(join(extensionsDir, "card/lifecycle.ts"));
const reloadLifecycle = lifecycleMod.createLifecycle();

// The card a reload installs is the real one: what is under test is the badge a
// re-install does or does not double, which only the Frame draws. What the card
// draws for a definition that ships a renderer is covered by test/tool-card.test.mjs.
const pi = { on() {}, registerTool() {} };
const cardModule = await jiti(join(extensionsDir, "card/tool-card.ts"));

const installOptions = {
  constructors: [FakeRunner],
  card: (toolDefinition) => cardModule.toolCard(pi, toolDefinition),
  isExcepted: () => false,
  ownRoot: extensionsDir,
  lifecycle: reloadLifecycle,
};

const firstReload = mod.installForeignToolCards(installOptions);
assert.equal(
  badgeLines(renderOwnCard(reloadRunner.getAllRegisteredTools()[0].definition)),
  1,
  "a foreign card carries one header",
);
assert.equal(reloadLifecycle.size, 1, "the install registers its teardown");

// What /reload does: the host still holds the original definition, and the new
// module instance installs its own listener for it.
const secondReload = mod.installForeignToolCards(installOptions);
const reloadHub = FakeRunner.prototype[hubKey];
assert.equal(
  reloadHub.listeners.size,
  1,
  "one listener per hub, not one per reload",
);
assert.equal(
  badgeLines(renderOwnCard(reloadRunner.getAllRegisteredTools()[0].definition)),
  1,
  "no double header after a reload",
);

// The failure the owner key prevents, reproduced: a listener that does not know
// about the one already installed wraps the card a second time.
const strangerReload = mod.installForeignToolCards({
  ...installOptions,
  owner: "someone-else",
});
assert.equal(
  reloadHub.listeners.size,
  2,
  "a different owner is a second listener",
);
assert.equal(
  badgeLines(renderOwnCard(reloadRunner.getAllRegisteredTools()[0].definition)),
  2,
  "two listeners draw two headers: what /reload used to do",
);
strangerReload.dispose();
assert.equal(reloadHub.listeners.size, 1, "disposing the stranger leaves ours");

reloadLifecycle.disposeAll();
assert.equal(reloadHub.listeners.size, 0, "teardown releases the hub listener");
assert.equal(
  reloadRunner.getAllRegisteredTools()[0].definition,
  reloadTool.definition,
  "and the definition goes back to the host's own",
);
secondReload.dispose();
firstReload.dispose();

// --- the teardown registry: LIFO, once, and a removal handle ----------------

const teardownOrder = [];
const registry = lifecycleMod.createLifecycle();
const removeFirst = registry.add(() => teardownOrder.push("first"));
registry.add(() => teardownOrder.push("second"));
registry.add(() => teardownOrder.push("third"));
removeFirst();
assert.equal(registry.size, 2, "a removal handle unregisters the teardown");

registry.disposeAll();
assert.deepEqual(
  teardownOrder,
  ["third", "second"],
  "teardowns run newest first",
);
assert.equal(registry.size, 0, "the registry is empty after teardown");

const onceRegistry = lifecycleMod.createLifecycle();
let runs = 0;
onceRegistry.add(() => {
  runs += 1;
  throw new Error("a failing teardown must not stop the rest");
});
onceRegistry.add(() => {
  runs += 1;
});
onceRegistry.disposeAll();
onceRegistry.disposeAll();
assert.equal(
  runs,
  2,
  "every teardown runs once, and a failure does not stop the rest",
);

// --- the registry covers a live spinner timer too ---------------------------

const spinnerMod = await jiti(join(extensionsDir, "card/spinner.ts"));
const spinnerState = {};
let spinnerTicks = 0;
spinnerMod.syncSpinner(spinnerState, true, () => {
  spinnerTicks += 1;
});
assert.ok(spinnerState.timer, "a running spinner starts a timer");

await new Promise((resolve) => setTimeout(resolve, 170));
assert.ok(spinnerTicks > 0, "the spinner ticks while the tool runs");

// The registry the entry point disposes on session_shutdown.
lifecycleMod.cardLifecycle.disposeAll();
const ticksAtTeardown = spinnerTicks;
await new Promise((resolve) => setTimeout(resolve, 170));
assert.equal(spinnerTicks, ticksAtTeardown, "teardown stops the spinner timer");
assert.equal(spinnerState.timer, undefined, "and forgets the timer");

// The lifecycle does not stop after a teardown: a new spinner registers again.
spinnerMod.syncSpinner(spinnerState, true, () => {});
assert.ok(spinnerState.timer, "a spinner started after teardown runs");
spinnerMod.syncSpinner(spinnerState, false, () => {});
assert.equal(spinnerState.timer, undefined, "settling stops it directly");

// --- reload hygiene: the [compaction] patch is replaced, not stacked --------

const compactMod = await jiti(join(extensionsDir, "ui/compact-tool-cards.ts"));
const patchKey = compactMod.COMPACTION_RENDER_PATCH;

function FakeCompaction() {}
FakeCompaction.prototype.expanded = false;
FakeCompaction.prototype.message = { tokensBefore: 1234 };

const hostRender = function () {
  return ["the host's own summary"];
};

// The state a previous module instance leaves behind: the host render it
// replaced, and the patch it installed.
function staleRender() {
  return ["the old module's summary"];
}
FakeCompaction.prototype.render = staleRender;
FakeCompaction.prototype[patchKey] = {
  owner: compactMod.COMPACTION_PATCH_OWNER,
  token: {},
  original: hostRender,
  patched: staleRender,
};

const patchLifecycle = lifecycleMod.createLifecycle();
compactMod.installCompactCompactionRenderer(FakeCompaction, patchLifecycle);
assert.equal(
  patchLifecycle.size,
  1,
  "the prototype patch registers its teardown",
);

const collapsedSummary = FakeCompaction.prototype.render.call({
  expanded: false,
  message: { tokensBefore: 1234 },
});
assert.ok(
  collapsedSummary.join("\n").includes("[compaction]"),
  "the new module's render code is live after a reload",
);

FakeCompaction.prototype.expanded = true;
const expandedSummary = FakeCompaction.prototype.render.call({
  expanded: true,
  message: { tokensBefore: 1234 },
});
assert.deepEqual(
  expandedSummary,
  ["the host's own summary"],
  "the stale patch was restored before the new one, so nothing stacks",
);
FakeCompaction.prototype.expanded = false;

// Installing again from the same module instance is a no-op.
compactMod.installCompactCompactionRenderer(FakeCompaction, patchLifecycle);
assert.equal(patchLifecycle.size, 1, "a repeat install registers nothing new");
assert.deepEqual(
  FakeCompaction.prototype.render.call({
    expanded: true,
    message: { tokensBefore: 1234 },
  }),
  ["the host's own summary"],
  "and does not stack a second patch",
);

patchLifecycle.disposeAll();
assert.equal(
  FakeCompaction.prototype.render,
  hostRender,
  "teardown restores the host's own render",
);

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
  constructors.some((ctor) =>
    Object.getOwnPropertySymbols(ctor.prototype).includes(hub),
  ),
  true,
  "a real host runner class carries the hub",
);

console.log(
  `foreign-tool-cards: ok (${constructors.length} host class copies)`,
);
