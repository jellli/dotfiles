# 01 — CardInput 接口与 Frame 的派生路径

**Status:** ready-for-agent

按 `spec.md` 的 interface 落地：四个槽位收同一个 `Card input`；`detail` / `row` / `summary` 改成 `Frame.render()` 内派生；`Entry` 改存原料；`redraw()` 与 epoch。本票与 02 属同一提交 —— 接口改完之前九份规格编译不过，所以本票自己的验收只到类型层面。

## 任务

- [ ] `card/tool-card.ts` 加 `CardInput<S>`、`CardBodyInput<S>`（= `CardInput<S> & { width }`）与 `CardSpec<S>`；`toolCard` 加泛型参数 `S extends object = object`。
- [ ] `Entry` 的字段改为 `args`、`cwd`、`state`、`result`、`output`、`isPartial`、`isError`、`invalidate`、`epoch`、`group`；删 `detail`、`row`。`registerEntry` 因此少两个参数。
- [ ] `Entry.epoch`：`registerEntry` / `updateResult` 在 `args` 身份、`result` 身份、`output`、`isPartial`、`isError` 有变化时加一；无变化时不加。
- [ ] `Frame.render()` 里派生 `detail` / `row` / `summary`，共用一张记忆表，键 `(epoch, theme, width)`。删掉 `summaryLine` 今天的 `(output, theme, width)` 键用法，保留 `expandedLines` / `placeBody` / `ownBody` 的现状。
- [ ] `input.redraw()`：Frame 实现，`Entry.epoch` 加一并复用 `invalidateOwner`（非 owner 转交拥有者，拥有者不传播）。`ownBody` 给第三方 renderer 中和 `invalidate` 的行为不变。
- [ ] 默认值 `defaultDetail` / `defaultSummary` / `firstShortArgument` / `runDisplay` 改成收 `CardInput`，行为不变（仍只读 `args` 与 `output`）。
- [ ] 聚合组的拥有者画子记录的组内行时，用子记录存下来的 `args` / `cwd` / `state`，不用拥有者自己的 context。
- [ ] 更新模块头部的注释：不变式 3、5、7 按 `spec.md` 重写；`commandHighlights` 那段「唯一在 Frame 之外请求重画的地方」的说明删掉（02 删代码，这里删说明）。

## 验收

- [ ] `cd .pi/agent/extensions && ./tsgo` 无错（02 完成后）。
- [ ] 源码里搜不到 `entry.detail`、`entry.row`、`spec.detail(` 的旧签名用法。
- [ ] `Frame.render()` 是 `detail` / `row` / `summary` 的唯一派生点：这三个名字在 `registerEntry` / `updateResult` 里不再出现。
- [ ] `npm test` 在 02 完成后全绿；本票不单独提交。

## Comments

- 2026-09-16 开票。来源：架构评审 candidate 01 + grilling Q1–Q14。设计树已走完，无未定项。
