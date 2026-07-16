#!/bin/sh
# scripts/dev.sh — dev build + update local plugins (fast inner loop).
#
# What it does:
#   1. Build dist/ + bump build_number  (publish.mjs local --no-register)
#   2. Re-register the local marketplace so `source` picks up the new dist/
#      (publish.mjs local --no-build, no bump)
#   3. Update both plugins via `claude plugin update` (re-reads dist/)
#   4. Print the version + reminder to restart Claude Code
#
# It is the minimal "build → update" loop: build once, bump once, point the
# marketplace at the fresh dist, then have claude re-pull it. No uninstall, no
# `marketplace add` from scratch unless the marketplace isn't registered yet
# (handled automatically below).
#
# Usage:
#   sh scripts/dev.sh                 # build + update local plugins
#   sh scripts/dev.sh --up patch      # 0.1.0 → 0.1.1 first, then dev build
#   sh scripts/dev.sh --no-bump       # build WITHOUT bumping build_number
#                                       (use only if you skipped code changes)
#
# Exit non-zero on any step failure.
# POSIX sh — no bash-only syntax ([[ ]], arrays, ${arr[@]}).

set -eu

# --- resolve repo root (script lives in <root>/scripts/) ----------------------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

MARKETPLACE="opc-marketplace"
PLUGINS="opc opc-official-kits"

# --- helpers ------------------------------------------------------------------
step() { printf "\n\033[1;36m▶ %s\033[0m\n" "$*"; }
ok()   { printf "  \033[32m✓\033[0m %s\n" "$*"; }
die()  { printf "  \033[31m✗\033[0m %s\n" "$*" >&2; exit 1; }

# --- parse flags --------------------------------------------------------------
UP_ARG=""
NO_BUMP=false
while [ $# -gt 0 ]; do
  case "$1" in
    --up)
      [ $# -lt 2 ] && die "--up requires a value: major|minor|patch"
      case "$2" in major|minor|patch) ;; *) die "--up must be major|minor|patch (got $2)";; esac
      UP_ARG="--up $2"; shift 2 ;;
    --no-bump) NO_BUMP=true; shift ;;
    -h|--help) sed -n '2,26p' "$0"; exit 0 ;;
    *) die "unexpected arg: $1" ;;
  esac
done

# --- 1. build + bump ----------------------------------------------------------
# publish.mjs local --no-register: build dist/<version>/ + bump build_number +
# rewrite the marketplace.json `source` pointers. No claude-side registration.
if [ "$NO_BUMP" = "true" ]; then
  die "--no-bump is not supported with a build; use scripts/redeploy.sh install to reuse dist."
fi
step "Dev build + bump (publish.mjs local --no-register ${UP_ARG})"
# shellcheck disable=SC2086  # intentional word-splitting of UP_ARG into 0 or 2 tokens
node scripts/publish.mjs local --no-register $UP_ARG
ok "build done"

# --- read the version we just built -------------------------------------------
VERSION="$(node -e "console.log(require('./scripts/version.json').version)")"
BUILD_NUMBER="$(node -e "console.log(require('./scripts/version.json').build_number)")"
TAG="v${VERSION}-dev${BUILD_NUMBER}"
ok "version: ${TAG}"

# --- 2. re-register the local marketplace -------------------------------------
# publish.mjs local --no-build reuses the dist we just built (no bump) and runs
# `claude plugin marketplace add` (after removing a stale registration) so the
# marketplace's `source` pointers resolve to the fresh dist/<version>/.
step "Re-register local marketplace (publish.mjs local --no-build)"
node scripts/publish.mjs local --no-build
ok "marketplace registered"

# --- 3. update / install plugins ----------------------------------------------
# If a plugin was never installed (fresh setup), `update` is a no-op — install
# it instead so a first run works end to end.
step "Update / install plugins"
for p in $PLUGINS; do
  if claude plugin list 2>/dev/null | grep -q "^${p} "; then
    claude plugin update "$p" && ok "updated ${p}"
  else
    claude plugin install "$p" && ok "installed ${p}"
  fi
done

# --- done ---------------------------------------------------------------------
echo
printf "\033[1;32m✓ dev.sh complete — %s\033[0m\n" "$TAG"
echo "Next: restart Claude Code so the hook + MCP servers reload, then verify:"
echo "  /plugin      → opc + opc-official-kits both ✔ enabled"
echo "  /mcp         → opc-state / opc-knowledge / opc-reflection servers"
echo "  /opc-status  → health snapshot"
