safe_load() {
    if command -v "$1" >/dev/null 2>&1; then
        eval "$2"
    else
        echo "Notice: $1 is not installed, skipping..."
    fi
}
# Aliases
alias ls='ls --color'
alias vim='nvim'
alias c='clear'
alias lg='lazygit'
alias cd='z'
alias t='tmux'
alias nvm='fnm'
alias Proxy='all_proxy=http://127.0.0.1:7890'

DATA_HOME="${XDG_DATA_HOME:-${HOME}}"

ANTIDOTE_DIR="${DATA_HOME}/.antidote"
if [[ ! -d "$ANTIDOTE_DIR" ]]; then
  echo "Initializing Antidote..."
  Proxy git clone --depth=1 https://github.com/mattmc3/antidote.git "$ANTIDOTE_DIR"
fi

source "$ANTIDOTE_DIR/antidote.zsh"
antidote load

TPM_HOME="${DATA_HOME}/.tmux/plugins/tpm"
if [ ! -d "$TPM_HOME" ]; then
   mkdir -p "$(dirname $TPM_HOME)"
   git clone https://github.com/tmux-plugins/tpm "$TPM_HOME"
fi

autoload -U compinit; compinit

bindkey -v
bindkey '^f' autosuggest-accept
bindkey '^[[A' history-substring-search-up
bindkey '^[[B' history-substring-search-down

safe_load "starship" 'eval "$(starship init zsh)"'
safe_load "fnm"      'eval "$(fnm env --use-on-cd --shell zsh)"'
safe_load "zoxide"   'eval "$(zoxide init zsh)"'
safe_load "fzf"      'source <(fzf --zsh)'
setopt append_history inc_append_history share_history 
export KEYTIMEOUT=1
