/**
 * Local fork of oh-my-pi's todo feature.
 *
 * Keeps only the session todo tool, `/todo` command, persistence, and HUD.
 * Adapted to pi's public ExtensionAPI; OMP's core-only imports are not used.
 */
import { Type } from "typebox";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const TOOL_NAME = "todo";
const ENTRY_TYPE = "oh-my-pi-todo";
const WIDGET_KEY = "oh-my-pi-todo";

const TodoStatus = Type.Union([
  Type.Literal("pending"),
  Type.Literal("in_progress"),
  Type.Literal("completed"),
  Type.Literal("abandoned"),
  Type.Literal("blocked"),
]);
const TodoOp = Type.Union([
  Type.Literal("init"),
  Type.Literal("start"),
  Type.Literal("done"),
  Type.Literal("drop"),
  Type.Literal("block"),
  Type.Literal("unblock"),
  Type.Literal("rm"),
  Type.Literal("append"),
  Type.Literal("view"),
]);
const TodoParams = Type.Object({
  op: TodoOp,
  list: Type.Optional(
    Type.Array(
      Type.Object({
        phase: Type.String({ description: "Phase name" }),
        items: Type.Array(Type.String({ description: "Task content" }), { minItems: 1 }),
      }),
    ),
  ),
  task: Type.Optional(Type.String({ description: "Exact task content" })),
  phase: Type.Optional(Type.String({ description: "Exact phase name" })),
  items: Type.Optional(Type.Array(Type.String({ description: "Task content" }))),
  reason: Type.Optional(Type.String({ description: "Blocker note" })),
});

type Status = "pending" | "in_progress" | "completed" | "abandoned" | "blocked";
type Item = { content: string; status: Status; blocker?: string };
type Phase = { name: string; tasks: Item[] };
type Params = {
  op: "init" | "start" | "done" | "drop" | "block" | "unblock" | "rm" | "append" | "view";
  list?: Array<{ phase: string; items: string[] }>;
  task?: string;
  phase?: string;
  items?: string[];
  reason?: string;
};

type State = { phases: Phase[]; sessionKey: string };
const states = new Map<string, State>();
let activeContext: ExtensionContext | undefined;

function clone(phases: Phase[]): Phase[] {
  return phases.map((phase) => ({
    name: phase.name,
    tasks: phase.tasks.map((task) =>
      task.blocker === undefined ? { ...task } : { ...task, blocker: task.blocker },
    ),
  }));
}

function sessionKey(ctx: ExtensionContext): string {
  return ctx.sessionManager.getSessionId();
}

function getState(ctx: ExtensionContext): State {
  const key = sessionKey(ctx);
  let state = states.get(key);
  if (!state) {
    state = { phases: [], sessionKey: key };
    states.set(key, state);
  }
  return state;
}

function normalize(phases: Phase[]): void {
  const tasks = phases.flatMap((phase) => phase.tasks);
  const active = tasks.filter((task) => task.status === "in_progress");
  for (const task of active.slice(1)) task.status = "pending";
  if (active.length === 0) {
    const next = tasks.find((task) => task.status === "pending");
    if (next) next.status = "in_progress";
  }
}

function findTask(phases: Phase[], content: string): { task: Item; phase: Phase } | undefined {
  for (const phase of phases) {
    const task = phase.tasks.find((candidate) => candidate.content === content);
    if (task) return { task, phase };
  }
  return undefined;
}

function findPhase(phases: Phase[], name: string): Phase | undefined {
  return phases.find((phase) => phase.name === name);
}

function targets(phases: Phase[], params: Params, errors: string[]): Item[] {
  if (params.task !== undefined) {
    const hit = findTask(phases, params.task);
    if (!hit) errors.push(`Task "${params.task}" not found`);
    return hit ? [hit.task] : [];
  }
  if (params.phase !== undefined) {
    const phase = findPhase(phases, params.phase);
    if (!phase) errors.push(`Phase "${params.phase}" not found`);
    return phase?.tasks ?? [];
  }
  return phases.flatMap((phase) => phase.tasks);
}

