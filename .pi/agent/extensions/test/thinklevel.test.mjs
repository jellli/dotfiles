// thinklevel: the judgment call and its fail-open policy.
// Run: node .pi/agent/extensions/test/thinklevel.test.mjs
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestJiti, here } from "./jiti-setup.mjs";

const extensionsDir = join(here, "..");
const jiti = createTestJiti(extensionsDir);
const mod = await jiti(join(extensionsDir, "thinklevel/index.ts"));
const {
  judge,
  LEVELS,
  collectPrior,
  resolveKey,
  formatDistribution,
  formatDecision,
  ladderFor,
} = mod;

const realFetch = globalThis.fetch;
const realKey = process.env.TYPESAFE_API_KEY;
process.env.TYPESAFE_API_KEY = "test-key";

// Keep the tests off the real key file: point at a path that does not exist.
process.env.PI_THINKLEVEL_AUTH_PATH = join(
  mkdtempSync(join(tmpdir(), "thinklevel-hermetic-")),
  "auth.json",
);

/** Stub fetch, recording the request, and hand back one canned answer. */
function stubFetch(response, { record } = {}) {
  globalThis.fetch = async (url, init) => {
    if (record) record.push({ url, init, body: JSON.parse(init.body) });
    if (typeof response === "function") return response();
    return {
      ok: true,
      status: 200,
      json: async () => response,
    };
  };
}

const answered = (choice, probabilities) => ({
  answers: { level: { choice, probabilities, confidence: 0.8 } },
});

// --- request shape ----------------------------------------------------------

const seen = [];
stubFetch(answered("low", { minimal: 0.1, low: 0.7, medium: 0.2, high: 0 }), {
  record: seen,
});
assert.partialDeepStrictEqual(
  await judge("rename this variable"),
  { level: "low", probability: 0.7, confidence: 0.8 },
  "a ladder answer is returned with its probability",
);

assert.equal(seen.length, 1, "one request per judgment");
assert.equal(seen[0].url, "https://api.typesafe.ai/v1/systemone", "endpoint");
assert.equal(seen[0].init.method, "POST", "POST");
assert.equal(
  seen[0].init.headers.Authorization,
  "Bearer test-key",
  "key is sent as a bearer token",
);
assert.equal(seen[0].body.model, "jev-latest", "default model");
assert.equal(
  seen[0].body.state,
  "rename this variable",
  "the prompt is the state",
);
assert.equal(
  seen[0].body.questions.level.type,
  "choice",
  "one choice question",
);
assert.deepEqual(
  Object.keys(seen[0].body.questions.level.criteria),
  [...LEVELS],
  "criteria are the ladder, in order",
);
assert.equal(
  seen[0].body.questions.stakes.type,
  "choice",
  "the second axis is a choice too",
);
assert.deepEqual(
  Object.keys(seen[0].body.questions.stakes.criteria),
  ["cheap", "costly", "severe"],
  "stakes options",
);
assert.ok(
  seen[0].body.questions.stakes.instructions.includes("independently"),
  "the stakes question tells the model to judge cost on its own",
);

// --- fail-open policy -------------------------------------------------------

stubFetch(answered("xhigh", { xhigh: 1 }));
assert.equal(await judge("x"), null, "an off-ladder answer is ignored");

stubFetch(() => ({ ok: false, status: 500, json: async () => ({}) }));
assert.equal(await judge("x"), null, "an HTTP error is ignored");

stubFetch(() => {
  throw new Error("network down");
});
assert.equal(await judge("x"), null, "a thrown fetch is ignored");

stubFetch(answered("low", {}));
assert.equal(await judge("   "), null, "blank input is not judged");

delete process.env.TYPESAFE_API_KEY;
assert.equal(await judge("hi"), null, "no key means no judge");
process.env.TYPESAFE_API_KEY = realKey ?? "test-key";

// --- the two axes -----------------------------------------------------------

// Both judgments come back from one call: the higher one wins, and the
// confidence reported is the one that decided the level.
const twoAxes = (level, levelP, stakes, stakesP) => ({
  answers: {
    level: {
      choice: level,
      probabilities: { [level]: levelP },
      confidence: 0.7,
    },
    stakes: {
      choice: stakes,
      probabilities: { [stakes]: stakesP },
      confidence: 0.6,
    },
  },
});

