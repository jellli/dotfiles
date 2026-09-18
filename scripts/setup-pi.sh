#!/usr/bin/env bash
# Pi setup for a fresh machine. Idempotent; safe to re-run for updates.
#
# Baseline (see ../README.md): clone this repo to $HOME, `brew install stow`,
# `stow ~/dotfiles` - that links ~/.pi -> dotfiles/.pi, which carries
# settings.json, extensions/ and everything tracked. This script then restores
# the machine-local pieces that .gitignore deliberately keeps out of git:
# node, the pi package, extension devDeps/builds, package patches, and the
# ~/.agents symlink.
set -euo pipefail

NODE_REQUIRED="24.15.0"                 # fnm default; pi needs >= 22.19.0
PI_PACKAGE="@earendil-works/pi-coding-agent"
EXT_DIR="$HOME/.pi/agent/extensions"
SKILLS_LINK="$HOME/.agents/skills"
SKILLS_TARGET="$HOME/dotfiles/.agents/skills"

say()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[33m%s\033[0m\n' "$*" >&2; }

say "Checking the stowed config"
if [ ! -L "$HOME/.pi" ]; then
  warn "~/.pi is not a symlink into dotfiles. Run: brew install stow && stow ~/dotfiles"
  exit 1
fi
echo "ok: ~/.pi -> $(readlink "$HOME/.pi")"

say "Node $NODE_REQUIRED (fnm)"
if ! command -v fnm >/dev/null 2>&1; then
  warn "fnm not found. brew install fnm, then add 'eval \"\$(fnm env --use-on-cd --shell zsh)\"' to .zshrc (already in the tracked .zshrc)."
  exit 1
fi
fnm install "$NODE_REQUIRED"
fnm default "$NODE_REQUIRED"
node --version

say "pi package (npm)"
npm install -g --ignore-scripts "$PI_PACKAGE"
command -v pi >/dev/null && pi --version
"$HOME/dotfiles/scripts/patch-pi-packages.sh"

say "Extension devDeps + bundles"
if [ ! -d "$EXT_DIR" ]; then
  warn "$EXT_DIR missing - is the repo stowed?"
  exit 1
fi
(cd "$EXT_DIR" && npm install --no-audit --no-fund && npm run build)
for dep in brave-search codegraph ollama-web-fetch; do
  if [ -f "$EXT_DIR/$dep/package-lock.json" ] && [ ! -d "$EXT_DIR/$dep/node_modules" ]; then
    echo "installing $dep deps"
    (cd "$EXT_DIR/$dep" && npm ci --no-audit --no-fund)
  fi
done

say "Skills symlink"
mkdir -p "$(dirname "$SKILLS_LINK")"
if [ -d "$SKILLS_TARGET" ]; then
  ln -sfn "$SKILLS_TARGET" "$SKILLS_LINK"
  echo "ok: $SKILLS_LINK -> $SKILLS_TARGET"
else
  warn "$SKILLS_TARGET missing"
fi

say "Done"
cat <<'EOF'
Still manual, by design:
  * `pi` then /login (or copy ~/.pi/agent/auth.json) - credentials are never in git.
  * First start in a project asks for trust; decisions live in ~/.pi/agent/trust.json.
  * The npm packages listed in settings.json install themselves into
    ~/.pi/agent/npm on first start (needs network + node).
Useful checks:
  pi list                        # configured packages + where they resolve from
  PI_TIMING=1 pi                 # per-extension startup timings
  scripts/patch-pi-packages.sh   # re-run after `pi update`
EOF
