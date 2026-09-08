# pi-codegraph 扩展实现计划（MVP 阶段）

> 本文档由 grilling 会话（2026-09-08）决议重写；上一版本（上游对齐自研方案）已被全部推翻，勿再参照。

## 定位

自有 MVP 版 pi 扩展 `.pi/agent/extensions/codegraph/`（子目录包形态，package.json + node_modules）。
**不做**上游 fork、**不追求**与 elpapi42/pi-codegraph 对齐。目标：最小可用的代码库问答工具集。

## 已定决策（grilling 落定，不再讨论）

| # | 点 | 决议 |
|---|----|------|
| 1 | 自研边界 | **引擎黑盒信任**——codegraph 引擎（检索/排序/同步）完全交给 `@colbymchenry/codegraph@1.6.0`；自研只限 pi 集成层：生命周期、工具接线、输出防御、交互（confirm/notify/status）。~~自研检索流水线/自写排序~~ 作废 |
| 2 | 工具集 | `codegraph_explore` / `codegraph_query` / `codegraph_status` / `codegraph_impact` + 命令 `/codegraph:init`。~~对齐上游 explore_code/analyze_code 命名~~ 作废 |
| 3 | explore 实现 | `buildContext(query, {maxNodes, includeCode, format:"markdown"})` 黑盒 + **50KB 输出 cap**（防爆上下文，归集成层；超限截断并置 details.truncated）。`maxNodes` 保持符号级 |
| 4 | 未索引项目 | `ctx.ui.confirm` 确认后自动 `init` + `indexAll`（带进度）；拒绝 → grep/read 引导文案；**非交互（pi -p）跳过 confirm 直接引导**（避免无头环境静默重活） |
| 5 | status | **缓存优先**：clients Map 命中 → 读缓存实例（getStats/getPendingFiles/isWatching，零副作用）；未命中 → throwaway open+close。两行状态永远一致，消除"缓存里有但没 watch"假象 |
| 6 | impact | `codegraph_impact {symbol, maxDepth?}` → `getImpactRadius` 一个调用 + 结果格式化（入口点/受影响节点列表）。**explore 描述删掉 blast-radius 字样，指向 impact** |
| 7 | 可复现性 | `package.json` 加 devDependencies（`@earendil-works/pi-coding-agent` + `typebox` + `@types/node`）；tsconfig 去机器绝对路径（paths/typeRoots 走本地 node_modules，moduleResolution: bundler）；`.pi/.gitignore` 反忽略 `!agent/extensions/codegraph/tsconfig.json` 让 tsconfig 入库。新机器 `npm ci && tsgo -p tsconfig.json` 一条闭环 |
| 8 | 重建 | `/codegraph:init --force`：confirm 确认 → 删旧 `.codegraph/` → 重新 init + indexAll。~~独立 /cg:uninit~~ 不做——需删索引时手动 `rm -rf .codegraph` 即可（gitignored、可重建，无风险） |

## 现状（已实现并冒烟通过，勿重做）

- 子目录包：`codegraph/package.json`（`@colbymchenry/codegraph@1.6.0` 依赖 + pi.extensions 字段）、`index.ts`（CODEGRAPH_TELEMETRY=0、注册工具、session_shutdown → closeAll）、`tools.ts`（模块级 Map<string, OpenClient> 缓存 + findNearestCodeGraphRoot 定位根）
- `codegraph_explore` / `codegraph_query` / `codegraph_status` + `/codegraph:init` 已注册，真实 pi 冒烟通过（2 文件 6 节点 8 边，统计正确）
- 测试基建：`/tmp/cgtest`（demo 项目）、`/tmp/cgtest-harness.mjs`（jiti 加载 + 假 ExtensionAPI 回归 harness）

## 待实现清单（本轮 grilling 产生的增量）

- [x] **I1** `codegraph_impact` 工具：schema `{symbol: string, maxDepth?: number}` + `getImpactRadius` + 格式化（入口点/受影响节点分层）；symbol 解析容忍 `.`/`::`/`#` 分隔符；无符号/无下游各返回明确文案
- [x] **I2** explore 描述修复：删 blast-radius 过度承诺，改为指向 impact 做影响分析
- [x] **I3** 未索引自动初始化：`resolveClient` 深模块——confirm（交互，title+message 两参）→ init + indexAll 进度 notify；拒绝/非交互 → grep/read 引导文案；explore/query/impact 三工具统一接线
- [x] **I4** status 缓存优先重构：clients Map 命中读缓存实例（watcher 行如实显示 watching），未命中 throwaway（finally 只关非缓存实例）
- [x] **I5** 输出防御：`truncateOutput(content, maxBytes=50KB)` 纯函数（UTF-8 字节截断 + 干净字符边界 + tail 标记），`capped()` 接线 explore/query/impact/status，截断时 details.truncated=true
- [x] **I6** `/codegraph:init --force`：token 解析（`--force [path]`）+ confirm → dropCachedClient → rm .codegraph → 重新 init；拒绝保留旧索引
- [x] **I7** 可复现性：devDependencies（pi-coding-agent@0.85.1 + @types/node，typebox 已在 deps）+ tsconfig 相对化（去绝对 paths/typeRoots）+ `.pi/.gitignore` 反忽略 tsconfig 入库；`npm ci && tsgo -p tsconfig.json && npm test` 闭环已验证

## 依赖注意事项（沿用 P0 核查）

- 安装必须官方 registry：`npm i @colbymchenry/codegraph@1.6.0 --registry=https://registry.npmjs.org`（镜像源 r.cnpmjs.org 可能缺 darwin-arm64 platform bundle）
- 锁 1.6.0；SDK CJS，ESM/jiti 下需默认导入归一化

## 验证清单

- [x] V1 类型：`cd .pi/agent/extensions/codegraph && tsgo -p tsconfig.json` 0 error（npm ci 重装后复验通过）
- [x] V2 自动 init：未索引项目 → 交互 confirm → init+indexAll 进度 → explore 可用；拒绝路径返回 grep/read 引导（V6/V7 切片）
- [x] V3 非交互：ctx 无 confirm 函数 → 不 confirm、不静默索引，直接引导（V8 切片）
- [x] V4 impact：`{symbol}` 返回入口点 + 受影响节点定位；maxDepth 限制多跳；无符号/无下游明确文案；`UserService.findUser`（点分隔）可命中 `UserService::findUser`（V1–V3 切片）
- [x] V5 status：缓存命中时 Watcher 显示 watching、Cache loaded；未缓存时 throwaway 两行一致（V9 切片）
- [x] V6 cap：440KB UTF-8 混合文本截断至 ≤51200 字节、无断字符、带 tail 标记、details.truncated=true（V5 切片）
- [x] V7 --force：confirm 重建成功（drop 缓存、删 .codegraph、re-init）；拒绝保留旧索引（V10 切片）
- [x] V8 回归：harness 全过（基线 3 工具 + init + shutdown 重开 + 10 个新切片）

## 进度

- [x] 决策 grilling 完成（8 项决议落定，CONTEXT.md 术语同步）
- [x] 基础 3 工具 + init 命令实现并冒烟
- [x] I1–I7 实现（TDD 垂直切片，test/harness.mjs 入库 + npm test）
- [x] V1–V8 验证
