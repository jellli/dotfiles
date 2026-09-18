/**
 * thinklevel — judge the thinking level of each interactive prompt (TypeSafe/Jev).
 *
 * One System One call carries up to three questions: whether the new message
 * continues the work already underway, how much reasoning that work needs, and
 * what being wrong would cost. The last two are separate axes on purpose — an
 * easy request with a destructive outcome needs deliberation, a hard one whose
 * mistakes are cheap to undo does not — so code takes the higher of the two.
 *
 * The continuation question exists because a bare follow-up carries no task: on
 * its own, "继续" reads as trivial and would drop a hard task to minimal. When
 * prior messages are available they are sent as state, and a judged
 * continuation leaves the level entirely alone instead of re-judging from one
 * line. The extension owns the ladder and the failure policy; the model only
 * supplies judgments.
 *
 * Every decision is reported with the distribution behind it: a single
 * probability hides that a choice was really a coin flip between two levels.
 *
 * Everything fails open: a missing key, a timeout, an HTTP error or an answer
 * outside the ladder leaves the configured thinking level untouched.
 *
 * `/thinklevel` toggles the judge for the rest of the session. There is no
 * config file and no new default: the built-in thinking controls still work.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

/** Every level pi defines, weakest first. */
export const LEVEL_ORDER = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;
export type Level = (typeof LEVEL_ORDER)[number];

/** Levels pi enables without an explicit `thinkingLevelMap` entry. */
const STANDARD_LEVELS: Level[] = ["off", "minimal", "low", "medium", "high"];

/** The ladder this extension was tuned on, and its answer for an unknown model. */
export const LEVELS: Level[] = ["minimal", "low", "medium", "high"];

/** The parts of a pi-ai `Model` this extension reads. */
export interface ModelLevels {
  reasoning?: boolean;
  thinkingLevelMap?: Partial<Record<string, string | null>>;
}

/**
 * The levels this model actually has. `thinkingLevelMap` is tri-state: a string
 * means supported, `null` means pi hides and clamps it away, and an omitted key
 * means the standard levels are on and `xhigh`/`max` are not. Asking for a level
 * the model lacks is not an error in pi, it is silently clamped - so the ladder
 * the judge chooses from is built from what the model declares.
 */
export function ladderFor(model?: ModelLevels): Level[] {
  if (!model) return LEVELS;
  if (!model.reasoning) return ["off"];

  const map = model.thinkingLevelMap;
  if (!map) return LEVELS;

  const supported = LEVEL_ORDER.filter((level) => {
    const value = map[level];
    if (value === null) return false;
    if (value !== undefined) return true;
    return STANDARD_LEVELS.includes(level);
  });

  return supported.length > 0 ? supported : ["off"];
}

/**
 * Situations, not level names. A contrastive rewrite ("Not: ..." on every
 * option, per the Choice docs) measured *worse* on the 28-prompt set: medium
 * lost three debugging/refactor prompts. Kept as the version that scored best.
 */
const LEVEL_CRITERIA: Record<Level, string> = {
  off: "Nothing has to be reasoned about: a greeting, an acknowledgement, or a command whose meaning is already fully specified.",
  minimal:
    "A fact to look up, one mechanical step, a wording or format change, or ordinary conversation. Nothing has to be worked out beyond reading one thing.",
  low: "A small, well-scoped change or question whose answer follows from the code or docs already at hand. Little searching and no real trade-offs.",
  medium:
    "A few reasoning steps: a change spanning a few files, a choice between a few clear options, or tracking down a failure whose cause is probably in the code path in front of you.",
  high: "A hard problem: an open-ended design decision, planning across many moving parts, hunting a failure whose cause is not yet known, or changing a structure or boundary that other code depends on. The approach is not obvious and mistakes are costly to undo.",
  xhigh:
    "A hard problem at its largest scale: planning across a whole subsystem or codebase, a failure whose cause is nowhere in sight, or a decision that many other decisions depend on, where a wrong approach invalidates work already done.",
  max: "The hardest kind: the goal itself is unclear or the constraints conflict, and nothing can be checked by trying it - the approach has to be reasoned out from first principles.",
};

/**
 * The second axis. Deliberately orthogonal to difficulty: it asks only what a
 * wrong result costs, however hard the request was to understand.
 */
const STAKES: Record<string, Level> = {
  cheap: "minimal",
  costly: "medium",
  severe: "high",
};

