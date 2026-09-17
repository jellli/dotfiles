/**
 * Token-per-second metering for the statusline footer.
 *
 * Driven by message events only (the animation never feeds back into it):
 * `begin` on an assistant `message_start`, `update` per text/thinking delta,
 * `end` on `message_end`. `now` is injected so tests can run a fake clock.
 */

export type SpeedSnapshot = {
  streaming: boolean;
  /** Live rate while streaming; null until 300ms have elapsed. */
  live: number | null;
  /** Rate of the last completed message; persists across messages. */
  last: number | null;
};

/** Word/punctuation count, used when the provider reports no usage. */
const estimateTokens = (text: string): number => {
  if (!text) return 0;
  const m = text.match(/\w+|[^\s\w]/g);
  return m ? m.length : 0;
};

/** Live rates are shown raw; a completed rate must look plausible. */
const sanitizeTokS = (v: number, durMs: number): number | null =>
  Number.isFinite(v) && v > 0 && v < 2000 && durMs >= 300 ? v : null;

export function createSpeedTracker(now: () => number): {
  begin(): void;
  update(delta: string, usageOut: number | undefined): void;
  end(finalOut: number | undefined): void;
  snapshot(): SpeedSnapshot;
} {
  let streaming = false;
  let startTs = 0;
  let tokens = 0;
  let lastUsageOut = 0;
  let live: number | null = null;
  let last: number | null = null;

  return {
    begin() {
      streaming = true;
      startTs = now();
      tokens = 0;
      lastUsageOut = 0;
      live = null;
    },
    update(delta: string, usageOut: number | undefined) {
      if (!streaming) return;
      // Provider usage wins when it moved; otherwise estimate from the text.
      if (typeof usageOut === "number" && usageOut > lastUsageOut) {
        tokens += usageOut - lastUsageOut;
        lastUsageOut = usageOut;
      } else {
        tokens += estimateTokens(delta);
      }
      const dur = now() - startTs;
      if (dur >= 300) live = tokens / (dur / 1000);
    },
    end(finalOut: number | undefined) {
      if (!streaming) return;
      const dur = now() - startTs;
      last = sanitizeTokS((finalOut ?? tokens) / (dur / 1000), dur);
      streaming = false;
      live = null;
    },
    snapshot() {
      return { streaming, live, last };
    },
  };
}

/** Assistant usage totals across session entries (missing usage counts as 0). */
export function usageTotals(entries: readonly unknown[]): {
  input: number;
  output: number;
} {
  let input = 0;
  let output = 0;
  for (const entry of entries as any[]) {
    if (entry?.type === "message" && entry.message?.role === "assistant") {
      const usage = entry.message.usage;
      if (usage) {
        input += usage.input ?? 0;
        output += usage.output ?? 0;
      }
    }
  }
  return { input, output };
}
