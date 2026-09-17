# statusline-footer — 让页脚视图离开 session 回调

**Status:** done

2026-09-17 架构评审（candidate 01）的结论。评审报告：`$TMPDIR/architecture-review-20260917-000734.html`（临时目录，可能已被清掉；本文件不复制它的正文）。评审的 candidate 02–05（todo HUD / 宿主原型补丁协议 / codegraph 客户端 / 跨 reload 全局槽）本票不处理，仍在报告里。

`agent/extensions/statusline.ts`（258 行）只有一个 `export default` 闭包：`session_start` 里 `ctx.ui.setFooter(...)` 注册的回调同时装着速率状态机、动画时钟、git 名字、plannotator 阶段扫描、左右布局与字形。模块的接口就是「跑一个真会话」——`test/*.mjs` 里没有任何 statusline 断言，这块目前零覆盖。

代价不是性能，是接口：没有可以断言的页脚接口，也没有可以把「速率」从「渲染」里分出来的接缝。附带一个形状问题：帧率由一个装饰性动画决定（50ms 轮询，猫每秒只变 6 次，另外 2~3 次唤醒是空转）。

## 宿主渲染模型（本票的事实前提）

读 `@earendil-works/pi-tui/dist/{tui.js,tui-main-screen.js}`（`settings.json` 是 `tuiMode: regular`）得到的三条：

1. `requestRender()` 只请求一帧：`renderRequested` 合并 + `MIN_RENDER_INTERVAL_MS = 16` 节流（`tui.js:169`、`:601`）。键盘输入走 `requestImmediateRender()` 抢占。
2. `doRender()`（`tui-main-screen.js:212`）先 `this.render(width)` **重算整棵组件树**，再与 `previousLines` 逐行比较得 `firstChanged/lastChanged`，**只写出变化区间**；`firstChanged === -1` 时直接返回，零写出。width/height 变化或 clearOnShrink 才全量重画。
3. 组件模型是拉取式：`render(width): string[]` + `invalidate()`（缓存失效提示）。**没有组件级局部重渲染**，`context.invalidate` 触发的是宿主重跑该 row 的 render slot，不是局部重绘。

结论：**「猫单独重渲染、不影响其他部分」在 pi 里做不到。** 组件唯一的杠杆是「不请求不需要的帧」+「重算时让自己廉价」（memo，卡片模块的 Frame 已经这么做）。仓库自测：143 行转录 memo 前 68ms/帧、memo 后 0.6ms/帧。

## 决策

2026-09-17 grilling 三轮的结论（Q1–Q11 全部按推荐落地；Q8 见 D9）。

| # | 决定 |
| --- | --- |
| D1 | 目录化：`agent/extensions/statusline/{index.ts,speed.ts,frame.ts,view.ts}`。删掉顶层 `agent/extensions/statusline.ts` —— pi 按目录发现扩展，两个入口会把 footer 注册两次。 |
| D2 | 计量模块 `speed.ts`：`createSpeedTracker(now)`（`begin/update/end/snapshot`）+ 纯函数 `usageTotals(entries)`。**计量口径一字不改**，且速率完全由**消息事件**驱动（帧不参与）。 |
| D3 | 帧模块 `frame.ts`：`frameInterval(speed)` 与 `advanceFrame(state, now, speed)`，两个纯函数，不含定时器。 |
| D4 | 视图模块 `view.ts`：`footerRows(view, width, theme) → string[]`（两行，含现在的那个前导空行）。`view` 是一份普通记录，`frames` 放在 view 里，字形因此是一个参数而不是常量。 |
| D5 | 帧率契约：不再 50ms 轮询。`setTimeout` 链，只有 `advanceFrame` 报 `changed` 才 `tui.requestRender()`；只在 `message_start` / `message_end`（状态跃迁）`clearTimeout` + 按新速度重排，流式过程中不重排。 |
| D6 | token 合计由事件维护：`session_start` 用 `usageTotals(getEntries())` 初始化，`message_end` 增量。`render` 不再遍历 session entries。 |
| D7 | 时间源注入：状态机与帧推进都收 `now: () => number`（适配器传 `Date.now`，测试传假时钟）。 |
| D8 | 打包：`statusline/package.json` 的 `pi.extensions: ["./index.js"]`；`tsdown.config.mts` 的 `extensions[]` 加 `"statusline"`；`npm run build`。 |
| D9 | 字形**本票不动**（保留 runcat 私有区字形 `U+E900..U+E904`）。这是未决项，见下。 |

### D9 的未决内容（写给未来的评审）

