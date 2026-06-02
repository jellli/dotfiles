/**
 * Standalone Todo Extension
 *
 * A lightweight, always-available todo tool for the LLM to track what to do
 * next. Useful in any mode — plan, build, or none.
 *
 * Features:
 * - `todo` tool: create, update (status/text/activeForm), list (filtered), clear
 * - 3-state status machine: pending → in_progress → completed
 * - `/todos` command: interactive TUI viewer grouped by status
 * - Widget above editor showing pending/in_progress/completed
 * - Footer status showing active/completed counts
 * - State persisted via toolResult details, replayed from branch on reload
 * - Auto-hides completed tasks from widget after next agent turn
 * - Handles session_start, session_tree, session_compact with stale-ctx guard
 */

import type {
  ExtensionAPI,
  ExtensionContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import { matchesKey, Text, truncateToWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";

// --- Types ---

type TaskStatus = "pending" | "in_progress" | "completed";

interface Task {
  id: number;
  text: string;
  status: TaskStatus;
  activeForm?: string;
}

interface TaskState {
  tasks: Task[];
  nextId: number;
}

// --- Schema ---

const TodoParams = Type.Object({
  action: Type.Union(
    [
      Type.Literal("create", { description: "Create a new task" }),
      Type.Literal("update", {
        description: "Update a task's status, text, or activeForm",
      }),
      Type.Literal("list", {
        description: "List all tasks, optionally filtered by status",
      }),
      Type.Literal("clear", { description: "Clear all tasks" }),
    ],
    { description: "Action to perform" },
  ),
  text: Type.Optional(
    Type.String({ description: "Task text or subject (required for create)" }),
  ),
  id: Type.Optional(
    Type.Number({ description: "Task ID (required for update)" }),
  ),
  status: Type.Optional(
    Type.Union(
      [
        Type.Literal("pending"),
        Type.Literal("in_progress"),
        Type.Literal("completed"),
      ],
      { description: "Target status for update, or filter for list" },
    ),
  ),
  activeForm: Type.Optional(
    Type.String({
      description:
        "Present-continuous label shown in widget while in_progress (e.g. 'researching API')",
    }),
  ),
  statusFilter: Type.Optional(
    Type.Union(
      [
        Type.Literal("pending"),
        Type.Literal("in_progress"),
        Type.Literal("completed"),
      ],
      { description: "Filter list by status" },
    ),
  ),
});

// --- State ---

const MAX_WIDGET_ITEMS = 12;

function createEmptyState(): TaskState {
  return { tasks: [], nextId: 1 };
}

/** Replay state from the last `todo` toolResult on the branch. */
function replayFromBranch(ctx: ExtensionContext): TaskState {
  for (const entry of ctx.sessionManager.getBranch()) {
    const e = entry as {
      type?: string;
      message?: {
        role?: string;
        toolName?: string;
        details?: { tasks?: Task[]; nextId?: number };
      };
    };
    if (e.type !== "message") continue;
    const msg = e.message;
    if (msg?.role !== "toolResult" || msg.toolName !== "todo") continue;
    if (!msg.details || !Array.isArray(msg.details.tasks)) continue;
    return {
      tasks: msg.details.tasks.map((t) => ({ ...t })),
      nextId: msg.details.nextId ?? 1,
    };
  }
  return createEmptyState();
}

// --- Pure reducer ---

function applyMutation(
  state: TaskState,
  action: string,
  params: {
    text?: string;
    id?: number;
    status?: TaskStatus;
    activeForm?: string;
    statusFilter?: TaskStatus;
  },
): { state: TaskState; error?: string } {
  switch (action) {
    case "create": {
      if (!params.text?.trim()) {
        return { state, error: "text is required for create" };
      }
      const newTask: Task = {
        id: state.nextId,
        text: params.text.trim(),
        status: "pending",
        activeForm: params.activeForm,
      };
      return {
        state: { tasks: [...state.tasks, newTask], nextId: state.nextId + 1 },
      };
    }

    case "update": {
      if (params.id === undefined) {
        return { state, error: "id is required for update" };
      }
      const idx = state.tasks.findIndex((t) => t.id === params.id);
      if (idx === -1) {
        return { state, error: `Task #${params.id} not found` };
      }

      // Validate status transition
      if (params.status) {
        const current = state.tasks[idx].status;
        const valid = isValidTransition(current, params.status);
        if (!valid) {
          return {
            state,
            error: `Cannot transition from ${current} to ${params.status}`,
          };
        }
      }

      const updated = { ...state.tasks[idx] };
      if (params.text !== undefined) updated.text = params.text;
      if (params.status !== undefined) updated.status = params.status;
      if (params.activeForm !== undefined)
        updated.activeForm = params.activeForm;

      const newTasks = [...state.tasks];
      newTasks[idx] = updated;
      return { state: { ...state, tasks: newTasks } };
    }

    case "list": {
      return { state }; // no mutation — execute handler uses state directly
    }

    case "clear": {
      return { state: createEmptyState() };
    }

    default:
      return { state, error: `Unknown action: ${action}` };
  }
}

function isValidTransition(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return true;
  // Can go forward, but not back from completed
  if (from === "completed") return false;
  // pending <-> in_progress, either -> completed
  return true;
}

// --- Widget ---

/** IDs of tasks completed since the last agent_start — hidden from widget on next turn. */
let recentlyCompletedIds: Set<number> = new Set();

function updateWidget(ctx: ExtensionContext, state: TaskState): void {
  if (state.tasks.length === 0) {
    ctx.ui.setWidget("todo-widget", undefined);
    return;
  }

  // Filter out recently-completed items (auto-hide after agent_start)
  const visible = state.tasks.filter((t) => !recentlyCompletedIds.has(t.id));
  if (visible.length === 0) {
    ctx.ui.setWidget("todo-widget", undefined);
    return;
  }

  const display = visible.slice(0, MAX_WIDGET_ITEMS);
  const lines = display.map((task) => {
    if (task.status === "completed") {
      return (
        ctx.ui.theme.fg("success", "✓ ") +
        ctx.ui.theme.fg(
          "muted",
          ctx.ui.theme.strikethrough(`#${task.id} ${task.text}`),
        )
      );
    }
    if (task.status === "in_progress") {
      const label = task.activeForm
        ? ` ${ctx.ui.theme.fg("accent", task.activeForm)}`
        : "";
      return `${ctx.ui.theme.fg("accent", "◐")} ${ctx.ui.theme.fg("text", `#${task.id} ${task.text}`)}${label}`;
    }
    // pending
    return `${ctx.ui.theme.fg("muted", "○")} ${ctx.ui.theme.fg("text", `#${task.id} ${task.text}`)}`;
  });

  if (visible.length > MAX_WIDGET_ITEMS) {
    const remaining = visible.length - MAX_WIDGET_ITEMS;
    lines.push(ctx.ui.theme.fg("dim", `...and ${remaining} more`));
  }

  ctx.ui.setWidget("todo-widget", lines);
}

function updateStatus(ctx: ExtensionContext, state: TaskState): void {
  if (state.tasks.length === 0) {
    ctx.ui.setStatus("todo-status", undefined);
    return;
  }

  const done = state.tasks.filter((t) => t.status === "completed").length;
  const active = state.tasks.filter((t) => t.status === "in_progress").length;
  const total = state.tasks.length;
  const parts: string[] = [];
  if (active > 0) parts.push(ctx.ui.theme.fg("accent", `◐ ${active}`));
  if (done > 0) parts.push(ctx.ui.theme.fg("success", `✓ ${done}`));
  parts.push(ctx.ui.theme.fg("muted", `${total}`));
  ctx.ui.setStatus("todo-status", parts.join(" "));
}

// --- TUI Component ---

class TodoListComponent {
  private state: TaskState;
  private theme: Theme;
  private onClose: () => void;
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(state: TaskState, theme: Theme, onClose: () => void) {
    this.state = state;
    this.theme = theme;
    this.onClose = onClose;
  }

  handleInput(data: string): void {
    if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
      this.onClose();
    }
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    const { theme, state, onClose: _onClose } = this;
    const lines: string[] = [];
    const add = (s: string) => lines.push(truncateToWidth(s, width));

    add("");
    const title = theme.fg("accent", " Tasks ");
    const headerLine =
      theme.fg("borderMuted", "─".repeat(3)) +
      title +
      theme.fg("borderMuted", "─".repeat(Math.max(0, width - 10)));
    add(headerLine);
    add("");

    if (state.tasks.length === 0) {
      add(
        truncateToWidth(
          `  ${theme.fg("dim", "No tasks yet. Ask the agent to create some!")}`,
          width,
        ),
      );
    } else {
      const done = state.tasks.filter((t) => t.status === "completed").length;
      const active = state.tasks.filter(
        (t) => t.status === "in_progress",
      ).length;
      const pending = state.tasks.filter((t) => t.status === "pending").length;
      const total = state.tasks.length;
      const summary: string[] = [];
      if (active > 0) summary.push(theme.fg("accent", `${active} active`));
      summary.push(theme.fg("muted", `${done}/${total} completed`));
      add(truncateToWidth(`  ${summary.join(" · ")}`, width));
      add("");

      // Pending group
      const pendingTasks = state.tasks.filter((t) => t.status === "pending");
      if (pendingTasks.length > 0) {
        add(truncateToWidth(`  ${theme.fg("dim", "── Pending ──")}`, width));
        for (const t of pendingTasks) {
          add(
            truncateToWidth(
              `  ${theme.fg("dim", "○")} ${theme.fg("accent", `#${t.id}`)} ${theme.fg("text", t.text)}`,
              width,
            ),
          );
        }
        add("");
      }

      // In-progress group
      const activeTasks = state.tasks.filter((t) => t.status === "in_progress");
      if (activeTasks.length > 0) {
        add(
          truncateToWidth(
            `  ${theme.fg("accent", "── In Progress ──")}`,
            width,
          ),
        );
        for (const t of activeTasks) {
          const label = t.activeForm
            ? ` ${theme.fg("accent", t.activeForm)}`
            : "";
          add(
            truncateToWidth(
              `  ${theme.fg("accent", "◐")} ${theme.fg("accent", `#${t.id}`)} ${theme.fg("text", t.text)}${label}`,
              width,
            ),
          );
        }
        add("");
      }

      // Completed group
      const doneTasks = state.tasks.filter((t) => t.status === "completed");
      if (doneTasks.length > 0) {
        add(
          truncateToWidth(`  ${theme.fg("success", "── Completed ──")}`, width),
        );
        for (const t of doneTasks) {
          add(
            truncateToWidth(
              `  ${theme.fg("success", "✓")} ${theme.fg("accent", `#${t.id}`)} ${theme.fg("dim", t.text)}`,
              width,
            ),
          );
        }
        add("");
      }
    }

    add(
      truncateToWidth(`  ${theme.fg("dim", "Press Escape to close")}`, width),
    );
    add("");

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}

// --- Extension ---

function isStaleCtxError(e: unknown): boolean {
  return /stale after session replacement/.test(String(e));
}

function formatTaskLine(task: Task, theme: Theme): string {
  if (task.status === "completed") {
    return `${theme.fg("success", "✓")} ${theme.fg("accent", `#${task.id}`)} ${theme.fg("dim", task.text)}`;
  }
  if (task.status === "in_progress") {
    const label = task.activeForm
      ? ` ${theme.fg("accent", task.activeForm)}`
      : "";
    return `${theme.fg("accent", "◐")} ${theme.fg("accent", `#${task.id}`)} ${theme.fg("text", task.text)}${label}`;
  }
  return `${theme.fg("dim", "○")} ${theme.fg("accent", `#${task.id}`)} ${theme.fg("text", task.text)}`;
}

export default function todoExtension(pi: ExtensionAPI): void {
  let state: TaskState = createEmptyState();

  // Update UI (widget + status)
  function refreshUI(ctx: ExtensionContext): void {
    updateWidget(ctx, state);
    updateStatus(ctx, state);
  }

  // Register the todo tool
  pi.registerTool({
    name: "todo",
    label: "Todo",
    description:
      "Manage a task list for tracking multi-step progress. Actions: create (new task), update (change status/text/activeForm), list (all tasks, optionally filtered by status), clear (reset all). Status: pending → in_progress → completed.",
    promptSnippet:
      "Manage a task list to track multi-step progress — create, update status, list, or clear tasks",
    promptGuidelines: [
      "Use `todo` for complex work with 3+ steps, when the user gives you a list of tasks, or immediately after receiving new instructions to capture requirements. Skip it for single trivial tasks and purely conversational requests.",
      "When starting any task, mark it in_progress BEFORE beginning work. Mark it completed IMMEDIATELY when done — never batch completions. Exactly one task should be in_progress at a time.",
      "Never mark a task completed if tests are failing, the implementation is partial, or you hit unresolved errors — keep it in_progress and create a new task for the blocker instead.",
      "Task status is a 3-state machine: pending → in_progress → completed. Pass activeForm (present-continuous label, e.g. 'researching existing tool') when marking in_progress.",
      "Use list to see all tasks, optionally filtered by status with statusFilter. Call clear only when ALL tasks are truly done.",
      "Subject must be short and imperative (e.g. 'Research existing tool'); activeForm is a present-continuous label shown while in_progress.",
    ],
    parameters: TodoParams,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = applyMutation(
        state,
        params.action as string,
        params as Record<string, unknown>,
      );

      if (result.error) {
        return {
          content: [{ type: "text", text: `Error: ${result.error}` }],
          details: {
            error: result.error,
            tasks: state.tasks,
            nextId: state.nextId,
          },
        };
      }

      state = result.state;

      // Persist: no custom entry — replay reads from toolResult details
      refreshUI(ctx);

      // Track newly-completed IDs for overlay auto-hide
      if (
        params.action === "update" &&
        params.status === "completed" &&
        params.id !== undefined
      ) {
        recentlyCompletedIds.add(params.id as number);
      }

      switch (params.action as string) {
        case "create": {
          const newTask = state.tasks[state.tasks.length - 1];
          return {
            content: [
              {
                type: "text",
                text: `Created task #${newTask.id}: ${newTask.text} (${newTask.status})`,
              },
            ],
            details: { tasks: state.tasks, nextId: state.nextId },
          };
        }

        case "update": {
          const task = state.tasks.find((t) => t.id === params.id);
          return {
            content: [
              {
                type: "text",
                text: task
                  ? `Task #${task.id} → ${task.status}${task.activeForm ? ` (${task.activeForm})` : ""}`
                  : `Task #${params.id} updated`,
              },
            ],
            details: { tasks: state.tasks, nextId: state.nextId },
          };
        }

        case "list": {
          const filter = params.statusFilter as TaskStatus | undefined;
          const display = filter
            ? state.tasks.filter((t) => t.status === filter)
            : state.tasks;
          if (display.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: filter ? `No ${filter} tasks` : "No tasks",
                },
              ],
              details: { tasks: state.tasks, nextId: state.nextId },
            };
          }
          const header = filter
            ? `Tasks (${filter}):`
            : `${display.length} task(s):`;
          const body = display
            .map((t) => {
              const s =
                t.status === "completed"
                  ? "x"
                  : t.status === "in_progress"
                    ? ">"
                    : " ";
              const af = t.activeForm ? ` (${t.activeForm})` : "";
              return `[${s}] #${t.id}: ${t.text}${af}`;
            })
            .join("\n");
          return {
            content: [{ type: "text", text: `${header}\n${body}` }],
            details: { tasks: state.tasks, nextId: state.nextId },
          };
        }

        case "clear": {
          return {
            content: [{ type: "text", text: "All tasks cleared" }],
            details: { tasks: state.tasks, nextId: state.nextId },
          };
        }

        default:
          return {
            content: [
              { type: "text", text: `Unknown action: ${params.action}` },
            ],
            details: { tasks: state.tasks, nextId: state.nextId },
          };
      }
    },

    renderCall(args, theme, _context) {
      let text =
        theme.fg("toolTitle", theme.bold("todo ")) +
        theme.fg("muted", args.action);
      if (args.text) text += ` ${theme.fg("dim", `"${args.text}"`)}`;
      if (args.id !== undefined)
        text += ` ${theme.fg("accent", `#${args.id}`)}`;
      if (args.status) text += ` ${theme.fg("muted", `→ ${args.status}`)}`;
      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded }, theme, _context) {
      const details = result.details as
        | { tasks?: Task[]; nextId?: number; error?: string }
        | undefined;
      if (!details) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text : "", 0, 0);
      }

      if (details.error) {
        return new Text(theme.fg("error", `Error: ${details.error}`), 0, 0);
      }

      const tasks = details.tasks ?? [];
      const action = (result.content[0] as { text?: string })?.text ?? "";

      if (action.startsWith("No") || action.startsWith("All")) {
        return new Text(theme.fg("dim", action), 0, 0);
      }

      if (tasks.length > 0 && action.includes(":")) {
        // list action
        let listText = theme.fg("muted", action);
        const display = expanded ? tasks : tasks.slice(0, 5);
        for (const t of display) {
          listText += `\n${formatTaskLine(t, theme)}`;
        }
        if (!expanded && tasks.length > 5) {
          listText += `\n${theme.fg("dim", `... ${tasks.length - 5} more`)}`;
        }
        return new Text(listText, 0, 0);
      }

      return new Text(theme.fg("success", action), 0, 0);
    },
  });

  // Register /todos command
  pi.registerCommand("todos", {
    description: "Show all tasks, grouped by status",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("/todos requires interactive mode", "error");
        return;
      }

      await ctx.ui.custom<void>((_tui, theme, _kb, done) => {
        return new TodoListComponent(state, theme, () => done());
      });
    },
  });

  // Reconstruct state on session events
  pi.on("session_start", async (_event, ctx) => {
    state = replayFromBranch(ctx);
    recentlyCompletedIds = new Set();
    refreshUI(ctx);
  });

  pi.on("session_tree", async (_event, ctx) => {
    state = replayFromBranch(ctx);
    refreshUI(ctx);
  });

  pi.on("session_compact", async (_event, ctx) => {
    try {
      state = replayFromBranch(ctx);
    } catch (e) {
      if (!isStaleCtxError(e)) throw e;
    }
    if (ctx.hasUI) {
      refreshUI(ctx);
    }
  });

  pi.on("agent_start", async () => {
    recentlyCompletedIds = new Set();
  });
}
