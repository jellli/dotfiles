/**
 * Standalone Todo Extension
 *
 * A lightweight, always-available todo tool for the LLM to track what to do
 * next. Useful in any mode — plan, build, or none.
 *
 * Features:
 * - `todo` tool: add, list, toggle, clear actions
 * - `/todos` command: interactive TUI viewer
 * - Widget above editor showing checklist progress
 * - Footer status showing completion count
 * - State persisted via appendEntry, reconstructed on session start/tree
 * - Branch-aware: tool result details carry full state for correct /tree behavior
 */

import type {
  ExtensionAPI,
  ExtensionContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import { matchesKey, Text, truncateToWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";

// --- Types ---

interface Todo {
  id: number;
  text: string;
  done: boolean;
}

interface TodoState {
  todos: Todo[];
  nextId: number;
}

// --- Schema ---

const TodoParams = Type.Object({
  action: Type.Union(
    [
      Type.Literal("add", { description: "Add a new todo" }),
      Type.Literal("list", { description: "List all todos" }),
      Type.Literal("toggle", { description: "Toggle a todo's done status" }),
      Type.Literal("clear", { description: "Clear all todos" }),
    ],
    { description: "Action to perform" },
  ),
  text: Type.Optional(
    Type.String({ description: "Todo text (required for add)" }),
  ),
  id: Type.Optional(
    Type.Number({ description: "Todo ID (required for toggle)" }),
  ),
});

// --- State ---

const MAX_WIDGET_ITEMS = 7;

function createEmptyState(): TodoState {
  return { todos: [], nextId: 1 };
}

/**
 * Reconstruct state from the latest todo-state custom entry in the session.
 * Falls back to scanning tool results for backward compatibility.
 */
function reconstructState(ctx: ExtensionContext): TodoState {
  const entries = ctx.sessionManager.getEntries();

  // Find the latest todo-state custom entry
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i] as {
      type: string;
      customType?: string;
      data?: TodoState;
    };
    if (
      entry.type === "custom" &&
      entry.customType === "todo-state" &&
      entry.data
    ) {
      return {
        todos: entry.data.todos ?? [],
        nextId: entry.data.nextId ?? 1,
      };
    }
  }

  return createEmptyState();
}

// --- Widget ---

function updateWidget(ctx: ExtensionContext, state: TodoState): void {
  if (state.todos.length === 0) {
    ctx.ui.setWidget("todo-widget", undefined);
    return;
  }

  const display = state.todos.slice(0, MAX_WIDGET_ITEMS);
  const lines = display.map((todo) => {
    if (todo.done) {
      return (
        ctx.ui.theme.fg("success", "☑ ") +
        ctx.ui.theme.fg(
          "muted",
          ctx.ui.theme.strikethrough(`#${todo.id} ${todo.text}`),
        )
      );
    }
    return `${ctx.ui.theme.fg("muted", "☐ ")}${ctx.ui.theme.fg("text", `#${todo.id} ${todo.text}`)}`;
  });

  if (state.todos.length > MAX_WIDGET_ITEMS) {
    const remaining = state.todos.length - MAX_WIDGET_ITEMS;
    lines.push(ctx.ui.theme.fg("dim", `...and ${remaining} more`));
  }

  ctx.ui.setWidget("todo-widget", lines);
}

function updateStatus(ctx: ExtensionContext, state: TodoState): void {
  if (state.todos.length === 0) {
    ctx.ui.setStatus("todo-status", undefined);
    return;
  }

  const done = state.todos.filter((t) => t.done).length;
  const total = state.todos.length;
  ctx.ui.setStatus(
    "todo-status",
    ctx.ui.theme.fg("accent", `✓ ${done}/${total}`),
  );
}

// --- TUI Component ---

