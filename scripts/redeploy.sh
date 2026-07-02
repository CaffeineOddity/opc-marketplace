#!/usr/bin/env bash
# scripts/redeploy.sh — build / uninstall / install the OPC marketplace plugin.
#
# Usage:
#   bash scripts/redeploy.sh <command> [flags]   # or: ./scripts/redeploy.sh ...
#
# Commands:
#   build       dev build: build dist/ + bump build_number (publish.mjs local --no-register)
#   uninstall   remove opc + opc-official-kits plugins + marketplace registration
#   install     register marketplace + install both plugins (reuses existing dist, no rebuild)
#   flow        uninstall → build → install  (full clean dev redeploy; bumps build_number once)
#               Supports --up / --release (build/flow only):
#               `flow --up <part> --release` bumps the version, then publishes a
#               release tarball (tag=v{version}, no build_number bump) — skips the
#               local install step, since the tarball is for consumers.
#
# Flags (build / flow only):
#   --up <major|minor|patch>   bump the version segment (lower segments reset,
#                              build_number=0) before building. Forwarded to publish.mjs.
#   --release                  publish a release (tarball, tag=v{version}, no build_number
#                              bump) instead of a dev build. Needs `gh auth login`.
#                              With `flow`, skips the local install step.
#
# Examples:
#   # First time, or after a code change — full clean dev redeploy:
#   bash scripts/redeploy.sh flow
#
#   # Dev build only (plugins already registered), then restart Claude Code:
#   bash scripts/redeploy.sh build
#
#   # Bump patch + dev build: 0.1.0 → 0.1.1, then v0.1.1-dev1
#   bash scripts/redeploy.sh build --up patch
#
#   # Cut a real release (bump minor first, then publish tarball v0.2.0;
#   # skips local install since the tarball is for consumers):
#   bash scripts/redeploy.sh flow --up minor --release
#
#   # Re-publish the current version as a release (no version bump):
#   bash scripts/redeploy.sh build --release
#
#   # Reinstall the plugins from existing dist (no rebuild, no bump):
#   bash scripts/redeploy.sh install
#
#   # Tear everything down to test the install/uninstall cycle:
#   bash scripts/redeploy.sh uninstall
#
# `install` registers the marketplace from the local repo path and installs
# `opc` + `opc-official-kits`. Restart Claude Code afterward so the hook and
# MCP servers actually reload.
#
# Version state lives in scripts/version.json ({ version, build_number }) — the
# single source of truth. To bump the version segment, use publish.mjs directly:
#   node scripts/publish.mjs local --up patch   # 0.1.0 → 0.1.1, then dev build
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
#   build            → publish.mjs local --no-register   (dev: build + bump once)
#   build --release  → publish.mjs tarball                (release: tag=v{version}, no bump)
#   install          → publish.mjs local --no-build       (reuse dist, register, NO bump)
# `--up <part>` is forwarded to publish.mjs (bumps version segment, resets
# build_number=0). With `--release` it bumps first, then publishes the release.
# `flow` bumps build_number exactly once (in build), fixing the old double-bump.

# Parse flags off the tail of argv. Sets UP_ARG / RELEASE; leaves CMD as $1.
# --up / --release are only meaningful for `build` and `flow`; reject them on
# `install` / `uninstall` to avoid silent no-ops.
UP_ARG=()
RELEASE=false
CMD="${1:-}"
shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --up)
      [[ $# -lt 2 ]] && die "--up requires a value: major|minor|patch"
      case "$2" in major|minor|patch) ;; *) die "--up must be major|minor|patch (got $2)";; esac
      UP_ARG=(--up "$2"); shift 2 ;;
    --release) RELEASE=true; shift ;;
    -h|--help) CMD="--help"; shift ;;
    *) die "unexpected arg: $1" ;;
  esac
done

if [[ "$CMD" == "install" || "$CMD" == "uninstall" ]]; then
  if [[ "$RELEASE" == "true" || ${#UP_ARG[@]} -gt 0 ]]; then
    die "--up / --release are only valid for build / flow (not $CMD)"
  fi
fi

build_publish_args() {
  # Echoes the publish.mjs args for the build step, honoring --up / --release.
  if [[ "$RELEASE" == "true" ]]; then
    echo tarball "${UP_ARG[@]+"${UP_ARG[@]}"}"
  else
    echo local --no-register "${UP_ARG[@]+"${UP_ARG[@]}"}"
  fi
}

do_build() {
  local args
  # shellcheck disable=SC2207
  args=($(build_publish_args))
  if [[ "$RELEASE" == "true" ]]; then
    step "Release build (publish.mjs ${args[*]})"
  else
    step "Dev build + bump (publish.mjs ${args[*]})"
  fi
  node scripts/publish.mjs "${args[@]}"
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
  # A release flow publishes a tarball for consumers — it does NOT install the
  # plugin into the local claude (the local install is for dev verification).
  if [[ "$RELEASE" != "true" ]]; then
    do_install
  else
    echo "  (release flow: skipping local install — tarball is for consumers)"
  fi
}

# --- dispatch -----------------------------------------------------------------
usage() {
  sed -n '2,45p' "$0"
}

if [[ -z "$CMD" || "$CMD" == "-h" || "$CMD" == "--help" ]]; then
  usage
  [[ -z "$CMD" ]] && exit 1 || exit 0
fi

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
