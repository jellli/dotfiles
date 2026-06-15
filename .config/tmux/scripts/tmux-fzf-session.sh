#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/helper.sh"

LIST_SESSION="$SCRIPT_DIR/list-session.sh"
RENAME_SESSION="$SCRIPT_DIR/rename-session.sh"
KILL_SESSION="$SCRIPT_DIR/kill-session.sh"
CREATE_SESSION="$SCRIPT_DIR/create-session.sh"
result=$(fzf \
  --popup=border-native,90%,90% \
  --no-sort \
  --preview='tmux capture-pane -ep -t {1}' \
  --preview-window='bottom:70%' \
  --bind="start:reload($LIST_SESSION)" \
  --bind="ctrl-r:execute($RENAME_SESSION {})+clear-query+reload($LIST_SESSION)" \
  --bind="ctrl-x:execute($KILL_SESSION {})+reload($LIST_SESSION)" \
  --bind="ctrl-s:execute($CREATE_SESSION)+reload($LIST_SESSION)") || true

session_id=$(echo "$result" | awk '{print $1}')

if [[ -n "$session_id" ]]; then
  tmux switch-client -t "$session_id"
fi
