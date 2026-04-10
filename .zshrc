TPM_HOME="${XDG_DATA_HOME:-${HOME}}/.tmux/plugins/tpm"
if [ ! -d "$TPM_HOME" ]; then
   mkdir -p "$(dirname $TPM_HOME)"
   git clone https://github.com/tmux-plugins/tpm "$TPM_HOME"
fi

local ZAP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/zap"
if [[ -f "${ZAP_DIR}/zap.zsh" ]]; then
  source "${ZAP_DIR}/zap.zsh"
else
  eval "$(curl -s https://raw.githubusercontent.com/zap-zsh/zap/master/install.zsh)" --branch release-v1
fi

plug "zsh-users/zsh-autosuggestions"
plug "zsh-users/zsh-syntax-highlighting"
plug "starship/starship" >> /dev/null

autoload -U compinit; compinit

bindkey -v
bindkey '^f' autosuggest-accept

eval "$(starship init zsh)"
eval "$(zoxide init zsh)"
source <(fzf --zsh)

setopt append_history inc_append_history share_history 

# Aliases
alias ls='ls --color'
alias vim='nvim'
alias c='clear'
alias lg='lazygit'
alias cd='z'
alias t='tmux'
alias nvm='fnm'
alias setproxy='export all_proxy=http://127.0.0.1:7890'
