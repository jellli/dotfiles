import {
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  type ExtensionAPI,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

type ToolArgs = Record<string, unknown>;
type HeaderFormatter = (args: ToolArgs) => string;
type SpinnerState = { timer?: ReturnType<typeof setInterval>; frame?: number };

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL_MS = 80;

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
): ToolDefinition<any, any, any> {
  // Spread the built-in definition so its schema, prompt, and execution stay unchanged.
  return {
    ...tool,
    // Self-rendering bypasses Pi's colored Box shell.
    renderShell: "self",
    renderCall(args: ToolArgs, theme, context) {
      const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
      renderHeader(text, tool.name, formatHeader(args), theme, context);
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

export default function (pi: ExtensionAPI) {
  const cwd = process.cwd();

  // Registering matching names replaces only the built-in renderers above.
  pi.registerTool(compactDefinition(createReadToolDefinition(cwd), (args) => (
    `${shorten(stringArg(args, "path", "<missing path>"))}${lineRange(args)}`
  )));
  pi.registerTool(compactDefinition(createGrepToolDefinition(cwd), (args) => (
    `/${shorten(stringArg(args, "pattern"), 48)}/ in ${shorten(stringArg(args, "path", "."), 48)}`
  )));
  pi.registerTool(compactDefinition(createFindToolDefinition(cwd), (args) => (
    `${shorten(stringArg(args, "pattern"), 56)} in ${shorten(stringArg(args, "path", "."), 48)}`
  )));
  pi.registerTool(compactDefinition(createLsToolDefinition(cwd), (args) => (
    shorten(stringArg(args, "path", "."))
  )));
  pi.registerTool(compactDefinition(createBashToolDefinition(cwd), (args) => (
    shorten(stringArg(args, "command", "<missing command>"))
  )));
  pi.registerTool(compactDefinition(createEditToolDefinition(cwd), (args) => {
    const edits = Array.isArray(args.edits) ? args.edits.length : 0;
    return `${shorten(stringArg(args, "path", "<missing path>"))} (${edits} edit${edits === 1 ? "" : "s"})`;
  }));
  pi.registerTool(compactDefinition(createWriteToolDefinition(cwd), (args) => {
    const content = stringArg(args, "content");
    const lines = content === "" ? 0 : content.split("\n").length;
    return `${shorten(stringArg(args, "path", "<missing path>"))} (${lines} lines)`;
  }));
}
