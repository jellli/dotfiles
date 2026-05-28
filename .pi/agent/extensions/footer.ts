/**
 * Custom footer — clean, human-readable.
 *
 * Shows: model │ branch │ tokens │ cost
 * Toggle with /footer command.
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

function fmtTokens(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}m`;
}

function fmtCwd(cwd: string): string {
  const home = process.env.HOME || "";
  if (home && cwd.startsWith(home)) return `~${cwd.slice(home.length)}`;
  return cwd;
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    ctx.ui.setFooter((tui, theme, footerData) => {
      const unsub = footerData.onBranchChange(() => tui.requestRender());

      return {
        dispose: unsub,
        invalidate() {},
        render(width: number): string[] {
          // Token stats
          let input = 0;
          let output = 0;
          let cost = 0;
          for (const e of ctx.sessionManager.getBranch()) {
            if (e.type === "message" && e.message.role === "assistant") {
              const m = e.message as AssistantMessage;
              input += m.usage.input;
              output += m.usage.output;
              cost += m.usage.cost.total;
            }
          }

          const provider = ctx.model?.provider || "";
          const model = ctx.model?.id || "no model";
          const branch = footerData.getGitBranch();
          const cwd = fmtCwd(ctx.cwd);
          const tokens = `↑${fmtTokens(input)} ↓${fmtTokens(output)}`;
          const price = cost > 0 ? `$${cost.toFixed(3)}` : "";

          // Thinking level
          const thinking = ctx.model?.reasoning ? "think" : "";

          const sep = theme.fg("dim", " · ");

          // Line 1: location
          const line1Parts: string[] = [
            theme.fg("muted", cwd),
            branch ? theme.fg("muted", branch) : "",
          ].filter(Boolean);

          // Line 2: model (left) + stats (right)
          const left = [
            theme.fg("accent", `${provider}/${model}`),
            thinking ? theme.fg("warning", thinking) : "",
          ]
            .filter(Boolean)
            .join(sep);

          const right = [
            theme.fg("success", `in ${fmtTokens(input)}`),
            theme.fg("error", `out ${fmtTokens(output)}`),
            price ? theme.fg("dim", price) : "",
          ]
            .filter(Boolean)
            .join(sep);

          const pad = Math.max(
            1,
            width - visibleWidth(left) - visibleWidth(right) - 2,
          );

          return [
            truncateToWidth(` ${line1Parts.join(sep)}`, width),
            truncateToWidth(` ${left}${" ".repeat(pad)}${right} `, width),
          ];
        },
      };
    });
  });
}
