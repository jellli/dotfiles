# 05 — pi-diff 降为 body slot adapter

**Status:** done
**Blocked by:** 01

`ui/pi-diff.ts` 交出 header 与 result line，只保留 diff box：`body` 返回 `[top, ...rows, bottom]`，`└─┌─` 拼接与列缩进由 Frame 做。`createDiffViewer`、`highlightBashLines`、capture registry 的对外契约不变（highlight 独立 seam 是 candidate 02，另立计划）。

验收：`test/pi-diff.test.mjs` 里属于 Frame 的断言（footer `└─ N lines`、reused card instance）搬进 `test/tool-card.test.mjs` 后删除；diff box 几何、tokenize、主题色断言原样保留。

## Comments

- 2026-09-12 关票。`wrapMutation` 只覆盖 `execute`（capture 的字节/行数守卫一字未动），整张卡交给 `mutationSpec(tokenize)`：`detail` 是路径（方括号归 Frame），`body` 把 `MutationDiffViewer.render(width)` 的盒子行交出去。Frame 交出的宽度就是结果列宽（连接符已扣掉），正好是原来那个 `boxWidth`。
- `MutationDiffViewer.render` 不再拼 `└─`、不再缩进、也不再 fit 到整卡宽度——`header()` 与 `resultLine`/`toolHeader`/spinner 的 import 一起删除。body 在「还在跑」或「失败且没有 diff」时交不出行，spinner 与 error preview 归 Frame。
- body ⇒ aggregation 关闭（不变式 2）：连续两次 edit 仍是两张卡，新加断言守着这条（分组会让 Frame 没有 body 可画）。
- 对外契约不变：`createDiffViewer` 的入参、`highlightBashLines`、capture registry（`Symbol.for` 键、`execute` 后的 delete 时机）都原样；盒子实例只是多存了一份在 row state 的 `state.viewer`。
- 测试：`test/pi-diff.test.mjs` 保留 diff box 几何、tokenize 上界、主题重绘（现在直接重复渲染同一个 Frame 来验证 live theme）、capture 的前后双读守卫；card 形态断言搬进 `test/tool-card.test.mjs` 的「The diff card the extension ships」段（方括号路径、`└─┌` 拼接、footer 行数、运行中 spinner、失败走 error preview、Frame 复用、不分组）。两条原本靠 footer 文本数行数的守卫断言，改成直接数画出来的行数。
