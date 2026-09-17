# 第三方工具卡片

**Category:** enhancement
**Status:** done

## 目标

第三方工具（非本仓库来源）在主对话里也遵守本地卡片规则。设计与取舍见 [`../spec.md`](../spec.md)，决策记录见 `docs/adr/0002-foreign-tool-cards.md`。

## 任务

- [x] `ui/foreign-tool-cards.ts`：宿主类发现、hub 替换、两种卡片（自带 renderer / 无 renderer）
- [x] `ui/index.ts` 接线（async 工厂，await 安装）
- [x] `~/.pi/agent/tool-cards.json`（exceptions 为空）
- [x] `test/foreign-tool-cards.test.mjs`
- [x] `.pi/CONTEXT.md` 术语：Foreign tool card、Exception list
- [x] ADR-0002

## Comments

- 2026-09-11: 设计经 grilling 定稿（Q1–Q13）。目标分支 master（`~/.pi` 指向 `~/dotfiles/.pi`，改动立即生效）。
- 2026-09-11: 实现完成。实测：真实 pi 进程里发现 2 份 `ExtensionRunner` 类副本、listener 在 `session_start` 前跑、29 个工具被套卡片（含 `fabric_exec`）；本仓库已自带卡片的工具正确跳过。单测 + `tsgo` 通过。
- 2026-09-11: 待定——自带 renderer 的工具收起时，正文是否要从主 transcript 消失（本地折叠）还是保持现状（正文常显，折叠由工具自己管）。
