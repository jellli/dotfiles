# codegraph-card — 让 codegraph 的卡片走框架

**Status:** done

2026-09-16 架构评审（candidate 02）的结论，经 grilling Q15–Q23 定稿。

codegraph 自己实现了一套卡片语言（`codegraph/tools.ts` 里约 260 行），并用路径前缀规则（`ui/foreign-tool-cards.ts:313-320` 的 `alreadyCarded`：本仓库工具 + 自带 renderer ⇒ 跳过 hub）绕开框架。代价：没有徽章、没有 `└─` 结果行、没有 spinner、没有计时、不聚合，而且每帧对每一行跑一次手写的 ANSI 剥离 `fitLine`（`card/text.ts` 的同名函数带记忆）。

`.scratch/tool-card-module/spec.md` 把 codegraph 记为「推迟，被它自己的配置挡住」，并预告「接进来时大概还需要一个 header 覆盖槽」。两件事现在都有结论：前置件仍然成立（见下），**header 覆盖槽不需要了** —— 身份移进徽章，`toolLine` 成为 `detail`。

## 决策

| # | 决定 |
| --- | --- |
| Q15 | **保留盒子**：`body` 交出盒子行，上边框裸框，下边框放状态；`CodeGraphCallCard` 整体删掉（运行态由下边框表达，bash 先例）。代价：不变式 2 ⇒ codegraph 不聚合。 |
| Q16 | **codegraph 自己写规格**：`toolCard(pi, definition, codegraphSpec(name))`，`detail` 就是今天的 `toolLine`（保留 `depth 3` 后缀与 `<missing …>` 兜底）。 |
| Q17 | `codegraph/tsconfig.json` 改成 `extends: "../tsconfig.json"` + 覆盖 `include`，不再复制 `paths`。 |
| Q18 | `codegraph/test/harness.mjs` 改用共享的 `../test/jiti-setup.mjs`（`createTestJiti`），删掉自己硬编码的 `PI_ROOT` 与无 alias 的 jiti。 |
| Q19 | 卡片断言放 `extensions/test/tool-card.test.mjs`，不放 codegraph 的 harness。 |
| Q20 | **失败时交给框架**：body 返回 `undefined`，框架画红色错误预览。 |
| Q21 | **下边框只放状态**：运行中 spinner + 耗时，结束后 `N lines`；展开提示成为盒内最后一行（bash 形状）。 |
| Q22 | 四条断言：头部（含 `depth` 后缀）、运行中下边框、成功后下边框与盒内前 3 条非空行、展开后全文。 |
| Q23 | 两张票、两个提交：01 前置件，02 卡片迁移与断言。 |

## 改造后的卡片

```
[CODEGRAPH EXPLORE] ["how does a request reach the db"]
 └─┌────────────────────────────────────┐
   │ function findUser — src/a.ts:12     │
   │ class UserService — src/b.ts:3      │
   │ … 9 more lines (Ctrl+O to expand)   │
   └─ 12 lines ─────────────────────────┘
```

运行中下边框是 `⠸ 1.2s`；失败时 body 交不出行，框架画错误预览。今天的形状是 `· CodeGraph explore "query"` 一行加一个 `┌─ result · explore ─┐ … └─ 12 lines ─┘` 盒子，没有徽章与连接符。

## 规格形状

```ts
function codegraphSpec(name: string): CardSpec {
  return {
    detail: (input) => toolLine(name, input.args, input.theme),
    body: (input) => codegraphBox(name, input),
  };
}
```

- `S = {}`：不需要自己的记录状态。spinner 与耗时由框架的 `CardState` 提供（`c9d4f3c` 之后每个运行中的行只有一次 spinner tick），要的 `output` 在记录上。
- **body 自己处理展开**（bash 先例）：折叠时给前 3 条非空行，展开时给全文。`N lines` 按非空行数（保持今天的语义：`lines.filter(l => l.trim()).length`）。
- 盒子几何用 `card/text.ts` 的 `fitLine` / `padLine`，不自己实现 `visibleWidth` / `fitLine`。
- 展开提示仍用 `keyText("app.tools.expand") || "Ctrl+O"`。

## 要删的东西（约 260 行）

