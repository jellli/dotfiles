/**
 * codegraph extension test harness — loads index.ts the way pi does (jiti) with
 * a fake ExtensionAPI, then exercises tools + commands against a real codegraph
 * index the test builds itself in a temp dir.
 *
 * - Self-contained: creates its own fixture project under os.tmpdir(), so a
 *   fresh clone can run `npm test` with no external state.
 * - Zero test dependencies: plain asserts + exit code. jiti is required from
 *   the pi installation's node_modules (same runtime pi itself uses).
 * - Tests are vertical slices (TDD), one async function each, appended in
 *   dependency order. Each slice asserts observable tool behavior only.
 */
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);

// PI_ROOT: pi installation (jiti + pi-coding-agent types come from here).
const PI_ROOT =
  "/Users/hoon/.local/share/fnm/node-versions/v22.19.0/installation/lib/node_modules/@earendil-works/pi-coding-agent";
const { createJiti } = require(`${PI_ROOT}/node_modules/jiti`);
const jiti = createJiti(import.meta.url, { interopDefault: true });

const EXT_DIR = "/Users/hoon/dotfiles/.pi/agent/extensions/codegraph";

// ---------------------------------------------------------------------------
// Fake ExtensionAPI + test context
// ---------------------------------------------------------------------------
const captured = { tools: new Map(), commands: new Map(), handlers: new Map() };
const fakePi = {
  registerTool: (def) => captured.tools.set(def.name, def),
  registerCommand: (name, def) => captured.commands.set(name, def),
  on: (event, fn) => captured.handlers.set(event, fn),
};

const ext = jiti(`${EXT_DIR}/index.ts`);
const factory = ext.default ?? ext;
await factory(fakePi);

// confirm behavior is per-test mutable (accept / decline / absent).
let confirmAnswer = true;
let notifyLog = [];
const fakeUI = {
  notify: (...a) => notifyLog.push(a.map(String).join(" ")),
  setStatus: () => {},
  confirm: async () => confirmAnswer,
};
const ctxFor = (cwd) => ({
  cwd,
  ui: { ...fakeUI, confirm: async () => confirmAnswer },
  signal: undefined,
  sessionManager: {},
});
// Non-interactive context: no confirm function at all (pi -p).
const ctxHeadless = (cwd) => ({ cwd, ui: { notify: () => {}, setStatus: () => {} } });

