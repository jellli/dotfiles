---
status: accepted
---
# 第三方工具卡片：运行时替换工具定义源

pi 没有"给所有工具换展示"的 API：工具行的样式只来自工具定义本身（`renderCall` / `renderResult` / `renderShell`），而第三方工具的定义由第三方扩展持有。为了让第三方工具也遵守本地卡片规则，`ui` 扩展在运行时替换宿主 `ExtensionRunner.prototype.getAllRegisteredTools`，在它返回的定义上套本地卡片——`execute`、参数 schema、prompt 元数据原样保留。选这条非官方路径，是因为官方路径只能覆盖内置工具（`createXToolDefinition` 工厂）与本仓库扩展；我们既不改上游也不提 issue，逐个第三方包提 PR 或 vendor 源码无法单方面保证。

## Considered Options

- **同名抢占注册**：pi 对内置工具文档化了这条路，但 `execute` 必填、公开 API 拿不到原 `execute`，会连行为一起换掉，不是"只换展示"。
- **只改 `InteractiveMode.getRegisteredToolDefinition`**：覆盖 TUI，但漏掉 HTML 导出，且同样依赖内部接缝。
- **逐个第三方包提 PR / vendor 源码**：需要改别人的代码，且每接一个新包重新谈判。

## Consequences

- pi 升级若改动该方法名或类身份，替换失效；`test/foreign-tool-cards.test.mjs` 的探针断言负责报警。
- 宿主有两份类副本（`dist/index.js` 与 `dist/bundle/*`）。**该替换哪一份、按什么顺序 import，由 ADR-0003 修正**：运行中的只有打包那一份，未打包那份降级为回退，不再无条件 import。
- 与 `pi-fabric` 的同类替换共存：两边各自用 `Symbol.for` hub 挂 listener，依次执行。
