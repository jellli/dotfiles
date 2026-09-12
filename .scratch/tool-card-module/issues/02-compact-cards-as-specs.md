# 02 — compact cards 改成 spec

**Status:** done
**Blocked by:** 01

`ui/compact-tool-cards.ts` 只留五份 spec：

- read / grep：`detail` + `row` + `summary`（`detail` 不再自己 `bracketDetail`，Frame 负责括注）。
- find / ls：`detail` + `summary` + `aggregate: false`。
- bash：`detail`（Shiki 高亮经 `state` 缓存，只在结果会变时 invalidate）+ `body`（输出框；流式时底边带 spinner 与耗时，settled 后带 exit 统计）。

删除：`compactDefinition`、`renderHeader`、本文件里的 `textOutput` 与 `shorten`（`shorten` 的 `...` 与 pi-ui 的 `…` 曾经是两个规则）、`compactDefinition` 的 error preview 分支、本文件的 `RESULT_LINE_INDENT` 依赖。
保留：compaction 补丁（`installCompactCompactionRenderer`、bundle 入口）与 `installBundleCompactionRenderer` —— 它们 patch 宿主，不是 card language。

## 验收

- [x] `find`/`ls` 连续调用各画一张卡 —— 原文写的是"不再各画一张卡"，与任务行的 `aggregate: false` 矛盾；按任务行实现（= 与今天行为一致，不分组），`test/tool-card.test.mjs` 断言"各画一张卡"
- [x] bash 的 box 几何（`└─┌─…`、底边 stats）在 card 接口测试里断言

## Comments

- 2026-09-12 实现完成。`ui/compact-tool-cards.ts` 635 行 / 20629 字节 → 432 行 / 15685 字节。文件现在只剩五份 `CardSpec`（`readSpec`/`grepSpec`/`findSpec`/`lsSpec`/`bashSpec`，导出给 card 接口测试直接断言）加 compaction 补丁；`compactDefinition`、`renderHeader`、本文件的 `textOutput`/`shorten`、`RESULT_LINE_INDENT` 依赖、`BashHeader`/`BashResult` 全删，`registerCompactToolCards` 只剩五行 `toolCard(pi, createXToolDefinition(cwd), xSpec)`。`ui/index.ts` 不用改。
- bash：header 仍是命令（Shiki 高亮），输出框改由 `body` 交出行；`└─┌─…` 拼接与列缩进交给 Frame，spinner 与时钟也由 Frame 驱动，body 只读 `spinnerChar`/`elapsedText`。
- 两处取舍（已与用户确认）：
  - **find/ls 不分组**：按任务行的 `aggregate: false`；验收行那半句视为笔误（见上）。
  - **header 高亮怎么拿 context**：`CardSpec.detail` 是纯 `(args, theme)`，拿不到 row，也就起不了异步高亮、叫不了 invalidate。改由 `body` priming（body 是 Frame 唯一交出 context 的槽位）：body 为当前命令起高亮，结果按命令文本缓存，`detail` 读缓存，解析回来时 invalidate 一次——且只在 detail 真会变的那一次。**没有改动 01 冻结的 card 接口。**
- 一处顺带修正：expanded 的错误输出原来是一行里带 `\n`，Frame 的 `rows()` 会把它拆成不带框的散行；现在按行交出行，展开后每行都在框里。
- 测试：`test/tool-card.test.mjs` 新增 "The compact cards the extension ships" 段（read/find/ls 的 detail+summary、find 不分组、bash 的 box 几何与底边 stats、错误折叠与展开、header 高亮的 priming、五个 spec 与 `registerCompactToolCards` 的对应关系）。该段冻结 `Date.now`，所以 `0.0s` 是确定的。`tsgo`、prettier、7 个测试文件全绿。真机 `PI_TIMING=1 pi --print` 加载无异常。
- 01 的实现早在 `3f5d73f` 就落地了（见其 Comments），状态行仍写着 `ready-for-agent`，顺手改成 `done`。
- 2026-09-12 `/code-review`（两轴各一个 sub-agent）跑完，findings 与处置：
  - **Standards 已改 3 条**：bash 段注释与 `bashSpec` 文档重复；`ResultFormatter` 与 `.pi/CONTEXT.md` 的 Summary 说法不合 → `SummaryFormatter`；`readSummary`/`findSummary`/`lsSummary` 三份同形 → `countSummary(noun)`。
  - **Standards 未改（附理由）**：右侧竖线 dim 的 ANSI 兜底与 `card/text.ts` 的 `getFgAnsi` 走法重复（抽 helper 要动 01 的 card 库，今天只有一个调用方）；`readCallLine`/`readCallRow` 同形（本次未触碰的基线代码）；测试里的 `box(width)` 没复用（它画不出带 label 的底边）。
  - **Spec 三条偏差已写进代码注释**：`grepSpec` 只写 `detail` 不写 `row`（`row` 默认取 `detail`，行为等价，票面任务行漏了这层）；"经 `state` 缓存"实际是模块级按命令文本的 cache（`detail` 拿不到 state，按行存就读不到）；`context.invalidate` 由 body 直调（违反不变式 3 的字面；bash 卡不分组，body 只在 owner 上跑，没有 render storm）。
  - **Spec 两条"疑似 bug"复核结论**：命令文本作 key 丢掉 cwd 是**已知取舍**——同一个 command 在不同 cwd 下会显示先 priming 的那个前缀；单 session 内 `context.cwd` 恒定，且改用全文作 key 就得给 `detail` 加 context（见上）。`commandHighlights.clear()` 不是静默降级——`body` 每帧都重新 priming，丢掉条目的行下一帧就重新高亮（与 pi-diff 的 token cache 同一套做法）。
  - 工作区里 `todo/index.ts`、`settings.json`、`.zshrc`、nvim lock、`.scratch/ui-render-perf/*` 的改动不是本票的，未随本票提交。
- 未做（属 03–05）：`foreign-tool-cards.ts` 的 `contentCard`/`wrapForeignDefinition`、`brave-search`/`ollama-web-fetch`/`todo` 的迁移、`pi-diff.ts` 的 body slot。
