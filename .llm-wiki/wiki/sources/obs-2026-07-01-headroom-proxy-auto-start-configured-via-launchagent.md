---
type: source
title: "Observation: Headroom proxy auto-start configured via LaunchAgent"
slug: obs-2026-07-01-headroom-proxy-auto-start-configured-via-launchagent
status: observation
created: 2026-07-01
updated: 2026-07-01
relevance: high
observed_at: 2026-07-01T06:55:00.059Z
tags: ["headroom", "launchd", "auto-start", "macOS"]
source_context: "Setting up headroom proxy auto-start via launchd"
---
# ⭐ Observation: Headroom proxy auto-start configured via LaunchAgent
Set up headroom proxy as a macOS LaunchAgent for auto-start on login. Plist at ~/Library/LaunchAgents/com.headroom.proxy.plist. Config: runs `headroom proxy --port 8787` with HEADROOM_CONTEXT_TOOL=lean-ctx. KeepAlive=true (auto-restart on crash, 10s throttle). Logs at ~/.headroom/logs/launchd-{stdout,stderr}.log.

Verified: launchctl load succeeds, proxy starts healthy on port 8787, PID managed by launchd.

Management commands:
- Start: `launchctl load ~/Library/LaunchAgents/com.headroom.proxy.plist`
- Stop: `launchctl unload ~/Library/LaunchAgents/com.headroom.proxy.plist`
- Status: `launchctl list | grep headroom`
- Restart: unload + load
*Relevance: high*

*Context: Setting up headroom proxy auto-start via launchd*

*Tags: headroom launchd auto-start macOS*
---
*Observed: 2026-07-01T06:55:00.059Z*