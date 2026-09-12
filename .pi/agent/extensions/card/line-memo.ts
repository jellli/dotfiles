/**
 * Bounded text memo for render-time derivations.
 *
 * Cards re-derive the same strings on every frame (background stripping, line by
 * line, for every foreign card), so the results are memoized. Capacity is a budget
 * over the retained text rather than an entry count: an entry count has to drop
 * its oldest entry at the threshold, and a card longer than the cap then misses on
 * every frame - the cost of one card depends on the cap instead of on the card. A
 * text budget instead holds a card of any realistic length while still bounding
 * memory.
 *
 * Eviction is FIFO: the oldest entry goes first, and the newest is always kept, so
 * a line larger than the whole budget is still served on the next frame.
 */
export type TextMemo = {
  /** The memoized value for `text`; `compute` runs once per retained entry. */
  get(text: string): string;
  /** Retained entries. */
  readonly size: number;
  /** Retained text in and out, the unit the budget is counted in. */
  readonly units: number;
};

export function createTextMemo(
  budget: number,
  compute: (text: string) => string,
): TextMemo {
  const entries = new Map<string, string>();
  let units = 0;

  return {
    get(text: string): string {
      const cached = entries.get(text);
      if (cached !== undefined) return cached;

      const value = compute(text);
      entries.set(text, value);
      units += text.length + value.length;
      for (const key of entries.keys()) {
        if (units <= budget || entries.size === 1) break;
        const evicted = entries.get(key) ?? "";
        entries.delete(key);
        units -= key.length + evicted.length;
      }
      return value;
    },

    get size(): number {
      return entries.size;
    },

    get units(): number {
      return units;
    },
  };
}
