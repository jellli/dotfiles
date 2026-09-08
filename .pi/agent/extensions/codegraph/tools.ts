/**
 * CodeGraph graph wiring for pi.
 *
 * - Project discovery walks up from cwd to the nearest directory that has a
 *   `.codegraph/` index (findNearestCodeGraphRoot), so a monorepo resolves
 *   each project's own graph.
 * - Open uses sync-on-open, so a session's first call absorbs edits made while
 *   no index was alive (git pull, another editor); watch() then keeps it fresh
 *   via native FS events. Both are cheap: unchanged re-reads are ~0.
 * - Tools never spawn the `codegraph` CLI — everything is in-process SQLite.
 */
import { createRequire } from "node:module";
import { rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { Type, type Static } from "typebox";
import { keyText } from "@earendil-works/pi-coding-agent";
import type {
  ExtensionContext,
  ExtensionAPI,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type {
  CodeGraph as CodeGraphType,
  IndexProgress,
  PendingFile,
} from "@colbymchenry/codegraph";
import type * as CodeGraphModule from "@colbymchenry/codegraph";

// The package is pure CommonJS, and a default import collapses to the
// CodeGraph class under interop (jiti/ESM). require() yields the real module
// namespace in every runtime: node ESM, jiti, plain require.
const require = createRequire(import.meta.url);
const { CodeGraph, findNearestCodeGraphRoot, isInitialized } =
  require("@colbymchenry/codegraph") as typeof CodeGraphModule;

type OpenClient = { cg: CodeGraphType; root: string };
type MissingClient = { missing: true; root: string | null };

/** Per-process cache of open graphs, keyed by project root. */
const clients = new Map<string, OpenClient>();
let closed = false;

// ---------------------------------------------------------------------------
// Prompt-facing text (tool descriptions, tool-result hints). Kept as
// constants at the top so routing instructions can be tuned in one place.
// ---------------------------------------------------------------------------

/** Shown when explore/query hits an unindexed project: init, retry, then fall back. */
const UNINDEXED_ACTION = [
  "Ask the user to run /codegraph:init (one command; afterwards the index auto-syncs on every edit).",
  "Retry this tool once the index is ready; fall back to grep/read only if init fails or the index finds nothing relevant.",
].join("\n");

const EXPLORE_DESCRIPTION =
  "Answer a code question or explore an area of the project in one call: returns the relevant symbols' verbatim source and the call paths between them from the pre-built CodeGraph index. Query is a natural-language question, feature description, or symbol name, e.g. 'how does a request reach the database', 'payment flow', 'UserService'. For impact analysis before changing a symbol (which callers would be affected, how far the change ripples through downstream code), use codegraph_impact instead. Prefer it over a grep/read crawl for codegraph-shaped questions in ANY project that has a CodeGraph index (detect via codegraph_status; the returned source counts as already read). If the project is not indexed: ask the user to run /codegraph:init once, retry this tool afterwards, and fall back to grep/read only if init fails or the index finds nothing relevant.";

const QUERY_DESCRIPTION =
  "Search symbols in the CodeGraph index (FTS5) by name or keyword: functions, classes, methods, routes, files — each with kind, qualified name, file, line, and score. Use to pin down a symbol's exact location before reading it, or when codegraph_explore is too coarse. If the project is not indexed, ask the user to run /codegraph:init first, then retry.";

const STATUS_DESCRIPTION =
  "Report the CodeGraph index health for the project: root directory, file/node/edge counts, which engine version built it, files pending sync, and watcher state. When nothing is indexed, explains how to initialize.";

const IMPACT_DESCRIPTION =
  "Trace the impact radius of a single symbol before changing it: what callers/entry points would be affected and which downstream nodes fall inside the radius, up to a configurable depth. Prefer it over manual grep/read crawling of call chains. Use codegraph_query first to pin down the exact symbol name if unsure.";

function uninitializedText(
  root: string | null,
  action = UNINDEXED_ACTION,
): string {
  return `This question is best answered from a CodeGraph index, but ${root ?? "this project"} is not indexed.\n${action}`;
}

function stringArg(
  args: Record<string, unknown>,
  key: string,
  fallback = "",
): string {
  const value = args[key];
  return typeof value === "string" ? value : fallback;
}

function numberArg(
  args: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const value = args[key];
  return typeof value === "number" ? value : fallback;
}

function shorten(value: string, max = 56): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

type ToolTheme = Parameters<
  NonNullable<ToolDefinition<any, any, any>["renderCall"]>
>[1];
type ToolContext = Parameters<
  NonNullable<ToolDefinition<any, any, any>["renderCall"]>
>[2];
type ToolRenderResult = { content: Array<{ type: string; text?: string }> };

function toolTitle(name: string): string {
  const action = name.replace(/^codegraph_/, "");
  return `CodeGraph ${action}`;
}

/** One-line summaries keep CodeGraph calls consistent with the compact tool cards. */
function toolLine(
  name: string,
  args: Record<string, unknown>,
  theme: ToolTheme,
): string {
  switch (name) {
    case "codegraph_explore":
    case "codegraph_query":
      return theme.fg(
        "toolOutput",
        shorten(stringArg(args, "query", "<missing query>")),
      );
    case "codegraph_impact":
      return theme.fg(
        "toolOutput",
        `${shorten(stringArg(args, "symbol", "<missing symbol>"), 44)} depth ${numberArg(args, "maxDepth", 3)}`,
      );
    case "codegraph_status":
      return theme.fg("toolOutput", shorten(stringArg(args, "path", ".")));
    default:
      return "";
  }
}

function resultText(result: ToolRenderResult): string {
  return result.content
    .filter((content) => content.type === "text")
    .map((content) => content.text ?? "")
    .join("\n")
    .trim();
}

const ANSI_SEQUENCE = /^\x1b\[[0-?]*[ -/]*[@-~]/;

function visibleWidth(text: string): number {
  return text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").length;
}

function fitLine(line: string, width: number): string {
  const target = Math.max(1, width);
  if (visibleWidth(line) <= target) return line;
  if (target <= 3) return ".".repeat(target);

  let result = "";
  let used = 0;
  for (let index = 0; index < line.length && used < target - 3;) {
    if (line[index] === "\x1b") {
      const escape = line.slice(index).match(ANSI_SEQUENCE)?.[0];
      if (escape) {
        result += escape;
        index += escape.length;
        continue;
      }
    }
    result += line[index++];
    used += 1;
  }
  return `${result}\x1b[0m...`;
}

function boxedResult(
  lines: string[],
  width: number,
  topLabel: string,
  bottomLabel: string,
  theme: ToolTheme,
  borderColor: "dim" | "error",
): string[] {
  const targetWidth = Math.max(1, width);
  if (targetWidth < 4) {
    return [
      ...lines.map((line) => fitLine(line, targetWidth)),
      fitLine(theme.fg(borderColor, bottomLabel), targetWidth),
    ];
  }

  const innerWidth = targetWidth - 2;
  const side = theme.fg(borderColor, "│");
  const topPrefix = `┌─ ${topLabel} `;
  const bottomPrefix = `└─ ${bottomLabel} `;
  const top = `${topPrefix}${"─".repeat(Math.max(1, targetWidth - visibleWidth(topPrefix) - 1))}┐`;
  const bottom = `${bottomPrefix}${"─".repeat(Math.max(1, targetWidth - visibleWidth(bottomPrefix) - 1))}┘`;

  return [
    fitLine(theme.fg(borderColor, top), targetWidth),
    ...lines.map(
      (line) =>
        `${side}${fitLine(line, innerWidth)}${" ".repeat(Math.max(0, innerWidth - visibleWidth(fitLine(line, innerWidth))))}${side}`,
    ),
    fitLine(theme.fg(borderColor, bottom), targetWidth),
  ];
}

class CodeGraphCallCard {
  constructor(private readonly name: string) {}

  private detail = "";
  private partial = true;
  private error = false;
  private theme!: ToolTheme;
  private context!: ToolContext;

  update(detail: string, theme: ToolTheme, context: ToolContext): void {
    this.detail = detail;
    this.theme = theme;
    this.context = context;
    this.partial = context.isPartial;
    this.error = context.isError;
  }

  invalidate(): void {}

  render(width: number): string[] {
    const marker = this.error ? "×" : this.partial ? "·" : "√";
    const markerColor = this.error
      ? "error"
      : this.partial
        ? "muted"
        : "success";
    const detail = this.detail ? ` ${this.detail}` : "";
    const line = `${this.theme.fg(markerColor, marker)} ${this.theme.fg("toolTitle", this.theme.bold(toolTitle(this.name)))}${detail}`;
    return [fitLine(line, width)];
  }
}

class CodeGraphResultCard {
  constructor(private readonly name: string) {}

  private output = "";
  private partial = true;
  private error = false;
  private expanded = false;
  private theme!: ToolTheme;
  private context!: ToolContext;

  updateResult(
    result: ToolRenderResult,
    options: { isPartial: boolean; expanded?: boolean },
    theme: ToolTheme,
    context: ToolContext,
  ): void {
    this.theme = theme;
    this.context = context;
    this.partial = options.isPartial;
    this.error = context.isError;
    this.expanded = options.expanded ?? context.expanded;
    this.output = resultText(result);
  }

  invalidate(): void {}

  render(width: number): string[] {
    const action = this.name.replace(/^codegraph_/, "");
    const lines = this.output.split("\n");
    const totalLines = lines.filter((line) => line.trim()).length;
    const borderColor = this.error ? "error" : "dim";

    if (this.partial) {
      return boxedResult(
        [this.theme.fg("muted", "  … querying graph")],
        width,
        `result · ${action}`,
        "working",
        this.theme,
        borderColor,
      );
    }

    if (this.error) {
      const message =
        this.output.split("\n").find((line) => line.trim()) ??
        "CodeGraph request failed";
      return boxedResult(
        [this.theme.fg("error", message)],
        width,
        `result · ${action}`,
        "failed",
        this.theme,
        borderColor,
      );
    }

    if (!this.output) {
      return boxedResult(
        [this.theme.fg("muted", "no results")],
        width,
        `result · ${action}`,
        "0 lines",
        this.theme,
        borderColor,
      );
    }

    const displayLines = this.expanded
      ? lines
      : lines
          .map((line) => line.trimEnd())
          .filter((line) => line.trim())
          .slice(0, 3);
    const body = displayLines.map((line) => this.theme.fg("toolOutput", line));
    const hidden = totalLines - displayLines.length;
    const hint = keyText("app.tools.expand") || "Ctrl+O";
    const footer = this.expanded
      ? `${totalLines} lines`
      : hidden > 0
        ? `${totalLines} lines · ${hint} to expand`
        : `${totalLines} lines`;

    return boxedResult(
      body,
      width,
      `result · ${action}`,
      footer,
      this.theme,
      borderColor,
    );
  }
}

function compactCodeGraphTool(
  tool: ToolDefinition<any, any, any>,
  line: (args: Record<string, unknown>, theme: ToolTheme) => string,
): ToolDefinition<any, any, any> {
  return {
    ...tool,
    renderShell: "self",
    renderCall(args: unknown, theme: ToolTheme, context: ToolContext) {
      const normalizedArgs =
        args && typeof args === "object"
          ? (args as Record<string, unknown>)
          : {};
      const card =
        context.lastComponent instanceof CodeGraphCallCard
          ? context.lastComponent
          : new CodeGraphCallCard(tool.name);
      card.update(line(normalizedArgs, theme), theme, context);
      return card;
    },
    renderResult(
      result: ToolRenderResult,
      options: { isPartial: boolean; expanded?: boolean },
      theme: ToolTheme,
      context: ToolContext,
    ) {
      const card =
        context.lastComponent instanceof CodeGraphResultCard
          ? context.lastComponent
          : new CodeGraphResultCard(tool.name);
      card.updateResult(result, options, theme, context);
      return card;
    },
  };
}

/** One-line human location for a graph node: kind name — file:line. */
function nodeLine(n: {
  kind: string;
  qualifiedName?: string;
  name: string;
  filePath?: string;
  startLine?: number;
}): string {
  return `${n.kind} ${n.qualifiedName ?? n.name} — ${n.filePath ?? "?"}:${n.startLine ?? "?"}`;
}

type ToolResult = {
  content: { type: "text"; text: string }[];
  details: Record<string, unknown>;
};

function capped(content: string): ToolResult {
  const { text: t, truncated } = truncateOutput(content);
  return {
    content: [{ type: "text" as const, text: t }],
    details: truncated ? { truncated: true } : {},
  };
}

const MAX_OUTPUT_BYTES = 50 * 1024;

/** Cap tool output to maxBytes UTF-8 bytes, appending a tail marker on
 *  truncation. The cut lands on a clean UTF-8 boundary (no broken chars).
 *  Exported for direct testing; tools go through capped() above. */
export function truncateOutput(
  content: string,
  maxBytes = MAX_OUTPUT_BYTES,
): { text: string; truncated: boolean } {
  if (Buffer.byteLength(content, "utf8") <= maxBytes) {
    return { text: content, truncated: false };
  }
  const tail = "\n\n… [truncated — output exceeded 50KB context budget]";
  const cut = maxBytes - Buffer.byteLength(tail, "utf8");
  let head = Buffer.from(content, "utf8").subarray(0, cut).toString("utf8");
  // A partial multi-byte char at the cut boundary decodes as U+FFFD; peel it.
  while (head.length > 0 && head.charCodeAt(head.length - 1) === 0xfffd) {
    head = head.slice(0, -1);
  }
  return { text: head + tail, truncated: true };
}

async function getClient(cwd: string): Promise<OpenClient | MissingClient> {
  const root = findNearestCodeGraphRoot(cwd);
  if (!root) return { missing: true, root: null };

  const cached = clients.get(root);
  if (cached) return cached;

  const cg = await CodeGraph.open(root, { sync: true });
  // Native FS watcher keeps the graph fresh while pi runs; in sandboxed
  // directories the watcher is degraded but sync-on-open still covers edits.
  cg.watch();
  const client = { cg, root };
  clients.set(root, client);
  return client;
}

/**
 * Resolve an index for ctx.cwd, auto-initializing when the project is not
 * indexed: interactive sessions ask the user first (indexing a large repo can
 * take minutes); headless sessions never auto-init and get guidance instead.
 * Returns a ready client, or guidance text when the user declined / init
 * failed / the session is non-interactive.
 */
async function resolveClient(
  ctx: ExtensionContext,
): Promise<{ client: OpenClient } | { guidance: string; root: string | null }> {
  const first = await getClient(ctx.cwd);
  if (!("missing" in first)) return { client: first };

  const root = first.root;
  const askable = typeof ctx?.ui?.confirm === "function";
  const ok =
    askable &&
    (await ctx.ui.confirm(
      "Build CodeGraph index",
      `This project is not indexed. Build a CodeGraph index for ${root ?? ctx.cwd}? This indexes the whole project once (large repos can take minutes); afterwards it auto-syncs on every edit.`,
    ));
  if (!ok) {
    return { guidance: uninitializedText(root), root };
  }

  ctx.ui.setStatus("codegraph", `indexing ${root ?? ctx.cwd}…`);
  try {
    const cg = await CodeGraph.init(root ?? ctx.cwd, {
      index: true,
      onProgress: (p: IndexProgress) =>
        ctx.ui.setStatus(
          "codegraph",
          `indexing ${root ?? ctx.cwd} — ${p.phase} ${p.current}/${p.total ?? ""}`,
        ),
    });
    cg.close();
    const client = await getClient(ctx.cwd);
    if ("missing" in client) {
      // init reported success but the root still doesn't resolve: don't
      // loop, hand back generic guidance instead.
      return { guidance: uninitializedText(client.root), root: client.root };
    }
    return { client };
  } catch (err) {
    return {
      guidance: uninitializedText(
        root,
        `Auto-init failed: ${err instanceof Error ? err.message : String(err)}. Ask the user to run /codegraph:init and retry, or fall back to grep/read.`,
      ),
      root,
    };
  } finally {
    ctx.ui.setStatus("codegraph", "");
  }
}

export function shutdown(): void {
  if (closed) return;
  closed = true;
  for (const { cg } of clients.values()) {
    try {
      cg.unwatch();
      cg.close();
    } catch {
      // best effort
    }
  }
  clients.clear();
}

/** Close and drop any cached client for `root` (a rebuild deletes that dir). */
function dropCachedClient(root: string): void {
  for (const [key, v] of [...clients]) {
    if (resolve(v.root) === resolve(root)) {
      try {
        v.cg.unwatch();
        v.cg.close();
      } catch {
        // best effort
      }
      clients.delete(key);
    }
  }
}

const ExploreSchema = Type.Object({
  query: Type.String({
    description:
      "Natural-language question, feature description, or symbol name. Examples: 'how does a request reach the database', 'payment flow', 'UserService'",
  }),
  maxNodes: Type.Optional(
    Type.Integer({
      description: "Maximum number of relevant symbols to include (default 60)",
      minimum: 5,
      maximum: 200,
    }),
  ),
});
type ExploreParams = Static<typeof ExploreSchema>;

async function explore(params: ExploreParams, ctx: ExtensionContext) {
  const query = (params.query ?? "").trim();
  if (!query) return capped("codegraph_explore: query is required.");

  const res = await resolveClient(ctx);
  if ("guidance" in res) return capped(res.guidance);
  const client = res.client;

  const markdown = String(
    await client.cg.buildContext(query, {
      maxNodes: params.maxNodes ?? 60,
      includeCode: true,
      format: "markdown",
    }),
  );

  if (markdown.trim().length < 40) {
    return capped(
      `${markdown.trim()}\n\n(CodeGraph returned no relevant symbols for this query — try codegraph_query with a symbol name, or rephrase.)`,
    );
  }
  return capped(markdown);
}

const QuerySchema = Type.Object({
  query: Type.String({
    description:
      "Symbol name or keyword to search for, e.g. 'fetchUser', 'UserService', 'router.push'",
  }),
  limit: Type.Optional(
    Type.Integer({
      description: "Maximum number of results (default 10)",
      minimum: 1,
      maximum: 50,
    }),
  ),
});
type QueryParams = Static<typeof QuerySchema>;

async function query(params: QueryParams, ctx: ExtensionContext) {
  const q = (params.query ?? "").trim();
  if (!q) return capped("codegraph_query: query is required.");

  const res = await resolveClient(ctx);
  if ("guidance" in res) return capped(res.guidance);
  const client = res.client;

  const results = client.cg.searchNodes(q, { limit: params.limit ?? 10 });
  if (results.length === 0) {
    return capped(`No symbols match "${q}" in the CodeGraph index.`);
  }

  const lines = results.map((r, i) => {
    const score =
      typeof r.score === "number" ? ` · score ${r.score.toFixed(2)}` : "";
    const sig = r.node.signature ? ` \`${r.node.signature}\`` : "";
    return `${i + 1}. **${nodeLine(r.node)}**${score}${sig}`;
  });
  return capped(`Symbols matching "${q}":\n${lines.join("\n")}`);
}

const ImpactSchema = Type.Object({
  symbol: Type.String({
    description:
      "Symbol to trace the impact radius of, e.g. 'UserService.findUser', 'router'. Must match a symbol in the index exactly (use codegraph_query to pin it down first if unsure).",
  }),
  maxDepth: Type.Optional(
    Type.Integer({
      description: "Maximum call depth to trace (default 3, max 10)",
      minimum: 1,
      maximum: 10,
    }),
  ),
});
type ImpactParams = Static<typeof ImpactSchema>;

async function impact(params: ImpactParams, ctx: ExtensionContext) {
  const symbol = (params.symbol ?? "").trim();
  if (!symbol) return capped("codegraph_impact: symbol is required.");

  const res = await resolveClient(ctx);
  if ("guidance" in res) return capped(res.guidance);
  const client = res.client;

  // Resolve the symbol to a concrete node (exact qualified/plain name first).
  // Engine qualified names use "::" (UserService::findUser); tolerate " . " / "#"
  // separators that users naturally type.
  const norm = (s: string) => s.replace(/[.#]/g, "::");
  const results = client.cg.searchNodes(symbol, { limit: 20 });
  const hit = results.find(
    (r) =>
      norm(r.node.qualifiedName ?? "") === norm(symbol) ||
      norm(r.node.name) === norm(symbol),
  );
  if (!hit) {
    if (results.length === 0) {
      return capped(`No symbol "${symbol}" in the CodeGraph index.`);
    }
    const cands = results
      .slice(0, 10)
      .map((r, i) => `${i + 1}. **${nodeLine(r.node)}**`);
    return capped(
      `No exact match for "${symbol}". Did you mean:\n${cands.join("\n")}\n(Retry with the exact qualified name, or a file:line-style hint.)`,
    );
  }

  const depth = params.maxDepth ?? 3;
  const sub = client.cg.getImpactRadius(hit.node.id, depth);
  const nodes = [...sub.nodes.values()];
  const affected = nodes.filter((n) => n.id !== hit.node.id);

  const lines = [`**Impact radius of \`${symbol}\`** (depth ≤ ${depth})`];
  const entries = sub.roots.filter((id) => id !== hit.node.id);
  if (entries.length > 0) {
    lines.push(
      "",
      "**Entry points:**",
      entries
        .map((id) => {
          const n = nodes.find((x) => x.id === id);
          return n ? `- ${nodeLine(n)}` : `- ${id}`;
        })
        .join("\n"),
    );
  }
  if (affected.length === 0) {
    lines.push(
      "",
      "No downstream callers found within this depth — safe to change.",
    );
  } else {
    lines.push(
      "",
      `**Affected nodes (${affected.length}):**`,
      affected.map((n) => `- ${nodeLine(n)}`).join("\n"),
    );
  }
  return capped(lines.join("\n"));
}

const StatusSchema = Type.Object({
  path: Type.Optional(
    Type.String({
      description:
        "Project directory to report on (defaults to the current working directory)",
    }),
  ),
});
type StatusParams = Static<typeof StatusSchema>;

async function status(params: StatusParams, ctx: ExtensionContext) {
  const scanRoot = (params.path ?? "").trim() || ctx.cwd;
  const root = findNearestCodeGraphRoot(scanRoot);
  if (!root) {
    return capped(
      `No CodeGraph index found for "${scanRoot}" (or any parent).\nRun /codegraph:init to index the project — one command, then it auto-syncs on every edit.`,
    );
  }

  // Cache-first: a live session client (with watcher) reports its true state;
  // otherwise fall back to a throwaway open (no watch), closed immediately.
  const cached = clients.get(root);
  const cg = cached ? cached.cg : await CodeGraph.open(root);
  try {
    const stats = cg.getStats();
    const build = cg.getIndexBuildInfo();
    const pending: PendingFile[] = cg.getPendingFiles();
    return capped(
      [
        `**Project:** ${root}`,
        `**Files:** ${stats.fileCount} · **Nodes:** ${stats.nodeCount} · **Edges:** ${stats.edgeCount}`,
        `**Index built by:** ${build.version ?? "unknown"} (extraction ${build.extractionVersion ?? "?"})`,
        `**Pending sync:** ${pending.length === 0 ? "none" : pending.map((p) => p.path).join(", ")}`,
        `**Watcher:** ${cg.isWatching() ? "watching" : "not started in this session"}`,
        `**Session cache:** ${clients.has(root) ? "loaded" : "lazy"}`,
      ].join("\n"),
    );
  } finally {
    if (!cached) cg.close();
  }
}

export function registerTools(pi: ExtensionAPI): void {
  pi.registerTool(
    compactCodeGraphTool(
      {
        name: "codegraph_explore",
        label: "CodeGraph explore",
        description: EXPLORE_DESCRIPTION,
        parameters: ExploreSchema,
        async execute(
          _toolCallId: string,
          params: unknown,
          _signal: AbortSignal,
          _onUpdate: unknown,
          ctx: ExtensionContext,
        ) {
          return explore(params as ExploreParams, ctx);
        },
      },
      (args, theme) => toolLine("codegraph_explore", args, theme),
    ),
  );

  pi.registerTool(
    compactCodeGraphTool(
      {
        name: "codegraph_query",
        label: "CodeGraph query",
        description: QUERY_DESCRIPTION,
        parameters: QuerySchema,
        async execute(
          _toolCallId: string,
          params: unknown,
          _signal: AbortSignal,
          _onUpdate: unknown,
          ctx: ExtensionContext,
        ) {
          return query(params as QueryParams, ctx);
        },
      },
      (args, theme) => toolLine("codegraph_query", args, theme),
    ),
  );

  pi.registerTool(
    compactCodeGraphTool(
      {
        name: "codegraph_impact",
        label: "CodeGraph impact",
        description: IMPACT_DESCRIPTION,
        parameters: ImpactSchema,
        async execute(
          _toolCallId: string,
          params: unknown,
          _signal: AbortSignal,
          _onUpdate: unknown,
          ctx: ExtensionContext,
        ) {
          return impact(params as ImpactParams, ctx);
        },
      },
      (args, theme) => toolLine("codegraph_impact", args, theme),
    ),
  );

  pi.registerTool(
    compactCodeGraphTool(
      {
        name: "codegraph_status",
        label: "CodeGraph status",
        description: STATUS_DESCRIPTION,
        parameters: StatusSchema,
        async execute(
          _toolCallId: string,
          params: unknown,
          _signal: AbortSignal,
          _onUpdate: unknown,
          ctx: ExtensionContext,
        ) {
          return status(params as StatusParams, ctx);
        },
      },
      (args, theme) => toolLine("codegraph_status", args, theme),
    ),
  );
}

export function registerInitCommand(pi: ExtensionAPI): void {
  pi.registerCommand("codegraph:init", {
    description:
      "Build the CodeGraph index for the current project (one-time per project; it auto-syncs afterwards). Optionally pass a directory argument — /codegraph:init path/to/project. Use .--force. to rebuild an existing index (destructive, asks for confirmation).",
    handler: async (args, ctx) => {
      const raw = (args ?? "").trim();
      const forceArgs = raw.split(/\s+/).filter(Boolean);
      const force = forceArgs.includes("--force");
      const target =
        forceArgs.filter((a) => a !== "--force").join(" ") || ctx.cwd;

      if (isInitialized(target)) {
        if (!force) {
          ctx.ui.notify(
            `CodeGraph is already indexed: ${target} — retry codegraph_explore now`,
            "info",
          );
          return;
        }
        // Rebuild = delete + re-index from scratch: destructive, must confirm.
        const askable = typeof ctx.ui.confirm === "function";
        const ok =
          askable &&
          (await ctx.ui.confirm(
            "Rebuild CodeGraph index",
            `This deletes the current index and re-indexes the whole project from scratch (large repos can take minutes). Rebuild the CodeGraph index for ${target}?`,
          ));
        if (!ok) {
          ctx.ui.notify(
            `CodeGraph rebuild cancelled — existing index kept for ${target}`,
            "info",
          );
          return;
        }
        dropCachedClient(target);
        rmSync(join(target, ".codegraph"), { recursive: true, force: true });
      }
      ctx.ui.setStatus("codegraph", `indexing ${target}…`);
      try {
        const cg = await CodeGraph.init(target, {
          index: true,
          onProgress: (p: IndexProgress) =>
            ctx.ui.setStatus(
              "codegraph",
              `indexing ${target} — ${p.phase} ${p.current}/${p.total ?? ""}`,
            ),
        });
        cg.close();
        ctx.ui.notify(
          force
            ? `CodeGraph re-indexed: ${target} — retry codegraph_explore now`
            : `CodeGraph indexed: ${target} — retry codegraph_explore now`,
          "info",
        );
      } catch (err) {
        ctx.ui.notify(
          `CodeGraph init failed: ${err instanceof Error ? err.message : String(err)} (you may fall back to grep/read)`,
          "error",
        );
      } finally {
        ctx.ui.setStatus("codegraph", "");
      }
    },
  });
}