stubFetch(twoAxes("minimal", 0.9, "severe", 0.8));
assert.partialDeepStrictEqual(
  await judge("删除生产库里的那条记录"),
  { level: "high", probability: 0.8, confidence: 0.6 },
  "an expensive mistake lifts a trivial request to high",
);

stubFetch(twoAxes("high", 0.9, "cheap", 0.95));
assert.partialDeepStrictEqual(
  await judge("设计一下语义路由层"),
  { level: "high", probability: 0.9, confidence: 0.7 },
  "a cheap mistake never lowers a hard request",
);

stubFetch(twoAxes("minimal", 0.9, "costly", 0.8));
assert.equal(
  (await judge("x")).level,
  "medium",
  "a costly edit lifts minimal to medium",
);

stubFetch(twoAxes("minimal", 0.9, "catastrophic", 0.9));
assert.partialDeepStrictEqual(
  await judge("x"),
  { level: "minimal", probability: 0.9, confidence: 0.7 },
  "an off-set stakes answer is ignored, the level still stands",
);

stubFetch({
  answers: { stakes: { choice: "severe", probabilities: { severe: 1 } } },
});
assert.equal(
  await judge("x"),
  null,
  "a missing level answer is still no judgment",
);

// --- hook wiring ------------------------------------------------------------

/** Minimal ExtensionAPI stand-in: records the handlers and the level changes. */
const ORDER = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

function harness(module, start = "high", branch = [], supported) {
  let level = start;
  const sets = [];
  const handlers = {};
  const factory = module.default ?? module;
  factory({
    on: (ev, h) => {
      handlers[ev] = h;
    },
    registerCommand: (name, opts) => {
      handlers[`cmd:${name}`] = opts.handler;
    },
    getThinkingLevel: () => level,
    setThinkingLevel: (l) => {
      sets.push(l);
      if (!supported || supported.includes(l)) {
        level = l;
        return;
      }
      // Clamp the way pi does when the model's map says the level does not
      // exist: fall back to the nearest supported level at or below it.
      level =
        ORDER.slice(0, ORDER.indexOf(l) + 1)
          .reverse()
          .find((s) => supported.includes(s)) ?? supported[0];
    },
  });
  const notices = [];
  return {
    handlers,
    sets,
    signal: undefined,
    sessionManager: { getBranch: () => branch },
    notices,
    ui: {
      notify: (text, kind) => {
        notices.push([text, kind]);
      },
    },
  };
}

const stubKey = () => {
  process.env.TYPESAFE_API_KEY = "test-key";
};

stubKey();
stubFetch(answered("low", { low: 1 }));
let h = harness(mod);
await h.handlers.input({ text: "rename this", source: "interactive" }, h);
assert.deepEqual(
  h.sets,
  ["low"],
  "an interactive prompt sets the judged level",
);

h = harness(mod);
stubFetch(answered("low", { low: 1 }));
await h.handlers.input({ text: "compaction", source: "extension" }, h);
assert.deepEqual(h.sets, [], "injected messages are never judged");

h = harness(mod);
stubFetch(answered("high", { high: 1 }));
await h.handlers.input({ text: "design this", source: "interactive" }, h);
assert.deepEqual(h.sets, [], "an unchanged level is left alone");

h = harness(mod);
stubFetch(answered("xhigh", { xhigh: 1 }));
await h.handlers.input({ text: "x", source: "interactive" }, h);
assert.deepEqual(h.sets, [], "an off-ladder answer changes nothing");

h = harness(mod);
stubFetch(answered("minimal", { minimal: 1 }));
await h.handlers["cmd:thinklevel"]("auto off", h);
await h.handlers.input({ text: "hi", source: "interactive" }, h);
assert.deepEqual(h.sets, [], "/thinklevel auto off disables the judge");

// --- confidence gate --------------------------------------------------------

// A raise needs p >= 0.5; a lower needs p >= 0.8, because a wrong lower hides
// work while a wrong raise only costs tokens.

stubKey();
stubFetch(answered("low", { low: 0.4 }));
let g = harness(mod);
await g.handlers.input({ text: "x", source: "interactive" }, g);
assert.deepEqual(g.sets, [], "a 0.40 lower is not confident enough");

stubFetch(answered("low", { low: 0.6 }));
g = harness(mod);
await g.handlers.input({ text: "x", source: "interactive" }, g);
assert.deepEqual(g.sets, ["low"], "a 0.60 lower goes through");

