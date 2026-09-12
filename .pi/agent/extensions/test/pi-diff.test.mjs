// Diff card: the work is bounded by what the view draws, not by the file size.
// Run: node .pi/agent/extensions/test/pi-diff.test.mjs
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestJiti, here } from "./jiti-setup.mjs";

const extensionsDir = join(here, "..");
const jiti = createTestJiti(extensionsDir);
const mod = await jiti(join(extensionsDir, "ui/pi-diff.ts"));

const plain = (text) => text.replace(/\x1b\[[0-9;]*m/g, "");
const plainLines = (lines) => lines.map((line) => plain(line).trimEnd());

// The theme is a plain object: the card only reads colors through fg/bg and the
// optional getFgAnsi/getBgAnsi accessors, which fall back to built-in colors.
const theme = {
  fg: (_color, text) => text,
  bg: (_color, text) => text,
  bold: (text) => text,
};

// A 3000-line file with one changed line, well past the collapsed window.
function bigCapture(changedAt = 1500) {
  const before = [];
  for (let index = 0; index < 3000; index += 1)
    before.push(`line ${index} of the file`);
  const after = before.slice();
  after[changedAt] = `line ${changedAt} CHANGED`;
  return { oldText: before.join("\n"), newText: after.join("\n") };
}

// --- a collapsed card only asks for the lines it draws -----------------------

const asked = [];
const tokenize = async (text) => {
  asked.push(text);
  return [{ content: text }];
};

const state = { capture: bigCapture() };
const viewer = mod.createDiffViewer({
  state,
  path: "/tmp/big-file.ts",
  theme,
  expanded: false,
  tokenize,
});

const firstFrame = plainLines(viewer.render(80));
assert.ok(
  firstFrame.join("\n").includes("Rendering diff..."),
  "the first frame says it is still rendering",
);

await new Promise((resolve) => setTimeout(resolve, 0));

const secondFrame = plainLines(viewer.render(80)).join("\n");
assert.ok(
  secondFrame.includes("line 1500 CHANGED"),
  "the changed line is drawn",
);
// The collapsed window is COLLAPSED_DIFF_LINES (8) rows, plus the deleted row of
// the replacement pair.
const WINDOW_ROWS = 9;
assert.ok(
  asked.length <= WINDOW_ROWS,
  `a collapsed card asks for at most its window, asked for ${asked.length} of 3001 lines`,
);
assert.ok(
  !asked.includes("line 0 of the file"),
  "a line far outside the window is never tokenized",
);

// --- a theme change re-renders the card without re-tokenizing it ------------

const esc = String.fromCharCode(27);
const themeUses = { a: [], b: [] };
const palette = (key, addFg, baseBg) => ({
  fg: (color, text) => {
    themeUses[key].push(color);
    return text;
  },
  bg: (_color, text) => text,
  bold: (text) => text,
  getFgAnsi: (color) => {
    if (color === "toolDiffAdded") return addFg;
    if (color === "toolDiffRemoved") return `${esc}[38;2;200;100;100m`;
    if (color === "toolDiffContext") return `${esc}[38;2;120;120;120m`;
    if (color === "dim") return `${esc}[38;2;102;92;84m`;
    return undefined;
  },
  getBgAnsi: (color) =>
    color === "toolSuccessBg" || color === "toolErrorBg" ? baseBg : undefined,
});

const firstTheme = palette("a", `${esc}[38;2;1;1;1m`, `${esc}[48;2;10;10;10m`);
const secondTheme = palette("b", `${esc}[38;2;2;2;2m`, `${esc}[48;2;20;20;20m`);

const themedState = {
  capture: { oldText: "alpha\nbeta\ngamma", newText: "alpha\nBETA\ngamma" },
};
let themedTokenized = 0;
const themedViewer = mod.createDiffViewer({
  state: themedState,
  path: "/tmp/themed.ts",
  theme: firstTheme,
  expanded: false,
  tokenize: async (text) => {
    themedTokenized += 1;
    return [{ content: text }];
  },
});

themedViewer.render(80);
await new Promise((resolve) => setTimeout(resolve, 0));
const themeBefore = themedViewer.render(80).join("\n");
assert.ok(
  themeBefore.includes(`${esc}[38;2;1;1;1m`),
  "the gutter takes the first theme's add color",
);
assert.ok(
  themeBefore.includes(`${esc}[48;2;10;10;10m`),
  "the body takes the first theme's base background",
);

const tokenizedBefore = themedTokenized;
themedViewer.setTheme(secondTheme);
const themeAfter = themedViewer.render(80).join("\n");
assert.ok(
  themeAfter.includes(`${esc}[38;2;2;2;2m`),
  "the gutter takes the new theme's add color",
);
assert.ok(
  themeAfter.includes(`${esc}[48;2;20;20;20m`),
  "the body takes the new theme's base background",
);
assert.ok(
  !themeAfter.includes(`${esc}[38;2;1;1;1m`),
  "no color of the old theme is left on screen",
);
assert.ok(themeUses.b.length > 0, "the new theme paints the box");
assert.equal(
  themedTokenized,
  tokenizedBefore,
  "a theme change does not drop the highlighted lines",
);

// --- a theme switch repaints a reused card: the host's theme object is stable --

// The host passes one theme object whose accessors read the live global theme
// (its theme module is a proxy over the current theme), so a switch changes what
// the accessors return, not the object's identity. That is why a reused card has
// to re-derive its palette on every result render.
const switchable = {
  current: "a",
  uses: { a: 0, b: 0 },
  colors: {
    a: { add: `${esc}[38;2;11;11;11m`, base: `${esc}[48;2;10;10;10m` },
    b: { add: `${esc}[38;2;22;22;22m`, base: `${esc}[48;2;20;20;20m` },
  },
};
const liveTheme = {
  fg: (_color, text) => {
    switchable.uses[switchable.current] += 1;
    return text;
  },
  bg: (_color, text) => text,
  bold: (text) => text,
  getFgAnsi: (color) => {
    if (color === "toolDiffAdded")
      return switchable.colors[switchable.current].add;
    if (color === "toolDiffRemoved") return `${esc}[38;2;200;100;100m`;
    if (color === "toolDiffContext") return `${esc}[38;2;120;120;120m`;
    if (color === "dim") return `${esc}[38;2;102;92;84m`;
    return undefined;
  },
  getBgAnsi: (color) =>
    color === "toolSuccessBg" || color === "toolErrorBg"
      ? switchable.colors[switchable.current].base
      : undefined,
};

const switchDir = mkdtempSync(join(tmpdir(), "pi-diff-theme-"));
const switchPath = join(switchDir, "themed.ts");
writeFileSync(switchPath, "alpha\nbeta\ngamma\n");

const switchTools = [];
let switchTokenized = 0;
mod.registerPiDiff(
  { registerTool: (definition) => switchTools.push(definition), on: () => {} },
  {
    tokenize: async (text) => {
      switchTokenized += 1;
      return [{ content: text }];
    },
  },
);
const switchEdit = switchTools.find((definition) => definition.name === "edit");

const switchArgs = {
  path: switchPath,
  edits: [{ oldText: "beta", newText: "BETA" }],
};
const switchContext = {
  args: switchArgs,
  toolCallId: "call-switch",
  cwd: switchDir,
  isPartial: false,
  isError: false,
  expanded: false,
  state: {},
  lastComponent: undefined,
  invalidate() {},
};
const switchResult = await switchEdit.execute(
  "call-switch",
  switchArgs,
  new AbortController().signal,
  () => {},
  { cwd: switchDir },
);
const switchOptions = { isPartial: false, expanded: false };

const firstCard = switchEdit.renderResult(
  switchResult,
  switchOptions,
  liveTheme,
  switchContext,
);
firstCard.render(80);
await new Promise((resolve) => setTimeout(resolve, 0));
const beforeSwitchFrame = firstCard.render(80).join("\n");
assert.ok(
  beforeSwitchFrame.includes(switchable.colors.a.add),
  "the gutter takes the live theme's add color",
);
assert.ok(
  beforeSwitchFrame.includes(switchable.colors.a.base),
  "the body takes the live theme's base background",
);

switchable.current = "b";
const tokenizedBeforeSwitch = switchTokenized;
const reusedCard = switchEdit.renderResult(
  switchResult,
  switchOptions,
  liveTheme,
  { ...switchContext, lastComponent: firstCard },
);
assert.equal(reusedCard, firstCard, "the host's re-render reuses the card");

const afterSwitchFrame = reusedCard.render(80).join("\n");
assert.ok(
  afterSwitchFrame.includes(switchable.colors.b.add),
  "the reused card takes the new theme's add color",
);
assert.ok(
  afterSwitchFrame.includes(switchable.colors.b.base),
  "the reused card takes the new theme's base background",
);
assert.ok(
  !afterSwitchFrame.includes(switchable.colors.a.add),
  "no color of the old theme is left on screen",
);
assert.ok(switchable.uses.b > 0, "the new palette paints the box");
assert.equal(
  switchTokenized,
  tokenizedBeforeSwitch,
  "a theme switch does not drop the highlighted lines",
);

// --- a file past the cap falls back to the diff the tool itself reports -----

const cwd = mkdtempSync(join(tmpdir(), "pi-diff-"));
const bigPath = join(cwd, "big.txt");
const bigLines = [];
for (let index = 0; index < 20000; index += 1)
  bigLines.push(`line ${index} of the file`);
writeFileSync(bigPath, `${bigLines.join("\n")}\n`);

const registered = [];
mod.registerPiDiff(
  {
    registerTool: (definition) => registered.push(definition),
    on: () => {},
  },
  { tokenize: async (text) => [{ content: text }] },
);
const edit = registered.find((definition) => definition.name === "edit");

const bigArgs = {
  path: bigPath,
  edits: [{ oldText: "line 10000 of the file", newText: "line 10000 CHANGED" }],
};
const bigContext = {
  args: bigArgs,
  toolCallId: "call-big",
  cwd,
  isPartial: false,
  isError: false,
  expanded: false,
  state: {},
  lastComponent: undefined,
  invalidate() {},
};

const bigResult = await edit.execute(
  "call-big",
  bigArgs,
  new AbortController().signal,
  () => {},
  { cwd },
);
const bigCard = edit.renderResult(
  bigResult,
  { isPartial: false, expanded: false },
  theme,
  bigContext,
);
bigCard.render(80);
await new Promise((resolve) => setTimeout(resolve, 0));

const bigFrame = plainLines(bigCard.render(80));
const bigText = bigFrame.join("\n");
assert.ok(bigText.includes("line 10000 CHANGED"), "the change is drawn");

const counted = Number(
  plain(bigFrame[bigFrame.length - 1]).match(/└─ (\d+) lines/)?.[1] ?? NaN,
);
assert.ok(
  counted > 0 && counted < 100,
  `the card counts the rows it drew, not the 20001 lines in the file (counted ${counted})`,
);

// --- an oversized file is not read twice just to show a diff ----------------

const captureCalls = { reads: 0, sizes: 0 };
const HUGE_BYTES = Math.round(9.6 * 1024 * 1024);
// What the injected source reports for the next file it is asked about.
let sizeOverride = HUGE_BYTES;

const guarded = [];
mod.registerPiDiff(
  {
    registerTool: (definition) => guarded.push(definition),
    on: () => {},
  },
  {
    tokenize: async (text) => [{ content: text }],
    capture: {
      async read(path) {
        captureCalls.reads += 1;
        try {
          // Mirrors the real source: an unreadable file is an empty capture.
          return readFileSync(path, "utf8")
            .replace(/^\uFEFF/, "")
            .replace(/\r\n/g, "\n");
        } catch {
          return "";
        }
      },
      size() {
        captureCalls.sizes += 1;
        return sizeOverride;
      },
    },
  },
);

const guardedEdit = guarded.find((definition) => definition.name === "edit");

const hugeArgs = {
  path: bigPath,
  edits: [{ oldText: "line 5000 of the file", newText: "line 5000 CHANGED" }],
};
const hugeContext = {
  args: hugeArgs,
  toolCallId: "call-huge",
  cwd,
  isPartial: false,
  isError: false,
  expanded: false,
  state: {},
  lastComponent: undefined,
  invalidate() {},
};

const hugeResult = await guardedEdit.execute(
  "call-huge",
  hugeArgs,
  new AbortController().signal,
  () => {},
  { cwd },
);
assert.ok(
  captureCalls.sizes >= 1,
  "the guard asks for the size before reading",
);
assert.equal(
  captureCalls.reads,
  0,
  "an oversized file is not read at all: the diff comes from the tool",
);

const hugeCard = guardedEdit.renderResult(
  hugeResult,
  { isPartial: false, expanded: false },
  theme,
  hugeContext,
);
hugeCard.render(80);
await new Promise((resolve) => setTimeout(resolve, 0));
const hugeFrame = plainLines(hugeCard.render(80));
assert.ok(
  hugeFrame.join("\n").includes("line 5000 CHANGED"),
  "the card still draws the change, from the diff the tool reports",
);
const hugeRows = Number(
  plain(hugeFrame[hugeFrame.length - 1]).match(/└─ (\d+) lines/)?.[1] ?? NaN,
);
assert.ok(
  hugeRows > 0 && hugeRows < 20,
  `the oversized card draws the host's bounded context, not the file (${hugeRows} rows)`,
);

// The write tool reports no diff of its own, so its capture is the only source
// and the byte guard must not drop it (ticket 04).
const guardedWrite = guarded.find((definition) => definition.name === "write");
const readsBeforeWrite = captureCalls.reads;
const writePath = join(cwd, "written.txt");
const writeArgs = { path: writePath, content: "one\ntwo\n" };
const writeResult = await guardedWrite.execute(
  "call-write",
  writeArgs,
  new AbortController().signal,
  () => {},
  { cwd },
);
assert.equal(
  captureCalls.reads - readsBeforeWrite,
  2,
  "a write still captures both sides",
);

const writeContext = {
  ...hugeContext,
  args: writeArgs,
  toolCallId: "call-write",
  state: {},
};
const writeCard = guardedWrite.renderResult(
  writeResult,
  { isPartial: false, expanded: false },
  theme,
  writeContext,
);
writeCard.render(80);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.ok(
  plainLines(writeCard.render(80)).join("\n").includes("one"),
  "and draws the diff it captured",
);

// A normal file keeps the full-context capture: the expanded card shows context
// the host's own +-4 lines would never reach.
sizeOverride = 1024;
const readsBeforeSmall = captureCalls.reads;
const smallPath = join(cwd, "small.txt");
const smallLines = [];
for (let index = 1; index <= 40; index += 1) smallLines.push(`row ${index}`);
writeFileSync(smallPath, `${smallLines.join("\n")}\n`);
const smallArgs = {
  path: smallPath,
  edits: [{ oldText: "row 30", newText: "row 30 CHANGED" }],
};
const smallResult = await guardedEdit.execute(
  "call-small",
  smallArgs,
  new AbortController().signal,
  () => {},
  { cwd },
);
assert.equal(
  captureCalls.reads - readsBeforeSmall,
  2,
  "a file under the byte budget is still read twice",
);

const smallContext = {
  ...hugeContext,
  args: smallArgs,
  toolCallId: "call-small",
  state: {},
};
const smallCard = guardedEdit.renderResult(
  smallResult,
  { isPartial: false, expanded: true },
  theme,
  smallContext,
);
smallCard.render(80);
await new Promise((resolve) => setTimeout(resolve, 0));
const smallFrame = plainLines(smallCard.render(80)).join("\n");
assert.ok(
  smallFrame.includes("row 1"),
  "the capture keeps the whole file as context",
);
assert.ok(smallFrame.includes("row 30 CHANGED"), "and shows the change");

console.log(
  `pi-diff: ok (asked for ${asked.length} of 3001 lines, capped file counted ${counted})`,
);
