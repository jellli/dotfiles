import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export type UiTheme = {
  fg(color: any, text: string): string;
  bold(text: string): string;
};

export type ToolRenderState = {
  isError?: boolean;
  isPartial?: boolean;
};

export function fitLine(line: string, width: number, ellipsis = "...", minimumWidth = 1): string {
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

export function statusMarker(
  theme: UiTheme,
  state: ToolRenderState,
  partialMarker = "·",
): string {
  if (state.isError) return theme.fg("error", "×");
  if (state.isPartial) return theme.fg("muted", partialMarker);
  return theme.fg("success", "√");
}

export function toolHeader(
  theme: UiTheme,
  toolName: string,
  detail: string,
  state: ToolRenderState,
  partialMarker = "·",
): string {
  return `${statusMarker(theme, state, partialMarker)} ${theme.fg("toolTitle", theme.bold(toolName))} ${detail}`;
}
