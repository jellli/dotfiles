/**
 * Custom statusline — nvim-style footer with per-session token usage.
 *
 * Footer:  git-root / branch 🐱 t/s    plan-chip pct% [bar] ↑in ↓out
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

// ── RunCat cat frames (private-use glyphs from runcat.ttf) ─────────

const RUNCAT_FRAMES = ["\ue900 ", "\ue901 ", "\ue902 ", "\ue903 ", "\ue904 "];
const RUNCAT_SCALE = 6000;
const RUNCAT_MIN_MS = 50;
const RUNCAT_MAX_MS = 250;
const RUNCAT_DEFAULT_MS = 167;

// ── helpers ───────────────────────────────────────────────────────

const bar = (r: number, w = 6): string => {
  const f = Math.round(Math.min(r, 1) * w);
  return "█".repeat(f) + "░".repeat(w - f);
};

const ft = (n: number): string =>
  n < 1_000 ? `${n}` : n < 1_000_000 ? `${(n / 1000).toFixed(1)}k` : `${(n / 1e6).toFixed(1)}M`;

// ── plannotator phase (from persisted session entries) ─────────────

interface PlnEntry {
  type?: string;
  customType?: string;
  data?: { phase?: string };
}

function plannotatorPhase(entries: PlnEntry[]): string | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e?.type === "custom" && e.customType === "plannotator" && typeof e.data?.phase === "string") {
      return e.data.phase;
    }
  }
  return null;
}

// ── token-per-sec tracking (replaces pi-speeed) ────────────────────
// Counts output tokens while an assistant message streams (usage deltas
// when the provider reports them, otherwise a word-count estimate of the
// delta text) and divides by elapsed time. Shown in the footer right after
// the ↑in ↓out token usage.

const estimateTokens = (text: string): number => {
  if (!text) return 0;
  const m = text.match(/\w+|[^\s\w]/g);
  return m ? m.length : 0;
};

const sanitizeTokS = (v: number, durMs: number): number | null =>
  Number.isFinite(v) && v > 0 && v < 2000 && durMs >= 300 ? v : null;

// ── extension ─────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let gitRoot = "";
  let tuiRef: { requestRender: () => void } | null = null;

  async function gitName(cwd: string) {
    try {
      const r = await pi.exec("git", ["rev-parse", "--show-toplevel"], { timeout: 3000 });
      if (r.code === 0) gitRoot = r.stdout.trim().split("/").pop() ?? "";
    } catch { gitRoot = ""; }
  }

  // ── token-per-sec state (live while streaming, last completed after) ──
  const speed = {
    streaming: false,
    startTs: 0,
    tokens: 0,
    lastUsageOut: 0,
    lastTokS: null as number | null,
    liveTokS: null as number | null,
  };

  // ── RunCat animation state (frame advances on a speed-driven interval) ──
  let catFrame = 0;
  let catLastTick = 0;

  const currentSpeed = () =>
    speed.streaming ? speed.liveTokS : speed.lastTokS;

  const runcatInterval = (v: number | null): number =>
    v === null || !Number.isFinite(v) || v <= 0
      ? RUNCAT_DEFAULT_MS
      : Math.max(RUNCAT_MIN_MS, Math.min(RUNCAT_MAX_MS, Math.round(RUNCAT_SCALE / v)));

  pi.on("message_start", (event) => {
    if (event.message.role !== "assistant") return;
    speed.streaming = true;
    speed.startTs = Date.now();
    speed.tokens = 0;
    speed.lastUsageOut = 0;
    speed.liveTokS = null;
  });

  pi.on("message_update", (event) => {
    if (!speed.streaming || event.message.role !== "assistant") return;
    const ev = event.assistantMessageEvent;
    if (!ev || (ev.type !== "text_delta" && ev.type !== "thinking_delta")) return;
    const usageOut = ev.partial?.usage?.output;
    if (typeof usageOut === "number" && usageOut > speed.lastUsageOut) {
      speed.tokens += usageOut - speed.lastUsageOut;
      speed.lastUsageOut = usageOut;
    } else {
      speed.tokens += estimateTokens(ev.delta ?? "");
    }
    const dur = Date.now() - speed.startTs;
    if (dur >= 300) speed.liveTokS = speed.tokens / (dur / 1000);
    tuiRef?.requestRender();
  });

  pi.on("message_end", (event) => {
    if (!speed.streaming || event.message.role !== "assistant") return;
    const dur = Date.now() - speed.startTs;
    const finalOut = event.message.usage?.output ?? speed.tokens;
    speed.lastTokS = sanitizeTokS(finalOut / (dur / 1000), dur);
    speed.streaming = false;
    speed.liveTokS = null;
    tuiRef?.requestRender();
  });

  // Refresh the footer when a plannotator phase transition lands.
  pi.on("turn_end", () => tuiRef?.requestRender());
  pi.on("agent_end", () => tuiRef?.requestRender());

  pi.on("session_start", async (_ev, ctx) => {
    await gitName(ctx.cwd);

    ctx.ui.setFooter((tui, theme, fd) => {
      tuiRef = tui;
      const unsub = fd.onBranchChange(async () => {
        await gitName(ctx.cwd);
        tui.requestRender();
      });

      // Advance the cat frame on a speed-driven interval, then re-render the
      // footer. Fixed 50ms tick (= RUNCAT_MIN_MS) so a faster speed can pick
      // up a shorter interval promptly; cleared in dispose().
      const catTimer = setInterval(() => {
        const interval = runcatInterval(currentSpeed());
        const now = Date.now();
        if (now - catLastTick >= interval) {
          catFrame = (catFrame + 1) % RUNCAT_FRAMES.length;
          catLastTick = now;
        }
        tui.requestRender();
      }, RUNCAT_MIN_MS);

      return {
        dispose() { clearInterval(catTimer); unsub(); },
        invalidate() {},
        render(w: number): string[] {
          // ── token usage and context bar ─────────────
          const u = ctx.getContextUsage();
          const win = u?.contextWindow ?? ctx.model?.contextWindow ?? 200_000;
          const tok = u?.tokens ?? null;
          const pct = u?.percent ?? null;

          let tin = 0, tout = 0;
          for (const e of ctx.sessionManager.getEntries()) {
            if (e.type === "message" && e.message.role === "assistant") {
              const ug = e.message.usage;
              if (ug) { tin += ug.input; tout += ug.output; }
            }
          }

          const ok = tok !== null && win > 0;
          const r = ok ? Math.min(tok! / win, 1) : 0;
          const pl = pct !== null ? `${Math.round(pct)}%` : "?%";

          const bc = !ok ? ((s: string) => theme.fg("dim", s))
            : r < 0.5 ? ((s: string) => theme.fg("success", s))
            : r < 0.8 ? ((s: string) => theme.fg("warning", s))
            : ((s: string) => theme.fg("error", s));

          const ts = tin === 0 && tout === 0
            ? theme.fg("dim", "↑? ↓?")
            : theme.fg("muted", `↑${ft(tin)} ↓${ft(tout)}`);

          // RunCat cat frame + token-per-sec form one unit (left, after
          // branch): 🐱 45t/s. Live during streaming, last completed otherwise.
          const cat = theme.fg("accent", RUNCAT_FRAMES[catFrame]);
          const spd = speed.streaming && speed.liveTokS !== null
            ? theme.fg("accent", `${speed.liveTokS.toFixed(0)}t/s`)
            : speed.lastTokS !== null
            ? theme.fg("muted", `${speed.lastTokS.toFixed(0)}t/s`)
            : theme.fg("dim", "--");

          // ── left: git + cat + speed ─────────────────
          const br = fd.getGitBranch();
          let left = "";
          if (gitRoot || br)
            left = `${gitRoot ? theme.fg("text", gitRoot) : ""}${theme.fg("dim", " / ")}${br ? theme.fg("muted", br) : ""}`;
          left = left ? `${left} ${cat}${spd}` : `${cat}${spd}`;

          // ── right: plan chip + token usage ───────────
          const tokenBlock = `${theme.fg("muted", pl)} ${bc(bar(r, 6))} ${ts}`;
          const pln = plannotatorPhase(ctx.sessionManager.getEntries() as PlnEntry[]);
          let right = "";
          if (pln === "planning") right = theme.fg("warning", "⏸ PLAN");
          else if (pln === "executing") right = theme.fg("accent", "▶ EXEC");
          else if (pln === "idle") right = theme.fg("dim", "∘ OFF");
          right = right ? `${right} ${tokenBlock}` : tokenBlock;

          const lw = visibleWidth(left), rw = visibleWidth(right);
          return ["", truncateToWidth(left + " ".repeat(Math.max(1, w - lw - rw)) + right, w)];
        },
      };
    });
  });
}
