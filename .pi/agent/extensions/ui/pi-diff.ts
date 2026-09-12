import { statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import {
  diffLines,
  diffWordsWithSpace,
} from "../../npm/node_modules/diff/libesm/index.js";
import type { createHighlighter } from "../../npm/node_modules/shiki/dist/index.mjs";
import {
  createEditToolDefinition,
  createWriteToolDefinition,
  type ExtensionAPI,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { type Component, visibleWidth } from "@earendil-works/pi-tui";
import { cardLifecycle } from "../card/lifecycle.js";
import { fitLine } from "../card/text.js";
import { toolCard, type CardSpec } from "../card/tool-card.js";

type ToolArgs = Record<string, unknown>;
type RenderResultTheme = Parameters<
  NonNullable<ToolDefinition<any, any, any>["renderResult"]>
>[2];
type Language = string;

type Capture = { oldText: string; newText: string };
type DiffState = {
  capture?: Capture;
  rows?: DiffRow[];
  /** Highlighted lines by row index: only the rows the view has drawn. */
  highlighted?: Map<number, string>;
  highlightPending?: boolean;
  stats?: string;
  totalLines?: number;
  invalidate?: () => void;
  /** The box this row draws; the card module's body keeps it here. */
  viewer?: DiffViewer;
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
/** Rows tokenized per pass: the expanded view fills in, chunk by chunk. */
const HIGHLIGHT_CHUNK = 500;
/** Above this many lines a whole-file capture is not worth its row objects. */
const MAX_CAPTURE_LINES = 20_000;

/**
 * Above this many bytes the file is not read for a capture at all.
 *
 * The line cap above only decides what to keep once the file has already been
 * read twice (before and after the tool ran). A 9.6MB file measured 51ms of
 * reads and ~19MB of resident text, and the pre-execution read delays the edit
 * itself by half a round trip - seconds on a network mount. Below the budget the
 * capture gives full-context rows and word-level emphasis; above it the diff
 * comes from the tool's own result (the host's +-4 context lines).
 */
const MAX_CAPTURE_BYTES = 2 * 1024 * 1024;

/** Tools whose result reports no diff of its own: the capture is the only source
 * of a diff for them, whatever the file size (see MAX_CAPTURE_LINES). */
const CAPTURE_ONLY_TOOLS = new Set(["write"]);
const SPLIT_MIN_WIDTH = 150;
const DIM = "\x1b[2m";
const RST = "\x1b[0m";
const DEFAULT_FG = "#E1E4E8";
const FALLBACK_LNUM = "\x1b[38;2;102;92;84m";

const CAPTURE_REGISTRY = Symbol.for("dotfiles.pi-diff.captures");
type GlobalState = typeof globalThis & { [key: symbol]: Map<string, Capture> };
const globalState = globalThis as GlobalState;
const captures =
  globalState[CAPTURE_REGISTRY] ?? (globalState[CAPTURE_REGISTRY] = new Map());
const SHIKI_THEME = "gruvbox-dark-medium";
const highlightedTokens = new Map<string, Promise<HighlightToken[]>>();
// Every distinct line of every diff and every bash command lands here, so the
// cache is bounded instead of growing for the whole session.
const TOKEN_CACHE_LIMIT = 4000;
type Highlighter = Awaited<ReturnType<typeof createHighlighter>>;
let highlighterPromise: Promise<Highlighter> | undefined;

/** Shiki is imported on first use: the module graph is large, and a session
 * that never edits a file never needs it. */
function getHighlighter(): Promise<Highlighter> {
  return (highlighterPromise ??=
    import("../../npm/node_modules/shiki/dist/index.mjs")
      .catch((error: unknown) => {
        // Do not cache the failure: the next diff gets its own attempt.
        highlighterPromise = undefined;
        throw error;
      })
      .then((shiki) =>
        shiki.createHighlighter({
          themes: [SHIKI_THEME],
          langs: [
            "typescript",
            "tsx",
            "javascript",
            "jsx",
            "json",
            "markdown",
            "bash",
            "python",
            "text",
          ],
        }),
      ));
}

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

/** Line count without splitting the text into an array. */
function lineCount(text: string): number {
  if (text === "") return 0;
  let count = 1;
  for (
    let index = text.indexOf("\n");
    index !== -1;
    index = text.indexOf("\n", index + 1)
  ) {
    count += 1;
  }
  return count;
}

function normalize(text: string): string {
  return text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
}

function targetPath(args: ToolArgs, cwd: string): string {
  const path = stringArg(args, "path");
  return path.startsWith("/") ? path : resolve(cwd, path);
}

/**
 * The whole-file reads a capture is built from; injected so the byte guard can
 * be exercised without a multi-megabyte fixture.
 */
export type CaptureSource = {
  /** The file text, normalized; `""` when it cannot be read. */
  read(path: string): Promise<string>;
  /** File size in bytes; 0 when unknown, which reads anyway. */
  size(path: string): number;
};

const fileCapture: CaptureSource = {
  async read(path: string): Promise<string> {
    try {
      return normalize(await readFile(path, "utf8"));
    } catch {
      return "";
    }
  },
  size(path: string): number {
    try {
      return statSync(path).size;
    } catch {
      return 0;
    }
  },
};

function changedRows(oldText: string, newText: string): DiffRow[] {
  const rows: DiffRow[] = [];
  let oldLine = 1;
  let newLine = 1;
  for (const part of diffLines(oldText, newText)) {
    const lines = part.value.replace(/\n$/, "").split("\n");
    if (part.removed) {
      for (const text of lines)
        rows.push({ kind: "del", number: oldLine++, text });
    } else if (part.added) {
      for (const text of lines)
        rows.push({ kind: "add", number: newLine++, text });
    } else {
      for (const text of lines)
        rows.push({ kind: "context", number: newLine++, text });
      oldLine += lines.length;
    }
  }
  return rows;
}

function wordRanges(
  oldText: string,
  newText: string,
): { oldRanges: WordRange[]; newRanges: WordRange[] } {
  const oldRanges: WordRange[] = [];
  const newRanges: WordRange[] = [];
  let oldOffset = 0;
  let newOffset = 0;
  for (const part of diffWordsWithSpace(oldText, newText)) {
    const length = part.value.length;
    if (part.removed)
      oldRanges.push({ start: oldOffset, end: oldOffset + length });
    if (part.added)
      newRanges.push({ start: newOffset, end: newOffset + length });
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
  if (!details || typeof details !== "object" || !("diff" in details))
    return undefined;
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
  return match
    ? { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) }
    : null;
}

/** Mix an accent color into a base bg at the given intensity (0.0–1.0). */
function mixBg(base: Rgb, accent: Rgb, intensity: number): string {
  const r = Math.round(base.r + (accent.r - base.r) * intensity);
  const g = Math.round(base.g + (accent.g - base.g) * intensity);
  const b = Math.round(base.b + (accent.b - base.b) * intensity);
  return `\x1b[48;2;${r};${g};${b}m`;
}

function themeFg(
  theme: RenderResultTheme,
  name: string,
  fallback: string | null,
): string | null {
  const get = (theme as unknown as { getFgAnsi?: (c: string) => string })
    .getFgAnsi;
  try {
    const ansi = get?.(name);
    return ansi ? (parseAnsiRgb(ansi) ? ansi : fallback) : null;
  } catch {
    return null;
  }
}

function themeBg(theme: RenderResultTheme, name: string): Rgb | null {
  const get = (theme as unknown as { getBgAnsi?: (c: string) => string })
    .getBgAnsi;
  try {
    const ansi = get?.(name);
    return ansi ? parseAnsiRgb(ansi) : null;
  } catch {
    return null;
  }
}

function resolveDiffColors(theme: RenderResultTheme): DiffColors {
  const fgAdd =
    themeFg(theme, "toolDiffAdded", "\x1b[38;2;100;180;120m") ??
    "\x1b[38;2;100;180;120m";
  const fgDel =
    themeFg(theme, "toolDiffRemoved", "\x1b[38;2;200;100;100m") ??
    "\x1b[38;2;200;100;100m";
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
  const fgCtx =
    themeFg(theme, "toolDiffContext", "\x1b[38;2;120;120;120m") ??
    "\x1b[38;2;120;120;120m";
  const fgLnum = themeFg(theme, "dim", null) ?? FALLBACK_LNUM;
  return {
    fgAdd,
    fgDel,
    fgCtx,
    fgLnum,
    bgBase,
    bgGutterAdd,
    bgGutterDel,
    bgAdd,
    bgDel,
    bgAddW,
    bgDelW,
  };
}

/** Whether two resolved palettes paint the same colors. */
function sameColors(left: DiffColors, right: DiffColors): boolean {
  const keys = Object.keys(left) as Array<keyof DiffColors>;
  return keys.every((key) => left[key] === right[key]);
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

async function highlightTokens(
  text: string,
  language: Language,
): Promise<HighlightToken[]> {
  const key = `${language}\0${text}`;
  const cached = highlightedTokens.get(key);
  if (cached) return cached;
  const pending = getHighlighter()
    .then((highlighter) => {
      const tokens =
        highlighter.codeToTokens(text, {
          lang: language as never,
          theme: SHIKI_THEME,
        }).tokens[0] ?? [];
      return tokens.map((token) => ({
        content: token.content,
        color: token.color,
      }));
    })
    .catch(() => [{ content: text }]);
  if (highlightedTokens.size >= TOKEN_CACHE_LIMIT) highlightedTokens.clear();
  highlightedTokens.set(key, pending);
  return pending;
}

/** Shared bash command highlighting for the compact bash card.
 * Returns one ANSI string per line so the `$ cd … &&` prefix can be
 * applied only to the first row (OMP convention). */
export async function highlightBashLines(text: string): Promise<string[]> {
  const tokens = await highlightTokens(text, "bash");
  return tokens
    .map((token) => ansiFg(token.color ?? DEFAULT_FG, token.content))
    .join("")
    .split("\n");
}

/** Word-level emphasis: swaps the diff bg to the brighter highlight bg, but the
 * Shiki syntax fg is preserved (pi-diff injectBg style — no underline). */
function emphasizeWord(text: string, wordBg: string, bodyBg: string): string {
  return `${wordBg}${text}${bodyBg}`;
}

async function highlightCode(
  row: DiffRow,
  language: Language,
  colors: DiffColors,
  tokenize: DiffTokenizer,
): Promise<string> {
  const tokens = await tokenize(row.text, language);
  const wordBg =
    row.kind === "add"
      ? colors.bgAddW
      : row.kind === "del"
        ? colors.bgDelW
        : "";
  const bodyBg =
    row.kind === "add" ? colors.bgAdd : row.kind === "del" ? colors.bgDel : "";
  if (!row.wordRanges?.length || !wordBg) {
    return tokens
      .map((token) => ansiFg(token.color ?? DEFAULT_FG, token.content))
      .join("");
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
        output.push(
          ansiFg(
            token.color ?? DEFAULT_FG,
            token.content.slice(cursor, relativeStart),
          ),
        );
      }
      output.push(
        emphasizeWord(
          ansiFg(
            token.color ?? DEFAULT_FG,
            token.content.slice(relativeStart, relativeEnd),
          ),
          wordBg,
          bodyBg,
        ),
      );
      cursor = relativeEnd;
    }
    if (cursor < token.content.length) {
      output.push(
        ansiFg(token.color ?? DEFAULT_FG, token.content.slice(cursor)),
      );
    }
    offset = tokenEnd;
  }
  return output.join("");
}

/**
 * Tokenizes one line of code. Injected so the diff card can be exercised without
 * shiki: the running extension uses the default.
 */
export type DiffTokenizer = (
  text: string,
  language: Language,
) => Promise<HighlightToken[]>;

const shikiTokenizer: DiffTokenizer = (text, language) =>
  highlightTokens(text, language);

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
function gutterFor(
  row: DiffRow,
  numberWidth: number,
  colors: DiffColors,
): string {
  const isAdd = row.kind === "add";
  const isDel = row.kind === "del";
  const gBg = isAdd
    ? colors.bgGutterAdd
    : isDel
      ? colors.bgGutterDel
      : colors.bgBase;
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

function renderUnifiedLayout(
  rows: DiffRow[],
  code: ReadonlyMap<number, string>,
  start: number,
  width: number,
  colors: DiffColors,
): string[] {
  const numberWidth = rowNumberWidth(rows);
  const output: string[] = [];
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const highlighted = code.get(start + index) ?? row.text;
    const gutter = gutterFor(row, numberWidth, colors);
    const bodyBg = bodyBgFor(row, colors);
    const contentW = Math.max(1, width - visibleWidth(gutter));
    const fitted = fitLine(
      row.kind === "context" ? `${DIM}${highlighted}` : highlighted,
      contentW,
      "",
      0,
    );
    const pad = Math.max(0, contentW - visibleWidth(fitted));
    output.push(`${gutter}${bodyBg}${fitted}${" ".repeat(pad)}${RST}`);
  }
  return output;
}

function renderSplitLayout(
  rows: DiffRow[],
  code: ReadonlyMap<number, string>,
  start: number,
  width: number,
  colors: DiffColors,
): string[] {
  const numberWidth = rowNumberWidth(rows);
  const half = Math.floor(width / 2);
  const leftWidth = Math.max(1, half - 1);
  const rightWidth = Math.max(1, width - half - 1);
  const output: string[] = [];

  function halfLine(
    isLeft: boolean,
    row: DiffRow | undefined,
    indexInCode: number,
  ): string {
    if (!row) return " ".repeat(isLeft ? leftWidth : rightWidth);
    const highlighted = code.get(indexInCode) ?? row.text;
    const gutter = gutterFor(row, numberWidth, colors);
    const bodyBg = bodyBgFor(row, colors);
    const halfW = isLeft ? leftWidth : rightWidth;
    const gutterWidth = visibleWidth(gutter);
    const contentW = Math.max(1, halfW - gutterWidth);
    const fitted = fitLine(
      row.kind === "context" ? `${DIM}${highlighted}` : highlighted,
      contentW,
      "",
      0,
    );
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

function viewerTop(
  stats: string | undefined,
  width: number,
  theme: RenderResultTheme,
): string {
  const corner = theme.fg("dim", "┌");
  const dash = theme.fg("dim", "─");
  if (!stats || width < 10) {
    return fitLine(
      `${corner}${dash.repeat(Math.max(1, width - 2))}${theme.fg("dim", "┐")}`,
      width,
      "",
      0,
    );
  }
  const head = `${corner}${dash} ${stats} `;
  const fill = Math.max(1, width - visibleWidth(head) - 1);
  return fitLine(
    `${head}${dash.repeat(fill)}${theme.fg("dim", "┐")}`,
    width,
    "",
    0,
  );
}

function viewerFooter(
  totalLines: number,
  width: number,
  theme: RenderResultTheme,
): string {
  const label = `└─ ${totalLines} lines `;
  if (width < 4) return fitLine(theme.fg("dim", label), width, "", 0);
  const fill = Math.max(0, width - visibleWidth(label) - 1);
  return fitLine(theme.fg("dim", `${label}${"─".repeat(fill)}┘`), width, "", 0);
}

function boxed(
  lines: string[],
  width: number,
  totalLines: number,
  theme: RenderResultTheme,
  stats?: string,
): string[] {
  if (width < 4)
    return [
      ...lines.map((line) => fitLine(line, width, "", 0)),
      viewerFooter(totalLines, width, theme),
    ];
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
  private readonly tokenize!: DiffTokenizer;

  constructor(
    state: DiffState,
    path: string,
    theme: RenderResultTheme,
    expanded: boolean,
    tokenize: DiffTokenizer,
  ) {
    this.state = state;
    this.path = path;
    this.theme = theme;
    this.colors = resolveDiffColors(theme);
    this.expanded = expanded;
    this.tokenize = tokenize;
    this.ensureSource();
  }

  setExpanded(expanded: boolean): void {
    this.expanded = expanded;
  }

  /**
   * Re-render the box in the current theme; the card module's body calls this on
   * every frame.
   *
   * The host re-renders the whole transcript when the theme changes but hands
   * back the same component, so the palette has to be rebuilt here or the box on
   * screen keeps the colors it was built with. It is rebuilt on every call rather
   * than on a change of theme identity: the theme the host passes is one stable
   * object whose accessors read the live theme, so identity never changes and an
   * identity check would keep the old colors forever. Re-deriving costs a dozen
   * accessor calls. The highlighted lines come from the fixed shiki theme, not
   * from this palette, so they stay.
   */
  setTheme(theme: RenderResultTheme): void {
    this.theme = theme;
    const colors = resolveDiffColors(theme);
    // The box's top border carries the diff colors (+N -N), so it is rebuilt only
    // when they actually moved.
    if (!sameColors(colors, this.colors)) this.state.stats = undefined;
    this.colors = colors;
  }

  invalidate(): void {}

  /** The diff box: rows the Frame glues to its connector and indents. */
  render(width: number): string[] {
    // The Frame hands over the result column (its connector already subtracted),
    // which is exactly the box's width.
    const boxWidth = Math.max(1, width);
    this.ensureSource();
    const innerWidth = Math.max(1, boxWidth - 2);
    return boxed(
      this.layout(innerWidth),
      boxWidth,
      this.state.totalLines ?? 0,
      this.theme,
      this.state.stats,
    );
  }

  private ensureSource(): void {
    if (this.state.rows !== undefined) return;
    const capture = this.state.capture;
    if (!capture) {
      this.state.rows = [];
      return;
    }
    this.state.rows = addWordRanges(
      changedRows(capture.oldText, capture.newText),
    );
    this.state.totalLines = this.state.rows.length;
  }

  private highlighted(): Map<number, string> {
    return (this.state.highlighted ??= new Map());
  }

  /**
   * Tokenize the lines this window is about to draw, in bounded chunks.
   *
   * The card draws a handful of lines out of a file of any size, so highlighting
   * the whole diff costs seconds on a large file (measured at ~0.3ms per line).
   * Lines that have not arrived yet render as plain text.
   */
  private fillWindow(window: DiffWindow): void {
    const rows = this.state.rows;
    if (!rows || rows.length === 0 || this.state.highlightPending) return;

    const code = this.highlighted();
    const missing: number[] = [];
    const end = window.start + window.rows.length;
    for (let index = window.start; index < end; index += 1) {
      if (!code.has(index)) missing.push(index);
    }
    if (missing.length === 0) return;

    const batch = missing.slice(0, HIGHLIGHT_CHUNK);
    const language = languageFor(this.path);
    this.state.highlightPending = true;
    Promise.all(
      batch.map((index) =>
        rows[index]
          ? highlightCode(rows[index], language, this.colors, this.tokenize)
          : Promise.resolve(""),
      ),
    )
      .then((lines) => {
        batch.forEach((index, position) => code.set(index, lines[position]));
        this.state.invalidate?.();
      })
      .catch(() => {
        // A failing tokenizer must not retry on every frame: show plain text.
        for (const index of batch) code.set(index, rows[index]?.text ?? "");
        this.state.invalidate?.();
      })
      .finally(() => {
        this.state.highlightPending = false;
      });
  }

  private layout(innerWidth: number): string[] {
    const rows = this.state.rows;
    if (rows === undefined || rows.length === 0) {
      return [this.theme.fg("warning", "Diff unavailable after reload")];
    }
    if (
      this.state.stats === undefined &&
      rows.some((row) => row.kind !== "context")
    ) {
      this.state.stats = styleStats(rows, this.theme);
      this.state.totalLines = rows.length;
    }
    if (!rows.some((row) => row.kind !== "context")) {
      return [this.theme.fg("muted", "No changes")];
    }
    const window = this.expanded
      ? { rows, start: 0 }
      : selectCollapsedRows(rows, COLLAPSED_DIFF_LINES);
    this.fillWindow(window);

    const code = this.highlighted();
    if (code.size === 0) {
      return [this.theme.fg("muted", "Rendering diff...")];
    }
    const rendered =
      innerWidth >= SPLIT_MIN_WIDTH
        ? renderSplitLayout(
            window.rows,
            code,
            window.start,
            innerWidth,
            this.colors,
          )
        : renderUnifiedLayout(
            window.rows,
            code,
            window.start,
            innerWidth,
            this.colors,
          );
    const prefix =
      !this.expanded && window.start > 0
        ? [this.theme.fg("muted", ` ... ${window.start} earlier lines`)]
        : [];
    return [...prefix, ...rendered];
  }
}

/** The diff box as the card module sees it: a component that follows the expand
 * key and repaints when the theme changes. The card module's Frame owns the
 * header, the connector, and the column indent around it. */
export type DiffViewer = Component & {
  setExpanded(expanded: boolean): void;
  setTheme(theme: RenderResultTheme): void;
};

export function createDiffViewer(options: {
  state: DiffState;
  path: string;
  theme: RenderResultTheme;
  expanded: boolean;
  tokenize?: DiffTokenizer;
}): DiffViewer {
  return new MutationDiffViewer(
    options.state,
    options.path,
    options.theme,
    options.expanded,
    options.tokenize ?? shikiTokenizer,
  );
}

function styleStats(rows: DiffRow[], theme: RenderResultTheme): string {
  const added = rows.filter((row) => row.kind === "add").length;
  const removed = rows.filter((row) => row.kind === "del").length;
  return `${theme.fg("toolDiffAdded", `+${added}`)} ${theme.fg("toolDiffRemoved", `-${removed}`)}`;
}

function selectCollapsedRows(rows: DiffRow[], limit: number): DiffWindow {
  // Manual scan: findLastIndex needs ES2023 lib, which the extension tsconfig lacks.
  let lastChanged = -1;
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (rows[index].kind !== "context") {
      lastChanged = index;
      break;
    }
  }
  if (lastChanged < 0) return { rows: [], start: 0 };

  let start = Math.max(0, lastChanged - Math.max(1, limit) + 1);
  let end = lastChanged + 1;

  if (rows[start]?.kind === "add" && rows[start - 1]?.kind === "del") start--;
  if (rows[end - 1]?.kind === "del" && rows[end]?.kind === "add") end++;

  return { rows: rows.slice(start, end), start };
}

/** The result shape the host hands a card: text blocks plus the tool's details. */
type MutationResult = {
  content?: Array<{ type: string; text?: string }>;
  details?: unknown;
};

/**
 * The card the mutation tools hand the Frame: the path in the header, the diff
 * box in the body.
 *
 * The Frame owns the badge, the header brackets, the `└─` connector, the column
 * indent, the spinner, and the error preview; this module owns the box. A body
 * with nothing to draw (still running, failed with no diff) yields nothing and
 * the Frame's own result area stands.
 */
function mutationSpec(tokenize: DiffTokenizer): CardSpec {
  return {
    detail: (args, theme) =>
      theme.fg("accent", stringArg(args, "path", "<missing path>")),
    body: ({ args, result, options, theme, context, width }) => {
      if (!result || options.isPartial) return undefined;
      if (context.isError) {
        // No diff is drawn for a failed call, so the capture is dead weight from
        // here on.
        captures.delete(context.toolCallId);
        return undefined;
      }

      const state = (context.state as DiffState) ?? {};
      state.invalidate = context.invalidate;
      state.capture ??= captures.get(context.toolCallId);
      if (!state.capture && state.rows === undefined) {
        const nativeDiff = resultDiff((result as MutationResult).details);
        if (nativeDiff !== undefined) {
          state.rows = addWordRanges(parseDisplayDiff(nativeDiff));
          state.totalLines = state.rows.length;
        }
      }

      // The host re-renders the card on every frame (a resize, an expand, the
      // async highlight landing), so the box lives on the row and is handed the
      // theme again each time: the theme object the host passes reads the live
      // theme, so its identity never changes (see MutationDiffViewer.setTheme).
      const viewer = (state.viewer ??= createDiffViewer({
        state,
        path: stringArg(args, "path", "<missing path>"),
        theme,
        expanded: options.expanded,
        tokenize,
      }));
      viewer.setExpanded(options.expanded);
      viewer.setTheme(theme);
      captures.delete(context.toolCallId);
      return viewer.render(width);
    },
  };
}

function wrapMutation<T extends ToolDefinition<any, any, any>>(
  pi: ExtensionAPI,
  tool: T,
  cwd: string,
  tokenize: DiffTokenizer,
  capture: CaptureSource,
): T {
  const originalExecute = tool.execute;
  return toolCard(
    pi,
    {
      ...tool,
      async execute(
        toolCallId: string,
        args: ToolArgs,
        signal: AbortSignal,
        onUpdate: unknown,
        context: { cwd?: string },
      ) {
        const executionCwd = context?.cwd || cwd;
        const path = targetPath(args, executionCwd);
        // Decide before reading: the line cap can only be applied to text that is
        // already in memory, which is exactly what an oversized file must avoid.
        const worthReading =
          capture.size(path) <= MAX_CAPTURE_BYTES ||
          CAPTURE_ONLY_TOOLS.has(tool.name);
        const oldText = worthReading ? await capture.read(path) : "";
        const result = await originalExecute(
          toolCallId,
          args,
          signal,
          onUpdate as never,
          context as never,
        );
        const newText = worthReading ? await capture.read(path) : "";

        // A whole-file diff costs one row object per line. When the tool reports
        // a bounded diff of its own, a huge file uses that instead; without one
        // (write) the capture is the only source of a diff, so it is kept.
        const tooLarge =
          lineCount(oldText) > MAX_CAPTURE_LINES ||
          lineCount(newText) > MAX_CAPTURE_LINES;
        if (
          worthReading &&
          (!tooLarge || resultDiff(result?.details) === undefined)
        ) {
          captures.set(toolCallId, { oldText, newText });
        }
        return result;
      },
    } as T,
    mutationSpec(tokenize),
  );
}

export function registerPiDiff(
  pi: ExtensionAPI,
  options: { tokenize?: DiffTokenizer; capture?: CaptureSource } = {},
): void {
  const cwd = process.cwd();
  const tokenize = options.tokenize ?? shikiTokenizer;
  const capture = options.capture ?? fileCapture;
  pi.registerTool(
    wrapMutation(pi, createEditToolDefinition(cwd), cwd, tokenize, capture),
  );
  pi.registerTool(
    wrapMutation(pi, createWriteToolDefinition(cwd), cwd, tokenize, capture),
  );
  // The captures are keyed by tool call id and die with the session: released
  // through the same registry as the rest of the extension, so /reload leaves
  // nothing of the old runtime behind.
  cardLifecycle.add(() => captures.clear());
}
