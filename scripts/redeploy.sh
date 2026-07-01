#!/usr/bin/env bash
# scripts/redeploy.sh — build / uninstall / install the OPC marketplace plugin.
#
# Each step is independently runnable. Pick one:
#
#   bash scripts/redeploy.sh build        # build → dist/v{version}-devN/  (publish.mjs local --no-register)
#   bash scripts/redeploy.sh uninstall    # remove plugins + marketplace registration
#   bash scripts/redeploy.sh install      # register marketplace + install both plugins (no rebuild)
#   bash scripts/redeploy.sh flow         # uninstall → build → install  (full clean redeploy)
#
# `install` registers the marketplace from the local repo path and installs
# `opc` + `opc-official-kits`. Restart Claude Code afterward so the hook and
# MCP servers actually reload.
#
# Exit non-zero on any step failure.

set -euo pipefail

# --- resolve repo root (script lives in <root>/scripts/) ----------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

# --- helpers ------------------------------------------------------------------
step() { printf "\n\033[1;36m▶ %s\033[0m\n" "$*"; }
ok()   { printf "  \033[32m✓\033[0m %s\n" "$*"; }
die()  { printf "  \033[31m✗\033[0m %s\n" "$*" >&2; exit 1; }

# --- subcommands --------------------------------------------------------------
# Version logic lives in scripts/version.json ({ version, build_number }) — the
# single source of truth, owned by publish.mjs (see scripts/version.mjs). This
# script does NOT duplicate any version math; it delegates to publish.mjs:
#   build   → publish.mjs local --no-register   (build + bump once + pointer, no claude)
#   install → publish.mjs local --no-build       (reuse dist, register, NO bump)
# `flow` therefore bumps build_number exactly once (in build), fixing the old
# double-bump bug.

do_build() {
  step "Building + bumping (publish.mjs local --no-register)"
  node scripts/publish.mjs local --no-register
  ok "build done"
}

do_uninstall() {
  step "Full uninstall (plugins + marketplace)"
  # publish.mjs uninstall removes opc + opc-official-kits (+ legacy opc/official-kits)
  # and deregisters the opc-marketplace. Safe to re-run when already removed.
  node scripts/publish.mjs uninstall
  ok "uninstalled"
}

do_install() {
  step "Registering local marketplace (reuse existing dist, no bump)"
  # --no-build: reuse the dist built by `build`; publish.mjs does NOT bump
  # build_number (a bump corresponds to a fresh build).
  node scripts/publish.mjs local --no-build
  ok "marketplace registered"

  step "Installing plugins"
  claude plugin install opc
  claude plugin install opc-official-kits
  ok "plugins installed"
}

do_flow() {
  do_uninstall
  do_build
  do_install
}

# --- dispatch -----------------------------------------------------------------
usage() {
  sed -n '2,16p' "$0"
}

CMD="${1:-}"
[[ -z "$CMD" || "$CMD" == "-h" || "$CMD" == "--help" ]] && { usage; [[ -z "$CMD" ]] && exit 1 || exit 0; }
[[ $# -gt 1 ]] && die "unexpected extra args: ${*:2}"

case "$CMD" in
  build)     do_build ;;
  uninstall) do_uninstall ;;
  install)   do_install ;;
  flow)      do_flow ;;
  *) die "unknown command: $CMD (valid: build | uninstall | install | flow)" ;;
esac

# --- done ---------------------------------------------------------------------
echo
printf "\033[1;32m✓ %s complete.\033[0m\n" "$CMD"
if [[ "$CMD" == "flow" || "$CMD" == "install" ]]; then
  echo "Next: restart Claude Code, then verify in a fresh project dir:"
  echo "  /plugin      → opc + opc-official-kits both ✔ enabled"
  echo "  /mcp         → opc-state / opc-knowledge / opc-reflection servers"
  echo "  /opc-status  → health snapshot"
fi
