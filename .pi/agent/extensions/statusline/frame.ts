/**
 * Animation clock for the footer cat: how often the frame advances (interval)
 * and whether it advances now. Pure - the caller owns the timer.
 *
 * Interval curve: 6000/rate, clamped to [50, 250]ms; 167ms when idle. The cat
 * therefore runs continuously, faster while tokens stream in.
 */

const SCALE_MS = 6000;
const MIN_MS = 50;
const MAX_MS = 250;
const IDLE_MS = 167;

export type FrameState = { frame: number; last: number };

export function frameInterval(speed: number | null): number {
  if (speed === null || !Number.isFinite(speed) || speed <= 0) return IDLE_MS;
  return Math.max(MIN_MS, Math.min(MAX_MS, Math.round(SCALE_MS / speed)));
}

/** Advance one frame if the interval elapsed; `frame` wraps over `frames`. */
export function advanceFrame(
  state: FrameState,
  now: number,
  speed: number | null,
  frames: number,
): { frame: number; last: number; changed: boolean } {
  if (now - state.last < frameInterval(speed)) {
    return { frame: state.frame, last: state.last, changed: false };
  }
  return { frame: (state.frame + 1) % frames, last: now, changed: true };
}
