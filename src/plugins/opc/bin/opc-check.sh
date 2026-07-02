#!/usr/bin/env bash
# src/plugins/opc/bin/opc-check.sh
#
# OPC SessionStart hook — runs ONCE per Claude Code session start.
# Installed per-project by `/opc init` into the project's
# .claude/settings.json (project-scoped), next to the UserPromptSubmit
# opc-hook.sh. Lives as a local copy at <project>/.opc/bin/opc-check.sh.
#
# Purpose: detect that the project's local OPC copies drifted from the
# installed plugin after a `claude plugin install` upgrade, and nudge the user
# to re-run `/opc init`. Checks TWO things:
#
#   (a) opc-hook.sh  — the per-message hook script copy under .opc/bin/.
#   (b) phases/ + scenarios/ — the built-in resource copies under .opc/.
#
# For (a) it compares the local copy against every cached plugin version's
# hook (the active version is among them); a match means current.
# For (b) it spot-checks phase.md / scenario files by content hash against the
# cache; the authoritative three-way merge + .conflict handling lives in
# opc-init.mjs — this hook only NUDGES, never repairs. Conflicts already
# produced by a prior init are visible as *.conflict files the user resolves;
# this check does not re-derive them.
#
# Stale → print a one-line nudge; never blocks the session (exit 0 always).
#
# Inputs (env, set by Claude Code hook runtime):
#   CLAUDE_PROJECT_DIR — absolute path to the project (.opc/ root)
#
# Behaviour:
#   1. plugin cache missing       → silent (plugin not installed via cache; skip)
#   2. opc-hook.sh copy missing   → nudge to run /opc init
#   3. opc-hook.sh matches a cache version → good
#   4. opc-hook.sh matches none   → nudge
#   5. phases/scenarios drift     → nudge (separate line)
# Never fails — exit 0 unconditionally.

set -u

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-${PWD}}"
PROJECT_HOOK="${PROJECT_DIR}/.opc/bin/opc-hook.sh"
PROJECT_PHASES="${PROJECT_DIR}/.opc/phases"
PROJECT_SCENARIOS="${PROJECT_DIR}/.opc/scenarios"
CACHE_ROOT="${HOME}/.claude/plugins/cache/opc-marketplace/opc"

NUDGE='OPC: hook 已过期（插件已升级）。请在当前项目重新运行 /opc init 刷新 .opc/bin/ 下的 hook 副本，再重启 Claude Code。'

# If the plugin cache is absent we can't compare anything; assume fine, stay silent.
if [ ! -d "$CACHE_ROOT" ]; then
  exit 0
fi

need_nudge=0

# --- (a) opc-hook.sh staleness -------------------------------------------------
# 1. project hook copy missing → nudge (init was never fully run, or copy got removed)
if [ ! -f "$PROJECT_HOOK" ]; then
  printf '%s\n' "$NUDGE"
  need_nudge=1
else
  # 2/3. compare project copy against every cached version's hook. A match means
  # the copy is current with SOME installed version — good enough (the active
  # version is among them). No match across all → stale.
  hook_stale=1
  for v in "$CACHE_ROOT"/*/bin/opc-hook.sh; do
    [ -f "$v" ] || continue
    if cmp -s "$PROJECT_HOOK" "$v"; then
      hook_stale=0
      break
    fi
  done
  if [ "$hook_stale" -eq 1 ]; then
    printf '%s\n' "$NUDGE"
    need_nudge=1
  fi
fi

# --- (b) phases/scenarios drift ------------------------------------------------
# Compare the project's seeded resource dirs against each cached plugin version's
# phases/+scenarios/. If the project's tree matches SOME cached version, it's
# current; if it matches none, the bundle shipped a newer phases/scenarios and
# the user should re-run /opc init to merge. Best-effort: skip silently if the
# project was never seeded (no .opc/phases) — that's a /opc init gap, not drift.
if [ -d "$PROJECT_PHASES" ]; then
  res_stale=1
  for v in "$CACHE_ROOT"/*/; do
    cached_phases="${v}phases"
    cached_scenarios="${v}scenarios"
    [ -d "$cached_phases" ] || continue
    # diff -r: recursive, exit 0 only if identical. -q: quiet (names only).
    if diff -rq "$PROJECT_PHASES" "$cached_phases" >/dev/null 2>&1 \
       && { [ ! -d "$PROJECT_SCENARIOS" ] || diff -rq "$PROJECT_SCENARIOS" "$cached_scenarios" >/dev/null 2>&1; }; then
      res_stale=0
      break
    fi
  done
  if [ "$res_stale" -eq 1 ]; then
    printf '%s\n' 'OPC: .opc/phases 或 scenarios 与已安装插件不一致（插件可能已升级）。请重新运行 /opc init 以合并更新（本地改动会以 .conflict 形式保留）。'
    need_nudge=1
  fi
fi

exit 0

