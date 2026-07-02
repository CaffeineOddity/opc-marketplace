#!/usr/bin/env bash
# src/plugins/opc/bin/opc-trace.sh
#
# OPC session tracing hook — records every user input, tool call (input +
# output), and assistant turn so opc-marketplace behaviour can be tracked and
# optimised. Project-scoped, installed by `/opc init` next to opc-hook.sh /
# opc-check.sh. Lives as a local copy at <project>/.opc/bin/opc-trace.sh.
#
# Registered for FOUR Claude Code hook events:
#   UserPromptSubmit  — the user's message text
#   PreToolUse        — tool about to run (tool_name + tool_input)
#   PostToolUse       — tool finished    (tool_name + tool_response)
#   Stop              — assistant finished its turn
#
# Claude Code passes the hook payload as JSON on STDIN. We extract the fields we
# care about with a small node script (node is a hard dependency of
# opc-marketplace). We do NOT depend on jq.
#
# Output layout (NOT git-tracked — covered by `.opc/**/*` in .gitignore):
#   <root>/.opc/logs/<session-id>/<event>.log   newest-first, one JSON obj/line
#   <root>/.opc/logs/<session-id>/trace.log     unified stream, newest-first
# "Newest first" = the most recent turn is line 1 of each file. Implemented by
# PREPENDING each new entry (temp file + cat + mv), so a reader sees recent
# activity without scrolling to the bottom.
#
# Tunables (env):
#   OPC_TRACE          — on (default) | off   (master switch)
#   OPC_TRACE_TOOL_MAX — truncate tool_input/tool_response past this many bytes
#                        (default 1048576 = 1MB). Full recording is the intent;
#                        the cap only guards against pathological payloads
#                        (e.g. a 500MB file read) blowing up the log.
#   OPC_TRACE_MAX_KB   — rotate: when a log file exceeds this size, keep only the
#                        newest half (default 10240 = 10MB). 0 = no cap.
#
# Never fails — exit 0 unconditionally so a logging hook can't block the session.

set -u

# --- master switch -----------------------------------------------------------
if [ "${OPC_TRACE:-on}" = "off" ]; then
  exit 0
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-${PWD}}"
LOGS_DIR="${PROJECT_DIR}/.opc/logs"

# Read the entire stdin payload once into a temp file (heredocs consume stdin,
# so we save it before handing it to node).
PAYLOAD_FILE="$(mktemp 2>/dev/null)"
trap 'rm -f "$PAYLOAD_FILE" 2>/dev/null' EXIT
cat > "$PAYLOAD_FILE"

# --- field extraction via node -------------------------------------------------
# node reads the saved payload file (path passed via stdin-redirect below) and
# emits THREE newline-delimited lines:
#   1: safe sid   2: safe event   3: the JSON entry to log
# One process does parse + stamp + sanitise, so we don't pay for node startup
# three times. Empty node output → bail silently (never block the session).
NODE_OUT="$(node < "$PAYLOAD_FILE" -e '
  const fs = require("fs");
  let raw = "";
  try { raw = fs.readFileSync(0, "utf8"); }
  catch (e) {}
  let o = {};
  try { o = raw ? JSON.parse(raw) : {}; } catch (e) {}

  const sid =
    (typeof o.session_id === "string" && o.session_id) ||
    process.env.CLAUDE_SESSION_ID ||
    process.env.SESSION_ID ||
    "default";
  const event =
    (typeof o.hook_event_name === "string" && o.hook_event_name) ||
    process.env.CLAUDE_HOOK_EVENT ||
    "Unknown";

  const max = Number(process.env.OPC_TRACE_TOOL_MAX || 1048576);
  function cap(v) {
    if (v === null || v === undefined) return null;
    let s;
    if (typeof v === "string") s = v;
    else { try { s = JSON.stringify(v); } catch (e) { s = String(v); } }
    if (typeof s === "string" && s.length > max) {
      return s.slice(0, max) + "…[truncated:" + s.length + "B]";
    }
    return s;
  }
  function safe(s) {
    return String(s).replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "default";
  }

  const entry = { ts: Date.now(), event };
  if (typeof o.prompt === "string") entry.prompt = cap(o.prompt);
  if (o.tool_name) entry.tool_name = String(o.tool_name);
  if (o.tool_input !== undefined) entry.tool_input = cap(o.tool_input);
  if (o.tool_response !== undefined) entry.tool_response = cap(o.tool_response);
  if (o.stop_hook_active !== undefined) entry.stop_hook_active = !!o.stop_hook_active;
  if (o.cwd) entry.cwd = String(o.cwd);
  if (o.transcript_path) entry.transcript_path = String(o.transcript_path);

  // Three lines: sid, event, entry-json (json has no raw newlines).
  process.stdout.write(safe(sid) + "\n" + safe(event) + "\n" + JSON.stringify(entry) + "\n");
' 2>/dev/null)"

[ -n "$NODE_OUT" ] || exit 0
{
  read -r SAFE_SID
  read -r SAFE_EVT
  ENTRY="$(cat)"
} <<NODE_OUT
$NODE_OUT
NODE_OUT

# node failure / malformed → bail silently (never block the session).
[ -n "${SAFE_SID:-}" ] || SAFE_SID="default"
[ -n "${SAFE_EVT:-}" ] || SAFE_EVT="Unknown"
[ -n "${ENTRY:-}" ] || exit 0

SESSION_DIR="${LOGS_DIR}/${SAFE_SID}"
EVENT_LOG="${SESSION_DIR}/${SAFE_EVT}.log"
TRACE_LOG="${SESSION_DIR}/trace.log"
mkdir -p "$SESSION_DIR"

# --- prepend (newest-on-top) -------------------------------------------------
# Write the new line to a temp, append the existing log, mv into place. Latest
# turn becomes line 1. O(file size) per write; bounded by OPC_TRACE_MAX_KB.
prepend_to() {
  local target="$1"
  if [ ! -f "$target" ]; then
    printf '%s\n' "$ENTRY" > "$target"
    return
  fi
  local tmp="${target}.tmp.$$"
  printf '%s\n' "$ENTRY" > "$tmp"
  cat "$target" >> "$tmp"
  mv -f "$tmp" "$target"
}
prepend_to "$EVENT_LOG"
prepend_to "$TRACE_LOG"

# --- size cap (rotate: keep only the newest half) ----------------------------
MAX_KB="${OPC_TRACE_MAX_KB:-10240}"
rotate_if_needed() {
  local target="$1"
  [ "$MAX_KB" = "0" ] && return
  [ -f "$target" ] || return
  local size_bytes total keep tmp
  size_bytes="$(wc -c < "$target" 2>/dev/null | tr -d ' ')"
  [ -n "$size_bytes" ] || return
  [ "$size_bytes" -gt $(( MAX_KB * 1024 )) ] || return
  # Newest-first: the newest entries are at the TOP, so keep `head -n half`.
  total="$(wc -l < "$target" 2>/dev/null | tr -d ' ')"
  [ -n "$total" ] || return
  keep=$(( total / 2 ))
  [ "$keep" -lt 1 ] && keep=1
  tmp="${target}.rot.$$"
  head -n "$keep" "$target" > "$tmp" 2>/dev/null && mv -f "$tmp" "$target"
}
rotate_if_needed "$EVENT_LOG"
rotate_if_needed "$TRACE_LOG"

exit 0
