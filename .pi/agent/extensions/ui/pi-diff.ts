import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { diffLines, diffWordsWithSpace } from "../../npm/node_modules/diff/libesm/index.js";
import { createHighlighter } from "../../npm/node_modules/shiki/dist/index.mjs";
import {
  createEditToolDefinition,
  createWriteToolDefinition,
  type ExtensionAPI,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Text, type Component, visibleWidth } from "@earendil-works/pi-tui";
import { fitLine, toolHeader } from "./lib/pi-ui.js";

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
  highlighted?: string[];
  highlightPending?: boolean;
  stats?: string;
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

type Rgb = { r: number; g: number; b: number };

/**
 * Resolved diff palette built from the pi theme (like pi-diff's auto-derive):
 * line backgrounds mix the tool-state base bg with the diff fg accent at low
 * intensity; word-level highlights use a brighter mix; gutters use a subtle
 * mix. Foregrounds keep the theme's diff colors.
 */
type DiffColors = {
  fgAdd: string;
  fgDel: string;
  fgCtx: string;
  fgLnum: string;
  bgBase: string; // context/empty bg (toolSuccessBg)
  bgGutterAdd: string;
  bgGutterDel: string;
  bgAdd: string; // added line bg
  bgDel: string; // deleted line bg
  bgAddW: string; // word-level add highlight
  bgDelW: string; // word-level del highlight
};

const COLLAPSED_DIFF_LINES = 8;
const SPLIT_MIN_WIDTH = 150;
const DIM = "\x1b[2m";
const RST = "\x1b[0m";
const DEFAULT_FG = "#E1E4E8";
const FALLBACK_LNUM = "\x1b[38;2;102;92;84m";

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

// ---------------------------------------------------------------------------
// Diff colors — auto-derived from the pi theme (pi-diff mixBg approach)
// ---------------------------------------------------------------------------

function parseAnsiRgb(ansi: string): Rgb | null {
  const match = ansi.match(/\x1b\[(?:38|48);2;(\d+);(\d+);(\d+)m/);
  return match ? { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) } : null;
}

/** Mix an accent color into a base bg at the given intensity (0.0–1.0). */
function mixBg(base: Rgb, accent: Rgb, intensity: number): string {
  const r = Math.round(base.r + (accent.r - base.r) * intensity);
  const g = Math.round(base.g + (accent.g - base.g) * intensity);
  const b = Math.round(base.b + (accent.b - base.b) * intensity);
  return `\x1b[48;2;${r};${g};${b}m`;
}

function themeFg(theme: RenderResultTheme, name: string, fallback: string): string | null {
  const get = (theme as unknown as { getFgAnsi?: (c: string) => string }).getFgAnsi;
  try {
    const ansi = get?.(name);
    return ansi ? parseAnsiRgb(ansi) ? ansi : fallback : null;
  } catch {
    return null;
  }
}

function themeBg(theme: RenderResultTheme, name: string): Rgb | null {
  const get = (theme as unknown as { getBgAnsi?: (c: string) => string }).getBgAnsi;
  try {
    const ansi = get?.(name);
    return ansi ? parseAnsiRgb(ansi) : null;
  } catch {
    return null;
  }
}

