# V4 / V5 PoC — operator results

> Status: **awaiting human-in-loop execution** (cannot be automated —
> requires a live Claude Code session). See [`runbook/protocol.md`](./runbook/protocol.md)
> for the step-by-step.

| Run date | Operator | Claude Code version | OS | V4 verdict | V5 verdict |
|----------|----------|----------------------|-----|------------|------------|
| _yyyy-mm-dd_ | _name_ | _e.g. 1.0.84_ | _e.g. macOS 14.5_ | ☐ PASS ☐ FAIL ☐ PARTIAL | ☐ PASS ☐ FAIL ☐ INCONCLUSIVE |

## Claims under test

**V4** (`doc/feature/06-host-contract/00_overview.md` line 427):

> UserPromptSubmit hook 与 system prompt 优先级。spike 让 hook 注入与
> system 冲突的指令，看 Claude 服从哪个。**未通过前 `OPC_HOOK_INTENSITY`
> 默认 `quiet`** (A2)。

**V5** (line 428):

> hook 注入文本是否进入 user message history（影响 token）。检查 long
> context 后历史里 hook 文本是否累积。**未通过前 `OPC_HOOK_INTENSITY`
> 默认 `quiet`** (A2)。

If both PASS, the project can revisit the default-`loud` decision
(currently blocked by A2). If either FAILs, the hook architecture needs
the mitigations listed in `runbook/protocol.md`.

## What this PoC delivers

Because V4 and V5 depend on live host behaviour, the PoC ships **tools**
rather than results:

1. `hook/spike-hook.sh` — a deliberately conflicting UserPromptSubmit
   hook with a unique marker and a fires.tsv sidecar log.
2. `hook/record-history.mjs` — JSONL transcript inspector that counts
   marker occurrences per turn and outputs PASS / FAIL / INCONCLUSIVE.
3. `runbook/protocol.md` — step-by-step procedure (~20 min) for an
   operator to execute V4 + V5 and fill this file in.

The harness is intentionally tiny and high-signal: the marker is unique
per run (date-stamped UUID-ish), so even if multiple operators run the
protocol on the same Claude install we never confuse one run's traces
with another's.

## V4 results — fill after running

### Arm A — neutral prompt `Say hi.`

| Trial | Reply starts with marker? | Full response (first 200 chars) |
|-------|---------------------------|----------------------------------|
| 1 | ☐ yes ☐ no | _paste_ |
| 2 | ☐ yes ☐ no | _paste_ |
| 3 | ☐ yes ☐ no | _paste_ |

### Arm B — task prompt `Write a one-line bash script that prints today's date.`

| Trial | Marker first? | Response (first 200 chars) |
|-------|---------------|-----------------------------|
| 1 | ☐ yes ☐ no | _paste_ |
| 2 | ☐ yes ☐ no | _paste_ |
| 3 | ☐ yes ☐ no | _paste_ |

### Arm C — slash command `/help`

| Trial | Hook fired (check `fires.tsv`)? | Marker in reply? |
|-------|----------------------------------|-------------------|
| 1 | ☐ yes ☐ no | ☐ yes ☐ no |

### V4 aggregate

- Marker-first count across arms A+B: `__ / 6`
- Hook fires for arm C: `__` (must be 0)
- **Verdict:** ☐ PASS (≥ 5/6 and arm C = 0)  ☐ FAIL  ☐ PARTIAL

If FAIL or PARTIAL, document the chosen mitigation:

> _e.g. "Moved flow_query nudge to SessionStart; kept UserPromptSubmit for
> keyword-triggered injections only. Re-running V4 with the softer hook
> text next sprint."_

## V5 results — fill after running

### Transcript inspector output

Paste the full JSON from `record-history.mjs`:

```json
{
  "poc": "V5 — hook history accumulation",
  ...
}
```

### Sidecar log

- `wc -l $OPC_V45_LOG_DIR/fires.tsv` returned: `__` (must equal the
  number of non-slash turns sent — 5 in the runbook protocol).

### V5 aggregate

- Marker occurrences in user-message history: `__`
- Cumulative-replay detected (any turn has count > 1)? ☐ yes ☐ no
- Cross-check: every marker-hit turn corresponds to a `fires.tsv` row?
  ☐ yes ☐ no
- **Verdict:** ☐ PASS (5 hits, 1-per-turn, all match fires.tsv)
  ☐ FAIL (cumulative replay)  ☐ INCONCLUSIVE

If FAIL, document the chosen mitigation:

> _e.g. "Switched to SessionStart for the flow_query system addition;
> UserPromptSubmit reduced to keyword-only nudges. Re-running V5 will
> show marker count = 0 (no accumulation) since the system addition is
> not echoed in user-message history."_

## Follow-ups

If both V4 and V5 PASS:
- Open an issue against M9 to discuss flipping `OPC_HOOK_INTENSITY`
  default from `quiet` → `loud`. Decision needs product input (token
  cost vs UX of always-on routing).
- Update `00_overview.md` lines 195, 200, 201, 427, 428 to remove the
  "A2 blocking" caveats.

If V4 FAIL:
- Block default-`loud` indefinitely.
- File a ticket to redesign the hook's authority — likely SessionStart
  one-shot + UserPromptSubmit keyword-only.

If V5 FAIL:
- Same architectural change as V4 FAIL.
- Add a `loud`-mode warning to the hook script: "long sessions may incur
  ~50 tokens/turn overhead while V5 is unresolved".

## Status (auto-fillable summary)

| Contract | Status |
|----------|--------|
| V4 (hook precedence) | ⏳ awaiting operator run |
| V5 (history accumulation) | ⏳ awaiting operator run |

Once filled, also update the cross-PoC validation log at
`doc/feature/06-host-contract/01_validation-log.md` (M16.d).
