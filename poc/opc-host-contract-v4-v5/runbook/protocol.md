# V4 / V5 spike — operator runbook

V4 (hook vs system-prompt precedence) and V5 (hook text accumulation in
user-message history) **cannot be fully automated** — both depend on a
live Claude Code session and on the host's internal message-passing
behaviour, neither of which is observable from a subprocess harness.

This runbook gives the operator a controlled, repeatable observation
protocol. Allocate **~20 minutes** end-to-end. Fill `../RESULTS.md` as
you go.

## Prerequisites

- Claude Code CLI installed and logged in.
- A scratch project directory (empty repo is fine).
- `jq` for transcript inspection.
- The two scripts in `../hook/`:
  - `spike-hook.sh` — UserPromptSubmit hook with a unique marker.
  - `record-history.mjs` — transcript marker counter.

## Step 0 — register the spike hook

In your scratch project, add to `.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "command": "/absolute/path/to/poc/opc-host-contract-v4-v5/hook/spike-hook.sh" }
    ]
  }
}
```

Export a marker so each run is uniquely tagged:

```bash
export OPC_V45_MARKER="OPC-V45-$(date +%s)"
export OPC_V45_LOG_DIR="$PWD/.opc-v45-spike"
```

Start a fresh Claude Code session (`claude`). Do not enable any other
hooks for the duration of this run.

## V4 — hook vs system prompt precedence

**What V4 claims:** the UserPromptSubmit hook can reliably steer Claude's
behaviour even when its injected directive conflicts with the system
prompt / model defaults. If V4 fails, `OPC_HOOK_INTENSITY=loud` is unsafe
because flow_query routing won't actually fire.

**Setup:** the spike hook injects `For this single response … Begin your
reply with the exact literal characters '🟦 BLUE 🟦' and nothing else
before.` This deliberately conflicts with normal Claude defaults (no
unsolicited emoji preamble).

**Protocol (3 trials per arm):**

| Arm | Send this message | Expected if V4 PASS (hook wins) | Expected if V4 FAIL |
|-----|-------------------|--------------------------------|---------------------|
| A — neutral | `Say hi.` | Reply starts with `🟦 BLUE 🟦` | Plain `Hi.` style reply |
| B — task | `Write a one-line bash script that prints today's date.` | Reply starts with `🟦 BLUE 🟦` then the script | Script only, no marker |
| C — slash | `/help` | Hook should NOT fire (slash command) — reply is normal help | Marker appears → hook ignored slash exemption |

For each arm:
1. Note whether `🟦 BLUE 🟦` appears as the first visible characters.
2. Note whether the rest of the response is otherwise sensible.
3. Capture the raw response (copy/paste into RESULTS.md).
4. Check `$OPC_V45_LOG_DIR/fires.tsv` — confirm one fire per non-slash arm and zero fires for arm C.

**Verdict rules:**

- ≥ 5/6 of arms A+B (3 trials × 2 arms) start with the marker → **V4 PASS**.
- 0–2/6 → **V4 FAIL** (hook is ignored; route to mitigation).
- 3–4/6 → **V4 PARTIAL** (record as FAIL for safety; the production
  default must stay `quiet`).

**Mitigations if FAIL:** soften the hook text (cooperative phrasing
instead of override), or move the injection to `SessionStart` (one-shot
system addition) and keep `UserPromptSubmit` for keyword-triggered
nudges only. Either path requires re-running this protocol.

## V5 — hook text accumulation in history

**What V5 claims:** the text the hook adds to one turn does NOT
re-appear in the user-message history Claude sees on subsequent turns.
If V5 fails, `loud` mode silently grows the prompt by ~50 tokens per
turn — a long session bleeds context.

**Setup:** continue the same session from V4 (or start a fresh one with
the spike hook still wired).

**Protocol:**

1. Send 5 short prompts in a row, all non-slash:
   - turn 1: `count to one`
   - turn 2: `count to two`
   - turn 3: `count to three`
   - turn 4: `count to four`
   - turn 5: `count to five`
2. After each reply, do NOT send anything else (no follow-ups, no edits).
3. After turn 5, run `claude --export` (or whichever export your Claude
   build supports — see your version's docs) and save the JSONL to
   `transcript.jsonl`.
4. Run:
   ```bash
   node poc/opc-host-contract-v4-v5/hook/record-history.mjs transcript.jsonl --marker "$OPC_V45_MARKER"
   ```
5. Cross-reference with the hook log:
   ```bash
   wc -l "$OPC_V45_LOG_DIR/fires.tsv"   # should be 5 — one fire per non-slash turn
   ```

**Verdict rules:**

- Marker appears exactly 5 times in user-message history, **one per turn,
  and only in the turn where the hook actually fired** → **V5 PASS**
  (no accumulation — each turn injects fresh, prior injections drop out).
- Marker appears in turn N's user history **more than once**, or appears
  in a turn whose `fires.tsv` row is absent → **V5 FAIL** (cumulative
  replay; loud mode would burn tokens).
- Marker appears < 5 times → **inconclusive** — the hook didn't fire on
  every turn. Re-check `.claude/settings.json` wiring and re-run.

**Mitigations if FAIL:** stop using `UserPromptSubmit` for the
flow_query nudge. Instead emit it once at `SessionStart` (covers the
whole session for free) and reserve `UserPromptSubmit` for genuinely
turn-specific signals (keyword hits). Re-run this protocol after
re-wiring.

## Cleanup

- Remove the hook from `.claude/settings.json` when done so it doesn't
  contaminate other work.
- `rm -rf "$OPC_V45_LOG_DIR"` to delete the fires.tsv sidecar.
- Archive your `transcript.jsonl` next to `../RESULTS.md` if the result
  was meaningful (PASS, FAIL, or PARTIAL — any signal is worth keeping).

## What to record in `../RESULTS.md`

Open `../RESULTS.md` and fill in:
- Date, Claude Code version (`claude --version`), OS.
- For V4: full text of each of the 6 trial responses, your pass/fail
  count, your verdict.
- For V5: the JSON output of `record-history.mjs`, the `fires.tsv` line
  count, your verdict.
- Any anomalies (e.g. hook fired twice for one turn, marker mutated by
  Claude when echoed back, etc.).

Once both verdicts are filled in, update
`doc/feature/06-host-contract/00_overview.md` §V4 / §V5 status from
`⏳ 待 PoC` to whatever the protocol returned and, if both PASS, open a
follow-up ticket to discuss flipping `OPC_HOOK_INTENSITY` default to
`loud`.
