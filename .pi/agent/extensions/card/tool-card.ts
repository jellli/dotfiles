/**
 * The tool card: one entry point that draws a transcript card for a tool.
 *
 * `toolCard(pi, tool, spec?)` composes every part of the card language -
 * badge, header bracketing, result line, error preview, expansion,
 * aggregation, spinner, elapsed clock, derived defaults, bounded memos - so a
 * tool hands in a Card spec and at most a body slot: the one seam for geometry
 * the Frame cannot derive. Cards used to hand-copy this language one renderer
 * at a time; each card is now one spec.
 *
 * Invariants this module has to keep:
 *
 * 1. The Frame owns the `└─` column. A body hands rows, and the Frame glues the
 *    connector on (`└─┌─…` for a box) and indents the rest to the result
 *    column; a body that yields nothing (no body, `undefined`, `[]`) leaves the
 *    Frame to draw the summary, the error preview, or the expansion itself.
 * 2. A `body` turns aggregation off. Asking for both (`aggregate: true`) throws
 *    where the card is attached instead of failing quietly at render time.
 * 3. `context.invalidate` is only ever called by the Frame, and only for the
 *    group owner. A non-owner settling notifies the owner once, and the owner
 *    never propagates, so `invalidate() -> updateDisplay() -> render` cannot
 *    bounce back (no render storm).
 * 4. The call slot draws the card and the result slot draws nothing. The host
 *    tolerates the same instance in both slots, but it renders every child it
 *    is handed, so sharing one there would draw the row twice; `lastComponent`
 *    stays per slot and `state` belongs to the row.
 * 5. A memo's key is (output, theme, width) and never a component identity, so
 *    a component the host rebuilds is still a cache hit.
 */
