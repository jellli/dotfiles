# 状态栏重排（修订）：猫和速度必须在一起

## Context

上一轮重排把 `cat` 放左侧（紧跟分支）、`speed` 留右侧 token 块，猫和速度被拆散。用户纠正：**猫和 token 速度是一体的**。

确认方案（用户选定）：

```
left:  dotfiles / main 🐱 45t/s
right: ▶ EXEC 12% ██████░░ ↑1.2k ↓3.4k
```

- 最左：`gitRoot / branch`
- 猫+速度一组紧跟分支（`🐱 45t/s`）
- 最右：plan chip + token 用量（`pct% [bar] ↑in ↓out`，不含 speed）

## Approach

改动集中在 [statusline.ts](.pi/agent/extensions/statusline.ts:193-216) 的 `render()`：

1. `cat`+`spd` 合成一组：`${cat}${spd}`（猫帧自带尾随空格、spd 无前导空格 → `🐱 45t/s` 单空格）
2. **`left`** = git 块 + ` ${cat}${spd}`（无 git 时只有猫+速度）
3. **`right`** = plan chip + tokenBlock，tokenBlock 去掉 `spd`：`${pl} ${bc(bar(r,6))} ${ts}`
4. 同步更新文件头注释 + 段注释

## Files to modify

| 文件 | 改动 |
|------|------|
| `.pi/agent/extensions/statusline.ts:193-216` | `render()` 内 `left`/`right` 拼接 + 注释 |

## Reuse

- `cat`/`spd`/`ts`/`bc`/`bar`/plan chip 分支 — 现有代码原样，只改拼接位置
- `visibleWidth`/`truncateToWidth` 空隙拼接 — 不动

## Steps

- [x] 1. `left` 拼 `git块 + cat + spd`；`right` 的 tokenBlock 去掉 `spd`
- [x] 2. 更新文件头注释 + cat/spd 段注释 + `// ── left` 段注释
- [x] 3. tsgo 校验

## Verification

1. `cd .pi/agent/extensions && ./tsgo --noEmit` 通过
2. `/reload` 后：
   - 左端 `dotfiles / main 🐱 45t/s`（猫+速度相邻、紧跟分支）
   - 右端 `▶ EXEC 12% ██████░░ ↑1.2k ↓3.4k`（无猫无速度）
   - 非 git 目录：左端 `🐱 45t/s`
   - 无 plan chip：右端直接 token 用量
