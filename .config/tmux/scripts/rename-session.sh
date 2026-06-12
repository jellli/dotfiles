#!/usr/bin/env bash
set -euo pipefail

session_id=$(echo "$1" | awk '{print $1}')
session_name=$(echo "$1" | awk '{print $2}')

output=$(echo "$1" | \
  fzf \
  --disabled \
  --prompt="Rename> " \
  --query="$session_name" \
  --print-query)

new_name=$(echo "$output" | head -n 1)
if [[ -n "$new_name" ]]; then
  tmux rename-session -t "$session_id" "$new_name"
fi
