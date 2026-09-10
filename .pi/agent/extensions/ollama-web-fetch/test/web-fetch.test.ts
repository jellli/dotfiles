import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWebFetchTool } from "../index";
import { createCache, type CacheStore } from "../cache";

// The seam is the tool's public interface: execute() with the params an agent
// passes, a minimal ExtensionContext, and a stubbed Ollama API (system
// boundary). The cache store is a real temp-path store — never mocked.
type Tool = ReturnType<typeof createWebFetchTool>;
type Params = Tool["parameters"] extends never
  ? never
  : Record<string, unknown>;

const KEY = "test-key";
const fakeCtx = {
  modelRegistry: { getApiKeyForProvider: async () => KEY },
} as never;

function fetchOk(body: unknown, status = 200): ReturnType<typeof vi.fn> {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  );
}

const PAGE = {
  title: "Example Page",
  content: "a".repeat(3000) + "b".repeat(3000), // 6000 chars, two 3000-char chunks
  links: ["https://one.example", "https://two.example"],
};

let dir: string;
let store: CacheStore;
let tool: Tool;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ollama-web-fetch-exec-"));
  store = createCache({ path: join(dir, "cache.json") });
  tool = createWebFetchTool({ cacheStore: store });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ollama_web_fetch", () => {
  it("returns the title, the first 3000-char chunk and links from a live fetch", async () => {
    const fetchJson = fetchOk(PAGE);
    vi.stubGlobal("fetch", fetchJson);

    const result = await tool.execute(
      "t1",
      { url: "https://example.com" },
      undefined,
      undefined,
      fakeCtx,
    );
    const text = (result as { content: Array<{ type: string; text: string }> })
      .content[0].text;

    expect(text).toContain("Title: Example Page (6000 chars total)");
    expect(text).toContain("Chars 1-3000 of 6000 (3000 remaining):");
    expect(text).toContain("# live query");
    expect(text).toContain(
      'Continue: call ollama_web_fetch(url="https://example.com", offset=3000)',
    );
    expect(text).toContain("https://one.example");
    expect(fetchJson).toHaveBeenCalledTimes(1);
  });

  it("serves a repeat fetch of the same URL from the disk cache without a live call", async () => {
    const fetchJson = fetchOk(PAGE);
    vi.stubGlobal("fetch", fetchJson);

    await tool.execute(
      "t1",
      { url: "https://example.com" },
      undefined,
      undefined,
      fakeCtx,
    );
    const second = (await tool.execute(
      "t2",
      { url: "https://example.com" },
      undefined,
      undefined,
      fakeCtx,
    )) as {
      content: Array<{ text: string }>;
    };

    expect(fetchJson).toHaveBeenCalledTimes(1);
    expect(second.content[0].text).toContain("# from cache");
  });

  it("negative-caches a 404 for the failure TTL: the retry fails with no live call", async () => {
    const fetchJson = fetchOk({ error: "not found" }, 404);
    vi.stubGlobal("fetch", fetchJson);

    await expect(
      tool.execute(
        "t1",
        { url: "https://gone.example" },
        undefined,
        undefined,
        fakeCtx,
      ),
    ).rejects.toThrow(/Ollama Cloud fetch failed/);
    await expect(
      tool.execute(
        "t2",
        { url: "https://gone.example" },
        undefined,
        undefined,
        fakeCtx,
      ),
    ).rejects.toThrow(/Status: from cache/);
    expect(fetchJson).toHaveBeenCalledTimes(1);
  });

  it("does not negative-cache a 401: the retry after fixing auth hits the API again", async () => {
    const fetchJson = fetchOk({ error: "unauthorized" }, 401);
    vi.stubGlobal("fetch", fetchJson);

    await expect(
      tool.execute(
        "t1",
        { url: "https://auth.example" },
        undefined,
        undefined,
        fakeCtx,
      ),
    ).rejects.toThrow(/authentication error/);
    await expect(
      tool.execute(
        "t2",
        { url: "https://auth.example" },
        undefined,
        undefined,
        fakeCtx,
      ),
    ).rejects.toThrow(/live request failed \(not cached/);
    expect(fetchJson).toHaveBeenCalledTimes(2);
  });

  it("continues reading with offset and returns everything with full", async () => {
    const fetchJson = fetchOk(PAGE);
    vi.stubGlobal("fetch", fetchJson);

    const second = (await tool.execute(
      "t1",
      { url: "https://example.com", offset: 3000 },
      undefined,
      undefined,
      fakeCtx,
    )) as {
      content: Array<{ text: string }>;
    };
    expect(second.content[0].text).toContain("Chars 3001-6000 of 6000:");
    expect(second.content[0].text).not.toContain("Continue:");

    const full = (await tool.execute(
      "t2",
      { url: "https://example.com", offset: 0, full: true },
      undefined,
      undefined,
      fakeCtx,
    )) as {
      content: Array<{ text: string }>;
    };
    expect(full.content[0].text).toContain("Chars 1-6000 of 6000");
    expect(full.content[0].text).toContain("b".repeat(100));
    expect(full.content[0].text).not.toContain("Links (");
  });

  it("refresh=true bypasses the cache and re-calls the API", async () => {
    const fetchJson = fetchOk(PAGE);
    vi.stubGlobal("fetch", fetchJson);

    await tool.execute(
      "t1",
      { url: "https://example.com" },
      undefined,
      undefined,
      fakeCtx,
    );
    const refreshed = (await tool.execute(
      "t2",
      { url: "https://example.com", refresh: true },
      undefined,
      undefined,
      fakeCtx,
    )) as {
      content: Array<{ text: string }>;
    };

    expect(fetchJson).toHaveBeenCalledTimes(2);
    expect(refreshed.content[0].text).toContain("# live query");
  });
});
