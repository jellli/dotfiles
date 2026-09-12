/**
 * Background stripping for a card that draws its own content.
 *
 * A third-party card paints its own backgrounds (a tool-call background, diff
 * highlighting); this repo's transcript already colors the row, so the SGR
 * background parameters are dropped and the foreground stays.
 *
 * Stripping runs on every re-render, for every line of every card that draws
 * itself, and the same lines come back frame after frame: 4.3us per line cold
 * against 0.054us warm (measured 2026-09-12), which is why the memo is what
 * keeps a long transcript cheap. The budget counts retained text (String#length
 * in and out, which tracks memory closely enough for sizing): 4M units is
 * roughly ten thousand rendered lines, so a card of any realistic length stays
 * cached.
 */
import { createTextMemo } from "./line-memo.js";

/**
 * Backgrounds off, foreground kept.
 *
 * A bare `\x1b[m` is a reset, not a background: it is kept, because dropping it
 * lets the colors it clears leak into every following line.
 */
function stripBackgroundUncached(text: string): string {
  return text.replace(/\x1b\[([0-9;]*)m/g, (_match, params: string) => {
    const parts = params.split(";").filter((part) => part !== "");
    if (parts.length === 0) return "\x1b[m";
    const kept: string[] = [];
    for (let index = 0; index < parts.length; index += 1) {
      const code = Number(parts[index]);
      if (code === 48) {
        // 48;5;n (256 color) or 48;2;r;g;b (truecolor)
        if (parts[index + 1] === "5") index += 2;
        else if (parts[index + 1] === "2") index += 4;
        else index += 1;
        continue;
      }
      if (code === 49) continue;
      if (code >= 40 && code <= 47) continue;
      kept.push(parts[index]);
    }
    return kept.length > 0 ? `\x1b[${kept.join(";")}m` : "";
  });
}

const STRIP_CACHE_BUDGET = 4 * 1024 * 1024;
const stripCache = createTextMemo(STRIP_CACHE_BUDGET, stripBackgroundUncached);

/** Strip backgrounds from one rendered line, memoized across re-renders. */
export function stripBackground(text: string): string {
  return stripCache.get(text);
}
