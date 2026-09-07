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
import { Text, type Component, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { createToolAggregation } from "./lib/aggregation.js";
import { fitLine, padLine, statusMarker, toolHeader } from "./lib/pi-ui.js";

type ToolArgs = Record<string, unknown>;
type HeaderFormatter = (args: ToolArgs, theme: Parameters<NonNullable<ToolDefinition<any, any, any>["renderCall"]>>[1]) => string;
type SpinnerState = { timer?: ReturnType<typeof setInterval>; frame?: number };

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL_MS = 80;
const BASH_COMMAND_MAX_WIDTH = 96;
const COMPACTION_RENDER_PATCH = "__dotfilesCompactCompactionRender";
const PI_THEME_KEY = Symbol.for("@earendil-works/pi-coding-agent:theme");

type CompactionTheme = {
  fg(color: "accent" | "customMessageLabel" | "customMessageText" | "dim", text: string): string;
};

type CompactionRenderPrototype = {
  expanded: boolean;
  message: { tokensBefore: number };
  render(width: number): string[];
  [COMPACTION_RENDER_PATCH]?: (this: CompactionRenderPrototype, width: number) => string[];
};

function compactionTheme(): CompactionTheme | undefined {
  return (globalThis as unknown as Record<symbol, CompactionTheme | undefined>)[PI_THEME_KEY];
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

function installCompactCompactionRenderer(componentClass: typeof CompactionSummaryMessageComponent): void {
  const prototype = componentClass.prototype as unknown as CompactionRenderPrototype;
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
    const bundle = await import(new URL("./bundle/index.js", packageEntry).href) as {
      CompactionSummaryMessageComponent?: typeof CompactionSummaryMessageComponent;
    };
    if (bundle.CompactionSummaryMessageComponent) {
      installCompactCompactionRenderer(bundle.CompactionSummaryMessageComponent);
    }
  } catch {
    // The unbundled class is still patched when no bundle is available.
  }
}

// Compact collapsed summaries while leaving Pi's expanded summary untouched.
installCompactCompactionRenderer(CompactionSummaryMessageComponent);

// Keep command previews readable on narrow terminals while bounding wide cards.
function bashCommandWidth(width: number): number {
  if (width < 80) return 32;
  if (width < 120) return 56;
  if (width < 160) return 80;
  return BASH_COMMAND_MAX_WIDTH;
}

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

function coloredPath(args: ToolArgs, theme: Parameters<NonNullable<ToolDefinition<any, any, any>["renderCall"]>>[1], max = 96): string {
  return theme.fg("accent", shorten(stringArg(args, "path", "<missing path>"), max));
}

type HeaderFactory = (
  args: ToolArgs,
  theme: Parameters<NonNullable<ToolDefinition<any, any, any>["renderCall"]>>[1],
  context: Parameters<NonNullable<ToolDefinition<any, any, any>["renderCall"]>>[2],
) => Component;

class BashHeader implements Component {
  private command = "";
  private theme!: Parameters<NonNullable<ToolDefinition<any, any, any>["renderCall"]>>[1];
  private context!: Parameters<NonNullable<ToolDefinition<any, any, any>["renderCall"]>>[2];

  update(
    command: string,
    theme: Parameters<NonNullable<ToolDefinition<any, any, any>["renderCall"]>>[1],
    context: Parameters<NonNullable<ToolDefinition<any, any, any>["renderCall"]>>[2],
  ): void {
    this.command = command;
    this.theme = theme;
    this.context = context;
    this.syncSpinner();
  }

  invalidate(): void {}

  render(width: number): string[] {
    this.syncSpinner();
    const spinner = this.context.state as SpinnerState;
    const marker = statusMarker(this.theme, this.context, SPINNER_FRAMES[spinner.frame ?? 0]);
    const prefix = `${marker} ${this.theme.fg("toolTitle", this.theme.bold("bash"))} `;
    const availableWidth = Math.max(
      0,
      Math.min(bashCommandWidth(width), width - visibleWidth(prefix)),
    );
    const command = truncateToWidth(this.command, availableWidth, "...", false);
    const lines = [`${prefix}${this.theme.fg("toolOutput", command)}`];
    return lines.map((line) => fitLine(line, width, "", 0));
  }

  private syncSpinner(): void {
    const spinner = this.context.state as SpinnerState;
    if (this.context.isPartial) {
      spinner.frame ??= 0;
      if (!spinner.timer) {
        // Spinner state is scoped to this tool execution and never keeps Pi alive.
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

function lineRange(args: ToolArgs): string {
  const offset = numberArg(args, "offset");
  const limit = numberArg(args, "limit");
  if (offset === undefined && limit === undefined) return "";
  const start = offset ?? 1;
  return limit === undefined ? `lines ${start}+` : `lines ${start}-${start + limit - 1}`;
}

const READ_PATH_COLUMN = 20;

function readCallLine(args: ToolArgs, theme: Parameters<NonNullable<ToolDefinition<any, any, any>["renderCall"]>>[1]): string {
  const path = theme.fg("accent", stringArg(args, "path", "<missing path>"));
  const range = lineRange(args);
  return `${path}${range ? ` ${theme.fg("toolOutput", range)}` : ""}`;
}

function readCallRow(args: ToolArgs, theme: Parameters<NonNullable<ToolDefinition<any, any, any>["renderCall"]>>[1]): string {
  const path = padLine(theme.fg("accent", stringArg(args, "path", "<missing path>")), READ_PATH_COLUMN, "");
  const range = lineRange(args);
  return `${path}${range ? ` ${theme.fg("toolOutput", range)}` : ""}`;
}

function textOutput(result: { content: Array<{ type: string; text?: string }> }): string {
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
  theme: Parameters<NonNullable<ToolDefinition<any, any, any>["renderCall"]>>[1],
  context: Parameters<NonNullable<ToolDefinition<any, any, any>["renderCall"]>>[2],
): void {
  const spinner = context.state as SpinnerState;
  if (context.isPartial) {
    spinner.frame ??= 0;
    if (!spinner.timer) {
      // Spinner state is scoped to this tool execution and never keeps Pi alive.
      spinner.timer = setInterval(() => {
        spinner.frame = ((spinner.frame ?? 0) + 1) % SPINNER_FRAMES.length;
        renderHeader(text, toolName, header, theme, context);
        context.invalidate();
      }, SPINNER_INTERVAL_MS);
      spinner.timer.unref();
    }
  } else if (spinner.timer) {
    clearInterval(spinner.timer);
    spinner.timer = undefined;
  }

  text.setText(toolHeader(
    theme,
    toolName,
    theme.fg("toolOutput", header),
    context,
    SPINNER_FRAMES[spinner.frame ?? 0],
  ));
}

function compactDefinition(
  tool: ToolDefinition<any, any, any>,
  formatHeader: HeaderFormatter,
  createHeader?: HeaderFactory,
): ToolDefinition<any, any, any> {
  // Spread the built-in definition so its schema, prompt, and execution stay unchanged.
  return {
    ...tool,
    // Self-rendering bypasses Pi's colored Box shell.
    renderShell: "self",
    renderCall(args: ToolArgs, theme, context) {
      if (createHeader) return createHeader(args, theme, context);
      const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
      renderHeader(text, tool.name, formatHeader(args, theme), theme, context);
      return text;
    },
    renderResult(result, options, theme, context) {
      const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
      const output = textOutput(result);

      // Successful output remains available on expand; errors retain a collapsed preview.
      if (options.isPartial || !output) {
        text.setText("");
      } else if (context.isError) {
        const lines = output.split("\n");
        const preview = options.expanded ? output : lines[0];
        const suffix = !options.expanded && lines.length > 1 ? theme.fg("muted", " ...") : "";
        text.setText(theme.fg("error", preview) + suffix);
      } else if (options.expanded) {
        text.setText(theme.fg("toolOutput", output));
      } else {
        text.setText("");
      }
      return text;
    },
  };
}

export async function registerCompactToolCards(pi: ExtensionAPI) {
  installCompactCompactionRenderer(CompactionSummaryMessageComponent);
  await installBundleCompactionRenderer();
  const cwd = process.cwd();

  const aggregation = createToolAggregation(pi);

  // Registering matching names replaces only the built-in renderers above.
  pi.registerTool(aggregation.wrap(createReadToolDefinition(cwd), {
    line: readCallLine,
    row: readCallRow,
  }));
  pi.registerTool(aggregation.wrap(createGrepToolDefinition(cwd), {
    line: (args, theme) => (
      theme.fg("toolOutput", `/${shorten(stringArg(args, "pattern"), 48)}/ in ${shorten(stringArg(args, "path", "."), 48)}`)
    ),
  }));
  pi.registerTool(compactDefinition(createFindToolDefinition(cwd), (args, theme) => (
    theme.fg("toolOutput", `${shorten(stringArg(args, "pattern"), 56)} in ${shorten(stringArg(args, "path", "."), 48)}`)
  )));
  pi.registerTool(compactDefinition(createLsToolDefinition(cwd), (args, theme) => (
    theme.fg("toolOutput", shorten(stringArg(args, "path", ".")))
  )));
  pi.registerTool(compactDefinition(
    createBashToolDefinition(cwd),
    () => "",
    (args, theme, context) => {
      const header = context.lastComponent instanceof BashHeader
        ? context.lastComponent
        : new BashHeader();
      header.update(stringArg(args, "command", "<missing command>"), theme, context);
      return header;
    },
  ));
}
