# card-input — 把行交给每一个 card slot

**Status:** ready-for-agent

2026-09-16 架构评审（improve-codebase-architecture，candidate 01）的结论，经一轮 grilling（Q1–Q14 全部定稿）。评审报告写在临时目录，会消失，所以决定与事实全部记在本文件。

今天只有 `body` 拿得到「行」（调用记录）的输入；`detail` / `row` / `summary` 只拿 `(args, theme)`，于是两个 adapter 用正则从自己的文本里把数字抠回来，bash 用一个进程级全局表把异步高亮从 body 走私到 detail。本计划把同一个 **Card input** 交给四个槽位。

## 决策

| # | 决定 |
| --- | --- |
| Q1 | 四个槽位收同一个 `CardInput`，含 `output`（必须保留：bash 退出码、grep 命中数、read/find/ls 行数只能从文本读）。槽位不拿宿主的 `context`。 |
| Q2 | 一次性迁移：接口、九份适配器、测试同一次落地，不留新旧共存。 |
| Q3 | 只删走私，不加新显示。外观、行为、既有断言语义一字不改。 |
| Q4 | `CardSpec<S>` 泛型；行状态类型是 `CardState & S`（相交，不嵌套）。 |
| Q5 | 异步重画走 `input.redraw()`，Frame 按 owner 规则转交；`context.invalidate` 仍只由 Frame 调。 |
| Q6 | `detail` / `row` / `summary` 改为 `Frame.render()` 内派生，走记忆表；删掉 `entry.detail`、`entry.row` 两个字段与「每次刷新头部」的写回。 |
| Q7 | `CardBodyInput = CardInput & { width }`，`width` 仍是结果列宽（bash 盒子、diff 框按今天的含义取值）。 |
| Q8 | `defaultDetail` / `defaultSummary` / `firstShortArgument` / `runDisplay` 只改参数形状，仍只读文本与参数。 |
| Q9 | 测试只做机械修改 + 3 条新断言，加在既有 `test/tool-card.test.mjs`。 |
| Q10 | `Entry` 存窄原料：`args`、`cwd`、`state`、`result`、`output`、`isPartial`、`isError`、`invalidate`（不再存算好的 `detail` / `row`）。 |
| Q11 | 非 owner 记录调用 `redraw()` 时转交给拥有者（复用 `invalidateOwner`），不忽略。 |
| Q12 | 派生版本号（epoch）感知异步状态；记忆键含 epoch。 |
| Q13 | 记录放 `.scratch/card-input/`（spec + 三张票），与实现同一提交。 |
| Q14 | 验收 = `./tsgo` + `npm test` + `npm run build` + 一次真实会话手测。 |

## interface

```ts
export type CardInput<S extends object = object> = {
  args: AnyArgs;
  /** 缺席表示还在跑：槽位要画运行中的卡片。 */
  result: AnyResult | undefined;
  /** 工具的文本输出（已 trim）：只有文本可读的派生仍从这里读。 */
  output: string;
  options: RenderOptions;      // { expanded, isPartial }
  theme: AnyTheme;
  /** 这一行的记录状态；Frame 写的 spinner/时钟/repaint 与卡片自己的字段同处一个对象。 */
  state: CardState & S;
  cwd: string;
  /** 唯一的重画请求入口；Frame 按 owner 规则转交（Q5）。 */
  redraw(): void;
};

/** body 多一个宽度；含义仍是结果列宽（卡片宽度 − RESULT_LINE_INDENT）。 */
export type CardBodyInput<S extends object = object> = CardInput<S> & {
  width: number;
};

export type CardSpec<S extends object = object> = {
  detail?: (input: CardInput<S>) => string;
  row?: (input: CardInput<S>) => string;
  summary?: (input: CardInput<S>) => string;
  body?: (input: CardBodyInput<S>) => string[] | undefined;
  aggregate?: boolean;
};

export function toolCard<S extends object = object>(
  pi: ExtensionAPI,
  tool: ToolDefinition<any, any, any>,
  spec: CardSpec<S> = {},
): ToolDefinition<any, any, any>;
```

适配器按自己的状态声明泛型参数：`bashSpec: CardSpec<{ highlight?: string }>`、`mutationSpec(...): CardSpec<DiffState>`（`DiffState` 保持模块私有）。

### epoch（Q12 的落地形状）

`Entry` 加一个数字字段。它在两种时刻加一：

1. **记录的输入真的变了**：`registerEntry` / `updateResult` 里发现 `args` 身份、`result` 身份、`output` 文本、`isPartial`、`isError` 有变化时。每帧都重跑但没有变化时不加，否则记忆表每帧全 miss。
2. **槽位请求重画**：`input.redraw()`。

于是记忆键收敛成 **`(epoch, theme, width)`** —— 一个键取代原来 `(output, theme, width)` 的键（不变式 5 的修订），不需要把 `args` / `result` / `output` 再单独列进键里。`theme` 留在键里是为了不与既有行为分叉（宿主的 theme 对象身份稳定，见「已知边界」）。

## 不变式的修订

