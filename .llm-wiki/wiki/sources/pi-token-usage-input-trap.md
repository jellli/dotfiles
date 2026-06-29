---
type: source
title: "usage.input is uncached prompt delta, not context size — use ctx.getContextUsage()"
slug: pi-token-usage-input-trap
status: insight
created: 2026-06-29
updated: 2026-06-29
category: insight
---
# usage.input is uncached prompt delta, not context size — use ctx.getContextUsage()
When building any status / token-usage display for pi, use `ctx.getContextUsage()` as the source of truth for current context occupancy — not raw `usage.input` from assistant messages.

## The `usage.input` trap

`AssistantMessage.usage` (from `@earendil-works/pi-ai`) has fields:

| field | meaning |
|---|---|
| `input` | tokens in the **new (uncached) prompt** portion sent this turn |
| `cacheRead` | prompt tokens served from the cache (= prior history reused) |
| `cacheWrite` | tokens written to the cache this turn |
| `output` | tokens generated this turn |
| `totalTokens` | total context tokens for this turn (preferred over summing) |

`usage.input` is **NOT** "the prompt size" and **NOT** "current context size". It is the **uncached delta** — the portion of this turn's prompt that didn't hit the cache. Because pi caches prior turns, large history blocks land in `cacheRead` and are excluded from `input`. So per-turn `input` is frequently just a few hundred to a few thousand.

Displaying `usage.input` as "in tokens" misleads users into thinking the conversation is tiny.

## The two failure modes if you sum `usage.input` across the branch

1. **Double-counting**: `usage.input` is the **full prompt size for that turn** (includes all history up to that turn), NOT a delta. Summing it over every assistant message in the branch counts the same historical tokens N times — easily exceeding `contextWindow` and getting clamped to 100% by `Math.min`.
2. **Pre-compaction leakage**: after compaction, the branch still contains pre-compaction assistant messages with their old (large) `usage.input` values. Summing them pulls stale, no-longer-current context into the numerator.

Result: a statusline showing a stuck 100% even right after a compaction.

## Correct source: `ctx.getContextUsage()`

`ExtensionContext.getContextUsage(): ContextUsage | undefined`:

```ts
interface ContextUsage {
  tokens: number | null;     // estimated current context tokens, null right after compaction
  contextWindow: number;
  percent: number | null;    // tokens / contextWindow * 100, null if tokens unknown
}
```

Internally it uses `calculateContextTokens(usage) = usage.totalTokens || (input + output + cacheRead + cacheWrite)` from the most recent post-compaction assistant message (or `estimateContextTokens(this.messages)` as a fallback when there's no usable usage). It handles the post-compaction unknown window by returning `tokens: null`.

## Statusline display semantics (what users actually expect)

For an in/out split, the meaningful breakdown per-turn is:

- `↑` `usage.input` — this turn's **new (uncached) prompt** delta
- `↺` `usage.cacheRead` — prompt tokens **reused from cache** (= prior history)
- `↓` `usage.output` — this turn's **generated** tokens

Sanity check: `input + cacheRead ≈ current context total` (modulo output/overhead), which should track the `percent` from `getContextUsage()`. This makes the numbers self-consistent and lets users cross-validate the bar.

Skip assistant messages where `stopReason === "aborted" | "error"` or usage is all-zero — they carry no valid usage data (matches pi's internal `getAssistantUsage` filtering).

## Reference implementation

`.pi/agent/extensions/statusline.ts` footer reads `ctx.getContextUsage()` for `percent` + `contextWindow` + `tokens`, and takes the most recent non-aborted/non-zero assistant message in `ctx.sessionManager.getBranch()` for the `↑in ↺cache ↓out` split. See [[pi-custom-editor-bottom-border-vs-autocomplete]] for the related render-pipeline work in the same session.

See also pi's own example: `examples/extensions/border-status-editor.ts` uses `ctx.getContextUsage()` the same way, with a `ctx ?` fallback when `usage.percent === null`.
*Category: insight*
---
*Captured: 2026-06-29*
## Related
_Add links to related pages._