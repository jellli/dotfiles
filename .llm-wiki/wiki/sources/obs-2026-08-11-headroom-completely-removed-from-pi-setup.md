---
type: source
title: "Observation: Headroom completely removed from pi setup"
slug: obs-2026-08-11-headroom-completely-removed-from-pi-setup
status: observation
created: 2026-08-11
updated: 2026-08-11
relevance: high
observed_at: 2026-08-11T12:19:56.203Z
tags: ["headroom", "pi", "extensions", "cleanup"]
source_context: "Removing headroom from user's pi setup"
---
# ⭐ Observation: Headroom completely removed from pi setup
User asked to fully remove headroom. Key discovery: pi's extension loader (dist/core/extensions/loader.js discoverExtensionsInDir) does NOT filter dot-prefixed dirs — headroom-compressor.disabled/ was still being loaded and showing its belowEditor widget ("headroom: X tokens saved"), which is why user still saw it. Removed: extensions/headroom-compressor.disabled/ (rm -rf), LaunchAgent ~/Library/LaunchAgents/com.headroom.proxy.plist (launchctl bootout + rm), and killed proxy process (headroom proxy --port 8787). Verified: no process, no plist, no extension. Footer stats (💾lc/💾rtk) were also removed from ~/.pi/agent/extensions/statusline.ts earlier per user request.
*Relevance: high*

*Context: Removing headroom from user's pi setup*

*Tags: headroom pi extensions cleanup*
---
*Observed: 2026-08-11T12:19:56.203Z*