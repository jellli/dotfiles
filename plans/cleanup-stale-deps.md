# 清理 npm/package.json 4 个残留依赖

## Context

`~/.pi/agent/npm/package.json`（pi 的扩展包存储）里有 4 个依赖不在 settings.json `packages` 里，是历史残留：

| 包 | 版本 | 说明 |
|----|------|------|
| `pi-speeed` | ^0.4.0 | 已被 statusline.ts 的自研 t/s 追踪取代 |
| `@mohndoe/pi-atlas` | ^0.1.3 | 无引用 |
| `@zosmaai/pi-llm-wiki` | ^0.9.3 | 无引用 |
| `pi-hermes-memory` | ^0.7.23 | 无引用 |

已排查：`pi-observational-memory` 依赖为空 `{}`，不依赖 hermes；node_modules 里 grep 只有这 4 个包自引用，无传递依赖。

用户决定：**删包 + 删 pi-speeed-stats.json，保留 pi-hermes-memory/ 数据目录**（MEMORY.md + sessions.db 3MB，不在 git，不可恢复 → 保留）。

## Approach

### 1. 移除 4 个依赖（双路径）

**快路径**：依次 `pi remove npm:pi-speeed`、`pi remove npm:@mohndoe/pi-atlas`、`pi remove npm:@zosmaai/pi-llm-wiki`、`pi remove npm:pi-hermes-memory`。若 pi 能处理不在 settings 的包 → 自动清 package.json + node_modules。

**回退路径**（pi remove 报 "not installed" 时）：手动编辑 `.pi/agent/npm/package.json` 删 4 条依赖，再 `cd ~/.pi/agent/npm && npm prune` 清 node_modules。

### 2. 删 stats 残留

`rm ~/.pi/agent/pi-speeed-stats.json`（422K，纯统计）。

### 3. 保留

`~/.pi/agent/pi-hermes-memory/` 目录原样不动。

## Files to modify

| 文件 | 改动 |
|------|------|
| `.pi/agent/npm/package.json` | 删 4 条依赖 |
| `.pi/agent/npm/node_modules/` | prune 掉对应包代码 |
| `.pi/agent/pi-speeed-stats.json` | 删除 |

## Reuse

- `pi remove` — pi 内置（settings 路径已验证可用；本任务包不在 settings，可能需回退）
- `npm prune` — node_modules 清理

## Steps

- [x] 1. 移除 4 个依赖（pi remove 或 手动编辑 + npm prune）
- [x] 2. 删 pi-speeed-stats.json
- [x] 3. 校验

## Verification

1. `grep -c 'pi-speeed\|pi-atlas\|llm-wiki\|pi-hermes-memory' .pi/agent/npm/package.json` → 0
2. `ls .pi/agent/npm/node_modules/` → 4 个包目录消失
3. `pi-speeed-stats.json` 不存在；`pi-hermes-memory/` 目录仍在（数据保留）
4. settings.json `packages` 仍是 8 条（不受影响）
