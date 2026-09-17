# ui 扩展渲染与启动性能

**Status:** done

2026-09-12 对 `agent/extensions/ui` 的一次性能与隐患审查的结论。四个修复拆成 ticket 01–04；同日与 pi-tidy-tools / pi-tool-display 的实现对比后追加 ticket 05–08。已完成的宿主入口修复见 `docs/adr/0003-foreign-tool-cards-host-entry.md`。

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
| `BashResult.update`（无 memo） | 0.167ms/次 | 2000 行 / 122KB；15 次/秒 ≈ 2.5ms/s，**不值得开票** |
| edit 前后双读（`pi-diff` execute） | 51ms + 约 19MB 常驻 | 9.6MB 文件；<1MB 文件约 2ms |
| `stripBackground` | 4.3µs/行 冷、0.054µs/行 热 | 500 行 2.137ms / 0.027ms，差 79× |

最后三行是 2026-09-12 的**微基准复刻**（复刻同一操作序列，非进程内实测），用于 ticket 05/08 的取舍；其余为进程内实测。

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
- [03 stripBackground 按行 memo 并修 reset 丢失](./issues/03-strip-background-memo-and-reset.md)（done，随 `87f2152`）
- [04 限制 diff 行物化与三处无界内存](./issues/04-bound-diff-rows-and-memory.md)
- [05 stripBackground 缓存淘汰在阈值处抖动](./issues/05-strip-background-cache-eviction.md)
- [06 reload 卫生：foreign 包装叠加、补丁陈旧、无卸载通道](./issues/06-reload-hygiene.md)
- [07 换主题后已有 diff 卡配色陈旧](./issues/07-diff-card-theme-refresh.md)
- [08 edit 的 capture 读取加阈值守卫](./issues/08-edit-capture-read-guard.md)

## 不做的事

- 不给 `.pi/CONTEXT.md` 加词：`Re-render`、`Aggregation`、`Tool card` 已够用。
- 不写独立的 perf 报告：数字随 ticket 走。
- 已评估但**不做**（2026-09-12 复核，记在这里以免下次重复评估）：
  - `BashResult` / `BashHeader` 补 memo：实测 0.167ms/次（2000 行 / 122KB），15 次/秒 ≈ 2.5ms/s，与下面一条同量级。
  - 流式 `textOutput()` 的 join 缓存：ticket 02 已否决——结果对象每帧都是新的，`content` 数组又可能被就地改，没有既安全又不陈旧的键。
  - aggregation entries 裁剪：ticket 04 已撤销——会让已关闭的组被重建成单行卡，且删 map 槽位并不释放输出文本。
  - spinner 再降频 / 加动画：02 已 80ms → 140ms，卡片侧成本已被 memo 覆盖，纯审美。
  - pi-tool-display 的 hashline 锚点 gutter：宿主 `read`/`edit` 不产出该格式（`dist` 内 `hash` 命中 0，`anchor` 仅出现在 tree-selector），我们的解析器也没有这条分支。
  - pi-tool-display 的 pi-fff 所有权/生命周期层（1553 行）：只为藏掉 `ffgrep`/`fffind` 两个名字，而 foreign 卡已经给它们套了 badge。
  - pi-tool-display 的配置面 / 预设 / 模态（约 2600 行）：我们已有 `~/.pi/agent/tool-cards.json` 例外表 + 常开策略。
  - pi-tidy-tools 的 `reasoning` 必填参数：改模型行为，每次调用多一个参数。
  - **later：流式 pending diff 预览**（pi-tool-display 的招牌功能）。执行前就画 `pending edit/overwrite/create`，但需要确定性重放 `edits[]`、按 previewKey 记忆化、工作区路径校验 + 1MB 上限，成本 M–L；先用 05/07/08 的收益，之后再回看。
  - **later：上轮改动回顾命令（`/diff`）**。tidy 与 pi-tool-display 都有；本轮问卷里未纳入，属"想做但不紧急"。
