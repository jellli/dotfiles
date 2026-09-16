# 03 — 三条断言与 CONTEXT.md 词条

**Status:** ready-for-agent
**Blocked by:** 01

在既有 `test/tool-card.test.mjs` 里加三条断言固定新能力，并按 `CONTEXT.md` 的规矩加词条。测试写法沿用该文件的做法：顶层 `assert`，一切断言穿过 `toolCard`。

## 任务

- [ ] 三条断言加在 `test/tool-card.test.mjs` 里（新开一节，例如 `// The card input: a slot reads the row`）：
  - [ ] ① 一个 `summary` 直接读 `input.result.details`（不需要解析文本）。
  - [ ] ② 一个 `detail` 从记录状态读到值：先渲染一次（无值 → 显示原始命令），往 `input.state` 写值并调 `input.redraw()`，再渲染 → 显示带值的结果。**不要**引入 shiki：直接往记录状态里放值。
  - [ ] ③ 聚合组里的组内行改成渲染时派生后仍正确：连续两次同工具调用 → 一张卡、`×2`、两条组内行文本与改动前一致；且第二条记录的组内行来自**它自己**的 `args`（两条 `args` 不同，断言两条行文本不同）。
- [ ] 既有断言只做机械修改（规格签名），语义不改；如果某条断言必须改语义，停下来在 `## Comments` 记录原因。
- [ ] `CONTEXT.md` 加词条 **Card input**（放在 **Card spec** 之后）：

  ```
  **Card input**:
  What the **Frame** hands one slot for one render: `args`, `result`, `output` (the tool's text output), `options`, `theme`, `state` (the row's card state), `cwd`, and `redraw()`. All four derivation slots take the same card input; `body` takes one more field, `width` (the result column).
  _Avoid_: props, context
  ```
- [ ] `CONTEXT.md` 的 **Card spec** 词条补一句：the four slots all take one **Card input**; the Frame derives `detail`, `row` and `summary` on every render, so a slot reads the result, the row's state and the session's cwd instead of recovering them from text.
- [ ] `CONTEXT.md` 的 **Frame** 词条补一句：the Frame is the only module that calls `context.invalidate`; a slot asks for a repaint through **Card input**'s `redraw()`, and the Frame routes it by its owner rule.

## 验收

- [ ] `npm test` 全绿，含三条新断言。
- [ ] 把三条新断言任意删掉一条，对应的能力就没有断言覆盖：逐条确认它失败时原因是接口行为变了（可临时把 `CardInput` 的 `result` 改成 `undefined` 验证 ①）。
- [ ] `./tsgo` 无错；`npm run build` 成功，`card/dist/*.js` 更新。
- [ ] `CONTEXT.md` 的三个词条改动都在，且用词与既有词条风格一致（`_Avoid_:` 行、加粗术语）。

## Comments

- 2026-09-16 开票。`CONTEXT.md` 词条在本票落地而不是现在，因为 Q13 定了记录与实现同一提交；本票的正文里已经写好可直接粘贴的英文原文。
