import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { uiLifecycle } from "./lifecycle.js";

export type UiTheme = {
  fg(color: any, text: string): string;
  bg(color: any, text: string): string;
  bold(text: string): string;
};

export function fitLine(
  line: string,
  width: number,
  ellipsis = "...",
  minimumWidth = 1,
): string {
  const targetWidth = Math.max(minimumWidth, width);
  return visibleWidth(line) <= targetWidth
    ? line
    : truncateToWidth(line, targetWidth, ellipsis, false);
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
// Spinner — frame state lives in the tool render context's shared state
// ---------------------------------------------------------------------------

// Breathing dot: a filled circle alternating with a small bullet — conveys
// loading without any positional motion, so it never blends into the
// box-drawing characters around it.
export const SPINNER_FRAMES = ["●", "●", "•", "•"];
// The breathing dot is four frames; 140ms is still smooth, and each tick costs
// a full re-render of the transcript.
const SPINNER_INTERVAL_MS = 140;

export type SpinnerState = {
  timer?: ReturnType<typeof setInterval>;
  frame?: number;
  /** Unregisters the timer's teardown from the extension lifecycle. */
  release?: () => void;
};

/** Advance the spinner frame while `isPartial`; call on every render. */
export function syncSpinner(
  state: SpinnerState,
  isPartial: boolean,
  invalidate: () => void,
): void {
  if (isPartial) {
    state.frame ??= 0;
    if (!state.timer) {
      // Scoped to this tool execution and never keeps Pi alive.
      const timer = setInterval(() => {
        state.frame = ((state.frame ?? 0) + 1) % SPINNER_FRAMES.length;
        invalidate();
      }, SPINNER_INTERVAL_MS);
      timer.unref();
      state.timer = timer;
      // Registered so a reload while a tool is streaming does not leave the old
      // runtime's interval ticking against a transcript nobody draws.
      state.release = uiLifecycle.add(() => stopSpinner(state, timer));
    }
  } else if (state.timer) {
    stopSpinner(state, state.timer);
  }
}

function stopSpinner(
  state: SpinnerState,
  timer: ReturnType<typeof setInterval>,
): void {
  clearInterval(timer);
  if (state.timer === timer) {
    state.timer = undefined;
    state.release?.();
    state.release = undefined;
  }
}

export function spinnerChar(state: SpinnerState): string {
  return SPINNER_FRAMES[state.frame ?? 0];
}

// ---------------------------------------------------------------------------
// Shared card helpers (used by brave-search and ollama-web-fetch)
// ---------------------------------------------------------------------------

/** A tool result whose text lives in `content` (the AgentToolResult shape). */
export type ToolTextResult = {
  content: Array<{ type: string; text?: string }>;
};

/** Truncate a string to `max` chars with a trailing ellipsis. */
export function shorten(value: string, max = 56): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/** Join the text blocks of a tool result, trimmed. */
export function textOutput(result: ToolTextResult): string {
  return result.content
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
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