stubFetch(answered("low", { low: 0.9 }));
g = harness(mod);
await g.handlers.input({ text: "x", source: "interactive" }, g);
assert.deepEqual(g.sets, ["low"], "a 0.90 lower goes through");

stubFetch(answered("high", { high: 0.4 }));
g = harness(mod, "minimal");
await g.handlers.input({ text: "x", source: "interactive" }, g);
assert.deepEqual(g.sets, [], "a 0.40 raise is not confident enough");

stubFetch(answered("high", { high: 0.6 }));
g = harness(mod, "minimal");
await g.handlers.input({ text: "x", source: "interactive" }, g);
assert.deepEqual(g.sets, ["high"], "a 0.60 raise goes through");

// --- continuation -----------------------------------------------------------

// A follow-up carries no task of its own: "继续" must never re-judge the level
// the ongoing work earned.
const branch = [
  {
    type: "message",
    message: { role: "user", content: "重构 card 模块的生命周期边界" },
  },
  {
    type: "message",
    message: {
      role: "assistant",
      content: [
        {
          type: "text",
          text: "我看了 card/lifecycle.ts，注册表在 reload 后丢了。",
        },
      ],
    },
  },
];

const prior = collectPrior(
  { sessionManager: { getBranch: () => branch } },
  "继续",
);
assert.deepEqual(
  prior,
  {
    latestUser: "重构 card 模块的生命周期边界",
    latestAssistant: "我看了 card/lifecycle.ts，注册表在 reload 后丢了。",
  },
  "prior context is the last user message plus the assistant tail",
);

seen.length = 0;
stubFetch(answered("minimal", { minimal: 0.9 }), { record: seen });
await judge("继续", { prior, currentLevel: "high" });
assert.equal(
  seen[0].body.state.new_message,
  "继续",
  "the new message is a state field",
);
assert.equal(
  seen[0].body.state.previous_user_message,
  "重构 card 模块的生命周期边界",
  "the previous user message is sent as state",
);
assert.equal(
  seen[0].body.state.current_thinking_level,
  "high",
  "the current level is sent as state",
);
assert.equal(
  seen[0].body.questions.continues.type,
  "noul",
  "continuation is asked as a noul",
);

// With nothing to continue the request keeps its original shape.
seen.length = 0;
stubFetch(answered("minimal", { minimal: 0.9 }), { record: seen });
await judge("ls 里有哪些文件");
assert.equal(
  typeof seen[0].body.state,
  "string",
  "no prior means the plain string state",
);
assert.equal(
  seen[0].body.questions.continues,
  undefined,
  "no prior means no continuation question",
);

// A judged continuation means "leave the level alone", whatever the level
// question thought of the bare text.
stubFetch({
  answers: {
    continues: { noul: 0.93 },
    level: {
      choice: "minimal",
      probabilities: { minimal: 0.97 },
      confidence: 0.9,
    },
  },
});
const continued = await judge("继续", { prior, currentLevel: "high" });
assert.equal(
  continued.level,
  null,
  "a continuation reports no level, meaning keep",
);
assert.equal(
  continued.decidedBy,
  "continuation",
  "and names the continuation as the reason",
);
assert.equal(continued.continues, 0.93, "with the probability that decided it");
assert.ok(
  continued.probabilities.minimal === 0.97,
  "the reading of the bare text is still reported",
);

stubFetch({
  answers: {
    continues: { noul: 0.1 },
    level: {
      choice: "minimal",
      probabilities: { minimal: 0.97 },
      confidence: 0.9,
    },
  },
});
assert.partialDeepStrictEqual(
  await judge("现在几点了", { prior, currentLevel: "high" }),
  { level: "minimal", probability: 0.97, confidence: 0.9 },
  "a different task is judged normally",
);

// End to end through the hook.
stubKey();
stubFetch({
  answers: {
    continues: { noul: 0.9 },
    level: { choice: "low", probabilities: { low: 0.9 } },
  },
});
let c = harness(mod);
c.sessionManager = { getBranch: () => branch };
await c.handlers.input({ text: "继续", source: "interactive" }, c);
assert.deepEqual(c.sets, [], "继续 after a hard task leaves the level alone");

