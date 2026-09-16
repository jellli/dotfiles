# 01 — 查看器收源，不收状态袋

**Status:** done

按 `spec.md` 的 D1–D4 改造 `ui/pi-diff.ts` 的 diff 流水线：导出工厂收源，`DiffState` 变回纯私有类型，卡片 `body` 只留 capture 查表与持有查看器。测试的两处 `createDiffViewer` 改成新形状，断言语义不改。

## 任务

- [x] 加 `type DiffSource = { capture: Capture } | { diff: string }`；`createDiffViewer` 的入参改成 `{ source: DiffSource | undefined; path: string; theme: RenderResultTheme; expanded: boolean; tokenize?: DiffTokenizer; redraw?: () => void }`，**删掉 `state`**。
- [x] `DiffState` 从「卡片行状态」变成查看器的私有状态：字段不变（源、`rows`、`totalLines`、`highlighted`、`highlightPending`、`stats`），但只由 `MutationDiffViewer` 读写。`invalidate?: () => void` 换成构造时给的 `redraw?: () => void`（异步高亮落地后调用它请求重画）。
- [x] `ensureSource()` 内联两种源：`{ capture }` → `addWordRanges(changedRows(oldText, newText))`；`{ diff }` → `addWordRanges(parseDisplayDiff(diff))`；`undefined` → `rows = []`（保持今天的 `Diff unavailable after reload`）。
- [x] `mutationSpec` 的 `S` 改成 `{ viewer?: DiffViewer }`；`body` 收缩为：错误分支（`captures.delete` + 返回 `undefined`）→ 取 capture / 原生 diff 组成 `source` → `state.viewer ??= createDiffViewer({ … })` → `viewer.setExpanded(options.expanded)` / `viewer.setTheme(theme)` → `return viewer.render(input.width)` → `captures.delete(callId)`。
- [x] `test/pi-diff.test.mjs:42` 与 `:105` 两处改成新形状（`state: { capture: … }` → `source: { capture: … }`）。断言语义不改、数量不减。
- [x] 新增一条断言：同一个查看器实例第二次 `render()` 不重新解析源（`tokenize` 调用次数与首次相同，行内容一致）—— 固定「源只在构造时进去一次」。

## 验收

- [x] `npm test`（extensions）全绿；`test/pi-diff.test.mjs` 的既有断言一条不少，含 `spec.md` 里三条回归锁。
- [x] `PATH=/Users/hoon/.local/share/fnm/node-versions/v24.4.1/installation/bin:$PATH ./tsgo` exit 0。
- [x] `npm run build` 成功，`ui/index.js` 更新。
- [x] `grep -n 'DiffState' ui/pi-diff.ts` 里，`DiffState` 不出现在任何导出签名中；`createDiffViewer` 的入参里没有 `state`。
- [x] 变异检查：把 `ensureSource()` 改成永远走 capture 分支（忽略 `{ diff }`），依赖原生 diff 的断言必须失败。
- [ ] 手测一次真实会话：edit 一张卡片（盒子、`+N -M`、折叠 8 行、Ctrl+O 展开）；换主题后配色刷新且高亮行不丢；大文件首帧 `Rendering diff...`。**未执行**：本环境没有交互式 pi 会话；同一面已用无头探针覆盖（见 Comments）。

## Comments

- 2026-09-16 开票。来源：架构评审 candidate 04；本会话先评估并跳过 candidate 03（五个缓存）后选定。
- 2026-09-16 D1–D5 是本会话的默认决定，没有 grilling 过。最容易改的两处：D2 用联合类型（更懒的写法是两个可选字段 `capture?` / `diff?`，行为一致）、D3 的输入生命周期切分（把 `theme` / `expanded` 也挪到每帧的 setter 也可以，代价是构造后不能直接渲染）。改这两处只动票面，不动实现方向。
- 票与实现同一提交（`docs/agents/issue-tracker.md`）。本文件现在未提交。
- 2026-09-16 关票。`createDiffViewer` 的入参落成导出的 `DiffViewerOptions`（字段与票面一字不差），`DiffState` 只剩 `source` / `rows` / `totalLines` / `highlighted` / `highlightPending` / `stats` 六个字段，构造函数收下 `source` 后自己造一份 —— 卡片侧再也拿不到它，`CardSpec<{ viewer?: DiffViewer }>` 的 `S` 里只剩那个盒子。`redraw` 是构造函数选项（不再是 body 每帧往共享状态上盖的 `state.invalidate`）。
- 行为等价性：viewer 仍只在有 result 且非 partial 时构造，所以第一次 `ensureSource()` 拿到的源和旧代码在 body 里拼的那一份相同；`captures.delete(callId)` 的位置不变（拿到源之后，失败分支也走）。
- 一处新增的保留：`{ diff }` 源解析完后，那段原生 diff 文本留在 viewer 的私有 state 里（旧代码只留 `rows`）。票面把「源」列进 `DiffState`，且那段文本是宿主自己的 ±4 行、有界，故按票面保留。
- 测试：既有断言 29 → 31（两处 `createDiffViewer` 换形状，语义未动）。新增的锁用计数 accessor 读 capture —— 只断言 `tokenize` 次数与行内容的话，把 `ensureSource()` 的 early return 拿掉（每次 render 重新解析）测不出来；换成计数后该变异实测失败（`actual: 8, expected: 2`）。票面那条「永远走 capture 分支」的变异实测失败在 `test/pi-diff.test.mjs` 的 *the change is drawn*（大文件那张卡依赖原生 diff）。
- 手测未做：`+N -M` / 折叠 8 行 / Ctrl+O 展开 / `41 lines` 用无头探针跑过（真实 edit 的 `execute` → `renderCall`/`renderResult` → Frame 上取行），主题刷新与高亮不丢、大文件首帧 `Rendering diff...` 由 `test/pi-diff.test.mjs` 与 `test/tool-card.test.mjs` 的既有断言守着。真机会话仍待人工跑一次。
