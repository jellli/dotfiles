# 02 — 九份适配器迁移

**Status:** done
**Blocked by:** 01

九份卡片规格改用新的 `Card input`，并删掉三处走私。**只删走私，不加新显示**（Q3）：外观、行为、既有断言语义一字不改。

## 任务

- [x] `ui/compact-tool-cards.ts` 的 `bashSpec`：`detail` 从记录状态读高亮（`input.state.highlight`），`body` 在着色完成后写进同一个记录状态并调 `input.redraw()`；删掉 `COMMAND_HIGHLIGHT_LIMIT`、`commandHighlights`、`pendingHighlights` 三个模块级变量与 `primeBashHighlight` 的全局表逻辑（着色本身仍调 `highlightBashLines`，结果写到记录状态）。`bashSpec` 声明为 `CardSpec<{ highlight?: string }>`。
- [x] `readSpec` / `grepSpec` / `findSpec` / `lsSpec`：`detail` / `row` / `summary` 改签名。`grepSummary` 与 `countSummary`（`readSummary` / `findSummary` / `lsSummary`）**保留**：宿主 `details` 里没有计数（见 `spec.md` 的事实表）。
- [x] `bashExitText` **保留**：`BashToolDetails` 里没有退出码。
- [x] `ui/pi-diff.ts` 的 `mutationSpec(tokenize)`：改为 `CardSpec<DiffState>`，body 用 `input.state` 代替 `context.state as DiffState`；`input.redraw` 不需要（diff 今天自己拿 `context.invalidate` 写进 `state.invalidate`，改成 Frame 的 `redraw()`）。`DiffState` 保持模块私有。
- [x] `brave-search/index.ts`：删 `RESULT_HEADER` 正则，`summary` 读 `input.result.details`（`{ results, cached }`）算条数；`formatResults` 的文本输出与 `details` 都不改。
- [x] `ollama-web-fetch/index.ts`：删 `FETCH_HEADER` 正则，`summary` 读 `input.result.details`（`{ title, totalChars }`）；文本输出与 `details` 都不改。
- [x] `todo/index.ts:497` 的 `detail` 改签名（它只读 `args`，机械修改）。
- [x] `ui/foreign-tool-cards.ts` 的 `toolCard(pi, definition)` 不写规格，走默认值 —— 只需确认编译通过。

## 验收

- [ ] `cd .pi/agent/extensions && ./tsgo` 无错。
- [ ] `npm test` 全绿，且 `test/tool-card.test.mjs` 的既有断言语义一条不改。
- [ ] `npm run build` 成功。
- [ ] 源码里搜不到 `commandHighlights`、`pendingHighlights`、`RESULT_HEADER`、`FETCH_HEADER`。
- [ ] 手测一次真实会话（`PI_TIMING=1 pi`）：bash 卡片头部在命令结束后显示带色命令；连续两次 `read` 仍聚合成一张卡；brave 摘要显示 `N results`（命中缓存时带 `· cached`）；`edit` 的差异框左右边框位置与改动前一致。

## Comments

- 2026-09-16 开票。**不要顺手删 `bashExitText` 与 `grepSummary`**：评审报告初稿把「3 个正则」都算成可删，核对宿主类型后确认只有 brave 与 ollama 两个正则可删，另加 bash 的全局表。依据见 `spec.md` 的事实表。

- 2026-09-16 关票。复核：`commandHighlights`、`pendingHighlights`、`RESULT_HEADER`、`FETCH_HEADER` 四个符号全仓库（除 node_modules）已搜不到；bash 的高亮改存行状态（`ui/compact-tool-cards.ts:171-206` 的 `state.highlighted` / `state.highlighting`）；`brave-search/index.ts:127-135` 的 summary 读 `input.result.details`；`ui/pi-diff.ts:943` 是 `CardSpec<DiffState>`，`DiffState` 仍私有；`bashExitText` 与 `grepSummary` 按票的要求保留。
- 2026-09-16 验收里「手测一次真实会话」没有记录，所以该条保留未勾。
