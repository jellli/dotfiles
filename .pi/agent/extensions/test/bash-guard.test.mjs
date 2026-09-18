// The bash guard: which commands reach the confirmation gate.
// Run: node .pi/agent/extensions/test/bash-guard.test.mjs

import assert from "node:assert/strict";
import { createTestJiti, here } from "./jiti-setup.mjs";

const jiti = createTestJiti(`${here}/..`);
const { default: bashGuard, classify } = await jiti("../bash-guard.ts");

const guarded = [
  "pkill -f vite",
  "killall node",
  "kill -9 12345",
  "sudo kill 12345",
  "lsof -ti:3000 | xargs kill",
  "fuser -k 3000/tcp",
  "npm run dev",
  "pnpm start",
  "cd app && yarn dev",
  "NODE_ENV=dev bun watch",
  "npx vite",
  "next dev",
  "nodemon server.js",
];

for (const cmd of guarded) {
  assert.ok(classify(cmd), `expected a gate for: ${cmd}`);
}

const untouched = [
  "ps aux | grep vite",
  "lsof -i :3000",
  "curl -s localhost:5173",
  "git commit -m 'fix the kill path'",
  'git commit -m "npm run dev was broken"',
  "npm run build",
  "npm run test",
  "cat vite.config.ts",
  "grep -rn nodemon.json .",
];

for (const cmd of untouched) {
  assert.equal(classify(cmd), null, `expected no gate for: ${cmd}`);
}

// The handler: no UI means block; a UI means ask, and the answer decides.
const handlers = [];
bashGuard({ on: (name, fn) => handlers.push([name, fn]) });
assert.deepEqual(
  handlers.map(([name]) => name),
  ["tool_call"],
);
const onToolCall = handlers[0][1];

const bashEvent = (command) => ({ toolName: "bash", input: { command } });
const ctxWithUi = (answer) => ({
  hasUI: true,
  ui: { confirm: async () => answer },
});

const headlessKill = await onToolCall(bashEvent("pkill -f vite"), {
  hasUI: false,
});
assert.equal(headlessKill.block, true, "headless: blocked");

const headlessDev = await onToolCall(bashEvent("npm run dev"), {
  hasUI: false,
});
assert.equal(headlessDev.block, true, "headless dev-server: blocked");
assert.match(
  headlessDev.reason,
  /端口/,
  "the reason tells the model to check the port first",
);
assert.match(
  headlessDev.reason,
  /告诉用户自己启动/,
  "and to hand the launch back to the user when nothing is listening",
);
assert.equal(
  await onToolCall(bashEvent("npm run dev"), ctxWithUi(true)),
  undefined,
  "UI yes: allowed through",
);
assert.equal(
  (await onToolCall(bashEvent("kill -9 42"), ctxWithUi(false))).block,
  true,
  "UI no: blocked",
);
assert.equal(
  await onToolCall(
    { toolName: "read", input: { path: "vite.config.ts" } },
    { hasUI: false },
  ),
  undefined,
  "non-bash tools are untouched",
);

console.log("bash-guard: ok");
