# 02 — compact cards 改成 spec

**Status:** ready-for-agent
**Blocked by:** 01

`ui/compact-tool-cards.ts` 只留五份 spec：

- read / grep：`detail` + `row` + `summary`（`detail` 不再自己 `bracketDetail`，Frame 负责括注）。
- find / ls：`detail` + `summary` + `aggregate: false`。
- bash：`detail`（Shiki 高亮经 `state` 缓存，只在结果会变时 invalidate）+ `body`（输出框；流式时底边带 spinner 与耗时，settled 后带 exit 统计）。

删除：`compactDefinition`、`renderHeader`、本文件里的 `textOutput` 与 `shorten`（`shorten` 的 `...` 与 pi-ui 的 `…` 曾经是两个规则）、`compactDefinition` 的 error preview 分支、本文件的 `RESULT_LINE_INDENT` 依赖。
保留：compaction 补丁（`installCompactCompactionRenderer`、bundle 入口）与 `installBundleCompactionRenderer` —— 它们 patch 宿主，不是 card language。

验收：`find`/`ls` 连续调用不再各画一张卡（在 card 接口测试里断言）；bash 的 box 几何（`└─┌─…`、底边 stats）在 card 接口测试里断言。
