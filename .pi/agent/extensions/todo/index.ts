/**
 * Local fork of oh-my-pi's todo feature.
 *
 * Keeps only the session todo tool, `/todo` command, persistence, and HUD.
 * Adapted to pi's public ExtensionAPI; OMP's core-only imports are not used.
 */
import { Type } from "typebox";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { applyTodoState, cloneTodoState, type TodoCommand as Params, type TodoItem as Item, type TodoPhase as Phase } from "./todo-state.js";
import { createToolAggregation } from "../ui/lib/aggregation.js";

const TOOL_NAME = "todo";
const ENTRY_TYPE = "oh-my-pi-todo";
const REMINDER_TYPE = "oh-my-pi-todo-reminder";
const WIDGET_KEY = "oh-my-pi-todo";
const REMINDER_LIMIT = 3;
const HUD_ACTIVE_TASK_LIMIT = 5;
const HUD_FOLLOWING_PHASE_LIMIT = 3;
// Keep completed HUDs visible briefly without removing persisted session state.
const HUD_CLEAR_DELAY_MS = 60_000;

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


type State = {
  phases: Phase[];
  sessionKey: string;
  expanded: boolean;
  reminderCount: number;
  awaitingProgress: boolean;
  clearTimer?: ReturnType<typeof setTimeout>;
  lastAssistantText?: string;
  // Set when the HUD was auto-cleared once; suppresses re-render while all tasks stay closed.
  hudAutoCleared: boolean;
};
const states = new Map<string, State>();
function clone(phases: Phase[]): Phase[] {
  return cloneTodoState(phases);
}

function sessionKey(ctx: ExtensionContext): string {
  return ctx.sessionManager.getSessionId();
}

function getState(ctx: ExtensionContext): State {
  const key = sessionKey(ctx);
  let state = states.get(key);
  if (!state) {
    state = { phases: [], sessionKey: key, expanded: false, reminderCount: 0, awaitingProgress: false, hudAutoCleared: false };
    states.set(key, state);
  }
  return state;
}



function apply(current: Phase[], params: Params): { phases: Phase[]; errors: ReturnType<typeof applyTodoState>["errors"] } {
  const result = applyTodoState(current, params);
  return { phases: result.state, errors: result.errors };
}

function formatError(error: ReturnType<typeof applyTodoState>["errors"][number], op?: Params["op"]): string {
  switch (error.code) {
    case "missing_list": return "Missing list for init operation";
    case "duplicate_phase": return `Duplicate phase "${error.phase}"`;
    case "duplicate_task": return `Task "${error.task}" already exists`;
    case "missing_phase": return "Missing phase name for append operation";
    case "missing_items": return "Missing items for append operation";
    case "missing_task": return "Missing task content";
    case "task_not_found": return `Task "${error.task}" not found`;
    case "phase_not_found": return `Phase "${error.phase}" not found`;
    case "target_required": return op ? `${op} requires a task or phase target` : "block or unblock requires a task or phase target";
  }
}

function formatErrors(errors: ReturnType<typeof applyTodoState>["errors"], op?: Params["op"]): string[] {
  return errors.map((error) => formatError(error, op));
}

