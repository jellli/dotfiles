# Todo 扩展优化规划

## Context

当前 `~/.pi/agent/extensions/todo.ts`（[todo.ts](.pi/agent/extensions/todo.ts)）有两个痛点：

1. **LLM 忘记 `clear` → 残留任务长期展示。** 根因：completed 任务只靠 `recentlyCompletedIds` 隐藏 1 个 turn，`agent_start` 一重置就重新冒出来（见 [todo.ts:194](.pi/agent/extensions/todo.ts) 和 [todo.ts:525](.pi/agent/extensions/todo.ts)）。系统无任何自动收敛，全靠 LLM 主动 `clear`。

2. **无分组 → 跨主题污染。** 所有任务在一个扁平列表，上一个主题的遗留任务会混进下一个主题。"全部完成才 clear"粒度太粗——LLM 常只完成一部分就转去做别的。

> [!NOTE]
> **task ≠ todo**：task 扩展（[task.ts](.pi/agent/extensions/task.ts)）是主 agent 向 subagent 派活、跟踪并行结果的调度面板；todo 是通用待办，任何 agent 都能用。本计划**只动 todo.ts**，不涉及 task。

## 决策（已确认）

| 点 | 选择 |
|----|------|
| 防线 A 收敛方式 | **自动归档** — 从 widget/state 移到 archived 区，`/todos` 仍可见，可恢复 |
| 分组模型 | **轻量可选 category 字段** — `create` 传 `category?`，默认 `"general"`，无显式开关 |
| 防线 C | **要 staleness 提醒** — in_progress 连续 3 turn 未 update，footer 提示 |

## 方案设计

### 1. 轻量 category

- `create` 增加可选 `category?: string`，默认 `"general"`
- `clear` 增加可选 `category?: string`：传则只清该类，省略清全部
- `list` 增加可选 `category?: string` 过滤
- widget 标注 `[category]`，`/todos` 按 category 分组渲染
- 切换主题时老 category 任务天然不混进新 category

### 2. 三道自动收敛防线

#### 防线 A：全完成自动归档（核心）

- 在 `agent_end` 事件里扫描每个 category
- 若该 category 所有任务都是 `completed`（无 pending / in_progress），把该类全部任务移入 `archived` 区并从 active `tasks` 移除
- 归档任务在 widget 不显示，`/todos` 在 "Archived" 分组下可见
- 时序安全：若 LLM 在同一 turn 里先 complete #3 再 create #4，agent_end 时 category 非全完成，不触发归档；下一 turn 才可能触发
- `archived` 区设上限 50 条，超出按时间淘汰最旧

#### 防线 B：completed 默认从 widget 隐藏

- widget 只渲染 pending + in_progress（不显示 completed）
- completed 仍可通过 `/todos`（含 Completed 分组）和 `list status=completed` 查
- 比 `recentlyCompletedIds` 的 1-turn 隐藏更彻底，widget 始终聚焦在活跃工作
- **删除现有 `recentlyCompletedIds` 逻辑**（被防线 A + B 取代）

#### 防线 C：停滞提示

- 每个 in_progress 任务跟踪 `lastTouchedTurn`
- `agent_end` 时检查：若 in_progress 任务 `(turnCounter - lastTouchedTurn) >= 3`，在 footer 用 `setStatus` 提示 `⚠ stale: #4 "..." (3 turns)`
- 不自动改 status，只提示，避免误伤
- 任一 update（status / text / activeForm）刷新 `lastTouchedTurn`

### 3. 状态结构变化

```typescript
interface Task {
  id: number;
  text: string;
  category: string;         // 新增
  status: TaskStatus;
  activeForm?: string;
  createdAtTurn: number;   // 新增
  lastTouchedTurn: number; // 新增
}

interface TaskState {
  tasks: Task[];
  archived: Task[];        // 新增，归档区
  nextId: number;
  turnCounter: number;     // 新增，agent_end 累加
}

const STALE_THRESHOLD = 3;
const MAX_ARCHIVED = 50;
```

### 4. Schema 变化

```typescript
const TodoParams = Type.Object({
  action: StringEnum(["create", "update", "list", "clear", "archive"]),
  text: Type.Optional(Type.String()),
  id: Type.Optional(Type.Number()),
  status: Type.Optional(StringEnum(["pending", "in_progress", "completed"])),
  activeForm: Type.Optional(Type.String()),
  category: Type.Optional(Type.String()),        // 新增
  statusFilter: Type.Optional(StringEnum(["pending", "in_progress", "completed"])),
  categoryFilter: Type.Optional(Type.String()),  // 新增（list 用）
});
```

新增 `archive` action：手动把指定 category（或全部）归档，LLM 可主动收敛。

### 5. 事件钩子

