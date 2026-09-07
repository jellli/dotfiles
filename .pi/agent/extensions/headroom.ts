/**
 * headroom — universal context-optimization proxy for pi.
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
 *  - On load: spawns the proxy if port 8787 is not already healthy (non-blocking).
 *  - On session_start (all extensions loaded): waits for proxy readiness, then
 *    overrides each provider's baseUrl. Idempotent across /reload and sessions.
 *  - If the proxy never becomes ready, providers keep their original baseUrls
 *    (pi stays fully usable, just uncompressed).
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const HEADROOM_BIN = "/Users/hoon/.local/bin/headroom";
const CONFIG_PATH = join(homedir(), ".pi", "agent", "headroom.json");
const RUNTIME_DIR = join(homedir(), ".headroom");
const LOG_PATH = join(RUNTIME_DIR, "headroom.log");
const PID_PATH = join(RUNTIME_DIR, "headroom.pid");
const READY_TIMEOUT_MS = 40_000;
const POLL_INTERVAL_MS = 2_000;

interface ProviderRoute {
  upstream: string;
  api?: string;
}
interface HeadroomConfig {
  port: number;
  defaultUpstream: string;
  providers: Record<string, ProviderRoute>;
}

function loadConfig(): HeadroomConfig | null {
  try {
    if (!existsSync(CONFIG_PATH)) return null;
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as HeadroomConfig;
  } catch (error) {
    console.warn(`[headroom] failed to read ${CONFIG_PATH}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function isHealthy(port: number, timeoutMs = 1_000): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function spawnProxy(port: number, defaultUpstream: string): void {
  try {
    mkdirSync(RUNTIME_DIR, { recursive: true });
    const logFd = openSync(LOG_PATH, "a");
    const child = spawn(
      HEADROOM_BIN,
      ["proxy", "--openai-api-url", defaultUpstream, "--port", String(port), "--no-telemetry"],
      {
        detached: true,
        stdio: ["ignore", logFd, logFd],
        env: { ...process.env, HEADROOM_SKIP_UPSTREAM_CHECK: "1" },
      }
    );
    child.unref();
    writeFileSync(PID_PATH, String(child.pid));
    console.log(`[headroom] spawned proxy pid ${child.pid} on port ${port} (log: ${LOG_PATH})`);
  } catch (error) {
    console.warn(`[headroom] failed to spawn proxy: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Module-level guard: both the load-time kick and session_start can race to
// spawn; only the first caller spawns, the rest just wait for readiness.
let spawnInFlight = false;

export default async function (pi: ExtensionAPI) {
  const config = loadConfig();
  if (!config) return;
  const { port, defaultUpstream, providers } = config;
  const proxyBase = `http://127.0.0.1:${port}/v1`;

  /** Ensure the proxy is running and healthy; returns true when ready. */
  async function ensureProxy(): Promise<boolean> {
    if (await isHealthy(port)) return true;
    if (!spawnInFlight) {
      spawnInFlight = true;
      spawnProxy(port, defaultUpstream);
    }
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      if (await isHealthy(port)) return true;
    }
    return false;
  }

  /** Override each provider's baseUrl to route through the proxy. */
  async function applyOverrides(): Promise<void> {
    for (const [id, route] of Object.entries(providers)) {
      try {
        pi.registerProvider(id, {
          baseUrl: proxyBase,
          headers: { "x-headroom-base-url": route.upstream },
        });
        console.log(`[headroom] ${id} → ${proxyBase} (upstream ${route.upstream})`);
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
  void ensureProxy();

  // session_start fires after every extension has registered its providers, so
  // same-name overrides merge over the real registrations (models preserved).
  pi.on("session_start", () => {
    void (async () => {
      if (await ensureProxy()) {
        await applyOverrides();
      } else {
        console.warn("[headroom] proxy unavailable; keeping original baseUrls");
      }
    })();
  });
}
