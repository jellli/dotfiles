---
status: accepted
---
# 第三方工具卡片：宿主入口按"运行中的那一份"解析

ADR-0002 让 `ui` 扩展替换宿主 `ExtensionRunner.prototype.getAllRegisteredTools`，并留下一条结论：*"宿主有两份类副本（`dist/index.js` 与 `dist/bundle/*`），两份都要替换"*。实测证明这条结论是错的，且代价很高，本 ADR 修正它。

## 实测

`bin/pi` 启动的是 `dist/bundle/cli.js`（打包版），所以**运行中的类只有打包那一份**。在真实 pi 进程内测量（`pi --no-extensions -e probe.ts`）：

| 来源 | 耗时 | 说明 |
|---|---|---|
| `import("@earendil-works/pi-coding-agent")` | 0ms | loader alias 已加载，缓存命中 |
| `import(dist/index.js)`（未打包） | **879ms** | 运行进程从未加载过它：全新一份模块图 |
| `import(dist/bundle/index.js)` | **2ms** | 与 cli.js 同一个 chunk，缓存命中 |
| 扫描 48 个 bundle chunk（7.6MB `readFileSync`） | 38ms | `bundle/index.js` 已 re-export 同一个类 |

三者都导出了 `ExtensionRunner`。也就是说：**跑得快的那些就是活的那份，跑得慢的那份没人用**。这不是巧合——运行中的进程在启动时必然已经加载了自己要用的类，所以活的那份 import 一定是缓存命中。反过来，一次 import 花了真实时间，就说明这份副本没有任何人在用。

## 决策

按"便宜的先试"排列来源，拿到类就返回：

1. 裸说明符（loader alias 的解析结果，缓存命中）
2. 运行入口自己的包入口（`argv[1]` 在 `dist/` 或 `dist/bundle/` 下 → 同目录 `index.js`）
3. 已安装包的 `dist/bundle/index.js`
4. **回退**：`dist/index.js`（未打包）+ chunk 扫描，仅当 1–3 一个类都没拿到时执行

效果：ui 扩展的 factory 从 **1130ms 降到 ~10ms**，pi 总启动 4415ms → ~3.4s。

## Considered Options

- **维持"两份都 import"**：覆盖面看起来最稳，实际是每次启动白付 879ms 去 patch 一个没人用的类。
- **只 import `dist/bundle/index.js`**：丢掉 SDK / `node dist/cli.js` / 测试这类未打包宿主——那种进程里活的是 `dist/index.js`，但它在那个进程里同样已经被加载，因此由第 1 步（缓存命中）覆盖；直接删掉第 4 步会让"argv[1] 不可见 + 裸说明符解析失败"的宿主完全失去覆盖。
- **保留 chunk 扫描**：`bundle/index.js` 已经 re-export 同一个 `ExtensionRunner` 对象，扫描只是重复 import 已加载的模块，白付 38ms。

## Consequences

- 启动省下约 900ms，同时不再往内存里塞第二份 pi 模块图。
- 覆盖不变：便宜来源拿不到类时，原来的两条路径（未打包入口 + chunk 扫描）原样保留。
- 判据从"哪份在跑"变成"哪份是缓存命中"，这个不变式在 pi 换入口实现后依然成立；但若 pi 改掉方法名或类身份，替换仍会静默失效（见 ADR-0002 的 Consequences）。
- 验收不能只看耗时——快可能意味着"什么都没 patch 到"。**必须同时确认替换打在了活的那份类上**：探针包装候选类的 `getAllRegisteredTools` 并打印标签，看 session 真正调用的是哪一个。本次验证结果是 bundle 那份。