| 事件 | 动作 |
|------|------|
| `agent_end` | 防线 A 归档 + 防线 C staleness 提示 + `turnCounter++` |
| `session_start` / `session_tree` / `session_compact` | `replayFromBranch` 重建 state（含 archived + turnCounter）；in_progress 任务重置为 pending |
| `agent_start` | **删除** `recentlyCompletedIds` 重置逻辑 |

### 6. 渲染变化

**widget**（只显 pending + in_progress，标注 category）：
```
 ◐ #2 写测试 [refactor] writing tests
 ○ #3 文档更新 [docs]
```

**`/todos` 全屏**（按 category 分组 + Completed + Archived 区）：
```
── refactor ──
 ◐ #1 重构 API  researching API
 ○ #2 写测试

── docs ──
 ○ #3 文档更新

── Completed ──
 ✓ #0 初步调研   (general)

── Archived ──
 ✓ #5 修 bug   (general)
```

**footer**：
```
◐ 1 · ✓ 2 · archived 5     或带停滞：  ⚠ stale: #4 (3 turns)
```

## Files to modify

| 文件 | 改动 |
|------|------|
| `.pi/agent/extensions/todo.ts` | 全部改动集中在此文件 |

### Reuse

复用现有代码结构，以下函数/组件原地改造：

- `applyMutation`（[todo.ts:95](.pi/agent/extensions/todo.ts)）— 加 category 分支 + archive action
- `replayFromBranch`（[todo.ts:76](.pi/agent/extensions/todo.ts)）— 读 archived + turnCounter + 默认值填充
- `updateWidget`（[todo.ts:194](.pi/agent/extensions/todo.ts)）— 只显 pending+in_progress
- `updateStatus`（[todo.ts:233](.pi/agent/extensions/todo.ts)）— 加 archived 计数 + staleness
- `TodoListComponent.render`（[todo.ts:255](.pi/agent/extensions/todo.ts)）— 按 category 分组
- `todoExtension` 工厂函数（[todo.ts:351](.pi/agent/extensions/todo.ts)）— 加 agent_end 钩子

## Steps

- [ ] 1. 改 `Task` / `TaskState` 类型 + `createEmptyState` + 常量
- [ ] 2. 改 `TodoParams` schema：加 `category`、`categoryFilter`、`archive` action
- [ ] 3. 改 `applyMutation`：create/update/list/clear 支持 category + 写入 `createdAtTurn`/`lastTouchedTurn`；新增 archive 分支
- [ ] 4. 改 `replayFromBranch`：读 archived + turnCounter + 对缺失字段填默认值
- [ ] 5. 改 `updateWidget`：只显 pending+in_progress，标注 `[category]`；删 `recentlyCompletedIds` 相关逻辑
- [ ] 6. 改 `updateStatus`：加 archived 计数 + staleness 提示
- [ ] 7. 改 `TodoListComponent`：按 category 分组 + Completed + Archived 区
- [ ] 8. 新增 `agent_end` 钩子：防线 A 归档 + 防线 C staleness + `turnCounter++`
- [ ] 9. 删 `agent_start` 的 `recentlyCompletedIds` 重置
- [ ] 10. 更新 `promptGuidelines` 补充 category / 自动归档说明
- [ ] 11. tsgo 校验 + 手测

## 向后兼容

> [!IMPORTANT]
> 旧 session 的 `toolResult.details` 没有 `category`/`archived`/`turnCounter`。`replayFromBranch` 对缺失字段填默认值（`category: "general"`，`lastTouchedTurn: 0`，`archived: []`，`turnCounter: 0`）。旧的不带 `category` 的 `create` 调用照常工作（默认 general）。

## 风险与取舍

| 风险 | 缓解 |
|------|------|
| 归档时序：LLM 同 turn complete 后又想继续 | 归档后 task 仍在 archived 可查，不影响逻辑 |
| staleness 误报：长任务（跑测试）可能超 3 turn | 阈值可调；仅提示不操作，无副作用 |
| archived 堆积 | `MAX_ARCHIVED=50` + FIFO 淘汰 |

## Verification

1. **tsgo 校验**：`cd .pi/agent/extensions && tsgo -p tsconfig.json --noEmit`（无编译错误）
2. **自动归档手测**：`create` 带类别 `refactor` 建两个任务 → 全 `update` 为 completed → 观察 `agent_end` 后 widget 自动清空、`/todos` 出现 Archived 区
3. **staleness 手测**：`create` + `update in_progress` 后连续发 3 条无关 prompt → 观察 footer 出现 `⚠ stale` 提示
4. **category 隔离**：建 `refactor` 和 `docs` 两类任务 → 只完成 `refactor` 类 → `docs` 类不受影响仍在 widget
5. **向后兼容**：`/resume` 一个旧 session → 确认 todo 状态正常重建无报错
