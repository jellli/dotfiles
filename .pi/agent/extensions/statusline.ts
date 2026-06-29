/**
 * Custom statusline extension — matches nvim statusline.lua style.
 *
 * Footer:  pct% [bar]  ↑in ↓out            git-root / branch
 *
 * Token in/out: session-cumulative input/output (summed across all
 * assistant messages via sessionManager.getEntries(), matching
 * juanibiapina/pi-powerbar's powerbar-tokens producer). NOT per-turn deltas,
 * NOT cacheRead — this is the billing-usage cumulative count.
 *
 * Context pct/bar: ctx.getContextUsage() (accounts for compaction).
 *
 * (provider / model / thinking-level moved to the editor top border —
 *  injected by vim-mode/vim-editor.ts injectTopRight.)
 *
 * Separator: " / " (same as nvim SEP)
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

/** Build a graphical progress bar. */
function progressBar(ratio: number, width = 12): string {
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

/** Format large numbers compactly. */
function fmtTokens(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export default function (pi: ExtensionAPI) {
  let gitRoot = "";

  /** Fetch git root (last path component, like fnamemodify(root, ":t")). */
  async function refreshGitRoot(cwd: string) {
    try {
      const result = await pi.exec("git", ["rev-parse", "--show-toplevel"], {
        timeout: 3000,
      });
      if (result.code === 0 && result.stdout.trim()) {
        const full = result.stdout.trim();
        gitRoot = full.split("/").pop() ?? full;
      }
    } catch {
      gitRoot = "";
    }
  }

  pi.on("session_start", async (_event, ctx) => {
    await refreshGitRoot(ctx.cwd);

    ctx.ui.setFooter((tui, theme, footerData) => {
      // Re-fetch git root when branch changes (e.g. checkout)
      const unsub = footerData.onBranchChange(async () => {
        await refreshGitRoot(ctx.cwd);
        tui.requestRender();
      });

      return {
        dispose: unsub,
        invalidate() {},
        render(width: number): string[] {
          // ── Source of truth for current context usage ──────────────────
          // ctx.getContextUsage() accounts for compaction (returns tokens:null
          // right after a compact, before the next LLM response) — unlike
          // summing every assistant message's usage.input, which double-counts
          // (usage.input is the FULL prompt size for that turn, not a delta,
          // and pre-compaction history stays in the branch).
          const usage = ctx.getContextUsage();
          const contextWindow =
            usage?.contextWindow ?? ctx.model?.contextWindow ?? 200_000;
          const totalTokens = usage?.tokens ?? null;
          const pct = usage?.percent ?? null;

          // Cumulative session token usage across ALL assistant messages
          // (matches juanibiapina/pi-powerbar powerbar-tokens: getEntries(),
          // sum input + output, no cacheRead, no per-turn).
          //   ↑ input  = cumulative new (uncached) prompt tokens billed
          //   ↓ output = cumulative generated tokens billed
          // This is billing/cost-usage cumulative, NOT current-context-size
          // (that's the bar+pct above). getEntries() covers all entries
          // including forked siblings; matches powerbar's choice.
          let totalInput = 0;
          let totalOutput = 0;
          for (const entry of ctx.sessionManager.getEntries()) {
            if (entry.type === "message" && entry.message.role === "assistant") {
              const u = entry.message.usage;
              if (u) {
                totalInput += u.input;
                totalOutput += u.output;
              }
            }
          }

          // usageRatio is meaningful only with real token counts.
          const hasUsage = totalTokens !== null && contextWindow > 0;
          const usageRatio = hasUsage
            ? Math.min(totalTokens! / contextWindow, 1)
            : 0;
          const pctLabel = pct !== null ? `${Math.round(pct)}%` : "?%";

          // Color the bar: green < 50%, yellow < 80%, red >= 80%.
          // When usage unknown (post-compaction) fall back to dim.
          let barColor: (s: string) => string;
          if (!hasUsage) {
            barColor = (s) => theme.fg("dim", s);
          } else if (usageRatio < 0.5) {
            barColor = (s) => theme.fg("success", s);
          } else if (usageRatio < 0.8) {
            barColor = (s) => theme.fg("warning", s);
          } else {
            barColor = (s) => theme.fg("error", s);
          }

          const bar = barColor(progressBar(usageRatio, 10));
          // powerbar-tokens: skip display entirely when both cumulative =0.
          let tokenInfo: string;
          if (totalInput === 0 && totalOutput === 0) {
            tokenInfo = theme.fg("dim", "↑? ↓?");
          } else {
            tokenInfo = theme.fg(
              "muted",
              `↑${fmtTokens(totalInput)} ↓${fmtTokens(totalOutput)}`,
            );
          }
          const pctStr = theme.fg("muted", pctLabel);

          // ── Left: pct% [bar] ↑in ↓out ──────────────────────────
          // ── Right: git-root / branch ────────────────────────────
          const left = `${pctStr} ${bar} ${tokenInfo}`;

          const branch = footerData.getGitBranch();
          let right = "";
          if (gitRoot || branch) {
            const rootStr = gitRoot ? theme.fg("text", gitRoot) : "";
            const branchStr = branch ? theme.fg("muted", `${branch}`) : "";
            right = `${rootStr}${theme.fg("dim", " / ")}${branchStr}`;
          }

          const leftW = visibleWidth(left);
          const rightW = visibleWidth(right);
          const pad = Math.max(1, width - leftW - rightW);

          return [
            "", // spacing between editor and statusline
            truncateToWidth(left + " ".repeat(pad) + right, width),
          ];
        },
      };
    });
  });
}
