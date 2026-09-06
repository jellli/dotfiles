import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { diffLines } from "../npm/node_modules/diff/libesm/index.js";
import { createHighlighter } from "../npm/node_modules/shiki/dist/index.mjs";
import {
  createEditToolDefinition,
  createWriteToolDefinition,
  type ExtensionAPI,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Text, type Component, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

type ToolArgs = Record<string, unknown>;
type Theme = Parameters<NonNullable<ToolDefinition<any, any, any>["renderCall"]>>[1];
type RenderContext = Parameters<NonNullable<ToolDefinition<any, any, any>["renderCall"]>>[2];
type RenderOptions = Parameters<NonNullable<ToolDefinition<any, any, any>["renderResult"]>>[1];
type RenderResultTheme = Parameters<NonNullable<ToolDefinition<any, any, any>["renderResult"]>>[2];
type Language = string;

type Capture = { oldText: string; newText: string };
type DiffState = { capture?: Capture; lines?: string[]; renderWidth?: number; renderPromise?: Promise<void>; invalidate?: () => void };

type DiffRow = {
  kind: "add" | "del" | "context";
  number: number;
  text: string;
};

const captures = new Map<string, Capture>();
const highlighted = new Map<string, Promise<string>>();
const highlighterPromise = createHighlighter({
  themes: ["github-dark"],
  langs: ["typescript", "tsx", "javascript", "jsx", "json", "markdown", "bash", "python", "text"],
});

const LANGUAGE_BY_EXTENSION: Record<string, Language> = {
  ".ts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".jsx": "jsx",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".json": "json",
  ".md": "markdown",
  ".sh": "bash",
  ".bash": "bash",
  ".zsh": "bash",
  ".py": "python",
};

function stringArg(args: ToolArgs, key: string, fallback = ""): string {
  const value = args[key];
  return typeof value === "string" ? value : fallback;
}

function normalize(text: string): string {
  return text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
}

function targetPath(args: ToolArgs, cwd: string): string {
  const path = stringArg(args, "path");
  return path.startsWith("/") ? path : resolve(cwd, path);
}

async function readText(path: string): Promise<string> {
  try {
    return normalize(await readFile(path, "utf8"));
  } catch {
    return "";
  }
}

function changedRows(oldText: string, newText: string): DiffRow[] {
  const rows: DiffRow[] = [];
  let oldLine = 1;
  let newLine = 1;
  for (const part of diffLines(oldText, newText)) {
    const lines = part.value.replace(/\n$/, "").split("\n");
    if (part.removed) {
      for (const text of lines) rows.push({ kind: "del", number: oldLine++, text });
    } else if (part.added) {
      for (const text of lines) rows.push({ kind: "add", number: newLine++, text });
    } else {
      for (const text of lines) rows.push({ kind: "context", number: newLine++, text });
      oldLine += lines.length;
    }
  }
  return rows;
}

function languageFor(path: string): Language {
  return LANGUAGE_BY_EXTENSION[extname(path).toLowerCase()] ?? "text";
}

function ansiColor(hex: string, text: string): string {
  const value = hex.slice(1);
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
}

async function highlightLine(text: string, language: Language): Promise<string> {
  const key = `${language}\0${text}`;
  const cached = highlighted.get(key);
  if (cached) return cached;
  const pending = highlighterPromise.then((highlighter) => {
    const tokens = highlighter.codeToTokens(text, { lang: language, theme: "github-dark" }).tokens[0] ?? [];
    return tokens.map((token) => ansiColor(token.color ?? "#E1E4E8", token.content)).join("");
  }).catch(() => text);
  highlighted.set(key, pending);
  return pending;
}

function fit(line: string, width: number): string {
  return visibleWidth(line) <= width ? line : truncateToWidth(line, Math.max(1, width), "...", false);
}

function pad(line: string, width: number): string {
  const fitted = fit(line, width);
  return fitted + " ".repeat(Math.max(0, width - visibleWidth(fitted)));
}

function rowNumberWidth(rows: DiffRow[]): number {
  return Math.max(1, ...rows.map((row) => String(row.number).length));
}

function styleRow(row: DiffRow | undefined, text: string, theme: RenderResultTheme): string {
  if (row?.kind === "add") return theme.bg("toolSuccessBg", theme.fg("toolDiffAdded", text));
  if (row?.kind === "del") return theme.bg("toolErrorBg", theme.fg("toolDiffRemoved", text));
  return row ? theme.fg("toolDiffContext", text) : text;
}

function rowPrefix(row: DiffRow, theme: RenderResultTheme, numberWidth: number): string {
  const sign = row.kind === "add" ? "+" : row.kind === "del" ? "-" : " ";
  const color = row.kind === "add" ? "toolDiffAdded" : row.kind === "del" ? "toolDiffRemoved" : "toolDiffContext";
  const number = String(row.number).padStart(numberWidth, " ");
  return `${theme.fg(color, sign)} ${theme.fg("dim", number)} `;
}

function styleStats(rows: DiffRow[], theme: RenderResultTheme): string {
  const added = rows.filter((row) => row.kind === "add").length;
  const removed = rows.filter((row) => row.kind === "del").length;
  return `${theme.fg("toolDiffAdded", `+${added}`)} ${theme.fg("toolDiffRemoved", `-${removed}`)}`;
}

async function renderUnified(rows: DiffRow[], path: string, width: number, theme: RenderResultTheme): Promise<string[]> {
  const language = languageFor(path);
  const output: string[] = [];
  const numberWidth = rowNumberWidth(rows);
  const gutterWidth = numberWidth + 3;
  const codeWidth = Math.max(1, width - gutterWidth);
  for (const row of rows.slice(0, 150)) {
    const code = await highlightLine(row.text, language);
    const line = pad(`${rowPrefix(row, theme, numberWidth)}${code}`, width);
    output.push(styleRow(row, line, theme));
    if (visibleWidth(row.text) > codeWidth) {
      // fit() keeps long source lines on one stable terminal row.
    }
  }
  if (rows.length > 150) output.push(theme.fg("muted", `... ${rows.length - 150} more lines`));
  return output;
}

async function renderSplit(rows: DiffRow[], path: string, width: number, theme: RenderResultTheme): Promise<string[]> {
  const language = languageFor(path);
  const numberWidth = rowNumberWidth(rows);
  const half = Math.floor(width / 2);
  const leftWidth = Math.max(1, half - 1);
  const rightWidth = Math.max(1, width - half - 1);
  const output: string[] = [];
  for (let index = 0; index < rows.length && output.length < 80; index++) {
    const row = rows[index];
    const next = rows[index + 1];
    const isReplacement = row.kind === "del" && next?.kind === "add";
    const left = row.kind === "add" ? undefined : row;
    const right = row.kind === "del" ? (isReplacement ? next : undefined) : row;
    if (isReplacement) index++;
    const leftText = left ? await highlightLine(left.text, language) : "";
    const rightText = right ? await highlightLine(right.text, language) : "";
    const leftLine = left
      ? pad(`${rowPrefix(left, theme, numberWidth)}${leftText}`, leftWidth)
      : " ".repeat(leftWidth);
    const rightLine = right
      ? pad(`${rowPrefix(right, theme, numberWidth)}${rightText}`, rightWidth)
      : " ".repeat(rightWidth);
    output.push(styleRow(left, leftLine, theme) + theme.fg("dim", "│") + styleRow(right, rightLine, theme));
  }
  if (rows.length > 80) output.push(theme.fg("muted", `... ${rows.length - 80} more lines`));
  return output;
}

function boxed(lines: string[], width: number, theme: RenderResultTheme): string[] {
  if (width < 4) return lines.map((line) => fit(line, width));
  const innerWidth = width - 2;
  const border = "─";
  const side = theme.fg("dim", "│");
  return [
    theme.fg("dim", `┌${border.repeat(innerWidth)}┐`),
    ...lines.map((line) => `${side}${pad(line, innerWidth)}${side}`),
    theme.fg("dim", `└${border.repeat(innerWidth)}┘`),
  ];
}

class DiffComponent implements Component {
  private state: DiffState;
  private path = "";
  private theme!: RenderResultTheme;
  private expanded = false;

  constructor(state: DiffState, path: string, theme: RenderResultTheme, expanded: boolean) {
    this.state = state;
    this.path = path;
    this.theme = theme;
    this.expanded = expanded;
    this.ensureRender();
  }

  invalidate(): void {}

  render(width: number): string[] {
    this.ensureRender(width);
    const rows = this.state.lines ?? [this.theme.fg("muted", "Rendering diff...")];
    return boxed(rows, width, this.theme);
  }

  private ensureRender(width: number): void {
    const targetWidth = Math.max(1, width);
    if (this.state.lines && this.state.renderWidth === targetWidth) return;
    if (this.state.renderPromise) return;
    const capture = this.state.capture;
    if (!capture) {
      this.state.lines = [this.theme.fg("muted", "No changes")];
      return;
    }
    this.state.renderPromise = (async () => {
      const rows = changedRows(capture.oldText, capture.newText);
      const changed = rows.some((row) => row.kind !== "context");
      if (!changed) {
        this.state.lines = [this.theme.fg("muted", "No changes")];
        this.state.renderWidth = targetWidth;
        this.state.invalidate?.();
        return;
      }
      const renderWidth = Math.max(1, targetWidth - 2);
      const rendered = renderWidth >= 150
        ? await renderSplit(rows, this.path, renderWidth, this.theme)
        : await renderUnified(rows, this.path, renderWidth, this.theme);
      this.state.lines = [styleStats(rows, this.theme), ...rendered];
      this.state.renderWidth = renderWidth;
      this.state.invalidate?.();
    })();
  }
}

function header(path: string, tool: string, theme: Theme, context: RenderContext): Component {
  const text = new Text("", 0, 0);
  const marker = context.isPartial ? theme.fg("muted", "·") : theme.fg("success", "√");
  text.setText(`${marker} ${theme.fg("toolTitle", theme.bold(tool))} ${theme.fg("accent", path)}`);
  return text;
}

function wrapMutation<T extends ToolDefinition<any, any, any>>(tool: T, cwd: string): T {
  const originalExecute = tool.execute;
  return {
    ...tool,
    renderShell: "self",
    async execute(toolCallId: string, args: ToolArgs, signal: AbortSignal, onUpdate: unknown, context: { cwd?: string }) {
      const executionCwd = context?.cwd || cwd;
      const path = targetPath(args, executionCwd);
      const oldText = await readText(path);
      const result = await originalExecute(toolCallId, args, signal, onUpdate as never, context as never);
      const newText = await readText(path);
      captures.set(toolCallId, { oldText, newText });
      return result;
    },
    renderCall(args: ToolArgs, theme: Theme, context: RenderContext) {
      return header(stringArg(args, "path", "<missing path>"), tool.name, theme, context);
    },
    renderResult(result: { content: Array<{ type: string; text?: string }>; details?: unknown }, options: RenderOptions, theme: RenderResultTheme, context: RenderContext) {
      if (options.isPartial) return context.lastComponent ?? new Text("", 0, 0);
      if (context.isError) {
        const message = result.content?.find((item) => item.type === "text")?.text ?? "Tool failed";
        return new Text(theme.fg("error", message.split("\n")[0]), 0, 0);
      }
      const state = (context.state as DiffState) ?? {};
      state.invalidate = context.invalidate;
      state.capture ??= captures.get(context.toolCallId);
      const component = context.lastComponent instanceof DiffComponent
        ? context.lastComponent
        : new DiffComponent(state, stringArg(context.args, "path", "<missing path>"), theme, options.expanded);
      captures.delete(context.toolCallId);
      return component;
    },
  } as T;
}

export default function (pi: ExtensionAPI): void {
  const cwd = process.cwd();
  pi.registerTool(wrapMutation(createEditToolDefinition(cwd), cwd));
  pi.registerTool(wrapMutation(createWriteToolDefinition(cwd), cwd));
}
