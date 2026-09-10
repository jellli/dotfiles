# ADR 0002: 将 pi-ollama-cloud 拆分为两个本地扩展

日期: 2026-09-10
状态: 已采纳

## 背景

`pi-ollama-cloud`（npm 包，上游 fgrehm/pi-ollama-cloud 0.11.0）捆绑了四块功能：
ollama-cloud provider（模型目录 + 实时刷新）、`ollama_web_search`、
`ollama_web_fetch`、usage 状态栏/命令。brave-search 本地扩展已提供
`brave_web_search`（见 T/handoff：brave-search 集成），上游的搜索工具变得多余；
其余功能仍需要。

## 决策

移除 npm 依赖 `pi-ollama-cloud`，以两个本地扩展替代（`agent/extensions/`）：

- **`ollama-cloud/`** — provider 注册（内置目录 + `refreshModels` 实时刷新）与
  `/ollama-cloud-usage` 查询命令。模型目录等生成文件原样搬运，上游已验证。
- **`ollama-web-fetch/`** — 仅 `ollama_web_fetch` 工具。保留上游 API 契约
  （url/offset/full/refresh、同一磁盘缓存路径 `cache/pi-ollama-cloud/cache.json`、
  24h 成功 / 15min 失败 TTL），卡片 UI 迁移到本仓库 pi-ui 工具卡片语言
  （badge + `└─ ` result line，与 brave_web_search 一致）。

不保留：`ollama_web_search`（brave 替代）、usage 状态栏（只留按需查询命令）、
`PI_OLLAMA_WEB_TOOLS` / `ollama-cloud.json` 配置层（拆分后没有可关的东西了）。

测试：web-fetch 用 vitest 以 `createWebFetchTool({ cacheStore })` 工厂注入依赖，
对 `execute()` seam 和 cache store 行为做了测试（stub global fetch，真实临时文件缓存）。

## 后果

- 升级上游新模型目录需要手动同步 `ollama-cloud/` 下的 generated 文件
  （原 npm 包的 `generate-models` 脚本不在本地）。
- provider 与 web-fetch 解耦：web-fetch 单独存在时回退 `OLLAMA_API_KEY`
  环境变量解析密钥；provider 扩展不注册任何工具。
- `~/.pi/agent/npm/package-lock.json` 中残留若干历史安装的陈旧条目
  （`../../../dotfiles/...` 相对路径），不影响运行时，待后续整锁重装时清理。
- 本机 npm arborist 对 vitest 4 peer 图解析报错
  （`Cannot read properties of null (reading 'edgesOut')`），扩展本地依赖
  用 pnpm 安装（ollama-web-fetch 内含 pnpm-lock.yaml）。
