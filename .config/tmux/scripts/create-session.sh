#!/usr/bin/env bash
set -euo pipefail

name=$(: | fzf --prompt="Name> " --print-query | head -n 1)

if [[ -n "$name" ]]; then
  tmux new-session -s "$name" -d
fi
