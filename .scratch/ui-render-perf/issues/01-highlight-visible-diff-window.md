# 大文件 diff 只高亮可见窗口

**Category:** performance
**Status:** done

## 问题

`ui/pi-diff.ts:695 kickHighlight()` 调 `highlightAll(rows)`，对**整份文件 diff** 的每一行跑 shiki，而折叠视图只画 `COLLAPSED_DIFF_LINES = 8` 行。

shiki `codeToTokens` 实测 **0.324ms/行**：

| 文件行数 | 高亮 CPU |
| --- | --- |
| 3,000 | ~971ms |
| 50,000 | ~16s |
| 200,000 | ~65s |

`highlightAll` 用 `Promise.all`，微任务在同一轮事件循环里连续跑，期间 TUI 完全卡住（只显示 `Rendering diff...`）。`changedRows` 为整份文件建行，所以 5 万行文件里改一行就会触发。

## 任务

- [x] `state.highlighted: string[]` 改成按行号索引的 `Map<number, string>`
- [x] 只补算当前 window（`selectCollapsedRows` 结果 / 展开态的分块窗口）缺的行，算完 `state.invalidate?.()`
- [x] 展开态按块补算（`HIGHLIGHT_CHUNK = 500`）
- [x] `highlightedTokens` 加容量上限（`TOKEN_CACHE_LIMIT = 4000`）

## 验收

- [x] 编辑 5 万行文件，首帧到可交互 < 100ms（热态 3ms）
- [x] 折叠态只对窗口内的行调用 shiki（计数器断言）
- [x] 展开后内容仍全部高亮（分批到达）

## Comments

- 2026-09-12 完成。实测：3000 行 diff 只高亮 **8 行**；首次成帧 465ms（含一次性 shiki 加载），热态 **3ms**；改动前 0.324ms/行 × 3001 ≈ 971ms。
- 测试接缝 `test/pi-diff.test.mjs`：注入 tokenizer 的 `createDiffViewer` 断言"只为窗口内的行请求高亮"。
- 范围外但同文件的两件事，记录在此：
  - shiki 改成按需 `import()`：ui 扩展的 module import 从 166ms 降到 65ms（启动路径省约 100ms）。代价移到首次渲染 diff，失败不缓存、下次重试。
  - 原生 diff 分支补 `state.totalLines`：此前该分支 footer 会显示 `0 lines`。这条路径原本是死代码，被 ticket 04 的上限逻辑激活后才暴露。
- 失败路径修过一次：tokenizer 抛错时写了纯文本但没触发重绘，画面会一直停在 `Rendering diff...`，直到别的输入触发重绘（code-review 发现）。
