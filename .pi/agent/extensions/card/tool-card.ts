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
 *    where the card is attached instead of failing quietly at render time; a body
 *    the Frame derives for a tool that draws its own card counts as one.
 * 3. `context.invalidate` is only ever called by the Frame, and only for the
 *    group owner. A slot asks for a repaint through the card input's `redraw()`,
 *    and the Frame routes that by the same owner rule: a row joining a group, or
 *    settling, or asking, notifies the owner once, and the owner never
 *    propagates, so `invalidate() -> updateDisplay() -> render` cannot bounce
 *    back (no render storm).
 * 4. The call slot draws the card and the result slot draws nothing. The host
 *    tolerates the same instance in both slots, but it renders every child it
 *    is handed, so sharing one there would draw the row twice; `lastComponent`
 *    stays per slot and `state` belongs to the row.
 * 5. A memo's key is (epoch, theme, width) and never a component identity, so a
 *    component the host rebuilds is still a cache hit. The epoch is the row's
 *    version: it moves when an input a slot reads really changed, or when a slot
 *    asks for a repaint - never once per frame.
 * 6. Teardown runs through one registry (`installCardHooks`), so `/reload`
 *    leaves no listener behind.
 * 7. A slot sees the card input and nothing else: the call's `args`, the row's
 *    `result`, `output`, `options`, `theme`, `state` and `cwd`, and `redraw()`.
 *    The host context stays with the Frame - the one exception is the Frame's
 *    own body, which hands it back to a third-party renderer (see `ownBody`).
 */
