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
