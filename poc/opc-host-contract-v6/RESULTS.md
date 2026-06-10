# PoC V6 — HTTP/SSE Mcp-Session-Id stability + disconnect detection

**Claim under test** (`doc/feature/06-host-contract/00_overview.md` §V6 / §2.6.2):

> HTTP/SSE 模式下 `Mcp-Session-Id` 跨请求稳定 + 协议级 disconnect 事件可监听；
> 心跳 ledger reaper 能在 `HEARTBEAT_TIMEOUT` (120s) 后正确将
> `status != active` 的 owner 标记为 orphan。

Three success criteria:
1. Same `Mcp-Session-Id` reused across N requests from one client; isolated between clients.
2. Client disconnect (explicit DELETE per MCP spec, or transport close) is observable
   server-side within `DISCONNECT_GRACE = 10s`.
3. Reaper logic correctly identifies stale-inactive owners and only those.

## Run

```bash
cd poc/opc-host-contract-v6/server && npm install
cd ../client && npm install && node harness.mjs
```

The harness spawns the server as a subprocess on `PORT` (default 4242),
runs all assertions, kills the server, and exits non-zero if any of the
6 sub-criteria fail. Full JSON report is printed to stdout.

## Method

The server (`server/index.mjs`) is a stateful `StreamableHTTPServerTransport`
host with:

- `sessionIdGenerator: () => randomUUID()` — one transport per session,
  keyed by `Mcp-Session-Id` header.
- 2 MCP tools: `report_session` (returns server-observed session_id +
  per-session counter), `bump_counter` (increments + returns the counter,
  proving the **same** session_id is genuinely reused not just claimed).
- 2 HTTP introspection endpoints (`/health`, `/sessions`) for the harness.
- An `events.jsonl` append-only log capturing
  `session_initialized` / `session_closed` / `transport_closed` with a
  monotonic timestamp — the harness reads this after kills to verify
  disconnect detection.

The harness (`client/harness.mjs`):

- Spawns server, waits for `{"ready":true}` line.
- Opens 2 clients (A, B), each over `StreamableHTTPClientTransport`.
- Client A: `report_session` → `bump_counter` × 3 → `report_session`.
  Verifies server sees the same UUID in both calls, matches the
  client-side `transport.sessionId`, and counter went 1→2→3.
- Client B: parallel session with independent counter.
- `/sessions` snapshot confirms both visible server-side.
- Client A: `transport.terminateSession()` (MCP DELETE) + `client.close()`.
  Wait 500ms. Read event log; confirm `session_closed` and
  `transport_closed` rows for A's sid, measure close latency.
- Client B: `bump_counter` (must succeed, counter=2) — proves A's close
  did not bleed into B's session.
- Criterion 3 is a pure-function test on synthesized owners (no real
  fixture needed — the reaper is a 1-line predicate).

## Results (run 2026-06-10)

All 6 sub-criteria pass:

| Sub-criterion | Pass | Detail |
|---|---|---|
| c1 session_id stable across 5 calls from same client | ✓ | server-seen UUID matches client transport.sessionId in both `report_session` calls; counter 1→2→3→3 |
| c1 clients isolated | ✓ | sidA ≠ sidB; B's counter independent |
| c1 server sees both | ✓ | `/sessions` returns 2 entries with correct ids and counters |
| c2 disconnect detected | ✓ | `session_closed` event logged 41ms after DELETE — well under `DISCONNECT_GRACE = 10000ms` |
| c2 other client unaffected | ✓ | B's `bump_counter` succeeds post-A-close, counter=2 as expected |
| c3 reaper correctness | ✓ | only `stale-inactive` reaped from {fresh-active, fresh-inactive, stale-active, stale-inactive} |

Representative close latency: **41 ms** (DELETE round-trip + `onsessionclosed`
callback firing). The 10s `DISCONNECT_GRACE` budget has a ~240× margin.

## Findings

1. **`client.close()` alone is insufficient.** Calling only `client.close()`
   tears down the client-side transport but the server keeps the session
   slot alive (no event emitted). Clients **must** call
   `transport.terminateSession()` to issue the protocol DELETE. The state
   server's heartbeat ledger therefore cannot rely on transport close as
   the primary disconnect signal; it needs both:
   - the protocol DELETE event (fast path, observed here at <50ms), **and**
   - the heartbeat-timeout reaper (fallback for ungraceful disconnects
     like client crash / network partition).
2. **Reaper's `status != active` guard is correct.** Stale-but-active
   owners (rare; suggests heartbeat keeps coming from a process that
   forgot to flip its own status) should be left alone — the heartbeat
   itself is evidence of life, the stale `status` is a bug for the
   owner to fix, not the reaper.
3. **No collisions across sessions.** The `Map<sid, ctx>` pattern with
   per-session closures keeps counters fully isolated. Verified by
   alternating A/B bumps in `c1_server_sees_both`.

## Implementation reference

Server-side session registration:

```js
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => randomUUID(),
  onsessioninitialized: async (sid) => { /* register sessions.set(sid, ctx) + logEvent */ },
  onsessionclosed:      async (sid) => { /* sessions.delete(sid) + logEvent */ },
});
transport.onclose = async () => { /* logEvent transport_closed */ };
```

Client-side graceful disconnect:

```js
await transport.terminateSession(); // protocol DELETE
await client.close();               // teardown client state
```

Reaper predicate (criterion 3):

```js
const HEARTBEAT_TIMEOUT_MS = 120_000;
function reapOrphans(owners, now) {
  return owners
    .filter(o => now - o.last_heartbeat > HEARTBEAT_TIMEOUT_MS && o.status !== "active")
    .map(o => o.session_id);
}
```

## Status

✅ **V6 PASS** — all 3 contract criteria verified end-to-end. Cleared to
land the HTTP/SSE seam (state-server `OPC_TRANSPORT=http` path), the
`onsessionclosed` → owner-status downgrade, and the heartbeat reaper as
spec'd in `00_overview.md` §2.6.2.

Followup engineering tickets (out of PoC scope):
- M17: wire the host-contract C1/C2 session resolver to also consume
  `Mcp-Session-Id` when `OPC_TRANSPORT=http`.
- M18: emit `session_closed` / `session_orphaned` to opc-logs so
  operators can see disconnect cadence.