stubFetch({
  answers: {
    continues: { noul: 0.05 },
    level: {
      choice: "minimal",
      probabilities: { minimal: 0.95 },
      confidence: 0.9,
    },
  },
});
c = harness(mod);
c.sessionManager = { getBranch: () => branch };
await c.handlers.input(
  { text: "package.json 里的 version 是多少", source: "interactive" },
  c,
);
assert.deepEqual(c.sets, ["minimal"], "a different question is still judged");

// --- startup notice ---------------------------------------------------------

// A silent extension is indistinguishable from a broken one, so startup says
// which of the two it is.
stubKey();
let s = harness(mod);
s.handlers.session_start({ reason: "startup" }, s);
assert.equal(s.notices.length, 1, "exactly one startup notice");
assert.match(s.notices[0][0], /^thinklevel on/, "says it is running");
assert.equal(s.notices[0][1], "info", "info when it can judge");

delete process.env.TYPESAFE_API_KEY;
s = harness(mod);
s.handlers.session_start({ reason: "startup" }, s);
assert.match(s.notices[0][0], /no API key/, "names the reason it cannot judge");
assert.equal(s.notices[0][1], "error", "an error when it cannot judge");
stubKey();

// --- key resolution ---------------------------------------------------------

// Env first, then the pi-local config file (same shape as brave-search's).
const keyDir = mkdtempSync(join(tmpdir(), "thinklevel-"));
const keyFile = join(keyDir, "auth.json");
process.env.PI_THINKLEVEL_AUTH_PATH = keyFile;

delete process.env.TYPESAFE_API_KEY;
assert.equal(resolveKey(), undefined, "no env and no file means no key");

writeFileSync(keyFile, JSON.stringify({ apiKey: "from-file" }));
assert.equal(
  resolveKey(),
  "from-file",
  "the file is used when the env is empty",
);

process.env.TYPESAFE_API_KEY = "from-env";
assert.equal(resolveKey(), "from-env", "the environment wins over the file");

writeFileSync(keyFile, "{ not json");
delete process.env.TYPESAFE_API_KEY;
assert.equal(
  resolveKey(),
  undefined,
  "a malformed file is ignored, not thrown",
);

writeFileSync(keyFile, JSON.stringify({ apiKey: "   " }));
assert.equal(resolveKey(), undefined, "a blank key counts as no key");

stubKey();
process.env.PI_THINKLEVEL_AUTH_PATH = join(keyDir, "missing.json");
assert.equal(
  resolveKey(),
  "test-key",
  "a missing file is fine when the env has a key",
);

// --- what it reports --------------------------------------------------------

assert.equal(
  formatDistribution({ minimal: 0.017, low: 0.71 }),
  "minimal 0.02 | low 0.71 | medium 0.00 | high 0.00",
  "the distribution lists every level, missing ones as zero",
);

const at = (level, probabilities, extra = {}) => ({
  level,
  probabilities,
  probability: probabilities[level] ?? 0,
  decidedBy: "level",
  ...extra,
});

assert.equal(
  formatDecision(at("high", { high: 0.9 }), "high", 0.5),
  "thinklevel: keep high · matches · minimal 0.00 | low 0.00 | medium 0.00 | high 0.90",
  "an unchanged level reads as keep, with the distribution",
);

assert.equal(
  formatDecision(at("low", { low: 0.71 }), "high", 0.6),
  "thinklevel: high → low · minimal 0.00 | low 0.71 | medium 0.00 | high 0.00",
  "an applied move shows the arrow",
);

assert.match(
  formatDecision(at("low", { low: 0.5 }), "high", 0.6),
  /keep high · low scored p=0\.50 below the 0\.6 floor/,
  "a blocked move says why it kept the level",
);

assert.match(
  formatDecision(
    at(
      "high",
      { high: 0.9 },
      {
        decidedBy: "stakes",
        stakes: {
          choice: "severe",
          level: "high",
          probability: 0.8,
          probabilities: { cheap: 0.1, costly: 0.1, severe: 0.8 },
        },
      },
    ),
    "minimal",
    0.5,
  ),
  /minimal → high · stakes severe \(cheap 0\.10 \| costly 0\.10 \| severe 0\.80\) · level \(minimal 0\.00 \| low 0\.00 \| medium 0\.00 \| high 0\.90\)/,
  "a stakes-driven raise shows both distributions",
);

assert.match(
  formatDecision(
    {
      level: null,
      probabilities: { minimal: 0.97 },
      probability: 0,
      continues: 0.97,
      decidedBy: "continuation",
    },
    "high",
  ),
  /keep high · continues p=0\.97/,
  "a continuation reports the continuation probability",
);

