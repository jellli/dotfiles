# 换主题后已有 diff 卡配色陈旧

**Category:** bug
**Status:** done

## 问题

`ui/pi-diff.ts:690` 在构造 `MutationDiffViewer` 时取 `theme` 并算出 `this.colors = resolveDiffColors(theme)`（`:691`）；`renderResult` 复用旧组件（`:980` `context.lastComponent instanceof MutationDiffViewer`）只调 `:989 component.setExpanded(...)`。

宿主换主题会 `ui.invalidate()` → 整个转录的 renderer 重跑，但**重跑也修不回来**：拿到的还是同一个组件，palette 是构造时那份。结果换主题后只有新出现的 diff 卡是新配色，已在屏上的保持旧配色。

`state.highlighted` 不需要动：里面的串来自固定 shiki 主题（`gruvbox-dark-medium`），主题相关的只有 gutter、行背景与前景。

## 任务

- [x] `MutationDiffViewer` 加 `setTheme(theme)`：只重算 `resolveDiffColors(theme)`，不清 `state.highlighted`
- [x] 复用分支里调用它（或在主题变化时重建组件）

## 验收

- [x] 同一张卡片 `setTheme(新主题)` 后 `render()` 的 gutter/背景/前景取自新主题（注入 `getFgAnsi`/`getBgAnsi` 计数断言）
- [x] 高亮缓存不被清空（tokenizer 调用次数在 `setTheme` 前后不变）

## Comments

- 2026-09-12 开票。来源：与 pi-tool-display 对比后的复核（它每次 `renderResult` 重建组件，所以没有这条）。
- 2026-09-12 完成。`MutationDiffViewer.setTheme(theme)` 只重算 `resolveDiffColors(theme)`，并把内嵌主题色的 `state.stats` 置空重算；`state.highlighted` 原样保留（它来自固定 shiki 主题）。`renderResult` 复用组件时无条件调用 `setTheme`——新建的组件是 no-op，因为构造时传入的就是同一个 theme 对象。`DiffViewer` 类型补上 `setTheme`。

  测试（`test/pi-diff.test.mjs`）分两层：一层直接 `setTheme` 两套注入 `getFgAnsi`/`getBgAnsi` 的主题；一层走真实复用分支——同一个 `renderResult` + `lastComponent`，主题对象只有访问器后面的颜色变了（宿主的 theme 模块就是"稳定 proxy 读全局主题"），断言复用回来的是同一个组件、新的 add 前景与 base 背景出现、旧颜色消失，且 tokenizer 调用次数不变。

  code-review 抓到的第一版实现是死的：`setTheme` 里 `if (theme === this.theme) return`——宿主每次传的是同一个对象，于是永远早退，票里说的"重跑也修不回来"一点没改。现在每次结果渲染都重算 palette（十几次访问器调用），只有在颜色真的变了时才让 summary 重算；把那条 identity 守卫加回去，上面第二层测试立刻失败（已 mutation 验证）。
