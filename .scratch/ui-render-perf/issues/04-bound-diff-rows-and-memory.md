# 限制 diff 行物化与三处无界内存

**Category:** performance + leak
**Status:** done

## 问题

1. `ui/pi-diff.ts:160 changedRows()` 为**整份文件**每行建一个 `DiffRow` 对象：20 万行 = 20 万对象，`diffLines` 实测 203ms（5 千行 9ms、5 万行 57ms），rows 一直挂在组件 state 里。
2. `ui/pi-diff.ts:885 captures.delete()` 在 `context.isError` 提前 return 时被跳过 → 整份旧/新文件文本永久留存；`session_shutdown` 也不清。
3. `lib/aggregation.ts:155 store.entries` 除 shutdown 外从不清理。
4. `ui/foreign-tool-cards.ts isOwnTool()` 用 `startsWith(root)` 比路径，`extensions/ui-extra` 会被误判成自家扩展而跳过包装。

## 任务

- [x] 超过阈值（`MAX_CAPTURE_LINES = 20000`）不做 capture diff，改走 `parseDisplayDiff(result.details.diff)` 原生路径（`write` 除外，见 Comments）
- [x] `captures` 在错误分支和 `session_shutdown` 都清
- [ ] `agent_settled` 清 entry —— **不做，见 Comments**
- [x] `isOwnTool` 按路径段边界比较

## 验收

- [x] 编辑 20 万行文件，内存不随文件行数线性增长
- [x] 工具报错后 `captures` 不含该 toolCallId
- [x] 并行工具调用下结果行仍正确更新（`test/aggregation.test.mjs`）
- [x] `extensions/ui-extra` 路径不被当作自家扩展

## Comments

- 2026-09-12 完成 1、2、4 与全部验收；第 3 条撤销。
- **撤销条目裁剪**：`pruneSettledEntries` 会引入回归。宿主每次 `updateDisplay`（resize、展开、任何 invalidate）都重跑 `renderCall`，id 从 map 消失会被当成新调用重新注册，把已关闭的组重建成单行卡片，丢掉已画出的行。而且已 settle 的 entry 本来就由 group 组件持有，删 map 槽位并不释放它的输出文本 —— 收益也比原估计小。回归测试：`test/aggregation.test.mjs`。
- **上限对 `write` 不生效**：`write` 工具的 `details` 是 `undefined`（`core/tools/write.js:52`），没有原生 diff 可退，丢掉 capture 就只剩 `Diff unavailable`。规则因此是"有原生 diff 且超限才丢 capture"。代价：超大的 `write` 仍为整份文件建行；验收里的"编辑"（edit）不受影响。
- 并行场景断言落在公开接缝 `createToolAggregation().wrap()` 上（`test/aggregation.test.mjs`），覆盖"组关闭后到达的结果仍写进自己的行"。
