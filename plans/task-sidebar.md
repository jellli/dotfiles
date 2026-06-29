# Task Sidebar Extension

## Context

Pi 支持侧边栏 widget（通过 `ctx.ui.setWidget()`），也内置 `fork` 工具用于 spawn 子 agent。但目前没有一个集中的「任务面板」让主 agent 直观地分配、追踪多个并行子 agent 任务的执行状态。

新增 `task` 扩展组件：
- 注册 `task` tool，供主 agent 分配任务给 subagent
- 在侧边栏 widget 中展示任务名、当前处理的 agent 名称、处理结果
- 支持多个任务并行执行
- 每个子 agent 任务完成时，立即将结果报告给主 agent（不等所有任务完成）

## Approach

基于 pi 已有的 `subagent/` 示例（`examples/extensions/subagent/index.ts`）和 `todo.ts` sidebar widget 模式，创建新扩展 `task.ts`：

1. **Tool**: 注册 `task` tool，接受 `tasks: Array<{ name: string, agent: string, task: string }>`
2. **Widget**: 通过 `ctx.ui.setWidget("task-widget", lines)` 在侧边栏展示实时任务状态
3. **执行**: 使用和 subagent 示例相同的 `pi --mode json -p` spawn 方式，每个任务独立进程
4. **并行**: 通过 `mapWithConcurrencyLimit` 控制并发数（默认并发上限 4）
5. **结果回报**: 每个子任务完成时，立即通过 `pi.sendUserMessage()` 单独向主 agent 报告该任务结果
6. **状态持久化**: task 状态写入 tool result `details`，session reload 时从分支回放恢复

### 与 subagent 的关系

`task` 和 `subagent` 是**解耦**的：
- `task` 只管任务分配、展示、追踪和结果汇报
- 后续可能有多个不同的 subagent 实现，它们都可以使用 `task` 插件进行调度
- `task` 内部执行子 agent 时，参考 subagent 示例的 spawn 模式，但不依赖特定的 subagent 实现

## Files to Create

| 文件 | 说明 |
|------|------|
| `.pi/agent/extensions/task.ts` | Task sidebar 扩展主文件 |

## Reuse

- **Subagent spawn 模式**: `examples/extensions/subagent/index.ts:267-429` (`runSingleAgent` 函数) — spawn `pi --mode json -p` 进程
- **Sidebar widget API**: `ctx.ui.setWidget(name, lines)` — 在 `todo.ts` 中使用
- **Footer status API**: `ctx.ui.setStatus(name, text)` — 在 `todo.ts` 中使用
- **Session 状态回放**: `todo.ts:101-121` (`replayFromBranch` 模式) — 从 toolResult details 恢复状态
- **Agent 发现**: `examples/extensions/subagent/agents.ts` — `discoverAgents()` 发现可用的 agent 配置

## Steps

- [ ] **Step 1**: 创建 `.pi/agent/extensions/task.ts` 文件骨架
  - 导入所需类型 (`ExtensionAPI`, `ExtensionContext`, `Theme` from `@earendil-works/pi-coding-agent`)
  - 定义 `TaskItem` 接口：`{ id, name, agent, task, status, result?, activeForm? }`
  - 定义 `TaskState` 接口：`{ tasks: TaskItem[], nextId: number }`
  - 导出默认扩展工厂函数

- [ ] **Step 2**: 实现状态管理
  - `createEmptyState()` — 初始空状态
  - `replayFromBranch(ctx)` — 从 session 分支回放 task 状态
  - `applyMutation(state, action, params)` — 纯 reducer：create/update/clear
  - 状态转换：`pending → running → completed | failed`

- [ ] **Step 3**: 实现侧边栏 Widget 渲染
  - `updateWidget(ctx, state)` — 渲染任务列表到 `ctx.ui.setWidget("task-widget", lines)`
  - 显示格式：
    - pending: `○ #1 任务名` （灰色）
    - running: `◐ #1 任务名 [agent-name]` （高亮色 + agent 名）
    - completed: `✓ #1 任务名` （绿色）
    - failed: `✗ #1 任务名 — 错误信息` （红色）
  - 最多展示 12 条

- [ ] **Step 4**: 实现 Footer 状态
  - `updateStatus(ctx, state)` — 显示 `◐ 2 active · ✓ 3 done · 5 total`
  - 无任务时隐藏

- [ ] **Step 5**: 实现 `/task` 命令（可选，全屏查看）
  - 使用 `ctx.ui.custom()` 显示 `TaskListComponent`
  - 分组展示：Running / Pending / Completed / Failed
  - 支持键盘导航和关闭

- [ ] **Step 6**: 实现 Task 执行引擎
  - 借鉴 `subagent/index.ts` 的 `runSingleAgent()` 模式
  - `execTask(task, ctx, signal, onUpdate)` — spawn 单个 subagent 进程
  - `execParallel(tasks, ctx, signal, onUpdate)` — 并发执行，`MAX_CONCURRENCY = 4`
  - 执行中通过 `onUpdate` 回调实时更新 widget
  - 处理 abort signal（主 agent 取消时终止子进程）

- [ ] **Step 7**: 注册 `task` Tool
  - 参数 schema:
    ```typescript
    {
      tasks: Array<{
        name: string;    // 任务名
        agent: string;   // agent 名称
        task: string;    // 任务描述
        cwd?: string;    // 可选工作目录
      }>
    }
    ```
  - `execute()`: 创建 tasks → 更新 widget → 并行执行 → 收集结果 → 汇报

- [ ] **Step 8**: 实现结果回报（逐任务报告）
  - 每个子任务完成时，立即调用 `pi.sendUserMessage()` 单独报告该任务结果
  - 报告格式：`[Task #1 "任务名"] completed by agent-name:\n结果摘要...`
  - 失败任务同样立即报告：`[Task #1 "任务名"] FAILED (agent-name): 错误信息`
  - 不等待所有任务完成，各自独立汇报

- [ ] **Step 9**: 注册生命周期事件
  - `session_start`: 从分支回放状态，重建 widget
  - `session_tree` / `session_compact`: 同上
  - `agent_start`: 清理 completed 任务（如需要）
  - `session_shutdown`: 清理运行中的子进程

- [ ] **Step 10**: 注册到 settings.json
  - 在 `~/.pi/agent/settings.json` 的 `extensions` 中添加 `+extensions/task.ts`

## Verification

1. **功能测试**: 启动 pi，让 agent 调用 `task` tool 分配一个简单任务给 worker agent
   - 验证侧边栏 widget 显示任务状态：pending → running → completed
   - 验证 footer 显示计数
2. **并行测试**: 分配 3 个并行任务
   - 验证 widget 同时显示多个 running 任务
   - 验证并发上限（最多 4 个同时运行）
3. **失败处理**: 分配任务给不存在的 agent
   - 验证 widget 显示 failed 状态和错误信息
4. **结果汇报**: 验证每个子任务完成时，主 agent 立即收到该任务的 `sendUserMessage` 报告（不等其他任务）
5. **会话恢复**: `/reload` 后验证 widget 从分支回放恢复之前的任务状态
6. **Abort**: 在任务执行中按 Esc，验证子进程被终止
