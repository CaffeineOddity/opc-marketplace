#!/usr/bin/env bash
# scripts/redeploy.sh — build / uninstall / install the OPC marketplace plugin.
#
# Each step is independently runnable. Pick one:
#
#   bash scripts/redeploy.sh build        # build → dist/v0.1.0-devN/  (matches install's versioning)
#   bash scripts/redeploy.sh uninstall    # remove plugins + marketplace registration
#   bash scripts/redeploy.sh install      # register marketplace + install both plugins
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
# `build` runs the release build directly (via build-release.mjs) so the
# versioned dir matches what `install` produces — no orphan dist/local/ dir.
# We mirror publish.mjs's local-version counter so devN keeps climbing.
next_dev_version() {
  local counter=0
  if [[ -f .opc/publish-local-counter ]]; then
    counter="$(cat .opc/publish-local-counter | tr -d '[:space:]')"
    counter="${counter:-0}"
  fi
  # also honor any existing v0.1.0-devN git tags so numbers never collide
  local max_tag=0 t
  while read -r t; do
    if [[ "$t" =~ ^v0\.1\.0-dev([0-9]+)$ ]]; then
      (( BASH_REMATCH[1] > max_tag )) && max_tag="${BASH_REMATCH[1]}"
    fi
  done < <(git tag -l 'v0.1.0-dev*' 2>/dev/null)
  local n=$(( counter > max_tag ? counter : max_tag ))
  n=$(( n + 1 ))
  echo "v0.1.0-dev${n}"
}

bump_local_counter() {
  local n="$1"
  mkdir -p .opc
  echo "$n" > .opc/publish-local-counter
}

do_build() {
  local tag
  tag="$(next_dev_version)"
  local n="${tag##v0.1.0-dev}"
  step "Building dist/${tag}/ (OPC_RELEASE_VERSION=${tag})"
  OPC_RELEASE_VERSION="$tag" pnpm build
  bump_local_counter "$n"
  ok "build done → dist/${tag}/"
}

do_uninstall() {
  step "Full uninstall (plugins + marketplace)"
  # publish.mjs uninstall removes opc + opc-official-kits (+ legacy opc/official-kits)
  # and deregisters the opc-marketplace. Safe to re-run when already removed.
  node scripts/publish.mjs uninstall
  ok "uninstalled"
}

do_install() {
  step "Registering local marketplace"
  # `local` runs pnpm build then registers the marketplace from the repo path.
  node scripts/publish.mjs local
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