function apply(current: Phase[], params: Params): { phases: Phase[]; errors: string[] } {
  const phases = clone(current);
  const errors: string[] = [];

  switch (params.op) {
    case "init": {
      const list = params.list ?? (params.items ? [{ phase: params.phase ?? "Tasks", items: params.items }] : undefined);
      if (!list || list.length === 0) errors.push("Missing list for init operation");
      else {
        const phaseNames = new Set<string>();
        const taskNames = new Set<string>();
        for (const entry of list) {
          if (phaseNames.has(entry.phase)) errors.push(`Duplicate phase "${entry.phase}"`);
          phaseNames.add(entry.phase);
          for (const item of entry.items) {
            if (taskNames.has(item)) errors.push(`Duplicate task "${item}"`);
            taskNames.add(item);
          }
        }
        if (errors.length === 0) {
          phases.splice(0, phases.length, ...list.map((entry) => ({
            name: entry.phase,
            tasks: entry.items.map((content) => ({ content, status: "pending" as const })),
          })));
        }
      }
      break;
    }
    case "append": {
      if (!params.phase) errors.push("Missing phase name for append operation");
      if (!params.items || params.items.length === 0) errors.push("Missing items for append operation");
      if (params.items) {
        for (const item of params.items) {
          if (findTask(phases, item)) errors.push(`Task "${item}" already exists`);
        }
      }
      if (errors.length === 0) {
        let phase = findPhase(phases, params.phase!);
        if (!phase) {
          phase = { name: params.phase!, tasks: [] };
          phases.push(phase);
        }
        for (const content of params.items!) phase.tasks.push({ content, status: "pending" });
      }
      break;
    }
    case "start": {
      if (!params.task) errors.push("Missing task content");
      const hit = params.task ? findTask(phases, params.task) : undefined;
      if (params.task && !hit) errors.push(`Task "${params.task}" not found`);
      if (hit) {
        for (const task of phases.flatMap((phase) => phase.tasks)) {
          if (task !== hit.task && task.status === "in_progress") task.status = "pending";
        }
        hit.task.status = "in_progress";
      }
      break;
    }
    case "done":
    case "drop": {
      for (const task of targets(phases, params, errors)) task.status = params.op === "done" ? "completed" : "abandoned";
      break;
    }
    case "block": {
      if (!params.task && !params.phase) errors.push("block requires a task or phase target");
      const reason = params.reason?.replace(/\s+/g, " ").trim() || undefined;
      for (const task of targets(phases, params, errors)) {
        if (["pending", "in_progress", "blocked"].includes(task.status)) {
          task.status = "blocked";
          task.blocker = reason;
        }
      }
      break;
    }
    case "unblock": {
      if (!params.task && !params.phase) errors.push("unblock requires a task or phase target");
      for (const task of targets(phases, params, errors)) {
        if (task.status === "blocked") {
          task.status = "pending";
          delete task.blocker;
        }
      }
      break;
    }
    case "rm": {
      if (params.task) {
        const hit = findTask(phases, params.task);
        if (!hit) errors.push(`Task "${params.task}" not found`);
        else hit.phase.tasks = hit.phase.tasks.filter((task) => task !== hit.task);
      } else if (params.phase) {
        const phase = findPhase(phases, params.phase);
        if (!phase) errors.push(`Phase "${params.phase}" not found`);
        else phase.tasks = [];
      } else {
        for (const phase of phases) phase.tasks = [];
      }
      break;
    }
    case "view":
      return { phases: current, errors };
  }

  if (errors.length === 0) normalize(phases);
  return { phases: errors.length === 0 ? phases : current, errors };
}

function summary(phases: Phase[], errors: string[]): string {
  if (errors.length > 0) return `Errors: ${errors.join("; ")}`;
  if (phases.length === 0 || phases.every((phase) => phase.tasks.length === 0)) return "Todo list is empty.";
  const lines: string[] = [];
  for (const [index, phase] of phases.entries()) {
    const done = phase.tasks.filter((task) => task.status === "completed" || task.status === "abandoned").length;
    lines.push(`${index + 1}. ${phase.name} (${done}/${phase.tasks.length})`);
    for (const [taskIndex, task] of phase.tasks.entries()) {
      const branch = taskIndex === phase.tasks.length - 1 ? "└─" : "├─";
      const marker = task.status === "completed" ? "x" : task.status === "abandoned" ? "-" : task.status === "in_progress" ? "/" : task.status === "blocked" ? "!" : " ";
      const blocker = task.blocker ? ` — ${task.blocker}` : "";
      lines.push(`   ${branch} [${marker}] ${task.content}${blocker}`);
    }
  }
  return lines.join("\n");
}

function mutationText(params: Params, phases: Phase[]): string {
  const status: Record<string, string> = {
    start: "in_progress",
    done: "completed",
    drop: "abandoned",
    block: "blocked",
    unblock: "pending",
  };
  if (params.op in status) {
    const target = params.task ?? (params.phase ? `${params.phase} tasks` : "all tasks");
    return `update ${target} to ${status[params.op]}`;
  }
  if (params.op === "append") return `append ${params.items?.join(", ") ?? "tasks"} to ${params.phase ?? "Tasks"}`;
  if (params.op === "init") return `initialize todo list (${phases.reduce((count, phase) => count + phase.tasks.length, 0)} tasks)`;
  if (params.op === "rm") return `remove ${params.task ?? (params.phase ? `${params.phase} tasks` : "all tasks")}`;
  return summary(phases, []);
}