const STAKES_CRITERIA: Record<string, string> = {
  cheap:
    "A wrong result is noticed immediately and costs a rerun or a one-line edit: a lookup, an edit to a file nothing else reads, or a question that will be read before anyone acts on it. Not: anything that lands in shared state.",
  costly:
    "A wrong result is found late or takes real work to undo: several files, a shared module, a config others depend on, or work that would have to be redone. Not: irreversible loss.",
  severe:
    "A wrong result can destroy something that cannot be recovered or quietly corrupt other work: overwriting or deleting data whose loss is not expected, moving a dependency boundary, or an operation whose failure is invisible while it happens. Not: a file or artifact that is disposable by design, such as a cache, a temp file, or build output.",
};

const CONTINUES_INSTRUCTIONS =
  "Does `new_message` continue the work already underway in `previous_user_message`, rather than start a different task? Answer yes for a bare acknowledgement, a correction, a clarification of the same work, or one more step in it.";

/** The judge must never delay a turn longer than this; 1.5s aborted under load. */
const TIMEOUT_MS = 3000;

/** How much of the previous assistant message is worth sending. */
const ASSISTANT_TAIL_CHARS = 400;

/** A Noul near 0.5 means yes and no are equally likely; treat that as "continue". */
const CONTINUES_MIN_P = 0.5;

/** Order of pi's thinking levels, to tell a raise from a lower. */
const RANK: Record<string, number> = {
  off: -1,
  minimal: 0,
  low: 1,
  medium: 2,
  high: 3,
  xhigh: 4,
  max: 5,
};

// Asymmetric confidence gates. An unnecessary raise only wastes tokens, while a
// wrong lower hides work the model should have done, so demand more certainty
// before taking a level away than before adding one.
// Measured on 28 labeled prompts: correct lowers scored p>=0.71, the one
// under-judged prompt scored 0.37 - so 0.6 separates them without blocking the
// merely unloved ones. n=28 is small; retune from your own data.
const RAISE_MIN_P = 0.5;
const LOWER_MIN_P = 0.6;

// A stakes answer only overrides the level answer if it is sure enough to say
// so. Observed failure: "costly" at p=0.53 (a coin flip between cheap and
// costly) outranked a confident "minimal" at p=0.58 purely by being the higher
// tier, and the raise gate above let 0.53 through. Severe stays cheap to claim
// - missing real danger costs more than an occasional extra level.
const STAKES_OVERRIDE_MIN_P: Record<string, number> = {
  costly: 0.7,
  severe: 0.5,
};

/** Where the key lives when it is not in the environment. */
const authPath = () =>
  process.env.PI_THINKLEVEL_AUTH_PATH ??
  join(homedir(), ".pi", "agent", "thinklevel", "auth.json");

/**
 * The key from the environment, else from pi's config dir - the same
 * `{ "apiKey": ... }` file brave-search uses. Read per call: it is a few bytes,
 * and it means the file can be fixed without a reload. Never logged.
 */
export function resolveKey(): string | undefined {
  const fromEnv = process.env.TYPESAFE_API_KEY?.trim();
  if (fromEnv) return fromEnv;

  try {
    const parsed = JSON.parse(readFileSync(authPath(), "utf8")) as {
      apiKey?: unknown;
    };
    const key = typeof parsed.apiKey === "string" ? parsed.apiKey.trim() : "";
    return key || undefined;
  } catch {
    return undefined;
  }
}

/**
 * The most recent decision or failure. Notifications scroll away; this lets
 * `/thinklevel last` bring the distribution back.
 */
let lastEvent: LastEvent | undefined;

/** PI_THINKLEVEL_DEBUG=1 reports why a prompt went unjudged. */
const miss = (reason: string) => {
  lastEvent = { kind: "no-judgment", text: reason };
  if (process.env.PI_THINKLEVEL_DEBUG === "1") {
    process.stderr.write(`[thinklevel] ${reason}\n`);
  }
};

/** `minimal 0.02 | low 0.71 | medium 0.25 | high 0.02` — the whole answer, not a summary. */
export function formatDistribution(
  probabilities: Partial<Record<Level, number>>,
  levels: Level[] = LEVELS,
): string {
  return levels
    .map((level) => `${level} ${(probabilities[level] ?? 0).toFixed(2)}`)
    .join(" | ");
}

