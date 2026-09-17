/**
 * Statusline footer extension: nvim-style footer with per-session token usage.
 *
 * Footer:  git-root / branch 🐱 t/s    plan-chip pct% [bar] ↑in ↓out
 *
 * This file is the only adapter: it wires host events to the pure modules next
 * to it (`speed.ts` metering, `frame.ts` animation clock, `view.ts` rendering)
 * and owns every host effect (git exec, footer registration, timers).
 *
 * Frame contract (see CONTEXT.md): one pending `setTimeout`, no polling. The
 * next frame is armed only after the previous one fired, and a frame asks for a
 * re-render only when `advanceFrame` reports `changed`. Message boundaries are
 * the only places that re-arm at a new speed, so a stream does not reschedule
 * the clock per delta.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { advanceFrame, frameInterval, type FrameState } from "./frame.js";
import { createSpeedTracker, usageTotals } from "./speed.js";
import { footerRows, type FooterPhase, type FooterView } from "./view.js";

/** RunCat cat frames (private-use glyphs from runcat.ttf). Swapping this array
 * is the whole glyph decision - see the D9 open question in the spec. */
const RUNCAT_FRAMES = ["\ue900", "\ue901", "\ue902", "\ue903", "\ue904"];

const PHASES: readonly string[] = ["planning", "executing", "idle"];

// ── plannotator phase (from persisted session entries) ─────────────
// Reverse scan: the newest plannotator entry usually sits at the end, and the
// phase has no event of its own (non-goal in the spec).

interface PlnEntry {
  type?: string;
  customType?: string;
  data?: { phase?: string };
}

function plannotatorPhase(entries: readonly unknown[]): FooterPhase {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i] as PlnEntry;
    if (
      e?.type === "custom" &&
      e.customType === "plannotator" &&
      typeof e.data?.phase === "string"
    ) {
      return PHASES.includes(e.data.phase)
        ? (e.data.phase as FooterPhase)
        : null;
    }
  }
  return null;
}

// ── extension ─────────────────────────────────────────────────────

export default function (pi: ExtensionAPI): void {
  let gitRoot = "";
  /** The registered footer, if the session has one: render target + re-arm. */
  let footer: { requestRender: () => void; rearm: () => void } | null = null;

  async function gitName(cwd: string) {
    try {
      const r = await pi.exec("git", ["rev-parse", "--show-toplevel"], {
        timeout: 3000,
      });
      if (r.code === 0) gitRoot = r.stdout.trim().split("/").pop() ?? "";
    } catch {
      gitRoot = "";
    }
  }

  // Speed comes from message events only; the animation reads it, never feeds it.
  const tracker = createSpeedTracker(Date.now);
  let totals = { input: 0, output: 0 };

  pi.on("message_start", (event) => {
    if (event.message.role !== "assistant") return;
    tracker.begin();
    footer?.rearm();
    footer?.requestRender();
  });

  pi.on("message_update", (event) => {
    if (!tracker.snapshot().streaming || event.message.role !== "assistant")
      return;
    const ev = event.assistantMessageEvent;
    if (!ev || (ev.type !== "text_delta" && ev.type !== "thinking_delta"))
      return;
    tracker.update(ev.delta ?? "", ev.partial?.usage?.output);
    footer?.requestRender();
  });

  pi.on("message_end", (event) => {
    if (event.message.role !== "assistant") return;
    const streaming = tracker.snapshot().streaming;
    tracker.end(event.message.usage?.output);
    // Totals are maintained incrementally: the render path must not walk the
    // transcript (a >100-line session is a linear scan per frame otherwise).
    const usage = event.message.usage;
    if (streaming && usage) {
      totals = {
        input: totals.input + (usage.input ?? 0),
        output: totals.output + (usage.output ?? 0),
      };
    }
    footer?.rearm();
    footer?.requestRender();
  });

  // A plannotator phase transition lands in the transcript without an event of
  // its own; these are the points where the chip may change.
  pi.on("turn_end", () => footer?.requestRender());
  pi.on("agent_end", () => footer?.requestRender());

  pi.on("session_start", async (_ev, ctx) => {
    await gitName(ctx.cwd);
    totals = usageTotals(ctx.sessionManager.getEntries());

    ctx.ui.setFooter((tui, theme, fd) => {
      const frameState: FrameState = { frame: 0, last: 0 };
      let timer: ReturnType<typeof setTimeout> | null = null;

      /** Live rate while streaming, last completed rate otherwise. */
      const currentSpeed = () => {
        const speed = tracker.snapshot();
        return speed.streaming ? speed.live : speed.last;
      };

      const arm = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          const next = advanceFrame(
            frameState,
            Date.now(),
            currentSpeed(),
            RUNCAT_FRAMES.length,
          );
          if (next.changed) {
            frameState.frame = next.frame;
            frameState.last = next.last;
            tui.requestRender();
          }
          arm();
        }, frameInterval(currentSpeed()));
      };

      const unsub = fd.onBranchChange(async () => {
        await gitName(ctx.cwd);
        tui.requestRender();
      });

      footer = {
        requestRender: () => tui.requestRender(),
        rearm: arm,
      };
      arm();

      return {
        dispose() {
          if (timer) clearTimeout(timer);
          timer = null;
          unsub();
          footer = null;
        },
        invalidate() {},
        render(w: number): string[] {
          const u = ctx.getContextUsage();
          const tok = u?.tokens ?? null;
          const view: FooterView = {
            gitRoot,
            branch: fd.getGitBranch() ?? "",
            usage:
              u && tok !== null
                ? {
                    tokens: tok,
                    window:
                      u.contextWindow ?? ctx.model?.contextWindow ?? 200_000,
                    percent: u.percent ?? null,
                  }
                : null,
            totals,
            speed: tracker.snapshot(),
            phase: plannotatorPhase(ctx.sessionManager.getEntries()),
            frame: frameState.frame,
            frames: RUNCAT_FRAMES,
          };
          return footerRows(view, w, theme);
        },
      };
    });
  });
}
