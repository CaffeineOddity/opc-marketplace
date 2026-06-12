#!/usr/bin/env bash
# src/plugins/opc/bin/opc-hook.sh
#
# OPC UserPromptSubmit hook (v1 quiet default per host-contract §2.6 / A2).
#
# Inputs (env, set by Claude Code hook runtime):
#   CLAUDE_USER_MESSAGE   — the raw user message text
#   CLAUDE_PROJECT_DIR    — absolute path to the project (.opc/ root)
#
# Tunables (env, user-overridable):
#   OPC_HOOK_INTENSITY    — quiet (default) | loud | off
#   OPC_HOOK_KEYWORDS     — colon-separated extra trigger keywords (appended to defaults)
#   OPC_HOOK_MAX_BYTES    — truncate message past this size before keyword scan (default 65536)
#
# Behaviour:
#   off            — never inject
#   loud           — always inject, except when message starts with '/' (slash command)
#   quiet (default)— inject only when ANY of:
#                      1. message contains a trigger keyword
#                      2. there is an active in_progress flow under .opc/sessions/
#                    AND message does not start with '/'.
#
# Output: exactly one line to stdout when injecting; silent (exit 0) when not.
# Never fails — exit 0 unconditionally so a misconfigured hook can't block prompts.

set -u

readonly DEFAULT_KEYWORDS_CN="任务|实现|修复|重构|加|改|新增|优化|设计|写|调试|上线"
readonly DEFAULT_KEYWORDS_EN="implement|fix|refactor|add|update|build|debug|deploy|design|write"
readonly NOTICE='OPC: 先调 mcp__opc-state__opc_flow_query() 了解当前流程状态，再按返回的 suggested_actions 决定下一步（启动/延续/纠正/补充/回退/放弃/暂停/无关）。'

readonly INTENSITY="${OPC_HOOK_INTENSITY:-quiet}"
readonly MSG="${CLAUDE_USER_MESSAGE:-}"
readonly PROJECT_DIR="${CLAUDE_PROJECT_DIR:-${PWD}}"
readonly MAX_BYTES="${OPC_HOOK_MAX_BYTES:-65536}"

emit() { printf '%s\n' "$NOTICE"; exit 0; }
silent() { exit 0; }

# 1. off — bail immediately
if [ "$INTENSITY" = "off" ]; then silent; fi

# 2. slash-prefix exempt (applies to all intensities except off)
case "$MSG" in
  /*) silent ;;
esac

# Truncate for keyword scan if huge
if [ "${#MSG}" -gt "$MAX_BYTES" ]; then
  scan_buf="${MSG:0:$MAX_BYTES}"
else
  scan_buf="$MSG"
fi

# 3. loud — always inject (after slash check)
if [ "$INTENSITY" = "loud" ]; then emit; fi

# 4. quiet — keyword OR active flow
# 4.a keyword check (case-insensitive for ASCII; CN keywords are literal-match)
extra_kw="${OPC_HOOK_KEYWORDS:-}"
extra_kw_pipe="${extra_kw//:/|}"
combined="${DEFAULT_KEYWORDS_CN}|${DEFAULT_KEYWORDS_EN}"
if [ -n "$extra_kw_pipe" ]; then
  combined="${combined}|${extra_kw_pipe}"
fi
# grep -E with -i covers EN case; CN is unaffected by -i
if printf '%s' "$scan_buf" | grep -iqE "$combined"; then
  emit
fi

# 4.b active-flow check: any .opc/sessions/*/flow-state.json with status="in_progress"
sessions_dir="${PROJECT_DIR}/.opc/sessions"
if [ -d "$sessions_dir" ]; then
  # Find first state file containing in_progress; -l + -q semantics, no false positives on
  # the literal string "in_progress" appearing inside accumulated payloads because the
  # status field is the only top-level key we anchor on.
  if grep -lE '"status"[[:space:]]*:[[:space:]]*"in_progress"' \
       "${sessions_dir}"/*/flow-state.json 2>/dev/null | head -n 1 | grep -q .; then
    emit
  fi
fi

silent
