# 01 — Host-Contract Validation Log

Consolidated index of all V1–V7 PoC validations for the host contract
spec in `00_overview.md` §3. Each row links to the standalone PoC dir
in `poc/` that contains the harness, raw data, and reproduction
instructions.

## Status snapshot — 2026-06-10

| ID | Contract | Status | Evidence |
|----|----------|--------|----------|
| V1 | `process.ppid` in stdio MCP server points at the spawning Claude Code process; `kill(pid, 0)` aliveness semantics correct | ✅ **PASS** (2026-06-10) | [poc/opc-host-contract-v2-v3/RESULTS.md](../../../poc/opc-host-contract-v2-v3/RESULTS.md) |
| V2 | Task-spawned sub-agents can invoke the parent conversation's MCP tools | ✅ **PASS** (2026-06-10) | [poc/opc-host-contract-v2-v3/RESULTS.md](../../../poc/opc-host-contract-v2-v3/RESULTS.md) |
| V3 | Agent-frontmatter `tools:` whitelist is enforced by the Host (stronger: unlisted tools are **invisible**, not just denied) | ✅ **PASS (stronger)** (2026-06-10) | [poc/opc-host-contract-v2-v3/RESULTS.md](../../../poc/opc-host-contract-v2-v3/RESULTS.md) |
| V4 | UserPromptSubmit hook can steer behaviour against a conflicting system-prompt directive | ⏳ **Awaiting operator run** | [poc/opc-host-contract-v4-v5/RESULTS.md](../../../poc/opc-host-contract-v4-v5/RESULTS.md) |
| V5 | Hook-injected text does NOT accumulate in user-message history across subsequent turns | ⏳ **Awaiting operator run** | [poc/opc-host-contract-v4-v5/RESULTS.md](../../../poc/opc-host-contract-v4-v5/RESULTS.md) |
| V6 | HTTP/SSE `Mcp-Session-Id` stable across requests + disconnect detected within `DISCONNECT_GRACE` (10s) + reaper marks orphans correctly | ✅ **PASS** (2026-06-10) — close latency 41ms, all 6 sub-criteria green | [poc/opc-host-contract-v6/RESULTS.md](../../../poc/opc-host-contract-v6/RESULTS.md) |
| V7 | `.opc/installed-kits.json` mtime vs `session_started_at` heuristic has FP rate < 5% | ✅ **PASS** (2026-06-10) — 1.84% FP across 3101 TN trials, 0 FN across 1001 TP trials | [poc/opc-host-contract-v7/RESULTS.md](../../../poc/opc-host-contract-v7/RESULTS.md) |

**Aggregate:** 5 of 7 contracts PASS (V1, V2, V3, V6, V7). V4/V5 remain
blocked on human-in-loop spike execution; production default
`OPC_HOOK_INTENSITY=quiet` is maintained per A2 until both PASS.

---

## V1 / V2 / V3 — stdio mode foundations (2026-06-10)

Three contracts proven in a single PoC because they share the same
fixtures (a probe MCP server + two agents with deliberately different
tool whitelists). Re-running the harness requires the headless
`claude -p` CLI; full commands are in
`poc/opc-host-contract-v2-v3/RESULTS.md`.

**Key bonus findings beyond the primary claims**:

- **C2-caveat**: `process.ppid` is the **direct-parent** Claude process
  that spawned the server, NOT the top-level user-terminal Claude. In
  `claude -p` headless or nested-launcher scenarios these differ.
  Implication: owner.pid must use direct ppid, not walked-ancestor pid.
- **C4-confirmed**: `.claude/agents/*.md` and `.mcp.json` load at
  session start with no hot reload — a stale session sees the old kit
  set. Implication: `KIT_PROBABLY_NOT_LOADED` warning (which V7 covers)
  is genuinely needed.
- **V3-stronger**: unlisted tools return `Error: No such tool
  available` (invisibility) rather than a runtime `Permission denied`.
  Prompt-injection cannot even discover the denied tool's existence.
  Implication: kit `agents/*.md` `tools:` whitelist is a true security
  boundary, not just a UX hint.

---

## V6 — HTTP/SSE Mcp-Session-Id + disconnect (2026-06-10)

PoC: `poc/opc-host-contract-v6/`.

Spawned an MCP server with `StreamableHTTPServerTransport` and 2
clients. All 6 sub-criteria passed:

