/**
 * plannotator-enhancer — keep Plannotator available so the model never loses its tools.
 *
 * Why this exists:
 * - When a plan completes, Plannotator returns to the "idle" phase and STRIPS
 *   `plannotator_submit_plan` from the active tool set (its #387 fix), and the
 *   plan-mode system prompt is no longer injected. The model then cannot see or
 *   call the Plannotator tools until plan mode is toggled back on manually.
 * - On completion Plannotator restores the tool list captured when plan mode was
 *   ENTERED via `pi.setActiveTools()`, which REPLACES (not merges) the active set.
 *   Any tool registered or enabled after that snapshot is silently dropped.
 *
 * Fixes (all configurable, see ~/.pi/agent/plannotator-enhancer.json):
 * 1. autoEnterOnSessionStart (default true) — enter planning mode on every new
 *    session, so plan tools + plan context are always present.
 * 2. reenterAfterPlanComplete (default true) — when a plan finishes, go straight
 *    back to planning for the next task instead of dropping to idle.
 * 3. After phase transitions, re-assert the full registered tool set so tools
 *    dropped by a stale snapshot restore come back.
 *
 * Diagnostics: every probe result is timestamped in ~/.pi/agent/plannotator-enhancer.log
 * (timeout / unavailable / error / handled are distinguishable).
 * Toggle or debug anytime:  /plannotator-auto on|off|status|debug
 */

import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const REQUEST_CHANNEL = "plannotator:request";
const PLAN_SUBMIT_TOOL = "plannotator_submit_plan";

type Phase = "idle" | "planning" | "executing";

interface Config {
  autoEnterOnSessionStart: boolean;
  reenterAfterPlanComplete: boolean;
}

const DEFAULT_CONFIG: Config = {
  autoEnterOnSessionStart: true,
  reenterAfterPlanComplete: true,
};

const CONFIG_PATH = join(homedir(), ".pi", "agent", "plannotator-enhancer.json");
const LOG_PATH = join(homedir(), ".pi", "agent", "plannotator-enhancer.log");

