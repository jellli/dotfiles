#!/usr/bin/env bash
# Switch window with inline rename (Ctrl+r stays in fzf)
# Uses fzf native --tmux popup (requires fzf >= 0.53.0)

current_window=$(tmux display-message -p '#S:#I:')
windows=$(tmux list-windows -a)
windows=$(echo "$windows" | grep -v "^$current_window")

result=$(echo "$windows" | \
  fzf --tmux center,62%,38% \
      --header='Enter=switch  Ctrl-r=rename (stays open)' \
      --preview='tmux capture-pane -ep -t $(echo {} | cut -d: -f1,2)' \
      --preview-window='follow' \
      --bind='ctrl-r:execute-silent(tmux command-prompt -I {1} "rename-window -t {1} %%")')

[ -z "$result" ] && exit
target=$(echo "$result" | cut -d: -f1,2)
target_ses=$(echo "$target" | cut -d: -f1)
tmux switch-client -t "$target_ses"
tmux select-window -t "$target"
