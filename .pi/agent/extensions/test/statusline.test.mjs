// Pure-module tests for the statusline footer (speed tracker, animation clock,
// two-line view). The modules are TS sources loaded through jiti; nothing here
// touches a live session.
import assert from "node:assert/strict";
import { createTestJiti, here } from "./jiti-setup.mjs";

const jiti = createTestJiti(`${here}/..`);
const { createSpeedTracker, usageTotals } = await jiti.import(
  "../statusline/speed.ts",
);
const { advanceFrame, frameInterval } = await jiti.import(
  "../statusline/frame.ts",
);
const { footerRows } = await jiti.import("../statusline/view.ts");

const FRAMES = ["\ue900", "\ue901", "\ue902", "\ue903", "\ue904"];

/** Plain-text theme that records every colour lookup: text and colour parts of
 * an assertion stay separate, and an unexpected colour shows up as a diff. */
function fakeTheme() {
  const calls = [];
  return {
    calls,
    fg: (color, text) => {
      calls.push([color, text]);
      return text;
    },
  };
}

/** Drop SGR codes (truncateToWidth adds resets around its ellipsis). */
const plain = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");

const sortCalls = (calls) =>
  [...calls].sort(
    (a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]),
  );

function view(over = {}) {
  return {
    gitRoot: "",
    branch: "",
    usage: null,
    totals: { input: 0, output: 0 },
    speed: { streaming: false, live: null, last: null },
    phase: null,
    frame: 0,
    frames: FRAMES,
    ...over,
  };
}

// ── view: full footer ────────────────────────────────────────────
{
  const theme = fakeTheme();
  const rows = footerRows(
    view({
      gitRoot: "dotfiles",
      branch: "main",
      usage: { tokens: 40_000, window: 200_000, percent: 20 },
      totals: { input: 1234, output: 567 },
      speed: { streaming: true, live: 60, last: null },
      phase: "executing",
    }),
    200,
    theme,
  );
  assert.equal(rows.length, 2, "footer is two rows");
  assert.equal(rows[0], "", "first row is the leading blank");
  const left = "dotfiles / main \ue900 60t/s";
  const right = "▶ 执行模式 20% █░░░░░ 输入1.2k 输出567";
  assert.ok(rows[1].startsWith(`${left} `), `left side: ${rows[1]}`);
  assert.ok(rows[1].endsWith(right), `right side: ${rows[1]}`);
  assert.match(
    rows[1].slice(left.length, -right.length),
    /^ +$/,
    "the middle is padding",
  );
  assert.deepEqual(
    sortCalls(theme.calls),
    sortCalls([
      ["text", "dotfiles"],
      ["dim", " / "],
      ["muted", "main"],
      ["accent", "\ue900 "],
      ["accent", "60t/s"],
      ["accent", "▶ 执行模式"],
      ["muted", "20%"],
      ["success", "█░░░░░"],
      ["muted", "输入1.2k 输出567"],
    ]),
  );
}

// ── view: no usage, no totals, no speed, no git ──────────────────
{
  const theme = fakeTheme();
  const [blank, line] = footerRows(view(), 60, theme);
  assert.equal(blank, "");
  assert.ok(line.startsWith("\ue900 "), `line starts with the cat: ${line}`);
  assert.match(line, /\?% ░░░░░░ 输入\? 输出\?$/);
  assert.ok(!line.includes("t/s"), "no rate segment until a message ends");
  assert.deepEqual(
    sortCalls(theme.calls),
    sortCalls([
      ["accent", "\ue900 "],
      ["muted", "?%"],
      ["dim", "░░░░░░"],
      ["dim", "输入? 输出?"],
    ]),
  );
}

