# 04 — 外部调用方迁移（brave / ollama / todo）

**Status:** ready-for-agent
**Blocked by:** 01

- `brave-search/index.ts`、`ollama-web-fetch/index.ts`：删掉手写的 `renderCall`/`renderResult` 与自带的 badge + `└─` 行，改成 `toolCard` 的 `detail` + `summary`（它们今天 import 的 10 个符号里，`syncSpinner`/`spinnerChar`/`SpinnerState`/`resultLine`/`toolHeader`/`errorPreviewLine` 全部归 Frame）。
- `todo/index.ts`：`createToolAggregation` → `toolCard`；`bracketDetail` 从 card 库取；HUD 的 badge 保持自己的 `toolPendingBg` 画法（HUD 不在本计划内）。
- `ui/lib/pi-ui.ts`：收敛为仍在用的纯 helper 或整文件删除（helper 并入 card 库）；不再对外导出 spinner 与 result line 的构造。

验收：`test/lazy-loading.test.mjs`（brave 注册名与 undici 惰性）与 `test/oh-my-pi-todo.test.mjs`（result text）保持绿；`grep` 全仓不再有第二份 badge / result line 构造。
