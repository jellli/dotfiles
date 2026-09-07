import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { diffLines, diffWordsWithSpace } from "../npm/node_modules/diff/libesm/index.js";
import { createHighlighter } from "../npm/node_modules/shiki/dist/index.mjs";
import {
  createEditToolDefinition,
  createWriteToolDefinition,
  type ExtensionAPI,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Text, type Component, visibleWidth } from "@earendil-works/pi-tui";
import { fitLine, padLine, toolHeader } from "./lib/pi-ui.js";

type ToolArgs = Record<string, unknown>;
type Theme = Parameters<NonNullable<ToolDefinition<any, any, any>["renderCall"]>>[1];
type RenderContext = Parameters<NonNullable<ToolDefinition<any, any, any>["renderCall"]>>[2];
type RenderOptions = Parameters<NonNullable<ToolDefinition<any, any, any>["renderResult"]>>[1];
type RenderResultTheme = Parameters<NonNullable<ToolDefinition<any, any, any>["renderResult"]>>[2];
type Language = string;

type Capture = { oldText: string; newText: string };
type DiffState = {
  capture?: Capture;
  rows?: DiffRow[];
  rendered?: string[];
  renderedKey?: string;
  renderPromise?: Promise<void>;
  renderPromiseKey?: string;
  totalLines?: number;
  invalidate?: () => void;
};

type DiffRow = {
  kind: "add" | "del" | "context";
  number: number;
  text: string;
  wordRanges?: WordRange[];
};

type WordRange = { start: number; end: number };

type DiffWindow = {
  rows: DiffRow[];
  start: number;
};

type HighlightToken = { content: string; color?: string };

const COLLAPSED_DIFF_LINES = 8;
const CAPTURE_REGISTRY = Symbol.for("dotfiles.pi-diff.captures");
type GlobalState = typeof globalThis & { [key: symbol]: Map<string, Capture> };
const globalState = globalThis as GlobalState;
const captures = globalState[CAPTURE_REGISTRY] ?? (globalState[CAPTURE_REGISTRY] = new Map());
const highlightedTokens = new Map<string, Promise<HighlightToken[]>>();
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

function wordRanges(oldText: string, newText: string): { oldRanges: WordRange[]; newRanges: WordRange[] } {
  const oldRanges: WordRange[] = [];
  const newRanges: WordRange[] = [];
  let oldOffset = 0;
  let newOffset = 0;
  for (const part of diffWordsWithSpace(oldText, newText)) {
    const length = part.value.length;
    if (part.removed) oldRanges.push({ start: oldOffset, end: oldOffset + length });
    if (part.added) newRanges.push({ start: newOffset, end: newOffset + length });
    if (!part.added) oldOffset += length;
    if (!part.removed) newOffset += length;
  }
  return { oldRanges, newRanges };
}

function addWordRanges(rows: DiffRow[]): DiffRow[] {
  const result = rows.map((row) => ({ ...row }));
  for (let index = 0; index < result.length - 1; index++) {
    const left = result[index];
    const right = result[index + 1];
    if (left.kind !== "del" || right.kind !== "add") continue;
    const ranges = wordRanges(left.text, right.text);
    left.wordRanges = ranges.oldRanges;
    right.wordRanges = ranges.newRanges;
    index++;
  }
  return result;
}

function parseDisplayDiff(diff: string): DiffRow[] {
  const rows: DiffRow[] = [];
  let fallbackNumber = 1;
  for (const line of diff.split("\n")) {
    if (!line || !["+", "-", " "].includes(line[0])) continue;
    const kind = line[0] === "+" ? "add" : line[0] === "-" ? "del" : "context";
    const body = line.slice(1);
    const numbered = body.match(/^\s*(\d+)\s(.*)$/);
    if (numbered) {
      const number = Number(numbered[1]);
      rows.push({ kind, number, text: numbered[2] });
      fallbackNumber = number + 1;
    } else if (kind === "context" && body.trim() === "...") {
      rows.push({ kind, number: fallbackNumber++, text: "..." });
    }
  }
  return rows;
}

