/**
 * Shared consecutive-call aggregation for compact tool cards.
 *
 * Groups consecutive calls of the same tool (e.g. read, todo) into one
 * visually collapsed card:
 *
 *   √ read ×2
 *     ├─ path-a lines 1-80
 *     └─ path-b lines 1-120
 *
 * - A single call keeps the existing one-line compact header.
 * - Consecutive same-tool calls merge under `√ <tool> ×N`; any other tool,
 *   agent boundary, or session shutdown closes the group.
 * - Expand (Ctrl+O / click) reveals each call's full output.
 * - Connector glyphs (├─ / └─) render dim.
 * - Invalidates only the group owner (the only component that draws), and the
 *   owner never invalidates others, so the render chain always terminates.
 */

import { Text, type Component } from "@earendil-works/pi-tui";
import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { fitLine, padLine, statusMarker, toolHeader, type UiTheme } from "./pi-ui.js";

type AnyArgs = Record<string, unknown>;
type AnyTheme = Parameters<NonNullable<ToolDefinition<any, any, any>["renderCall"]>>[1];
type AnyContext = Parameters<NonNullable<ToolDefinition<any, any, any>["renderCall"]>>[2];
type AnyResult = {
  content: Array<{ type: string; text?: string }>;
  details?: Record<string, unknown>;
};

export type ToolAggregationOptions = {
  /** Single-call header detail (no connector prefix). Defaults to ``. */
  line?: (args: AnyArgs, theme: AnyTheme) => string;
  /** Aggregated tree-row detail (no connector prefix). Defaults to `line`. */
  row?: (args: AnyArgs, theme: AnyTheme) => string;
  /** Full output text shown when expanded. Defaults to joined text blocks. */
  expandedText?: (result: AnyResult) => string;
};

type Entry = {
  id: string;
  single: string;
  row: string;
  output: string;
  errorText: string;
  isPartial: boolean;
  isError: boolean;
  group: Group;
  invalidate?: () => void;
};

type Group = {
  toolName: string;
  ownerId: string;
  entries: Entry[];
  expanded: boolean;
  closed: boolean;
};

type Store = {
  active?: Group;
  entries: Map<string, Entry>;
};

const AGGREGATION_KEY = Symbol.for("dotfiles.pi-tool-aggregation");
const globals = globalThis as unknown as { [key: symbol]: Store | undefined };
const store: Store = globals[AGGREGATION_KEY] ??= { entries: new Map() };

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL_MS = 80;

type SpinnerState = { timer?: ReturnType<typeof setInterval>; frame?: number };

function closeAggregation(): void {
  if (!store.active) return;
  store.active.closed = true;
  store.active = undefined;
}

function resetAggregation(): void {
  store.active = undefined;
  store.entries.clear();
}

/** Refresh the owner component (the only one that renders); never recurses. */
function invalidateOwner(group: Group, exceptId?: string): void {
  const owner = group.entries.find((item) => item.id === group.ownerId);
  if (owner && owner.id !== exceptId) owner.invalidate?.();
}

function textOutput(result: AnyResult): string {
  return result.content
    .filter((content) => content.type === "text")
    .map((content) => content.text ?? "")
    .join("\n")
    .trim();
}

function registerEntry(toolName: string, single: string, row: string, context: AnyContext): Entry {
  const existing = store.entries.get(context.toolCallId);
  if (existing) {
    existing.invalidate = context.invalidate;
    // Streaming / replay invokes renderCall repeatedly with progressively more
    // complete args; always refresh header/row text so a first frame with an
    // incomplete path (e.g. "<missing path>") is overwritten by the real one.
    existing.single = single;
    existing.row = row;
    if (existing.group.ownerId === existing.id) existing.group.expanded = context.expanded;
    return existing;
  }

  let group = store.active;
  if (!group || group.closed || group.toolName !== toolName) {
    group = {
      toolName,
      ownerId: context.toolCallId,
      entries: [],
      expanded: context.expanded,
      closed: false,
    };
    store.active = group;
  }

  const entry: Entry = {
    id: context.toolCallId,
    single,
    row,
    output: "",
    errorText: "",
    isPartial: context.isPartial,
    isError: context.isError,
    group,
    invalidate: context.invalidate,
  };
  group.entries.push(entry);
  store.entries.set(entry.id, entry);

  if (group.entries.length > 1) invalidateOwner(group, entry.id);
  return entry;
}

