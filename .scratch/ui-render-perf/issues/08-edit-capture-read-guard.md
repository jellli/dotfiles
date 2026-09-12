# edit 的 capture 读取加阈值守卫

**Category:** performance
**Status:** done

## 问题

`ui/pi-diff.ts wrapMutation().execute` 在工具执行前后各读一次整文件并 `normalize()`，而"是否太大"是在**读完**之后才判断的：`MAX_CAPTURE_LINES = 20000` 只决定要不要留 capture，两次读已经发生。

9.6MB 文件（2026-09-12 微基准）：**51ms + 约 19MB 字符串常驻**直到 `renderResult`。而且**前置读发生在工具执行之前**，等于把编辑本身推迟半个来回；网络盘上这段是秒级。`<1MB` 的文件约 2ms，可以忽略——这是长尾问题。

## 任务

- [x] `execute` 里先按字节设阈值（行数必须先读才知道，所以用 `statSync().size`）：超过阈值就不读文件、不建 capture
- [x] 超阈值走宿主 `details.diff`（`parseDisplayDiff` + `addWordRanges`，即今天 >20k 行已经在跑的那条路径）
- [x] 阈值常量写清来由（沿用 `MAX_CAPTURE_LINES = 20000` 管已读进来的情况；字节阈值取 2MB 量级，注释记 9.6MB 的实测）
- [x] `<` 阈值的行为不变：全量上下文行 + 词级强调

## 验收

- [x] 9.6MB 文件的 edit：注入 fs 计数断言 0 次完整 `readFile`，无 19MB 常驻
- [x] 正常文件（<2MB）的 diff 卡与改动前逐字节一致
- [x] 超大文件的卡片仍渲染（走宿主 diff 路径，上下文为宿主 ±4 行）

## Comments

- 2026-09-12 开票。取舍已在同日的问卷里定过：**阈值守卫**（超大文件才放弃自读），而不是"edit 一律用宿主 diff"——后者会让所有 edit 卡的上下文行变窄到 ±4 行。
- 2026-09-12 完成。`wrapMutation().execute` 先问字节数（新接缝 `CaptureSource = { read, size }`，`registerPiDiff({ capture })` 可注入；默认实现是 `readFile` + `statSync`），超过 `MAX_CAPTURE_BYTES = 2 MiB` 就一次文件都不读，diff 走宿主 `details.diff`。`MAX_CAPTURE_LINES` 的旧规则保留，管已经读进来的情况（例如 <2 MiB 但两万行以上）。

  `write` 例外：宿主 `write` 的 `details` 没有 diff（ticket 04 的结论），丢掉 capture 会让卡片显示 "Diff unavailable"，所以 `CAPTURE_ONLY_TOOLS = {write}` 不吃字节守卫，行为与改动前一致。

  验收：注入一个计数的 capture 源——9.6MB 文件的 edit 断言 `read` 0 次、`size` 至少 1 次，卡片画出改动，且 footer 的行数是宿主 ±4 行的量级（< 20 行；走 capture 会是两万行）；`write` 仍读两次并画出 capture 的 diff；正常文件仍读两次，且展开后的卡片能看到文件开头的上下文行——那是宿主 ±4 行永远给不到的（现有 pi-diff 测试里两万行的文件也照旧走宿主路径）。