// ── view: phase chips ────────────────────────────────────────────
for (const [phase, chip] of [
  ["planning", ["warning", "⏸ 计划模式"]],
  ["executing", ["accent", "▶ 执行模式"]],
  ["idle", ["dim", "∘ 空闲模式"]],
]) {
  const theme = fakeTheme();
  const line = footerRows(view({ phase }), 80, theme)[1];
  assert.ok(line.includes(chip[1]), `${phase} chip text`);
  assert.ok(
    theme.calls.some(([c, t]) => c === chip[0] && t === chip[1]),
    `${phase} chip uses ${chip[0]}`,
  );
}
{
  const theme = fakeTheme();
  const line = footerRows(view({ phase: null }), 80, theme)[1];
  assert.ok(!/计划模式|执行模式|空闲模式/.test(line), "no chip when no phase");
}

// ── view: rate colouring and bar colour scale ────────────────────
{
  const theme = fakeTheme();
  const line = footerRows(
    view({ speed: { streaming: false, live: null, last: 42 } }),
    80,
    theme,
  )[1];
  assert.ok(line.includes("42t/s"), "completed rate stays visible");
  assert.deepEqual(
    theme.calls.filter(([, t]) => t === "42t/s"),
    [["muted", "42t/s"]],
  );
}
{
  // Live rate wins while streaming; last is only the fallback.
  const theme = fakeTheme();
  footerRows(
    view({ speed: { streaming: true, live: null, last: 5 } }),
    80,
    theme,
  );
  assert.deepEqual(
    theme.calls.filter(([, t]) => t.endsWith("t/s")),
    [["muted", "5t/s"]],
  );
}
for (const [tokens, color] of [
  [40_000, "success"],
  [150_000, "warning"],
  [190_000, "error"],
]) {
  const theme = fakeTheme();
  const line = footerRows(
    view({ usage: { tokens, window: 200_000, percent: null } }),
    80,
    theme,
  )[1];
  assert.ok(
    theme.calls.some(([c, t]) => c === color && /^[█░]{6}$/.test(t)),
    `${tokens}/200000 bar uses ${color}: ${JSON.stringify(theme.calls)}`,
  );
  assert.ok(
    line.includes("?%"),
    "percent falls back to ?% when the host has none",
  );
}

// ── view: width ──────────────────────────────────────────────────
{
  const args = [
    view({
      gitRoot: "dotfiles",
      branch: "feature/some-long-branch-name",
      usage: { tokens: 190_000, window: 200_000, percent: 95 },
      totals: { input: 1_234_567, output: 987_654 },
      speed: { streaming: false, live: null, last: 1234 },
      phase: "planning",
    }),
  ];
  const wide = footerRows(...args, 200, fakeTheme())[1];
  const narrow = footerRows(...args, 20, fakeTheme())[1];
  assert.ok(
    plain(narrow).length <= 20,
    `narrow line fits the width: ${plain(narrow).length}`,
  );
  assert.notEqual(narrow, wide, "narrow line is truncated");
}

// ── speed tracker ────────────────────────────────────────────────
{
  let now = 0;
  const tracker = createSpeedTracker(() => now);
  assert.deepEqual(tracker.snapshot(), {
    streaming: false,
    live: null,
    last: null,
  });

  tracker.begin();
  now = 100;
  tracker.update("hello world", undefined);
  assert.deepEqual(
    tracker.snapshot(),
    { streaming: true, live: null, last: null },
    "live stays empty below 300ms",
  );

  // Word-count estimate when the provider reports no usage.
  now = 1000;
  tracker.update("hello world", undefined);
  assert.equal(tracker.snapshot().live, 4, "2+2 words over 1s");

  // Provider delta beats the estimate: 5 words ignored, +100 tokens.
  tracker.begin(); // startTs = 1000
  now = 2000;
  tracker.update("a b c d e", 100);
  assert.equal(tracker.snapshot().live, 100, "provider output delta wins");

  // A provider number that did not move does not suppress the estimate.
  now = 3000;
  tracker.update("xy", 100);
  assert.equal(tracker.snapshot().live, 50.5, "100 + 1 word over 2s");

  tracker.end(300);
  assert.deepEqual(
    tracker.snapshot(),
    { streaming: false, live: null, last: 150 },
    "end uses finalOut (300 / 2s) and clears live",
  );

  // end without a final count falls back to the accumulated estimate.
  tracker.begin(); // startTs = 3000
  now = 4000;
  tracker.update("one two three", undefined);
  tracker.end(undefined);
  assert.equal(tracker.snapshot().last, 3, "3 tokens over 1s");

  // begin resets the previous round's counters.
  tracker.begin(); // startTs = 4000
  assert.deepEqual(
    tracker.snapshot(),
    { streaming: true, live: null, last: 3 },
    "begin clears live but keeps the last completed rate",
  );
  now = 5000;
  tracker.update("four", undefined);
  assert.equal(tracker.snapshot().live, 1, "counters restart per message");

  tracker.end(999);
  assert.equal(tracker.snapshot().last, 999, "999 is in range");
  tracker.end(5);
  assert.equal(
    tracker.snapshot().last,
    999,
    "end outside a message is ignored",
  );
}