import { Text, type Component } from "@earendil-works/pi-tui";
import type {
  ExtensionAPI,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { spinnerChar, syncSpinner, type SpinnerState } from "./spinner.js";
import { stripBackground } from "./strip-background.js";
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
type AnyRenderCall = NonNullable<ToolDefinition<any, any, any>["renderCall"]>;
type AnyRenderResult = NonNullable<
  ToolDefinition<any, any, any>["renderResult"]
>;
type AnyResult = {
  content?: Array<{ type: string; text?: string }>;
  details?: unknown;
};
/**
 * What a slot reads about the render in progress.
 *
 * The first two are the host's own view flags; the outcome rides here too, since
 * a body that draws geometry (the bash box, the diff box) draws a failure
 * differently and the Frame's result area keys off it as well.
 */
export type RenderOptions = {
  expanded: boolean;
  isPartial: boolean;
  isError: boolean;
};

/** A tool's own component, cached per row and render slot (see `ownBody`). */
type OwnCardState = {
  call?: Component;
  result?: Component;
  /** The rows the own card last drew, and the inputs they were derived from. */
  drawn?: OwnCardRows;
};

/** The slot an own card was derived for: the call while it runs, the result after. */
type OwnSlot = "call" | "result";

/**
 * Rows a tool's own card drew, with the inputs its renderer saw.
 *
 * Re-deriving them re-runs the tool's whole renderer, and a third-party renderer
 * rebuilds its card from scratch on every call (fabric's fabric_exec: ~0.5ms a
 * row, against ~0.02ms to re-render the component it had already returned). The
 * host calls a renderer once per `updateDisplay` and re-renders what it returned
 * on every frame, so the Frame has to do the same: otherwise a long transcript
 * pays for every row on every keystroke and on every spinner tick (measured
 * 2026-09-16 over a real session: 68ms a frame for its 143 settled fabric_exec
 * rows, 0.6ms once they are cached).
 *
 * A row that is still streaming is re-derived every frame instead: its own card
 * animates, its progress line moves, and only the one live row is ever at stake.
 */
type OwnCardRows = {
  slot: OwnSlot;
  /** The host repaint these were derived at (see `CardState.repaint`). */
  repaint: number;
  expanded: boolean;
  width: number;
  theme: AnyTheme;
  /** `undefined` when the tool drew nothing; the Frame's fallback stands. */
  rows?: string[];
};

/** Per-row render state the Frame owns: the spinner frame and the start time. */
export type CardState = SpinnerState & {
  startedAt?: number;
  /** Bumped whenever the host re-runs a render slot (see `markRepaint`). */
  repaint?: number;
  /** The card a tool draws itself, when it ships a renderer (see `ownBody`). */
  own?: OwnCardState;
  /**
   * The host's id for this tool call, stamped by the Frame.
   *
   * It is what a slot needs to reach a value the tool handed over before the row
   * was ever rendered (pi-diff captures the file content in `execute`): the card
   * input carries no id, so the row's identity is part of the row's state.
   */
  toolCallId?: string;
};

/**
 * What the Frame hands one slot for one render.
 *
 * The same record for all four slots, so a slot reads the call's own arguments,
 * the result with its details, the row's state and the session's cwd instead of
 * recovering them from the text output. Nothing here is the host's context: the
 * only way to ask for a repaint is `redraw()` (invariant 7).
 */
export type CardInput<S extends object = object> = {
  args: AnyArgs;
  /** Absent until the tool returns: a slot draws the running card too. */
  result: AnyResult | undefined;
  /** The tool's text output, trimmed. */
  output: string;
  options: RenderOptions;
  theme: AnyTheme;
  /** The row's state: the Frame's spinner/clock/repaint record and the card's own. */
  state: CardState & S;
  cwd: string;
  /** The only way a slot asks for a repaint; the Frame routes it by owner. */
  redraw(): void;
};

/**
 * What a body slot is handed: the card input plus the column it draws in.
 *
 * Rows a body hands the Frame for the result area: one row is result-line
 * content (`└─ exit 0`), several rows are a block whose top row glues to the
 * connector (`└─┌───┐`, the diff and bash boxes) and whose remaining rows indent
 * to the same column, so a box lines up with its own top border. A body
 * therefore draws geometry only and never touches the connector.
 */
export type CardBodyInput<S extends object = object> = CardInput<S> & {
  /** Width of the result column; the connector column is already subtracted. */
  width: number;
};

/**
 * What an adapter hands `toolCard` for one tool.
 *
 * Anything derivable from the tool definition is not in it: the badge comes from
 * the label, `detail` falls back to what the tool declares (or its first short
 * argument), the result line falls back to the text output, and the expanded
 * block falls back to the full text.
 *
 * `S` is the card's own part of the row state (`CardInput.state` is the Frame's
 * record intersected with it), so a slot reads what it wrote back without a cast.
 */
export type CardSpec<S extends object = object> = {
  /** Header content behind the badge. The Frame adds the brackets. */
  detail?: (input: CardInput<S>) => string;
  /** One row inside an aggregated group; defaults to `detail`. */
  row?: (input: CardInput<S>) => string;
  /** Collapsed result-line content (pre-colored); defaults to `defaultSummary`. */
  summary?: (input: CardInput<S>) => string;
  /** The one seam for geometry the Frame cannot derive. Turns aggregation off. */
  body?: (input: CardBodyInput<S>) => string[] | undefined;
  /** Group consecutive calls of this tool under one header. Defaults to true. */
  aggregate?: boolean;
};

/** The card input as the Frame passes it around; a spec's `S` is its own. */
type AnyCardInput = CardInput<any>;

/**
 * What the Frame hands its own body slot: the card input plus the host context.
 *
 * An adapter's `body` is typed as `CardBodyInput` and never sees the context
 * (invariant 7). `ownBody` is the Frame's own body, and it hands the context on
 * to a third-party renderer untouched: that renderer reads fields the card input
 * has no equivalent for (`toolCallId`, `executionStarted`, ...) and hands its
 * component back through `lastComponent`.
 */
type FrameBodyInput = CardBodyInput<any> & { context: AnyContext };

// ---------------------------------------------------------------------------
// Derived defaults
// ---------------------------------------------------------------------------

/**
 * `display.name` / `display.description`: the title and objective a tool
 * declares for its own UI (fabric's activity UI is the reference).
 */
export function runDisplay(input: CardInput): {
  name?: string;
  description?: string;
} {
  const display = input.args.display;
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
export function defaultDetail(input: CardInput): string {
  const display = runDisplay(input);
  const declared = display.description ?? display.name;
  if (declared) return input.theme.fg("toolOutput", shorten(declared, 56));
  return firstShortArgument(input);
}

/**
 * The first short single-line string argument, uncolored by brackets: what a
 * call is about when the tool declares no display of its own.
 */
export function firstShortArgument(input: CardInput): string {
  for (const value of Object.values(input.args)) {
    if (typeof value !== "string") continue;
    const text = value.trim();
    if (text === "" || text.length > 96 || text.includes("\n")) continue;
    return input.theme.fg("toolOutput", shorten(text, 56));
  }
  return "";
}

/**
 * Collapsed result line when the tool derives nothing else: a single-line
 * output shows itself, a longer one shows how many lines it produced.
 */
export function defaultSummary(input: CardInput): string {
  const lines = input.output.split("\n");
  if (lines.length === 1) {
    return input.theme.fg("toolOutput", shorten(lines[0], 96));
  }
  return input.theme.fg("muted", `${lines.length} lines`);
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
  /** The row's call arguments: every slot derives from these (invariant 7). */
  args: AnyArgs;
  /** The session's cwd the row was registered in. */
  cwd: string;
  output: string;
  errorText: string;
  isPartial: boolean;
  isError: boolean;
  group: Group;
  invalidate?: () => void;
  state: CardState;
  /** Latest result of the row, for a slot to draw. */
  result?: AnyResult;
  /**
   * The row's version: the only thing the derived lines are keyed on, besides
   * the theme and the width (invariant 5).
   *
   * It moves when an input a slot reads really changed - the arguments, the
   * result, the text output, or either flag - and when a slot asks for a repaint,
   * because a repaint means the slot saw state of its own change. It deliberately
   * does not move on every frame, or every card in the transcript would miss its
   * memo on every keystroke.
   */
  epoch: number;
  // A card redraws on every input event, so the derived lines are cached against
  // what they were derived from.
  detail?: Memo<string>;
  row?: Memo<string>;
  summary?: Memo<string>;
  body?: Memo<string[]>;
  /** The result column a body drew, already placed and fitted (see placeBody). */
  placed?: Placed;
};

/** Rows a body handed over, placed inside the result column and fitted. */
type Placed = {
  /** The array the body returned; identity is the cache key (see placeBody). */
  rows: string[];
  width: number;
  theme: AnyTheme;
  lines: string[];
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

/**
 * Note that the host re-ran a render slot (`updateDisplay`).
 *
 * It is the one thing that can change what a tool's own card would draw: the
 * Frame draws those rows from `OwnCardRows` instead of calling the renderer on
 * every frame.
 */
function markRepaint(context: AnyContext): void {
  const state = context.state as CardState | undefined;
  if (state) state.repaint = (state.repaint ?? 0) + 1;
}

/** One input that moved, counted into a row's epoch (invariant 5). */
function moved(from: unknown, to: unknown): number {
  return from === to ? 0 : 1;
}

function registerEntry(
  tool: ToolDefinition<any, any, any>,
  aggregate: boolean,
  context: AnyContext,
): Entry {
  markRepaint(context);
  const args =
    context.args && typeof context.args === "object"
      ? (context.args as AnyArgs)
      : {};
  const existing = store.entries.get(context.toolCallId);
  if (existing) {
    // Streaming / replay invokes renderCall repeatedly with progressively more
    // complete args. The row keeps the latest ones and counts them into its
    // epoch: the Frame derives the header and the group row from them when it
    // renders, so a first frame with an incomplete path ("<missing path>") is
    // overwritten by the real one on the redraw the host already asked for.
    existing.epoch +=
      moved(args, existing.args) + moved(context.cwd, existing.cwd);
    existing.args = args;
    existing.cwd = context.cwd;
    existing.invalidate = context.invalidate;
    // `isPartial` and `isError` are the result slot's to write, never this one's.
    // The host rebuilds every row from the session when it reloads an extension:
    // the rebuilt component is new, so it reports the row as pending until its
    // result message reaches it - while the row already holds the outcome it was
    // given. Reading them here would un-settle a settled row, i.e. restart the
    // spinner and its repaint (140ms) on every card the reload touched, with the
    // wall clock of every settled bash box climbing along with it.
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
  // The Frame is the only writer of the row's clock (see elapsedText) and of the
  // row's id, which is how a slot reaches a value the tool handed over before the
  // row was ever rendered (see CardState.toolCallId).
  state.startedAt ??= Date.now();
  state.toolCallId ??= context.toolCallId;
  const entry: Entry = {
    id: context.toolCallId,
    args,
    cwd: context.cwd,
    output: "",
    errorText: "",
    isPartial: context.isPartial,
    isError: context.isError,
    group,
    invalidate: context.invalidate,
    state,
    epoch: 0,
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
  markRepaint(context);
  const entry = store.entries.get(context.toolCallId);
  if (!entry) return;

  const output = textOutput(result);
  entry.epoch +=
    moved(result, entry.result) +
    moved(output, entry.output) +
    moved(options.isPartial, entry.isPartial) +
    moved(context.isError, entry.isError);
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

/**
 * A derived line, kept until the row's epoch, the theme, or the width changes.
 *
 * The row's own record is the whole key (invariant 5): it holds every input a
 * slot reads, and its epoch moves only when one of them really did. The theme
 * stays in the key for the sake of not diverging from what the key used to be -
 * the host hands back one stable theme object whose accessors read the live
 * theme, so in practice it never invalidates a memo.
 */
type Memo<T> = { epoch: number; theme: AnyTheme; width: number; value: T };

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
    memo.epoch === entry.epoch &&
    memo.theme === theme &&
    memo.width === width
  ) {
    return memo;
  }
  return { epoch: entry.epoch, theme, width, value: compute() };
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

/**
 * Default body for a tool that draws its own card.
 *
 * A third-party definition owns its renderer, and that renderer draws the whole
 * result: the Frame keeps the badge, the header, the connector, and the
 * fallback, and hands the tool's own rows through. Backgrounds are the only
 * thing dropped (a third-party card paints them for a transcript this repo
 * already colors), the tool's real expanded state passes through, and
 * `invalidate` is neutralized - a renderer that asks for a redraw while drawing
 * would re-run this render forever. The component is cached per row and slot, so
 * the tool's own state survives a redraw, and it is handed back to the renderer
 * as `lastComponent` the way the host hands back its own.
 *
 * The rows are kept with the component (see `OwnCardRows`): the renderer runs
 * when the host re-runs the slots, while the call is streaming, or when the
 * geometry moved - never once per frame, which is what a long transcript would
 * otherwise pay for every settled row.
 */
function ownBody(
  tool: ToolDefinition<any, any, any>,
): (input: FrameBodyInput) => string[] | undefined {
  return (input) => {
    const state = input.state;
    const own: OwnCardState = (state.own ??= {});
    const expanded = input.options.expanded;
    const isPartial = input.options.isPartial;
    const slot: OwnSlot = input.result === undefined ? "call" : "result";
    const repaint = state.repaint ?? 0;
    const drawn = own.drawn;
    if (
      drawn !== undefined &&
      !isPartial &&
      drawn.slot === slot &&
      drawn.repaint === repaint &&
      drawn.expanded === expanded &&
      drawn.width === input.width &&
      drawn.theme === input.theme
    ) {
      return drawn.rows;
    }

    const rows = drawOwnCard(tool, input, own, slot, expanded, isPartial);
    own.drawn = {
      slot,
      repaint,
      expanded,
      width: input.width,
      theme: input.theme,
      rows,
    };
    return rows;
  };
}

/** Run a tool's own renderer once and hand its rows over (see `ownBody`). */
function drawOwnCard(
  tool: ToolDefinition<any, any, any>,
  input: FrameBodyInput,
  own: OwnCardState,
  slot: OwnSlot,
  expanded: boolean,
  isPartial: boolean,
): string[] | undefined {
  const nested = {
    ...input.context,
    expanded,
    invalidate: () => {},
  } as AnyContext;
  const options = { isPartial, expanded };

  let component: Component | undefined;
  if (slot === "call") {
    const renderCall = tool.renderCall as AnyRenderCall | undefined;
    if (!renderCall) return undefined;
    try {
      component = renderCall(input.args, input.theme, {
        ...nested,
        lastComponent: own.call,
      });
    } catch {
      return undefined;
    }
    own.call = component;
  } else {
    const renderResult = tool.renderResult as AnyRenderResult | undefined;
    if (!renderResult) return undefined;
    try {
      component = renderResult(
        // The Frame keeps whatever the tool returned; only the tool's own
        // renderer knows that shape.
        input.result as Parameters<AnyRenderResult>[0],
        options,
        input.theme,
        { ...nested, lastComponent: own.result },
      );
    } catch {
      return undefined;
    }
    own.result = component;
  }

  let rows: string[] | undefined;
  try {
    rows = component.render(input.width);
  } catch {
    return undefined;
  }
  // Nothing drawn: the Frame's own summary / error preview / expansion stands.
  if (!rows || rows.length === 0) return undefined;
  return rows.map((line) => stripBackground(line));
}

// ---------------------------------------------------------------------------
// The Frame
// ---------------------------------------------------------------------------

type ResolvedSpec = {
  detail: (input: AnyCardInput) => string;
  row: (input: AnyCardInput) => string;
  summary: (input: AnyCardInput) => string;
  body?: (input: FrameBodyInput) => string[] | undefined;
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
        this.header(this.detail(entry, width), width),
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
          `  ${this.theme.fg("dim", connector)} ${this.row(entry, width)}`,
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

  /**
   * The card input for one row: everything a slot reads, and nothing else.
   *
   * A fresh object per derivation, so the `state` a slot writes is the row's own
   * and the `redraw()` it gets is bound to this row (invariant 7).
   */
  private input(entry: Entry): AnyCardInput {
    return {
      args: entry.args,
      result: entry.result,
      output: entry.output,
      options: {
        expanded: entry.group.expanded,
        isPartial: entry.isPartial,
        isError: entry.isError,
      },
      theme: this.theme,
      state: entry.state,
      cwd: entry.cwd,
      redraw: () => this.redraw(entry),
    };
  }

  /**
   * A slot asked for a repaint of this row.
   *
   * Its own state moved under the Frame's feet (the bash highlight landed, the
   * diff box tokenized more lines), so the row's epoch moves with it - the memo
   * key has to see the change - and the request goes to the group owner by the
   * same rule a settling row uses: the owner is asked once and never propagates
   * (invariant 3).
   */
  private redraw(entry: Entry): void {
    entry.epoch += 1;
    invalidateOwner(entry.group);
  }

  /** The header detail of one row, derived once per (epoch, theme, width). */
  private detail(entry: Entry, width: number): string {
    entry.detail = memoize(entry.detail, entry, this.theme, width, () =>
      this.spec.detail(this.input(entry)),
    );
    return entry.detail.value;
  }

  /** One row of an aggregated group, derived once per (epoch, theme, width). */
  private row(entry: Entry, width: number): string {
    entry.row = memoize(entry.row, entry, this.theme, width, () =>
      this.spec.row(this.input(entry)),
    );
    return entry.row.value;
  }

  /** The collapsed result line, derived once per (epoch, theme, width). */
  private summary(entry: Entry, width: number): string {
    entry.summary = memoize(entry.summary, entry, this.theme, width, () =>
      this.spec.summary(this.input(entry)),
    );
    return entry.summary.value;
  }

  /** The result column: a body that draws it, else what the Frame derives. */
  private resultArea(entry: Entry, width: number): string[] {
    if (this.spec.body) {
      const rows = this.spec.body({
        ...this.input(entry),
        width: Math.max(1, width - RESULT_LINE_INDENT),
        context: this.context,
      });
      // A body is called on every render rather than memoized: it may draw
      // render-time state of its own (lazy highlighting, a streaming box) that no
      // key the Frame holds can see. A body wrapping a renderer this repo does
      // not own keeps its own rows instead (see `ownBody`).
      if (rows && rows.length > 0)
        return placeBody(entry, rows, width, this.theme);
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
    const content = this.summary(entry, width);
    return [fitLine(resultLine(this.theme, content), width, "", 0)];
  }
}

/**
 * Place the rows a body handed over (see CardBodyInput).
 *
 * A block glues its top row to the connector (`└─┌───┐`) and indents the rest to
 * the same column; a single row is result-line content. The test is the row
 * count, not the glyph: a body paints its border through the theme, so the first
 * byte of a border row is an SGR sequence, not the border itself.
 *
 * The result is cached against the array the body returned. Fitting a row is not
 * free - an SGR-painted row cannot take pi-tui's printable-ASCII fast path, and
 * its 512-entry width cache evicts the oldest line, so a transcript longer than
 * that re-measures every row on every frame (measured 2026-09-16: the 60
 * fabric_exec rows of the same session cost 7ms a frame in `visibleWidth` alone).
 * A body that derives its rows
 * once per repaint hands back the same array every frame, so this runs once per
 * host repaint for it; one that draws fresh rows each frame (the shipped cards,
 * which animate) pays what it did before.
 */
function placeBody(
  entry: Entry,
  rows: string[],
  width: number,
  theme: AnyTheme,
): string[] {
  const placed = entry.placed;
  if (
    placed &&
    placed.rows === rows &&
    placed.width === width &&
    placed.theme === theme
  ) {
    return placed.lines;
  }

  const [first, ...rest] = rows;
  const head =
    rest.length > 0 ? resultLine(theme, first, true) : resultLine(theme, first);
  const indent = " ".repeat(RESULT_LINE_INDENT);
  const lines = [head, ...rest.map((line) => `${indent}${line}`)].map((line) =>
    fitLine(line, width, "", 0),
  );
  entry.placed = { rows, width, theme, lines };
  return lines;
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
export function toolCard<
  T extends ToolDefinition<any, any, any>,
  S extends object = object,
>(pi: ExtensionAPI, tool: T, spec: CardSpec<S> = {}): T {
  installCardHooks(pi);

  // A tool that draws its own card hands the Frame a default body, so the Frame
  // keeps everything around that card. A spec that declares how the result reads
  // (`summary`) or draws it (`body`) owns the result area itself - which is how
  // the compact cards replace the renderer a built-in tool ships with.
  const shipsOwnRenderer = Boolean(tool.renderCall || tool.renderResult);
  const body =
    spec.body ??
    (shipsOwnRenderer && !spec.summary ? ownBody(tool) : undefined);

  // A body owns the whole result area, so a group would have to pick which row's
  // body draws the shared card. Reject the pair where the card is attached rather
  // than silently dropping one of them at render time; a derived body counts as
  // one.
  if (body !== undefined && spec.aggregate) {
    throw new Error(
      `toolCard: ${tool.name} cannot combine a body with aggregate: true`,
    );
  }

  const resolved: ResolvedSpec = {
    detail: spec.detail ?? defaultDetail,
    row: spec.row ?? spec.detail ?? defaultDetail,
    summary: spec.summary ?? defaultSummary,
    body,
  };
  const aggregate = body !== undefined ? false : spec.aggregate !== false;

  return {
    ...tool,
    // Self-rendering bypasses Pi's colored Box shell: the Frame draws the badge
    // itself.
    renderShell: "self",
    renderCall(_args: unknown, theme: AnyTheme, context: AnyContext) {
      // The row keeps the arguments the host passes in `context`; the Frame
      // derives the header and the group rows from them when it renders.
      const entry = registerEntry(tool, aggregate, context);
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
