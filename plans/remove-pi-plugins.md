# 移除 3 个 pi 插件：neuralwatt / pi-fork / pi-subagents

## Context

用户要求卸载 3 个 pi 插件：

| 包 | settings.json 条目 |
|----|----|
| `@aliou/pi-neuralwatt` | `npm:@aliou/pi-neuralwatt`（[settings.json:12](.pi/agent/settings.json:12)） |
| `pi-fork` | `git:github.com/elpapi42/pi-fork`（[settings.json:14](.pi/agent/settings.json:14)） |
| `pi-subagents` | `npm:@tintinweb/pi-subagents`（[settings.json:17](.pi/agent/settings.json:17)） |

已排查依赖：`agents/` 空、自定义扩展（statusline/plannotator-enhancer/plannotator-models/vim-mode）均不 import 这三个包、graphify skill 里的 "subagents" 是泛指文字 → 移除无破坏。

## Approach

### 1. 用内置命令卸载（核心）

```bash
pi remove npm:@aliou/pi-neuralwatt
pi remove git:github.com/elpapi42/pi-fork
pi remove npm:@tintinweb/pi-subagents
```

`pi remove`（alias `pi uninstall`）会：从 [settings.json](.pi/agent/settings.json) `packages` 删除条目、从 `~/.pi/agent/npm/package.json` 依赖 + node_modules 清除代码。`~/.pi` → `dotfiles/.pi` 符号链接，改的就是仓库文件。

### 2. 删除孤儿配置

neuralwatt 卸载后残留的配置文件（不再被任何东西引用）：

- [.pi/agent/extensions/neuralwatt.json](.pi/agent/extensions/neuralwatt.json)（schema 指向 @aliou/pi-neuralwatt）
- [.pi/agent/extensions/neuralwatt.v0.13.0-flat-config.json](.pi/agent/extensions/neuralwatt.v0.13.0-flat-config.json)

## Files to modify

| 文件 | 改动 |
|------|------|
| `.pi/agent/settings.json` | `packages` 删 3 条（由 `pi remove` 自动完成） |
| `.pi/agent/npm/package.json` | 删 neuralwatt + subagents 依赖（由 `pi remove` 自动完成） |
| `.pi/agent/extensions/neuralwatt.json` | 删除 |
| `.pi/agent/extensions/neuralwatt.v0.13.0-flat-config.json` | 删除 |

## Reuse

- `pi remove <source>` — pi 内置包管理命令（`--help` 已确认存在）

## Steps

- [x] 1. 依次执行 3 条 `pi remove`
- [x] 2. 删除 extensions/ 下 2 个 neuralwatt 配置文件
- [x] 3. 校验（见下）

## Verification

1. `grep -in 'neuralwatt\|pi-fork\|subagents' .pi/agent/settings.json .pi/agent/npm/package.json` → 无输出
2. `ls .pi/agent/extensions/` → 无 neuralwatt.* 文件
3. 重启 pi 后：fork / steer_subagent / get_subagent_result 工具消失（来自 pi-fork，预期行为）；无插件加载报错

> [!NOTE] 范围外发现（不动）：`npm/package.json` 还有 `pi-speeed ^0.4.0`、`@mohndoe/pi-atlas`、`@zosmaai/pi-llm-wiki`、`pi-hermes-memory` 4 个依赖，均不在 settings.json `packages` 里（历史残留）。本计划只动用户点名的 3 个，其余保持原样。
