# 03 — foreign card 收敛成一次调用

**Status:** ready-for-agent
**Blocked by:** 01

`ui/foreign-tool-cards.ts` 删除 `wrapForeignDefinition`、`contentCard`、`ownedComponent`、`OwnContentCard`，listener 对每个定义只做 `toolCard(pi, definition)`：

- 无自有 renderer → Frame 推导整张卡，包含 aggregation。
- 有自有 renderer → Frame 从 `definition.renderCall || definition.renderResult` 推导默认 body：去背景（`stripBackground` 与它的 memo 变成 Frame 内部实现）、画不出内容时给 fallback 行、真实 expanded 状态原样透传。

保留：host 入口发现（ADR-0003 的候选顺序与 chunk 扫描兜底）、hub 与 `Symbol.for` 键、exception list、`alreadyCarded` / `isOwnTool` / `isInside`。

验收：`test/foreign-tool-cards.test.mjs` 里 card 形态段（`:333-512`、`:514-606`）搬进 `test/tool-card.test.mjs` 后删除；host 发现、exception list、`stripBackground`、line memo、reload badge 段的断言原样保留并保持绿。
