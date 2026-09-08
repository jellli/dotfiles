/**
 * headroom proxy lifecycle — deep module behind one seam.
 *
 * Owns the single-instance discipline for the headroom proxy: spawn, health
 * check, pidfile trust, port probe, and the readiness poll. The pi adapter
 * (index.ts) only reads config and applies provider overrides.
 *
 * Interface: ensureProxy(port, upstream, deps?) → Promise<boolean>.
 * - Concurrent callers share one in-flight promise (memoized): only the first
 *   spawns, the rest await the same result.
 * - A failed attempt clears the memo, so a later call can retry.
 * - All process/fs/network access goes through the injectable deps, so tests
 *   fake them and never touch a real subprocess.
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";

const RUNTIME_DIR = join(homedir(), ".headroom");
const LOG_PATH = join(RUNTIME_DIR, "headroom.log");
const PID_PATH = join(RUNTIME_DIR, "headroom.pid");
const DEFAULT_READY_TIMEOUT_MS = 40_000;
const DEFAULT_POLL_INTERVAL_MS = 2_000;

export type ProxyDeps = {
  /** Pure liveness probe (tiny payload, no upstream check). */
  isHealthy(port: number, timeoutMs?: number): Promise<boolean>;
  /** True if any process is listening on the port (fast TCP probe). */
  isPortOpen(port: number, timeoutMs?: number): Promise<boolean>;
  readPidFile(): number | null;
  isProcessAlive(pid: number): boolean;
  /** PID of the process actually listening on the port, or null. */
  listenerPid(port: number): number | null;
  /** Make the pidfile name the true owner of the port. */
  syncPidFile(port: number): void;
  /** Spawn the proxy detached and record its pid. */
  spawn(port: number, upstream: string): void;
  readyTimeoutMs?: number;
  pollIntervalMs?: number;
};

// ── default deps: real process/fs/network access ───────────────────────────

// /livez is a pure liveness probe (tiny payload, no upstream check), unlike
// /health which serializes a large config payload — under compression load
// /health could exceed a short timeout and cause needless spawns.
async function isHealthy(port: number, timeoutMs = 2_000): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/livez`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function isPortOpen(port: number, timeoutMs = 1_000): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = createConnection({ host: "127.0.0.1", port });
    sock.setTimeout(timeoutMs, () => {
      sock.destroy();
      resolve(false);
    });
    sock.once("connect", () => {
      sock.destroy();
      resolve(true);
    });
    sock.once("error", () => resolve(false));
  });
}

function readPidFile(): number | null {
  try {
    const pid = Number(readFileSync(PID_PATH, "utf8").trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: exists but owned by another user — treat as alive.
    return (error as { code?: string }).code === "EPERM";
  }
}

function listenerPid(port: number): number | null {
  try {
    const out = execFileSync(
      "/usr/sbin/lsof",
      ["-tiTCP", String(port), "-sTCP:LISTEN"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 2_000,
      },
    );
    const pid = Number(out.trim().split("\n")[0]);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

/**
 * Once a proxy is confirmed healthy, make the pidfile name its true owner so
 * future bootstraps trust a live pid instead of a stale/dead one.
 */
function syncPidFile(port: number): void {
  const pid = listenerPid(port);
  if (pid === null) return;
  try {
    writeFileSync(PID_PATH, String(pid));
  } catch {
    // best effort — a stale pidfile only delays reuse, never breaks routing
  }
}

function spawnProxy(port: number, upstream: string, bin: string): void {
  try {
    mkdirSync(RUNTIME_DIR, { recursive: true });
    // Truncate per spawn: this capture is banner-only (headroom already writes
    // its own request log to ~/.headroom/logs/proxy.log), so failed-attempt
    // banners must not accumulate across pi restarts.
    const logFd = openSync(LOG_PATH, "w");
    const child = spawn(
      bin,
      [
        "proxy",
        "--openai-api-url",
        upstream,
        "--port",
        String(port),
        "--no-telemetry",
      ],
      {
        detached: true,
        stdio: ["ignore", logFd, logFd],
        env: { ...process.env, HEADROOM_SKIP_UPSTREAM_CHECK: "1" },
      },
    );
    child.unref();
    writeFileSync(PID_PATH, String(child.pid));
  } catch (error) {
    console.warn(
      `[headroom] failed to spawn proxy: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Default deps. `bin` defaults to `headroom` resolved via PATH — pipx installs
 * it to ~/.local/bin, which is on PATH on typical machines, so a shared
 * config needs no per-machine path. Override via the config `bin` field.
 */
export function createDefaultDeps(bin = "headroom"): ProxyDeps {
  return {
    isHealthy,
    isPortOpen,
    readPidFile,
    isProcessAlive,
    listenerPid,
    syncPidFile,
    spawn: (port, upstream) => spawnProxy(port, upstream, bin),
    readyTimeoutMs: DEFAULT_READY_TIMEOUT_MS,
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
  };
}

// ── ensureProxy: memoized single-instance discipline ──────────────────────

let inflight: Promise<boolean> | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run(
  port: number,
  upstream: string,
  deps: ProxyDeps,
): Promise<boolean> {
  // Healthy already? Reuse, and make the pidfile name the true listener.
  if (await deps.isHealthy(port)) {
    deps.syncPidFile(port);
    return true;
  }

  // Never pile a second instance on: trust a live recorded pid or an open
  // port (even slow to respond); only spawn when both are absent.
  const recordedPid = deps.readPidFile();
  const pidAlive = recordedPid !== null && deps.isProcessAlive(recordedPid);
  const portHeld = await deps.isPortOpen(port);
  if (!pidAlive && !portHeld) deps.spawn(port, upstream);

  const deadline =
    Date.now() + (deps.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS);
  const pollInterval = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  while (Date.now() < deadline) {
    await sleep(pollInterval);
    if (await deps.isHealthy(port)) {
      deps.syncPidFile(port);
      return true;
    }
  }
  return false;
}

/**
 * Ensure the proxy is running and healthy; resolves true when ready.
 * Concurrent callers share one in-flight attempt; a failed attempt clears the
 * memo so a later call can retry.
 */
export function ensureProxy(
  port: number,
  upstream: string,
  deps: ProxyDeps = createDefaultDeps(),
): Promise<boolean> {
  if (inflight) return inflight;
  inflight = run(port, upstream, deps).finally(() => {
    inflight = null;
  });
  return inflight;
}
