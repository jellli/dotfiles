---
type: source
title: "Observation: plannotator-enhancer v2: race fix + full integration test"
slug: obs-2026-08-12-plannotator-enhancer-v2-race-fix-full-integration-test
status: observation
created: 2026-08-12
updated: 2026-08-12
relevance: high
observed_at: 2026-08-12T02:40:13.869Z
source_context: "Debugging why plannotator-enhancer didn't auto-activate for user; building integration test"
---
# ⭐ Observation: plannotator-enhancer v2: race fix + full integration test
plannotator-enhancer.ts v2 fixes + verification: (1) NEW real bug found — Node's EventEmitter invokes extension handlers synchronously in registration order without awaiting; plannotator's agent_end completion handler does `await restoreSavedState()` (which awaits applyModelRef) so its FINAL persistState() (phase=idle) lands AFTER my enhancer's re-enter persistState (planning), leaving a stale idle session entry (wrong footer chip + lost savedState snapshot). Fixed with a 60ms delay before the re-enter probe so plannotator's handler settles first — verified: persisted phases end with "planning". (2) Built a full integration harness at /tmp/pln-integration-test.mjs that loads the REAL plannotator package + the enhancer over a shared EventEmitter bus with a fake pi (Proxy with stubs: registerTool/defineTool captured, hasUI=false so submit auto-approves) replicating pi's jiti aliases exactly. Full lifecycle proven: session_start→planning, submit→executing, [DONE:n] markers (content must be text-block ARRAY, not string), completion agent_end→re-enters planning, activeTools includes plannotator_submit_plan. (3) Diagnostics: enhancer appends timestamped events to ~/.pi/agent/plannotator-enhancer.log (loaded/session_start/agent_end transitions). Type-check via ./tsgo passes.
*Relevance: high*

*Context: Debugging why plannotator-enhancer didn't auto-activate for user; building integration test*
---
*Observed: 2026-08-12T02:40:13.869Z*