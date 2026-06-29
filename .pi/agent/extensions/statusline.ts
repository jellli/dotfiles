/**
 * Custom statusline extension — matches nvim statusline.lua style.
 *
 * Left:  git-root / branch  token-usage [████████░░] 75%
 * Right: provider / model  thinking:high
 *
 * Separator: " / " (same as nvim SEP)
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
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
          // ── Token usage ──────────────────────────────────────────
          let inputTokens = 0;
          let outputTokens = 0;
          for (const entry of ctx.sessionManager.getBranch()) {
            if (
              entry.type === "message" &&
              entry.message.role === "assistant"
            ) {
              const msg = entry.message as AssistantMessage;
              inputTokens += msg.usage.input;
              outputTokens += msg.usage.output;
            }
          }

          // Context window estimate (use model's contextWindow or default 200k)
          const contextWindow = ctx.model?.contextWindow ?? 200_000;
          const totalTokens = inputTokens + outputTokens;
          const usageRatio = Math.min(totalTokens / contextWindow, 1);
          const pct = Math.round(usageRatio * 100);

          // Color the bar: green < 50%, yellow < 80%, red >= 80%
          let barColor: (s: string) => string;
          if (usageRatio < 0.5) {
            barColor = (s) => theme.fg("success", s);
          } else if (usageRatio < 0.8) {
            barColor = (s) => theme.fg("warning", s);
          } else {
            barColor = (s) => theme.fg("error", s);
          }

          const bar = barColor(progressBar(usageRatio, 10));
          const tokenInfo = theme.fg(
            "muted",
            `↑${fmtTokens(inputTokens)} ↓${fmtTokens(outputTokens)}`,
          );
          const pctStr = theme.fg("muted", `${pct}%`);

          // ── Left side: git-root / branch  tokens [bar] pct ───────
          const branch = footerData.getGitBranch();
          let left = "";
          if (gitRoot || branch) {
            const rootStr = gitRoot ? theme.fg("text", gitRoot) : "";
            const branchStr = branch ? theme.fg("muted", `${branch}`) : "";
            left = `${rootStr}${theme.fg("dim", " / ")}${branchStr}  `;
          }
          left += `${tokenInfo} ${bar} ${pctStr}`;

          // ── Right side: provider / model  thinking:level ─────────
          const provider = ctx.model?.provider ?? "unknown";
          const model = ctx.model?.id ?? "no-model";
          const thinkingLevel = pi.getThinkingLevel();

          // Thinking level colors — cool tones
          const thinkingColors: Record<string, string> = {
            off: "146;131;116", // grey
            minimal: "169;182;101", // green
            low: "137;180;130", // aqua
            medium: "125;174;163", // blue
            high: "231;138;78", // orange
            xhigh: "231;138;78", // orange
          };
          const thinkingBg =
            thinkingColors[thinkingLevel] ?? thinkingColors["high"]!;

          // Styled blocks with background + padding
          // model: subtle bg, thinking: vibrant bg
          const modelBlock = `\x1b[38;2;212;190;152;48;2;60;56;54m ${model} \x1b[0m`;
          const levelBlock = `\x1b[1;38;2;29;32;33;48;2;${thinkingBg}m ${thinkingLevel} \x1b[0m`;

          const right = `${theme.fg("muted", provider)}${theme.fg("dim", " / ")}${modelBlock}${levelBlock}`;

          // ── Assemble with padding ────────────────────────────────
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
