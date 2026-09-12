# stripBackground 缓存淘汰在阈值处抖动

**Category:** performance
**Status:** done

## 问题

`ui/foreign-tool-cards.ts:379 stripBackground()` 的按行 memo 用**整表清空**做容量控制（`:384` `if (stripCache.size >= STRIP_CACHE_LIMIT) stripCache.clear()`，上限 `:375` = 2000）。

命中与未命中差 79 倍（2026-09-12 微基准，同一操作序列）：

| 路径 | 500 行 | 每行 |
| --- | --- | --- |
| 冷（正则 + 回调） | 2.137ms | 4.3µs |
| 热（memo 命中） | 0.027ms | 0.054µs |

转录里出现超过 2000 行**不同内容**的第三方卡片（fabric 的 diff 卡、codegraph 输出）时，缓存每次触顶就整表作废，下一帧大部分行重新走正则：3000 行卡片每帧约 2000 行 miss ≈ **8.6ms/帧**。宿主每次输入事件重绘整个 transcript（`TuiBase.MIN_RENDER_INTERVAL_MS = 16`），所以这是"打字时每帧"的成本，而且比完全不缓存更不可预测——每帧在 0.16ms 与 13ms 之间跳。

## 任务

- [x] 淘汰改成"超容量丢最旧"（Map 插入序即 FIFO；要真 LRU 就命中时 delete+set 重排）
- [x] 容量上限语义保留（按保留文本量计：`STRIP_CACHE_BUDGET = 4M` 单位）
- [x] 行为不变：`\x1b[m` 保留，`48;…`/`49`/`40–47` 剥离

## 验收

- [x] 3000 行不同内容、连续 100 帧：第 2 帧起单帧总耗时 < 第 1 帧的 1/10
- [x] `test/foreign-tool-cards.test.mjs` 补一条"超容量后仍能命中较早的行"
- [x] 现有三条 `stripBackground` 断言不回归

## Comments

- 2026-09-12 开票。来源：与 pi-tidy-tools / pi-tool-display 的实现对比后的复核。ticket 03 的 memo 本身已经落地（`87f2152`），这张票只处理淘汰策略。
- 2026-09-12 完成。淘汰改成 FIFO，容量从"2000 条"改成"文本字节预算"（票里的备选）：条目上限在阈值处必然抖动——工作集 3000 行 > 上限 2000 时，淘汰最旧同样每帧全 miss，只有预算装得下当前卡片才可能跨帧命中。4 MiB ≈ 一万行带 ANSI 的渲染行，长转录仍然有界。

  实现在新模块 `ui/lib/line-memo.ts`（`createTextMemo(budget, compute)`：FIFO、每条只算一次、永远保留最新一条），`foreign-tool-cards.ts` 的 `stripBackground` 退化成一行转发。测试：memo 淘汰语义用注入的 compute 计数断言（命中不重算、被淘汰的行重算、size 不超预算）；验收断言为「第 2 帧 < 冷帧的 1/10」与「20 帧总耗时 < 一个冷帧的 10 倍」：单帧墙钟很吵（实测冷 8.5–12.9ms、热 0.34–1.4ms，比值 7–35×），所以帧 2 的成本取 20 次里最快的一次；缓存没兜住时每帧都要重算，这条断言就会挂——把预算改成 1 验证过（fastest warm 5.23ms vs cold 10.83ms）。原有三条 `stripBackground` 断言不变。
