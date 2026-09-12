# 04 — 外部调用方迁移（brave / ollama / todo）

**Status:** done
**Blocked by:** 01

- `brave-search/index.ts`、`ollama-web-fetch/index.ts`：删掉手写的 `renderCall`/`renderResult` 与自带的 badge + `└─` 行，改成 `toolCard` 的 `detail` + `summary`（它们今天 import 的 10 个符号里，`syncSpinner`/`spinnerChar`/`SpinnerState`/`resultLine`/`toolHeader`/`errorPreviewLine` 全部归 Frame）。
- `todo/index.ts`：`createToolAggregation` → `toolCard`；`bracketDetail` 从 card 库取；HUD 的 badge 保持自己的 `toolPendingBg` 画法（HUD 不在本计划内）。
- `ui/lib/pi-ui.ts`：收敛为仍在用的纯 helper 或整文件删除（helper 并入 card 库）；不再对外导出 spinner 与 result line 的构造。

验收：`test/lazy-loading.test.mjs`（brave 注册名与 undici 惰性）与 `test/oh-my-pi-todo.test.mjs`（result text）保持绿；`grep` 全仓不再有第二份 badge / result line 构造。

## Comments

- 2026-09-12 关票。`todo/index.ts`（`createToolAggregation` → `toolCard`、HUD 保留自己的 `toolPendingBg` badge）与 `ui/lib/pi-ui.ts` 的整文件删除在 01–02 的提交里已经落地（`7029371` / `3f5d73f` / `87b1065`），本票补完剩下的一半：`brave-search/index.ts` 与 `ollama-web-fetch/index.ts` 的手写 `renderCall`/`renderResult`、badge 与 `└─` 行删除，各自留一份 `braveSearchSpec` / `webFetchSpec`（detail + summary），工具定义提为 `definition` / `createWebFetchTool()` 后经 `toolCard` 注册。
- `summary` 的签名只有 `(output, theme)`，memo 键是 (output, theme, width)，拿不到 `result.details`，所以两张卡的 summary 都从工具自己的输出首行解析：brave 的 `Results for "…" (N results[, cached]):` 由 `resultHeader` 生成、summary 读回（顺带把 cached 的行文从 `(cached)` 改成 `(N results, cached)`，信息更全），ollama 的 `Title: X (N chars total)` 同理。
- 测试：`test/tool-card.test.mjs` 新增「The web cards the extension ships」段，断言两张 shipped spec 的 header 与 result line；brave 的 fixture 由它自己的 `formatResults` 生成，避免测试另造一份输出格式。`lazy-loading` 与 `oh-my-pi-todo` 原样绿。
- 全仓第二份 badge / result line 构造只剩 `ui/pi-diff.ts:25-27,774-785,957-1040`，属票 05。
