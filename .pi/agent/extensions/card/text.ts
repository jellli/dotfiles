import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { createTextMemo, type TextMemo } from "./line-memo.js";

export type UiTheme = {
  fg(color: any, text: string): string;
  bg(color: any, text: string): string;
  bold(text: string): string;
};

function fitLineUncached(
  line: string,
  width: number,
  ellipsis: string,
  minimumWidth: number,
): string {
  const targetWidth = Math.max(minimumWidth, width);
  return visibleWidth(line) <= targetWidth
    ? line
    : truncateToWidth(line, targetWidth, ellipsis, false);
}

/**
 * Fitted lines, memoized per (width, ellipsis, minimumWidth).
 *
 * Every card line is measured before it is drawn, and a card line is painted with
 * SGR, so it cannot take pi-tui's printable-ASCII fast path. pi-tui then answers
 * from a width cache that holds 512 strings: once a transcript renders more
 * distinct lines than that - a few hundred tool cards - every card is measured
 * again on every frame, with the grapheme segmenter and the east-asian tables
 * (measured 2026-09-16: 600 settled fabric_exec rows cost 23.6ms a frame, ~16ms
 * of it inside `visibleWidth`). The fitted line is a pure function of those four
 * values, so a card line is measured once and reused for the life of the session.
 *
 * The budget is the same text budget the background stripper uses, and it counts
 * text in and out: ~2M units holds roughly three thousand fitted card lines, and
 * a session that outgrows it behaves exactly as it does today.
 */
const FIT_CACHE_BUDGET = 2 * 1024 * 1024;
const fitCaches = new Map<string, TextMemo>();

function fitCache(
  width: number,
  ellipsis: string,
  minimumWidth: number,
): TextMemo {
  const key = `${width}\u0001${ellipsis}\u0001${minimumWidth}`;
  let memo = fitCaches.get(key);
  if (!memo) {
    const uncached = (line: string) =>
      fitLineUncached(line, width, ellipsis, minimumWidth);
    memo = createTextMemo(FIT_CACHE_BUDGET, uncached);
    fitCaches.set(key, memo);
  }
  return memo;
}

/** Fit one line to `width` columns, memoized across re-renders. */
export function fitLine(
  line: string,
  width: number,
  ellipsis = "...",
  minimumWidth = 1,
): string {
  return fitCache(width, ellipsis, minimumWidth).get(line);
}

/**
 * Fit a filesystem path to `width` columns while keeping the trailing
 * basename (and as many leading directories as fit), e.g.
 * `…/extensions/ui/pi-diff.ts` instead of an unreadable cwd-only prefix.
 */
export function fitPath(path: string, width: number, ellipsis = "…"): string {
  if (visibleWidth(path) <= width) return path;
  const dirs = path.split("/").filter((segment) => segment !== "");
  const base = dirs.pop() ?? path;
  const baseWidth = visibleWidth(base);
  const ellipsisWidth = visibleWidth(ellipsis);
  if (baseWidth + ellipsisWidth > width) {
    // The basename alone does not fit; fall back to plain tail truncation.
    return truncateToWidth(path, width, ellipsis, false);
  }
  const kept: string[] = [];
  let used = baseWidth;
  const gapWidth = ellipsisWidth + 1; // "…" plus the "/" printed after it
  for (let i = dirs.length - 1; i >= 0; i -= 1) {
    const segWidth = visibleWidth(dirs[i]) + 1; // slash
    if (used + segWidth + gapWidth > width) break;
    kept.unshift(dirs[i]);
    used += segWidth;
  }
  return `${ellipsis}/${kept.concat(base).join("/")}`;
}

export function padLine(line: string, width: number, ellipsis = "..."): string {
  const fitted = fitLine(line, width, ellipsis);
  return fitted + " ".repeat(Math.max(0, width - visibleWidth(fitted)));
}

// ---------------------------------------------------------------------------
// Card language: bg-colored tool-name badge + `└─ ` result line
// ---------------------------------------------------------------------------

/** Width of the `└─ ` connector; result blocks indent to this column. */
export const RESULT_LINE_INDENT = 3;

// The badge paints the toolTitle color as background with black text — fixed,
// regardless of execution state (the result line already shows the outcome).
const BADGE_TITLE_FALLBACK_BG = "\x1b[48;2;231;138;78m"; // gruvbox orange
const BLACK_FG = "\x1b[30m";
const FG_RESET = "\x1b[39m";
const BG_RESET = "\x1b[49m";

export function toolBadge(theme: UiTheme, toolName: string): string {
  const fg = (theme as { getFgAnsi?: (color: string) => string }).getFgAnsi?.(
    "toolTitle",
  );
  // Reuse the theme's toolTitle fg as a bg by flipping the SGR 38 prefix to 48.
  const bg =
    fg && fg.startsWith("\x1b[38;")
      ? fg.replace("\x1b[38;", "\x1b[48;")
      : BADGE_TITLE_FALLBACK_BG;
  return `${bg} ${BLACK_FG}${theme.bold(toolName.toUpperCase())}${FG_RESET} ${BG_RESET}`;
}

export function toolHeader(
  theme: UiTheme,
  toolName: string,
  detail: string,
): string {
  return `${toolBadge(theme, toolName)} ${detail}`;
}

/** Dim brackets around header details, e.g. `[AGENTS.md]`. */
export function bracketDetail(theme: UiTheme, content: string): string {
  return `${theme.fg("dim", "[")}${content}${theme.fg("dim", "]")}`;
}

/** `└─ ` connector that introduces every result line, one space of left margin.
 * With `attach`, the connector joins the box border directly (` └─┌─…`). */
export function resultLine(
  theme: UiTheme,
  content: string,
  attach = false,
): string {
  return attach
    ? ` ${theme.fg("dim", "└─")}${content}`
    : ` ${theme.fg("dim", "└─ ")}${content}`;
}

// ---------------------------------------------------------------------------
// Tool results as text
// ---------------------------------------------------------------------------

/** A tool result whose text lives in `content` (the AgentToolResult shape). */
export type ToolTextResult = {
  content?: Array<{ type: string; text?: string }>;
};

/** Truncate a string to `max` chars with a trailing ellipsis. */
export function shorten(value: string, max = 56): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/** Join the text blocks of a tool result, trimmed. */
export function textOutput(result: ToolTextResult): string {
  return (result.content ?? [])
    .filter((content) => content.type === "text")
    .map((content) => content.text ?? "")
    .join("\n")
    .trim();
}

/** First-line error preview on the result line; full output when expanded. */
export function errorPreviewLine(
  theme: UiTheme,
  output: string,
  expanded: boolean,
): string {
  const lines = output.split("\n");
  const preview = expanded ? output : lines[0];
  const suffix = !expanded && lines.length > 1 ? theme.fg("muted", " ...") : "";
  return resultLine(theme, theme.fg("error", preview) + suffix);
}