| 名字 | 位置 | 备注 |
| --- | --- | --- |
| `toolTitle` | tools.ts:111 | |
| `toolLine` | :117 | **保留**（成为 `detail`） |
| `resultText` | :~145 | 框架持有 `output` |
| `visibleWidth` | :151 | `card/text.ts` 有 |
| `fitLine` | :155 | `card/text.ts` 的带记忆 |
| `boxedResult` | :177 | 盒子改由 body 画 |
| `CodeGraphCallCard` | :210 | 运行态由下边框表达 |
| `CodeGraphResultCard` | :242 | |
| `compactCodeGraphTool` | :336 | 改成 `toolCard(pi, …, codegraphSpec(name))` |
| `stringArg` / `numberArg` / `shorten` | :81/:90/:~100 | 只被 `toolLine` 用 |
| `ANSI_SEQUENCE` / `ToolRenderResult` | :147/:~110 | 只被上面几个用 |

`ToolTheme` / `ToolContext` 类型：`ToolContext` 只被 `CodeGraphCallCard` 用，`ToolTheme` 被 `toolLine` 与盒子用 —— `toolLine` 现在收 `CardInput`，所以两个类型都可以删。

## 前置件（已核对）

| 项 | 现状 | 处置 |
| --- | --- | --- |
| `codegraph/tsconfig.json` | **无 `paths`**，`include` 只有 `./index.ts`、`./tools.ts` | `extends: "../tsconfig.json"` + 覆盖 `include` |
| 为什么挡住 | 引入 `../card/tool-card.js` 会连带解析 `@earendil-works/pi-tui`；codegraph 的解析链（`codegraph/node_modules` → `extensions/node_modules`）里没有这个包 ⇒ TS2307。`tool-card-module/spec.md` 记过同一条 | 根 tsconfig 的 `paths` 能解析它 |
| `codegraph/test/harness.mjs` | 硬编码 `PI_ROOT`（`…/v22.19.0/installation/…`）+ `createJiti(import.meta.url, { interopDefault: true })`，**无 alias** | 改用 `../test/jiti-setup.mjs` 的 `createTestJiti`（它建 `@earendil-works/*` 与 `typebox` 的 alias，并用 `npm root -g` 定位 pi） |
| `codegraph/package.json` 的 `pi-coding-agent@0.85.1` | 与根 `paths` 指向的已安装版本可能不同 | 保留；`paths` 压过 `node_modules`，类型检查不再用它 |
| `extensions/tsgo` 包装脚本 | `exec tsgo` 依赖 PATH，而当前 node（v24.15.0）的 bin 里没有 tsgo（`v24.4.1`、`v22.19.0`、`v16.17.0` 有） | 本次不改；验收用 `PATH=/Users/hoon/.local/share/fnm/node-versions/v24.4.1/installation/bin:$PATH ./tsgo` |

**`extends` 的前提**：根 `extensions/tsconfig.json` 由 `./tsgo` 包装脚本生成，且被 gitignore（`codegraph/tsconfig.json` 是唯一的例外）。在 extensions 目录跑一次 `./tsgo` 就会生成它。另外，根 tsconfig 的 `include` 是 `./**/*.ts`，本来也覆盖 codegraph 的源码 —— 独立 tsconfig 只是单独检查 codegraph 的便利入口。

## 基线（已复核）

- `npm test`（extensions）全绿，含 `tool-card: ok`。
- 根 `./tsgo` exit 0；`tsgo -p codegraph/tsconfig.json` exit 0。
- `codegraph/test/harness.mjs` 今天只覆盖图数据（索引、impact、未索引分支、50KB 上限），卡片渲染零断言。

## 非目标

- `/codegraph:init` 的命令输出、`capped` / `truncateOutput` 的 50KB 上限、图数据逻辑
- `alreadyCarded` / `isOwnTool` 本身（迁移后仍正确：definition 自带 renderer ⇒ 跳过 hub，不会二次包装）
- `extensions/tsgo` 包装脚本的 PATH 问题
- 评审里的其它候选（03 五个缓存、04 DiffState、05 compaction 补丁）

## Tickets

| # | 标题 | 依赖 | 状态 |
| --- | --- | --- | --- |
| 01 | 前置件：codegraph 的 tsconfig 与测试 harness | — | done |
| 02 | 删掉卡片语言，写 spec 与盒子 body，加四条断言 | 01 | done |