1. Frame 独占 `└─` 列。**不变。**
2. `body` ⇒ aggregation 默认关闭；`body` 与 `aggregate: true` 同时出现在 attach 时抛错。**不变。**
3. ~~`context.invalidate` 只由 Frame 调；非 owner 结算时通知 owner 一次，owner 不再传播。~~ → **`context.invalidate` 只由 Frame 调；槽位只能通过 `Card input.redraw()` 请求重画，Frame 用同一条 owner 规则转交：非 owner 通知拥有者一次，拥有者不传播。**
4. 同一个 component 服务两个 slot；`lastComponent` 按 slot、`state` 按行。**不变。**
5. ~~memo 的键是 (output, theme, width)，不含 component 身份。~~ → **memo 的键是 (epoch, theme, width)，不含 component 身份。**
6. teardown 只有一套 registry。**不变。**
7. 槽位不接触宿主 context：`args`/`result`/`output`/`options`/`theme`/`state`/`cwd`/`redraw()` 是它能看到的一切。

## 事实与约束（已核对）

### 哪些文本解析能删、哪些不能删

| 派生 | 有结构化来源吗 | 结论 | 依据 |
| --- | --- | --- | --- |
| `braveSearchSpec.summary` 的正则 `RESULT_HEADER` | 有：同模块返回 `details: { results, cached }` | **删** | `brave-search/index.ts:110-137`、`:230-249` |
| `webFetchSpec.summary` 的正则 `FETCH_HEADER` | 有：`details: { title, totalChars, links }` | **删** | `ollama-web-fetch/index.ts:51-81`、`:296-305` |
| `bashSpec.detail` 读 `commandHighlights` 全局表 | 无替代品，问题在槽位拿不到行 | **删**（改成记录状态） | `ui/compact-tool-cards.ts:160-215` |
| `bashExitText` 解析 `exit code N` | 无。`BashToolDetails` 只有 `truncation` / `fullOutputPath`，宿主把退出码写进抛错文本 | **保留** | 宿主 `dist/core/tools/bash.d.ts:15`、`bash.js:264` |
| `grepSummary` 数文件、`countSummary` 数行（read/find/ls） | 无。`GrepToolDetails` 只有 `truncation` / `matchLimitReached` | **保留** | 宿主 `dist/core/tools/grep.d.ts` |

**这就是为什么 `CardInput` 必须保留 `output`。** 评审报告初稿说「删掉 3 个正则」，实际是 2 个正则 + 1 个全局表。

### 其它已核对的事实

- `registerEntry` 今天在每次宿主重跑调用槽位时执行（`card/tool-card.ts:375-437`），`updateResult` 在结果槽位执行（`:439-...` 之前），两者都能加 epoch。
- `Entry` 今天存了 `detail`、`row`、`output`、`errorText`、`isPartial`、`isError`、`group`、`invalidate`、`state`、`result` 以及三个 memo 字段。Q10 用 `args`+`cwd` 换掉 `detail`+`row`，净减字段。
- 聚合组的拥有者要画子记录的组内行，而 `Entry` 今天不保存子记录的参数 —— 这是 Q6(ii) 必须同时改 `Entry` 的原因。
- `Entry` 保留 `invalidate`：`redraw()` 的转交要用拥有者那条记录的 `invalidate`（今天的 `invalidateOwner`，`card/tool-card.ts:330-340`）。
- 派生用 Frame 持有的 `theme`（最后一次 `renderCall` 交来的）。宿主 theme 对象的 accessor 读活值、身份不变，`test/pi-diff.test.mjs:150-156` 记录了这件事，`pi-diff` 的 body 因此每帧把 theme 重新交给盒子。
- `body` 的 `width` 今天就是结果列宽（`Frame.resultArea` 里 `width - RESULT_LINE_INDENT`），bash 盒子与 diff 框都按这个含义写（Q7(i) 保持它）。
- 消费者共九份规格：`readSpec`、`grepSpec`、`findSpec`、`lsSpec`、`bashSpec`（`ui/compact-tool-cards.ts:317-427`）、`mutationSpec`（`ui/pi-diff.ts:943-985`）、`braveSearchSpec`、`webFetchSpec`、`todo` 的匿名 spec（`todo/index.ts:497`）。此外 `ui/foreign-tool-cards.ts` 的 `toolCard(pi, definition)` 走全默认值，不写规格。

## 已知边界（本次不动）

- 宿主的 theme 对象身份不变，所以 `(epoch, theme, width)` 里的 `theme` 实际不会让记忆失效：主题切换后，已记忆的 `summary` 颜色会留到下一次 epoch 变化。这是既有行为（不变式 5 原本的键同样如此），本次不修。
- bash 的高亮缓存今天按命令文字做键，跨记录共享。改到记录状态后它是每记录一份 —— 这是本次要的结果，但它同时把「同一命令在不同 cwd 下重复执行」的高亮缓存次数从 1 变成 N。可接受（高亮本身仍有 `highlightedTokens` 缓存）。

## 非目标

- codegraph 的卡片语言（评审 candidate 02）
- 五个缓存合成一个渲染键（评审 candidate 03）—— 本计划只改 `detail` / `row` / `summary` 的键
- `DiffState` 交给 viewer 自己持有（评审 candidate 04）
- compaction 补丁拆成独立模块（评审 candidate 05）
- `highlightBashLines` 的独立 seam（`.scratch/tool-card-module/issues/05` 里留下的 candidate 02）
- 让派生默认值读 `details`（Q8(ii)）
- 让组内行用上结果做新显示（Q3(b)）

## Tickets

| # | 标题 | 依赖 | 状态 |
| --- | --- | --- | --- |
| 01 | CardInput 接口与 Frame 的派生路径 | — | ready-for-agent |
| 02 | 九份适配器迁移 | 01 | ready-for-agent |
| 03 | 三条断言与 CONTEXT.md 词条 | 01 | ready-for-agent |

01 与 02 属同一提交（Q2），03 的断言描述的是接口本身的行为，所以它只依赖 01。
