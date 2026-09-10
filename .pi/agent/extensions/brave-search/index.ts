/**
 * Brave Search web tool for pi.
 *
 * Registers a `brave_web_search` tool backed by the Brave Search web API
 * (https://api.search.brave.com/res/v1/web/search). Intended to replace
 * `ollama_web_search` once it is removed from pi-ollama-cloud; web page
 * fetching stays with `ollama_web_fetch`.
 *
 * Setup:
 *   ~/.pi/agent/brave-search/auth.json   { "apiKey": "<subscription token>" }
 *
 * The card presentation follows the tool-card language defined in
 * agent/extensions/ui (see CONTEXT.md): badge header, `└─ ` result line with
 * a muted summary when collapsed, full output on expand. Helpers are imported
 * from ../ui/lib/pi-ui.js so the cards stay visually identical; keep the two
 * extensions in sync.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  type AgentToolResult,
  type ExtensionAPI,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import type { Dispatcher } from "undici";
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

const BRAVE_BASE = "https://api.search.brave.com/res/v1/web/search";
const AUTH_PATH = join(homedir(), ".pi", "agent", "brave-search", "auth.json");
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min — enough to absorb repeat queries in a session
const SNIPPET_LIMIT = 300;
const DEFAULT_COUNT = 5;
const MAX_COUNT = 10;
const TIMEOUT_MS = 30_000;
// api.search.brave.com is unreachable directly from CN networks; requests go
// through a local proxy. Env vars win; this machine's Clash port is the fallback.
const DEFAULT_PROXY = "http://127.0.0.1:7890";

interface BraveResult {
  title: string;
  url: string;
  description: string;
}

type BraveDetails = { results: BraveResult[]; cached?: boolean };

// undici stays off the startup path; loaded on the first tool call (the
// lazy-loading pattern used by the codegraph extension).
type UndiciRuntime = typeof import("undici");
let undici: UndiciRuntime | undefined;

function loadUndici(): UndiciRuntime {
  if (!undici) {
    const require = createRequire(import.meta.url);
    undici = require("undici") as UndiciRuntime;
  }
  return undici;
}

// In-memory cache keyed by query+count; survives within a pi session only.
const cache = new Map<string, { ts: number; results: BraveResult[] }>();

let proxyAgent: InstanceType<UndiciRuntime["ProxyAgent"]> | undefined;

// undici's fetch takes a per-request dispatcher, so the proxy applies to this
// tool only — pi's other fetches (ollama, providers) keep their direct route.
function getDispatcher(): Dispatcher | undefined {
  const url =
    process.env.HTTPS_PROXY ??
    process.env.https_proxy ??
    process.env.ALL_PROXY ??
    process.env.all_proxy ??
    DEFAULT_PROXY;
  proxyAgent ??= new (loadUndici().ProxyAgent)(url);
  return proxyAgent;
}

function loadApiKey(): string | undefined {
  try {
    const parsed = JSON.parse(readFileSync(AUTH_PATH, "utf8")) as {
      apiKey?: string;
    };
    return parsed.apiKey || undefined;
  } catch {
    return undefined;
  }
}

function missingKeyMessage(): string {
  return (
    `brave_web_search is not configured: no API key found at ${AUTH_PATH}. ` +
    'Create that file with the shape {"apiKey": "<your Brave Search subscription token>"} ' +
    "(free key from https://brave.com/search/api/), then retry."
  );
}

interface BraveSearchResponse {
  web?: {
    results?: Array<{ title?: string; url?: string; description?: string }>;
  };
}

// --- Card renderers (tool-card language from extensions/ui) ---

type RenderTheme = Parameters<
  NonNullable<ToolDefinition<any, any, any>["renderCall"]>
>[1];
type RenderContext = Parameters<
  NonNullable<ToolDefinition<any, any, any>["renderCall"]>
>[2];
type RenderResultOptions = Parameters<
  NonNullable<ToolDefinition<any, any, any>["renderResult"]>
>[1];

function searchCallText(args: Record<string, unknown>, theme: UiTheme): string {
  const query = typeof args.query === "string" ? args.query : "";
  const count = typeof args.count === "number" ? args.count : undefined;
  let detail = `"${shorten(query, 48)}"`;
  if (count !== undefined) detail += ` (count ${count})`;
  return bracketDetail(theme, theme.fg("toolOutput", detail));
}

/** Muted one-line summary on the result line, e.g. `5 results · cached`. */
function searchSummary(
  result: AgentToolResult<BraveDetails>,
  theme: UiTheme,
): string {
  const details = result.details;
  const count = details?.results.length;
  if (count === undefined) return theme.fg("muted", "done");
  return theme.fg(
    "muted",
    `${count} results${details?.cached ? " · cached" : ""}`,
  );
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "brave_web_search",
    label: "Brave Web Search",
    description:
      "Search the web using the Brave Search API. " +
      `Returns up to count results (default ${DEFAULT_COUNT}, max ${MAX_COUNT}; title, URL, ${SNIPPET_LIMIT}-char snippet). ` +
      "Snippets are short — use ollama_web_fetch to read a specific URL in full. " +
      `Identical query+count calls within ${CACHE_TTL_MS / 60_000} minutes are served from an in-memory cache and marked "(cached)". ` +
      "Requires an API key at ~/.pi/agent/brave-search/auth.json.",
    parameters: Type.Object({
      query: Type.String({ description: "The search query to execute" }),
      count: Type.Optional(
        Type.Integer({
          description: `Maximum number of search results to return (default: ${DEFAULT_COUNT}, max: ${MAX_COUNT})`,
          default: DEFAULT_COUNT,
          minimum: 1,
          maximum: MAX_COUNT,
        }),
      ),
    }),
    async execute(_toolCallId, params, signal) {
      const apiKey = loadApiKey();
      if (!apiKey) {
        throw new Error(missingKeyMessage());
      }

      const count = params.count ?? DEFAULT_COUNT;
      const key = `${params.query}#${count}`;
      const cached = cache.get(key);
      if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
        return formatResults(params.query, cached.results, true);
      }

      const url = `${BRAVE_BASE}?q=${encodeURIComponent(params.query)}&count=${count}`;
      const timeout = AbortSignal.timeout(TIMEOUT_MS);
      const { fetch: braveFetch } = loadUndici();
      const res = await braveFetch(url, {
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": apiKey,
        },
        dispatcher: getDispatcher(),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        if (res.status === 429) {
          throw new Error(
            "Brave Search rate limit hit (free tier: 1 req/s, 2000 req/month). Retry in a moment.",
          );
        }
        if (res.status === 401 || res.status === 403) {
          throw new Error(
            `Brave Search rejected the API key (HTTP ${res.status}). Check the apiKey in ${AUTH_PATH}.`,
          );
        }
        throw new Error(
          `Brave Search failed: HTTP ${res.status}. ${body.slice(0, 200)}`,
        );
      }

      const data = (await res.json()) as BraveSearchResponse;
      const results: BraveResult[] = (data.web?.results ?? [])
        .slice(0, count)
        .map((r) => ({
          title: r.title ?? "(no title)",
          url: r.url ?? "",
          description: r.description ?? "",
        }));
      cache.set(key, { ts: Date.now(), results });
      return formatResults(params.query, results, false);
    },

    // Self-rendering card, same shape as the read/grep/find/ls cards in
    // extensions/ui: badge header, `└─ ` result line, muted summary collapsed,
    // full output on expand, first-line error preview.
    renderShell: "self",
    renderCall(args, theme, context) {
      const text =
        (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
      const spinner = context.state as SpinnerState;
      syncSpinner(spinner, context.isPartial, context.invalidate);
      const lines = [
        toolHeader(
          theme,
          "brave_web_search",
          searchCallText(args as Record<string, unknown>, theme as UiTheme),
        ),
      ];
      if (context.isPartial) {
        lines.push(resultLine(theme, theme.fg("muted", spinnerChar(spinner))));
      }
      text.setText(lines.join("\n"));
      return text;
    },
    renderResult(result, options, theme, context) {
      const text =
        (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
      const output = textOutput(result);

      // While streaming the header carries the spinner; once settled show the
      // outcome: muted summary collapsed, full output on expand, error preview
      // on failure.
      if (options.isPartial || !output) {
        text.setText("");
      } else if (context.isError) {
        text.setText(errorPreviewLine(theme, output, options.expanded));
      } else if (options.expanded) {
        text.setText(theme.fg("toolOutput", output));
      } else {
        text.setText(
          resultLine(
            theme,
            searchSummary(
              result as AgentToolResult<BraveDetails>,
              theme as UiTheme,
            ),
          ),
        );
      }
      return text;
    },
  });
}

function formatResults(
  query: string,
  results: BraveResult[],
  fromCache: boolean,
): {
  content: Array<{ type: "text"; text: string }>;
  details: BraveDetails;
} {
  const formatted = results
    .map((r) => {
      const snippet =
        r.description.length > SNIPPET_LIMIT
          ? r.description.slice(0, SNIPPET_LIMIT)
          : r.description;
      return `${r.title}\n   URL: ${r.url}\n   ${snippet}`;
    })
    .join("\n\n");

  const source = fromCache ? "(cached)" : `(${results.length} results)`;
  return {
    content: [
      {
        type: "text",
        text: `Results for "${query}" ${source}:\n\n${formatted || "No results found."}`,
      },
    ],
    details: { results, cached: fromCache || undefined },
  };
}
