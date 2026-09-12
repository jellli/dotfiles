# 01 — card library 与 Frame 核心

**Status:** done

新建 `agent/extensions/card/`（无 index.ts、无 package.json），从 `ui/lib/` 搬入并重组：

- `lifecycle.ts` —— teardown registry，唯一的一套；spinner 与 `ui/` 的 host 补丁共用。
- `spinner.ts` —— 帧、140ms 定时器、`unref`、注册 teardown。
- `line-memo.ts` —— 有界文本 memo，原样搬。
- `text.ts` —— 纯 helper：`fitLine`/`fitPath`/`padLine`/`bracketDetail`/`shorten`/`textOutput`，以及 badge / header / result line 的构造。
- `tool-card.ts` —— `toolCard(pi, tool, spec?)`：Frame 的绘制、推导默认值、aggregation（从 `ui/lib/aggregation.ts` 搬入，保留 `globalThis` store 与其注释）、有界 memo、spinner 与 elapsed。

要在这一步建立的不变式（见 spec.md）：Frame 独占 `└─` 列、`body` ⇒ aggregation 关闭且冲突即抛错、invalidate 只由 Frame 调、同一 component 服务两个 slot、memo 键不含 component 身份、teardown 只有一套 registry。

验收：新 `test/tool-card.test.mjs` 只经 `toolCard` 接口断言（fake `pi`、fake tool definition、fake theme、fake context），覆盖：

- badge + header 行；`detail` 的括注与 `row` 的不括注
- summary 行、error preview（首行 + ` ...`）、展开时的 body 行
- 连续同工具调用合成一个 group、`├─`/`└─` 行、`×N` 头、另一工具/agent 边界/session shutdown 的 close
- 非 owner 结算只通知 owner 一次，owner 不反弹
- body 返回行时 Frame 不再画 result line；body 返回 `undefined`/`[]` 时回退
- `body` + `aggregate: true` 在 attach 抛错

同时把 `ui/index.ts` 的 `session_shutdown` 接到 card registry 的 `disposeAll`（host 补丁的 teardown 也在里面）。

## Comments

Implemented. What landed, plus the two boundary calls the ticket left open.

- `card/` holds `lifecycle.ts` (one registry: the spinner timers, the
  `[compaction]` patch, the foreign hub, and the diff captures all register
  there), `spinner.ts`, `line-memo.ts`, `text.ts` (pure helpers plus badge /
  header / result line), and `tool-card.ts` (Frame, derived defaults, the
  aggregation store moved from `ui/lib/aggregation.ts` with its comments, the
  memos, the spinner, the clock). `ui/lib/` is gone, every importer points at
  `card/`, and `ui/index.ts` wires `session_shutdown` to
  `cardLifecycle.disposeAll()`.
- Moving the module forces the aggregation call sites onto the new entry point,
  so read/grep, the foreign no-renderer branch, and todo now call
  `toolCard(pi, tool, spec)` with their rendering unchanged, and `foreign`'s
  injectable wrapper is now a card factory. The rest of 02 (find/ls/bash), 03
  (own-renderer foreign cards), 04 (brave/ollama specs), and 05 (pi-diff body)
  is untouched.
- The derived *body* (from `tool.renderCall || tool.renderResult`) is not in the
  Frame yet: an own-renderer foreign card still draws through `contentCard`,
  which is exactly what ticket 03 converges onto the Frame. Badge, `detail`
  (`display.description` / `display.name` / first short argument) and `summary`
  are already derived here.
- The elapsed clock is stamped on the row and exposed as `elapsedText` for
  bodies to read; the Frame does not draw it itself, because a card without a
  body already carries the outcome on its result line. Ticket 02's bash box is
  its first consumer.
- `test/aggregation.test.mjs` was folded into `test/tool-card.test.mjs` (the same
  scenarios, asserted through the new interface) and deleted. The foreign test's
  header-default assertions moved there too, since those derivations live in the
  card module now.
