/**
 * headroom — universal context-optimization proxy for pi (adapter).
 *
 * Runs a single local headroom proxy (default port 8787) and routes every
 * configured provider through it. headroom compresses tool outputs / logs /
 * file contents before they reach the model (Compress-Cache-Retrieve, ~50-90%
 * token savings) and is transparent to the model.
 *
 * Routing: headroom 0.37+ honors the per-request `x-headroom-base-url` header
 * to pick the upstream for a single request, so ONE proxy instance can serve
 * many providers. Each provider's baseUrl is overridden (same-name
 * registerProvider merge) to point at the proxy, with a header naming its real
 * upstream. The header is stripped by headroom before forwarding upstream.
 *
 * Config: .pi/agent/headroom.json (git-tracked, no secrets)
 *   {
 *     "port": 8787,
 *     "defaultUpstream": "https://www.jiji.cc",   // proxy fallback upstream
 *     "bin": "headroom",                          // optional; PATH lookup by default
 *     "providers": {
 *       "jiji":         { "upstream": "https://www.jiji.cc" },
 *       "deepseek":     { "upstream": "https://api.deepseek.com" },
 *       "ollama-cloud": { "upstream": "https://ollama.com" }
 *     }
 *   }
 *
 * Note: `upstream` must NOT include a path — headroom appends
 * /v1/responses or /v1/chat/completions itself.
 *
 * Behavior:
 *  - On load: spawns the proxy if the port is not already healthy (non-blocking).
 *  - On session_start (all extensions loaded): waits for proxy readiness, then
 *    overrides each provider's baseUrl. Idempotent across /reload and sessions.
 *  - Single-instance discipline lives in proxy-lifecycle.ts: a healthy /livez
 *    or an open port (even if slow to respond) is always reused, never
 *    re-spawned; once healthy, the pidfile records the true listening pid. A
 *    failed spawn releases the guard so a later session_start can retry.
 *  - If the proxy never becomes ready, providers keep their original baseUrls
 *    (pi stays fully usable, just uncompressed).
 *
 * This file only wires config + pi events; all process/fs/network logic is in
 * proxy-lifecycle.ts.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createDefaultDeps, ensureProxy } from "./proxy-lifecycle.js";

const CONFIG_PATH = join(homedir(), ".pi", "agent", "headroom.json");

interface ProviderRoute {
  upstream: string;
  api?: string;
}
interface HeadroomConfig {
  port: number;
  defaultUpstream: string;
  providers: Record<string, ProviderRoute>;
  bin?: string;
}

function loadConfig(): HeadroomConfig | null {
  try {
    if (!existsSync(CONFIG_PATH)) return null;
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as HeadroomConfig;
  } catch (error) {
    console.warn(
      `[headroom] failed to read ${CONFIG_PATH}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

export default async function (pi: ExtensionAPI) {
  const config = loadConfig();
  if (!config) return;
  const { port, defaultUpstream, providers } = config;
  const proxyBase = `http://127.0.0.1:${port}/v1`;

  // config.bin overrides the PATH-resolved default binary; otherwise the
  // module's default deps spawn `headroom` from PATH. Computed once so the
  // load-time kick and session_start share the same deps (and thus the same
  // in-flight attempt).
  const deps = config.bin ? createDefaultDeps(config.bin) : undefined;

  /** Override each provider's baseUrl to route through the proxy. */
  async function applyOverrides(): Promise<void> {
    for (const [id, route] of Object.entries(providers)) {
      try {
        pi.registerProvider(id, {
          baseUrl: proxyBase,
          headers: { "x-headroom-base-url": route.upstream },
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        // Stale ctx happens when the session is replaced (print mode / reload)
        // before the async readiness wait finishes. The next session_start
        // re-applies the overrides, so skip silently.
        if (msg.includes("stale after session replacement")) continue;
        console.warn(`[headroom] failed to override ${id}: ${msg}`);
      }
    }
  }

  // Kick off the proxy at load time (non-blocking) so it warms up while pi boots.
  void ensureProxy(port, defaultUpstream, deps);

  // session_start fires after every extension has registered its providers, so
  // same-name overrides merge over the real registrations (models preserved).
  pi.on("session_start", () => {
    void (async () => {
      if (await ensureProxy(port, defaultUpstream, deps)) {
        await applyOverrides();
      } else {
        console.warn("[headroom] proxy unavailable; keeping original baseUrls");
      }
    })();
  });
}
