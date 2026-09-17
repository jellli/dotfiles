# 01 — 纯模块与测试（speed / frame / view）

**Status:** done
**依赖:** —

建 `agent/extensions/statusline/` 下的三个纯模块与一份测试。**不建 `index.ts`、不动顶层 `statusline.ts`**：pi 只按 `index.ts` / `package.json` 发现扩展，所以本票零行为变化、可独立验收。

## 任务

- [x] `statusline/speed.ts`：
  - `createSpeedTracker(now: () => number)` → `{ begin, update(delta, usageOut), end(finalOut), snapshot() }`。口径逐条照 `spec.md` 的「计量口径（D2 的细则）」表；`snapshot()` 返回 `{ streaming, live, last }`（`live` 只在 streaming 时有值，`end` 后置空）。
  - `sanitizeTokS` 作为模块内私有函数（阈值 `0 < v < 2000 && dur >= 300`）。
  - `usageTotals(entries)`：纯函数，累加 `type === "message" && message.role === "assistant"` 的 `message.usage.input/output`，缺失按 0，空数组返回 `{ input: 0, output: 0 }`。
- [x] `statusline/frame.ts`：`frameInterval(speed)`（`167` / `clamp(round(6000 / speed), 50, 250)`）与 `advanceFrame({ frame, last }, now, speed, frames)` → `{ frame, last, changed }`（未到间隔则原样返回 `changed: false`；到点则帧下标前进并按 `frames` 取模回绕）。帧数选了**第四个参数**：回绕才可断言，否则测试只能复算 `% 5`。
- [x] `statusline/view.ts`：`footerRows(view, width, theme)`，`FooterView` 字段表照 `spec.md` 的「改造后的形状」；把现有 `render()` 里的 `bar` / `ft` / 色阶 / `输入X 输出Y` / plannotator chip / 左右拼接整段搬进来。`frames` 从 `view` 读，模块内不写死字形。
- [x] `test/statusline.test.mjs`：jiti + 裸 assert，照 `test/oh-my-pi-todo.test.mjs` 的写法（`createTestJiti(here + "/..")`，`jiti.import("../statusline/view.ts")`）。
- [x] 不建 `statusline/index.ts`；`statusline.ts` 一字不改。

## 验收

- [x] `node test/statusline.test.mjs` 全绿；`npm test` 全绿（`for f in test/*.test.mjs` 会自动带上新文件）。
- [x] `PATH=/Users/hoon/.local/share/fnm/node-versions/v24.4.1/installation/bin:$PATH ./tsgo` exit 0。
- [x] 断言覆盖（去 SGR 后比较纯文本）：
  - 视图：满配一行（git/branch + 猫 + 速率 + `pl%` + 条形 + 合计）；`tok === null` 时 `?%` 与 `输入? 输出?`；无速度时不出现 `t/s` 段；无 git/branch 时行以猫开头；`planning` / `executing` / `idle` 三种 chip；宽度不足时右侧被 `truncateToWidth` 截断且总宽不超过 `width`；返回两行且第一行为空。
  - 计量：`dur < 300ms` 时 `live === null`；provider 增量优先于词数估算；无 usage 时按 `\w+|[^\s\w]` 词数计；`end` 用 `finalOut` 覆盖估算；`sanitize` 四条边界（0 / 负数 / `NaN` / `>= 2000` → `null`）；`begin` 重置上一轮。
  - 帧：`frameInterval(null|0|NaN) === 167`；`frameInterval(60) === 100`；`frameInterval(200) === 50`；`frameInterval(10) === 250`；未到点 `changed === false` 且 `frame` 不动；到点推进并回绕。
  - 合计：只累 assistant；跨多条 entries；空 entries 全 0。
- [x] 变异检查两条：`dur >= 300` 改成 `>= 0`（`live stays empty below 300ms` 失败）；帧推进的边界比较从 `<` 改成 `<=`（`the exact boundary counts as due` 失败）。两条都验过并已回滚。

## Comments

- 2026-09-17 开票。三个模块对应 `spec.md` 的 D2 / D3 / D4；接口签名以 spec 的「改造后的形状」为准，实现时若 `advanceFrame` 的帧数参数更好放在别处，只动票面。
- 2026-09-17 实现完毕。`advanceFrame` 收了第四个参数 `frames`（见任务第二条），spec 的签名那行按此读。
- 2026-09-17 一处**有意的字形空白差**：旧 `RUNCAT_FRAMES` 每个字形自带尾空格，渲染时又加一个空格（`"\ue900 " + " "` = 两个空格）；本票按 spec 的 `frames[frame] + " "` 改成字形不带空格、渲染加一个。02 的「逐字一致」验收按**一个空格**读。