function resolveDiffColors(theme: RenderResultTheme): DiffColors {
  const fgAdd = themeFg(theme, "toolDiffAdded", "\x1b[38;2;100;180;120m") ?? "\x1b[38;2;100;180;120m";
  const fgDel = themeFg(theme, "toolDiffRemoved", "\x1b[38;2;200;100;100m") ?? "\x1b[38;2;200;100;100m";
  const addRgb = parseAnsiRgb(fgAdd) ?? { r: 100, g: 180, b: 120 };
  const delRgb = parseAnsiRgb(fgDel) ?? { r: 200, g: 100, b: 100 };

  const successBg = themeBg(theme, "toolSuccessBg") ?? { r: 26, g: 42, b: 32 };
  const errorBg = themeBg(theme, "toolErrorBg") ?? { r: 61, g: 32, b: 32 };

  // Line backgrounds — visible accent mixed into the tool-state base (15–18%)
  const bgAdd = mixBg(successBg, addRgb, 0.15);
  const bgDel = mixBg(errorBg, delRgb, 0.18);
  // Word-level highlights — more prominent (30–35%)
  const bgAddW = mixBg(successBg, addRgb, 0.3);
  const bgDelW = mixBg(errorBg, delRgb, 0.35);
  // Gutters — subtler than lines (10–12%)
  const bgGutterAdd = mixBg(successBg, addRgb, 0.1);
  const bgGutterDel = mixBg(errorBg, delRgb, 0.12);

  const bgBase = mixBg(successBg, successBg, 0); // raw toolSuccessBg
  const fgCtx = themeFg(theme, "toolDiffContext", "\x1b[38;2;120;120;120m") ?? "\x1b[38;2;120;120;120m";
  const fgLnum = themeFg(theme, "dim", null) ?? FALLBACK_LNUM;
  return { fgAdd, fgDel, fgCtx, fgLnum, bgBase, bgGutterAdd, bgGutterDel, bgAdd, bgDel, bgAddW, bgDelW };
}

// ---------------------------------------------------------------------------
// Shiki highlighting + word-level background injection
// ---------------------------------------------------------------------------

function ansiFg(hex: string, text: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return text;
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
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

/** Word-level emphasis: swaps the diff bg to the brighter highlight bg, but the
 * Shiki syntax fg is preserved (pi-diff injectBg style — no underline). */
function emphasizeWord(text: string, wordBg: string, bodyBg: string): string {
  return `${wordBg}${text}${bodyBg}`;
}

async function highlightCode(row: DiffRow, language: Language, colors: DiffColors): Promise<string> {
  const tokens = await highlightTokens(row.text, language);
  const wordBg = row.kind === "add" ? colors.bgAddW : row.kind === "del" ? colors.bgDelW : "";
  const bodyBg = row.kind === "add" ? colors.bgAdd : row.kind === "del" ? colors.bgDel : "";
  if (!row.wordRanges?.length || !wordBg) {
    return tokens.map((token) => ansiFg(token.color ?? DEFAULT_FG, token.content)).join("");
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
        output.push(ansiFg(token.color ?? DEFAULT_FG, token.content.slice(cursor, relativeStart)));
      }
      output.push(emphasizeWord(ansiFg(token.color ?? DEFAULT_FG, token.content.slice(relativeStart, relativeEnd)), wordBg, bodyBg));
      cursor = relativeEnd;
    }
    if (cursor < token.content.length) {
      output.push(ansiFg(token.color ?? DEFAULT_FG, token.content.slice(cursor)));
    }
    offset = tokenEnd;
  }
  return output.join("");
}

async function highlightAll(rows: DiffRow[], path: string, colors: DiffColors): Promise<string[]> {
  const language = languageFor(path);
  return Promise.all(rows.map((row) => highlightCode(row, language, colors)));
}

// ---------------------------------------------------------------------------
// Layout — fully synchronous: consumes already-highlighted code + palette
// ---------------------------------------------------------------------------

function rowNumberWidth(rows: DiffRow[]): number {
  return Math.max(2, ...rows.map((row) => String(row.number).length));
}

function lnum(number: number, width: number, fg: string): string {
  const value = String(number);
  return fg + " ".repeat(Math.max(0, width - value.length)) + value + RST;
}

/** Gutter per pi-diff: colored ▌ bar + right-aligned lnum + sign on a subtle bg. */
function gutterFor(row: DiffRow, numberWidth: number, colors: DiffColors): string {
  const isAdd = row.kind === "add";
  const isDel = row.kind === "del";
  const gBg = isAdd ? colors.bgGutterAdd : isDel ? colors.bgGutterDel : colors.bgBase;
  const signFg = isAdd ? colors.fgAdd : isDel ? colors.fgDel : colors.fgCtx;
  const numFg = isAdd ? colors.fgAdd : isDel ? colors.fgDel : colors.fgLnum;
  const sign = isAdd ? "+" : isDel ? "-" : " ";
  const border = isAdd || isDel ? `${signFg}▌` : `${colors.bgBase}`;
  return `${border}${gBg}${lnum(row.number, numberWidth, numFg)}${gBg} ${signFg}${sign}${gBg} `;
}

