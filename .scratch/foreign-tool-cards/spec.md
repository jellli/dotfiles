# 第三方工具卡片（foreign tool cards）

**Status:** ready-for-agent

术语（Tool card / Foreign tool card / Exception list）见 `.pi/CONTEXT.md`。

## 目标

非本仓库来源的工具（第三方 npm 包、MCP 适配器、SDK 宿主注册的工具）在主对话里也遵守本地卡片规则：徽章头、`└─ ` 结果行、展开后缩进的内容块。内容归工具自己，卡片只提供外壳、折叠与截断。

## 机制

pi 没有"给所有工具换展示"的 API。工具行的样式只来自工具定义，而第三方工具的定义由第三方扩展持有。

`ui` 扩展在运行时替换宿主 `ExtensionRunner.prototype.getAllRegisteredTools`：

- session 每次 `_refreshToolRegistry()` 都读这个方法，所以在这里返回改写后的定义，TUI 与 HTML 导出都会用。
- 只换渲染槽，保留 `execute`、参数 schema、prompt 元数据。
- 宿主存在两份类副本（`dist/index.js` 与 `dist/bundle/*`）；`dist/bundle/chunks/*.js` 里只有含 `getAllRegisteredTools` 的文件才 import。
- 复用 `Symbol.for` hub，与 `pi-fabric` 的同类替换共存。
- 宿主包路径从 `process.argv[1]` 上溯找到（扩展代码里 `import.meta.resolve` 会抛错：加载器把模块重写成 `data:` URL），因此 `dist/bundle/chunks/*.js` 里的副本也能替换。
- `ui/index.ts` 的工厂必须是 async 且 `await` 安装：pi 会 await 工厂，这样替换赶在 session 建工具注册表之前；晚到会让注册表留着旧定义。
- 跳过判断比较 realpath：`~/.pi` 是软链，loader 可能报软链路径或真实路径。
- 每个原始定义只套一次（WeakMap 缓存），返回稳定的定义对象身份。

## 卡片规则

| 项 | 规则 |
|---|---|
| 头行 | 徽章 + 详情。自带 renderer 的工具：徽章 = 工具 label（工具身份），详情 = `display.description`（无则第一个短字符串参数）；没有 renderer 的工具：徽章 = 工具名，详情 = 第一个短字符串参数 |
| 结果行 | 输出单行 → 直接显示该行；多行 → `N lines`（muted） |
| 正文 | 自带 renderer 的工具：它自己的卡片**一字不改**地画出来——不缩进、不删行；唯一改动是去掉背景色（保留前景色）。**折叠归它自己管**：真实的 `expanded` 原样传给它，所以它自己的截断和 Ctrl+O 展开照旧工作，本地卡片从不隐藏这段正文。它什么都没画时才退回本地结果行。没有 renderer 的工具：折叠显示 `N lines`，展开显示原文（`│ ` 缩进） |
| 聚合 | 没有自带 renderer 的工具走共享 aggregation，连续同名调用合成一组；自带 renderer 的工具不聚合（它们的行内容不是文本摘要，聚合会丢信息） |
| 跳过 | 本仓库扩展里**已经自带 renderer** 的工具（自带卡片）、例外名单命中的工具。本仓库里还没采用卡片语言、没有 renderer 的工具（如 figma）照样套卡片 |

## 配置

`~/.pi/agent/tool-cards.json`：

```json
{ "exceptions": ["mcp__x*"] }
```

支持结尾 `*` 前缀通配。文件不存在、字段缺失或解析失败 = 名单为空。启动时读一次。

## 范围

主 TUI + HTML 导出（同一处改写，两处同时生效）。

## 验证

`test/foreign-tool-cards.test.mjs`：

1. **替换生效**：假 Runner 类 + 假 aggregation，断言第三方定义被套上卡片，且 `execute` 仍是同一个函数。
2. **跳过规则**：本仓库路径的工具、例外名单精确命中、前缀通配命中。
3. **卡片内容**：头行、结果行、展开块（工具自带 renderer 的行出现在缩进块里）。
4. **探针**：`discoverRunnerConstructors()` 在真实 pi 上至少找到一个类；pi 升级改名时这条会失败。
5. **dispose**：移除 listener 后不再改写。

## 风险

- pi 升级改动 `getAllRegisteredTools` 或类身份 → 替换静默失效（探针报警，见 ADR-0002）。
- 第三方组件在展开块里渲染：`try/catch` 兜底；我们不在渲染过程中 invalidate，避免渲染死循环。
- 自带 renderer 的工具不聚合，与 read/grep 的行为不同——这是有意的取舍。

## 不做

- 不改 pi 上游，不提 issue。
- 不改 `pi-fabric`。
- 不动 `pi-tool-cards` 分支上的 pill badge 设计。
