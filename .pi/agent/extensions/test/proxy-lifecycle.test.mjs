// Unit tests for the headroom proxy lifecycle module — pure fake deps, no
// real subprocess. Covers the single-instance discipline: healthy reuse,
// pidfile trust, port-held, spawn-once, timeout + retry, concurrent sharing.
import assert from "node:assert/strict";
import { createTestJiti, here } from "./jiti-setup.mjs";

const jiti = createTestJiti(`${here}/..`);
const { ensureProxy } = jiti("../headroom/proxy-lifecycle.ts");

/** isHealthy that returns true from the n-th call on (1-based). */
function healthyAfter(n) {
  let count = 0;
  return async () => ++count >= n;
}

function fakeDeps(overrides = {}) {
  const calls = { spawn: 0, syncPidFile: 0, isHealthy: 0 };
  const base = {
    isHealthy: async () => false,
    isPortOpen: async () => false,
    readPidFile: () => null,
    isProcessAlive: () => false,
    listenerPid: () => null,
    syncPidFile: () => {
      calls.syncPidFile++;
    },
    spawn: () => {
      calls.spawn++;
    },
    readyTimeoutMs: 300,
    pollIntervalMs: 5,
  };
  const deps = {
    ...base,
    ...overrides,
    // Count every probe even when the test overrides the result.
    isHealthy: async (...args) => {
      calls.isHealthy++;
      return (overrides.isHealthy ?? base.isHealthy)(...args);
    },
  };
  return { deps, calls };
}

let failures = 0;
const check = (name, ok, extra = "") => {
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + String(extra).slice(0, 120) : ""}`,
  );
  if (!ok) failures++;
};

// 1. already healthy → reuse, no spawn, pidfile synced to true listener
{
  const { deps, calls } = fakeDeps({ isHealthy: async () => true });
  const ok = await ensureProxy(8787, "https://upstream", deps);
  check("healthy reuse resolves true", ok === true);
  check("healthy reuse does not spawn", calls.spawn === 0);
  check("healthy reuse syncs pidfile", calls.syncPidFile === 1);
}

// 2. live recorded pid → trust it, no spawn, poll until healthy
{
  const { deps, calls } = fakeDeps({
    isHealthy: healthyAfter(2),
    readPidFile: () => 1234,
    isProcessAlive: () => true,
    isPortOpen: async () => true,
  });
  const ok = await ensureProxy(8787, "https://upstream", deps);
  check("pidfile trust resolves true", ok === true);
  check("pidfile trust does not spawn", calls.spawn === 0);
}

// 3. port held by another process (even slow to respond) → no spawn
{
  const { deps, calls } = fakeDeps({
    isHealthy: healthyAfter(2),
    isPortOpen: async () => true,
  });
  const ok = await ensureProxy(8787, "https://upstream", deps);
  check("port-held resolves true", ok === true);
  check("port-held does not spawn", calls.spawn === 0);
}

// 4. free port + dead pid → spawn exactly once, poll until healthy
{
  const { deps, calls } = fakeDeps({ isHealthy: healthyAfter(2) });
  const ok = await ensureProxy(8787, "https://upstream", deps);
  check("spawn-once resolves true", ok === true);
  check("spawn-once spawns exactly once", calls.spawn === 1);
  check("spawn-once syncs pidfile on ready", calls.syncPidFile === 1);
}

// 5. never healthy → timeout resolves false; memo cleared so a later call retries
{
  const { deps, calls } = fakeDeps({ readyTimeoutMs: 50, pollIntervalMs: 5 });
  const first = await ensureProxy(8787, "https://upstream", deps);
  check("timeout resolves false", first === false);
  check("timeout spawned once", calls.spawn === 1);

  const second = await ensureProxy(8787, "https://upstream", deps);
  check("retry after timeout resolves false", second === false);
  check("retry spawns again (memo cleared)", calls.spawn === 2);
}

// 6. concurrent callers share one in-flight attempt → spawn exactly once
{
  const { deps, calls } = fakeDeps({ isHealthy: healthyAfter(2) });
  const [a, b] = await Promise.all([
    ensureProxy(8787, "https://upstream", deps),
    ensureProxy(8787, "https://upstream", deps),
  ]);
  check("concurrent callers both resolve true", a === true && b === true);
  check("concurrent callers spawn exactly once", calls.spawn === 1);
}

// 7. injected poll interval drives the readiness poll
{
  const { deps, calls } = fakeDeps({
    isHealthy: healthyAfter(3),
    readyTimeoutMs: 200,
    pollIntervalMs: 5,
  });
  const ok = await ensureProxy(8787, "https://upstream", deps);
  check("poll loop resolves true", ok === true);
  check("poll loop probed 3 times", calls.isHealthy === 3);
}

// 8. default deps exist and spawn uses the PATH-resolved bin
{
  const { createDefaultDeps } = jiti("../headroom/proxy-lifecycle.ts");
  const deps = createDefaultDeps();
  assert.equal(typeof deps.spawn, "function");
  assert.equal(typeof deps.isHealthy, "function");
  assert.equal(typeof deps.isPortOpen, "function");
  check("createDefaultDeps exposes all deps", true);
}

console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