function bodyBgFor(row: DiffRow | undefined, colors: DiffColors): string {
  if (row?.kind === "add") return colors.bgAdd;
  if (row?.kind === "del") return colors.bgDel;
  return colors.bgBase;
}

function renderUnifiedLayout(rows: DiffRow[], code: string[], start: number, width: number, colors: DiffColors): string[] {
  const numberWidth = rowNumberWidth(rows);
  const output: string[] = [];
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const highlighted = code[start + index] ?? row.text;
    const gutter = gutterFor(row, numberWidth, colors);
    const bodyBg = bodyBgFor(row, colors);
    const contentW = Math.max(1, width - visibleWidth(gutter));
    const fitted = fitLine(row.kind === "context" ? `${DIM}${highlighted}` : highlighted, contentW, "", 0);
    const pad = Math.max(0, contentW - visibleWidth(fitted));
    output.push(`${gutter}${bodyBg}${fitted}${" ".repeat(pad)}${RST}`);
  }
  return output;
}

function renderSplitLayout(rows: DiffRow[], code: string[], start: number, width: number, colors: DiffColors): string[] {
  const numberWidth = rowNumberWidth(rows);
  const half = Math.floor(width / 2);
  const leftWidth = Math.max(1, half - 1);
  const rightWidth = Math.max(1, width - half - 1);
  const output: string[] = [];

  function halfLine(isLeft: boolean, row: DiffRow | undefined, indexInCode: number): string {
    if (!row) return " ".repeat(isLeft ? leftWidth : rightWidth);
    const highlighted = code[indexInCode] ?? row.text;
    const gutter = gutterFor(row, numberWidth, colors);
    const bodyBg = bodyBgFor(row, colors);
    const halfW = isLeft ? leftWidth : rightWidth;
    const gutterWidth = visibleWidth(gutter);
    const contentW = Math.max(1, halfW - gutterWidth);
    const fitted = fitLine(row.kind === "context" ? `${DIM}${highlighted}` : highlighted, contentW, "", 0);
    const pad = Math.max(0, contentW - visibleWidth(fitted));
    return `${gutter}${bodyBg}${fitted}${" ".repeat(pad)}`;
  }

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const next = rows[index + 1];
    const isReplacement = row.kind === "del" && next?.kind === "add";
    const left = row.kind === "add" ? undefined : row;
    const right = row.kind === "del" ? (isReplacement ? next : undefined) : row;
    const leftIndex = start + index;
    const rightIndex = start + (isReplacement ? index + 1 : index);
    if (isReplacement) index++;
    const leftText = halfLine(true, left, leftIndex);
    const rightText = halfLine(false, right, rightIndex);
    output.push(`${leftText}${colors.fgLnum}│${RST}${rightText}${RST}`);
  }
  return output;
}

function padToWidth(line: string, width: number): string {
  const fitted = fitLine(line, width, "", 0);
  return fitted + " ".repeat(Math.max(0, width - visibleWidth(fitted)));
}

function viewerTop(stats: string | undefined, width: number, theme: RenderResultTheme): string {
  const corner = theme.fg("dim", "┌");
  const dash = theme.fg("dim", "─");
  if (!stats || width < 10) {
    return fitLine(`${corner}${dash.repeat(Math.max(1, width - 2))}${theme.fg("dim", "┐")}`, width, "", 0);
  }
  const head = `${corner}${dash} ${stats} `;
  const fill = Math.max(1, width - visibleWidth(head) - 1);
  return fitLine(`${head}${dash.repeat(fill)}${theme.fg("dim", "┐")}`, width, "", 0);
}

function viewerFooter(totalLines: number, width: number, theme: RenderResultTheme): string {
  const label = `└─ ${totalLines} lines`;
  if (width < 4) return fitLine(theme.fg("dim", label), width, "", 0);
  const fill = Math.max(0, width - visibleWidth(label) - 1);
  return fitLine(theme.fg("dim", `${label}${"─".repeat(fill)}┘`), width, "", 0);
}

