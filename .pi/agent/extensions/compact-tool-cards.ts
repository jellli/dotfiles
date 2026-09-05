import {
  CompactionSummaryMessageComponent,
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  keyText,
  type ExtensionAPI,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Text, type Component, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

type ToolArgs = Record<string, unknown>;
type HeaderFormatter = (args: ToolArgs, theme: Parameters<NonNullable<ToolDefinition<any, any, any>["renderCall"]>>[1]) => string;
type SpinnerState = { timer?: ReturnType<typeof setInterval>; frame?: number };

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL_MS = 80;
const EDIT_PREVIEW_LIMIT = 6;
const WRITE_PREVIEW_LIMIT = 4;
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

type RenderedSuccess = string | { body: string; footer?: string };

function fitLine(line: string, width: number): string {
  return visibleWidth(line) <= width ? line : truncateToWidth(line, Math.max(0, width), "", false);
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
    const marker = this.context.isError
      ? this.theme.fg("error", "×")
      : this.context.isPartial
        ? this.theme.fg("muted", SPINNER_FRAMES[spinner.frame ?? 0])
        : this.theme.fg("success", "√");
    const prefix = `${marker} ${this.theme.fg("toolTitle", this.theme.bold("bash"))} `;
    const availableWidth = Math.max(
      0,
      Math.min(bashCommandWidth(width), width - visibleWidth(prefix)),
    );
    const command = truncateToWidth(this.command, availableWidth, "...", false);
    const lines = [`${prefix}${this.theme.fg("toolOutput", command)}`];
    return lines.map((line) => fitLine(line, width));
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

class DimFrame implements Component {
  readonly header = new Text("", 0, 0);
  private body = new Text("", 0, 0);
  private footer = "";
  private hasBody = false;
  private theme: Parameters<NonNullable<ToolDefinition<any, any, any>["renderResult"]>>[2];

  constructor(theme: Parameters<NonNullable<ToolDefinition<any, any, any>["renderResult"]>>[2]) {
    this.theme = theme;
  }

  setText(text: string): void {
    this.footer = "";
    this.hasBody = text.length > 0;
    this.body.setText(text);
  }

  setResult(result: RenderedSuccess): void {
    if (typeof result === "string") {
      this.setText(result);
      return;
    }
    this.footer = result.footer ?? "";
    this.hasBody = result.body.length > 0;
    this.body.setText(result.body);
  }

  invalidate(): void {
    this.header.invalidate();
    this.body.invalidate();
  }

  render(width: number): string[] {
    const headerLines = this.header.render(Math.max(1, width)).map((line) => fitLine(line, width));
    if (!this.hasBody) return headerLines;

    const contentWidth = Math.max(1, width - 3);
    const bodyLines = this.body.render(contentWidth).map((line) => line.trimEnd());
    const border = (value: string) => this.theme.fg("dim", value);
    return [
      ...headerLines,
      `${border("┌─ ")}${bodyLines[0] ?? ""}`,
      ...bodyLines.slice(1).map((line) => `${border("│ ")}${line}`),
      `${border("└─")}${this.footer ? ` ${this.footer}` : ""}`,
    ].map((line) => fitLine(line, width));
  }
}

function lineRange(args: ToolArgs): string {
  const offset = numberArg(args, "offset");
  const limit = numberArg(args, "limit");
  if (offset === undefined && limit === undefined) return "";
  const start = offset ?? 1;
  return limit === undefined ? `:${start}` : `:${start}-${start + limit - 1}`;
}

function textOutput(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content
    .filter((content) => content.type === "text")
    .map((content) => content.text ?? "")
    .join("\n")
    .trim();
}

function diffLines(result: { details?: unknown }): string[] {
  const details = result.details;
  if (!details || typeof details !== "object" || !("diff" in details) || typeof details.diff !== "string") return [];
  return details.diff.split("\n");
}

function renderDiff(lines: string[], expanded: boolean, theme: Parameters<NonNullable<ToolDefinition<any, any, any>["renderResult"]>>[2]): RenderedSuccess {
  const additions = lines.filter((line) => line.startsWith("+") && !line.startsWith("+++"));
  const removals = lines.filter((line) => line.startsWith("-") && !line.startsWith("---"));
  const changed = lines.filter((line) => additions.includes(line) || removals.includes(line));
  const visible = expanded ? lines : changed.slice(0, EDIT_PREVIEW_LIMIT);
  const stats = `${theme.fg("success", `+${additions.length}`)} ${theme.fg("error", `-${removals.length}`)}`;
  const preview = visible.map((line) => {
    if (line.startsWith("+") && !line.startsWith("+++")) return theme.fg("success", line);
    if (line.startsWith("-") && !line.startsWith("---")) return theme.fg("error", line);
    return theme.fg("muted", line);
  });
  const footer = !expanded && changed.length > visible.length
    ? theme.fg("muted", `... ${changed.length - visible.length} more changed lines`)
    : undefined;
  return { body: [stats, ...preview].join("\n"), footer };
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

  const marker = context.isError
    ? theme.fg("error", "×")
    : context.isPartial
      ? theme.fg("muted", SPINNER_FRAMES[spinner.frame ?? 0])
      : theme.fg("success", "√");
  text.setText(`${marker} ${theme.fg("toolTitle", theme.bold(toolName))} ${theme.fg("toolOutput", header)}`);
}

function compactDefinition(
  tool: ToolDefinition<any, any, any>,
  formatHeader: HeaderFormatter,
  renderSuccess?: (args: ToolArgs, result: { details?: unknown }, expanded: boolean, theme: Parameters<NonNullable<ToolDefinition<any, any, any>["renderResult"]>>[2]) => RenderedSuccess,
  framed = false,
  createHeader?: HeaderFactory,
): ToolDefinition<any, any, any> {
  // Spread the built-in definition so its schema, prompt, and execution stay unchanged.
  return {
    ...tool,
    // Self-rendering bypasses Pi's colored Box shell.
    renderShell: "self",
    renderCall(args: ToolArgs, theme, context) {
      if (createHeader) return createHeader(args, theme, context);
      if (framed) {
        const frame = (context.lastComponent as DimFrame | undefined) ?? new DimFrame(theme);
        renderHeader(frame.header, tool.name, formatHeader(args, theme), theme, context);
        return frame;
      }
      const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
      renderHeader(text, tool.name, formatHeader(args, theme), theme, context);
      return text;
    },
    renderResult(result, options, theme, context) {
      const text = framed
        ? (context.lastComponent as DimFrame | undefined) ?? new DimFrame(theme)
        : (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
      const output = textOutput(result);

      // Successful output remains available on expand; errors retain a collapsed preview.
      if (options.isPartial || !output) {
        text.setText("");
      } else if (context.isError) {
        const lines = output.split("\n");
        const preview = options.expanded ? output : lines[0];
        const suffix = !options.expanded && lines.length > 1 ? theme.fg("muted", " ...") : "";
        text.setText(theme.fg("error", preview) + suffix);
      } else if (renderSuccess) {
        const rendered = renderSuccess(context.args, result, options.expanded, theme);
        if (text instanceof DimFrame) text.setResult(rendered);
        else text.setText(typeof rendered === "string" ? rendered : rendered.body);
      } else if (options.expanded) {
        text.setText(theme.fg("toolOutput", output));
      } else {
        text.setText("");
      }
      return text;
    },
  };
}

export default async function (pi: ExtensionAPI) {
  installCompactCompactionRenderer(CompactionSummaryMessageComponent);
  await installBundleCompactionRenderer();
  const cwd = process.cwd();

  // Registering matching names replaces only the built-in renderers above.
  pi.registerTool(compactDefinition(createReadToolDefinition(cwd), (args, theme) => (
    `${coloredPath(args, theme)}${theme.fg("toolOutput", lineRange(args))}`
  )));
  pi.registerTool(compactDefinition(createGrepToolDefinition(cwd), (args, theme) => (
    theme.fg("toolOutput", `/${shorten(stringArg(args, "pattern"), 48)}/ in ${shorten(stringArg(args, "path", "."), 48)}`)
  )));
  pi.registerTool(compactDefinition(createFindToolDefinition(cwd), (args, theme) => (
    theme.fg("toolOutput", `${shorten(stringArg(args, "pattern"), 56)} in ${shorten(stringArg(args, "path", "."), 48)}`)
  )));
  pi.registerTool(compactDefinition(createLsToolDefinition(cwd), (args, theme) => (
    theme.fg("toolOutput", shorten(stringArg(args, "path", ".")))
  )));
  pi.registerTool(compactDefinition(
    createBashToolDefinition(cwd),
    () => "",
    undefined,
    false,
    (args, theme, context) => {
      const header = context.lastComponent instanceof BashHeader
        ? context.lastComponent
        : new BashHeader();
      header.update(stringArg(args, "command", "<missing command>"), theme, context);
      return header;
    },
  ));
  pi.registerTool(compactDefinition(createEditToolDefinition(cwd), (args, theme) => {
    const edits = Array.isArray(args.edits) ? args.edits.length : 0;
    return `${coloredPath(args, theme)} ${theme.fg("toolOutput", `(${edits} edit${edits === 1 ? "" : "s"})`)}`;
  }, (args, result, expanded, theme) => {
    const lines = diffLines(result);
    return lines.length > 0
      ? renderDiff(lines, expanded, theme)
      : theme.fg("success", "Applied");
  }, true));
  pi.registerTool(compactDefinition(createWriteToolDefinition(cwd), (args, theme) => {
    const content = stringArg(args, "content");
    const lines = content === "" ? 0 : content.split("\n").length;
    return `${coloredPath(args, theme)} ${theme.fg("toolOutput", `(${lines} lines)`)}`;
  }, (args, _result, expanded, theme) => {
    const lines = stringArg(args, "content").split("\n");
    const visible = expanded ? lines : lines.slice(0, WRITE_PREVIEW_LIMIT);
    const preview = visible.map((line) => theme.fg("toolOutput", line));
    const footer = !expanded && lines.length > visible.length
      ? theme.fg("muted", `... ${lines.length - visible.length} more lines`)
      : undefined;
    return { body: preview.join("\n"), footer };
  }, true));
}
