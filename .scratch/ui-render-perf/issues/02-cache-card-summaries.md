# 卡片 summary 与展开体按结果缓存

**Category:** performance
**Status:** done

## 问题

TUI 每次输入都重画整个 transcript（`TuiBase.MIN_RENDER_INTERVAL_MS = 16`），卡片每帧重算：

- `lib/aggregation.ts:251` 每帧调 `this.summary?.(entry.output, theme)`：
  - `grepSummary` = `split` + 每行正则 + `Set`，实测 **0.7ms/次**（2000 行输出）
  - `readSummary` = `split` 整个文件输出，0.15ms/次（5000 行）
  - 30 张 grep 卡片 → 每个按键约 20ms
- `lib/aggregation.ts:183 bodyLines()` 展开态每帧重新 split + fit 所有行
- spinner 每 80ms `invalidate()` 一次，流式期间整份 transcript 以 12.5fps 重绘；每次 tick 还会重跑 `renderResult` → `textOutput()` 重新 join 整个流式输出

## 任务

- [x] `Entry` 加 `Memo<T>` 缓存（键 = output + theme + width），`render()` 直接用
- [x] 展开体同理缓存
- [x] spinner 间隔 80ms → 140ms
- [ ] 流式期间 `textOutput()` 的 join 缓存 —— **不做，见 Comments**

## 验收

- [x] 30 张卡片、每张 2000 行输出的 transcript，单次 `render()` < 3ms
- [x] 输出更新后 summary 仍正确刷新（`test/aggregation.test.mjs` 覆盖组内结果更新）

## Comments

- 2026-09-12 完成。实测：30 张卡片 × 2000 行输出，单帧 **19.75ms → 2.64ms**（验收 < 3ms）。
- 最后一条任务不做：`renderResult` 每次重绘拿到的结果对象都是新的，唯一稳定的键是 `result.content` 数组本身，而流式更新可能就地改它 —— 没有既安全又不会陈旧的键。缓存 summary/展开体已经吃掉了主要成本。
