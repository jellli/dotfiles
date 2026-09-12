import { cardLifecycle } from "./lifecycle.js";

// Breathing dot: a filled circle alternating with a small bullet - conveys
// loading without any positional motion, so it never blends into the
// box-drawing characters around it.
const SPINNER_FRAMES = ["●", "●", "•", "•"];
// The breathing dot is four frames; 140ms is still smooth, and each tick costs
// a full re-render of the transcript.
const SPINNER_INTERVAL_MS = 140;

export type SpinnerState = {
  timer?: ReturnType<typeof setInterval>;
  frame?: number;
  /** Unregisters the timer's teardown from the extension lifecycle. */
  release?: () => void;
};

/** Advance the spinner frame while `isPartial`; call on every render. */
export function syncSpinner(
  state: SpinnerState,
  isPartial: boolean,
  invalidate: () => void,
): void {
  if (isPartial) {
    state.frame ??= 0;
    if (!state.timer) {
      // Scoped to this tool execution and never keeps Pi alive.
      const timer = setInterval(() => {
        state.frame = ((state.frame ?? 0) + 1) % SPINNER_FRAMES.length;
        invalidate();
      }, SPINNER_INTERVAL_MS);
      timer.unref();
      state.timer = timer;
      // Registered so a reload while a tool is streaming does not leave the old
      // runtime's interval ticking against a transcript nobody draws.
      state.release = cardLifecycle.add(() => stopSpinner(state, timer));
    }
  } else if (state.timer) {
    stopSpinner(state, state.timer);
  }
}

function stopSpinner(
  state: SpinnerState,
  timer: ReturnType<typeof setInterval>,
): void {
  clearInterval(timer);
  if (state.timer === timer) {
    state.timer = undefined;
    state.release?.();
    state.release = undefined;
  }
}

export function spinnerChar(state: SpinnerState): string {
  return SPINNER_FRAMES[state.frame ?? 0];
}
