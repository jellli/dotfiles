/**
 * Bash Guard
 *
 * The model keeps stopping the user's dev servers (`pkill -f vite`,
 * `lsof -ti:3000 | xargs kill`) and starting its own copy of them. Those
 * servers belong to the user: they run outside pi (tmux), they are shared by
 * every pi session in that repo, and killing one takes the frontend down for
 * all of them. This gate sits in front of `bash` and asks first before any
 * command that stops a process or launches a dev server. With no UI to ask
 * (headless/RPC), it blocks outright, so the model falls back to reading state
 * and reporting it.
 *
 * Read-only inspection is deliberately untouched: `ps`, `lsof -i :PORT`,
 * `curl localhost:PORT` still work - that is what answering "is the dev server
 * up?" actually needs.
 */
import {
  isToolCallEventType,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

/**
 * A command position: line start, after a shell operator, optionally behind env
 * assignments and launchers (`sudo`, `npx`). Anchoring here is what keeps
 * `grep vite` and `echo "kill it"` out of the gate; the tradeoff is that a
 * command hidden inside a script file is invisible to this check.
 */
const CMD =
  "(?:^|[;&|(]|\\$\\()\\s*(?:[A-Za-z_]\\w*=\\S*\\s+)*(?:(?:sudo|npx|bunx|pnpm\\s+dlx)\\s+)*";
const at = (pattern: string) => new RegExp(CMD + pattern, "m");

/** Commands that end processes. */
const STOPPERS: RegExp[] = [
  at("(?:kill|pkill|killall|taskkill)\\b"),
  at("xargs (?:\\S+ )*kill\\b"), // `lsof -ti:3000 | xargs kill`
  /\bfuser\b[^|;&]*\s-\w*k/, // `fuser -k 3000/tcp`
];

/** Commands that start a long-running dev server. */
const SERVERS: RegExp[] = [
  at(
    "(?:npm|pnpm|yarn|bun)\\s+(?:run\\s+)?(?:dev|develop|serve|start|watch)\\b",
  ),
  at("(?:next|nuxt|astro|remix)\\s+dev\\b"),
  at("ng\\s+serve\\b"),
  at("(?:webpack|tsx|ts-node)\\s+(?:serve|watch)\\b"),
  at("(?:vite|nodemon|http-server|ngrok|ts-node-dev)(?![\\w.-])"),
];

export type GuardHit = "kill" | "dev-server";

/** Which gate a command trips, or `null` when it is none of our business. */
export function classify(command: string): GuardHit | null {
  if (STOPPERS.some((p) => p.test(command))) return "kill";
  if (SERVERS.some((p) => p.test(command))) return "dev-server";
  return null;
}

const REASONS: Record<
  GuardHit,
  { title: string; why: string; instead: string }
> = {
  kill: {
    title: "结束进程",
    why: "会误杀用户或其他 pi 会话在跑的 dev server",
    instead: "只读排查不受限：ps、lsof -i :PORT、curl localhost:PORT",
  },
  "dev-server": {
    title: "启动 dev server",
    why: "dev server 由用户自己启动（外部 tmux），重复启动会抢端口",
    instead:
      "先查目标端口（lsof -i :PORT、curl localhost:PORT）是否已有 dev server 在跑：在跑就直接用它；没在跑就停下，告诉用户自己启动，不要替用户拉起。",
  },
};

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("bash", event)) return;

    const command = event.input.command;
    const hit = classify(command);
    if (!hit) return;

    const { title, why, instead } = REASONS[hit];
    // The hint has to ride along in the block reason: a blocked call is all the
    // model sees, and without it the next move is another launch attempt.
    const reason = `bash-guard: ${why}。${instead}`;

    if (!ctx.hasUI) return { block: true, reason: `${reason}（无 UI 可确认）` };

    const allowed = await ctx.ui.confirm(
      `bash-guard：${title}？`,
      `${command}\n\n${why}。\n${instead}`,
    );

    return allowed
      ? undefined
      : { block: true, reason: `${reason}（用户拒绝了该命令）` };
  });
}