`U+E900..U+E904` 只在本机 `~/Library/Fonts/runcat.ttf`（family `icomoon`）里是猫；本机还装着 255 个 Nerd Font，它们同样占这几个码位（`fc-match -s ':charset=e900'` 第一名是 `MonaspiceRn Nerd Font`）。所以任何终端默认都会画成别的字形，除非逐终端 pin（kitty：`symbol_map U+E900-U+E904 icomoon`；WezTerm / iTerm2 各有等价手段）。2026-09-17 的会话说「不想跟终端强绑定」，但没定案：(a) 保留字形 + 接受逐终端 pin；(b) 换成零字体依赖的帧（复用 `card/spinner.ts` 的 `◐◓◑◒`，猫没了）；(c) 两套都在，一个常量切换。**改字形 = 换 `view.frames` 一个参数**，本票不锁死。理由未定案，故**不写 ADR**。

### 计量口径（D2 的细则，改代码时不能动）

| 时刻 | 记什么 |
| --- | --- |
| `message_start`（assistant） | `streaming = true`、`startTs = now()`、`tokens = 0`、`lastUsageOut = 0`、`liveTokS = null` |
| `message_update`（`text_delta` / `thinking_delta`） | provider 报的 `usage.output` 比上一次大就用增量，否则 `estimateTokens(delta)` = `delta.match(/\w+|[^\s\w]/g)?.length ?? 0`；`dur = now() - startTs`，`dur >= 300` 才更新 `liveTokS = tokens / (dur / 1000)`（**live 不做 sanitize**） |
| `message_end` | `lastTokS = sanitizeTokS((message.usage.output ?? tokens) / (dur / 1000), dur)`；`streaming = false`、`liveTokS = null` |

`sanitizeTokS(v, dur)`：`Number.isFinite(v) && v > 0 && v < 2000 && dur >= 300` 才取值，否则 `null`。

### 帧的曲线（D3 的细则，`plans/runcat-statusline.md` 已确认）

`frameInterval(v) = v 为 null / 非有限 / <= 0 ? 167 : clamp(round(6000 / v), 50, 250)`。例：`null → 167`、`60 → 100`、`200 → 50`、`10 → 250`。

### 页脚内容（D4 的细则，改造后必须逐字一致）

- 进度：`win = getContextUsage()?.contextWindow ?? ctx.model?.contextWindow ?? 200_000`；`tok = usage?.tokens ?? null`；`pct = usage?.percent ?? null`；`ok = tok !== null && win > 0`；`r = ok ? min(tok / win, 1) : 0`；`pl = pct !== null ? round(pct) + "%" : "?%"`。
- 条形：`bar(r, 6)` = `"█".repeat(round(min(r,1) * 6)) + "░".repeat(6 - f)`。
- 条形色阶：`!ok → dim`；`r < 0.5 → success`；`r < 0.8 → warning`；否则 `error`。
- 合计：`输入{X} 输出{Y}`，`ft()` 缩写（`<1000` 原样、`<1e6` 保留一位 k、否则 M）；两者都是 0 时 `dim("输入? 输出?")`。
- 猫与速率：`accent(frames[frame] + " ")` 在前，速率在后 —— streaming 且 `liveTokS !== null` 用 `accent`，否则 `lastTokS !== null` 用 `muted`，都没有就不画这一段。没有 git 名与分支时 `left = cat + spd`。
- 右侧：plannotator 阶段 chip（`planning → warning "⏸ 计划模式"`、`executing → accent "▶ 执行模式"`、`idle → dim "∘ 空闲模式"`、无 → 不画）+ 空格 + token block；阶段由 `view` 传入。
- 行：`["", truncateToWidth(left + " ".repeat(max(1, w - lw - rw)) + right, w)]`。

## 改造后的形状

```ts
// statusline/speed.ts —— 计量：消息事件驱动，帧不参与
export type SpeedSnapshot = { streaming: boolean; live: number | null; last: number | null };
export function createSpeedTracker(now: () => number): {
  begin(): void;
  update(delta: string, usageOut: number | undefined): void;
  end(finalOut: number | undefined): void;
  snapshot(): SpeedSnapshot;
};
export function usageTotals(entries: readonly unknown[]): { input: number; output: number };

// statusline/frame.ts —— 帧：纯推进，不含定时器
export function frameInterval(speed: number | null): number;
export function advanceFrame(
  state: { frame: number; last: number },
  now: number,
  speed: number | null,
): { frame: number; last: number; changed: boolean };

// statusline/view.ts —— 视图：一份记录进，两行出
export type FooterView = {
  gitRoot: string;
  branch: string;
  usage: { tokens: number; window: number; percent: number | null } | null;
  totals: { input: number; output: number };
  speed: SpeedSnapshot;
  phase: "planning" | "executing" | "idle" | null;
  frame: number;
  frames: readonly string[];
};
export function footerRows(view: FooterView, width: number, theme: RenderTheme): string[];

// statusline/index.ts —— 接线：订阅事件 → 计量；setTimeout 链 → 帧；setFooter → 视图
export default function (pi: ExtensionAPI): void;
```

