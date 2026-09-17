# 03 — 收词与交接（CONTEXT.md、plans 指针、D9 证据）

**Status:** done
**依赖:** 02

代码落地后把三个新词收进领域词汇，并把这只猫的来源文档指向本目录。

## 任务

- [x] `.pi/CONTEXT.md` 加一节 `## Statusline footer`（并把它开头的范围一句从「tool card 与 todo HUD」扩到含页脚），收三个词：
  - **Footer view**：`footerRows(view, width, theme)` 与它的 `view` 记录 —— 一份会话快照（git、分支、上下文用量、合计、速率、阶段、帧）进，两行出。
  - **Speed tracker**：由消息事件驱动的速率状态机（`begin/update/end/snapshot`）+ `usageTotals`。**帧不参与计量**。
  - **Animation clock**：`frameInterval` / `advanceFrame` 的纯推进；调用方只在 `advanceFrame` 报 `changed` 时请求重渲染。（不要叫 Frame clock —— `Frame` 已被卡片框架占用。）
- [x] `plans/runcat-statusline.md` 顶部加一行指针到 `.scratch/statusline-footer/spec.md`，并注明：速度曲线与摆放决策的代码位置已迁到 `statusline/frame.ts` 与 `statusline/view.ts`；字形一事见 spec 的 D9（未决）。
- [x] 把 D9 的证据补进 `spec.md` 的 Comments（`fc-match -s ':charset=e900'` 的第一名 `MonaspiceRn Nerd Font`、本机 Nerd Font 数量、kitty `symbol_map U+E900-U+E904 icomoon`、runcat.ttf family `icomoon`），并写明「未写 ADR」的原因。

## 验收

- [x] `CONTEXT.md` 的三个词能在代码里一一对应（`grep -nE 'footerRows|createSpeedTracker|advanceFrame' statusline/*.ts` 三处都命中；另外 `index.ts` 三处 import 与调用也都命中）。
- [x] `plans/runcat-statusline.md` 里有指向 `.scratch/statusline-footer/` 的链接。
- [x] `spec.md` 的 Comments 里有 D9 的证据与「未写 ADR」一句。
- [x] `CONTEXT.md` 的既有词一字不改（Tool card / Card spec / Card input / Frame / … 全部原样）。

## Comments

- 2026-09-17 开票。收词依据 `docs/agents/domain.md`（单上下文仓库，一个 `CONTEXT.md`）与 improve-codebase-architecture 的第 3 步（新模块用到 glossary 之外的概念就补进去）。
- 2026-09-17 实施记录：
  - 票面的 `CONTEXT.md` 指的是 **`.pi/CONTEXT.md`**（Tool card / Card spec / Frame 那一份；仓库根另有一个只收 CodeGraph 与 Todo 的 `CONTEXT.md`）。改动只有两处：范围句 + 末尾新增的 `## Statusline footer` 一节（`git diff --stat` = 16 insertions / 2 deletions，其余词条零改动）。
  - D9 证据按**本机实测**写进 spec 的 Comments，与开票时抄来的数字有一处出入：Nerd Font 数量实测 219 个 face（222 个 family），票面/spec 原文写的 255 复现不出来，已在 Comments 里注明按实测记。
  - `~/.config/kitty/kitty.conf` 里没有 `symbol_map`，所以「逐终端 pin」目前并未生效；`runcat.ttf` 实测 family `icomoon`、3532 字节。
  - 给 `plans/runcat-statusline.md` 顶部加的是一个 `[!NOTE]` 块（指针 + 代码位置迁移 + 字形未决三件事），没有改动该文档已确认的速度曲线与摆放决策。
  - 注：`.pi/CONTEXT.md` 在 prettier 下有**一处既有**的格式抱怨（`Result line` 词条里的 `` ` └─ ` `` 带空格），HEAD 版本就有；票面要求既有词一字不改，故未改，只补了文件末尾换行。