// Every decision is announced, not only the changes.
stubKey();
stubFetch(answered("high", { high: 0.9 }));
let n = harness(mod);
await n.handlers.input({ text: "设计一下", source: "interactive" }, n);
assert.deepEqual(n.sets, [], "no move when the judged level matches");
assert.equal(n.notices.length, 1, "but the decision is still reported");
assert.match(
  n.notices[0][0],
  /matches · minimal 0\.00/,
  "with the distribution",
);

stubFetch({
  answers: {
    continues: { noul: 0.97 },
    level: { choice: "minimal", probabilities: { minimal: 0.97 } },
  },
});
n = harness(mod);
n.sessionManager = { getBranch: () => branch };
await n.handlers.input({ text: "继续", source: "interactive" }, n);
assert.deepEqual(n.sets, [], "a continuation does not move the level");
assert.match(n.notices[0][0], /keep high · continues p=0\.97/, "and says so");

// --- switches ---------------------------------------------------------------

// `/thinklevel notify off` silences the reports but keeps the judging.
stubKey();
stubFetch(answered("minimal", { minimal: 0.95 }));
let sw = harness(mod);
await sw.handlers["cmd:thinklevel"]("notify off", sw);
assert.equal(
  sw.notices.at(-1)[0],
  "notify off · thinklevel: auto on, notify off",
  "the command confirms what it changed",
);
await sw.handlers.input({ text: "ls 里有哪些文件", source: "interactive" }, sw);
assert.deepEqual(
  sw.sets,
  ["minimal"],
  "judging continues with notifications off",
);
assert.equal(sw.notices.length, 1, "but nothing else is reported");

// `/thinklevel auto off` stops the judging entirely.
await sw.handlers["cmd:thinklevel"]("auto off", sw);
let called = false;
stubFetch(() => {
  called = true;
  throw new Error("the API must not be called");
});
await sw.handlers.input({ text: "ls 里有哪些文件", source: "interactive" }, sw);
assert.equal(called, false, "auto off never calls the API");
assert.deepEqual(sw.sets, ["minimal"], "and never moves the level");

// Bare `/thinklevel` reports where both switches stand.
await sw.handlers["cmd:thinklevel"]("", sw);
assert.equal(
  sw.notices.at(-1)[0],
  "thinklevel: auto off, notify off",
  "the bare command shows status",
);

// `on|off` on its own still means the judge, as it did before the switches.
await sw.handlers["cmd:thinklevel"]("on", sw);
assert.equal(
  sw.notices.at(-1)[0],
  "auto on · thinklevel: auto on, notify off",
  "bare on|off keeps meaning the judge",
);

// --- /thinklevel last -------------------------------------------------------

// Notifications scroll away, so the last judgment can be brought back.
stubKey();
stubFetch(answered("minimal", { minimal: 0.93 }));
let le = harness(mod);
await le.handlers.input({ text: "ls 里有哪些文件", source: "interactive" }, le);
await le.handlers["cmd:thinklevel"]("last", le);
const replayed = le.notices.at(-1)[0];
assert.match(
  replayed,
  /^thinklevel last · "ls 里有哪些文件" · high → minimal/,
  "replays the decision with its prompt",
);
assert.match(replayed, /minimal 0\.93/, "including the distribution");

// The point of the command: it still works after notifications are silenced.
await le.handlers["cmd:thinklevel"]("notify off", le);
const quietFrom = le.notices.length;
stubFetch(answered("low", { low: 0.8 }));
await le.handlers.input(
  { text: "把这个函数拆成两个", source: "interactive" },
  le,
);
assert.equal(le.notices.length, quietFrom, "no decision notice while silenced");
await le.handlers["cmd:thinklevel"]("last", le);
assert.match(
  le.notices.at(-1)[0],
  /minimal → low/,
  "but the decision is still retrievable after being silenced",
);

// A failure is worth replaying too: it is why nothing happened.
stubFetch(() => ({ ok: false, status: 429, json: async () => ({}) }));
await le.handlers.input({ text: "随便问点什么", source: "interactive" }, le);
await le.handlers["cmd:thinklevel"]("last", le);
assert.match(
  le.notices.at(-1)[0],
  /no judgment: HTTP 429/,
  "a failure says what went wrong",
);

