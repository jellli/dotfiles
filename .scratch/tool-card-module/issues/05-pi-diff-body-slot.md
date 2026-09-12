# 05 — pi-diff 降为 body slot adapter

**Status:** ready-for-agent
**Blocked by:** 01

`ui/pi-diff.ts` 交出 header 与 result line，只保留 diff box：`body` 返回 `[top, ...rows, bottom]`，`└─┌─` 拼接与列缩进由 Frame 做。`createDiffViewer`、`highlightBashLines`、capture registry 的对外契约不变（highlight 独立 seam 是 candidate 02，另立计划）。

验收：`test/pi-diff.test.mjs` 里属于 Frame 的断言（footer `└─ N lines`、reused card instance）搬进 `test/tool-card.test.mjs` 后删除；diff box 几何、tokenize、主题色断言原样保留。
