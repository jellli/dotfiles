/**
 * Teardown registry for the card module.
 *
 * `/reload` emits `session_shutdown` for the old extension runtime, re-evaluates
 * these modules, and binds the new runtime to the same host objects. Anything a
 * module patches, subscribes to, or leaves ticking outlives that boundary - a
 * listener on the host's `ExtensionRunner.prototype`, a patched render method, a
 * spinner interval - so every install registers its teardown here and the entry
 * point releases them in one place.
 *
 * One registry for the whole presentation layer: the card module itself and the
 * ui extension's host patches (the [compaction] summary, the foreign-card hub)
 * share it, so a single `disposeAll` on `session_shutdown` covers them all.
 *
 * Teardowns run newest first, each exactly once, and a failing teardown never
 * stops the rest.
 */
export type Lifecycle = {
  /** Register a teardown; the returned handle unregisters it again. */
  add(dispose: () => void): () => void;
  /** Registered teardowns. */
  readonly size: number;
  /** Run every registered teardown, newest first. */
  disposeAll(): void;
};

export function createLifecycle(): Lifecycle {
  let disposers: Array<() => void> = [];

  return {
    add(dispose: () => void): () => void {
      disposers.push(dispose);
      return () => {
        disposers = disposers.filter((entry) => entry !== dispose);
      };
    },

    get size(): number {
      return disposers.length;
    },

    disposeAll(): void {
      // Reverse first: a teardown may add or remove entries while running.
      const pending = disposers.reverse();
      disposers = [];
      for (const dispose of pending) {
        try {
          dispose();
        } catch {
          // A failing teardown must not leave the rest installed.
        }
      }
    },
  };
}

/** The registry the card module and the ui extension's host patches share. */
export const cardLifecycle = createLifecycle();