export interface Verdict {
  /** null when the message continues work already underway: keep the level. */
  level: Level | null;
  /** The ladder this judgment was made on. */
  levels: Level[];
  /** The distribution over the ladder from the level question. */
  probabilities: Partial<Record<Level, number>>;
  /** Probability of the level that decided, when a level decided it. */
  probability: number;
  confidence?: number;
  /** The continuation probability, when there was context to continue. */
  continues?: number;
  /** Present when the stakes question was asked and answered on the set. */
  stakes?: {
    choice: string;
    level: Level;
    probability: number;
    probabilities: Record<string, number>;
  };
  /** Which judgment set the level: the reasoning or the cost of being wrong. */
  decidedBy: "level" | "stakes" | "continuation";
}

/** The last thing the extension did, re-readable on demand. */
export interface LastEvent {
  kind: "decision" | "no-judgment";
  text: string;
  /** The prompt it judged, clipped for display. */
  prompt?: string;
}

/** What the judge needs to tell "one more step" from "a different task". */
export interface PriorContext {
  latestUser?: string;
  latestAssistant?: string;
}

export interface JudgeOptions {
  signal?: AbortSignal;
  prior?: PriorContext;
  currentLevel?: string;
  /** The levels to choose from; defaults to the tuned ladder. */
  levels?: Level[];
}

interface ChoiceAnswer {
  choice?: string;
  probabilities?: Record<string, number>;
  confidence?: number;
}

interface Response {
  answers?: {
    continues?: { noul?: number };
    level?: ChoiceAnswer;
    stakes?: ChoiceAnswer;
  };
}

/** Plain text of a message's content, which may be a string or content blocks. */
function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) =>
      block &&
      typeof block === "object" &&
      (block as { type?: string }).type === "text"
        ? String((block as { text?: unknown }).text ?? "")
        : "",
    )
    .join("\n");
}

/**
 * The last user message before this one plus the tail of the last assistant
 * message. The `input` hook runs before the agent starts, so the current
 * message is normally not in the session yet; the identity check covers the
 * ordering it is not.
 */
export function collectPrior(
  ctx: Pick<ExtensionContext, "sessionManager">,
  current: string,
): PriorContext {
  const entries = ctx.sessionManager?.getBranch?.() ?? [];
  const prior: PriorContext = {};
  const currentText = current.trim();

  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i] as {
      type?: string;
      message?: { role?: string; content?: unknown };
    };
    if (entry?.type !== "message") continue;

    const text = contentText(entry.message?.content).trim();
    if (!text) continue;

    if (
      entry.message?.role === "assistant" &&
      prior.latestAssistant === undefined
    ) {
      prior.latestAssistant = text.slice(-ASSISTANT_TAIL_CHARS);
    } else if (
      entry.message?.role === "user" &&
      prior.latestUser === undefined &&
      text !== currentText
    ) {
      prior.latestUser = text;
    }

    if (prior.latestUser !== undefined && prior.latestAssistant !== undefined)
      break;
  }

  return prior;
}

function ladderDistribution(
  probabilities: Record<string, number> | undefined,
  levels: Level[],
): Partial<Record<Level, number>> {
  const out: Partial<Record<Level, number>> = {};
  for (const level of levels) out[level] = probabilities?.[level] ?? 0;
  return out;
}

