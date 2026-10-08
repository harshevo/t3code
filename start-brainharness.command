#!/bin/bash
set -euo pipefail
brain_root="$(cd "$(dirname "$0")" && pwd)"
brain_node="${BH_NODE_BINARY:-}"
if [[ -z "$brain_node" ]]; then
  brain_node="$(command -v node || true)"
fi
if [[ -z "$brain_node" || "$("$brain_node" -p 'process.versions.node.split(".")[0]')" != "24" ]]; then
  if [[ -f "$HOME/.nvm/nvm.sh" ]]; then
    source "$HOME/.nvm/nvm.sh"
    nvm use 24 >/dev/null
    brain_node="$(command -v node)"
  else
    echo 'BrainHarness requires Node 24. Install it or set BH_NODE_BINARY.' >&2
    exit 1
  fi
fi
brain_app="$brain_root/apps/brainharness/src-tauri/target/debug/brainharness-desktop"
if [[ ! -x "$brain_app" ]]; then
  echo 'Run pnpm run build:brainharness in this checkout first.' >&2
  exit 1
fi
export BH_NODE_BINARY="$brain_node"
exec "$brain_app"