function summary(phases: Phase[], errors: ReturnType<typeof applyTodoState>["errors"], op?: Params["op"]): string {
  if (errors.length > 0) return `Errors: ${formatErrors(errors, op).join("; ")}`;
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

function isOpen(task: Item): boolean {
  return task.status === "pending" || task.status === "in_progress";
}

function isClosed(task: Item): boolean {
  return task.status === "completed" || task.status === "abandoned";
}

function cancelHudClear(state: State): void {
  if (state.clearTimer !== undefined) clearTimeout(state.clearTimer);
  state.clearTimer = undefined;
}

function syncHudClear(pi: ExtensionAPI, ctx: ExtensionContext, state: State): void {
  cancelHudClear(state);
  if (ctx.mode !== "tui") return;
  const tasks = state.phases.flatMap((phase) => phase.tasks);
  if (tasks.length === 0 || !tasks.every(isClosed)) return;

  const key = state.sessionKey;
  state.clearTimer = setTimeout(() => {
    // A replaced session owns a different state object, so its HUD must not be cleared.
    if (states.get(key) !== state) return;
    state.clearTimer = undefined;
    try {
      ctx.ui.setWidget(WIDGET_KEY, undefined);
      // Persist the flag so a reload does not resurrect an already-cleared HUD.
      state.hudAutoCleared = true;
      pi.appendEntry(ENTRY_TYPE, { phases: state.phases, hudAutoCleared: true });
    } catch {
      // The replacement session will restore its own widget and clear timer.
    }
  }, HUD_CLEAR_DELAY_MS);
  state.clearTimer.unref();
}

function renderWidget(ctx: ExtensionContext, phases: Phase[], expanded = false): void {
  const state = getState(ctx);
  const tasks = phases.flatMap((phase) => phase.tasks);
  if (tasks.length === 0) {
    ctx.ui.setWidget(WIDGET_KEY, undefined);
    return;
  }
  // Already auto-cleared once and nothing reopened: keep it hidden (e.g. after /reload).
  if (tasks.every(isClosed) && state.hudAutoCleared) return;
  const done = tasks.filter((task) => task.status === "completed" || task.status === "abandoned").length;
  const lines = [ctx.ui.theme.fg("accent", `Todos ${done}/${tasks.length}`)];
  const activePhaseIndex = Math.max(0, phases.findIndex((phase) => phase.tasks.some(isOpen)));
  const visiblePhases = expanded
    ? phases.map((phase, index) => ({ phase, index }))
    : phases.slice(activePhaseIndex, activePhaseIndex + HUD_FOLLOWING_PHASE_LIMIT + 1).map((phase, offset) => ({ phase, index: activePhaseIndex + offset }));

  if (!expanded && activePhaseIndex > 0) {
    lines.push(ctx.ui.theme.fg("dim", `… ${activePhaseIndex} earlier phase${activePhaseIndex === 1 ? "" : "s"}`));
  }

  for (const [visibleIndex, entry] of visiblePhases.entries()) {
    const { phase, index: phaseIndex } = entry;
    const phaseIsLast = visibleIndex === visiblePhases.length - 1;
    const phaseBranch = phaseIsLast ? "└─" : "├─";
    const childPrefix = phaseIsLast ? "   " : "│  ";
    const phaseDone = phase.tasks.filter(isClosed).length;
    const phaseColor = phaseDone === phase.tasks.length ? "dim" : "text";
    lines.push(ctx.ui.theme.fg(phaseColor, `${phaseBranch} ${phase.name} (${phaseDone}/${phase.tasks.length})`));

    if (!expanded && phaseIndex !== activePhaseIndex) continue;

    const activeTaskIndex = phase.tasks.findIndex(isOpen);
    const firstTask = expanded ? 0 : Math.max(0, activeTaskIndex - 1);
    const lastTask = expanded ? phase.tasks.length : Math.min(phase.tasks.length, firstTask + HUD_ACTIVE_TASK_LIMIT);
    const shownTasks = phase.tasks.slice(firstTask, lastTask);
    const hiddenTasks = phase.tasks.length - lastTask;
    const rows: Array<Item | string> = [...shownTasks];
    if (hiddenTasks > 0) rows.push(`… ${hiddenTasks} more task${hiddenTasks === 1 ? "" : "s"}`);

    for (const [taskIndex, row] of rows.entries()) {
      const branch = taskIndex === rows.length - 1 ? "└─" : "├─";
      if (typeof row === "string") {
        lines.push(`${childPrefix}${ctx.ui.theme.fg("dim", branch)} ${ctx.ui.theme.fg("dim", row)}`);
        continue;
      }
      const task = row;
      const marker = task.status === "completed" ? "✓" : task.status === "abandoned" ? "-" : task.status === "in_progress" ? "●" : task.status === "blocked" ? "!" : "○";
      const markerColor = isClosed(task) ? "dim" : task.status === "blocked" ? "warning" : task.status === "in_progress" ? "text" : "muted";
      const textColor = isClosed(task) ? "dim" : task.status === "in_progress" ? "text" : "muted";
      lines.push(`${childPrefix}${ctx.ui.theme.fg("dim", branch)} ${ctx.ui.theme.fg(markerColor, marker)} ${ctx.ui.theme.fg(textColor, task.content)}`);
    }
  }
  const hiddenPhases = phases.length - activePhaseIndex - visiblePhases.length;
  if (!expanded && hiddenPhases > 0) {
    lines.push(ctx.ui.theme.fg("dim", `… ${hiddenPhases} more phase${hiddenPhases === 1 ? "" : "s"}`));
  }
  ctx.ui.setWidget(WIDGET_KEY, lines, { placement: "aboveEditor" });
}

function restore(ctx: ExtensionContext): Phase[] {
  // Read the most recent snapshot from the active session branch.
  const entries = ctx.sessionManager.getBranch();
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index] as { type?: string; customType?: string; data?: { phases?: Phase[] } };
    if (entry.type === "custom" && entry.customType === ENTRY_TYPE && Array.isArray(entry.data?.phases)) {
      return clone(entry.data.phases);
    }
  }
  return [];
}