function boxed(lines: string[], width: number, totalLines: number, theme: RenderResultTheme, stats?: string): string[] {
  if (width < 4) return [...lines.map((line) => fitLine(line, width, "", 0)), viewerFooter(totalLines, width, theme)];
  const innerWidth = width - 2;
  const side = theme.fg("dim", "│");
  return [
    viewerTop(stats, width, theme),
    ...lines.map((line) => `${side}${padToWidth(line, innerWidth)}${side}`),
    viewerFooter(totalLines, width, theme),
  ];
}

class MutationDiffViewer implements Component {
  private state: DiffState;
  private path = "";
  private theme!: RenderResultTheme;
  private colors!: DiffColors;
  private expanded = false;

  constructor(state: DiffState, path: string, theme: RenderResultTheme, expanded: boolean) {
    this.state = state;
    this.path = path;
    this.theme = theme;
    this.colors = resolveDiffColors(theme);
    this.expanded = expanded;
    this.ensureSource();
    this.kickHighlight();
  }

  setExpanded(expanded: boolean): void {
    this.expanded = expanded;
  }

  invalidate(): void {}

  render(width: number): string[] {
    const targetWidth = Math.max(1, width);
    const innerWidth = Math.max(1, targetWidth - 2);
    this.ensureSource();
    return boxed(this.layout(innerWidth), targetWidth, this.state.totalLines ?? 0, this.theme, this.state.stats);
  }

  private ensureSource(): void {
    if (this.state.rows !== undefined) return;
    const capture = this.state.capture;
    if (!capture) {
      this.state.rows = [];
      return;
    }
    this.state.rows = addWordRanges(changedRows(capture.oldText, capture.newText));
    this.state.totalLines = this.state.rows.length;
  }

  private kickHighlight(): void {
    const rows = this.state.rows;
    if (!rows || rows.length === 0 || this.state.highlighted !== undefined || this.state.highlightPending) return;
    this.state.highlightPending = true;
    highlightAll(rows, this.path, this.colors).then((highlighted) => {
      if (this.state.highlighted !== undefined) return;
      this.state.highlighted = highlighted;
      this.state.invalidate?.();
    }).finally(() => {
      this.state.highlightPending = false;
    });
  }

  private layout(innerWidth: number): string[] {
    const rows = this.state.rows;
    if (rows === undefined || rows.length === 0) {
      return [this.theme.fg("warning", "Diff unavailable after reload")];
    }
    if (this.state.stats === undefined && rows.some((row) => row.kind !== "context")) {
      this.state.stats = styleStats(rows, this.theme);
      this.state.totalLines = rows.length;
    }
    if (!rows.some((row) => row.kind !== "context")) {
      return [this.theme.fg("muted", "No changes")];
    }
    if (this.state.highlighted === undefined) {
      return [this.theme.fg("muted", "Rendering diff...")];
    }
    const window = this.expanded ? { rows, start: 0 } : selectCollapsedRows(rows, COLLAPSED_DIFF_LINES);
    const rendered = innerWidth >= SPLIT_MIN_WIDTH
      ? renderSplitLayout(window.rows, this.state.highlighted, window.start, innerWidth, this.colors)
      : renderUnifiedLayout(window.rows, this.state.highlighted, window.start, innerWidth, this.colors);
    const prefix = !this.expanded && window.start > 0
      ? [this.colors.bgBase + this.theme.fg("muted", ` ... ${window.start} earlier lines`) + RST]
      : [];
    return [...prefix, ...rendered];
  }
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

  if (rows[start]?.kind === "add" && rows[start - 1]?.kind === "del") start--;
  if (rows[end - 1]?.kind === "del" && rows[end]?.kind === "add") end++;

  return { rows: rows.slice(start, end), start };
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

export function registerPiDiff(pi: ExtensionAPI): void {
  const cwd = process.cwd();
  pi.registerTool(wrapMutation(createEditToolDefinition(cwd), cwd));
  pi.registerTool(wrapMutation(createWriteToolDefinition(cwd), cwd));
}
