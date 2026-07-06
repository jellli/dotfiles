---
type: source
title: "Observation: pi memory extensions: token-save mechanism + stat reachability"
slug: obs-2026-06-29-pi-memory-extensions-token-save-mechanism-stat-reachability
status: observation
created: 2026-06-29
updated: 2026-06-29
relevance: high
observed_at: 2026-06-29T10:12:31.108Z
tags: ["pi", "extensions", "memory", "compaction", "tokens"]
source_context: "Comparing pi-hermes-memory and pi-observational-memory token-saving mechanisms and stat reachability"
---
# ⭐ Observation: pi memory extensions: token-save mechanism + stat reachability
Investigated pi-hermes-memory + pi-observational-memory (both at ~/.pi/agent/npm/node_modules/) for token-saving mechanism and stat tracking.

KEY FINDING: Neither extension emits or persists a cumulative "tokens saved" metric.

pi-observational-memory (the compaction engine):
- Mechanism: hooks host compaction via pi.on("session_before_compact") in src/hooks/compaction-hook.ts → builds a fold projection (src/session-ledger/projection.ts buildCompactionProjection) and returns {compaction:{summary, firstKeptEntryId, tokensBefore, details}}. "tokensBefore" is RECEIVED from the host event (event.preparation.tokensBefore), not computed/persisted by the extension. Also runs LLM agents: observer, reflector, dropper (eviction) in src/agents/. Dropper pool metrics in src/agents/dropper/pool.ts ObservationPoolMetrics = {observationTokens, targetTokens, tokensOverTarget, fullness, activeObservationCount, droppableCount, maxDropsAllowed, overTarget, ready} — these are LIVE pool-fullness metrics, not cumulative savings.
- Stat location: NO persisted token-saved counter. Runtime (src/runtime.ts) only tracks in-flight/error state (consolidationInFlight, compactHookInFlight, lastObserverError, etc.). The only file write is debug-log.ts (appendFileSync to ~/.pi agent dir observational-memory/debug.ndjson, gated on config.debugLog===true) — operator debug trace of dropper/reflector lifecycle, NOT a saved-tokens stat.
- Reachability: om:status command (src/commands/status.ts) shows live pool fullness % via ctx.ui.notify — human-facing notify, not an API. recall tool registered at src/tools/recall-observation.ts. No context-provider / no stat exposed on ctx at render time.

pi-hermes-memory (SQLite-backed long-term memory, NOT a compactor):
- Mechanism: prompt-context.ts buildPromptContext() injects memory markdown blocks into system prompt (memoryMode != 'policy-only'). auto-consolidate.ts triggerConsolidation() spawns child pi process to rewrite memory files on disk when capacity hit — returns {consolidated:boolean, error?}, no token delta. Hooks session_before_compact ONLY to flush pending memories to disk (session-flush.ts:56, gated on flushOnCompact) — not for token reduction.
- Stat: getMemoryStats(dbManager) in sqlite-memory-store.ts returns {total, byProject[], byTarget[]} — COUNT of memory entries via SQLite, NOT tokens saved. Used only inside memory_search tool (memory-search-tool.ts:53) to decide "no memories yet" hint.
- Reachability: exposes 5 MCP tools (memory_search, session_search, skill, memory, memory tool) + ~10 commands. Memory insights/preview-context commands show memory CONTENT, not token-saved metrics. No context-provider registration; nothing exposed on ctx at render time for stats.

CROSS-EXTENSION REACHABILITY: Neither extension exposes a saved-tokens stat reachable by another extension at render time. The only inter-extension surface both share is the host's session_before_compact hook event shape (event.preparation.tokensBefore) — if a render-time ctx component needs a saved-tokens number, it must come from the HOST's compaction engine, not these extensions.
*Relevance: high*

*Context: Comparing pi-hermes-memory and pi-observational-memory token-saving mechanisms and stat reachability*

*Tags: pi extensions memory compaction tokens*
---
*Observed: 2026-06-29T10:12:31.108Z*