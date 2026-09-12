# 03 — foreign card 收敛成一次调用

**Status:** done
**Blocked by:** 01

`ui/foreign-tool-cards.ts` 删除 `wrapForeignDefinition`、`contentCard`、`ownedComponent`、`OwnContentCard`，listener 对每个定义只做 `toolCard(pi, definition)`：

- 无自有 renderer → Frame 推导整张卡，包含 aggregation。
- 有自有 renderer → Frame 从 `definition.renderCall || definition.renderResult` 推导默认 body：去背景（`stripBackground` 与它的 memo 变成 Frame 内部实现）、画不出内容时给 fallback 行、真实 expanded 状态原样透传。

保留：host 入口发现（ADR-0003 的候选顺序与 chunk 扫描兜底）、hub 与 `Symbol.for` 键、exception list、`alreadyCarded` / `isOwnTool` / `isInside`。

验收：`test/foreign-tool-cards.test.mjs` 里 card 形态段（`:333-512`、`:514-606`）搬进 `test/tool-card.test.mjs` 后删除；host 发现、exception list、`stripBackground`、line memo、reload badge 段的断言原样保留并保持绿。

## Comments

- 2026-09-12 关票。listener 现在只调注入的 card factory（生产路径是 `toolCard(pi, definition)`），`wrapForeignDefinition`、`contentCard`、`OwnContentCard`、`ownComponent` 以及那一节的 `ContentState` 全部删除，`ui/foreign-tool-cards.ts` 711 → 约 470 行。
- 默认 body 落在 card 模块：`ownBody(tool)` 按 row 的状态选 `renderCall`（还没结果）或 `renderResult`（结果已到），组件按 slot 缓存进 row state 的 `own`、并以 `lastComponent` 交回给 renderer；行经 `stripBackground`（连同它的 4M 文本预算 memo 搬进新的 `card/strip-background.ts`）后交给 Frame。renderer 抛错或交不出行时不接管，Frame 自己画 spinner / summary / error preview / expansion（不变式 1）。
- 一条新的 Frame 规则：body 交出的多行块，首行是 box 边框（`┌`）时贴 `└─`（bash / diff 盒子不变），否则保留 `└─ ` 的空格、余行对齐到首行内容——自有 renderer 交出的是文本行，不是盒子。
- 与旧 `contentCard` 的两处行为差异，按 spec 取齐：detail 统一走 Frame 的 `defaultDetail`（`display.description` → `display.name` → 第一个短参数），自有 renderer 的卡不再 aggregation（body ⇒ 关闭，不变式 2）。
- 测试：卡形态断言按新接缝重写进 `test/tool-card.test.mjs` 的「A tool that draws its own card」段；foreign 测试保留 host 发现、exception list、`stripBackground`、line memo、reload badge 断言，其中 reload 段的 card factory 换成真实的 `toolCard`（假 factory 画不出卡），`stripBackground` 断言改从 `card/strip-background.ts` 导入。
