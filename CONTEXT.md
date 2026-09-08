# dotfiles

个人开发环境配置仓库：nvim / shell / pi 配置与扩展。
代码知识图谱：`.pi/agent/extensions/codegraph/`（pi 的 codegraph 扩展，见 `plans/pi-codegraph-selfimpl.md`）。

## Language

**CodeGraph 索引（index）**:
项目根 `.codegraph/` 目录中的 SQLite 代码知识图谱（codegraph.db）。由 codegraph 引擎维护，目录自带自守 gitignore（内容 `*` + `!.gitignore`），永不入库。
_Avoid_: 索引缓存、graph db

**项目根（project root）**:
`findNearestCodeGraphRoot` 从 cwd 逐级向上找到的最近一个含 `.codegraph/` 的目录；monorepo 下每个子项目各有自己的根。

**未索引项目（unindexed project）**:
没有任何祖先目录含 `.codegraph/` 的项目。工具命中时的默认动作：交互式请求用户确认后自动初始化并全量索引；拒绝或非交互（pi -p）则回退 grep/read 引导文案。

**相关上下文（explore 输出）**:
`codegraph_explore` 返回的 markdown——相关符号逐字源码 + 调用路径 + 入口点。来自引擎 buildContext 黑盒，非自研检索。
_Avoid_: blast radius（那是 `codegraph_impact` 的职责，勿混用）

**影响半径（impact radius）**:
改动某符号会波及的全部下游（`codegraph_impact` 工具；引擎原语 getImpactRadius）。

**Todo 阶段状态**:
由多个阶段及其任务组成的工作状态。每个任务处于一种明确状态，并且同一时刻最多有一个任务处于进行中。
_Avoid_: Todo 列表、任务清单

**集成层 / 引擎边界（integration layer / engine boundary）**:
本扩展的设计原则——codegraph 引擎（检索/排序/同步）是完全信任的黑盒，扩展只做 pi 集成层：生命周期管理、工具接线、输出防御、交互（confirm/notify/status）。