## 回归锁（改的时候不能碰）

- 页脚内容与配色逐字一致（上表），包括空行、`?%` 回退、`输入? 输出?` 回退、无速度时不画速率段。
- 速率口径一字不改（含 live 不 sanitize 这条不对称）。
- 帧曲线：`clamp(round(6000/v), 50, 250)`、空闲 167ms、猫常驻跑动。
- 摆放：猫在 `t/s` 前、branch 在猫前、token 块在阶段 chip 后。
- `/reload` 不叠脚（`dispose` 清掉待定定时器与 branch 订阅）。
- 主题切换（`/theme`）后配色跟着变：`footerRows` 每帧从传入的 theme 读色，不缓存颜色字符串。

## 非目标

- 字形 / 终端 pin（D9，未决）。
- `ctx.getContextUsage()` 仍是每帧读一次（先在适配器里读；实测是线性扫描再搬进 tracker）。
- plannotator 阶段仍是「构建 view 时反向扫描 session entries」——反向扫描通常几步就命中，且没有对应事件；不改成事件维护。
- `plans/runcat-statusline.md` 的速度曲线、摆放、空闲行为本身（已确认的决策）。
- 卡片模块、todo HUD、其它扩展。
- 不引入卡片语言的新词到 `card/`（页脚不是 Tool card）。

## 基线（2026-09-17，工作树有未提交的 bundle/package.json 改动）

- `cd .pi/agent/extensions && npm test` 全绿（8 个 `test/*.test.mjs`；codegraph 另有 `npm run test:extensions`）。
- `PATH=/Users/hoon/.local/share/fnm/node-versions/v24.4.1/installation/bin:$PATH ./tsgo` exit 0（`./tsgo` 会重写 `tsconfig.json`，且需要 `tsgo` 在 PATH 上：v24.15.0 / v26.3.0 下是 `command not found`）。
- `statusline.ts` 目前不在 `tsdown.config.mts` 的 `extensions[]` 里（它是顶层单文件扩展，不打包）。

## Tickets

| # | 标题 | 依赖 | 状态 |
| --- | --- | --- | --- |
| 01 | 纯模块与测试（speed / frame / view） | — | done |
| 02 | 接线与打包（index.ts、删旧文件、bundle） | 01 | done |
| 03 | 收词与交接（CONTEXT.md、plans 指针、D9 证据） | 02 | done |

## Comments

- 2026-09-17 开票。来源：架构评审 candidate 01，经 grilling 三轮（Q1–Q11）落定；Q8（字形）按「先不管」记为未决 D9，因此**不写 ADR**（理由未定案，未来评审若再提字形，看这里）。
- 两个决定没有 grilling、按现状保留，改起来只动票面不动方向：`getContextUsage()` 每帧读（非目标）、plannotator 阶段反向扫描（非目标）。
- 实现时与代码同提交（`docs/agents/issue-tracker.md` 的惯例）。
- 2026-09-17 三票落地后补的 D9 证据（本机实测）：
  - `fc-match -s ':charset=e900'` 第一名 = `MonaspiceRn Nerd Font`（第二 `.LastResort`）：终端在这几个码位上画的是 Nerd Font 的字形，不是猫。
  - 本机 Nerd Font 数量：`fc-list | grep -ci 'nerd font'` = **219** 个 face（`fc-list :family | grep -ci 'nerd font'` = 222 个 family）。开票时写的 255 今天复现不出来，按实测数记。
  - `fc-scan ~/Library/Fonts/runcat.ttf` → family `icomoon`（3532 字节，2025-08-14）；`~/.config/kitty/kitty.conf` 里**没有** `symbol_map`，即逐终端 pin 目前并未生效（kitty 的写法是 `symbol_map U+E900-U+E904 icomoon`；WezTerm / iTerm2 各有等价手段）。
- 2026-09-17 为什么不写 ADR：D9 未定案 —— (a) 保留字形 + 逐终端 pin / (b) 换成零字体依赖的 `card/spinner.ts` 帧 / (c) 两套都留、一个常量切换，三条路都没定，且换字形只改 `view.frames` 一个参数。`docs/agents/domain.md` 的 ADR 只收已定案且有取舍理由的决定，所以等真换字形时再定案、再写 ADR。
