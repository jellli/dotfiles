---
type: source
title: "Observation: pi-hermes-memory persistence + cross-extension reachability audited"
slug: obs-2026-06-29-pi-hermes-memory-persistence-cross-extension-reachability-au
status: observation
created: 2026-06-29
updated: 2026-06-29
relevance: high
observed_at: 2026-06-29T10:08:58.428Z
tags: ["pi-hermes-memory", "persistence", "reachability", "audit"]
source_context: "Cross-extension reachability + persistence audit of pi-hermes-memory for technical report Q3/Q4"
---
# ⭐ Observation: pi-hermes-memory persistence + cross-extension reachability audited
Audited pi-hermes-memory (~/.pi/agent/npm/node_modules/pi-hermes-memory/src).

PERSISTENCE (all under AGENT_ROOT = ~/.pi/agent by default, or PI_CODING_AGENT_DIR env override):
- Markdown memory store (MemoryStore, src/store/memory-store.ts): writes MEMORY.md, USER.md, failures.md into globalDir = ~/.pi/agent/pi-hermes-memory/ (default). pathFor() at L68-72. Atomic via temp+rename. Project-scoped variant writes the same 3 files under ~/.pi/agent/projects-memory/<projectName>/.
- SQLite DB (DatabaseManager, src/store/db.ts): file path = <globalDir>/sessions.db (constructor L120: path.join(memoryDir, 'sessions.db')). WAL mode => also sessions.db-wal + sessions.db-shm. Tables (schema.ts): extension_metadata, sessions, session_files, messages, message_fts (FTS5), memories, memory_fts (FTS5) + sync triggers. memories table mirrors MEMORY.md/USER.md/failures.md entries (target memory|user|failure, category for failures) — written by syncMemoryEntry in sqlite-memory-store.ts.
- Skills (SkillStore, src/store/skill-store.ts): SKILL.md frontmatter files. Global: ~/.pi/agent/pi-hermes-memory/skills/<slug>/SKILL.md. Project: ~/.pi/agent/projects-memory/<projectName>/skills/<slug>/SKILL.md.
- Config (src/config.ts): read-only JSON at ~/.pi/agent/hermes-memory-config.json (DEFAULT_CONFIG_PATH). Never written by extension loadConfig().

CROSS-EXTENSION REACHABILITY at RENDER time:
- NO context provider / setEditorComponent / statusline renderer registration. grep for context|addon|provider|registerTool|setEditorComponent|statusline found zero registration sites.
- 4 registered MCP tools (pi.registerTool): name="memory" (memory-tool.ts L196), name="memory_search" (memory-search-tool.ts L17), name="session_search" (session-search-tool.ts, both anchors+legacy variants L41/L120), name="skill_manage" (skill-tool.ts L92, SKILL_MANAGE_TOOL_NAME="skill_manage").
- 9 slash commands (pi.registerCommand): memory-consolidate, memory-index-sessions, memory-insights, memory-interview, learn-memory-tool, memory-preview-context, memory-skills, memory-switch-project, memory-sync-markdown.
- 6 event handlers (pi.on): session_start, before_agent_start (RETURNS {systemPrompt} => prompt-injectable), message_end, session_shutdown, resources_discover (returns {skillPaths}, consumed by pi skill discovery), session_before_compact.
- No 'tokens saved' / usage stat written to disk OR surfaced via a registered tool. db.ts getStats()/getPath() defined (L767/L781) but have ZERO callers in src/. memory-tool usage field is percent chars (e.g. "42% — 2100/5000 chars") returned in tool details only, not a file a statusline could read.
- Therefore a TUI statusline from another extension could reach this extension ONLY by (a) reading the on-disk files directly (MEMORY.md/USER.md/failures.md, sessions.db, SKILL.md files, hermes-memory-config.json) or (b) invoking the 4 MCP tools. It CANNOT access in-process state.
*Relevance: high*

*Context: Cross-extension reachability + persistence audit of pi-hermes-memory for technical report Q3/Q4*

*Tags: pi-hermes-memory persistence reachability audit*
---
*Observed: 2026-06-29T10:08:58.428Z*