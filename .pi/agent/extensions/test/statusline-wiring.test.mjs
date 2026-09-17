// Wiring tests for the statusline footer: the adapter is driven through a fake
// ExtensionAPI + fake footer host, so event -> meter -> view and the timer chain
// are checked without a live session. The pure modules are covered separately
// in statusline.test.mjs.
import assert from "node:assert/strict";
import { createTestJiti, here } from "./jiti-setup.mjs";

const jiti = createTestJiti(`${here}/..`);
const mod = await jiti.import("../statusline/index.ts");
const extension = mod.default ?? mod;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FRAMES = ["\ue900", "\ue901", "\ue902", "\ue903", "\ue904"];
/** Two frame intervals: long enough for exactly one pending timer to fire. */
const TICK = 250;

/** Theme stand-in for the host's live theme proxy: `fg` reads `mode` per call. */
function taggedTheme(mode = "a") {
  return {
    mode,
    calls: [],
    fg(color, text) {
      this.calls.push([this.mode, color, text]);
      return `\u00ab${this.mode}:${color}\u00bb${text}`;
    },
  };
}

/** Fake host: registers the footer like pi does and counts re-render requests
 * per registered component (pi disposes the previous one on re-registration). */
function harness() {
  const handlers = new Map();
  const state = {
    theme: taggedTheme(),
    component: null,
    disposals: 0,
    footers: [],
    branchHandlers: [],
    usage: { tokens: 40_000, contextWindow: 200_000, percent: 20 },
    entries: [],
  };
  const pi = {
    on: (name, cb) => handlers.set(name, [...(handlers.get(name) ?? []), cb]),
    exec: async () => ({ code: 0, stdout: "/Users/hoon/dotfiles\n" }),
  };
  const ctx = {
    cwd: "/Users/hoon/dotfiles/.pi",
    model: { contextWindow: 200_000 },
    getContextUsage: () => state.usage,
    sessionManager: { getEntries: () => state.entries },
    ui: {
      theme: state.theme,
      setFooter: (factory) => {
        if (state.component?.dispose) {
          state.component.dispose();
          state.disposals++;
        }
        const counter = { renders: 0 };
        state.component = factory(
          { requestRender: () => counter.renders++ },
          state.theme,
          {
            getGitBranch: () => "main",
            onBranchChange: (cb) => {
              state.branchHandlers.push(cb);
              return () =>
                state.branchHandlers.splice(
                  state.branchHandlers.indexOf(cb),
                  1,
                );
            },
          },
        );
        state.footers.push({ counter, component: state.component });
      },
    },
  };
  const emit = (name, event = {}) => {
    for (const cb of handlers.get(name) ?? []) cb(event);
  };
  const start = () => handlers.get("session_start")[0]({}, ctx);
  return { pi, ctx, state, emit, start };
}

// ── frame contract: one pending timer, re-armed after each frame ──
{
  const h = harness();
  extension(h.pi);
  await h.start();
  assert.ok(h.state.component, "session_start registers a footer");

  const counter = h.state.footers[0].counter;
  const before = counter.renders;
  await sleep(TICK);
  const ticks = counter.renders - before;
  assert.ok(
    ticks >= 1 && ticks <= 3,
    `${TICK}ms of idle should be ~1-2 frames, got ${ticks} (a 50ms poll would be ~5)`,
  );
  console.log(`frame clock: ${ticks} render(s) in ${TICK}ms of idle`);

  // dispose() is what /reload and session shutdown call: no timer may survive.
  h.state.component.dispose();
  const afterDispose = counter.renders;
  await sleep(TICK);
  assert.equal(counter.renders, afterDispose, "no timer survives dispose()");
  assert.equal(
    h.state.branchHandlers.length,
    0,
    "branch subscription released",
  );
  console.log("dispose: timer and branch subscription released");
}

// ── double /reload: one footer, one clock ────────────────────────
{
  const h = harness();
  extension(h.pi);
  await h.start();
  await h.start();
  assert.equal(
    h.state.disposals,
    1,
    "the previous footer was disposed on reload",
  );
  const [first, second] = h.state.footers;
  const stopped = first.counter.renders;
  await sleep(TICK);
  assert.equal(
    first.counter.renders,
    stopped,
    "the old footer's clock is gone",
  );
  assert.ok(second.counter.renders >= 1, "the new footer keeps animating");
  assert.equal(
    h.state.component.render(300).length,
    2,
    "footer is still two rows",
  );
  h.state.component.dispose();
  console.log("double /reload: one live footer, one clock");
}

// ── three speed states, totals, theme switch ─────────────────────
{
  const h = harness();
  extension(h.pi);
  await h.start();
  h.state.usage = null;

  const line = () => h.state.component.render(300)[1];
  const idle = line();
  assert.ok(!idle.includes("t/s"), `idle draws no rate: ${idle}`);
  assert.ok(
    FRAMES.some((f) => idle.includes(`\u00aba:accent\u00bb${f} `)),
    "cat is accent",
  );
  console.log("idle: cat only, no rate segment");

  h.emit("message_start", { message: { role: "assistant" } });
  await sleep(350);
  h.emit("message_update", {
    message: { role: "assistant" },
    assistantMessageEvent: {
      type: "text_delta",
      delta: "hello world hello world",
      partial: { usage: { output: 60 } },
    },
  });
  const live = line();
  assert.match(
    live,
    /\u00aba:accent\u00bb\d+t\/s/,
    `live rate is accent: ${live}`,
  );
  console.log(
    `streaming: ${/\u00aba:accent\u00bb(\d+t\/s)/.exec(live)[1]} in accent`,
  );

  h.emit("message_end", {
    message: { role: "assistant", usage: { input: 1000, output: 600 } },
  });
  const done = line();
  assert.match(
    done,
    /\u00aba:muted\u00bb\d+t\/s/,
    `completed rate is muted: ${done}`,
  );
  assert.ok(
    done.includes("\u00aba:muted\u00bb\u8f93\u51651.0k \u8f93\u51fa600"),
    `totals come from message_end: ${done}`,
  );
  console.log("ended: muted rate + incremental totals");

  // pi hands out a live theme proxy, so colours must be read per render.
  h.state.theme.mode = "b";
  const switched = line();
  assert.ok(
    FRAMES.some((f) => switched.includes(`\u00abb:accent\u00bb${f} `)),
    `theme switch recolours: ${switched}`,
  );
  assert.ok(
    !switched.includes("\u00aba:"),
    "no colour from the previous theme survives",
  );
  h.state.component.dispose();
  console.log("theme switch: colours read per render, nothing cached");
}

console.log(
  "PASS statusline wiring (frame contract, reload hygiene, three speed states)",
);
