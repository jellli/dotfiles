# ui 扩展渲染与启动性能

**Status:** ready-for-agent

2026-09-12 对 `agent/extensions/ui` 的一次性能与隐患审查的结论。四个修复拆成 ticket 01–04；已完成的宿主入口修复见 `docs/adr/0003-foreign-tool-cards-host-entry.md`。

## 实测基线

在真实 pi 进程内测得（`PI_TIMING=1` + 一个隔离探针）：

| 位置 | 耗时 | 说明 |
| --- | --- | --- |
| `ui/index.ts` factory（修复前） | 1130ms | 其中 879ms 是 import 未打包的 `dist/index.js` |
| `ui/index.ts` factory（修复后） | **6ms** | 见 ADR-0003 |
| 全部扩展加载 | 4001ms → 3520ms | |
| pi 总启动 | 4415ms → 3637ms | |
| shiki 高亮 | 0.324ms/行 | 3000 行 diff ≈ 971ms，5 万行 ≈ 16s |
| `stripBackground` | 3.05µs/行 | 每帧每行 |
| `grepSummary` | 0.7ms/次 | 2000 行输出，每帧 |
| `diffLines` | 9ms/5k 行、57ms/50k 行、203ms/200k 行 | 且每行物化一个对象 |

## 结果（2026-09-12）

| 项 | 前 | 后 |
| --- | --- | --- |
| ui 扩展 module import | 166ms | 65ms |
| ui 扩展 factory | 1130ms | 6–15ms |
| 扩展总加载 / pi 总启动 | 4001ms / 4415ms | 3176–3226ms / 3174–3610ms |
| 3000 行 diff 的高亮行数 | 3001（≈971ms） | 8（热态 3ms 成帧） |
| 30 张卡片单帧 render | 19.75ms | 2.64ms |

启动数字用 `PI_TIMING=1 pi --print --no-session --provider google --api-key bogus "hi"` 连测三次取范围；单帧与高亮行数用注入 tokenizer 的探针。

## 根因

三条独立的热路径，共同点是"每帧重做与结果无关的计算"：

1. **整份文件**：diff 行物化与 shiki 高亮都按整个文件规模做，而视图只画 8 行。
2. **每帧重算**：summary / 展开体 / 背景剥离在每次重画时重跑，尽管输入没变。
3. **无界缓存**：高亮 token、captures、aggregation entries 都不设上限，长会话只涨不落。

## 验证手法

- 启动耗时：`PI_TIMING=1 pi --print --no-session --provider google --api-key bogus "hi"`，看 `ui/index.ts factory` 一行。
- 隔离某个 factory 的真实开销：`pi --print --no-extensions -e <probe.ts>`，探针里分步 `performance.now()` 打点。
- 接缝是否打在活的类上：探针 import 候选类并包装 `getAllRegisteredTools`，看 session 实际调用哪一个（本次结论：`dist/bundle/index.js` 那份，未打包那份是死代码）。

## Tickets

- [01 大文件 diff 只高亮可见窗口](./issues/01-highlight-visible-diff-window.md)
- [02 卡片 summary 与展开体按结果缓存](./issues/02-cache-card-summaries.md)
- [03 stripBackground 按行 memo 并修 reset 丢失](./issues/03-strip-background-memo-and-reset.md)
- [04 限制 diff 行物化与三处无界内存](./issues/04-bound-diff-rows-and-memory.md)

## 不做的事

- 不给 `.pi/CONTEXT.md` 加词：`Re-render`、`Aggregation`、`Tool card` 已够用。
- 不写独立的 perf 报告：数字随 ticket 走。
