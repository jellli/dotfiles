// Diff card: the work is bounded by what the view draws, not by the file size.
// Run: node .pi/agent/extensions/test/pi-diff.test.mjs
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
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

console.log(
  `pi-diff: ok (asked for ${asked.length} of 3001 lines, capped file counted ${counted})`,
);
