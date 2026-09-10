import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createCache, type PageCacheEntry } from "../cache";

// The seam is the on-disk file + the store's public interface: entries are
// written as cache.json (the shape the tool persists), read back through
// loadCache, and aged through isFresh. No internals are poked.
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ollama-web-fetch-cache-"));
});

function seed(name: string, pages: Record<string, PageCacheEntry>): string {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify({ searches: {}, pages }), "utf8");
  return path;
}

describe("cache store freshness", () => {
  it("serves a fresh success entry and expires it after the success TTL", () => {
    const store = createCache({
      path: seed("cache.json", {
        "https://a": { ts: Date.now() - 500, title: "A", content: "x" },
      }),
      ttlMs: 1000,
      failTtlMs: 500,
    });
    expect(store.isFresh(store.loadCache().pages["https://a"])).toBe(true);

    const stale = createCache({
      path: seed("stale.json", {
        "https://a": { ts: Date.now() - 1500, title: "A", content: "x" },
      }),
      ttlMs: 1000,
      failTtlMs: 500,
    });
    expect(stale.isFresh(stale.loadCache().pages["https://a"])).toBe(false);
  });

  it("expires failure entries after the shorter failure TTL, not the success TTL", () => {
    const store = createCache({
      path: seed("fail.json", {
        "https://down": { ts: Date.now() - 600, error: "HTTP 404: not found" },
      }),
      ttlMs: 1000,
      failTtlMs: 500,
    });
    expect(store.isFresh(store.loadCache().pages["https://down"])).toBe(false);
  });
});

describe("cache store durability", () => {
  it("evicts entries beyond maxEntries, oldest first, on save", () => {
    const base = Date.now() - 10;
    const path = seed("evict.json", {
      "https://old": { ts: base, title: "old", content: "x" },
      "https://mid": { ts: base + 1, title: "mid", content: "x" },
      "https://new": { ts: base + 2, title: "new", content: "x" },
    });
    const store = createCache({
      path,
      ttlMs: 10_000,
      failTtlMs: 500,
      maxEntries: 2,
    });
    store.saveCache();
    const saved = JSON.parse(readFileSync(path, "utf8")) as {
      pages: Record<string, unknown>;
    };
    expect(Object.keys(saved.pages).sort()).toEqual([
      "https://mid",
      "https://new",
    ]);
  });

  it("degrades a corrupt cache file to an empty store instead of crashing", () => {
    const path = join(dir, "corrupt.json");
    writeFileSync(path, "{ not json", "utf8");
    const store = createCache({ path, ttlMs: 1000, failTtlMs: 500 });
    expect(store.loadCache().pages).toEqual({});
  });

  it("drops entries whose key is unsafe (prototype pollution) when loading", () => {
    // The literal __proto__ key cannot be built with an object literal (that
    // sets the prototype); the poisoned shape is written as raw JSON.
    const path = join(dir, "unsafe.json");
    writeFileSync(
      path,
      '{"pages": {"__proto__": {"ts": 0, "title": "x", "content": "x"}}}',
      "utf8",
    );
    const store = createCache({ path, ttlMs: 1000, failTtlMs: 500 });
    expect(store.loadCache().pages).toEqual({});
  });

  it("drops malformed entries when loading, keeping the well-formed ones", () => {
    const path = seed("malformed.json", {
      "https://good": { ts: Date.now(), title: "good", content: "x" },
      "https://empty": { ts: Date.now() },
      "https://badlinks": {
        ts: Date.now(),
        title: "b",
        content: "x",
        links: "not-an-array" as never,
      },
    });
    const store = createCache({ path, ttlMs: 1000, failTtlMs: 500 });
    expect(Object.keys(store.loadCache().pages)).toEqual(["https://good"]);
  });
});