function restoreHudAutoCleared(ctx: ExtensionContext): boolean {
  const entries = ctx.sessionManager.getBranch();
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index] as { type?: string; customType?: string; data?: { hudAutoCleared?: boolean } };
    if (entry.type === "custom" && entry.customType === ENTRY_TYPE && typeof entry.data?.hudAutoCleared === "boolean") {
      return entry.data.hudAutoCleared;
    }
  }
  return false;
}

function save(pi: ExtensionAPI, ctx: ExtensionContext, phases: Phase[]): void {
  const state = getState(ctx);
  state.phases = clone(phases);
  state.reminderCount = 0;
  state.awaitingProgress = false;
  // New open work must bring the HUD back even if it was auto-cleared before.
  if (phases.flatMap((phase) => phase.tasks).some(isOpen)) state.hudAutoCleared = false;
  // Persist immutable snapshots so restore works across compaction and resume.
  pi.appendEntry(ENTRY_TYPE, { phases: state.phases, hudAutoCleared: state.hudAutoCleared });
  renderWidget(ctx, state.phases, state.expanded);
  syncHudClear(pi, ctx, state);
}

function current(ctx: ExtensionContext): Phase[] {
  return getState(ctx).phases;
}

function tokenize(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

function incomplete(phases: Phase[]): Array<{ phase: string; task: Item }> {
  return phases.flatMap((phase) => phase.tasks.filter(isOpen).map((task) => ({ phase: phase.name, task })));
}

function assistantText(messages: unknown[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index] as { role?: string; content?: unknown };
    if (message.role !== "assistant") continue;
    if (typeof message.content === "string") return message.content;
    if (!Array.isArray(message.content)) continue;
    return message.content
      .filter((part): part is { type?: string; text: string } => typeof part === "object" && part !== null && typeof (part as { text?: unknown }).text === "string")
      .map((part) => part.text)
      .join("\n");
  }
  return undefined;
}

function awaitsUserReply(text: string | undefined): boolean {
  return text?.trim().endsWith("?") || text?.trim().endsWith("？") || false;
}

