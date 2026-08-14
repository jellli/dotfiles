# RunCat 小猫集成到状态栏

## Context

用户看到 [pi-speeed](https://github.com/somus/pi-speeed) 的 RunCat 小猫（跑动猫咪动画，速度跟随 token 输出速度），想把这只小猫集成进自己的 pi footer 状态栏。

当前状态栏 = 自定义 pi footer：[statusline.ts](.pi/agent/extensions/statusline.ts)，footer 展示 `pct% [bar] ↑in ↓out ⚡t/s  git/branch`。`⚡t/s` 已经由 [statusline.ts](.pi/agent/extensions/statusline.ts) 内 `speed` 状态实时计算（streaming 时 live，结束后 last completed）。

pi-speeed 里的小猫 = 两个零件：
1. **RunCat 帧**：5 个私有区字形 `U+E900..U+E904`（来自 `assets/runcat.ttf`，字体已装在 `~/Library/Fonts/runcat.ttf`）
2. **动画**：帧间隔 `clamp(round(6000/speed), 50, 250)`ms，速度越快猫跑得越快；无速度时默认 167ms

> [!NOTE] pi-speeed 用 `ctx.ui.setWorkingIndicator({frames, intervalMs})` 把猫显示成 streaming 时的 spinner。本方案不用它——用户要的是 footer 状态栏，所以直接在 footer `render()` 里渲染猫帧，用 `setInterval` 驱动。

## 决策（已确认）

| 点 | 选择 |
|----|------|
| 目标状态栏 | pi footer（[statusline.ts](.pi/agent/extensions/statusline.ts)） |
| 猫与速度摆放 | 猫在前，`⚡t/s` 并排（`🐱 45t/s`） |
| 字形 | runcat.ttf 真猫（U+E900..U+E904），字体已安装 |
| 空闲行为 | 猫常驻跑动，空闲用默认 167ms/帧，streaming 时随速度提速 |

## Approach

只改 [statusline.ts](.pi/agent/extensions/statusline.ts)，复用已有的 `speed` 状态与 `tui.requestRender()`。

### 1. 新增常量（文件顶部，import 之后）

```ts
const RUNCAT_FRAMES = ["\ue900 ", "\ue901 ", "\ue902 ", "\ue903 ", "\ue904 "];
const RUNCAT_SCALE = 6000;
const RUNCAT_MIN_MS = 50;
const RUNCAT_MAX_MS = 250;
const RUNCAT_DEFAULT_MS = 167;
```

### 2. 猫动画状态 + 帮助函数（`speed` 状态旁边）

```ts
let catFrame = 0;
let catLastTick = 0;

const currentSpeed = () =>
  speed.streaming ? speed.liveTokS : speed.lastTokS;

const runcatInterval = (v: number | null): number =>
  v === null || !Number.isFinite(v) || v <= 0
    ? RUNCAT_DEFAULT_MS
    : Math.max(RUNCAT_MIN_MS, Math.min(RUNCAT_MAX_MS, Math.round(RUNCAT_SCALE / v)));
```

### 3. 定时器驱动（`setFooter` 工厂内，复用 `tui`）

固定 50ms tick（= 最小帧间隔），tick 内按当前速度算出的间隔推进帧，再 `tui.requestRender()`：

```ts
const catTimer = setInterval(() => {
  const interval = runcatInterval(currentSpeed());
  const now = Date.now();
  if (now - catLastTick >= interval) {
    catFrame = (catFrame + 1) % RUNCAT_FRAMES.length;
    catLastTick = now;
  }
  tui.requestRender();
}, RUNCAT_MIN_MS);

return {
  dispose() { clearInterval(catTimer); unsub(); },
  invalidate() {},
  render(w: number): string[] { ... },
};
```

> [!TIP] 定时器在 footer 工厂创建、`dispose()` 清理，天然跟随 session 生命周期；`/reload` / 新 session 会重建 footer → 新定时器，无泄漏。

### 4. footer `render()` 里渲染猫 + 速度并排

把现有 `spd` 计算前面插入猫帧，`left` 里猫放到 `↑in ↓out` 之后、`⚡t/s` 之前：

```ts
const cat = theme.fg("accent", RUNCAT_FRAMES[catFrame]);

const spd = speed.streaming && speed.liveTokS !== null
  ? theme.fg("accent", `⚡${speed.liveTokS.toFixed(0)}t/s`)
  : speed.lastTokS !== null
  ? theme.fg("muted", `⚡${speed.lastTokS.toFixed(0)}t/s`)
  : theme.fg("dim", "⚡--");

const left = `${theme.fg("muted", pl)} ${bc(bar(r, 6))} ${ts} ${cat}${spd}`;
```

> [!NOTE] `RUNCAT_FRAMES` 每帧自带尾随空格（同 pi-speeed），所以 `cat` 与 `spd` 直接相邻即可；`visibleWidth`/`truncateToWidth` 对私有区字形按宽 1 计（每帧 = 字形+空格 = 2 列），现有截断逻辑无需改动。

## Files to modify

| 文件 | 改动 |
|------|------|
| `.pi/agent/extensions/statusline.ts` | 新增 RunCat 常量 + 猫动画状态 + 定时器 + footer 渲染 |

## Reuse

- `speed` 状态对象（[statusline.ts](.pi/agent/extensions/statusline.ts) 已有 `liveTokS`/`lastTokS`/`streaming`）— 直接复用，不重写 token 速度追踪
- `tui.requestRender()` / `theme.fg("accent", ...)` / `truncateToWidth` / `visibleWidth` — 现有 footer 已在用
- RunCat 字形 + 帧间隔公式 — 取自 pi-speeed `src/runcat.ts`、`src/config.ts` 默认值（`scale=6000, min=50, max=250, default=167`）
- `~/Library/Fonts/runcat.ttf` 已安装（3.4K，icomoon 私有区字形），无需再装字体

## Steps

- [x] 1. 在 [statusline.ts](.pi/agent/extensions/statusline.ts) 顶部新增 `RUNCAT_FRAMES` + 4 个常量
- [x] 2. 在 `speed` 状态旁新增 `catFrame`/`catLastTick` + `currentSpeed()` + `runcatInterval()`
- [x] 3. 在 `setFooter` 工厂内创建 `catTimer`（50ms tick，按 `runcatInterval(currentSpeed())` 推进帧 + `requestRender`），`dispose()` 里 `clearInterval`
- [x] 4. 在 `render()` 里插入 `cat`，`left` 调整为 `... ${ts} ${cat}${spd}`
- [x] 5. tsgo 校验（通过）+ 逻辑冒烟测试（通过）

## Verification

1. **类型检查**：`cd .pi/agent/extensions && ./tsgo --noEmit`（无编译错误）
2. **动画**：启动 `pi`，footer 小猫逐帧跑动（5 帧循环）
3. **提速**：触发 assistant 流式输出，猫跑动明显变快；结束后回到默认/上次速度节奏
4. **并排**：footer 显示 `… ↑in ↓out 🐱 ⚡45t/s …`，猫帧与数字速度同排
5. **字形**：猫正常显示非方框 `□`；若方框 → 终端字体未 fallback 到 runcat.ttf，重启终端
6. **无泄漏**：`/reload` 后 footer 仍正常、猫继续跑，无重复动画（dispose 清理生效）

## 风险与取舍

| 风险 | 缓解 |
|------|------|
| 私有区字形在终端显示为方框 | 字体已装；重启终端或选 RunCat 字体兜底；必要时可换 ASCII 猫帧 |
| 常驻 50ms `requestRender` 的 CPU 开销 | 仅重渲染 footer 一行，开销极小；pi-speeed 自身也 250ms 刷新，可接受 |
| 定时器泄漏 | 定时器在 footer 工厂创建、`dispose()` 清理，生命周期自洽 |
