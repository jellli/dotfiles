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
 *  - On extension load: reads configuration only; no proxy process or network
 *    probe is started.
 *  - On session_start: preserves/restores direct upstream routes without waiting
 *    for readiness.
 *  - Before the first provider request: starts/waits for the proxy while the
 *    current request remains direct; successful startup routes subsequent
 *    requests through headroom, and failure leaves direct routes active.
 *  - Single-instance discipline lives in proxy-lifecycle.ts: a healthy /livez
 *    or an open port (even if slow to respond) is always reused, never
 *    re-spawned; once healthy, the pidfile records the true listening pid.
 *  - If the proxy never becomes ready, providers use their original upstreams
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

export function proxyProviderConfig(
  proxyBase: string,
  route: ProviderRoute,
): { baseUrl: string; headers: Record<string, string> } {
  return {
    baseUrl: proxyBase,
    headers: { "x-headroom-base-url": route.upstream },
  };
}

export function directProviderConfig(route: ProviderRoute): {
  baseUrl: string;
  headers: Record<string, never>;
} {
  return { baseUrl: route.upstream, headers: {} };
}

export default function (pi: ExtensionAPI): void {
  const config = loadConfig();
  if (!config) return;
  const { port, defaultUpstream, providers } = config;
  const proxyBase = `http://127.0.0.1:${port}/v1`;
  const deps = config.bin ? createDefaultDeps(config.bin) : undefined;

  let proxyReady: Promise<boolean> | undefined;
  let routeMode: "proxy" | "direct" = "direct";

  /** Register proxy routes without waiting for the process to be ready. */
  function applyProxyRoutes(): void {
    for (const [id, route] of Object.entries(providers)) {
      try {
        pi.registerProvider(id, proxyProviderConfig(proxyBase, route));
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes("stale after session replacement")) continue;
        console.warn(
          `[headroom] failed to apply proxy route for ${id}: ${msg}`,
        );
      }
    }
    routeMode = "proxy";
  }

  /** Restore direct upstreams after a proxy startup failure. */
  function applyDirectRoutes(): void {
    for (const [id, route] of Object.entries(providers)) {
      try {
        // Empty headers remove the adapter's proxy header while preserving the
        // provider's normal auth and model configuration through re-registration.
        pi.registerProvider(id, directProviderConfig(route));
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes("stale after session replacement")) continue;
        console.warn(
          `[headroom] failed to restore direct route for ${id}: ${msg}`,
        );
      }
    }
    routeMode = "direct";
  }

  async function ensureRoute(): Promise<void> {
    if (routeMode === "proxy") return;
    proxyReady ??= ensureProxy(port, defaultUpstream, deps);
    if (await proxyReady) {
      applyProxyRoutes();
      return;
    }
    console.warn("[headroom] proxy unavailable; keeping direct upstreams");
    applyDirectRoutes();
    // Allow a later request to retry after a transient startup failure.
    proxyReady = undefined;
  }

  // The provider URL for the current request is resolved before
  // before_provider_request runs. Keep direct routes active initially so a
  // failed lazy startup cannot break that first request.
  pi.on("session_start", () => {
    proxyReady = undefined;
    applyDirectRoutes();
  });

  pi.on("before_provider_request", () => ensureRoute());
}
