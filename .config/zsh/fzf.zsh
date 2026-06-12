_gen_fzf_default_opts() {

# local color00='#202020'
# local color01='#2a2827'
local color02='#504945'
local color03='#5a524c'
local color04='#bdae93'
local color05='#ddc7a1'
local color06='#ebdbb2'
local color07='#fbf1c7'
local color08='#ea6962'
local color09='#e78a4e'
local color0A='#d8a657'
local color0C='#89b482'
local color0D='#7daea3'
local color0E='#d3869b'
local color0F='#bd6f3e'

export FZF_DEFAULT_OPTS="--color=bg+:-1,bg:-1,spinner:$color0C,hl:$color0D"\
" --color=fg:$color04,header:$color0D,info:$color0A,pointer:$color0C"\
" --color=marker:$color0C,fg+:$color06,prompt:$color0A,hl+:$color0D"\
" --info=inline-right --highlight-line --layout=reverse"\
" --style=full:line"
}

_gen_fzf_default_opts
# Ctrl+O: fzf find dir & cd
_fzf_cd_widget() {
  local dir
  dir=$(zoxide query -l \
    | fzf \
    --preview="ls --color {}" \
    --layout=reverse \
    --height=60% \
    --tmux center,80%,80%) 
    if [[ -n "$dir" && -d "$dir" ]]; then
      cd "$dir" || return
      zle reset-prompt
    fi
}
# Ctrl+P: fzf find file & open in nvim
_fzf_nvim_widget() {
  local file
  file=$(fd \
  --type f --hidden --follow --exclude .git \
  | fzf \
  --ansi \
  --preview 'bat --color=always -p --line-range=:100 {}' \
  --layout=reverse \
  --height=60% \
  --tmux center,80%,80% \
  --header="Open file in nvim" \
  )
  if [[ -f "$file" ]]; then 
    nvim "$file" || return
    zle reset-prompt
  fi
}
_fzf_rg_widget() (
  local RELOAD='reload:rg --column --color=always --smart-case {q} || :'
  local result=$(fzf --disabled --ansi --multi \
      --bind "start:$RELOAD" --bind "change:$RELOAD" \
      --bind 'alt-a:select-all,alt-d:deselect-all,ctrl-/:toggle-preview' \
      --delimiter : \
      --preview 'bat --style=full --color=always --highlight-line {2} {1}' \
      --preview-window '~4,+{2}+4/3,<80(up)' \
      --query "$*")
  if [[ $FZF_SELECT_COUNT -eq 0 ]]; then
    nvim {1} +{2}     # No selection. Open the current line in Vim.
  else
    nvim +cw -q {+f}  # Build quickfix list for the selected items.
  fi
)
_fzf_npm_task_runner_widget() {
  if [[ -f ./package.json ]]; then
    jq  ".scripts" package.json | jq -r 'to_entries[] | "\(.key)\t\(.value)"' | fzf \
      --delimiter $'\t' \
      --preview "echo {2}" \
      --preview-window down:wrap \
      --with-nth 1 --nth 1 \
      --bind 'enter:become:(nr {1})' \
      --prompt 'nr ' \
      --height '40%'
  else
    echo "No package.json found"
    return
  fi
  
}
_fzf_project_widget() {
  local dir
  output=$(zoxide query -l | \
    awk -F/ '{printf "%3d %-40s %s\n", NR, $NF, $0} BEGIN {printf "%3s %-40s %s\n", "#", "Project", "Path"}' | \
    fzf \
    --popup \
    --border=sharp \
    --expect=ctrl-t,enter \
    --header-lines=1 \
    --footer="C-t: open in tmuxinator"
  )
  key=$(head -n 1 <<< "$output")
  selected=$(tail -1 <<< "$output")
  if [[ "$key" == "ctrl-t" ]]; then
    dir=$(echo "$selected" | awk '{print $3}')
    name=$(echo "$selected" | awk '{print $2}')
    tmuxinator start frontend workspace="$dir" name="$name" || return
  elif [[ "$key" == "enter" ]]; then
    dir=$(echo "$selected" | awk '{print $3}')
    cd "$dir" 
    zle reset-prompt
  fi
}

zle -N _fzf_project_widget
zle -N _fzf_cd_widget
zle -N _fzf_rg_widget
zle -N _fzf_npm_task_runner_widget
bindkey '^P' _fzf_project_widget
bindkey '^O' _fzf_cd_widget
bindkey '^S' _fzf_rg_widget
bindkey '^N' _fzf_npm_task_runner_widget