function renderWidget(ctx: ExtensionContext, phases: Phase[]): void {
  const tasks = phases.flatMap((phase) => phase.tasks);
  if (tasks.length === 0) {
    ctx.ui.setWidget(WIDGET_KEY, undefined);
    return;
  }
  const done = tasks.filter((task) => task.status === "completed" || task.status === "abandoned").length;
  const lines = [ctx.ui.theme.fg("accent", `☑ Todos ${done}/${tasks.length}`)];
  for (const [phaseIndex, phase] of phases.entries()) {
    const phaseIsLast = phaseIndex === phases.length - 1;
    const phaseBranch = phaseIsLast ? "└─" : "├─";
    const childPrefix = phaseIsLast ? "   " : "│  ";
    lines.push(ctx.ui.theme.fg("dim", `${phaseBranch} ${phase.name}`));
    for (const [taskIndex, task] of phase.tasks.entries()) {
      const branch = taskIndex === phase.tasks.length - 1 ? "└─" : "├─";
      const marker = task.status === "completed" ? "✓" : task.status === "abandoned" ? "-" : task.status === "in_progress" ? "●" : task.status === "blocked" ? "!" : "○";
      const color = task.status === "completed" ? "success" : task.status === "blocked" ? "warning" : task.status === "in_progress" ? "accent" : "muted";
      lines.push(`${childPrefix}${ctx.ui.theme.fg("dim", branch)} ${ctx.ui.theme.fg(color, marker)} ${task.content}`);
    }
  }
  ctx.ui.setWidget(WIDGET_KEY, lines, { placement: "aboveEditor" });
}

function restore(ctx: ExtensionContext): Phase[] {
  const entries = ctx.sessionManager.getBranch();
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index] as { type?: string; customType?: string; data?: { phases?: Phase[] } };
    if (entry.type === "custom" && entry.customType === ENTRY_TYPE && Array.isArray(entry.data?.phases)) {
      return clone(entry.data.phases);
    }
  }
  return [];
}

function save(pi: ExtensionAPI, ctx: ExtensionContext, phases: Phase[]): void {
  const state = getState(ctx);
  state.phases = clone(phases);
  pi.appendEntry(ENTRY_TYPE, { phases: state.phases });
  renderWidget(ctx, state.phases);
}

function current(ctx: ExtensionContext): Phase[] {
  return getState(ctx).phases;
}

function tokenize(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

export default function (pi: ExtensionAPI): void {
  pi.registerTool({
    name: TOOL_NAME,
    label: "Todo",
    description: "Manage a phased task list. Use one operation at a time: init, start, done, drop, block, unblock, rm, append, or view.",
    promptSnippet: "Manage a phased task list to track multi-step progress",
    promptGuidelines: [
      "Use todo for complex work with 3+ steps or when the user gives multiple tasks.",
      "Exactly one task may be in_progress. Start a task before working; mark it done immediately after finishing.",
      "Use block for work waiting on external input. Keep task and phase names stable and unique.",
      "Never make todo the turn's only tool call; batch it with real work.",
    ],
    parameters: TodoParams,
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const state = getState(ctx);
      const result = apply(state.phases, params as Params);
      if (result.errors.length === 0 && params.op !== "view") save(pi, ctx, result.phases);
      return {
        content: [{ type: "text", text: result.errors.length > 0 ? summary(result.phases, result.errors) : params.op === "view" ? summary(result.phases, []) : mutationText(params as Params, result.phases) }],
        details: { phases: clone(result.phases), op: params.op },
        isError: result.errors.length > 0 ? true : undefined,
      };
    },
  });

  pi.registerCommand("todo", {
    description: "Show or edit the current todo list",
    handler: async (args, ctx) => {
      const phases = current(ctx);
      const tokens = tokenize(args);
      const verb = tokens[0]?.toLowerCase();
      if (!verb || verb === "view") {
        ctx.ui.notify(summary(phases, []), "info");
        return;
      }
      if (verb === "expand" || verb === "collapse") {
        ctx.ui.notify("Use the todo HUD above the editor.", "info");
        return;
      }
      if (verb === "append") {
        const phase = tokens.length > 2 ? tokens[1] : "Tasks";
        const content = tokens.length > 2 ? tokens.slice(2).join(" ") : tokens.slice(1).join(" ");
        if (!content) {
          ctx.ui.notify("Usage: /todo append [phase] task", "error");
          return;
        }
        const result = apply(phases, { op: "append", phase, items: [content] });
        if (result.errors.length > 0) ctx.ui.notify(summary(phases, result.errors), "error");
        else {
          save(pi, ctx, result.phases);
          ctx.ui.notify(`Appended: ${content}`, "info");
        }
        return;
      }
      const content = tokens.slice(1).join(" ");
      const op = verb === "start" || verb === "done" || verb === "drop" || verb === "rm" ? verb : undefined;
      if (!op) {
        ctx.ui.notify("Usage: /todo [append|start|done|drop|rm] ...", "error");
        return;
      }
      const result = apply(phases, { op, ...(content ? { task: content } : {}) } as Params);
      if (result.errors.length > 0) ctx.ui.notify(summary(phases, result.errors), "error");
      else {
        save(pi, ctx, result.phases);
        ctx.ui.notify(summary(result.phases, []), "info");
      }
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    const phases = restore(ctx);
    states.set(sessionKey(ctx), { phases, sessionKey: sessionKey(ctx) });
    activeContext = ctx;
    renderWidget(ctx, phases);
  });

  pi.on("session_compact", async (_event, ctx) => {
    activeContext = ctx;
    renderWidget(ctx, current(ctx));
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    states.delete(sessionKey(ctx));
    if (activeContext && sessionKey(activeContext) === sessionKey(ctx)) {
      ctx.ui.setWidget(WIDGET_KEY, undefined);
      activeContext = undefined;
    }
  });
}
