// Consecutive-call aggregation: a group closes when another tool starts, and
// everything already drawn must survive that.
// Run: node .pi/agent/extensions/test/aggregation.test.mjs
import assert from "node:assert/strict";
import { join } from "node:path";
import { createTestJiti, here } from "./jiti-setup.mjs";

const extensionsDir = join(here, "..");
const jiti = createTestJiti(extensionsDir);
const mod = await jiti(join(extensionsDir, "ui/lib/aggregation.ts"));

const plain = (text) => text.replace(/\x1b\[[0-9;]*m/g, "");
const theme = {
  fg: (_color, text) => text,
  bg: (_color, text) => text,
  bold: (text) => text,
};

const events = {};
const aggregation = mod.createToolAggregation({
  on: (event, handler) => {
    events[event] = handler;
  },
});
const definition = aggregation.wrap(
  {
    name: "read",
    label: "read",
    description: "",
    parameters: {},
    execute: async () => ({ content: [] }),
  },
  {
    line: (args) => args.path,
    summary: (output) => `${output.split("\n").length} lines`,
  },
);

const context = (id, isPartial) => ({
  args: { path: id },
  toolCallId: id,
  isPartial,
  isError: false,
  expanded: true,
  state: {},
  lastComponent: undefined,
  invalidate() {},
});

// Two calls of one tool start together, so they share one group: the first is
// the group owner, the second is a row under the same badge.
const first = context("a.ts", true);
const second = context("b.ts", true);
const owner = definition.renderCall(first.args, theme, first);
definition.renderCall(second.args, theme, second);

// The first call settles, then another tool starts and closes the group.
definition.renderResult(
  { content: [{ type: "text", text: "one\ntwo" }], details: {} },
  { isPartial: false },
  theme,
  first,
);
events.tool_execution_start({ toolName: "bash" });

// A result that lands after the close still reaches its own row.
definition.renderResult(
  { content: [{ type: "text", text: "three\nfour\nfive" }], details: {} },
  { isPartial: false },
  theme,
  second,
);

const frame = plain(owner.render(80).join("\n"));
assert.ok(frame.includes("a.ts"), "the first row keeps its call detail");
assert.ok(
  frame.includes("three"),
  "a result landing after the close reaches its row",
);

// The host re-invokes renderCall on every updateDisplay: a resize, an expand, or
// any other invalidation. The closed group must come back whole.
const again = definition.renderCall(first.args, theme, first);
const redrawn = plain(again.render(80).join("\n"));
assert.ok(
  redrawn.includes("a.ts") && redrawn.includes("b.ts"),
  `a re-render after the close keeps the whole group, drew:\n${redrawn}`,
);

console.log("aggregation: ok (a closed group survives a re-render)");