export async function judge(
  text: string,
  { signal, prior, currentLevel, levels = LEVELS }: JudgeOptions = {},
): Promise<Verdict | null> {
  const key = resolveKey();
  if (!key || !text.trim()) {
    miss(`no API key (env TYPESAFE_API_KEY, or ${authPath()}), or empty input`);
    return null;
  }

  // Read per call so tests can stub both the endpoint and the environment.
  const base = process.env.TYPESAFE_BASE_URL ?? "https://api.typesafe.ai";
  const model = process.env.TYPESAFE_DEFAULT_MODEL ?? "jev-latest";
  const timeout = AbortSignal.timeout(TIMEOUT_MS);

  // Without prior messages there is no conversation to continue, so the state
  // stays a plain string and the continuation question is not asked at all.
  const hasPrior = Boolean(prior?.latestUser || prior?.latestAssistant);
  const state = hasPrior
    ? {
        current_thinking_level: currentLevel ?? "unknown",
        previous_user_message: prior?.latestUser ?? null,
        previous_assistant_message: prior?.latestAssistant ?? null,
        new_message: text,
      }
    : text;

  try {
    const res = await fetch(`${base}/v1/systemone`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        state,
        model,
        questions: {
          ...(hasPrior
            ? {
                continues: {
                  type: "noul",
                  instructions: CONTINUES_INSTRUCTIONS,
                },
              }
            : {}),
          level: {
            type: "choice",
            instructions:
              "How much reasoning must go into answering this request? Judge the work it requires, not its length or its tone.",
            criteria: Object.fromEntries(
              levels.map((level) => [level, LEVEL_CRITERIA[level]]),
            ),
          },
          stakes: {
            type: "choice",
            instructions:
              "If this request is answered or carried out wrongly, how expensive is that to discover and undo? Judge the cost alone, independently of how hard the request is.",
            criteria: STAKES_CRITERIA,
          },
        },
      }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (!res.ok) {
      miss(`HTTP ${res.status}`);
      return null;
    }

    const data = (await res.json()) as Response;
    const levelAnswer = data.answers?.level;
    const probabilities = ladderDistribution(
      levelAnswer?.probabilities,
      levels,
    );

    // A continuation keeps whatever level the ongoing work already earned: its
    // level was judged on the message that started it, not on this one. Its own
    // (mis)reading is still reported, since that is what it would have done.
    const continues = data.answers?.continues?.noul;
    if (typeof continues === "number" && continues >= CONTINUES_MIN_P) {
      miss(
        `continuation of the work underway (p=${continues.toFixed(2)}), level left alone`,
      );
      return {
        level: null,
        levels,
        probabilities,
        probability: 0,
        continues,
        decidedBy: "continuation",
      };
    }

    const level = levelAnswer?.choice;
    // An answer off the ladder is a misjudgment, not a level to clamp.
    if (!level || !levels.includes(level as Level)) {
      miss(`answer outside the ladder: ${level}`);
      return null;
    }

    const stakesAnswer = data.answers?.stakes;
    const stakesFloor = stakesAnswer?.choice
      ? STAKES[stakesAnswer.choice]
      : undefined;
    if (stakesAnswer?.choice && !stakesFloor) {
      miss(`stakes outside the set: ${stakesAnswer.choice}`);
    }
    const stakes =
      stakesFloor && stakesAnswer?.choice
        ? {
            choice: stakesAnswer.choice,
            level: stakesFloor,
            probability: stakesAnswer.probabilities?.[stakesAnswer.choice] ?? 0,
            probabilities: stakesAnswer.probabilities ?? {},
          }
        : undefined;

    const fromStakes = Boolean(
      stakes &&
      RANK[stakes.level] > RANK[level] &&
      stakes.probability >= (STAKES_OVERRIDE_MIN_P[stakes.choice] ?? 1),
    );
    // Whichever judgment decided the level carries the confidence in it.
    const source = fromStakes ? stakesAnswer : levelAnswer;

    return {
      level: fromStakes ? stakes!.level : (level as Level),
      levels,
      probabilities,
      probability: source?.probabilities?.[source.choice ?? ""] ?? 0,
      confidence: source?.confidence,
      ...(stakes ? { stakes } : {}),
      decidedBy: fromStakes ? "stakes" : "level",
    };
  } catch (error) {
    miss(`request failed: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

/** `cheap 0.47 | costly 0.53 | severe 0.00` */
export function formatStakes(probabilities: Record<string, number>): string {
  return Object.keys(STAKES)
    .map((option) => `${option} ${(probabilities[option] ?? 0).toFixed(2)}`)
    .join(" | ");
}

/** `/thinklevel last`: the stored event, phrased for the two kinds there are. */
export function lastReport(): string {
  if (!lastEvent) return "thinklevel: nothing judged yet this session";
  if (lastEvent.kind === "no-judgment") {
    return `thinklevel last · no judgment: ${lastEvent.text}`;
  }
  return `thinklevel last · "${lastEvent.prompt ?? ""}" · ${lastEvent.text.replace(
    /^thinklevel: /,
    "",
  )}`;
}

/** One line: what it decided, why, and the distribution behind it. */
export function formatDecision(
  verdict: Verdict,
  current: string,
  floor?: number,
): string {
  const distribution = formatDistribution(
    verdict.probabilities,
    verdict.levels,
  );

  if (verdict.decidedBy === "continuation") {
    return `thinklevel: keep ${current} · continues p=${(
      verdict.continues ?? 0
    ).toFixed(2)} · level answer ignored: ${distribution}`;
  }

  if (verdict.level === current) {
    return `thinklevel: keep ${current} · matches · ${distribution}`;
  }

  if (floor !== undefined && verdict.probability < floor) {
    return `thinklevel: keep ${current} · ${verdict.level} scored p=${verdict.probability.toFixed(
      2,
    )} below the ${floor} floor · ${distribution}`;
  }

  // Both distributions, because a stakes-driven raise is exactly the case where
  // one number from each question is not enough to read the decision.
  if (verdict.decidedBy === "stakes" && verdict.stakes) {
    return (
      `thinklevel: ${current} → ${verdict.level} · stakes ${verdict.stakes.choice}` +
      ` (${formatStakes(verdict.stakes.probabilities)}) · level (${distribution})`
    );
  }

  return `thinklevel: ${current} → ${verdict.level} · ${distribution}`;
}

export default function (pi: ExtensionAPI) {
  /** Whether prompts are judged at all. */
  let enabled = true;
  /** Whether decisions are reported. Judging continues either way. */
  let notifyOn = true;

  const status = () =>
    `thinklevel: auto ${enabled ? "on" : "off"}, notify ${notifyOn ? "on" : "off"}`;

  // A silent extension is indistinguishable from a broken one: say at startup
  // whether it can actually judge, since a missing key fails open forever. That
  // one message survives quiet mode - it is the difference between "working"
  // and "never judging anything".
  pi.on("session_start", (_event, ctx) => {
    const hasKey = Boolean(resolveKey());
    if (!notifyOn && hasKey) return;
    ctx.ui.notify(
      hasKey
        ? "thinklevel on: judging the thinking level of every prompt (/thinklevel auto|notify on|off)"
        : `thinklevel on, but no API key: set TYPESAFE_API_KEY or create ${authPath()}`,
      hasKey ? "info" : "error",
    );
  });

  pi.registerCommand("thinklevel", {
    description: "Turn automatic judging or its notifications on or off",
    getArgumentCompletions: (prefix: string) => {
      const items = [
        "auto on",
        "auto off",
        "notify on",
        "notify off",
        "last",
      ].map((value) => ({ value, label: value }));
      const filtered = items.filter((item) => item.value.startsWith(prefix));
      return filtered.length > 0 ? filtered : null;
    },
    handler: async (args, ctx) => {
      const words = args.trim().toLowerCase().split(/\s+/).filter(Boolean);

      if (words[0] === "last") {
        ctx.ui.notify(lastReport(), "info");
        return;
      }
      // `/thinklevel on|off` keeps the terse form meaning the judge itself.
      const target =
        words[0] === "notify"
          ? "notify"
          : words[0] === "auto"
            ? "auto"
            : "auto";
      const value =
        words[0] === "auto" || words[0] === "notify" ? words[1] : words[0];

      if (value !== "on" && value !== "off") {
        ctx.ui.notify(status(), "info");
        return;
      }

      const on = value === "on";
      if (target === "notify") notifyOn = on;
      else enabled = on;
      // Confirmations answer a deliberate action, so they are never silenced.
      ctx.ui.notify(`${target} ${value} · ${status()}`, "info");
    },
  });

  // `input` fires before the turn starts and still knows where the text came
  // from, so injected messages (compaction, follow-ups) are never judged.
  pi.on("input", async (event, ctx) => {
    if (!enabled || event.source !== "interactive") return;

    const current = pi.getThinkingLevel();
    const verdict = await judge(event.text, {
      signal: ctx.signal,
      prior: collectPrior(ctx, event.text),
      currentLevel: current,
      levels: ladderFor(ctx.model as ModelLevels | undefined),
    });
    // Errors, timeouts and off-ladder answers stay quiet: they happen per
    // prompt and the debug flag already reports them.
    if (!verdict) return;

    const prompt = event.text.replace(/\s+/g, " ").slice(0, 40);
    const report = (text: string) => {
      lastEvent = { kind: "decision", text, prompt };
      if (notifyOn) ctx.ui.notify(text, "info");
    };

    if (verdict.decidedBy === "continuation") {
      report(formatDecision(verdict, current));
      return;
    }

    const raising = RANK[verdict.level!] > (RANK[current] ?? 0);
    const floor = raising ? RAISE_MIN_P : LOWER_MIN_P;

    // A model declares which levels exist (thinkingLevelMap); pi clamps the
    // rest away, so read back what actually took effect instead of claiming the
    // level that was asked for.
    let clamped: string | undefined;
    if (verdict.level !== current && verdict.probability >= floor) {
      pi.setThinkingLevel(verdict.level!);
      const effective = pi.getThinkingLevel();
      if (effective !== verdict.level) clamped = effective;
    }

    const line = formatDecision(verdict, current, floor);
    report(clamped ? `${line} · clamped to ${clamped}` : line);
  });
}
