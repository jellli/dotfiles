#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/helper.sh"

now=$(date +%s)
while IFS='|' read -r s_id s_name s_windows s_activity s_last_attached s_created; do
  ref="${s_last_attached:-0}"
      (( ref == 0 )) && ref="$s_created"
      (( ref < 0 )) && ref=0
  age_secs=$((now - ref))
  (( age_secs < 0 )) && age_secs=0
  uptime_secs=$((now - s_created))
  (( uptime_secs < 0 )) && uptime_secs=0

  printf '%4s %-25.25s %7s %26.26s %26.26s\n' \
    $s_id \
  "$s_name" \
  $s_windows \
  "$(format_time "$age_secs") ago" \
  "$(format_time "$uptime_secs")"
done < <(tmux list-sessions -F '#{session_id}|#{session_name}|#{session_windows}|#{session_activity}|#{session_last_attached}|#{session_created}')