import { Text, type Component } from "@earendil-works/pi-tui";
import type {
  ExtensionAPI,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { spinnerChar, syncSpinner, type SpinnerState } from "./spinner.js";
import {
  bracketDetail,
  errorPreviewLine,
  fitLine,
  resultLine,
  RESULT_LINE_INDENT,
  shorten,
  textOutput,
  toolHeader,
} from "./text.js";

type AnyArgs = Record<string, unknown>;
type AnyTheme = Parameters<
  NonNullable<ToolDefinition<any, any, any>["renderCall"]>
>[1];
type AnyContext = Parameters<
  NonNullable<ToolDefinition<any, any, any>["renderCall"]>
>[2];
type AnyResult = {
  content?: Array<{ type: string; text?: string }>;
  details?: unknown;
};
type RenderOptions = { expanded: boolean; isPartial: boolean };

/** Per-row render state the Frame owns: the spinner frame and the start time. */
export type CardState = SpinnerState & { startedAt?: number };

/** What a body slot is handed for one render. */
export type CardBodyInput = {
  args: AnyArgs;
  /** Absent until the tool returns: a body draws the running card too. */
  result: AnyResult | undefined;
  options: RenderOptions;
  theme: AnyTheme;
  context: AnyContext;
  /** Width of the result column; the connector column is already subtracted. */
  width: number;
};

/**
 * Rows a body hands the Frame for the result area.
 *
 * The Frame places them: one row is result-line content (`└─ exit 0`), several
 * rows are a block whose top row glues to the connector (`└─┌───┐`, the diff and
 * bash boxes) and whose remaining rows indent to the same column. A body
 * therefore draws geometry only and never touches the connector.
 */
export type CardBody = (input: CardBodyInput) => string[] | undefined;

/**
 * What an adapter hands `toolCard` for one tool.
 *
 * Anything derivable from the tool definition is not in it: the badge comes from
 * the label, `detail` falls back to what the tool declares (or its first short
 * argument), the result line falls back to the text output, and the expanded
 * block falls back to the full text.
 */
export type CardSpec = {
  /** Header content behind the badge. The Frame adds the brackets. */
  detail?: (args: AnyArgs, theme: AnyTheme) => string;
  /** One row inside an aggregated group; defaults to `detail`. */
  row?: (args: AnyArgs, theme: AnyTheme) => string;
  /** Collapsed result-line content (pre-colored); defaults to `defaultSummary`. */
  summary?: (output: string, theme: AnyTheme) => string;
  /** The one seam for geometry the Frame cannot derive. Turns aggregation off. */
  body?: CardBody;
  /** Group consecutive calls of this tool under one header. Defaults to true. */
  aggregate?: boolean;
};

// ---------------------------------------------------------------------------
// Derived defaults
// ---------------------------------------------------------------------------

/**
 * `display.name` / `display.description`: the title and objective a tool
 * declares for its own UI (fabric's activity UI is the reference).
 */
export function runDisplay(args: unknown): {
  name?: string;
  description?: string;
} {
  const record =
    args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  const display = record.display;
  if (typeof display === "string") {
    const text = display.trim();
    return text === "" ? {} : { name: text };
  }
  if (!display || typeof display !== "object") return {};
  const { name, description } = display as {
    name?: unknown;
    description?: unknown;
  };
  return {
    ...(typeof name === "string" && name.trim() !== ""
      ? { name: name.trim() }
      : {}),
    ...(typeof description === "string" && description.trim() !== ""
      ? { description: description.trim() }
      : {}),
  };
}

/**
 * Header detail behind the badge, unbracketed: the objective the tool declares
 * for the call (`display.description`, else `display.name`), else its first
 * short single-line string argument.
 */
export function defaultDetail(args: unknown, theme: AnyTheme): string {
  const display = runDisplay(args);
  const declared = display.description ?? display.name;
  if (declared) return theme.fg("toolOutput", shorten(declared, 56));
  return firstShortArgument(args, theme);
}

/**
 * The first short single-line string argument, uncolored by brackets: what a
 * call is about when the tool declares no display of its own.
 */
export function firstShortArgument(args: unknown, theme: AnyTheme): string {
  const record =
    args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  for (const value of Object.values(record)) {
    if (typeof value !== "string") continue;
    const text = value.trim();
    if (text === "" || text.length > 96 || text.includes("\n")) continue;
    return theme.fg("toolOutput", shorten(text, 56));
  }
  return "";
}

/**
 * Collapsed result line when the tool derives nothing else: a single-line
 * output shows itself, a longer one shows how many lines it produced.
 */
export function defaultSummary(output: string, theme: AnyTheme): string {
  const lines = output.split("\n");
  if (lines.length === 1) {
    return theme.fg("toolOutput", shorten(lines[0], 96));
  }
  return theme.fg("muted", `${lines.length} lines`);
}

/**
 * Wall clock since the row started, e.g. `1.2s` or `1m30s`.
 *
 * The Frame owns the clock - it is the only place that sees a row from its first
 * frame to its last - so a body that shows wall time (the bash box) reads it
 * from here instead of timing the execution itself. The Frame does not put a
 * clock on the result line: for a card that draws no body the outcome line is
 * the whole result, and a ticking number beside it is noise.
 */
export function elapsedText(state: CardState): string {
  const startedAt = state?.startedAt;
  if (!startedAt) return "";
  const seconds = (Date.now() - startedAt) / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}m${Math.round(seconds % 60)}s`;
}

// ---------------------------------------------------------------------------
// Aggregation store
// ---------------------------------------------------------------------------

type Entry = {
  id: string;
  /** Header detail of this row when its group has a single call. */
  detail: string;
  /** Row content inside an aggregated group. */
  row: string;
  output: string;
  errorText: string;
  isPartial: boolean;
  isError: boolean;
  group: Group;
  invalidate?: () => void;
  state: CardState;
  /** Latest result of the row, for a body slot to draw. */
  result?: AnyResult;
  // A card redraws on every input event, so the derived lines are cached against
  // what they were derived from.
  summary?: Memo<string>;
  body?: Memo<string[]>;
};

type Group = {
  toolName: string;
  ownerId: string;
  entries: Entry[];
  expanded: boolean;
  closed: boolean;
  /** A group that never takes a second call (the card opted out). */
  aggregate: boolean;
};

type Store = {
  active?: Group;
  entries: Map<string, Entry>;
};

const AGGREGATION_KEY = Symbol.for("dotfiles.pi-tool-aggregation");
const globals = globalThis as unknown as { [key: symbol]: Store | undefined };
const store: Store = (globals[AGGREGATION_KEY] ??= { entries: new Map() });

/**
 * Close the active group.
 *
 * The entries map is deliberately not pruned here. A settled entry stays
 * reachable from its group component anyway, so dropping the map slot frees
 * nothing - and the host re-invokes renderCall on every updateDisplay (a resize,
 * an expand, any invalidation). An id that is missing from the map registers a
 * second time, which rebuilds the closed group as a fresh single-call card and
 * loses the rows already drawn. See test/tool-card.test.mjs.
 */
function closeAggregation(): void {
  if (!store.active) return;
  store.active.closed = true;
  store.active = undefined;
}

function resetAggregation(): void {
  store.active = undefined;
  store.entries.clear();
}

/** The active group a call may join, if any (see CardSpec.aggregate). */
function openGroupFor(
  active: Group | undefined,
  toolName: string,
  aggregate: boolean,
): Group | undefined {
  if (!aggregate || !active || !active.aggregate || active.closed) {
    return undefined;
  }
  return active.toolName === toolName ? active : undefined;
}

/** Refresh the owner component (the only one that renders); never recurses. */
function invalidateOwner(group: Group, exceptId?: string): void {
  const owner = group.entries.find((item) => item.id === group.ownerId);
  if (owner && owner.id !== exceptId) owner.invalidate?.();
}

function registerEntry(
  tool: ToolDefinition<any, any, any>,
  detail: string,
  row: string,
  aggregate: boolean,
  context: AnyContext,
): Entry {
  const existing = store.entries.get(context.toolCallId);
  if (existing) {
    existing.invalidate = context.invalidate;
    // Streaming / replay invokes renderCall repeatedly with progressively more
    // complete args; always refresh header/row text so a first frame with an
    // incomplete path (e.g. "<missing path>") is overwritten by the real one.
    existing.detail = detail;
    existing.row = row;
    if (existing.group.ownerId === existing.id)
      existing.group.expanded = context.expanded;
    return existing;
  }

  const open = openGroupFor(store.active, tool.name, aggregate);
  const group: Group = open ?? {
    toolName: tool.name,
    ownerId: context.toolCallId,
    entries: [],
    expanded: context.expanded,
    closed: false,
    aggregate,
  };
  // A card that opted out of aggregation never becomes the active group, so a
  // consecutive call of the same tool still draws its own card.
  if (open === undefined && aggregate) store.active = group;

  const state = (context.state ?? {}) as CardState;
  // The Frame is the only writer of the row's clock (see elapsedText).
  state.startedAt ??= Date.now();
  const entry: Entry = {
    id: context.toolCallId,
    detail,
    row,
    output: "",
    errorText: "",
    isPartial: context.isPartial,
    isError: context.isError,
    group,
    invalidate: context.invalidate,
    state,
  };
  group.entries.push(entry);
  store.entries.set(entry.id, entry);

  if (group.entries.length > 1) invalidateOwner(group, entry.id);
  return entry;
}

function updateResult(
  result: AnyResult,
  options: { isPartial: boolean },
  context: AnyContext,
): void {
  const entry = store.entries.get(context.toolCallId);
  if (!entry) return;

  const output = textOutput(result);
  entry.isPartial = options.isPartial;
  entry.isError = context.isError;
  entry.output = output;
  entry.result = result;
  entry.errorText = entry.isError ? (output.split("\n")[0] ?? "Failed") : "";
  entry.invalidate = context.invalidate;
  if (entry.group.ownerId === entry.id) entry.group.expanded = context.expanded;
  // Only a non-owner signals the owner once on settle; the owner never
  // propagates, so invalidate() -> updateDisplay() -> renderResult re-run
  // never bounces back (no flicker / render storm).
  if (!options.isPartial && entry.group.ownerId !== entry.id) {
    invalidateOwner(entry.group);
  }
}

// ---------------------------------------------------------------------------
// Bounded memos
// ---------------------------------------------------------------------------

/** A derived line, kept until the output, theme, or width it came from changes. */
type Memo<T> = { output: string; theme: AnyTheme; width: number; value: T };

/** The memo for `entry` at this key, recomputed only when the key moved. */
function memoize<T>(
  memo: Memo<T> | undefined,
  entry: Entry,
  theme: AnyTheme,
  width: number,
  compute: () => T,
): Memo<T> {
  if (
    memo &&
    memo.output === entry.output &&
    memo.theme === theme &&
    memo.width === width
  ) {
    return memo;
  }
  return { output: entry.output, theme, width, value: compute() };
}

/** The summary line for a row, derived once per (output, theme, width). */
function summaryLine(
  entry: Entry,
  theme: AnyTheme,
  width: number,
  summary: (output: string, theme: AnyTheme) => string,
): string {
  entry.summary = memoize(entry.summary, entry, theme, width, () =>
    summary(entry.output, theme),
  );
  return entry.summary.value;
}

/** The expanded block: the full text output, one `│ ` prefixed row per line. */
function expandedLines(entry: Entry, theme: AnyTheme, width: number): string[] {
  entry.body = memoize(entry.body, entry, theme, width, () =>
    entry.output
      .split("\n")
      .map((line) =>
        fitLine(`     │ ${theme.fg("toolOutput", line)}`, width, "", 0),
      ),
  );
  return entry.body.value;
}

// ---------------------------------------------------------------------------
// The Frame
// ---------------------------------------------------------------------------

type ResolvedSpec = {
  detail: (args: AnyArgs, theme: AnyTheme) => string;
  row: (args: AnyArgs, theme: AnyTheme) => string;
  summary: (output: string, theme: AnyTheme) => string;
  body?: CardBody;
};

class Frame implements Component {
  constructor(
    private entry: Entry,
    private theme: AnyTheme,
    private context: AnyContext,
    private readonly spec: ResolvedSpec,
    private readonly tool: ToolDefinition<any, any, any>,
  ) {}

  update(entry: Entry, theme: AnyTheme, context: AnyContext): void {
    this.entry = entry;
    this.theme = theme;
    this.context = context;
    if (entry.group.ownerId === entry.id)
      entry.group.expanded = context.expanded;
  }

  /** The Frame only draws; it never asks the host to redraw it (invariant 3). */
  invalidate(): void {}

  render(width: number): string[] {
    const group = this.entry.group;
    if (group.ownerId !== this.entry.id) return [];

    const running = group.entries.some((entry) => entry.isPartial);
    syncSpinner(this.entry.state, running, this.context.invalidate);

    if (group.entries.length === 1) {
      const entry = group.entries[0];
      return this.rows([
        this.header(entry.detail, width),
        ...this.resultArea(entry, width),
      ]);
    }

    const lines = [
      this.header(
        this.theme.fg("toolOutput", `×${group.entries.length}`),
        width,
      ),
    ];
    group.entries.forEach((entry, index) => {
      const connector = index === group.entries.length - 1 ? "└─" : "├─";
      lines.push(
        fitLine(
          `  ${this.theme.fg("dim", connector)} ${entry.row}`,
          width,
          "",
          0,
        ),
      );
      if (entry.isError && entry.errorText) {
        lines.push(
          fitLine(
            `     ${this.theme.fg("error", entry.errorText)}`,
            width,
            "",
            0,
          ),
        );
      } else if (group.expanded) {
        lines.push(...expandedLines(entry, this.theme, width));
      }
    });
    return this.rows(lines);
  }

  /**
   * Split a frame into transcript rows.
   *
   * One row is one line, and only the expanded error preview of the Frame's own
   * derivations carries newlines (a body may as well), so they are split here
   * instead of handing the host a line with a newline inside it. Every other row
   * was fitted where it was derived.
   */
  private rows(lines: string[]): string[] {
    return lines.flatMap((line) => line.split("\n"));
  }

  private header(detail: string, width: number): string {
    const badge = this.tool.label || this.tool.name;
    const header =
      detail === ""
        ? toolHeader(this.theme, badge, "")
        : toolHeader(this.theme, badge, bracketDetail(this.theme, detail));
    return fitLine(header, width, "", 0);
  }

  /** The result column: a body that draws it, else what the Frame derives. */
  private resultArea(entry: Entry, width: number): string[] {
    if (this.spec.body) {
      const rows = this.spec.body({
        args:
          this.context.args && typeof this.context.args === "object"
            ? (this.context.args as AnyArgs)
            : {},
        result: entry.result,
        options: {
          expanded: entry.group.expanded,
          isPartial: entry.isPartial,
        },
        theme: this.theme,
        context: this.context,
        width: Math.max(1, width - RESULT_LINE_INDENT),
      });
      // A body is called on every render rather than memoized: it may draw
      // render-time state of its own (lazy highlighting, a streaming box) that
      // no key the Frame holds can see.
      if (rows && rows.length > 0) return this.placeBody(rows, width);
    }

    if (entry.isPartial) {
      const frame = this.theme.fg("muted", spinnerChar(entry.state));
      return [fitLine(resultLine(this.theme, frame), width, "", 0)];
    }
    if (entry.isError && entry.output) {
      return [
        fitLine(
          errorPreviewLine(this.theme, entry.output, entry.group.expanded),
          width,
          "",
          0,
        ),
      ];
    }
    if (!entry.output) return [];
    if (entry.group.expanded) {
      return expandedLines(entry, this.theme, width);
    }
    const content = summaryLine(entry, this.theme, width, this.spec.summary);
    return [fitLine(resultLine(this.theme, content), width, "", 0)];
  }

  /** Place the rows a body handed over (see CardBody). */
  private placeBody(rows: string[], width: number): string[] {
    const [first, ...rest] = rows;
    const head =
      rows.length > 1
        ? resultLine(this.theme, first, true)
        : resultLine(this.theme, first);
    const indent = " ".repeat(RESULT_LINE_INDENT);
    return [head, ...rest.map((line) => `${indent}${line}`)].map((line) =>
      fitLine(line, width, "", 0),
    );
  }
}

// ---------------------------------------------------------------------------
// Attach
// ---------------------------------------------------------------------------

/** pi instances whose aggregation boundaries are already wired. */
const wired = new WeakSet<ExtensionAPI>();

/**
 * Wire the card module's lifecycle hooks for one pi instance.
 *
 * The aggregation store is per process (see AGGREGATION_KEY) and survives
 * `/reload`, so the boundaries only have to be wired once per instance; a second
 * install would close every group twice.
 */
export function installCardHooks(pi: ExtensionAPI): void {
  if (wired.has(pi)) return;
  wired.add(pi);
  pi.on("tool_execution_start", (event) => {
    if (event.toolName !== store.active?.toolName) closeAggregation();
  });
  pi.on("agent_start", () => closeAggregation());
  pi.on("agent_settled", () => closeAggregation());
  pi.on("session_shutdown", () => resetAggregation());
}

/**
 * Attach the card language to one tool definition.
 *
 * Returns a definition whose `renderCall`/`renderResult` draw the Frame; the
 * schema, prompt metadata, and `execute` are the tool's own, untouched.
 */
export function toolCard<T extends ToolDefinition<any, any, any>>(
  pi: ExtensionAPI,
  tool: T,
  spec: CardSpec = {},
): T {
  // A body owns the whole result area, so a group would have to pick which row's
  // body draws the shared card. Reject the pair where the card is attached
  // rather than silently dropping one of them at render time.
  if (spec.body && spec.aggregate) {
    throw new Error(
      `toolCard: ${tool.name} cannot combine a body with aggregate: true`,
    );
  }
  installCardHooks(pi);

  const resolved: ResolvedSpec = {
    detail: spec.detail ?? defaultDetail,
    row: spec.row ?? spec.detail ?? defaultDetail,
    summary: spec.summary ?? defaultSummary,
    body: spec.body,
  };
  const aggregate = spec.body ? false : spec.aggregate !== false;

  return {
    ...tool,
    // Self-rendering bypasses Pi's colored Box shell: the Frame draws the badge
    // itself.
    renderShell: "self",
    renderCall(args: unknown, theme: AnyTheme, context: AnyContext) {
      const toolArgs =
        args && typeof args === "object" ? (args as AnyArgs) : {};
      const entry = registerEntry(
        tool,
        resolved.detail(toolArgs, theme),
        resolved.row(toolArgs, theme),
        aggregate,
        context,
      );
      const previous = context.lastComponent;
      const frame =
        previous instanceof Frame
          ? previous
          : new Frame(entry, theme, context, resolved, tool);
      frame.update(entry, theme, context);
      return frame;
    },
    renderResult(
      result: AnyResult,
      options: { isPartial: boolean },
      _theme: AnyTheme,
      context: AnyContext,
    ) {
      // The Frame draws the settled card from the row it already holds, so this
      // slot must not add a second copy of it (invariant 4).
      updateResult(result, options, context);
      const text =
        (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
      text.setText("");
      return text;
    },
  } as T;
}