function resultDiff(details: unknown): string | undefined {
  if (!details || typeof details !== "object" || !("diff" in details)) return undefined;
  const diff = details.diff;
  return typeof diff === "string" ? diff : undefined;
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

async function highlightTokens(text: string, language: Language): Promise<HighlightToken[]> {
  const key = `${language}\0${text}`;
  const cached = highlightedTokens.get(key);
  if (cached) return cached;
  const pending = highlighterPromise.then((highlighter) => {
    const tokens = highlighter.codeToTokens(text, { lang: language, theme: "github-dark" }).tokens[0] ?? [];
    return tokens.map((token) => ({ content: token.content, color: token.color }));
  }).catch(() => [{ content: text }]);
  highlightedTokens.set(key, pending);
  return pending;
}

function emphasizeWord(text: string, row: DiffRow, theme: RenderResultTheme): string {
  const color = row.kind === "add" ? "toolDiffAdded" : "toolDiffRemoved";
  return theme.bold(theme.underline(theme.fg(color, text)));
}

async function highlightCode(row: DiffRow, language: Language, theme: RenderResultTheme): Promise<string> {
  const tokens = await highlightTokens(row.text, language);
  if (!row.wordRanges?.length) {
    return tokens.map((token) => ansiColor(token.color ?? "#E1E4E8", token.content)).join("");
  }
  const output: string[] = [];
  let offset = 0;
  for (const token of tokens) {
    const tokenEnd = offset + token.content.length;
    let cursor = 0;
    for (const range of row.wordRanges) {
      const start = Math.max(range.start, offset);
      const end = Math.min(range.end, tokenEnd);
      if (start >= end) continue;
      const relativeStart = start - offset;
      const relativeEnd = end - offset;
      if (relativeStart > cursor) {
        output.push(ansiColor(token.color ?? "#E1E4E8", token.content.slice(cursor, relativeStart)));
      }
      output.push(emphasizeWord(token.content.slice(relativeStart, relativeEnd), row, theme));
      cursor = relativeEnd;
    }
    if (cursor < token.content.length) {
      output.push(ansiColor(token.color ?? "#E1E4E8", token.content.slice(cursor)));
    }
    offset = tokenEnd;
  }
  return output.join("");
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

function selectCollapsedRows(rows: DiffRow[], limit: number): DiffWindow {
  const lastChanged = rows.findLastIndex((row) => row.kind !== "context");
  if (lastChanged < 0) return { rows: [], start: 0 };

  let start = Math.max(0, lastChanged - Math.max(1, limit) + 1);
  let end = lastChanged + 1;

  // Keep a replacement pair together when the tail starts between delete/add rows.
  if (rows[start]?.kind === "add" && rows[start - 1]?.kind === "del") start--;
  if (rows[end - 1]?.kind === "del" && rows[end]?.kind === "add") end++;

  return { rows: rows.slice(start, end), start };
}

async function renderUnified(rows: DiffRow[], path: string, width: number, theme: RenderResultTheme): Promise<string[]> {
  const language = languageFor(path);
  const output: string[] = [];
  const numberWidth = rowNumberWidth(rows);
  for (const row of rows) {
    const code = await highlightCode(row, language, theme);
    const line = padLine(`${rowPrefix(row, theme, numberWidth)}${code}`, width, "", 0);
    output.push(styleRow(row, line, theme));
  }
  return output;
}

async function renderSplit(rows: DiffRow[], path: string, width: number, theme: RenderResultTheme): Promise<string[]> {
  const language = languageFor(path);
  const numberWidth = rowNumberWidth(rows);
  const half = Math.floor(width / 2);
  const leftWidth = Math.max(1, half - 1);
  const rightWidth = Math.max(1, width - half - 1);
  const output: string[] = [];
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const next = rows[index + 1];
    const isReplacement = row.kind === "del" && next?.kind === "add";
    const left = row.kind === "add" ? undefined : row;
    const right = row.kind === "del" ? (isReplacement ? next : undefined) : row;
    if (isReplacement) index++;
    const leftText = left ? await highlightCode(left, language, theme) : "";
    const rightText = right ? await highlightCode(right, language, theme) : "";
    const leftLine = left
      ? padLine(`${rowPrefix(left, theme, numberWidth)}${leftText}`, leftWidth, "", 0)
      : " ".repeat(leftWidth);
    const rightLine = right
      ? padLine(`${rowPrefix(right, theme, numberWidth)}${rightText}`, rightWidth, "", 0)
      : " ".repeat(rightWidth);
    output.push(styleRow(left, leftLine, theme) + theme.fg("dim", "│") + styleRow(right, rightLine, theme));
  }
  return output;
}

function padToWidth(line: string, width: number): string {
  const fitted = fitLine(line, width, "", 0);
  return fitted + " ".repeat(Math.max(0, width - visibleWidth(fitted)));
}

function viewerFooter(totalLines: number, width: number, theme: RenderResultTheme): string {
  const label = `└─ ${totalLines} lines`;
  if (width < 4) return fitLine(theme.fg("dim", label), width, "", 0);
  const fill = Math.max(0, width - visibleWidth(label) - 1);
  return fitLine(theme.fg("dim", `${label}${"─".repeat(fill)}┘`), width, "", 0);
}

function boxed(lines: string[], width: number, totalLines: number, theme: RenderResultTheme): string[] {
  if (width < 4) return [...lines.map((line) => fitLine(line, width, "", 0)), viewerFooter(totalLines, width, theme)];
  const innerWidth = width - 2;
  const side = theme.fg("dim", "│");
  return [
    theme.fg("dim", `┌${"─".repeat(innerWidth)}┐`),
    ...lines.map((line) => `${side}${padToWidth(line, innerWidth)}${side}`),
    viewerFooter(totalLines, width, theme),
  ];
}

class MutationDiffViewer implements Component {
  private state: DiffState;
  private path = "";
  private theme!: RenderResultTheme;
  private expanded = false;

  constructor(state: DiffState, path: string, theme: RenderResultTheme, expanded: boolean) {
    this.state = state;
    this.path = path;
    this.theme = theme;
    this.expanded = expanded;
    this.ensureRender(80);
  }

  setExpanded(expanded: boolean): void {
    this.expanded = expanded;
  }

  invalidate(): void {}

  render(width: number): string[] {
    const targetWidth = Math.max(1, width);
    this.ensureRender(targetWidth);
    const lines = this.state.rendered ?? [this.theme.fg("muted", "Rendering diff...")];
    return boxed(lines, targetWidth, this.state.totalLines ?? 0, this.theme);
  }

  private ensureRender(width: number): void {
    const innerWidth = Math.max(1, width - 2);
    const key = `${innerWidth}:${this.expanded ? "expanded" : "collapsed"}`;
    if (this.state.renderedKey === key) return;
    if (this.state.renderPromiseKey === key) return;

    const capture = this.state.capture;
    const hasSource = Boolean(capture) || this.state.rows !== undefined;
    const sourceRows = this.state.rows ?? (capture ? changedRows(capture.oldText, capture.newText) : []);
    if (!hasSource) {
      this.state.rendered = [this.theme.fg("warning", "Diff unavailable after reload")];
      this.state.totalLines = 0;
      this.state.renderedKey = key;
      return;
    }
    const rows = addWordRanges(sourceRows);
    this.state.rows = rows;
    const changed = rows.some((row) => row.kind !== "context");
    if (!changed) {
      this.state.rendered = [this.theme.fg("muted", "No changes")];
      this.state.totalLines = 0;
      this.state.renderedKey = key;
      return;
    }

    const window = this.expanded ? { rows, start: 0 } : selectCollapsedRows(rows, COLLAPSED_DIFF_LINES);
    const pending = (async () => {
      const rendered = innerWidth >= 150
        ? await renderSplit(window.rows, this.path, innerWidth, this.theme)
        : await renderUnified(window.rows, this.path, innerWidth, this.theme);
      const prefix = !this.expanded && window.start > 0
        ? [this.theme.fg("muted", `... ${window.start} earlier lines`)]
        : [];
      if (this.state.renderPromiseKey !== key || this.currentKey(width) !== key) return;
      this.state.rendered = [styleStats(rows, this.theme), ...prefix, ...rendered];
      this.state.totalLines = rows.length;
      this.state.renderedKey = key;
      this.state.invalidate?.();
    })().finally(() => {
      if (this.state.renderPromiseKey === key) {
        this.state.renderPromise = undefined;
        this.state.renderPromiseKey = undefined;
      }
    });
    this.state.renderPromise = pending;
    this.state.renderPromiseKey = key;
  }

  private currentKey(width: number): string {
    return `${Math.max(1, width - 2)}:${this.expanded ? "expanded" : "collapsed"}`;
  }
}

function header(path: string, tool: string, theme: Theme, context: RenderContext): Component {
  const text = new Text("", 0, 0);
  text.setText(toolHeader(theme, tool, theme.fg("accent", path), context));
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
      if (!state.capture && state.rows === undefined) {
        const nativeDiff = resultDiff(result.details);
        if (nativeDiff !== undefined) state.rows = addWordRanges(parseDisplayDiff(nativeDiff));
      }
      const component = context.lastComponent instanceof MutationDiffViewer
        ? context.lastComponent
        : new MutationDiffViewer(state, stringArg(context.args, "path", "<missing path>"), theme, options.expanded);
      component.setExpanded(options.expanded);
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