export default function (pi: ExtensionAPI): void {
  const aggregation = createToolAggregation(pi);

  pi.registerTool(aggregation.wrap({
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
      const p = params as Params;
      const state = getState(ctx);
      const result = apply(state.phases, p);
      if (result.errors.length === 0 && p.op !== "view") save(pi, ctx, result.phases);
      return {
        content: [{ type: "text", text: result.errors.length > 0 ? summary(result.phases, result.errors, p.op) : p.op === "view" ? summary(result.phases, []) : mutationText(p, result.phases) }],
        details: { phases: clone(result.phases), op: p.op },
        isError: result.errors.length > 0 ? true : undefined,
      };
    },
  }, {
    line: (args, theme) => {
      const params = args as Params;
      const target = params.task ?? params.phase ?? params.items?.join(", ") ?? "";
      return theme.fg("toolOutput", `${params.op}${target ? ` ${target}` : ""}`);
    },
  }));

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
        const state = getState(ctx);
        state.expanded = verb === "expand";
        renderWidget(ctx, state.phases, state.expanded);
        ctx.ui.notify(`Todo HUD ${state.expanded ? "expanded" : "collapsed"}.`, "info");
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
    const previous = states.get(sessionKey(ctx));
    if (previous) cancelHudClear(previous);
    const phases = restore(ctx);
    states.set(sessionKey(ctx), {
      phases,
      sessionKey: sessionKey(ctx),
      expanded: false,
      reminderCount: 0,
      awaitingProgress: false,
      hudAutoCleared: restoreHudAutoCleared(ctx),
    });
    renderWidget(ctx, phases);
    syncHudClear(pi, ctx, getState(ctx));
  });

  pi.on("session_compact", async (_event, ctx) => {
    const state = getState(ctx);
    renderWidget(ctx, state.phases, state.expanded);
    syncHudClear(pi, ctx, state);
  });

  pi.on("input", async (_event, ctx) => {
    const state = getState(ctx);
    state.reminderCount = 0;
    state.awaitingProgress = false;
    state.lastAssistantText = undefined;
  });

  pi.on("agent_start", async (_event, ctx) => {
    getState(ctx).lastAssistantText = undefined;
  });

  pi.on("tool_execution_end", async (_event, ctx) => {
    getState(ctx).awaitingProgress = false;
  });

  pi.on("agent_end", async (event, ctx) => {
    getState(ctx).lastAssistantText = assistantText(event.messages);
  });

  pi.on("agent_settled", async (_event, ctx) => {
    const state = getState(ctx);
    const open = incomplete(state.phases);
    // Only continue idle interactive turns; queued work and user questions must win.
    if (
      open.length === 0 ||
      state.awaitingProgress ||
      state.reminderCount >= REMINDER_LIMIT ||
      awaitsUserReply(state.lastAssistantText) ||
      !ctx.isIdle() ||
      ctx.hasPendingMessages() ||
      ctx.mode !== "tui"
    ) {
      return;
    }

    state.reminderCount += 1;
    state.awaitingProgress = true;
    const byPhase = new Map<string, string[]>();
    for (const { phase, task } of open) {
      const tasks = byPhase.get(phase) ?? [];
      tasks.push(task.content);
      byPhase.set(phase, tasks);
    }
    const list = [...byPhase.entries()].map(([phase, tasks]) => `- ${phase}\n${tasks.map((task) => `  - ${task}`).join("\n")}`).join("\n");
    const reminder = [
      "<system-reminder>",
      `You stopped with ${open.length} incomplete todo item(s):`,
      list,
      "",
      "Continue working on these tasks or mark them complete if finished.",
      `(Reminder ${state.reminderCount}/${REMINDER_LIMIT})`,
      "</system-reminder>",
    ].join("\n");
    ctx.ui.notify(`Todo reminder ${state.reminderCount}/${REMINDER_LIMIT}: ${open.length} incomplete task${open.length === 1 ? "" : "s"}.`, "warning");
    // Store the reminder in history but keep this control message out of the transcript.
    pi.sendMessage({ customType: REMINDER_TYPE, content: reminder, display: false }, { triggerTurn: true, deliverAs: "followUp" });
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    const state = states.get(sessionKey(ctx));
    if (state) cancelHudClear(state);
    states.delete(sessionKey(ctx));
    ctx.ui.setWidget(WIDGET_KEY, undefined);
  });
}
