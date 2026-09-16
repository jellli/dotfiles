import {
  CompactionSummaryMessageComponent,
  createBashToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  keyText,
  type ExtensionAPI,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { cardLifecycle, type Lifecycle } from "../card/lifecycle.js";
import { spinnerChar } from "../card/spinner.js";
import { fitPath, padLine, shorten } from "../card/text.js";
import {
  elapsedText,
  toolCard,
  type CardBodyInput,
  type CardSpec,
  type CardState,
} from "../card/tool-card.js";
import { highlightBashLines } from "./pi-diff.js";

type ToolArgs = Record<string, unknown>;
type RenderTheme = Parameters<
  NonNullable<ToolDefinition<any, any, any>["renderCall"]>
>[1];
/** One collapsed result-line derivation: the card's `summary`. */
type SummaryFormatter = NonNullable<CardSpec["summary"]>;

export const COMPACTION_RENDER_PATCH = "__dotfilesCompactCompactionRender";
export const COMPACTION_PATCH_OWNER = "dotfiles.compact-tool-cards";
const PI_THEME_KEY = Symbol.for("@earendil-works/pi-coding-agent:theme");

/** Identity of this module evaluation: `/reload` runs the module again, so a
 * different token means the live patch was left behind by an older instance. */
const PATCH_TOKEN = {};

/** What an install leaves on the prototype: the render it replaced plus the
 * patch it installed, so a later install can take it off again. */
type CompactionPatch = {
  owner: string;
  token: object;
  original: (this: CompactionRenderPrototype, width: number) => string[];
  patched: (this: CompactionRenderPrototype, width: number) => string[];
};

type CompactionTheme = {
  fg(
    color: "accent" | "customMessageLabel" | "customMessageText" | "dim",
    text: string,
  ): string;
};

type CompactionRenderPrototype = {
  expanded: boolean;
  message: { tokensBefore: number };
  render(width: number): string[];
  [COMPACTION_RENDER_PATCH]?: CompactionPatch;
};

function compactionTheme(): CompactionTheme | undefined {
  return (globalThis as unknown as Record<symbol, CompactionTheme | undefined>)[
    PI_THEME_KEY
  ];
}

function compactionColor(
  color: "accent" | "customMessageLabel" | "customMessageText" | "dim",
  text: string,
): string {
  const theme = compactionTheme();
  if (theme) return theme.fg(color, text);

  const fallback = {
    accent: "36",
    customMessageLabel: "35",
    customMessageText: "37",
    dim: "2",
  }[color];
  const reset = color === "dim" ? "22" : "39";
  return `\x1b[${fallback}m${text}\x1b[${reset}m`;
}

export function installCompactCompactionRenderer(
  componentClass: typeof CompactionSummaryMessageComponent,
  lifecycle: Lifecycle = cardLifecycle,
): void {
  const prototype =
    componentClass.prototype as unknown as CompactionRenderPrototype;
  const existing = prototype[COMPACTION_RENDER_PATCH];
  // The same module instance patching the same class twice (the entry point and
  // the registration both install it) changes nothing.
  if (existing?.token === PATCH_TOKEN) return;

  // An older module instance's patch is still live: take it off before patching,
  // so /reload picks up the new render code instead of leaving the old closure in
  // place, and so the two patches never stack.
  if (existing && prototype.render === existing.patched) {
    prototype.render = existing.original;
  }

  const originalRender = prototype.render;
  const patched = function (this: CompactionRenderPrototype, width: number) {
    if (this.expanded) return originalRender.call(this, width);

    const tokenCount = this.message.tokensBefore.toLocaleString();
    const hint = keyText("app.tools.expand") || "Ctrl+O";
    const line = `${compactionColor("customMessageLabel", "[compaction]")} ${compactionColor("customMessageText", "Compacted from")} ${compactionColor("accent", `${tokenCount} tokens`)} ${compactionColor("customMessageText", `(${compactionColor("dim", `${hint} to expand`)})`)}`;
    return [truncateToWidth(line, Math.max(1, width), "", false)];
  };
  prototype.render = patched;
  prototype[COMPACTION_RENDER_PATCH] = {
    owner: COMPACTION_PATCH_OWNER,
    token: PATCH_TOKEN,
    original: originalRender,
    patched,
  };

  lifecycle.add(() => {
    const live = prototype[COMPACTION_RENDER_PATCH];
    if (live?.owner === COMPACTION_PATCH_OWNER && live.token === PATCH_TOKEN) {
      delete prototype[COMPACTION_RENDER_PATCH];
    }
    if (prototype.render === patched) prototype.render = originalRender;
  });
}

async function installBundleCompactionRenderer(): Promise<void> {
  try {
    const packageEntry = import.meta.resolve("@earendil-works/pi-coding-agent");
    const bundle = (await import(
      new URL("./bundle/index.js", packageEntry).href
    )) as {
      CompactionSummaryMessageComponent?: typeof CompactionSummaryMessageComponent;
    };
    if (bundle.CompactionSummaryMessageComponent) {
      installCompactCompactionRenderer(
        bundle.CompactionSummaryMessageComponent,
      );
    }
  } catch {
    // The unbundled class is still patched when no bundle is available.
  }
}

// Compact collapsed summaries while leaving Pi's expanded summary untouched.
installCompactCompactionRenderer(CompactionSummaryMessageComponent);

function stringArg(args: ToolArgs, key: string, fallback = ""): string {
  const value = args[key];
  return typeof value === "string" ? value : fallback;
}

function numberArg(args: ToolArgs, key: string): number | undefined {
  const value = args[key];
  return typeof value === "number" ? value : undefined;
}

// ---------------------------------------------------------------------------
// bash: the async Shiki header highlight, primed by the body
// ---------------------------------------------------------------------------

/**
 * What the bash card keeps on its row: the highlight, once it lands, against the
 * command it was primed for, and the command shiki is still working on.
 */
type BashState = {
  highlighted?: { command: string; text: string };
  highlighting?: string;
};

/**
 * Highlight the command this row is running, into the row's own state.
 *
 * `detail` is a pure derivation: it reads the row and colors what it finds there,
 * but it cannot start a promise and then ask for a repaint without doing that on
 * every frame. `body` is the slot that draws the card, so it primes the highlight
 * here and calls the card input's `redraw()` when the resolution lands; the
 * header reads the value out of the row's state on the frame that follows.
 *
 * The highlight is kept per row rather than per command text. A process-wide
 * table keyed by the command cannot tell two rows apart - the `cd <cwd> &&`
 * prefix it shows is the one of whichever row primed it - and the row is where
 * the card's state belongs anyway. One command is highlighted once per row, and
 * that first resolution is the only time the header's detail changes, so it is
 * the only repaint asked for.
 */
function primeBashHighlight(input: CardBodyInput<BashState>): void {
  const state = input.state;
  const command = stringArg(input.args, "command");
  if (
    command === "" ||
    state.highlighted?.command === command ||
    state.highlighting === command
  ) {
    return;
  }
  // One row's worth of command: newlines folded onto `; ` joins, and the
  // directory it runs in, the way a shell prompt would show it.
  const folded = command.replace(/\s*\n\s*/g, "; ");
  const text = input.cwd ? `cd ${input.cwd} && ${folded}` : folded;
  state.highlighting = command;
  highlightBashLines(text)
    .then((lines) => {
      if (state.highlighting === command) state.highlighting = undefined;
      // The call's arguments can still be streaming in while shiki works; rows
      // for the older text must not be shown under the newer command.
      if (stringArg(input.args, "command") !== command) return;
      state.highlighted = { command, text: lines.join("") };
      input.redraw();
    })
    .catch(() => {
      if (state.highlighting === command) state.highlighting = undefined;
    });
}

const BASH_PREVIEW_LINES = 3;

/** `exit 0`, `timeout 5s` or `err`: the outcome the bottom edge reports. */
function bashExitText(output: string, isError: boolean): string {
  const exit = output.match(/exit(?:ed with)? code (\d+)/);
  if (exit) return `exit ${exit[1]}`;
  const timeout = output.match(/timed out after (\d+) seconds/);
  if (timeout) return `timeout ${timeout[1]}s`;
  return isError ? "err" : "exit 0";
}

/** `exit 0 · 1.2s`: the settled bottom edge, wall time from the Frame's clock. */
function bashStatsText(
  output: string,
  isError: boolean,
  state: CardState,
): string {
  const elapsed = elapsedText(state);
  return `${bashExitText(output, isError)}${elapsed ? ` · ${elapsed}` : ""}`;
}

/** Spinner glyph + wall clock since start, e.g. `⠸ 1.2s`. */
function bashRunningText(state: CardState): string {
  const elapsed = elapsedText(state);
  return `${spinnerChar(state)}${elapsed ? ` ${elapsed}` : ""}`;
}

/** The rows inside the box: the output tail collapsed, the whole output expanded. */
function bashOutputRows(
  output: string,
  isError: boolean,
  expanded: boolean,
  theme: RenderTheme,
): string[] {
  const lines = output.split("\n");
  if (isError) {
    // One row per line: the Frame splits a row that carries a newline, and the
    // continuation would fall outside the box it is meant to sit in.
    if (expanded) return lines.map((line) => theme.fg("error", line));
    const suffix = lines.length > 1 ? theme.fg("muted", " ...") : "";
    return [theme.fg("error", lines[0]) + suffix];
  }
  if (expanded) return lines.map((line) => theme.fg("toolOutput", line));

  const tail = lines.slice(-BASH_PREVIEW_LINES);
  const rows = tail.map((line) => theme.fg("toolOutput", line));
  const hidden = lines.length - tail.length;
  if (hidden > 0) {
    const hint = keyText("app.tools.expand") || "ctrl+o";
    rows.push(theme.fg("muted", `… ${hidden} more lines (${hint} to expand)`));
  }
  return rows;
}

function lineRange(args: ToolArgs): string {
  const offset = numberArg(args, "offset");
  const limit = numberArg(args, "limit");
  if (offset === undefined && limit === undefined) return "";
  const start = offset ?? 1;
  return limit === undefined
    ? `lines ${start}+`
    : `lines ${start}-${start + limit - 1}`;
}

const READ_PATH_COLUMN = 46;

function readCallLine(
  args: ToolArgs,
  theme: Parameters<
    NonNullable<ToolDefinition<any, any, any>["renderCall"]>
  >[1],
): string {
  const path = theme.fg("accent", stringArg(args, "path", "<missing path>"));
  const range = lineRange(args);
  return `${path}${range ? ` ${theme.fg("toolOutput", range)}` : ""}`;
}

function readCallRow(
  args: ToolArgs,
  theme: Parameters<
    NonNullable<ToolDefinition<any, any, any>["renderCall"]>
  >[1],
): string {
  // Keep the trailing filename (and as many leading dirs as fit) instead of
  // chopping long paths down to the cwd prefix.
  const raw = stringArg(args, "path", "<missing path>");
  const path = padLine(
    theme.fg("accent", fitPath(raw, READ_PATH_COLUMN)),
    READ_PATH_COLUMN,
    "",
  );
  const range = lineRange(args);
  return `${path}${range ? ` ${theme.fg("toolOutput", range)}` : ""}`;
}

// ---------------------------------------------------------------------------
// The five compact cards
// ---------------------------------------------------------------------------

/** bash: the command in the header, the output box in the body slot. */
export const bashSpec: CardSpec<BashState> = {
  detail: (input) => {
    const command = stringArg(input.args, "command", "<missing command>");
    const highlight = input.state.highlighted;
    return highlight?.command === command
      ? highlight.text
      : input.theme.fg("toolOutput", command);
  },
  body: (input) => {
    primeBashHighlight(input);

    const { options, state, theme, width } = input;
    const output = input.output;
    const isError = options.isError;
    const border: "accent" | "dim" | "error" = isError
      ? "error"
      : options.isPartial
        ? "accent"
        : "dim";
    const label = options.isPartial
      ? bashRunningText(state)
      : bashStatsText(output, isError, state);

    // No box without output: a spinner plus wall-clock time while streaming,
    // exit stats once settled.
    if (output === "") {
      return options.isPartial
        ? [theme.fg("muted", label)]
        : [theme.fg(isError ? "error" : "dim", label)];
    }

    // The box fills the column the Frame handed over, so its border lands flush
    // with the card (`└─┌─…`): the Frame owns the connector and the indent.
    const innerWidth = Math.max(1, width - 2);
    const painted = (line: string) => theme.fg(border, line);
    // The right border stays dim while the left takes the state color.
    const dim = (theme as any).getFgAnsi?.("dim") ?? "\x1b[38;2;102;92;84m";
    const rows = bashOutputRows(output, isError, options.expanded, theme).map(
      (line) => painted(`│${padLine(line, innerWidth)}${dim}│`),
    );
    const left = label ? `└─ ${label} ` : "└";
    const pad = "─".repeat(
      Math.max(0, innerWidth + 2 - visibleWidth(left) - 1),
    );

    return [
      painted(`┌${"─".repeat(innerWidth)}┐`),
      ...rows,
      painted(`${left}${pad}┘`),
    ];
  },
};

/** `N lines` / `N results` / `N entries`: what a plain list of output comes to. */
const countSummary =
  (noun: string): SummaryFormatter =>
  (input) =>
    input.theme.fg("muted", `${input.output.split("\n").length} ${noun}`);

const readSummary = countSummary("lines");
const findSummary = countSummary("results");
const lsSummary = countSummary("entries");

const grepSummary: SummaryFormatter = (input) => {
  if (!input.output || input.output === "No matches found")
    return input.theme.fg("muted", "no matches");
  const lines = input.output.split("\n");
  const files = new Set<string>();
  for (const line of lines) {
    const file = line.match(/^([^:]+):\d+/)?.[1];
    if (file) files.add(file);
  }
  const filePart = files.size > 0 ? ` in ${files.size} files` : "";
  return input.theme.fg("muted", `${lines.length} matches${filePart}`);
};

/** read: the path and range in the header, one row per file inside a group. */
export const readSpec: CardSpec = {
  detail: (input) => readCallLine(input.args, input.theme),
  row: (input) => readCallRow(input.args, input.theme),
  summary: readSummary,
};

/** grep: pattern and path in the header, so its group rows need no `row`. */
export const grepSpec: CardSpec = {
  detail: (input) =>
    input.theme.fg(
      "toolOutput",
      `"${shorten(stringArg(input.args, "pattern"), 48)}" in ${shorten(stringArg(input.args, "path", "."), 48)}`,
    ),
  summary: grepSummary,
};

/** find: one call, one card - a consecutive call never joins a group. */
export const findSpec: CardSpec = {
  detail: (input) =>
    input.theme.fg(
      "toolOutput",
      `${shorten(stringArg(input.args, "pattern"), 56)} in ${shorten(stringArg(input.args, "path", "."), 48)}`,
    ),
  summary: findSummary,
  aggregate: false,
};

/** ls: the same opt-out, with the directory as the header. */
export const lsSpec: CardSpec = {
  detail: (input) =>
    input.theme.fg(
      "toolOutput",
      shorten(stringArg(input.args, "path", "."), 96),
    ),
  summary: lsSummary,
  aggregate: false,
};

export function registerCompactToolCards(pi: ExtensionAPI) {
  installCompactCompactionRenderer(CompactionSummaryMessageComponent);
  // The bundled renderer is an enhancement; do not hold up extension loading
  // while its optional bundle is imported.
  void installBundleCompactionRenderer();
  const cwd = process.cwd();

  // Registering matching names replaces only the built-in renderers above.
  pi.registerTool(toolCard(pi, createReadToolDefinition(cwd), readSpec));
  pi.registerTool(toolCard(pi, createGrepToolDefinition(cwd), grepSpec));
  pi.registerTool(toolCard(pi, createFindToolDefinition(cwd), findSpec));
  pi.registerTool(toolCard(pi, createLsToolDefinition(cwd), lsSpec));
  pi.registerTool(toolCard(pi, createBashToolDefinition(cwd), bashSpec));
}
