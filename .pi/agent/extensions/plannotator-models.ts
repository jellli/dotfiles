/**
 * plannotator-models — separate models for plannotator's planning and
 * executing phases, configured via an interactive TUI.
 *
 * - `/plannotator-models` opens two selectors (plan model, exec model) and
 *   writes the choices to ~/.pi/agent/plannotator.json — plannotator's global
 *   config layer — merging with any existing fields (thinking, tools, ...).
 * - The configured model for the CURRENT phase is applied immediately via
 *   pi.setModel, so no reload is needed for the phase you're in.
 * - On phase transitions the configured model for the incoming phase is
 *   applied (tracked from plannotator's persisted custom session entries),
 *   so plan → exec model switching works without a reload.
 *
 * plannotator itself re-reads the config on session_start, so after a reload
 * its own applyPhaseConfig applies the same models (idempotent).
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_PATH = join(homedir(), ".pi", "agent", "plannotator.json");

interface PhaseModelRef {
  provider: string;
  id: string;
}
interface PhaseProfile {
  model?: PhaseModelRef | null;
}
interface PlnConfig {
  phases?: {
    planning?: PhaseProfile | null;
    executing?: PhaseProfile | null;
  };
}

function loadConfig(): PlnConfig {
  try {
    if (existsSync(CONFIG_PATH)) return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    /* malformed or unreadable → start fresh */
  }
  return {};
}

function saveConfig(cfg: PlnConfig) {
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n");
}

// ── current plannotator phase from persisted session entries ──────

interface PlnEntry {
  type?: string;
  customType?: string;
  data?: { phase?: string };
}

function currentPhase(entries: PlnEntry[]): string | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e?.type === "custom" && e.customType === "plannotator" && typeof e.data?.phase === "string") {
      return e.data.phase;
    }
  }
  return null;
}

const phaseModel = (cfg: PlnConfig, phase: string): PhaseModelRef | null | undefined =>
  phase === "planning" ? cfg.phases?.planning?.model : phase === "executing" ? cfg.phases?.executing?.model : undefined;

// ── extension ─────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let lastPhase: string | null = null;

  async function applyModel(ctx: ExtensionContext, ref: PhaseModelRef, phase: string) {
    const model = ctx.modelRegistry.find(ref.provider, ref.id);
    if (!model) {
      ctx.ui.notify(`Plannotator: ${phase} model ${ref.provider}/${ref.id} not found`, "error");
      return;
    }
    const ok = await pi.setModel(model);
    ctx.ui.notify(
      ok
        ? `Plannotator: ${phase} → ${model.name}`
        : `Plannotator: failed to switch to ${model.name} (no API key?)`,
      ok ? "info" : "error",
    );
  }

  // Apply the configured model when entering a phase (without reload).
  // Both turn_end and agent_end: completions can land the idle transition in
  // agent_end (plannotator's handler), and the enhancer re-enters planning
  // right after — catching it here means plan/exec models always match phase.
  const syncPhase = (ctx: ExtensionContext) => {
    const phase = currentPhase(ctx.sessionManager.getEntries() as PlnEntry[]);
    if (phase && phase !== lastPhase && (phase === "planning" || phase === "executing")) {
      const ref = phaseModel(loadConfig(), phase);
      if (ref) void applyModel(ctx, ref, phase);
    }
    if (phase) lastPhase = phase;
  };
  pi.on("turn_end", (_event, ctx) => syncPhase(ctx));
  pi.on("agent_end", (_event, ctx) => syncPhase(ctx));

  pi.registerCommand("plannotator-models", {
    description: "Set separate models for plannotator planning/executing phases",
    handler: async (_args, ctx) => {
      const registry = ctx.modelRegistry;
      let models = registry.getAvailable();
      if (models.length === 0) models = registry.getAll();
      if (models.length === 0) {
        ctx.ui.notify("No models available", "error");
        return;
      }

      const cfg = loadConfig();
      const planRef = cfg.phases?.planning?.model ?? null;
      const execRef = cfg.phases?.executing?.model ?? null;
      const cur = ctx.model;
      const curLabel = cur ? `${cur.name} (current)` : "current";

      const labels = models.map((m) => m.name);
      const fmt = (ref: PhaseModelRef | null) => (ref ? `${ref.provider}/${ref.id}` : `default (${curLabel})`);

      const planName = await ctx.ui.select(`Plan phase model — now: ${fmt(planRef)}`, labels);
      if (planName === undefined) {
        ctx.ui.notify("Plannotator: cancelled", "info");
        return;
      }
      const execName = await ctx.ui.select(`Exec phase model — now: ${fmt(execRef)}`, labels);
      if (execName === undefined) {
        ctx.ui.notify("Plannotator: cancelled", "info");
        return;
      }

      const byName = (name: string) => models.find((m) => m.name === name);
      const planModel = byName(planName);
      const execModel = byName(execName);
      if (!planModel || !execModel) {
        ctx.ui.notify("Plannotator: model lookup failed", "error");
        return;
      }

      const next: PlnConfig = {
        ...cfg,
        phases: {
          ...(cfg.phases ?? {}),
          planning: { ...(cfg.phases?.planning ?? {}), model: { provider: planModel.provider, id: planModel.id } },
          executing: { ...(cfg.phases?.executing ?? {}), model: { provider: execModel.provider, id: execModel.id } },
        },
      };
      saveConfig(next);
      ctx.ui.notify(
        `Plannotator: plan=${planModel.name} exec=${execModel.name} saved to ${CONFIG_PATH}`,
        "info",
      );

      // Apply immediately for the phase we're currently in.
      const phase = currentPhase(ctx.sessionManager.getEntries() as PlnEntry[]);
      if (phase === "planning") await applyModel(ctx, { provider: planModel.provider, id: planModel.id }, "planning");
      else if (phase === "executing") await applyModel(ctx, { provider: execModel.provider, id: execModel.id }, "executing");
      else ctx.ui.notify("Plannotator: models will apply on the next phase switch", "info");
    },
  });
}
