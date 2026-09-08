#!/bin/bash
# 验证工时记录文件
# Usage: bash validate.sh <task.md>

FILE="${1:-task.md}"

if [ ! -f "$FILE" ]; then
  echo "❌ 文件不存在: $FILE"
  exit 1
fi

# 总工时
total=$(grep -E "^\| [0-9]+" "$FILE" | awk -F'|' '{gsub(/ /, "", $2); sum+=$2} END{print sum}')
count=$(grep -E "^\| [0-9]+" "$FILE" | wc -l | tr -d ' ')

echo "📊 总工时: ${total} 小时, 共 ${count} 个任务"

# 检查超过4小时的任务
over=$(awk '/^\| [0-9]/{gsub(/[^0-9]/,"",$2); if($2>4) print $2}' "$FILE" | wc -l | tr -d ' ')
if [ "$over" -gt "0" ]; then
  echo "⚠️  发现 ${over} 个超过4小时的任务:"
  awk '/^\| [0-9]/{gsub(/[^0-9]/,"",$2); if($2>4) printf "  %dh: %s\n", $2, $3}' "$FILE"
else
  echo "✅ 所有任务均 ≤4 小时"
fi

# 检查总工时是否与文件中声称的一致
claimed=$(grep -o '总工时：[0-9]*' "$FILE" | grep -o '[0-9]*')
if [ -n "$claimed" ] && [ "$total" != "$claimed" ]; then
  echo "⚠️  总工时不一致: 实际=${total}h, 声称=${claimed}h"
else
  echo "✅ 总工时一致: ${total}h"
fi

# 按模块统计
echo ""
echo "📋 模块明细:"
awk '
/^## /{section=$0; gsub(/^## /,"",section); next}
/^\| [0-9]/{gsub(/[^0-9]/,"",$2); s[section]+=$2; c[section]++}
END{for(k in s) printf "  %-40s %3dh (%d tasks)\n", k, s[k], c[k]}
' "$FILE" | sort
