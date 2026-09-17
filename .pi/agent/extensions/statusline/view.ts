/**
 * Footer view: one session snapshot in, two lines out.
 *
 * Everything variable - including the animation frame and the glyph set - is a
 * field of `view`, and colours are read from the theme on every call, so a
 * `/theme` switch lands on the next frame without any cache to invalidate.
 */
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { SpeedSnapshot } from "./speed.js";

/** The subset of the host theme the footer uses. */
export type RenderTheme = { fg(color: string, text: string): string };

export type FooterPhase = "planning" | "executing" | "idle" | null;

export type FooterView = {
  gitRoot: string;
  branch: string;
  usage: { tokens: number; window: number; percent: number | null } | null;
  totals: { input: number; output: number };
  speed: SpeedSnapshot;
  phase: FooterPhase;
  frame: number;
  frames: readonly string[];
};

const PHASE_CHIP: Record<
  Exclude<FooterPhase, null>,
  readonly [string, string]
> = {
  planning: ["warning", "⏸ 计划模式"],
  executing: ["accent", "▶ 执行模式"],
  idle: ["dim", "∘ 空闲模式"],
};

/** Context-usage bar: 6 cells, filled by fraction. */
const bar = (r: number, w = 6): string => {
  const f = Math.round(Math.min(r, 1) * w);
  return "█".repeat(f) + "░".repeat(w - f);
};

/** Compact token count: 999 / 1.2k / 1.2M. */
const ft = (n: number): string =>
  n < 1_000
    ? `${n}`
    : n < 1_000_000
      ? `${(n / 1000).toFixed(1)}k`
      : `${(n / 1e6).toFixed(1)}M`;

export function footerRows(
  view: FooterView,
  width: number,
  theme: RenderTheme,
): string[] {
  const tok = view.usage?.tokens ?? null;
  const win = view.usage?.window ?? 0;
  const pct = view.usage?.percent ?? null;

  const ok = tok !== null && win > 0;
  const r = ok ? Math.min(tok / win, 1) : 0;
  const pl = pct !== null ? `${Math.round(pct)}%` : "?%";

  const bc = !ok
    ? (s: string) => theme.fg("dim", s)
    : r < 0.5
      ? (s: string) => theme.fg("success", s)
      : r < 0.8
        ? (s: string) => theme.fg("warning", s)
        : (s: string) => theme.fg("error", s);

  const { input: tin, output: tout } = view.totals;
  const totals =
    tin === 0 && tout === 0
      ? theme.fg("dim", "输入? 输出?")
      : theme.fg("muted", `输入${ft(tin)} 输出${ft(tout)}`);

  // Cat + rate form one unit: 🐱 45t/s. Live while streaming, last completed
  // otherwise; nothing at all until a message has finished.
  const cat = theme.fg("accent", `${view.frames[view.frame] ?? ""} `);
  const { streaming, live, last } = view.speed;
  const speed =
    streaming && live !== null
      ? theme.fg("accent", `${live.toFixed(0)}t/s`)
      : last !== null
        ? theme.fg("muted", `${last.toFixed(0)}t/s`)
        : "";

  let left = "";
  if (view.gitRoot || view.branch) {
    left = `${view.gitRoot ? theme.fg("text", view.gitRoot) : ""}${theme.fg("dim", " / ")}${view.branch ? theme.fg("muted", view.branch) : ""}`;
  }
  left = left ? `${left} ${cat}${speed}` : `${cat}${speed}`;

  const tokenBlock = `${theme.fg("muted", pl)} ${bc(bar(r, 6))} ${totals}`;
  const chip = view.phase ? PHASE_CHIP[view.phase] : null;
  const right = chip
    ? `${theme.fg(chip[0], chip[1])} ${tokenBlock}`
    : tokenBlock;

  const lw = visibleWidth(left);
  const rw = visibleWidth(right);
  return [
    "",
    truncateToWidth(
      left + " ".repeat(Math.max(1, width - lw - rw)) + right,
      width,
    ),
  ];
}
