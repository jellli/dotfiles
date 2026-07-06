---
type: source
title: "PI_TIMING=1 + bisection + cpu-prof: three-layer startup profiling"
slug: pi-startup-profiling-PI_TIMING
status: insight
created: 2026-06-29
updated: 2026-06-29
category: insight
---
# PI_TIMING=1 + bisection + cpu-prof: three-layer startup profiling
Pi has a built-in startup profiling system, enabled with `PI_TIMING=1`. No external profiling needed for first-pass diagnosis.

## How to use

```bash
PI_TIMING=1 pi -p "."   # print mode, exits cleanly after responding
```

stderr gets a `--- Startup Timings ---` block:

```
  parseArgs: 2ms
  runMigrations: 1ms
  createSessionManager: 2ms
  createRuntime: 1ms
  createAgentSessionRuntime: 2628ms   ← 99% of startup lives here
  readPipedStdin: 0ms
  prepareInitialMessage: 0ms
  initTheme: 0ms
  resolveModelScope: 0ms
  createAgentSession: 0ms
  TOTAL: 2635ms
```

Each `time(label)` call in `main.js` records the ms delta since the previous call. The values are deltas (ms since last checkpoint), not cumulative.

## Where the time goes

`createAgentSessionRuntime` (typically the dominant line) = `createAgentSessionServices` = `await resourceLoader.reload()` = **all extension loading**. This single line hides:

- `loadExtensionsInternal`: serial `for` loop over packages, each = `jiti.import` (TS transpile + module eval) + `factory(api)` (registers handlers)
- `bindExtensions` → `emit(session_start)`: serial `await` of every extension's session_start handler (where `configLoader.load()`, git subprocesses, SQLite opens happen)

There are no `time()` calls inside this 2628ms blob — it's a black box at the `PI_TIMING` level. To attribute it further, either bisect packages (next) or use `--cpu-prof`.

## Attributing `createAgentSessionRuntime` to individual packages

Two techniques, complementary:

### 1. Package bisection (measures real total cost including load)

Temporarily rewrite `.pi/agent/settings.json` `packages` array to a subset, run `PI_TIMING=1 pi -p "."`, parse the `createAgentSessionRuntime` line, restore settings. Median of 3 runs.

```bash
# sketch: jq rewrites packages, parse the timing line with grep -oE
jq --argjson pkgs "$(printf '%s\n' "${pkgs[@]}" | jq -R . | jq -s .)" '.packages = $pkgs' settings.json
ms=$(PI_TIMING=1 pi -p "." 2>&1 | grep -oE 'createAgentSessionRuntime:[[:space:]]*[0-9]+ms' | grep -oE '[0-9]+')
```

Bisecting divides packages in halves, benchmarks each, descends into the slower half. Converges in ~3 levels for 12 packages.

Caveat: single-package cost ≠ marginal cost. jiti + Node startup has fixed overhead charged to every measurement. Cross-validate gross differences, don't treat single-package ms as additive.

### 2. `NODE_OPTIONS='--cpu-prof'` (shows CPU breakdown for one package)

```bash
NODE_OPTIONS='--cpu-prof --cpu-prof-dir=/tmp --cpu-prof-name=X.cpuprofile' pi -p "." >/dev/null
```

Parse with Node:

```javascript
const p = require('/tmp/X.cpuprofile');
// p.nodes[].callFrame{functionName,url}; p.samples[]=nodeId; p.timeDeltas[]=us
// self-time per node = sum timeDeltas where samples[i]==id
```

For `@plannotator/pi-extension` (slowest at 713ms): 69% idle, 4.3% jiti.cjs, ~12% fs ops (read/stat/realpath). Conclusion — the cost was mostly **async wait** (network/config loads in factory), not jiti transpile CPU.

## Key constraints why you can't write an extension to measure this

- Load happens before `ExtensionRunner` exists; no event to hook.
- No `extension_loaded` / `ready` event.
- Extensions can't see each other's load timing.
- `session_start` is the earliest event, fires after all loads done.

This is documented in [the plan](../../../plans/startup-profiler.md) under "不走插件路线的理由".

## Reference

- `scripts/pi-startup-bench.sh` — working bisection script reading `PI_TIMING` output
- `plans/startup-profiler.md` — full investigation notes
- timings.js: `<pi-dist>/dist/core/timings.js` (enable with `PI_TIMING=1`)
*Category: insight*
---
*Captured: 2026-06-29*
## Related
_Add links to related pages._