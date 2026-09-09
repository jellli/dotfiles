import assert from "node:assert/strict";
import { createTestJiti, here } from "./jiti-setup.mjs";

const jiti = createTestJiti(`${here}/..`);
const { applyTodoState } = jiti("../todo/todo-state.ts");

function run(state, command) {
  return applyTodoState(state, command);
}

function baseState() {
  return [
    {
      name: "Build",
      tasks: [
        { content: "Write test", status: "in_progress" },
        { content: "Implement state", status: "pending" },
      ],
    },
    {
      name: "Review",
      tasks: [{ content: "Run checks", status: "pending" }],
    },
  ];
}

const empty = [];
const initialized = run(empty, {
  op: "init",
  list: [
    { phase: "Build", items: ["Write test", "Implement state"] },
    { phase: "Review", items: ["Run checks"] },
  ],
});
assert.deepEqual(initialized.errors, []);
assert.deepEqual(initialized.state, [
  {
    name: "Build",
    tasks: [
      { content: "Write test", status: "in_progress" },
      { content: "Implement state", status: "pending" },
    ],
  },
  {
    name: "Review",
    tasks: [{ content: "Run checks", status: "pending" }],
  },
]);
assert.deepEqual(empty, []);

const state = baseState();
const blocked = run(state, {
  op: "block",
  task: "Write test",
  reason: "  waiting\nfor fixture  ",
});
assert.deepEqual(blocked.errors, []);
assert.deepEqual(blocked.state[0].tasks, [
  { content: "Write test", status: "blocked", blocker: "waiting for fixture" },
  { content: "Implement state", status: "in_progress" },
]);
assert.equal(state[0].tasks[0].status, "in_progress");

const started = run(blocked.state, { op: "start", task: "Write test" });
assert.deepEqual(started.errors, []);
assert.equal(started.state[0].tasks[0].status, "in_progress");
assert.equal(started.state[0].tasks[1].status, "pending");

const completed = run(started.state, { op: "done", task: "Write test" });
assert.deepEqual(completed.errors, []);
assert.equal(completed.state[0].tasks[0].status, "completed");
assert.equal(completed.state[0].tasks[1].status, "in_progress");

const duplicate = run(completed.state, {
  op: "append",
  phase: "Build",
  items: ["Implement state", "New task"],
});
assert.deepEqual(duplicate.errors, [
  { code: "duplicate_task", task: "Implement state" },
]);
assert.deepEqual(duplicate.state, completed.state);

const missingTarget = run(completed.state, {
  op: "block",
  reason: "not actionable",
});
assert.deepEqual(missingTarget.errors, [{ code: "target_required" }]);
assert.deepEqual(missingTarget.state, completed.state);

const view = run(completed.state, { op: "view" });
assert.deepEqual(view.errors, []);
view.state[0].tasks[0].content = "changed outside the module";
assert.equal(completed.state[0].tasks[0].content, "Write test");

const unblocked = run(blocked.state, { op: "unblock", task: "Write test" });
assert.deepEqual(unblocked.errors, []);
assert.equal(unblocked.state[0].tasks[0].status, "pending");
assert.equal(unblocked.state[0].tasks[0].blocker, undefined);

const removedPhase = run(completed.state, { op: "rm", phase: "Build" });
assert.deepEqual(removedPhase.errors, []);
assert.deepEqual(removedPhase.state, [
  { name: "Build", tasks: [] },
  { name: "Review", tasks: [{ content: "Run checks", status: "in_progress" }] },
]);

console.log("PASS Todo phase state behavior contract");
