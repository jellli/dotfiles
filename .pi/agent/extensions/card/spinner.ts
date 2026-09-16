import { cardLifecycle } from "./lifecycle.js";

// Breathing dot: a filled circle alternating with a small bullet - conveys
// loading without any positional motion, so it never blends into the
// box-drawing characters around it.
const SPINNER_FRAMES = ["●", "●", "•", "•"];
// The breathing dot is four frames; 140ms is still smooth, and a tick costs a
// re-render of the transcript.
const SPINNER_INTERVAL_MS = 140;

export type SpinnerState = {
  frame?: number;
  /** The row's repaint, refreshed on every render while it spins. */
  spin?: () => void;
  /** Unregisters the row from the shared tick. */
  release?: () => void;
};

/**
 * The rows spinning right now, and the one tick that advances them all.
 *
 * One interval for the process, not one per row. Concurrent tool calls would
 * otherwise tick at their own offsets, and every tick repaints the whole
 * transcript for the sake of its own row - so N running rows meant N frames per
 * interval instead of one frame in which every spinner moves, which is what a
 * shimmering screen during parallel tool calls is. The tick also always calls
 * each row's *current* repaint, where a per-row timer held on to the one it was
 * started with (the host replaces the component that owns it).
 */
const spinning = new Set<SpinnerState>();
let ticker: ReturnType<typeof setInterval> | undefined;

function tick(): void {
  // Snapshot: repainting a row may settle another one and drop it from the set.
  for (const state of [...spinning]) {
    state.frame = ((state.frame ?? 0) + 1) % SPINNER_FRAMES.length;
    state.spin?.();
  }
}

/** Advance the spinner frame while `isPartial`; call on every render. */
export function syncSpinner(
  state: SpinnerState,
  isPartial: boolean,
  invalidate: () => void,
): void {
  if (!isPartial) {
    stopSpinner(state);
    return;
  }
  state.frame ??= 0;
  state.spin = invalidate;
  if (spinning.has(state)) return;
  spinning.add(state);
  // Registered so teardown (a `/reload`) leaves nothing ticking behind.
  state.release = cardLifecycle.add(() => stopSpinner(state));
  if (!ticker) {
    // Never keeps Pi alive.
    ticker = setInterval(tick, SPINNER_INTERVAL_MS);
    ticker.unref();
  }
}

function stopSpinner(state: SpinnerState): void {
  if (!spinning.delete(state)) return;
  state.spin = undefined;
  state.release?.();
  state.release = undefined;
  if (spinning.size === 0 && ticker) {
    clearInterval(ticker);
    ticker = undefined;
  }
}

export function spinnerChar(state: SpinnerState): string {
  return SPINNER_FRAMES[state.frame ?? 0];
}
