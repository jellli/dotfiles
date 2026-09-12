# reload 卫生：foreign 包装叠加、补丁陈旧、无卸载通道

**Category:** bug + lifecycle
**Status:** done

## 问题

三件事同源：扩展打出去的东西在 `/reload` 之后不会被收回。

1. **foreign 包装每 reload 叠加一层**（读代码推断，未复现）
   `ui/foreign-tool-cards.ts:707 registerForeignToolCards()` 丢弃了 `installForeignToolCards()` 的 `{ dispose() }`（`:654` / `:690`），从不调用。hub 挂在宿主 `ExtensionRunner.prototype` 的 `Symbol.for("dotfiles.foreign-tool-cards.v1")` 上，跨 reload 存活；而宿主 loader 每次 reload 都用 `moduleCache: false` 的 jiti 重新求值模块 → **每 reload 新增一个 listener**。每个 listener 自带 WeakMap 与包装逻辑，所以第二个 listener 会再包一次已经带 `renderCall` 的定义（`wrapForeignDefinition` 见 `renderCall` 已存在 → 走 `contentCard`）：**双表头 + 双重剥背景**，旧模块闭包常驻。
2. **compaction 补丁在 reload 后跑旧模块的代码**
   `ui/compact-tool-cards.ts:101` `if (prototype[COMPACTION_RENDER_PATCH]) return;` —— 补丁闭包属于旧模块实例，sentinel 让新模块不再打补丁。改这段渲染代码后 `/reload` 不生效，必须重启进程。
3. **没有卸载注册表**
   ui 扩展只有 aggregation 在 `session_shutdown` 重置（`lib/aggregation.ts:376`）；原型补丁、hub listener、定时器都没有统一出口。对照 pi-tool-display 的 `disposable.ts`（LIFO 清理）+ 带版本号与 owner 标记的可还原原型补丁。

## 任务

- [x] 复现 1：连续两次 `/reload`，看第三方卡片是否出现两行表头；或探针读 `Symbol.for("dotfiles.foreign-tool-cards.v1")` 的 `listeners.size`
- [x] 安装前摘掉上一个 listener（按 owner 替换，而不是 `listeners.add` 追加）
- [x] compaction 补丁带身份标记 + owner：reload 先还原旧的再打新的（身份用模块求值 token，见 Comments）
- [x] 加最小卸载注册表（LIFO），覆盖 hub listener、原型补丁、timer

## 验收

- [x] 连续两次 `/reload` 后 foreign 卡片行数与 reload 前一致（无双表头）
- [x] 连续两次 `/reload` 后 hub `listeners.size` 恒为 1
- [x] 修改 compaction 渲染代码后 `/reload` 即生效（无需重启）
- [x] `test/foreign-tool-cards.test.mjs` 补"重复 install 只留一个 listener、只包一层"

## Comments

- 2026-09-12 开票。来源：与 pi-tool-display 对比后的复核（它的 `disposable.ts` + 版本化原型补丁是本条的对照实现）。第 1 条是推导，所以任务第一条就是复现。
- 2026-09-12 完成，三条任务都落地：
  1. hub 按 owner 记 listener（`foreign-tool-cards.ts` 的 `Hub.owners`）：安装时先摘掉同一 owner 的旧 listener，`dispose` 连 owner 槽位一起清。测试里把旧行为复现成断言——换一个 owner 再装一次就得到 `listeners.size === 2` 与两行表头；同一 owner 重复安装恒为 1 且只有一行表头。
  2. compaction 补丁改成 `{ owner, token, original, patched }` 记录（`compact-tool-cards.ts`）：`token` 是本次模块求值的身份，`/reload` 重新求值模块后必然不同，于是先还原旧补丁再打新的。没用手工版本号——那要求每次改渲染代码都记得 bump，忘了就静默跑旧代码。测试用"上一代模块留下的记录"驱动：新代码生效、展开走的是被还原的宿主 render 而非旧补丁、同实例重复安装不再叠加；`disposeAll()` 后原型回到宿主实现。
  3. `ui/lib/lifecycle.ts` 的最小 LIFO 注册表（`createLifecycle()`：每项只跑一次、一项失败不阻断其余、`add` 返回注销句柄），`ui/index.ts` 在 `session_shutdown` 调 `uiLifecycle.disposeAll()`。注册表覆盖 hub listener、原型补丁与 spinner timer（`lib/pi-ui.ts` 的 `syncSpinner` 起 timer 时注册、settle 时注销）；测试用注入的注册表断言 listener 被释放，并断言 teardown 能停掉正在跑的 spinner。

  `pi-diff.ts` 里原本自己挂的 `session_shutdown`（清 captures）也改走同一注册表，reload 只留一个出口。

  未做进程内手工 `/reload` 验证：本环境没有可交互的 pi 会话（`session_shutdown` → 重新求值 → `session_start` 的时序按 `docs/extensions.md` 建模）。接缝测试覆盖了 reload 会走的两条路径：同一 owner 的重复安装、以及旧模块留下的补丁记录。