function loadConfig(): Config {
  try {
    if (existsSync(CONFIG_PATH)) {
      return { ...DEFAULT_CONFIG, ...(JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as Partial<Config>) };
    }
  } catch {
    /* unreadable/invalid config → fall back to defaults */
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(config: Config): void {
  try {
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch {
    /* best effort */
  }
}

function log(msg: string): void {
  try {
    appendFileSync(LOG_PATH, `${new Date().toISOString()} ${msg}\n`);
  } catch {
    /* best effort */
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ── Plannotator event-bus request (plan-mode status/enter) ──────────

interface PlanModeResponse {
  status: string;
  result?: { phase?: Phase };
  error?: string;
}

let seq = 0;
let consecutiveNulls = 0;

function emitPlanModeRequest(
  pi: ExtensionAPI,
  mode: "status" | "enter",
  timeoutMs: number,
): Promise<PlanModeResponse | null> {
  return new Promise((resolve) => {
    // Multiple listeners may be registered on this channel: pi's /reload-runtime
    // never removes old EventBus listeners, so stale plannotator instances
    // linger and respond FIRST with { status: "unavailable" } (their session
    // context was cleared at session_shutdown). Collect every response and
    // prefer a "handled" one — the freshest (live) instance always answers.
    const responses: PlanModeResponse[] = [];
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (responses.length > 1) {
        log(`request ${mode}: ${responses.length} responses — stale listeners present`);
      }
      const best = responses.find((r) => r.status === "handled") ?? responses[responses.length - 1];
      resolve(best ?? null);
    };
    const timer = setTimeout(finish, timeoutMs);
    try {
      pi.events.emit(REQUEST_CHANNEL, {
        requestId: `plannotator-enhancer-${Date.now()}-${++seq}`,
        action: "plan-mode",
        payload: { mode },
        respond: (res: PlanModeResponse): void => {
          responses.push(res);
          if (res.status === "handled" || res.status === "error") finish();
        },
      });
      // emitter.emit is synchronous: for "status" every listener has already
      // responded by now, so settle immediately with the best response.
      // ("enter" responds asynchronously after plannotator's enterPlanning
      // awaits — the respond callback above settles it when handled/error.)
      if (mode === "status" && responses.length > 0) finish();
    } catch (err) {
      log(`emitPlanModeRequest emit threw: ${err instanceof Error ? err.message : String(err)}`);
      finish();
    }
  });
}

/** Single status round-trip with raw outcome for the log. */
async function probePhaseOnce(pi: ExtensionAPI, label: string): Promise<Phase | null> {
  const res = await emitPlanModeRequest(pi, "status", 700);
  if (!res) {
    consecutiveNulls += 1;
    log(`${label}: TIMEOUT (no response within 700ms, consecutive=${consecutiveNulls})`);
    return null;
  }
  consecutiveNulls = 0;
  if (res.status !== "handled") {
    log(`${label}: ${res.status}${res.error ? ` (${res.error})` : ""}`);
    return null;
  }
  const phase = res.result?.phase ?? null;
  log(`${label}: handled → phase=${phase ?? "undefined"}`);
  return phase;
}

/** Retry loop — plannotator may be mid-initialization; back off and try again. */
async function probePhase(pi: ExtensionAPI, label: string, attempts: number): Promise<Phase | null> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const phase = await probePhaseOnce(pi, `${label}[${attempt + 1}/${attempts}]`);
    if (phase !== null) return phase;
    if (attempt < attempts - 1) await sleep(350);
  }
  return null;
}

// ── Tool-set re-assertion ───────────────────────────────────────────

/**
 * Activate every registered tool. Plannotator's restore uses setActiveTools()
 * with an entry-time snapshot, which REPLACES the active set and drops tools
 * registered later; re-asserting the union brings them all back.
 * With excludeSubmit, plannotator_submit_plan is left out while idle
 * (matches upstream's intent of not showing it when plan mode is off).
 */
function assertFullToolSet(pi: ExtensionAPI, opts: { excludeSubmit?: boolean } = {}): void {
  try {
    const exclude = new Set(opts.excludeSubmit ? [PLAN_SUBMIT_TOOL] : []);
    const all = pi
      .getAllTools()
      .map((t) => t.name)
      .filter((n) => !exclude.has(n));
    pi.setActiveTools([...new Set(all)]);
  } catch (err) {
    log(`assertFullToolSet error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── Extension ───────────────────────────────────────────────────────

export default function plannotatorEnhancer(pi: ExtensionAPI): void {
  const config = loadConfig();
  let lastPhase: Phase | null = null;

  log(`loaded (autoEnter=${config.autoEnterOnSessionStart} reenter=${config.reenterAfterPlanComplete})`);

  async function enterPlanning(): Promise<void> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await emitPlanModeRequest(pi, "enter", 1500);
      if (!res) {
        log(`enterPlanning[${attempt + 1}/5]: TIMEOUT`);
        consecutiveNulls += 1;
        return;
      }
      consecutiveNulls = 0;
      log(`enterPlanning[${attempt + 1}/5]: ${res.status}${res.error ? ` (${res.error})` : ""}`);
      if (res.status === "handled") return; // entered, or already in a phase
      if (res.status === "error") return; // unexpected — don't retry
      await sleep(300 * (attempt + 1)); // "unavailable" → retry
    }
  }

  // Loaded AFTER the plannotator package (packages load before local
  // extensions), so these handlers run after plannotator's own state restore.
  async function runSessionStart(): Promise<void> {
    lastPhase = null;
    consecutiveNulls = 0;
    const phase = await probePhase(pi, "session_start", 6);
    if (phase === null) {
      log("session_start: gave up after retries — plannotator not reachable");
      return;
    }

    if (phase === "idle") {
      assertFullToolSet(pi, { excludeSubmit: true });
      log(`session_start: phase=idle, assertTools (exclude submit), autoEnter=${config.autoEnterOnSessionStart}`);
      if (config.autoEnterOnSessionStart) {
        // Entering re-snapshots the (now complete) tool set, so the restore
        // after this plan finishes starts from a fresh, full list.
        await enterPlanning();
        const after = await probePhaseOnce(pi, "session_start:after-enter");
        log(`session_start: after enter → ${after ?? "unknown"}`);
      }
    } else {
      // planning/executing persisted across a restart — repair stale snapshots
      assertFullToolSet(pi);
      log(`session_start: phase=${phase}, assertTools (full)`);
    }
  }

  // CRITICAL ordering: package-manager.js sorts resolved extension paths by
  // resourcePrecedenceRank (~line 2042) — auto-discovered local extensions
  // (rank 1/3) load BEFORE npm packages (rank 4). So THIS extension's
  // handlers run FIRST in runner.emit's sequential await chain. Probing
  // synchronously here would race plannotator's session_start context-setter
  // (it hasn't run yet → every probe returns "unavailable"). Schedule the
  // work on a timer and return immediately; by the time it fires,
  // plannotator's own session_start handlers have completed.
  pi.on("session_start", () => {
    void (async () => {
      await sleep(250); // let plannotator's session_start handlers settle first
      await runSessionStart();
    })();
  });

  // Keep the tracked phase fresh so a manual /plannotator exit during
  // execution is not mistaken for a completed plan (turn_end refreshes
  // lastPhase before the next agent_end). Also catches up if session_start's
  // probe failed but plannotator becomes reachable later.
  pi.on("turn_end", async () => {
    if (consecutiveNulls >= 3) return; // plannotator absent — stay quiet
    const phase = await probePhaseOnce(pi, "turn_end");
    if (phase === null) return;
    if (lastPhase === null && phase === "idle" && config.autoEnterOnSessionStart) {
      log("turn_end: session_start never succeeded — catching up, entering planning");
      await enterPlanning();
      lastPhase = await probePhaseOnce(pi, "turn_end:after-enter");
      return;
    }
    lastPhase = phase;
  });

  pi.on("agent_end", () => {
    if (consecutiveNulls >= 3) return;
    const prev = lastPhase;
    // Same ordering constraint as session_start: our agent_end handler runs
    // BEFORE plannotator's. Plannotator's agent_end is what completes the plan
    // (phase executing → idle + restoreSavedState + persistState). Probing
    // synchronously here would still see "executing" and miss the transition.
    // Defer: by the time the timer fires, plannotator's agent_end has finished.
    void (async () => {
      await sleep(150);
      const phase = await probePhaseOnce(pi, "agent_end");
      if (prev === "executing" && phase === "idle") {
        // Plan just completed: plannotator restored its entry-time snapshot
        // (possibly dropping tools) and stripped plan tools. Re-assert the full
        // tool set, then re-enter planning so the next task starts ready.
        assertFullToolSet(pi, { excludeSubmit: true });
        log(`agent_end: executing→idle, assertTools, reenter=${config.reenterAfterPlanComplete}`);
        if (config.reenterAfterPlanComplete) {
          await enterPlanning();
          const after = await probePhaseOnce(pi, "agent_end:after-reenter");
          log(`agent_end: after re-enter → ${after ?? "unknown"}`);
        }
      } else if (phase) {
        lastPhase = phase;
      }
    })();
  });

  pi.registerCommand("plannotator-auto", {
    description: "Toggle plannotator auto-enable (on|off), show status, or debug the request channel",
    handler: async (args, ctx) => {
      const arg = (args ?? "").trim().toLowerCase();
      if (arg === "on") {
        config.autoEnterOnSessionStart = true;
        config.reenterAfterPlanComplete = true;
        saveConfig(config);
        ctx.ui.notify("plannotator-enhancer: auto-enable ON (session start + after plan completion).", "info");
        log("command: auto ON");
        await enterPlanning();
      } else if (arg === "off") {
        config.autoEnterOnSessionStart = false;
        config.reenterAfterPlanComplete = false;
        saveConfig(config);
        ctx.ui.notify("plannotator-enhancer: auto-enable OFF.", "info");
        log("command: auto OFF");
      } else if (arg === "debug") {
        const t0 = Date.now();
        const res = await emitPlanModeRequest(pi, "status", 1500);
        const elapsed = Date.now() - t0;
        if (!res) {
          ctx.ui.notify(`plannotator-enhancer debug: NO response after ${elapsed}ms — plannotator listener not reachable`, "error");
          log(`debug: NO response after ${elapsed}ms`);
        } else {
          ctx.ui.notify(`plannotator-enhancer debug: ${elapsed}ms → ${JSON.stringify(res)}`, "info");
          log(`debug: ${elapsed}ms → ${JSON.stringify(res)}`);
        }
      } else {
        const phase = await probePhaseOnce(pi, "command:status");
        ctx.ui.notify(
          `plannotator-enhancer: phase=${phase ?? "unreachable"} autoEnterOnSessionStart=${config.autoEnterOnSessionStart} reenterAfterPlanComplete=${config.reenterAfterPlanComplete}`,
          "info",
        );
      }
    },
  });
}
