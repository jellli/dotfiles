export type TodoStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "abandoned"
  | "blocked";

export type TodoItem = {
  content: string;
  status: TodoStatus;
  blocker?: string;
};

export type TodoPhase = {
  name: string;
  tasks: TodoItem[];
};

export type TodoErrorCode =
  | "missing_list"
  | "duplicate_phase"
  | "duplicate_task"
  | "missing_phase"
  | "missing_items"
  | "missing_task"
  | "task_not_found"
  | "phase_not_found"
  | "target_required";

export type TodoError = {
  code: TodoErrorCode;
  phase?: string;
  task?: string;
};

export type TodoCommand = {
  op:
    | "init"
    | "start"
    | "done"
    | "drop"
    | "block"
    | "unblock"
    | "rm"
    | "append"
    | "view";
  list?: Array<{ phase: string; items: string[] }>;
  task?: string;
  phase?: string;
  items?: string[];
  reason?: string;
};

export type TodoResult = {
  state: TodoPhase[];
  errors: TodoError[];
};

function cloneState(phases: TodoPhase[]): TodoPhase[] {
  return phases.map((phase) => ({
    name: phase.name,
    tasks: phase.tasks.map((task) =>
      task.blocker === undefined ? { ...task } : { ...task, blocker: task.blocker },
    ),
  }));
}

// Snapshot copy for adapters that hand state to persistence or HUD code.
export function cloneTodoState(phases: TodoPhase[]): TodoPhase[] {
  return cloneState(phases);
}

function normalize(phases: TodoPhase[]): void {
  const tasks = phases.flatMap((phase) => phase.tasks);
  const active = tasks.filter((task) => task.status === "in_progress");

  // Keep one active task and promote the first pending task when none is active.
  for (const task of active.slice(1)) task.status = "pending";
  if (active.length === 0) {
    const next = tasks.find((task) => task.status === "pending");
    if (next) next.status = "in_progress";
  }
}

function findTask(
  phases: TodoPhase[],
  content: string,
): { task: TodoItem; phase: TodoPhase } | undefined {
  for (const phase of phases) {
    const task = phase.tasks.find((candidate) => candidate.content === content);
    if (task) return { task, phase };
  }
  return undefined;
}

function findPhase(phases: TodoPhase[], name: string): TodoPhase | undefined {
  return phases.find((phase) => phase.name === name);
}

function targets(
  phases: TodoPhase[],
  command: TodoCommand,
  errors: TodoError[],
): TodoItem[] {
  if (command.task !== undefined) {
    const hit = findTask(phases, command.task);
    if (!hit) errors.push({ code: "task_not_found", task: command.task });
    return hit ? [hit.task] : [];
  }
  if (command.phase !== undefined) {
    const phase = findPhase(phases, command.phase);
    if (!phase) errors.push({ code: "phase_not_found", phase: command.phase });
    return phase?.tasks ?? [];
  }
  return phases.flatMap((phase) => phase.tasks);
}

export function applyTodoState(
  current: TodoPhase[],
  command: TodoCommand,
): TodoResult {
  if (command.op === "view") {
    return { state: cloneState(current), errors: [] };
  }

  const state = cloneState(current);
  const errors: TodoError[] = [];

  switch (command.op) {
    case "init": {
      const list =
        command.list && command.list.length > 0
          ? command.list
          : command.items
            ? [{ phase: command.phase ?? "Tasks", items: command.items }]
            : undefined;
      if (!list || list.length === 0) {
        errors.push({ code: "missing_list" });
        break;
      }

      const phaseNames = new Set<string>();
      const taskNames = new Set<string>();
      for (const entry of list) {
        if (phaseNames.has(entry.phase)) {
          errors.push({ code: "duplicate_phase", phase: entry.phase });
        }
        phaseNames.add(entry.phase);
        for (const item of entry.items) {
          if (taskNames.has(item)) {
            errors.push({ code: "duplicate_task", task: item });
          }
          taskNames.add(item);
        }
      }
      if (errors.length === 0) {
        state.splice(
          0,
          state.length,
          ...list.map((entry) => ({
            name: entry.phase,
            tasks: entry.items.map((content) => ({
              content,
              status: "pending" as const,
            })),
          })),
        );
      }
      break;
    }
    case "append": {
      if (!command.phase) errors.push({ code: "missing_phase" });
      if (!command.items || command.items.length === 0) {
        errors.push({ code: "missing_items" });
      }
      if (command.items) {
        for (const item of command.items) {
          if (findTask(state, item)) {
            errors.push({ code: "duplicate_task", task: item });
          }
        }
      }
      if (errors.length === 0) {
        let phase = findPhase(state, command.phase!);
        if (!phase) {
          phase = { name: command.phase!, tasks: [] };
          state.push(phase);
        }
        for (const content of command.items!) {
          phase.tasks.push({ content, status: "pending" });
        }
      }
      break;
    }
    case "start": {
      if (!command.task) errors.push({ code: "missing_task" });
      const hit = command.task ? findTask(state, command.task) : undefined;
      if (command.task && !hit) {
        errors.push({ code: "task_not_found", task: command.task });
      }
      if (hit) {
        for (const task of state.flatMap((phase) => phase.tasks)) {
          if (task !== hit.task && task.status === "in_progress") {
            task.status = "pending";
          }
        }
        hit.task.status = "in_progress";
      }
      break;
    }
    case "done":
    case "drop": {
      for (const task of targets(state, command, errors)) {
        task.status = command.op === "done" ? "completed" : "abandoned";
      }
      break;
    }
    case "block": {
      if (!command.task && !command.phase) errors.push({ code: "target_required" });
      const reason = command.reason?.replace(/\s+/g, " ").trim() || undefined;
      for (const task of targets(state, command, errors)) {
        if (["pending", "in_progress", "blocked"].includes(task.status)) {
          task.status = "blocked";
          task.blocker = reason;
        }
      }
      break;
    }
    case "unblock": {
      if (!command.task && !command.phase) errors.push({ code: "target_required" });
      for (const task of targets(state, command, errors)) {
        if (task.status === "blocked") {
          task.status = "pending";
          delete task.blocker;
        }
      }
      break;
    }
    case "rm": {
      if (command.task) {
        const hit = findTask(state, command.task);
        if (!hit) errors.push({ code: "task_not_found", task: command.task });
        else hit.phase.tasks = hit.phase.tasks.filter((task) => task !== hit.task);
      } else if (command.phase) {
        const phase = findPhase(state, command.phase);
        if (!phase) errors.push({ code: "phase_not_found", phase: command.phase });
        else phase.tasks = [];
      } else {
        for (const phase of state) phase.tasks = [];
      }
      break;
    }
  }

  if (errors.length > 0) return { state: cloneState(current), errors };
  normalize(state);
  return { state, errors };
}
