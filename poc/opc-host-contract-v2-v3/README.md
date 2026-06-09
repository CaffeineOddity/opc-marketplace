# PoC: V2 + V3 Host Contract Validation

Minimal end-to-end test that exercises the two assumptions guarding the OPC reflection design:

- **V2** — Task-spawned sub-agents inherit the parent conversation's MCP server connections
- **V3** — `allowed_tools` declared in `.claude/agents/*.md` is enforced by the Host (not merely advisory)

## Layout

```
poc/opc-host-contract-v2-v3/
  server/             minimal MCP server exposing one read + one write tool
    index.mjs         stdio MCP server (no deps beyond @modelcontextprotocol/sdk)
    package.json
  artifacts/          where the write tool emits proof files (gitignored)
  RESULTS.md          filled in after running V2/V3 probes
.claude/
  agents/
    poc-v2-writer.md    allowed_tools includes the MCP write tool → V2 probe
    poc-v3-reader.md    allowed_tools excludes the MCP write tool → V3 probe
.mcp.json             registers the PoC server as `poc-host-contract`
```

## Tools exposed by the PoC MCP server

| Tool | Side effect |
|---|---|
| `poc_echo_read(text)` | returns `{echoed: text}` — pure read |
| `poc_echo_write(text)` | writes `poc/opc-host-contract-v2-v3/artifacts/<ulid>.txt` with `text`, returns `{file_path}` |

## How to verify

1. Make sure `node ./poc/opc-host-contract-v2-v3/server/index.mjs` boots cleanly (server logs `READY` on stderr).
2. From a fresh Claude Code session in this repo, ask Claude to Task-spawn the two PoC agents (see RESULTS.md for the prompts used).
3. Inspect `artifacts/` and the agent's reported tool errors.

Both probes are non-destructive — only files under `artifacts/` are touched.
