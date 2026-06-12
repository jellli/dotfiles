#!/usr/bin/env bash
set -euo pipefail

session_id=$(echo "$1" | awk '{print $1}')
session_name=$(echo "$1" | awk '{print $2}')

selected=$(cat <<EOF | fzf --prompt="Kill session '$session_name'? " --expect=enter --height=4
yes
no
EOF
)

# --expect=enter puts empty line on first line (enter pressed)
# selected's second line is the highlighted option
choice=$(echo "$selected" | sed -n '2p')

if [[ "$choice" == "yes" ]]; then
  tmux kill-session -t "$session_id"
fi
