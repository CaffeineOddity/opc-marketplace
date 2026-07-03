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
#   <root>/.opc/logs/<session-id>/<event>.log   newest-first, human-readable blocks
#   <root>/.opc/logs/<session-id>/trace.log     unified stream, newest-first
#
# Format: COMPACT single-stream lines (NOT JSONL). One block per event, header
# carries the time + hook + tool:
#
#   [10:42:38][UserPromptSubmit] fix the login bug
#   [10:42:39][PreToolUse][Bash]
#   in: {"command":"echo hi","description":"say hi"}
#   [10:42:39][PostToolUse][Bash]
#   out: "hi"
#   [10:42:40][Stop] stop_hook_active=false
#
# Header segments: [HH:MM:SS][hookname] always; [toolname] only when the event
# is a tool call (omitted entirely — no bare [] — for UserPromptSubmit / Stop).
# tool_input / tool_response (which arrive as a JSON string) are compacted: if
# the string parses as JSON it's re-serialized on one line (no indentation),
# otherwise it's printed verbatim with newlines collapsed to " ⏎ ". `in:` and
# `out:` each occupy their own line (omitted when null). Long fields are
# truncated with a marker.
#
# "Newest first" = the most recent block is at the TOP of each file. Implemented
# by PREPENDING each new block (temp file + cat + mv), so a reader sees recent
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

# --- field extraction + block rendering via node --------------------------------
# node reads the saved payload file, extracts fields, and emits THREE
# newline-delimited lines:
#   1: safe sid   2: safe event   3: the human-readable block to log (no raw \n)
# One process does parse + stamp + sanitise + format. Empty node output → bail
# silently (never block the session).
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

  // Cap a value to max bytes with a truncation marker. Returns a string or null.
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

  // Compact a value to a single line: if it parses as JSON, re-serialize with no
  // indentation; otherwise collapse existing newlines. Always returns one line.
  function compact1(v) {
    const s = cap(v);
    if (s === null) return null;
    if (typeof v === "string") {
      const trimmed = s.trim();
      if (trimmed && (trimmed[0] === "{" || trimmed[0] === "[")) {
        try { return JSON.stringify(JSON.parse(trimmed)); } catch (e) {}
      }
    }
    return String(s).replace(/\n/g, " ⏎ ");
  }

  function safe(s) {
    return String(s).replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "default";
  }

  function pad2(n) { return n < 10 ? "0" + n : "" + n; }
  function ts() {
    const d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) +
      " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());
  }

  // Compact header: [HH:MM:SS][hookname][toolname] — empty segments are omitted
  // entirely (no bare []). hookname = hook_event_name verbatim
  // (UserPromptSubmit/PreToolUse/PostToolUse/Stop); toolname = tool_name when
  // present, absent for non-tool events.
  const hook = event;
  const tool = o.tool_name;
  const head = "[" + ts().slice(11) + "][" + hook + "]" + (tool ? "[" + tool + "]" : "");

  const lines = [head];

  if (typeof o.prompt === "string") {
    // [time][hookname] <prompt text>
    lines[0] = head + " " + compact1(o.prompt);
  } else if (o.tool_name) {
    // [time][hookname][toolname]
    //   in: <input>
    //   out: <response>     — in/out each on their own line (omitted when null)
    const ti = compact1(o.tool_input);
    const tr = compact1(o.tool_response);
    if (ti !== null) lines.push("in: " + ti);
    if (tr !== null) lines.push("out: " + tr);
  } else if (o.stop_hook_active !== undefined) {
    lines[0] = head + " stop_hook_active=" + (!!o.stop_hook_active);
  }

  // Join block lines with a literal unit-separator (U+001F) so the block can
  // survive the read-by-line bash handoff; bash swaps it back to a real \n.
  const block = lines.join("");

  // Three lines: sid, event, block (block has no raw \n, only U+001F).
  process.stdout.write(safe(sid) + "\n" + safe(event) + "\n" + block + "\n");
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

# Restore real newlines: node joined block lines with U+001F (\x1f) so the
# whole block survives one read-by-line pass; swap it back to \n here.
ENTRY="$(printf '%s' "$ENTRY" | tr '\037' '\n')"

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
