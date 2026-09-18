# stripBackground：按行 memo 并修 reset 丢失

**Category:** bug + performance
**Status:** done

## 问题

两件事同源，都在 `ui/foreign-tool-cards.ts:304 stripBackground()`：

1. **性能**：每帧对第三方卡片的每一行跑正则 + 回调，实测 **3.05µs/行**（500 行 ≈ 1.5ms/按键）。跨帧重复的是同一批字符串。
2. **正确性**：`\x1b[m`（参数为空的 reset）被整条删掉 —— `params.split(";").filter(p => p !== "")` 得空数组，`kept` 为空，函数返回 `""`。实测 `stripBackground("\x1b[m") === ""`，SGR 状态会渗到后续行。

## 任务

- [x] 参数为空时视为 reset 保留（`\x1b[0m` 已经保留，行为一致）
- [x] 加按行字符串的 memo（带上限，如 2000 条），跨帧命中
- [x] `test/foreign-tool-cards.test.mjs` 补 `\x1b[m` 断言

## 验收

- [x] `stripBackground("\x1b[m") === "\x1b[m"`（现状覆盖的是 `...red\x1b[m` 混合场景，见 Comments）
- [x] `stripBackground("\x1b[48;2;1;2;3mtext\x1b[49m") === "text"` 与另外两条现有断言不变
- [ ] 1000 行输入重复 100 次的总耗时下降一个数量级 —— 未写（耗时断言易碎），淘汰策略另开 05

## Comments

- 2026-09-12 关票。三项任务与两条行为验收随 `87f2152`（`perf(pi): bound tool-card render work to what the view draws`）一起落地，票当时没关：`foreign-tool-cards.ts:384` 的 `x1b[m` 保留分支与 `:375 STRIP_CACHE_LIMIT` 的按行 memo 都在，`test/foreign-tool-cards.test.mjs:118` 已有断言。
- 唯一没补的是 bare `stripBackground("\x1b[m")` 那条单测（现有断言覆盖的是 `...red\x1b[m` 混合场景，已能挡住这个回归），以及耗时的量级断言（易碎，不值得进 CI）。