// ── speed tracker: sanitize boundaries (dur >= 300, 0 < v < 2000) ──
for (const [finalOut, dur, expected, why] of [
  [0, 1000, null, "zero rate"],
  [-100, 1000, null, "negative rate"],
  [NaN, 1000, null, "NaN rate"],
  [2000, 1000, null, "2000 is out of range"],
  [1999, 1000, 1999, "1999 is in range"],
  [100, 250, null, "under 300ms"],
  [250, 500, 500, "300ms is enough"],
]) {
  let now = 0;
  const tracker = createSpeedTracker(() => now);
  tracker.begin();
  now = dur;
  tracker.end(finalOut);
  assert.equal(tracker.snapshot().last, expected, why);
}

// ── usageTotals ──────────────────────────────────────────────────
assert.deepEqual(usageTotals([]), { input: 0, output: 0 });
assert.deepEqual(
  usageTotals([
    {
      type: "message",
      message: { role: "assistant", usage: { input: 10, output: 20 } },
    },
    { type: "custom", customType: "plannotator", data: { phase: "idle" } },
    { type: "message", message: { role: "user", usage: { input: 9 } } },
    {
      type: "message",
      message: { role: "assistant", usage: { input: 5, output: 2 } },
    },
    { type: "message", message: { role: "assistant" } },
    null,
  ]),
  { input: 15, output: 22 },
  "assistant usage only, missing usage counts as 0",
);

// ── animation clock ──────────────────────────────────────────────
assert.equal(frameInterval(null), 167, "idle");
assert.equal(frameInterval(0), 167, "zero speed is idle");
assert.equal(frameInterval(NaN), 167, "NaN speed is idle");
assert.equal(frameInterval(60), 100);
assert.equal(frameInterval(200), 50, "clamped at the fast end");
assert.equal(frameInterval(10), 250, "clamped at the slow end");

{
  const state = { frame: 0, last: 100 };
  assert.deepEqual(
    advanceFrame(state, 100 + 99, 60, 5),
    { frame: 0, last: 100, changed: false },
    "before the interval nothing moves",
  );
  assert.deepEqual(
    advanceFrame(state, 200, 60, 5),
    { frame: 1, last: 200, changed: true },
    "the exact boundary counts as due",
  );
  assert.deepEqual(
    advanceFrame({ frame: 4, last: 0 }, 1000, 60, 5),
    { frame: 0, last: 1000, changed: true },
    "the frame index wraps",
  );
  assert.deepEqual(
    advanceFrame({ frame: 0, last: 0 }, 166, null, 5),
    { frame: 0, last: 0, changed: false },
    "idle interval is 167ms",
  );
  assert.deepEqual(
    advanceFrame({ frame: 0, last: 0 }, 167, null, 5),
    { frame: 1, last: 167, changed: true },
    "idle frame advances at 167ms",
  );
}

console.log("PASS statusline pure modules (speed / frame / view)");
