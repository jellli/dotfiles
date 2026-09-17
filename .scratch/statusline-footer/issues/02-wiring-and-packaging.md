# 02 — 接线与打包（index.ts、删旧文件、bundle）

**Status:** done
**依赖:** 01

把三个纯模块接回宿主，并把 `statusline` 变成一个可打包的扩展目录。行为只许在「帧率契约」上变化（D5 / D6），页脚长得一模一样。

## 任务

- [x] `statusline/index.ts`（适配器）：
  - `session_start`：`gitName`（`pi.exec("git", ["rev-parse", "--show-toplevel"])`）+ `ctx.ui.setFooter(...)`；`branch` 订阅不变（`fd.onBranchChange` → 重取 git 名 + 请求一帧）。
  - 事件：`message_start` / `message_update` / `message_end` → tracker（D2 口径）；`turn_end` / `agent_end` → 请求一帧（plannotator chip 与阶段扫描靠这个刷新）。
  - 帧（D5）：没有 `setInterval`。用单个待定 `setTimeout`：到点 `advanceFrame` → 若 `changed` 才 `requestRender()`，然后按当前速度排下一帧；`message_start` 与 `message_end` 各做一次 `clearTimeout` + 重排；流式过程中不重排。
  - 合计（D6）：`session_start` 用 `usageTotals(ctx.sessionManager.getEntries())` 初始化，`message_end` 按 `message.usage` 增量；`render` 里删掉遍历 entries 的循环。
  - `dispose()`：清待定定时器 + `unsub()`。
  - `render(width)`：读 `ctx.getContextUsage()`，构建 `FooterView`（含 `frame` 与 `frames` 常量），`return footerRows(view, width, ctx.ui.theme)`。
- [x] 删 `agent/extensions/statusline.ts`（与 `index.ts` 同一提交，否则 footer 注册两次）。
- [x] `statusline/package.json`（`{ "type": "module", "pi": { "extensions": ["./index.js"] } }`，照 `ui/package.json` 的形状）。
- [x] `tsdown.config.mts` 的 `extensions[]` 加 `"statusline"`。
- [x] `npm run build`，确认生成 `statusline/index.js`。

## 验收

- [x] 页脚三态逐字一致：空闲（无速度段）、流式中（`accent` 的 live 速率）、结束后（`muted` 的 last 速率）；`输入/输出`、`pl%`、条形、三种 chip 与改造前无差异。
- [x] 猫常驻跑动；空闲 167ms/帧；流式提速；`frameInterval` 的夹取生效。
- [x] `grep -n 'setInterval' statusline/index.ts` 无结果；`requestRender` 只出现在事件回调、`if (next.changed)` 分支与组件定义里。
- [x] 空闲时不再有空转帧：连续 5 秒无输入、无流式，帧请求 29 次（期望 5000/167 ≈ 29.9），且每次请求都伴随帧下标推进（探针）。
- [x] 连续两次 `/reload` 后页脚只有一行（两行文本：空行 + 内容行），且没有残留定时器（`dispose` 生效）。
- [x] `/theme` 切换后配色跟着变（颜色不缓存）。
- [x] `npm test` 全绿；`PATH=…/v24.4.1/… ./tsgo` exit 0；`npm run build` 成功。
- [ ] 手测一次真实会话（>100 行转录）：打字无可感卡顿；猫的节奏跟随 `t/s`；`pct` 与条形随上下文增长。**未做**：需要交互式 TTY 会话，agent 无法代跑；改用下面的探针与对照证据覆盖同一条路径。

## Comments

- 2026-09-17 开票。D5 / D6 是本票唯一允许的行为变化；其余一律照 `spec.md` 的回归锁。
- 空转帧的验收用计数器而不是墙钟：`requestRender` 次数与帧推进次数应当一一对应。
- 2026-09-17 实现完毕。落地时的四处选择：
  - `statusline/package.json` 的 `name` 是 `"statusline"`（`ui/package.json` 的形状 + 本目录名）。
  - `RUNCAT_FRAMES` 常量落在 `index.ts`（适配器），按 spec 的 D9「改字形 = 换 `view.frames` 一个参数」——字形不是 `view.ts` 的知识。
  - 定时器臂在 footer 工厂里（`arm()` 紧跟 `setFooter` 回调），`message_start` / `message_end` 通过 `footer.rearm()` 重排；`dispose` 里清定时器、退订 branch、并把 `footer` 置空。
  - `plannotatorPhase` 现在把 `phase` 收窄成 `"planning" | "executing" | "idle" | null`：非这三值（原来会画不出 chip）在视图里等价于 null。
- 2026-09-17 证据（临时探针跑完即删；可复现的接线断言已留在 `test/statusline-wiring.test.mjs`）：
  - **空转帧**：假宿主下 5 秒空闲 → 新实现 29 次 `requestRender`（期望 29.9），且每次渲染的猫字形都恰好前进一帧；同一场景旧实现（50ms 轮询）是 98 次。帧率 100 → 30/5s。
  - **/reload 两次**：第二次 `setFooter` 触发旧组件 `dispose`，之后 1 秒窗口内 6 次渲染（叠两套时钟会是 12 次），页脚仍只有两行；旧组件的计数器在 `dispose` 后不再增长，`onBranchChange` 的退订也生效。
  - **三态**：流式中 `accent` 的 `170t/s`，`message_end` 后 `muted` 的速率 + `输入1.0k 输出600`（增量合计），空闲不画速率段。
  - **前后对照**：把 `git HEAD` 的 `statusline.ts` 取出来，用同一份假宿主数据渲染，5 种状态（无 usage / 20% / 80% / 无 percent / window=0）的纯文本逐字相同（折叠连续空格后），宽度仍填满 200 列；唯一的差异是猫后面少了一个空格（见 01 的 Comments：旧帧常量自带尾空格）。
  - **pi 的发现路径**：直接调 pi 的 `discoverAndLoadExtensions([], "/Users/hoon/dotfiles", "…/.pi/agent")` → statusline 恰好一个入口 `statusline/index.js`（bundle），`errors` 为空，共 11 个扩展。
- 2026-09-17 新增 `test/statusline-wiring.test.mjs`（票面没要求，但 `/reload` 不叠脚这条回归锁除了探针没有别的载体）：三个纯模块之外，接线的可复现断言——帧契约（250ms 空闲 1~3 帧，`dispose` 后 0 帧）、两次注册只留一套时钟、三态与配色、主题切换。空闲 5 秒的计数仍走探针，避免把 `npm test` 拉长到 5 秒以上。
