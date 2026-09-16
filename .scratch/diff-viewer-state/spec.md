# diff-viewer-state — 让差异查看器自己持有状态

**Status:** ready-for-agent

2026-09-16 架构评审（candidate 04）的结论。评审报告在 `$TMPDIR/architecture-review-20260916-111605-zh.html`（临时目录，可能已被清掉；本文件不复制它的正文）。

`ui/pi-diff.ts` 的 diff 流水线把状态放在一个双方都能写的袋子里：`DiffState`（`:27`，私有类型）同时是 Card spec 的行状态 `S`、`MutationDiffViewer` 的内部状态、以及导出工厂 `createDiffViewer({ state, … })`（`:886`）的入参。于是私有类型泄漏到导出接口上，测试（`test/pi-diff.test.mjs:42`、`:105`）只能手拼 `{ capture: … }` 这个它叫不出名字的形状。

代价不是性能，而是接口：接口不再是测试面，流水线有两个写入者。

## 决策

| # | 决定 |
| --- | --- |
| D1 | 导出的工厂收**源**，不收状态袋：`createDiffViewer({ source, path, theme, expanded, tokenize, redraw? })`。`DiffState` 回到模块内部，成为纯私有类型。 |
| D2 | 源是两者之一：`type DiffSource = { capture: Capture } \| { diff: string }`。`capture` 来自按 tool call id 键的 `captures` 注册表，`diff` 来自 `result.details` 的原生 diff。**两者都没有时保持今天的行为**（查看器画 `Diff unavailable after reload`）。 |
| D3 | 输入按生命周期分开：构造时给每行一份的输入（`source`、`path`、`tokenize`，加上构造后即可渲染所需的 `theme` / `expanded`）；每帧用既有的 `setExpanded()` / `setTheme()` 刷新。`redraw` 是能力而不是渲染输入，构造时给一次。 |
| D4 | 卡片侧只剩两件事：capture 查表（`captures.get(toolCallId)` 与 `captures.delete`）与持有查看器实例（行状态 `S = { viewer?: DiffViewer }`）。 |
| D5 | `DiffViewer` 类型不变（`Component & { setExpanded; setTheme }`）。它是否还需要 `Component` 与本票无关（今天只有 body 读它返回的行）——不在本票处理。 |

## 改造后的形状

```ts
export type DiffSource = { capture: Capture } | { diff: string };

export function createDiffViewer(options: {
  source: DiffSource | undefined;
  path: string;
  theme: RenderResultTheme;
  expanded: boolean;
  tokenize?: DiffTokenizer;
  /** 异步高亮落地后请求重画；Frame 的 `redraw()`。 */
  redraw?: () => void;
}): DiffViewer;

function mutationSpec(tokenize: DiffTokenizer): CardSpec<{ viewer?: DiffViewer }> {
  return {
    detail: …,
    body: (input) => {
      // 错误分支：captures.delete(callId) 后返回 undefined（框架画错误预览）。
      // source：capture（注册表）或原生 diff，二者都没有就是 undefined。
      // state.viewer ??= createDiffViewer({ source, path, theme, expanded, tokenize, redraw: input.redraw })
      // viewer.setExpanded(options.expanded); viewer.setTheme(theme);
      // return viewer.render(input.width);
    },
  };
}
```

## 状态字段的归属

| 字段 | 今天谁写 | 改造后 |
| --- | --- | --- |
| `capture` | body（`??= captures.get`） | 查看器（从 `source`） |
| `rows` / `totalLines` | body（原生 diff 分支）与查看器 | 查看器 |
| `highlighted` / `highlightPending` / `stats` | 查看器 | 查看器（不变） |
| `invalidate` | body（`= input.redraw`） | 查看器（构造时的 `redraw`） |
| `viewer` | body | body（`S` 里唯一剩下的字段） |

## 回归锁（改的时候不能碰）

- **只高亮可见窗口**（`ui-render-perf` 01）：首帧 `Rendering diff...`，随后按窗口分块 tokenize。
- **`setTheme` 每次调用都重算 palette**，不做身份守卫；`highlighted` 不被清空（`ui-render-perf` 07 的既有断言；把身份守卫加回去会让测试失败，已变异验证过）。
- `stats` 只在 palette 真的变了时置空并重算。
- 盒子几何：`boxed` / `layout` / `N lines` / 折叠 8 行 / 展开全文。
- `captures.delete(callId)` 在拿到源之后执行；失败分支也要执行。

## 非目标

- `highlightBashLines` 的接缝（它借 `ui/pi-diff.ts` 的高亮，与本票无关）。
- `DiffViewer` 是否保留 `Component`。
- 高亮策略、分块大小、token 缓存上限、`/reload` 之后的行为。
- 任何性能目标：本票没有性能收益，只有接口与可测性。

## 基线

- `npm test`（extensions）全绿；`test/pi-diff.test.mjs` 506 行。
- 根 `./tsgo`（用 v24.4.1 的 PATH）exit 0。

## Tickets

| # | 标题 | 依赖 | 状态 |
| --- | --- | --- | --- |
| 01 | 查看器收源，不收状态袋 | — | ready-for-agent |