| Sub-criterion | Result |
|---------------|--------|
| Same client reuses same `Mcp-Session-Id` across 5 requests | ✓ (counter 1→2→3→3 confirms genuine reuse, not header echo) |
| Two clients get isolated session ids | ✓ |
| `/sessions` introspection sees both | ✓ |
| Explicit DELETE → `session_closed` event in 41 ms | ✓ (~240× under 10s `DISCONNECT_GRACE` budget) |
| Other client unaffected by first client's close | ✓ |
| Reaper marks only stale-inactive owners orphan | ✓ |

**Key finding**: `client.close()` alone does NOT notify the server. The
client MUST call `transport.terminateSession()` to issue the MCP-spec
DELETE. State server therefore needs BOTH the protocol DELETE event
(fast path) AND the heartbeat reaper (fallback for ungraceful
disconnects like crashes / network partitions). This two-track design
matches `00_overview.md` §2.6.2 + §2.8.

**Cleared to land**: HTTP/SSE seam in state-server (`OPC_TRANSPORT=http`
path), `onsessionclosed` → owner-status downgrade, heartbeat reaper.

---

## V7 — kit-mtime heuristic FP rate (2026-06-10)

PoC: `poc/opc-host-contract-v7/`.

Pure-function harness (`mtime > session_started_at + grace_ms`) plus a
real-filesystem cross-check. 7 scenarios, 4102 trials total:

| Metric | Value | Target |
|--------|-------|--------|
| TP scenarios (install during session) | 1001 trials / 0 FN | FN = 0 ✓ |
| TN scenarios (install before, boundary, skew, real-fs before) | 3101 trials / 57 FP | FP < 5% ✓ (1.84%) |
| Scenario D @ `grace=0` (strict spec read, ±2s NTP skew) | 5.7% FP | — (above 5% in skew window alone) |
| Scenario D @ `grace=5000` (recommended default) | 0% FP | — |

**Key finding**: under realistic ±2s filesystem clock skew, the
strict-spec heuristic (`grace=0`) tips into 5.7% FP **in the skew
window alone**. Overall amortized FP stays under 5%, so V7 PASSes the
contract, but a 5-second grace window drops the skew-window FP to 0%
without sacrificing detection of genuine "install during session"
cases (those are typically minutes/hours late, not seconds).

**Cleared to land**: `KIT_PROBABLY_NOT_LOADED` warning in
`opc_flow_query` and `KIT_NOT_LOADED_PRE_FLIGHT` hard gate in
`opc_pipeline_create`. Production should configure
`OPC_KIT_LOADED_GRACE_MS=5000` per the M18 follow-up.

---

## V4 / V5 — pending operator execution

PoC: `poc/opc-host-contract-v4-v5/`.

Cannot be automated — both require a live Claude Code session to
observe (V4) the model's allegiance when hook and system-prompt
conflict, and (V5) the user-message history shape across multiple
turns. The PoC therefore delivers:

- `hook/spike-hook.sh` — UserPromptSubmit hook with a uniquely-tagged
  conflict directive (V4 stimulus, V5 marker).
- `hook/record-history.mjs` — JSONL transcript inspector with explicit
  PASS / FAIL / INCONCLUSIVE verdict (exit 2 on FAIL).
- `runbook/protocol.md` — ~20-minute operator procedure with explicit
  thresholds (V4: ≥ 5/6 marker-first; V5: 1-per-turn + match against
  hook fires.tsv).
- `RESULTS.md` — pre-filled template with checkbox tables for the
  operator's pasted responses.

Both contracts will be flipped to ✅ or ❌ once the protocol is run.

**Until then**: `OPC_HOOK_INTENSITY` default stays at `quiet` per A2.
The hook's `quiet` branch (keyword-trigger + active-flow) is unaffected
by V4/V5 outcomes — only the question of whether to promote the default
to `loud` is blocked.

---

## How to add new entries

When future PoCs land (e.g. an A1 advisory-lock spike, or post-V4/V5
mitigations), append to the status snapshot table above and add a
section in the same template:

1. Title row with the contract ID, date, PoC path.
2. Result summary (1 table + 1 paragraph for "key finding").
3. "Cleared to land" or "Follow-up" line so the reader knows what
   implementation work this unblocks.

Keep the standalone `poc/.../RESULTS.md` as the canonical raw data;
this log is the navigable index, not a duplicate.
