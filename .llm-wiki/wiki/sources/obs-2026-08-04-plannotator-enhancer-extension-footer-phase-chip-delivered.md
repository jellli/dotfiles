---
type: source
title: "Observation: plannotator-enhancer extension + footer phase chip delivered"
slug: obs-2026-08-04-plannotator-enhancer-extension-footer-phase-chip-delivered
status: observation
created: 2026-08-04
updated: 2026-08-04
relevance: high
observed_at: 2026-08-04T02:41:28.700Z
source_context: "Implementing plannotator status display and default-enable for user"
---
# ⭐ Observation: plannotator-enhancer extension + footer phase chip delivered
Delivered two files: (1) ~/.pi/agent/extensions/plannotator-enhancer.ts — auto-enters planning mode on session_start (default on), re-enters planning after plan completion (executing→idle transition detected in agent_end via the plannotator:request plan-mode status event API), and re-asserts the full registered tool set after phase transitions to undo stale-snapshot restores. Config at ~/.pi/agent/plannotator-enhancer.json (autoEnterOnSessionStart, reenterAfterPlanComplete), slash command /plannotator-auto on|off|status. (2) ~/.pi/agent/extensions/statusline.ts — added plannotator phase chip (⏸plan / ▶exec / ∘off) to the existing custom footer, read synchronously from the last custom "plannotator" session entry (type=custom, customType=plannotator, data.phase), refreshed on turn_end/agent_end via tuiRef.requestRender(). Both files type-check with the extensions dir tsgo; enhancer verified to load via jiti.
*Relevance: high*

*Context: Implementing plannotator status display and default-enable for user*
---
*Observed: 2026-08-04T02:41:28.700Z*