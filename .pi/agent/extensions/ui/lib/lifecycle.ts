/**
 * Teardown registry for the ui extension.
 *
 * `/reload` emits `session_shutdown` for the old extension runtime, re-evaluates
 * these modules, and binds the new runtime to the same host objects. Anything a
 * module patches or subscribes to outlives that boundary - a listener on the
 * host's `ExtensionRunner.prototype`, a patched render method - so each install
 * registers its own teardown here and the entry point releases them in one
 * place. Teardowns run newest first, each exactly once, and a failing teardown
 * never stops the rest.
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

/** The registry the ui extension's modules share. */
export const uiLifecycle = createLifecycle();
