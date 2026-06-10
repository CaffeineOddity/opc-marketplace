# V4 / V5 PoC — hook precedence + history accumulation

Spike harness for `doc/feature/06-host-contract/00_overview.md` §V4 and
§V5. Unlike V6 / V7, **V4 and V5 cannot be fully automated** — both
verify Claude Code's internal message-handling behaviour, which is only
observable from inside a live session.

This directory delivers the **tools and protocol** a human operator
needs to execute the spike in ~20 minutes:

```
hook/
  spike-hook.sh        UserPromptSubmit hook with a unique marker
                       (used by both V4 and V5)
  record-history.mjs   Transcript marker counter (V5 verdict)
runbook/
  protocol.md          Step-by-step instructions
RESULTS.md             Operator fills this in after running the protocol
```

## Quick start

```bash
# 1. Read the protocol (~5 min)
$EDITOR runbook/protocol.md

# 2. Wire the spike hook into your scratch project's
#    .claude/settings.json — exact JSON in protocol.md §Step 0.

# 3. Run the 3-arm V4 protocol (~10 min) and the 5-turn V5 protocol
#    (~5 min) in a fresh `claude` session.

# 4. Fill RESULTS.md with the trial responses and the
#    record-history.mjs output.
```

## Why a runbook instead of an automated harness

V4 asks "when the hook says X and the system prompt says ¬X, what does
Claude output?" — answering this requires Claude to actually run, which
requires API access + a real session, which is exactly what the
production deployment is. We can't simulate it from a subprocess.

V5 asks "is the hook's injected text visible to Claude on turn N+1 even
when the hook adds nothing that turn?" — again, only the live session
exposes the user-message-history shape Claude actually sees.

What we **can** automate (and have):

- A controlled hook with a deterministic, uniquely-tagged injection.
- A sidecar log so the operator knows exactly when the hook fired.
- A JSONL transcript inspector that counts marker occurrences per turn
  and emits a PASS / FAIL / INCONCLUSIVE verdict, so the operator
  doesn't need to grep by eye.

The result is the smallest possible human-in-loop budget for two
contracts that genuinely need a human in the loop.

## Status

⏳ **Awaiting operator execution.** Until RESULTS.md is filled in,
`OPC_HOOK_INTENSITY` stays at the safe `quiet` default per A2.

See `RESULTS.md` for the result template and follow-ups.
