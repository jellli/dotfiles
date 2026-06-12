#!/usr/bin/env bash
# Shared helper functions for tmux fzf scripts.

format_time() {
  local seconds=$1

  local MINUTE_SECONDS=60
  local HOUR_SECONDS=$(( MINUTE_SECONDS * 60 ))
  local DAY_SECONDS=$(( HOUR_SECONDS * 24 ))

  local days=$(( seconds / DAY_SECONDS ))
  local hours=$(( seconds % DAY_SECONDS / HOUR_SECONDS ))
  local minutes=$(( seconds % HOUR_SECONDS / MINUTE_SECONDS ))

  local parts=()
  (( days ))   && parts+=("${days}d")
  (( hours ))  && parts+=("${hours}h")
  (( minutes )) && parts+=("${minutes}m")

  echo "${parts[*]:-0m}"
}
