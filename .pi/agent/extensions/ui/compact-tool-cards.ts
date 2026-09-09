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
import {
  Text,
  type Component,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import { createToolAggregation } from "./lib/aggregation.js";
import {
  fitLine,
  fitPath,
  padLine,
  bracketDetail,
  RESULT_LINE_INDENT,
  resultLine,
  spinnerChar,
  syncSpinner,
  toolHeader,
  type SpinnerState,
} from "./lib/pi-ui.js";
import { highlightBashLines } from "./pi-diff.js";

type ToolArgs = Record<string, unknown>;
type HeaderFormatter = (
  args: ToolArgs,
  theme: Parameters<
    NonNullable<ToolDefinition<any, any, any>["renderCall"]>
  >[1],
) => string;
type ResultFormatter = (
  output: string,
  theme: Parameters<
    NonNullable<ToolDefinition<any, any, any>["renderCall"]>
  >[1],
) => string;
type RenderTheme = Parameters<
  NonNullable<ToolDefinition<any, any, any>["renderCall"]>
>[1];
type RenderContext = Parameters<
  NonNullable<ToolDefinition<any, any, any>["renderCall"]>
>[2];

const COMPACTION_RENDER_PATCH = "__dotfilesCompactCompactionRender";
const PI_THEME_KEY = Symbol.for("@earendil-works/pi-coding-agent:theme");

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
  [COMPACTION_RENDER_PATCH]?: (
    this: CompactionRenderPrototype,
    width: number,
  ) => string[];
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

function installCompactCompactionRenderer(
  componentClass: typeof CompactionSummaryMessageComponent,
): void {
  const prototype =
    componentClass.prototype as unknown as CompactionRenderPrototype;
  if (prototype[COMPACTION_RENDER_PATCH]) return;

  const originalRender = prototype.render;
  prototype[COMPACTION_RENDER_PATCH] = originalRender;
  prototype.render = function (width: number): string[] {
    if (this.expanded) return originalRender.call(this, width);

    const tokenCount = this.message.tokensBefore.toLocaleString();
    const hint = keyText("app.tools.expand") || "Ctrl+O";
    const line = `${compactionColor("customMessageLabel", "[compaction]")} ${compactionColor("customMessageText", "Compacted from")} ${compactionColor("accent", `${tokenCount} tokens`)} ${compactionColor("customMessageText", `(${compactionColor("dim", `${hint} to expand`)})`)}`;
    return [truncateToWidth(line, Math.max(1, width), "", false)];
  };
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

// Keep command previews readable on narrow terminals while bounding wide cards.
function stringArg(args: ToolArgs, key: string, fallback = ""): string {
  const value = args[key];
  return typeof value === "string" ? value : fallback;
}

function numberArg(args: ToolArgs, key: string): number | undefined {
  const value = args[key];
  return typeof value === "number" ? value : undefined;
}

function shorten(value: string, max = 96): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

type HeaderFactory = (
  args: ToolArgs,
  theme: Parameters<
    NonNullable<ToolDefinition<any, any, any>["renderCall"]>
  >[1],
  context: Parameters<
    NonNullable<ToolDefinition<any, any, any>["renderCall"]>
  >[2],
) => Component;

class BashHeader implements Component {
  private command = "";
  private cwd = "";
  private theme!: RenderTheme;
  private context!: RenderContext;
  private highlightKey = "";
  private highlighted: string | undefined;

  update(command: string, theme: RenderTheme, context: RenderContext): void {
    this.command = command;
    this.cwd = typeof context.cwd === "string" ? context.cwd : "";
    this.theme = theme;
    this.context = context;
    // Shared rendererState: mark tool start so the result card can show wall time.
    (context.state as SpinnerState & { startedAt?: number }).startedAt ??=
      Date.now();
    this.maybeHighlight();
  }

  invalidate(): void {}

  render(width: number): string[] {
    const detail = bracketDetail(
      this.theme,
      this.highlighted ?? this.theme.fg("toolOutput", this.command),
    );
    return [fitLine(toolHeader(this.theme, "bash", detail), width, "", 0)];
  }

  private highlightText(): string {
    // The header is single-line; fold multi-line commands onto `; ` joins.
    const command = this.command.replace(/\s*\n\s*/g, "; ");
    return this.cwd ? `cd ${this.cwd} && ${command}` : command;
  }

  private maybeHighlight(): void {
    const text = this.highlightText();
    if (!text || this.highlightKey === text) return;
    this.highlightKey = text;
    this.highlighted = undefined;
    highlightBashLines(text)
      .then((lines) => {
        if (this.highlightKey === text) {
          this.highlighted = lines.join("");
          this.context?.invalidate?.();
        }
      })
      .catch(() => {});
  }
}

const BASH_PREVIEW_LINES = 3;

function bashExitText(
  result: { content: Array<{ type: string; text?: string }> },
  isError: boolean,
): string {
  const output = textOutput(result);
  const exit = output.match(/exit(?:ed with)? code (\d+)/);
  if (exit) return `exit ${exit[1]}`;
  const timeout = output.match(/timed out after (\d+) seconds/);
  if (timeout) return `timeout ${timeout[1]}s`;
  return isError ? "err" : "exit 0";
}

function bashElapsedText(state: SpinnerState & { startedAt?: number }): string {
  const startedAt = state?.startedAt;
  if (!startedAt) return "";
  const seconds = (Date.now() - startedAt) / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}m${Math.round(seconds % 60)}s`;
}

class BashResult implements Component {
  private outputRows: string[] = [];
  private border: "accent" | "dim" | "error" = "dim";
  private theme!: RenderTheme;
  private context!: RenderContext;
  private exitText = "";
  private elapsedText = "";
  private isPartial = false;

  update(
    result: { content: Array<{ type: string; text?: string }> },
    options: { isPartial?: boolean; expanded?: boolean },
    theme: RenderTheme,
    context: RenderContext,
  ): void {
    this.theme = theme;
    this.context = context;
    this.border = context.isError
      ? "error"
      : options.isPartial
        ? "accent"
        : "dim";
    this.isPartial = Boolean(options.isPartial);
    this.exitText = bashExitText(result, Boolean(context.isError));
    this.elapsedText = bashElapsedText(
      context.state as SpinnerState & { startedAt?: number },
    );

    const output = textOutput(result);
    this.outputRows = [];
    if (output) {
      if (context.isError) {
        const lines = output.split("\n");
        const preview = options.expanded ? output : lines[0];
        const suffix =
          !options.expanded && lines.length > 1
            ? theme.fg("muted", " ...")
            : "";
        this.outputRows.push(theme.fg("error", preview) + suffix);
      } else if (options.expanded) {
        this.outputRows.push(
          ...output.split("\n").map((line) => theme.fg("toolOutput", line)),
        );
      } else {
        const lines = output.split("\n");
        const tail = lines.slice(-BASH_PREVIEW_LINES);
        const hidden = lines.length - tail.length;
        this.outputRows.push(
          ...tail.map((line) => theme.fg("toolOutput", line)),
        );
        if (hidden > 0) {
          const hint = keyText("app.tools.expand") || "ctrl+o";
          this.outputRows.push(
            theme.fg("muted", `… ${hidden} more lines (${hint} to expand)`),
          );
        }
      }
    }
  }

  invalidate(): void {}

  render(width: number): string[] {
    if (this.outputRows.length === 0) {
      // No box without output: a stable `running` marker while streaming,
      // exit stats once settled (spinner is intentionally not used here).
      if (this.isPartial) {
        return [
          fitLine(
            resultLine(this.theme, this.theme.fg("muted", "running")),
            width,
            "",
            0,
          ),
        ];
      }
      const stats = this.statsText();
      if (!stats) return [];
      const color = this.border === "error" ? "error" : "dim";
      return [
        fitLine(
          resultLine(this.theme, this.theme.fg(color, stats)),
          width,
          "",
          0,
        ),
      ];
    }

    // The whole box sits in the result-line column: `└─ ` on the top border.
    const boxWidth = Math.max(1, width - RESULT_LINE_INDENT);
    const innerWidth = Math.max(1, boxWidth - 2);
    const border = (line: string) => this.theme.fg(this.border, line);
    const top = border(`┌${"─".repeat(innerWidth)}┐`);
    const dimAnsi =
      (this.theme as any).getFgAnsi?.("dim") ?? "\x1b[38;2;102;92;84m";
    const body = this.outputRows.map((line) =>
      border(`│${padLine(line, innerWidth)}${dimAnsi}│`),
    );

    const left = `└─ ${this.statsText()} `;
    const pad = "─".repeat(
      Math.max(0, innerWidth + 2 - visibleWidth(left) - 1),
    );
    const bottom = border(`${left}${pad}┘`);
    const indent = " ".repeat(RESULT_LINE_INDENT);

    return [top, ...body, bottom]
      .map((line, i) =>
        i === 0 ? resultLine(this.theme, line, true) : `${indent}${line}`,
      )
      .map((line) => fitLine(line, width, "", 0));
  }

  private statsText(): string {
    return `${this.exitText}${this.elapsedText ? ` · ${this.elapsedText}` : ""}`;
  }
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

function textOutput(result: {
  content: Array<{ type: string; text?: string }>;
}): string {
  return result.content
    .filter((content) => content.type === "text")
    .map((content) => content.text ?? "")
    .join("\n")
    .trim();
}

function renderHeader(
  text: Text,
  toolName: string,
  header: string,
  theme: RenderTheme,
  context: RenderContext,
): void {
  const spinner = context.state as SpinnerState;
  syncSpinner(spinner, context.isPartial, context.invalidate);

  const lines = [
    toolHeader(
      theme,
      toolName,
      bracketDetail(theme, theme.fg("toolOutput", header)),
    ),
  ];
  if (context.isPartial) {
    lines.push(resultLine(theme, theme.fg("muted", spinnerChar(spinner))));
  }
  text.setText(lines.join("\n"));
}

type CompactOptions = {
  formatHeader: HeaderFormatter;
  /** Collapsed result-line content (pre-colored); defaults to the raw text result. */
  summary?: ResultFormatter;
  createHeader?: HeaderFactory;
  createResult?: (
    result: any,
    options: any,
    theme: any,
    context: any,
  ) => Component;
};

function compactDefinition(
  tool: ToolDefinition<any, any, any>,
  options: CompactOptions,
): ToolDefinition<any, any, any> {
  const { formatHeader, summary, createHeader, createResult } = options;
  // Spread the built-in definition so its schema, prompt, and execution stay unchanged.
  return {
    ...tool,
    // Self-rendering bypasses Pi's colored Box shell.
    renderShell: "self",
    renderCall(args: unknown, theme, context) {
      const toolArgs =
        args && typeof args === "object" ? (args as ToolArgs) : {};
      if (createHeader) return createHeader(toolArgs, theme, context);
      const text =
        (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
      renderHeader(
        text,
        tool.name,
        formatHeader(toolArgs, theme),
        theme,
        context,
      );
      return text;
    },
    renderResult(result, options, theme, context) {
      if (createResult) return createResult(result, options, theme, context);
      const text =
        (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
      const output = textOutput(result);

      // Successful output remains available on expand; errors retain a collapsed preview.
      if (options.isPartial || !output) {
        text.setText("");
      } else if (context.isError) {
        const lines = output.split("\n");
        const preview = options.expanded ? output : lines[0];
        const suffix =
          !options.expanded && lines.length > 1
            ? theme.fg("muted", " ...")
            : "";
        text.setText(resultLine(theme, theme.fg("error", preview) + suffix));
      } else if (options.expanded) {
        text.setText(theme.fg("toolOutput", output));
      } else {
        const content = summary
          ? summary(output, theme)
          : theme.fg("toolOutput", output);
        text.setText(resultLine(theme, content));
      }
      return text;
    },
  };
}

export function registerCompactToolCards(pi: ExtensionAPI) {
  installCompactCompactionRenderer(CompactionSummaryMessageComponent);
  // The bundled renderer is an enhancement; do not hold up extension loading
  // while its optional bundle is imported.
  void installBundleCompactionRenderer();
  const cwd = process.cwd();

  const aggregation = createToolAggregation(pi);

  const readSummary: ResultFormatter = (output, theme) =>
    theme.fg("muted", `${output.split("\n").length} lines`);
  const grepSummary: ResultFormatter = (output, theme) => {
    if (!output || output === "No matches found")
      return theme.fg("muted", "no matches");
    const lines = output.split("\n");
    const files = new Set<string>();
    for (const line of lines) {
      const file = line.match(/^([^:]+):\d+/)?.[1];
      if (file) files.add(file);
    }
    const filePart = files.size > 0 ? ` in ${files.size} files` : "";
    return theme.fg("muted", `${lines.length} matches${filePart}`);
  };
  const findSummary: ResultFormatter = (output, theme) =>
    theme.fg("muted", `${output.split("\n").length} results`);
  const lsSummary: ResultFormatter = (output, theme) =>
    theme.fg("muted", `${output.split("\n").length} entries`);

  // Registering matching names replaces only the built-in renderers above.
  pi.registerTool(
    aggregation.wrap(createReadToolDefinition(cwd), {
      line: (args, theme) => bracketDetail(theme, readCallLine(args, theme)),
      row: readCallRow,
      summary: readSummary,
    }),
  );
  pi.registerTool(
    aggregation.wrap(createGrepToolDefinition(cwd), {
      line: (args, theme) =>
        bracketDetail(
          theme,
          theme.fg(
            "toolOutput",
            `"${shorten(stringArg(args, "pattern"), 48)}" in ${shorten(stringArg(args, "path", "."), 48)}`,
          ),
        ),
      row: (args, theme) =>
        theme.fg(
          "toolOutput",
          `"${shorten(stringArg(args, "pattern"), 48)}" in ${shorten(stringArg(args, "path", "."), 48)}`,
        ),
      summary: grepSummary,
    }),
  );
  pi.registerTool(
    compactDefinition(createFindToolDefinition(cwd), {
      formatHeader: (args, theme) =>
        `${shorten(stringArg(args, "pattern"), 56)} in ${shorten(stringArg(args, "path", "."), 48)}`,
      summary: findSummary,
    }),
  );
  pi.registerTool(
    compactDefinition(createLsToolDefinition(cwd), {
      formatHeader: (args, theme) => shorten(stringArg(args, "path", ".")),
      summary: lsSummary,
    }),
  );
  pi.registerTool(
    compactDefinition(createBashToolDefinition(cwd), {
      formatHeader: () => "",
      createHeader: (args, theme, context) => {
        const header =
          context.lastComponent instanceof BashHeader
            ? context.lastComponent
            : new BashHeader();
        header.update(
          stringArg(args, "command", "<missing command>"),
          theme,
          context,
        );
        return header;
      },
      createResult: (result, options, theme, context) => {
        const card =
          context.lastComponent instanceof BashResult
            ? context.lastComponent
            : new BashResult();
        card.update(result, options, theme, context);
        return card;
      },
    }),
  );
}