const tool = (name) => captured.tools.get(name);
const run = async (name, params, cwd, ctx = ctxFor(cwd)) =>
  tool(name).execute("t1", params, undefined, () => {}, ctx);

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------
let failures = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + String(extra).slice(0, 160) : ""}`);
  if (!ok) failures++;
};
const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

// ---------------------------------------------------------------------------
// Fixture: self-built project, chain router → getUserHandler → findUser
// ---------------------------------------------------------------------------
const fixture = mkdtempSync(join(tmpdir(), "cgtest-tdd-"));
mkdirSync(fixture, { recursive: true });
writeFileSync(
  `${fixture}/user.ts`,
  "export class UserService {\n  findUser(id: number) { return { id, name: \"alice\" }; }\n}\n",
);
writeFileSync(
  `${fixture}/api.ts`,
  "import { UserService } from \"./user\";\nexport function getUserHandler(req: any) {\n  const svc = new UserService();\n  return svc.findUser(req.id);\n}\n",
);
writeFileSync(
  `${fixture}/router.ts`,
  "import { getUserHandler } from \"./api\";\nexport function router(req: any) { return getUserHandler(req); }\n",
);

// Empty dir with no .codegraph anywhere above it (unindexed-project tests).
const empty = mkdtempSync(join(tmpdir(), "cgtest-empty-"));

// Build the fixture index before any test runs.
await captured.commands.get("codegraph:init").handler(fixture, ctxFor(fixture));

// ---------------------------------------------------------------------------
// Slice 0 — migration baseline (existing 3 tools + init + lifecycle)
// ---------------------------------------------------------------------------
test("baseline: status on indexed project", async () => {
  const out = await run("codegraph_status", {}, fixture);
  const st = out.content[0].text;
  check("status reports project root", st.includes("**Project:** ") && st.includes(fixture));
  check("status reports node counts", /\*\*Nodes:\*\* \d+/.test(st), st);
});

test("baseline: init command builds fresh index", async () => {
  const fresh = mkdtempSync(join(tmpdir(), "cgtest-fresh-"));
  writeFileSync(`${fresh}/a.ts`, "export function hello(name: string) { return `hi ${name}`; }\n");
  const cmd = captured.commands.get("codegraph:init");
  await cmd.handler(fresh, ctxFor(fresh));
  const out = await run("codegraph_status", {}, fresh);
  check("init then status shows nodes", /\*\*Nodes:\*\* \d+/.test(out.content[0].text), out.content[0].text);
  rmSync(fresh, { recursive: true, force: true });
});

test("baseline: query finds findUser", async () => {
  const out = await run("codegraph_query", { query: "findUser" }, fixture);
  check("query returns findUser", out.content[0].text.includes("findUser"), out.content[0].text);
});

test("baseline: explore traces getUserHandler → findUser", async () => {
  const out = await run("codegraph_explore", { query: "how does getUserHandler reach findUser" }, fixture);
  const e = out.content[0].text;
  check("explore includes both symbols", e.includes("findUser") && e.includes("getUserHandler"), e);
});

test("baseline: explore no-match hint", async () => {
  const out = await run("codegraph_explore", { query: "zzzznothing" }, fixture);
  check("no-match hint", out.content[0].text.includes("no relevant symbols"), out.content[0].text);
});

test("baseline: unindexed project → guidance", async () => {
  const out = await run("codegraph_status", {}, empty);
  check("guidance mentions /codegraph:init", out.content[0].text.includes("/codegraph:init"), out.content[0].text);
});

test("baseline: shutdown + reopen", async () => {
  await captured.handlers.get("session_shutdown")();
  const out = await run("codegraph_query", { query: "router" }, fixture);
  check("query works after shutdown+reopen", out.content[0].text.includes("router"), out.content[0].text);
});

// ---------------------------------------------------------------------------
// V1 — tracer bullet: codegraph_impact returns formatted impact radius
// ---------------------------------------------------------------------------
test("V1: impact tool registered", async () => {
  check("codegraph_impact is registered", tool("codegraph_impact") !== undefined);
});

test("V1: impact on findUser lists neighbor getUserHandler", async () => {
  const t = tool("codegraph_impact");
  if (!t) return;
  const out = await run("codegraph_impact", { symbol: "UserService.findUser" }, fixture);
  const txt = out.content[0].text;
  check(
    "radius text names target + neighbor with location",
    txt.includes("UserService.findUser") && txt.includes("getUserHandler"),
    txt,
  );
});

// ---------------------------------------------------------------------------
// V2 — maxDepth limits traversal (depth 1 vs 3)
// ---------------------------------------------------------------------------
test("V2: maxDepth=1 excludes 2-hop downstream", async () => {
  const t = tool("codegraph_impact");
  if (!t) return;
  const d1 = await run("codegraph_impact", { symbol: "findUser", maxDepth: 1 }, fixture);
  check("depth1 does not include router", !d1.content[0].text.includes("router"), d1.content[0].text);
});

test("V2: maxDepth=3 includes 2-hop downstream", async () => {
  const t = tool("codegraph_impact");
  if (!t) return;
  const d3 = await run("codegraph_impact", { symbol: "findUser", maxDepth: 3 }, fixture);
  check("depth3 includes router", d3.content[0].text.includes("router"), d3.content[0].text);
});

// ---------------------------------------------------------------------------
// V3 — no-symbol branch
// ---------------------------------------------------------------------------
test("V3: unknown symbol reports no-match", async () => {
  const t = tool("codegraph_impact");
  if (!t) return;
  const out = await run("codegraph_impact", { symbol: "NopeNope" }, fixture);
  check("no-symbol text", out.content[0].text.includes("No symbol"), out.content[0].text);
});

test("V3: leaf symbol with no callers says safe to change", async () => {
  const t = tool("codegraph_impact");
  if (!t) return;
  const out = await run("codegraph_impact", { symbol: "router" }, fixture);
  check("no downstream text", out.content[0].text.includes("No downstream callers"), out.content[0].text);
});

// ---------------------------------------------------------------------------
// V4 — explore description: no blast-radius overclaim, routes to codegraph_impact
// ---------------------------------------------------------------------------
test("V4: explore description has no blast-radius claim", async () => {
  const desc = tool("codegraph_explore")?.description ?? "";
  check(
    "no blast-radius wording",
    !desc.includes("blast-radius") && !desc.includes("blast radius"),
    desc,
  );
});

test("V4: explore description routes impact questions to codegraph_impact", async () => {
  const desc = tool("codegraph_explore")?.description ?? "";
  check("references codegraph_impact", desc.includes("codegraph_impact"), desc);
});

// ---------------------------------------------------------------------------
// V5 — 50KB output cap (pure function + tool plumbing)
// ---------------------------------------------------------------------------
test("V5: truncateOutput keeps small text intact", async () => {
  const { truncateOutput } = await jiti(`${EXT_DIR}/tools.ts`);
  const r = truncateOutput("hi ".repeat(10));
  check("small text unchanged", r.text === "hi ".repeat(10) && r.truncated === false, JSON.stringify({ len: r.text.length, truncated: r.truncated }));
});

test("V5: truncateOutput caps oversized text at maxBytes incl. tail", async () => {
  const { truncateOutput } = await jiti(`${EXT_DIR}/tools.ts`);
  const big = "中英mixed 🚀 data ".repeat(20000); // ≈440KB
  const r = truncateOutput(big);
  check("flagged truncated", r.truncated === true);
  check("byte size within cap", Buffer.byteLength(r.text, "utf8") <= 51200, Buffer.byteLength(r.text, "utf8"));
  check("no broken utf8 at end", !r.text.endsWith("\uFFFD"), r.text.slice(-20));
  check("tail marker present", r.text.includes("[truncated"), r.text.slice(-60));
});

test("V5: tool results carry details object (no phantom truncated flag)", async () => {
  const out = await run("codegraph_explore", { query: "findUser" }, fixture);
  check("details object without truncated", !!out.details && !out.details.truncated, JSON.stringify(out.details));
});

// ---------------------------------------------------------------------------
// V6/V7/V8 — unindexed project: confirm-driven auto-init
// ---------------------------------------------------------------------------
test("V6: unindexed + confirm=yes → auto-init and answer", async () => {
  confirmAnswer = true;
  const probe = mkdtempSync(join(tmpdir(), "cgtest-v6-"));
  writeFileSync(`${probe}/a.ts`, "export function ping() { return 1; }\n");
  const out = await run("codegraph_explore", { query: "ping" }, probe);
  const txt = out.content[0].text;
  check("answer not guidance", !txt.includes("not indexed") && txt.includes("ping"), txt.slice(0, 160));
  check("index created", existsSync(join(probe, ".codegraph", "codegraph.db")));
  rmSync(probe, { recursive: true, force: true });
});

test("V7: unindexed + confirm=no → guidance, no index created", async () => {
  confirmAnswer = false;
  const probe = mkdtempSync(join(tmpdir(), "cgtest-v7-"));
  const out = await run("codegraph_explore", { query: "x" }, probe);
  const txt = out.content[0].text;
  check("guidance returned", txt.includes("not indexed") && txt.includes("/codegraph:init"), txt.slice(0, 160));
  check("no index created", !existsSync(join(probe, ".codegraph")));
  rmSync(probe, { recursive: true, force: true });
});

test("V8: unindexed + headless ctx → guidance, no auto-init", async () => {
  confirmAnswer = true; // must not matter: headless ctx has no confirm fn
  const probe = mkdtempSync(join(tmpdir(), "cgtest-v8-"));
  const out = await run("codegraph_explore", { query: "x" }, probe, ctxHeadless(probe));
  check("guidance returned", out.content[0].text.includes("not indexed"), out.content[0].text.slice(0, 160));
  check("no index created", !existsSync(join(probe, ".codegraph")));
  rmSync(probe, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// V9 — status prefers the cached client (consistent watcher/cache lines)
// ---------------------------------------------------------------------------
test("V9: status reflects cached client's live watcher", async () => {
  await run("codegraph_query", { query: "findUser" }, fixture); // warm the cache
  const out = await run("codegraph_status", {}, fixture);
  const st = out.content[0].text;
  check("watcher line says watching", st.includes("**Watcher:** watching"), st);
  check("session cache loaded", st.includes("**Session cache:** loaded"), st);
});

test("V9: status on never-opened project uses throwaway (no watcher)", async () => {
  const fresh = mkdtempSync(join(tmpdir(), "cgtest-v9-"));
  writeFileSync(`${fresh}/a.ts`, "export function ping() { return 1; }\n");
  await captured.commands.get("codegraph:init").handler(fresh, ctxFor(fresh));
  const out = await run("codegraph_status", {}, fresh);
  const st = out.content[0].text;
  check("no watcher line", st.includes("**Watcher:** not started in this session"), st);
  check("session cache lazy for fresh project", st.includes("**Session cache:** lazy"), st);
  rmSync(fresh, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// V10 — /codegraph:init --force rebuild
// ---------------------------------------------------------------------------
test("V10: --force rebuilds existing index after confirm", async () => {
  const fresh = mkdtempSync(join(tmpdir(), "cgtest-v10-"));
  writeFileSync(`${fresh}/a.ts`, "export function ping() { return 1; }\n");
  const cmd = captured.commands.get("codegraph:init");
  await cmd.handler(fresh, ctxFor(fresh));
  const dbPath = join(fresh, ".codegraph", "codegraph.db");
  check("index exists before rebuild", existsSync(dbPath));
  confirmAnswer = true;
  notifyLog.length = 0;
  await cmd.handler(`--force ${fresh}`, ctxFor(fresh));
  check("rebuild notify fired", notifyLog.some((m) => m.includes("re-indexed") || m.includes("rebuild")), notifyLog.join(" | "));
  check("index exists after rebuild", existsSync(dbPath));
  const out = await run("codegraph_status", {}, fresh);
  check("status healthy after rebuild", /\*\*Nodes:\*\* \d+/.test(out.content[0].text), out.content[0].text);
  rmSync(fresh, { recursive: true, force: true });
});

test("V10: --force declined keeps old index", async () => {
  const fresh = mkdtempSync(join(tmpdir(), "cgtest-v10b-"));
  writeFileSync(`${fresh}/a.ts`, "export function ping() { return 1; }\n");
  const cmd = captured.commands.get("codegraph:init");
  await cmd.handler(fresh, ctxFor(fresh));
  confirmAnswer = false;
  notifyLog.length = 0;
  await cmd.handler(`--force ${fresh}`, ctxFor(fresh));
  check("cancel notify fired", notifyLog.some((m) => m.includes("cancel")), notifyLog.join(" | "));
  check("old index kept", existsSync(join(fresh, ".codegraph", "codegraph.db")));
  const out = await run("codegraph_status", {}, fresh);
  check("status still healthy", /\*\*Nodes:\*\* \d+/.test(out.content[0].text), out.content[0].text);
  rmSync(fresh, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
console.log("tools:", [...captured.tools.keys()].join(", "));
console.log("commands:", [...captured.commands.keys()].join(", "));
console.log(`fixture: ${fixture} (exists: ${existsSync(fixture)})`);
console.log("---");

for (const { name, fn } of tests) {
  try {
    await fn();
  } catch (err) {
    check(`threw: ${name}`, false, err?.message ?? String(err));
  }
}

rmSync(fixture, { recursive: true, force: true });
rmSync(empty, { recursive: true, force: true });

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
