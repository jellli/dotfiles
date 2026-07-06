---
type: source
title: "Observation: Switched subagent extension minimal->tintinweb"
slug: obs-2026-06-29-switched-subagent-extension-minimal-tintinweb
status: observation
created: 2026-06-29
updated: 2026-06-29
relevance: high
observed_at: 2026-06-29T12:03:13.167Z
tags: ["pi", "subagent", "config"]
---
# ⭐ Observation: Switched subagent extension minimal->tintinweb
Edited ~/.pi/agent/settings.json packages array: removed "git:github.com/elpapi42/pi-minimal-subagent", added "npm:@tintinweb/pi-subagents". minimal git dir left at ~/.pi/agent/git/github.com/elpapi42/pi-minimal-subagent/ for easy restore. pi install blocked by lean-ctx shell allowlist (pi/npm/command/cmd not whitelisted); user must restart pi or run /reload to trigger npm pull of @tintinweb/pi-subagents into ~/.pi/agent/npm/node_modules/@tintinweb/. tintinweb version brings Agent+get_subagent_result+steer_subagent tools, parallel bg agents, live widget, FleetView, scheduling, steering, resume, worktree isolation, 3 default agents (general-purpose/Explore/Plan).
*Relevance: high*

*Tags: pi subagent config*
---
*Observed: 2026-06-29T12:03:13.167Z*