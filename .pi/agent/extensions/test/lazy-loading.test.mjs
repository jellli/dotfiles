// Regression tests for startup-only imports and provider route fallbacks.
import assert from "node:assert/strict";
import Module from "node:module";
import { createTestJiti, here } from "./jiti-setup.mjs";

const jiti = createTestJiti(`${here}/..`);
const originalLoad = Module._load;
let codegraphLoads = 0;
Module._load = function (request, ...args) {
  if (request === "@colbymchenry/codegraph") codegraphLoads++;
  return originalLoad.call(this, request, ...args);
};

try {
  const codegraphTools = jiti("../codegraph/tools.ts");
  assert.equal(
    codegraphLoads,
    0,
    "CodeGraph SDK must not load during extension import",
  );

  const registeredTools = [];
  const pi = {
    on() {},
    registerTool(tool) {
      registeredTools.push(tool.name);
    },
    registerCommand() {},
  };
  codegraphTools.registerTools(pi);
  codegraphTools.registerInitCommand(pi);
  assert.deepEqual(registeredTools, [
    "codegraph_explore",
    "codegraph_query",
    "codegraph_impact",
    "codegraph_status",
  ]);

  const headroom = jiti("../headroom/index.ts");
  const route = { upstream: "https://api.example.test" };
  assert.deepEqual(
    headroom.proxyProviderConfig("http://127.0.0.1:8787/v1", route),
    {
      baseUrl: "http://127.0.0.1:8787/v1",
      headers: { "x-headroom-base-url": "https://api.example.test" },
    },
  );
  assert.deepEqual(headroom.directProviderConfig(route), {
    baseUrl: "https://api.example.test",
    headers: {},
  });
  console.log("ALL PASS");
} finally {
  Module._load = originalLoad;
}
