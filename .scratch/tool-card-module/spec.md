# Tool card module — 把 card language 收进一个深 module

**Status:** done

2026-09-12 架构评审（candidate 01）的结论。`CONTEXT.md` 定义的 card language（badge、result line、summary、expansion）今天有四份 renderer、三份 badge 实现：`ui/lib/pi-ui.ts`、`ui/lib/aggregation.ts`、`ui/compact-tool-cards.ts`（手抄的 `compactDefinition`）、`ui/foreign-tool-cards.ts`（`contentCard`），外加 codegraph 的又一份。本计划把它收进一个 module。

interface 形态由三份并行设计（最小 interface / 最大灵活性 / 最优化最常见调用方）对比后定稿：取「最小 interface」的骨架与推导默认值，取「最大灵活性」的两条不变式。三份设计的完整文本不在本文件，结论在下面。

## 决策

入口一个：`toolCard(pi, tool, spec?)`，位于 `agent/extensions/card/`（无 index.ts、无 package.json —— pi 的扩展发现只认 `extensions/*/index.ts`，一层、不递归，所以这个目录永远不会被当作扩展加载）。

**Card spec**：`detail` / `row` / `summary` / `body` / `aggregate`。adapter 能推导出来的一律不做参数。

**Frame 拥有**：badge（toolTitle 前景翻成背景 + 黑字）、header 括注、result line 与 `RESULT_LINE_INDENT`、error preview（首行 + muted ` ...`）、expansion 的 `│ ` 前缀、aggregation（含跨 `pi` 装配点的 `globalThis[Symbol.for("dotfiles.pi-tool-aggregation")]` store、owner 选择、close 规则、owner-only invalidate、「entries 不裁剪」规则）、有界 memo（summary/body 按 output+theme+width；去背景走文本预算 memo）、spinner（帧、140ms、`unref`）、elapsed 时钟、按 slot 的 `lastComponent` 与对子 renderer 的中和 invalidate。

**推导默认值**（leverage 的主要来源）：badge 取自 `tool.label ?? tool.name`；默认 `detail` 取自 `display.name`/`display.description`，否则第一个短字符串参数；默认 `summary` 取自文本输出（单行显示自己，多行显示计数）；默认 body 取自 `tool.renderCall || tool.renderResult` —— 一个自带 renderer 的第三方工具因此零 spec 即可。

**不变式**（任何后续实现都不得违反）：

1. Frame 独占 `└─` 列：body 交出行时由 body 占；body 交不出（没有 body / `undefined` / 空数组）时 Frame 画 summary / error preview / expansion。
2. `body` ⇒ aggregation 默认关闭；显式 `aggregate: true` 与 `body` 同时出现，在 attach 时抛错。
3. `context.invalidate` 只由 Frame 调；非 owner 结算时通知 owner 一次，owner 不再传播（render storm 不可发生）。
4. 同一个 component 同时服务两个 slot；`lastComponent` 按 slot、`state` 按行。
5. memo 的键是 (output, theme, width)，不含 component 身份，所以重建实例仍是 cache hit。
6. teardown 只有一套 registry：spinner 定时器、compaction 补丁、foreign hub 都注册进 `card/lifecycle.ts`，`/reload` 的 `session_shutdown` 一次性回收。

## 已验证的约束

- `renderCall(args, theme, context)` / `renderResult(result, {expanded, isPartial}, theme, context)` 都返回 `Component`；`renderShell` 是每个 definition 一个值；`lastComponent` 按 slot；`state` 按行；同一实例服务两个 slot 合法（`test/foreign-tool-cards.test.mjs:344` 已经在这么做）。
- 依赖类别 in-process：纯文本推导 + 内存渲染状态，无 I/O。唯一 port 是 body slot，背后有三个以上真实 adapter（bash box、diff box、codegraph box），符合「两个 adapter 才让 seam 成立」。
- 对外调用方：`todo/index.ts`（2 个符号）、`brave-search/index.ts` 与 `ollama-web-fetch/index.ts`（各 10 个符号）。迁移是机械替换。
- 测试爆炸半径：`test/aggregation.test.mjs` 3 条渲染断言；`test/foreign-tool-cards.test.mjs:333-512`、`:514-606`；`test/pi-diff.test.mjs` 的 frame 相关断言。`test/oh-my-pi-todo.test.mjs`、`test/todo-state.test.mjs`、exception list、`stripBackground`、line memo、`discoverRunnerConstructors` 不受影响。

## 非目标

- **codegraph**：推迟，且被它自己的配置挡住 —— `codegraph/tsconfig.json` 没有 `paths`（`@earendil-works/pi-tui` → TS2307）、`package.json` pin 了自己那份 pi devDependency、`test/harness.mjs` 的 jiti 没有 alias。它接进来时大概还需要一个 `header` 覆盖槽，现在不预留。
- **compaction 补丁与 foreign hub**：它们 patch 宿主，不是 card language，留在 `ui/`（teardown 注册进 card registry）。
- **`highlightBashLines` 的独立 seam**：评审 candidate 02，另立计划。
- **todo HUD 的 badge**、statusline、vim-mode、ollama-cloud：评审里各自的 candidate，不在本计划。

## Tickets

| # | 标题 | 依赖 | 状态 |
| --- | --- | --- | --- |
| 01 | card library 与 Frame 核心 | — | done |
| 02 | compact cards 改成 spec | 01 | done |
| 03 | foreign card 收敛成一次调用 | 01 | done |
| 04 | 外部调用方迁移（brave / ollama / todo） | 01 | done |
| 05 | pi-diff 降为 body slot adapter | 01 | done |
