/**
 * ollama_web_fetch for pi — local extension, decoupled from pi-ollama-cloud.
 *
 * Same API contract as the upstream tool (url/offset/full/refresh params,
 * disk cache with 24h success / 15min failure TTL at the same path) but the
 * tool card is rendered in the local pi-ui card language (see CONTEXT.md) and
 * `ollama_web_search` is gone — brave_web_search covers search.
 *
 * The tool definition is exposed as a factory (`createWebFetchTool`) so tests
 * can drive execute() with an injected cache store and a stubbed fetch.
 */
import type {
  AgentToolResult,
  ExtensionAPI,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import {
  CACHE_TTL_MS,
  type CacheStore,
  defaultCache,
  FAIL_TTL_MS,
  isSafeKey,
  type PageCacheEntry,
} from "./cache";
import {
  envInt,
  fetchJsonWithTimeout,
  getCloudApiKey,
  httpError,
} from "./utils";
import {
  bracketDetail,
  errorPreviewLine,
  resultLine,
  shorten,
  spinnerChar,
  syncSpinner,
  textOutput,
  toolHeader,
  type SpinnerState,
  type UiTheme,
} from "../ui/lib/pi-ui.js";

const WEB_TOOLS_TIMEOUT_MS = 15000;
// Fetch chunks are capped so a single call never floods the context window;
// the agent pages through long pages with offset/full.
const READ_CHUNK = envInt("PI_OLLAMA_SEARCH_CHUNK_CHARS", 3000);
const SUCCESS_TTL_HOURS = CACHE_TTL_MS / 3_600_000;
const FAIL_TTL_MINUTES = Math.round(FAIL_TTL_MS / 60_000);
const OLLAMA_BASE = "https://ollama.com";

// --- Card renderers (tool-card language from extensions/ui, see CONTEXT.md) ---

interface FetchDetails {
  title?: string;
  totalChars?: number;
  links?: string[] | null;
}

type RenderArgs = Record<string, unknown>;

type RenderTheme = Parameters<
  NonNullable<ToolDefinition<any, any, any>["renderCall"]>
>[1];
type RenderContext = Parameters<
  NonNullable<ToolDefinition<any, any, any>["renderCall"]>
>[2];
type RenderResultOptions = Parameters<
  NonNullable<ToolDefinition<any, any, any>["renderResult"]>
>[1];

type ToolResult = {
  content: Array<{ type: string; text?: string }>;
  details?: FetchDetails;
};

/** Header detail: the target URL, e.g. `[https://example.com/page]`. */
function fetchCallText(args: RenderArgs, theme: UiTheme): string {
  const url = typeof args.url === "string" ? args.url : "";
  return bracketDetail(theme, theme.fg("toolOutput", shorten(url)));
}

/** Muted one-line summary on the result line, e.g. `Example Page · 6000 chars · cached`. */
function fetchSummary(result: ToolResult, theme: UiTheme): string {
  const details = result.details;
  const parts: string[] = [];
  if (details?.title) parts.push(details.title);
  if (details?.totalChars !== undefined)
    parts.push(`${details.totalChars} chars`);
  if (parts.length === 0) return theme.fg("muted", "done");
  return theme.fg("muted", parts.join(" · "));
}

interface FetchResponse {
  title: string;
  content: string;
  links: string[] | null;
}

export interface WebFetchToolOptions {
  /** Override the disk-backed cache; tests inject a temp-path store. */
  cacheStore?: CacheStore;
}

/** Validate a parsed web_fetch response: string title/content and a links array of strings (or null). */
export function isFetchResponse(data: unknown): data is FetchResponse {
  if (data == null || typeof data !== "object") return false;
  const d = data as FetchResponse;
  return (
    typeof d.title === "string" &&
    typeof d.content === "string" &&
    (d.links === null ||
      (Array.isArray(d.links) && d.links.every((l) => typeof l === "string")))
  );
}

/** Build a failure message with likely causes and next steps (thrown, per the AgentToolResult contract). */
function fetchFailureMessage(
  url: string,
  entry: PageCacheEntry,
  failureState: "cached" | "live-cached" | "live-uncached",
): string {
  const lines = [
    `Ollama Cloud fetch failed: ${url}`,
    `API error: ${entry.error}`,
    entry.errorType === "response-shape"
      ? "Status: live request returned an unexpected response shape (not cached; the next call retries the API)"
      : failureState === "cached"
        ? `Status: from cache (failure cached for ${FAIL_TTL_MINUTES} min; pass refresh=true to force a live retry)`
        : failureState === "live-cached"
          ? `Status: live request failed (failure cached for ${FAIL_TTL_MINUTES} min; pass refresh=true to force a live retry)`
          : "Status: live request failed (not cached; the next call retries the API)",
  ];
  if (entry.status === 401 || entry.status === 403) {
    lines.push(
      "Likely cause: authentication error.",
      "Suggestion: check your API key in OLLAMA_API_KEY or auth.json, then retry (auth failures are not cached).",
    );
  } else if (entry.status === 429) {
    lines.push(
      "Likely cause: rate limited.",
      "Suggestion: try again shortly (rate-limit failures are not cached).",
    );
  } else if (entry.errorType === "response-shape") {
    lines.push(
      "Likely cause: Ollama Cloud returned an unexpected response shape.",
      "Suggestion: try again shortly; this failure is not cached.",
    );
  } else if (entry.status !== undefined && entry.status >= 500) {
    lines.push(
      "Likely cause: Ollama server error.",
      "Suggestion: try again shortly (server failures are not cached; the next call retries the API).",
    );
  } else {
    lines.push(
      "Likely cause: anti-bot / login wall, JS-rendered page, or malformed URL.",
      "Suggestion: 1) use brave_web_search for the site/topic; 2) check the URL; 3) retrying with offset/full will also fail — use refresh=true only if you believe the failure was transient.",
    );
  }
  return lines.join("\n");
}

export function createWebFetchTool(options: WebFetchToolOptions = {}) {
  const cacheStore = options.cacheStore ?? defaultCache;

  return {
    name: "ollama_web_fetch",
    label: "Ollama Web Fetch",
    description:
      "Fetch and extract text content from a web page URL using Ollama Cloud's web fetch API. " +
      `Returns the page title, a ${READ_CHUNK}-char slice of the content, and links. Pages are cached for ${SUCCESS_TTL_HOURS}h. ` +
      "Pass offset=N to continue reading from char N (the output tells you the next offset), or " +
      `full=true to get all remaining content from offset in one call. A failed URL is cached for ${FAIL_TTL_MINUTES} min ` +
      `— retrying it within the failure TTL (${FAIL_TTL_MINUTES} min) costs 0 API calls and fails the same way; pass refresh=true to ` +
      "force a live retry. Requires an Ollama Cloud API key.",
    parameters: Type.Object({
      url: Type.String({
        description: "URL to fetch and extract content from",
        format: "uri",
      }),
      offset: Type.Optional(
        Type.Integer({
          description: "Start reading from this character index (default: 0)",
          minimum: 0,
        }),
      ),
      full: Type.Optional(
        Type.Boolean({
          description:
            "Return all remaining content from offset in one call (default: false)",
        }),
      ),
      refresh: Type.Optional(
        Type.Boolean({
          description:
            "Bypass the cached page (or cached failure) and re-call the API",
        }),
      ),
    }),
    async execute(
      _toolCallId: string,
      params: {
        url: string;
        offset?: number;
        full?: boolean;
        refresh?: boolean;
      },
      signal?: AbortSignal,
      _onUpdate?: unknown,
      ctx?: unknown,
    ) {
      const apiKey = await getCloudApiKey(ctx as never);
      if (!apiKey) {
        throw new Error(
          "No Ollama Cloud API key configured. Set OLLAMA_API_KEY or add to auth.json.",
        );
      }

      const cache = cacheStore.loadCache();
      let entry = cache.pages[params.url];
      let live = false;
      let liveCacheable = false;

      if (params.refresh || !cacheStore.isFresh(entry)) {
        live = true;
        const res = await fetchJsonWithTimeout<FetchResponse>(
          `${OLLAMA_BASE}/api/web_fetch`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ url: params.url }),
          },
          WEB_TOOLS_TIMEOUT_MS,
          signal,
        );

        if (!res.ok) {
          entry = {
            ts: Date.now(),
            status: res.status,
            error: `HTTP ${res.status}: ${res.error ?? "unknown error"}`,
          };
          // Auth, rate-limit, transport (status 0: timeout, abort, DNS/connection
          // errors), and server (5xx) failures are not negative-cached: a fixed
          // key, an expired rate-limit window, or a transient server/network
          // issue should let the next retry through.
          liveCacheable =
            res.status !== 0 &&
            res.status < 500 &&
            res.status !== 401 &&
            res.status !== 403 &&
            res.status !== 429;
        } else if (!isFetchResponse(res.data)) {
          // A shape failure is a transient server-side bug, not a durable
          // property of the page; never negative-cache it.
          entry = {
            ts: Date.now(),
            error: "unexpected response shape from the API",
            errorType: "response-shape",
          };
          liveCacheable = false;
        } else {
          entry = {
            ts: Date.now(),
            title: res.data.title,
            content: res.data.content,
            links: res.data.links,
          };
          liveCacheable = true;
        }
        if (liveCacheable && isSafeKey(params.url)) {
          cache.pages[params.url] = entry;
          cacheStore.saveCache();
        }
      }

      if (entry.error) {
        throw new Error(
          fetchFailureMessage(
            params.url,
            entry,
            live ? (liveCacheable ? "live-cached" : "live-uncached") : "cached",
          ),
        );
      }

      const content = entry.content ?? "";
      const total = content.length;
      const start = params.offset ?? 0;
      const end = params.full ? total : Math.min(start + READ_CHUNK, total);
      const lines = [
        `Title: ${entry.title} (${total} chars total)`,
        start >= total
          ? "Already at the end, no more content."
          : `Chars ${start + 1}-${end} of ${total}${end < total ? ` (${total - end} remaining)` : ""}:`,
        content.slice(start, end),
      ];
      if (!params.full && end < total) {
        lines.push(
          `\nContinue: call ollama_web_fetch(url="${params.url}", offset=${end})`,
        );
      }
      if ((params.offset ?? 0) === 0 && !params.full) {
        const links = entry.links ?? [];
        lines.push(`\nLinks (${links.length}):`);
        lines.push(...links.slice(0, 10).map((l) => `  - ${l}`));
      }
      lines.push(live ? "# live query" : "# from cache");

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
        details: {
          title: entry.title,
          totalChars: total,
          links: entry.links,
        } satisfies FetchDetails,
      } satisfies AgentToolResult<FetchDetails>;
    },

    // Self-rendering card, same shape as the brave_web_search card: badge
    // header, `└─ ` result line, muted summary collapsed, full output on
    // expand, first-line error preview on failure.
    renderShell: "self" as const,
    renderCall(args: RenderArgs, theme: RenderTheme, context: RenderContext) {
      const text =
        (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
      const spinner = context.state as SpinnerState;
      syncSpinner(spinner, context.isPartial, context.invalidate);
      const lines = [
        toolHeader(
          theme as UiTheme,
          "ollama_web_fetch",
          fetchCallText(args, theme as UiTheme),
        ),
      ];
      if (context.isPartial) {
        lines.push(
          resultLine(theme as UiTheme, theme.fg("muted", spinnerChar(spinner))),
        );
      }
      text.setText(lines.join("\n"));
      return text;
    },
    renderResult(
      result: ToolResult,
      options: RenderResultOptions,
      theme: RenderTheme,
      context: RenderContext,
    ) {
      const text =
        (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
      const output = textOutput(result);
      const t = theme as UiTheme;

      // While streaming the header carries the spinner; once settled show the
      // outcome: muted summary collapsed, full output on expand, error preview
      // on failure.
      if (options.isPartial || !output) {
        text.setText("");
      } else if (context.isError) {
        text.setText(errorPreviewLine(t, output, options.expanded));
      } else if (options.expanded) {
        text.setText(t.fg("toolOutput", output));
      } else {
        text.setText(resultLine(t, fetchSummary(result, t)));
      }
      return text;
    },
  };
}

export default function (pi: ExtensionAPI) {
  pi.registerTool(createWebFetchTool());
}
