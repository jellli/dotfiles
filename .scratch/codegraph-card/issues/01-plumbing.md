# 01 — 前置件：codegraph 的 tsconfig 与测试 harness

**Status:** done

codegraph 目前解析不到 `@earendil-works/pi-tui`（`codegraph/tsconfig.json` 无 `paths`，解析链里也没有这个包），测试 harness 又用着自己硬编码 `PI_ROOT` 与无 alias 的 jiti。两件事都在拦住 02。本票单独提交，提交前 codegraph 的卡片代码一字不动。

## 任务

- [x] `codegraph/tsconfig.json`：加 `extends: "../tsconfig.json"`，`compilerOptions` 只留它真正需要覆盖的项（`include` 必须保留），删掉与根 tsconfig 重复的字段。
- [x] `include` 覆盖 `./index.ts` 与 `./tools.ts`；02 若在 codegraph 下新开卡片文件，一并加进来（把卡片代码留在 `tools.ts` 则不用改）。
- [x] `codegraph/test/harness.mjs`：改用 `../test/jiti-setup.mjs` 的 `createTestJiti(extensionsDir)`，删掉本文件里的 `PI_ROOT` 常量与自己的 `createJiti(...)` 调用。`@colbymchenry/codegraph` 与 `typebox` 的解析不要动（共享模块已经处理 typebox；codegraph 是纯 CJS，走 `createRequire`）。
- [x] 确认 `harness.mjs` 里不再出现 `node-versions` 这类硬编码安装路径。

## 验收

- [x] 先在 extensions 目录跑一次 `./tsgo`（生成被 gitignore 的根 tsconfig），再跑 `PATH=/Users/hoon/.local/share/fnm/node-versions/v24.4.1/installation/bin:$PATH ./tsgo -p codegraph/tsconfig.json`，exit 0。
- [x] **真正的证明**：临时在 `codegraph/tools.ts` 顶部加 `import { toolCard } from "../card/tool-card.js";`（并在某处引用它，避免被优化掉），上面那条命令仍然 exit 0；然后删掉临时 import，再确认 exit 0。这条证明 `@earendil-works/pi-tui` 从此可解析 —— 也就是本票唯一的目的。
- [x] `node codegraph/test/harness.mjs` 全绿（与改动前同样的通过数）。
- [x] 本票的提交里没有 codegraph 的卡片代码改动（`git show --stat` 只应出现 tsconfig 与 harness）。

## Comments

- 2026-09-16 完成（提交 b77d06c）。`codegraph/tsconfig.json` 现在 `extends: "../tsconfig.json"`，只剩 `include`（`./index.ts`、`./tools.ts`）；重复的 `compilerOptions` 与 `types: ["node"]` 都删掉后 `tsgo -p codegraph/tsconfig.json` 仍 exit 0 —— 根 tsconfig 的 `paths` 把 `@earendil-works/pi-tui` 指到 pi 自带的 d.ts，node 类型由解析链里的 `@types/node` 自动带上。

  验证：临时在 `tools.ts` 顶部加 `import { toolCard } from "../card/tool-card.js";` 后 `tsgo -p codegraph/tsconfig.json` exit 0，删掉后再跑仍 exit 0。`node codegraph/test/harness.mjs` 39 个 PASS、ALL PASS（与改动前同数），且不再出现 `PI_ROOT` 或 `node-versions` 字面量 —— harness 现在从 `../../test/jiti-setup.mjs` 拿 `createTestJiti`，`EXT_DIR` 由 `import.meta.url` 推出。

  一处与票面的偏差：共享模块相对 harness 是 `../../test/jiti-setup.mjs`（harness 在 `codegraph/test/` 下），票里写的 `../test/jiti-setup.mjs` 少一层。

- 2026-09-16 开票。来源：架构评审 candidate 02 + grilling Q17/Q18/Q23。`.scratch/tool-card-module/spec.md` 的「非目标」里记过同一条 TS2307，本票把它关掉。