// A stakes answer only overrides the level answer when it is sure enough.
// The observed bug: "costly" at p=0.53 (a coin flip) outranked a confident
// "minimal" at p=0.58 just by being the higher tier.
stubFetch(twoAxes("minimal", 0.58, "costly", 0.53));
assert.partialDeepStrictEqual(
  await judge("顺手把这个函数拆开"),
  { level: "minimal", probability: 0.58, decidedBy: "level" },
  "a 0.53 costly does not override a 0.58 minimal",
);

stubFetch(twoAxes("minimal", 0.58, "costly", 0.72));
assert.partialDeepStrictEqual(
  await judge("改一下共享模块的导出"),
  { level: "medium", decidedBy: "stakes" },
  "a sure costly still lifts minimal to medium",
);

stubFetch(twoAxes("minimal", 0.95, "severe", 0.55));
assert.partialDeepStrictEqual(
  await judge("删掉那条生产记录"),
  { level: "high", decidedBy: "stakes" },
  "severe needs less evidence: missing real danger costs more",
);

// --- the ladder comes from the model ---------------------------------------

// deepseek-v4.1-flash (ollama-cloud) as pi resolves it: no `minimal`, xhigh
// mapped to the provider's `max`.
const DS = {
  reasoning: true,
  thinkingLevelMap: {
    off: "none",
    minimal: null,
    low: "low",
    medium: "medium",
    high: "high",
    xhigh: "max",
  },
};

assert.deepEqual(
  ladderFor(DS),
  ["off", "low", "medium", "high", "xhigh"],
  "the ladder is the model's levels, in pi's order",
);
assert.deepEqual(
  ladderFor(undefined),
  LEVELS,
  "an unknown model keeps the tuned ladder",
);
assert.deepEqual(
  ladderFor({ reasoning: false }),
  ["off"],
  "a non-reasoning model is off only",
);
assert.deepEqual(
  ladderFor({
    reasoning: true,
    thinkingLevelMap: {
      minimal: null,
      low: null,
      medium: null,
      high: "high",
      max: "max",
    },
  }),
  ["off", "high", "max"],
  "omitted keys keep the standard levels, so off survives and the holes are skipped",
);
assert.deepEqual(
  ladderFor({ reasoning: true, thinkingLevelMap: {} }),
  ["off", "minimal", "low", "medium", "high"],
  "an empty map is the default mapping: standard levels only",
);

// The request the model sees has to match its ladder.
const modelCtx = harness(mod);
modelCtx.model = DS;
seen.length = 0;
stubFetch(answered("low", { low: 0.9 }), { record: seen });
await modelCtx.handlers.input(
  { text: "把这个变量改名", source: "interactive" },
  modelCtx,
);
assert.deepEqual(
  Object.keys(seen[0].body.questions.level.criteria),
  ["off", "low", "medium", "high", "xhigh"],
  "the criteria sent are the model's ladder",
);
assert.ok(
  !seen[0].body.questions.level.criteria.minimal,
  "a level the model lacks is never offered",
);

// A level that is not on the model's ladder is a misjudgment, not a clamp.
modelCtx.sets.length = 0;
const noticesBefore = modelCtx.notices.length;
stubFetch(answered("minimal", { minimal: 0.95 }));
await modelCtx.handlers.input(
  { text: "ls 里有哪些文件", source: "interactive" },
  modelCtx,
);
assert.deepEqual(modelCtx.sets, [], "an off-ladder answer changes nothing");
assert.equal(modelCtx.notices.length, noticesBefore, "and says nothing");

// --- clamping backstop ------------------------------------------------------

// With the ladder taken from the model this should not happen any more, but a
// model that clamps anyway is reported as it actually took effect.
const clampedModel = harness(mod, "high", [], ["off", "low", "medium", "high"]);
clampedModel.model = DS; // claims low..xhigh, the harness only honours four
stubFetch(answered("xhigh", { xhigh: 0.95 }));
await clampedModel.handlers.input(
  { text: "重构整个模块边界", source: "interactive" },
  clampedModel,
);
assert.match(
  clampedModel.notices.at(-1)[0],
  /high → xhigh · off 0\.00 \| low 0\.00 \| medium 0\.00 \| high 0\.00 \| xhigh 0\.95 · clamped to high$/,
  "a level pi refuses is reported with what took effect",
);

globalThis.fetch = realFetch;
console.log("thinklevel: ok");