class TodoListComponent {
  private state: TodoState;
  private theme: Theme;
  private onClose: () => void;
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(state: TodoState, theme: Theme, onClose: () => void) {
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
    const title = theme.fg("accent", " Todos ");
    const headerLine =
      theme.fg("borderMuted", "─".repeat(3)) +
      title +
      theme.fg("borderMuted", "─".repeat(Math.max(0, width - 10)));
    add(headerLine);
    add("");

    if (state.todos.length === 0) {
      add(
        truncateToWidth(
          `  ${theme.fg("dim", "No todos yet. Ask the agent to add some!")}`,
          width,
        ),
      );
    } else {
      const done = state.todos.filter((t) => t.done).length;
      const total = state.todos.length;
      add(
        truncateToWidth(
          `  ${theme.fg("muted", `${done}/${total} completed`)}`,
          width,
        ),
      );
      add("");

      for (const todo of state.todos) {
        const check = todo.done
          ? theme.fg("success", "✓")
          : theme.fg("dim", "○");
        const id = theme.fg("accent", `#${todo.id}`);
        const text = todo.done
          ? theme.fg("dim", todo.text)
          : theme.fg("text", todo.text);
        add(truncateToWidth(`  ${check} ${id} ${text}`, width));
      }
    }

    add("");
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

export default function todoExtension(pi: ExtensionAPI): void {
  let state: TodoState = createEmptyState();

  // Persist state as a custom session entry
  function persistState(): void {
    pi.appendEntry("todo-state", { ...state });
  }

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
      "Manage a todo list. Actions: add (text), list, toggle (id), clear.",
    promptSnippet: "Track what to do next — add, list, toggle, or clear todos",
    promptGuidelines: [
      "Use todo to maintain a running checklist of tasks during multi-step work.",
      "After completing a todo item, call todo with action toggle and the item's id to mark it done.",
      "Call todo action list at the start of a new task sequence to check existing items.",
      "When ALL tasks are done, call todo with action clear to clean up the UI.",
    ],
    parameters: TodoParams,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      switch (params.action) {
        case "add": {
          if (!params.text) {
            return {
              content: [
                { type: "text", text: "Error: text is required for add" },
              ],
              details: { error: "text required" },
            };
          }
          const newTodo: Todo = {
            id: state.nextId++,
            text: params.text,
            done: false,
          };
          state.todos.push(newTodo);
          persistState();
          refreshUI(ctx);
          return {
            content: [
              {
                type: "text",
                text: `Added todo #${newTodo.id}: ${newTodo.text}`,
              },
            ],
            details: { ...state },
          };
        }

        case "list": {
          return {
            content: [
              {
                type: "text",
                text: state.todos.length
                  ? state.todos
                      .map((t) => `[${t.done ? "x" : " "}] #${t.id}: ${t.text}`)
                      .join("\n")
                  : "No todos",
              },
            ],
            details: { ...state },
          };
        }

        case "toggle": {
          if (params.id === undefined) {
            return {
              content: [
                { type: "text", text: "Error: id is required for toggle" },
              ],
              details: { error: "id required", ...state },
            };
          }
          const todo = state.todos.find((t) => t.id === params.id);
          if (!todo) {
            return {
              content: [{ type: "text", text: `Todo #${params.id} not found` }],
              details: { error: `#${params.id} not found`, ...state },
            };
          }
          todo.done = !todo.done;
          persistState();
          refreshUI(ctx);
          return {
            content: [
              {
                type: "text",
                text: `Todo #${todo.id} ${todo.done ? "completed" : "uncompleted"}`,
              },
            ],
            details: { ...state },
          };
        }

        case "clear": {
          const count = state.todos.length;
          state = createEmptyState();
          persistState();
          refreshUI(ctx);
          return {
            content: [{ type: "text", text: `Cleared ${count} todo(s)` }],
            details: { ...state },
          };
        }

        default:
          return {
            content: [
              { type: "text", text: `Unknown action: ${params.action}` },
            ],
            details: { ...state },
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
      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded }, theme, _context) {
      const details = result.details as
        | (TodoState & { error?: string })
        | undefined;
      if (!details) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text : "", 0, 0);
      }

      if (details.error) {
        return new Text(theme.fg("error", `Error: ${details.error}`), 0, 0);
      }

      const todos = details.todos ?? [];
      const action = (result.content[0] as { text?: string })?.text ?? "";

      // For list action, show the full list
      if (action.includes("No todos")) {
        return new Text(theme.fg("dim", "No todos"), 0, 0);
      }

      if (todos.length > 0) {
        let listText = theme.fg("muted", `${todos.length} todo(s):`);
        const display = expanded ? todos : todos.slice(0, 5);
        for (const t of display) {
          const check = t.done
            ? theme.fg("success", "✓")
            : theme.fg("dim", "○");
          const itemText = t.done
            ? theme.fg("dim", t.text)
            : theme.fg("muted", t.text);
          listText += `\n${check} ${theme.fg("accent", `#${t.id}`)} ${itemText}`;
        }
        if (!expanded && todos.length > 5) {
          listText += `\n${theme.fg("dim", `... ${todos.length - 5} more`)}`;
        }
        return new Text(listText, 0, 0);
      }

      // For add/toggle/clear, show the action result
      return new Text(theme.fg("success", action), 0, 0);
    },
  });

  // Register /todos command
  pi.registerCommand("todos", {
    description: "Show all todos",
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
    state = reconstructState(ctx);
    refreshUI(ctx);
  });

  pi.on("session_tree", async (_event, ctx) => {
    state = reconstructState(ctx);
    refreshUI(ctx);
  });
}
