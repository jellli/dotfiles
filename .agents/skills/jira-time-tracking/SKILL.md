---
name: jira-time-tracking
description: 从 git 提交记录生成工时统计表。扫描指定目录下各项目的 git log，按作者筛选、按功能模块拆分任务，输出 MD 格式工时表格。Use when user says "工时"、"工时记录"、"Jira"、"绩效统计"、"提交记录转工时"、"git log 转工时"，或需要从 git 提交生成项目核算报表。
---

# Git 工时记录生成

## 流程概览

1. 扫描项目目录，筛选有 git 修改的项目
2. 按作者筛选提交（默认过滤 merge/changelog 类提交）
3. 按功能模块拆分为独立任务
4. 评估工时（1-4h/任务）
5. 输出 MD 表格

## 步骤

### 1. 扫描有修改的项目

```bash
for dir in */; do
  if [ -d "$dir/.git" ]; then
    count=$(git -C "$dir" log --after="YYYY-MM-DD" --before="YYYY-MM-DD" --oneline 2>/dev/null | wc -l | tr -d ' ')
    [ "$count" -gt "0" ] && echo "$dir: $count commits"
  fi
done
```

### 2. 按作者筛选提交

```bash
# 查看指定作者提交
git -C "$dir" log --after="..." --before="..." --format="%h %ai %s" --author="作者名" --no-merges

# 查看非指定作者（排除用）
git -C "$dir" log --after="..." --before="..." --format="%an: %s" --no-merges | grep -v "作者名"
```

### 3. 查看具体修改内容

```bash
# 查看提交涉及的文件和行数
git -C "$dir" show --stat "$hash"

# 查看版本变更
git -C "$dir" diff "$hash~1" "$hash" -- package.json | grep version
```

### 4. 检查未提交变更

```bash
git -C "$dir" status
git -C "$dir" diff --stat
```

### 5. 检查功能分支

```bash
# 查看分支上的独特提交
git -C "$dir" log master..feature/branch --format="%h %ai %s" --no-merges
```

## 任务拆分规则

### 基本原则
- 每任务对应单一功能点或 bug 修复
- 分支合并操作（merge、rebase）不列为任务
- `chore: changelog`、`CHANGELOG`、`chore: release` 提交不单独列为任务
- 任务名和描述使用中文，清晰明确

### 特殊规则

| 场景 | 处理方式 |
|------|----------|
| package.json 版本更新 | 同一天的版本更新按模块合并为「${模块}上线支持」任务，固定 2h/模块/天 |
| 「格式化」「统一代码风格」类提交 | 合并到时间最近的功能开发/修复任务中 |
| 同一天多个相关 fix 提交 | 合并为同一任务 |
| 模块判断 | 根据核心代码目录/功能模块确定（如 api 层、前端组件库等） |

### 工时评估

| 复杂度 | 工时 | 适用场景 |
|--------|------|----------|
| 简单 | 1-2h | 单文件修改、小 bug 修复、配置调整 |
| 中等 | 2-3h | 多文件修改、功能优化、样式重构 |
| 复杂 | 3-4h | 新功能开发、多模块联动、架构重构 |

**硬性约束：单任务不超过 4 小时**。超过时按提交内容拆分为多个子任务。

### 工时分配原则
- 优先满足单任务 1-4h 规则
- 避免刻意凑工时
- 根据实际代码修改量（文件数、行数）合理评估

## 输出格式

```markdown
## ${项目中文名}（${项目目录名}）

| 工时 | 任务名 | 任务描述 |
|------|--------|----------|
| 3 | 功能名称 | 具体做了什么，涉及哪些模块/文件 |
| 2 | 上线支持（v1.0→v1.1） | 上线内容：xxx功能、xxx修复 |

---

**总工时：XX 小时**
```

## 上线支持任务描述规范

上线支持的任务描述需具体说明本次上线包含的功能内容，例如：

```
| 2 | 主站上线支持（v0.14→v0.15） | 5/20 上线内容：统一搜索结果为"平台收录"文案，提取 CollectHeader 组件复用，优化大数值千/万单位格式化展示 |
```

## 注意事项

- 项目名使用中文
- 版本号使用实际 package.json 中的版本
- 总工时需与各任务工时之和一致
- 输出前用 awk 验证总工时：`grep -E "^\| [0-9]+" file.md | awk -F'|' '{gsub(/ /, "", $2); sum+=$2} END{print sum}'`
