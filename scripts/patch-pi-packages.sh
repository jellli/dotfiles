#!/usr/bin/env bash
# Local patches for installed pi packages (idempotent; re-run after `pi update`).
#
# pi-blackhole ships a self-contained tsup bundle at dist/index.js and points
# `main` at it, but its `pi.extensions` manifest lists ./index.ts, so pi loads
# 105 unbundled TS modules instead of that bundle. Measured on 0.5.3 / pi 0.85.1
# (PI_TIMING, median of 3): module import 321ms -> 29ms,
# createAgentSessionRuntime 927ms -> 707ms, first render 1.37s -> 1.16s.
#
# The manifest lives in ~/.pi/agent/npm (machine-local, rewritten by `pi update`),
# hence this script: run it from scripts/setup-pi.sh or by hand.
set -euo pipefail

AGENT_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
PKGS_DIR="$AGENT_DIR/npm/node_modules"

patch_entry() {
  local pkg="$1" target="$2" dir="$PKGS_DIR/$1"
  [ -f "$dir/package.json" ] || { echo "skip $pkg (not installed)"; return 0; }
  [ -f "$dir/$target" ] || { echo "skip $pkg (missing $target)"; return 0; }
  node -e '
    const fs = require("node:fs");
    const [path, target] = process.argv.slice(1);
    const doc = JSON.parse(fs.readFileSync(path, "utf8"));
    const current = doc.pi?.extensions?.[0];
    if (current === target) { console.log("ok  " + doc.name + " -> " + target); process.exit(0); }
    doc.pi = { ...doc.pi, extensions: [target] };
    fs.writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
    console.log("patched " + doc.name + ": " + current + " -> " + target);
  ' "$dir/package.json" "$target"
}

# pi-blackhole: use the bundle the package itself builds and ships.
patch_entry pi-blackhole ./dist/index.js
