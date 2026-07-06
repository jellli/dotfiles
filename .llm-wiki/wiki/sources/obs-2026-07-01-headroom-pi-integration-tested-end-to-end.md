---
type: source
title: "Observation: Headroom-pi integration tested end-to-end"
slug: obs-2026-07-01-headroom-pi-integration-tested-end-to-end
status: observation
created: 2026-07-01
updated: 2026-07-01
relevance: high
observed_at: 2026-07-01T04:13:48.002Z
tags: ["headroom", "compression", "pi-extension"]
source_context: "Testing headroom-pi integration (方式 C)"
---
# ⭐ Observation: Headroom-pi integration tested end-to-end
Built a pi extension at ~/.pi/agent/extensions/headroom-compressor/ that integrates headroom context compression via `before_provider_request` event interception. The extension imports `compress` from `headroom-ai` npm package and calls the local headroom proxy (default http://127.0.0.1:8787) to compress OpenAI-format messages before each LLM request. Also supports Google format (`contents` key). Falls back gracefully if proxy is unreachable.

End-to-end test results:
- pi extension loads correctly and intercepts before_provider_request on every LLM turn (verified with HEADROOM_DEBUG=1)
- headroom proxy v0.28.0 running on port 8787 with HEADROOM_CONTEXT_TOOL=lean-ctx
- compress() calls succeed, returning CompressResult with compressed=true
- Small payloads (system prompt + short conversation ~7-9k tokens) show 0 tokens saved — content is below min_tokens_to_crush (500) threshold and system messages are protected
- Large payloads (44.6KB with 100 JSON objects in tool output) show 36.2% reduction (12530→7999 tokens), SmartCrusher triggered
- Multi-turn tool calls (read file) work correctly through the compression pipeline
- Proxy stats counter (requests_compressed) shows 0 because inline compress() calls go to /v1/compress endpoint, not passthrough proxy requests

Key files: ~/.pi/agent/extensions/headroom-compressor/index.ts, package.json
Prerequisites: pipx install "headroom-ai[all]", headroom proxy --port 8787
*Relevance: high*

*Context: Testing headroom-pi integration (方式 C)*

*Tags: headroom compression pi-extension*
---
*Observed: 2026-07-01T04:13:48.002Z*