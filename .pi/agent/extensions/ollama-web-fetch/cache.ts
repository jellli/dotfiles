/**
 * Disk-backed cache for ollama_web_fetch: pages only (the web_search side of
 * the upstream pi-ollama-cloud cache is gone — brave_web_search replaced it).
 *
 * Same file path and semantics as upstream (24h success / 15min failure TTL,
 * env-overridable) so existing cache entries keep working. The old `searches`
 * map in the stored file is ignored and dropped on the next save.
 */
import { randomBytes } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { envInt } from "./utils";

export const CACHE_PATH =
  process.env.PI_OLLAMA_SEARCH_CACHE_PATH ??
  join(getAgentDir(), "cache", "pi-ollama-cloud", "cache.json");
export const CACHE_TTL_MS =
  envInt("PI_OLLAMA_SEARCH_TTL_HOURS", 24) * 60 * 60 * 1000;
export const FAIL_TTL_MS =
  envInt("PI_OLLAMA_SEARCH_FAIL_TTL_MINUTES", 15) * 60 * 1000;
/** Max entries; oldest-ts entries are evicted beyond this. */
export const MAX_ENTRIES = envInt("PI_OLLAMA_SEARCH_MAX_ENTRIES", 500);

export interface PageCacheEntry {
  ts: number;
  status?: number;
  title?: string;
  content?: string;
  links?: string[] | null;
  error?: string;
  errorType?: "response-shape";
}

export interface CacheData {
  pages: Record<string, PageCacheEntry>;
}

interface CacheOptions {
  path: string;
  ttlMs: number;
  failTtlMs: number;
  maxEntries: number;
}

/** Keys that must never come from a parsed JSON file (prototype pollution). */
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function isSafeKey(key: string): boolean {
  return !UNSAFE_KEYS.has(key);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Shallow shape checks so a partially corrupted cache file degrades instead of crashing tool calls. */
function isPageEntry(v: unknown): v is PageCacheEntry {
  if (!isRecord(v) || typeof v.ts !== "number") return false;
  const fieldsValid =
    (v.status === undefined || typeof v.status === "number") &&
    (v.title === undefined || typeof v.title === "string") &&
    (v.content === undefined || typeof v.content === "string") &&
    (v.links === null ||
      v.links === undefined ||
      (Array.isArray(v.links) &&
        v.links.every((l) => typeof l === "string"))) &&
    (v.error === undefined ||
      (typeof v.error === "string" && v.error !== "")) &&
    (v.errorType === undefined || v.errorType === "response-shape");
  if (!fieldsValid) return false;
  // Must be either a real failure or a real success; anything else (e.g. an
  // entry with neither content nor a non-empty error) would render as a fake
  // empty success.
  return (
    (typeof v.error === "string" && v.error !== "") ||
    (typeof v.title === "string" && typeof v.content === "string")
  );
}

export interface CacheStore {
  loadCache(): CacheData;
  saveCache(): void;
  isFresh(entry: { ts: number; error?: string } | undefined): boolean;
}

export function createCache(options: Partial<CacheOptions> = {}): CacheStore {
  const path = options.path ?? CACHE_PATH;
  const ttlMs = options.ttlMs ?? CACHE_TTL_MS;
  const failTtlMs = options.failTtlMs ?? FAIL_TTL_MS;
  const maxEntries = options.maxEntries ?? MAX_ENTRIES;
  let cacheData: CacheData | null = null;

  function loadCache(): CacheData {
    if (cacheData) return cacheData;
    try {
      const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
      if (isRecord(raw) && isRecord(raw.pages)) {
        // Per-entry validation: drop poisoned entries so a partially corrupt
        // file degrades to "those entries are gone" instead of crashing calls.
        // The legacy `searches` map from pi-ollama-cloud is ignored and
        // dropped on the next save — ollama_web_search no longer exists.
        cacheData = { pages: {} };
        for (const [key, entry] of Object.entries(raw.pages)) {
          if (isSafeKey(key) && isPageEntry(entry))
            cacheData.pages[key] = entry;
        }
        return cacheData;
      }
    } catch {
      // First run or corrupt file, start fresh.
    }
    cacheData = { pages: {} };
    return cacheData;
  }

  function isFresh(entry: { ts: number; error?: string } | undefined): boolean {
    if (!entry) return false;
    // A future ts (hand-edited file) would otherwise be fresh forever; treat as stale.
    if (entry.ts > Date.now()) return false;
    return Date.now() - entry.ts < (entry.error ? failTtlMs : ttlMs);
  }

  function evictOldest(map: Record<string, { ts: number }>): void {
    const keys = Object.keys(map);
    if (keys.length <= maxEntries) return;
    const overflow = keys
      .sort((a, b) => map[a].ts - map[b].ts)
      .slice(0, keys.length - maxEntries);
    for (const key of overflow) delete map[key];
  }

  function saveCache(): void {
    const data = loadCache();
    for (const [key, entry] of Object.entries(data.pages))
      if (!isFresh(entry)) delete data.pages[key];
    // TTL bounds entry age; the cap bounds entry count so an aggressive session
    // cannot grow the file without limit.
    evictOldest(data.pages);
    try {
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      // Use a unique temporary path so concurrent processes cannot overwrite
      // one another's in-progress writes.
      const tmp = `${path}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
      try {
        // 0o600: the cache stores full page content and URLs, which can embed
        // credentials in query strings; it should not be world-readable.
        writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
        renameSync(tmp, path);
        // Fix perms of a file written by a pre-0600 version.
        chmodSync(path, 0o600);
      } catch (error) {
        rmSync(tmp, { force: true });
        throw error;
      }
    } catch {
      // Cache is best-effort; a failed write must not break the tool call.
    }
  }

  return { loadCache, saveCache, isFresh };
}

export const defaultCache = createCache();
