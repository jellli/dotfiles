---
type: source
title: "Observation: Plannotator tool-loss root cause diagnosed"
slug: obs-2026-08-04-plannotator-tool-loss-root-cause-diagnosed
status: observation
created: 2026-08-04
updated: 2026-08-04
relevance: high
observed_at: 2026-08-04T02:41:28.698Z
source_context: "Debugging why LLM couldn't find plannotator tools after plan completion"
---
# ⭐ Observation: Plannotator tool-loss root cause diagnosed
Root cause of "model can't find tools after a task completes" with plannotator: (1) on plan completion plannotator returns to idle phase and strips plannotator_submit_plan from active tools (its #387 fix) and stops injecting the plan-mode system prompt; (2) restoreSavedState restores the tool snapshot captured at plan-mode ENTRY via pi.setActiveTools(), which REPLACES (not merges) the active set — tools registered/toggled after entry are silently dropped and never come back (registerTool merges into current active set, so dropped tools stay dropped); (3) the user's custom footer (statusline.ts via ctx.ui.setFooter) replaces the default footer, so plannotator's own ctx.ui.setStatus indicator is never visible. Extension load order: packages → settings extensions → auto-discovered ~/.pi/agent/extensions/*.ts, so local extensions' handlers run after plannotator's.
*Relevance: high*

*Context: Debugging why LLM couldn't find plannotator tools after plan completion*
---
*Observed: 2026-08-04T02:41:28.698Z*