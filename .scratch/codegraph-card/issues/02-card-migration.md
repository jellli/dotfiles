# 02 — 删掉卡片语言，写 spec 与盒子 body，加四条断言

**Status:** done
**Blocked by:** 01

按 `spec.md` 的清单删掉 codegraph 自己那套卡片语言（约 260 行），改成一份 `codegraphSpec(name)`；盒子由 `body` 画（bash 盒子的先例），失败时交给框架。四条断言放 `extensions/test/tool-card.test.mjs`。

## 任务

- [x] 删掉 `codegraph/tools.ts` 里的 `toolTitle`、`resultText`、`visibleWidth`、`fitLine`、`boxedResult`、`CodeGraphCallCard`、`CodeGraphResultCard`、`compactCodeGraphTool`、`stringArg`、`numberArg`、`shorten`、`ANSI_SEQUENCE`、`ToolTheme`、`ToolContext`、`ToolRenderResult`（行号见 `spec.md` 的表）。**保留 `toolLine`**。
- [x] 加 `codegraphSpec(name: string): CardSpec`：`detail` 用 `toolLine(name, input.args, input.theme)`，`body` 画盒子。泛型用默认值（`S = {}`，不需要记录状态）。
- [x] 盒子形状：上边框裸框 `┌───┐`；下边框左侧放状态 —— 运行中 `spinnerChar(state) + elapsedText(state)`，结束后 `N lines`；折叠时盒内最后一行是 `… N more lines (Ctrl+O to expand)`，展开时给全文；`N lines` 按非空行数。几何用 `card/text.ts` 的 `fitLine` / `padLine`。运行中与结束后边框颜色跟 `bashSpec` 一致（运行 `accent`、结束 `dim`）。
- [x] **失败时 body 返回 `undefined`**，让框架画错误预览（不画红盒）。
- [x] 四个 `registerTool` 调用改成 `pi.registerTool(toolCard(pi, {…definition…}, codegraphSpec("codegraph_explore")))` 等；definition 不再带 `renderCall` / `renderResult` / `renderShell`。`label` 保留（徽章取它）。
- [x] 四条断言加进 `extensions/test/tool-card.test.mjs`（新开一节，例如 `// The card codegraph ships`）：
  - [x] ① 头部来自 `toolLine`，`codegraph_impact` 带 `depth 3` 后缀。
  - [x] ② 运行中盒子的下边框有 spinner 与耗时。
  - [x] ③ 成功后下边框是 `N lines`，盒内是前 3 条非空行。
  - [x] ④ 展开后盒内是全文，`N lines` 不变。
- [x] 确认 `keyText("app.tools.expand")` 仍用于展开提示。

## 验收

- [x] `npm test`（extensions）全绿，含四条新断言。
- [x] `PATH=/Users/hoon/.local/share/fnm/node-versions/v24.4.1/installation/bin:$PATH ./tsgo` exit 0。
- [x] `npm run build` 成功；`codegraph/index.js` 更新，且 `../card/tool-card.js` 被 tsdown 的 `cardDist` 插件重写为 `../card/dist/*.js`（`extensions/tsdown.config.mts` 的正则匹配 `^\.\.\/card\/([a-z-]+)\.js$`）。
- [x] 源码里搜不到 `boxedResult`、`CodeGraphCallCard`、`CodeGraphResultCard`、`compactCodeGraphTool`、`visibleWidth`。
- [x] 手测一次真实会话：`codegraph_explore` 卡片有徽章与 `└─┌` 盒子；运行中下边框有 spinner；结束后是 `N lines`；Ctrl+O 展开全文；失败走红色错误预览；连续两次 `codegraph_query` 是两张卡（body ⇒ 不聚合，与今天一致）。

## Comments

- 2026-09-16 完成（提交 c6bd163）。`tools.ts` 从 317 行改到 77 行 / 删 240 行：`toolTitle`、`resultText`、`visibleWidth`、`fitLine`、`boxedResult`、两个 card 类、`compactCodeGraphTool`、`ANSI_SEQUENCE`、三个类型全部删掉；新增 `codegraphSpec` + `codegraphBox`（约 70 行）。四个 `registerTool` 走 `toolCard(pi, {…}, codegraphSpec(name))`，definition 只剩 name/label/description/parameters/execute。

  与票面清单的两点偏差（清单自相矛盾处）：

  1. `stringArg` / `numberArg` 保留 —— 它们只被 `toolLine` 用，而 `toolLine` 按票面保留。`shorten` 删掉，改从 `card/text.ts` 引入（同一个记忆化模块，截断符从 `...` 变 `…`，宽度语义不变）。
  2. `keyText("app.tools.expand")` 仍用于折叠提示，`elapsedText` / `spinnerChar` 分别来自 `card/tool-card.js` 与 `card/spinner.js`（后者不在 tool-card 的导出里）。

  运行中盒内保留原来的 `… querying graph` 占位行：这四个工具不流式输出，`isPartial` 时盒内必然为空，而 Q21 要求下边框就是运行态的出口。

  验证：`npm test` 全绿（含 `test/tool-card.test.mjs` 的四条断言与 `codegraph/test/harness.mjs` 的 39 个 PASS）、`tsgo` exit 0、`npm run build` 成功且 `codegraph/index.js` 里的 `../card/{text,spinner,tool-card}.js` 被 cardDist 插件重写成 `../card/dist/*.js`、源码里搜不到那五个已删符号。

  手测那条做了一半：本环境没有可交互的 pi 会话，改成对**构建产物**的探针 —— 用 `createTestJiti` 加载 `codegraph/index.js`，走真实 `registerTool` 拿到的定义逐行渲染四种状态，看到徽章 + `└─┌` 盒子、运行中 `└─ ◐ 0.0s`、结束后前 3 条非空行 + `… 2 more lines (Ctrl+O to expand)` + `└─ 5 lines`、展开后全文且计数不变、失败时 body 不画盒（`└─ boom: first line ...` 的错误预览）。没做的只有真实终端里的 Ctrl+O 按键往返与两次 `codegraph_query` 的视觉确认（后者由 `body ⇒ aggregate: false` 结构性保证，`toolCard` 对 `body + aggregate: true` 直接抛错）。

- 2026-09-16 开票。来源：架构评审 candidate 02 + grilling Q15/Q16/Q19/Q20/Q21/Q22。
- 外观会变：上边框的 `result · explore` 标签与调用行的 `·` 标记消失（身份进徽章，状态进下边框与 spinner），盒子与 `N lines` 保留。这是 Q15/Q21 的选择，不是回归。
