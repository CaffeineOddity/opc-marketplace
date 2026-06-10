# V6 PoC — HTTP/SSE `Mcp-Session-Id` + disconnect

Standalone PoC for `doc/feature/06-host-contract/00_overview.md` §V6.
See **[RESULTS.md](./RESULTS.md)** for the full report and findings.

## Layout

```
server/   minimal stateful MCP HTTP server (StreamableHTTPServerTransport)
client/   harness that spawns the server and exercises 3 criteria
```

Both subdirs are standalone npm projects — they are intentionally
**outside** the pnpm workspace pattern so V6 can be re-run in isolation
or shipped to spec reviewers without dragging the monorepo.

## Run

```bash
# install once
cd poc/opc-host-contract-v6/server && npm install
cd ../client                       && npm install

# run end-to-end
node harness.mjs
```

Harness prints a JSON summary and exits non-zero on any failure. Override
`PORT` (default 4242) if 4242 is in use.

## What it verifies

1. **Session-id stability** — same `Mcp-Session-Id` reused across N
   requests from one client; isolated between clients.
2. **Disconnect detection** — explicit DELETE (per MCP Streamable HTTP
   spec) produces a server-side `session_closed` event within
   `DISCONNECT_GRACE` (10s).
3. **Reaper correctness** — `(now - last_heartbeat) > HEARTBEAT_TIMEOUT &&
   status != active` reaps only the right owners.

See `RESULTS.md` for the result table and engineering follow-ups.
