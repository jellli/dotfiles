// Integration smoke test: loads the migrated todo extension through jiti with a fake
// ExtensionAPI and drives the tool through the unified state transition seam.
import assert from "node:assert/strict";
import { createTestJiti, here } from "./jiti-setup.mjs";

const jiti = createTestJiti(`${here}/..`);

const entries = [];
const widget = {};
let registeredTool;
let registeredCommand;
const pi = {
  registerTool: (tool) => {
    registeredTool = tool;
  },
  registerCommand: (name, def) => {
    registeredCommand = { name, ...def };
  },
  on: () => {},
  appendEntry: (type, data) => entries.push({ type, data }),
  sendMessage: () => {},
};

const module = await jiti.import("../todo/index.ts");
const extension = module.default ?? module;
extension(pi);
assert.ok(registeredTool, "todo tool must be registered");
assert.equal(registeredCommand.name, "todo");

const ctx = {
  mode: "tui",
  isIdle: () => true,
  hasPendingMessages: () => false,
  sessionManager: { getSessionId: () => "session-1", getBranch: () => [] },
  ui: {
    theme: { fg: (_color, text) => text, bg: (_color, text) => text },
    setWidget: (key, lines) => {
      widget[key] = lines;
    },
    notify: () => {},
  },
};

const result = await registeredTool.execute(
  "call-1",
  {
    op: "init",
    list: [{ phase: "Build", items: ["Write test", "Implement state"] }],
  },
  undefined,
  undefined,
  ctx,
);
assert.ok(!result.isError, `init should succeed: ${result.content[0].text}`);
assert.match(result.content[0].text, /initialize todo list \(2 tasks\)/);
assert.equal(entries.length, 1);
assert.equal(entries[0].type, "oh-my-pi-todo");
assert.equal(entries[0].data.phases[0].tasks[0].status, "in_progress");

const failed = await registeredTool.execute(
  "call-2",
  {
    op: "start",
    task: "Missing task",
  },
  undefined,
  undefined,
  ctx,
);
assert.equal(failed.isError, true);
assert.equal(failed.content[0].text, 'Errors: Task "Missing task" not found');
// A failed transition must not persist a snapshot.
assert.equal(entries.length, 1);

// Behavior-preserving rule: legacy per-op error text for target_required.
const blockText = await registeredTool.execute(
  "call-3",
  { op: "block" },
  undefined,
  undefined,
  ctx,
);
assert.equal(
  blockText.content[0].text,
  "Errors: block requires a task or phase target",
);
const unblockText = await registeredTool.execute(
  "call-4",
  { op: "unblock" },
  undefined,
  undefined,
  ctx,
);
assert.equal(
  unblockText.content[0].text,
  "Errors: unblock requires a task or phase target",
);

console.log("PASS migrated todo extension works through the state module seam");