function updateResult(output: string, options: { isPartial: boolean }, context: AnyContext): void {
  const entry = store.entries.get(context.toolCallId);
  if (!entry) return;

  entry.isPartial = options.isPartial;
  entry.isError = context.isError;
  entry.output = output;
  entry.errorText = entry.isError ? output.split("\n")[0] ?? "Failed" : "";
  entry.invalidate = context.invalidate;
  if (entry.group.ownerId === entry.id) entry.group.expanded = context.expanded;
  // Only a non-owner signals the owner once on settle; the owner never
  // propagates, so invalidate() -> updateDisplay() -> renderResult re-run
  // never bounces back (no flicker / render storm).
  if (!options.isPartial && entry.group.ownerId !== entry.id) {
    invalidateOwner(entry.group);
  }
}

function bodyLines(entry: Entry, theme: AnyTheme, width: number): string[] {
  if (!entry.output) return [];
  return entry.output
    .split("\n")
    .map((line) => fitLine(`     │ ${theme.fg("toolOutput", line)}`, width, "", 0));
}

class GroupComponent implements Component {
  constructor(
    private entry: Entry,
    private theme: AnyTheme,
    private context: AnyContext,
    private toolName: string,
  ) {}

  update(entry: Entry, theme: AnyTheme, context: AnyContext): void {
    this.entry = entry;
    this.theme = theme;
    this.context = context;
    this.entry.invalidate = context.invalidate;
    if (this.entry.group.ownerId === this.entry.id) this.entry.group.expanded = context.expanded;
  }

  invalidate(): void {}

  render(width: number): string[] {
    this.syncSpinner();
    const group = this.entry.group;
    if (group.ownerId !== this.entry.id) return [];

    const isError = group.entries.some((entry) => entry.isError);
    const isPartial = !isError && group.entries.some((entry) => entry.isPartial);
    const state = { isError, isPartial };
    const lines: string[] = [];

    if (group.entries.length === 1) {
      const entry = group.entries[0];
      lines.push(fitLine(toolHeader(this.theme, this.toolName, entry.single, state), width, "", 0));
      if (entry.isError && entry.errorText) {
        lines.push(fitLine(`  ${this.theme.fg("error", entry.errorText)}`, width, "", 0));
      } else if (group.expanded) {
        lines.push(...bodyLines(entry, this.theme, width));
      }
      return lines;
    }

    lines.push(fitLine(toolHeader(this.theme, this.toolName, this.theme.fg("toolOutput", `×${group.entries.length}`), state), width, "", 0));
    group.entries.forEach((entry, index) => {
      const connector = index === group.entries.length - 1 ? "└─" : "├─";
      lines.push(fitLine(`  ${this.theme.fg("dim", connector)} ${entry.row}`, width, "", 0));
      if (entry.isError && entry.errorText) {
        lines.push(fitLine(`     ${this.theme.fg("error", entry.errorText)}`, width, "", 0));
      } else if (group.expanded) {
        lines.push(...bodyLines(entry, this.theme, width));
      }
    });
    return lines;
  }

  private syncSpinner(): void {
    const spinner = this.context.state as SpinnerState;
    if (this.context.isPartial) {
      spinner.frame ??= 0;
      if (!spinner.timer) {
        spinner.timer = setInterval(() => {
          spinner.frame = ((spinner.frame ?? 0) + 1) % SPINNER_FRAMES.length;
          this.context.invalidate();
        }, SPINNER_INTERVAL_MS);
        spinner.timer.unref();
      }
    } else if (spinner.timer) {
      clearInterval(spinner.timer);
      spinner.timer = undefined;
    }
  }
}

/**
 * Register aggregation lifecycle hooks and return a wrapper that turns a
 * tool definition into a self-rendering, consecutive-call-aggregating,
 * compact tool card.
 */
export function createToolAggregation(pi: ExtensionAPI) {
  pi.on("tool_execution_start", (event) => {
    if (event.toolName !== store.active?.toolName) closeAggregation();
  });
  pi.on("agent_start", () => closeAggregation());
  pi.on("agent_settled", () => closeAggregation());
  pi.on("session_shutdown", () => resetAggregation());

  return {
    wrap(tool: ToolDefinition<any, any, any>, options: ToolAggregationOptions = {}): ToolDefinition<any, any, any> {
      const toolName = tool.name;
      const line = options.line ?? (() => "");
      const row = options.row ?? line;
      const expandedText = options.expandedText ?? textOutput;

      return {
        ...tool,
        renderShell: "self",
        renderCall(args: AnyArgs, theme: AnyTheme, context: AnyContext) {
          const entry = registerEntry(toolName, line(args, theme), row(args, theme), context);
          const previous = context.lastComponent;
          const component = previous instanceof GroupComponent
            ? previous
            : new GroupComponent(entry, theme, context, toolName);
          component.update(entry, theme, context);
          return component;
        },
        renderResult(result: AnyResult, resultOptions: { isPartial: boolean }, _theme: AnyTheme, context: AnyContext) {
          updateResult(expandedText(result), resultOptions, context);
          const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
          text.setText("");
          return text;
        },
      };
    },
  };
}
