---
type: source
title: "Observation: pi-observational-memory v3 architecture: compaction via session_before_compact hook, no saved-token stat"
slug: obs-2026-06-29-pi-observational-memory-v3-architecture-compaction-via-sessi
status: observation
created: 2026-06-29
updated: 2026-06-29
relevance: high
observed_at: 2026-06-29T10:07:11.402Z
tags: ["pi-observational-memory", "compaction", "architecture", "investigation"]
source_context: "Investigating pi-observational-memory extension for token-saving mechanism, saved-token stat, persistence, and cross-extension reachability"
---
# ⭐ Observation: pi-observational-memory v3 architecture: compaction via session_before_compact hook, no saved-token stat
Investigated pi-observational-memory@3.0.2 (path: /Users/hoon/.pi/agent/npm/node_modules/pi-observational-memory, entry src/index.ts). Mechanism: COMPACTION + LLM SUMMARIZATION, not eviction/truncation. It does NOT itself compact Pi messages — instead it hooks Pi's own compaction via `pi.on("session_before_compact", ...)` in src/hooks/compaction-hook.ts and returns `{ compaction: { summary, firstKeptEntryId, tokensBefore, details } }`. The `summary` is rendered by renderSummary() (src/session-ledger/render-summary.ts) from pre-built observations+reflections that background agents (observer/reflector/dropper, src/agents/*) produced earlier on turn_end/agent_end. `tokensBefore` is read from Pi's event.preparation.tokensBefore — just echoed back, not stored. CRITICAL FINDING: there is NO saved-token stat anywhere. Searched src + README for saved|savedTokens|reduction|getStats|metrics|emit|stats — none compute a token-savings delta. observationPoolMetrics() in src/agents/dropper/pool.ts is the only "metrics" object and it measures pool FULLNESS (observationTokens/targetTokens/fullness), not savings. /om:status (src/commands/status.ts) shows counts, progress clocks, pool pressure — no "tokens saved". Persistence: ledger lives as Pi custom entries (pi.appendEntry) appended to the session branch (om.observations.recorded / om.reflections.recorded / om.observations.dropped), plus a compaction `details` (MemoryDetails, type=om.folded). Debug log to getAgentDir()/observational-memory/debug.ndjson when debugLog=true — NOT a stat store. Cross-extension reachability: extension registers only `recall` tool, `/om:status` and `/om:view` commands, and three pi.on hooks. No MCP tool registration, no contextProvider/statusline registration, no exports on a shared object. A render-time ctx component could NOT read any saved-token stat — none exists, and none is exported.
*Relevance: high*

*Context: Investigating pi-observational-memory extension for token-saving mechanism, saved-token stat, persistence, and cross-extension reachability*

*Tags: pi-observational-memory compaction architecture investigation*
---
*Observed: 2026-06-29T10:07:11.402Z*