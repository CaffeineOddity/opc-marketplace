---
description: Read-only OPC session health snapshot (M18.h).
---

Run the `opc-status` CLI on the current project and render its output. The CLI
reads `.opc/sessions/<id>/flow-state.json` plus pipeline/sub-pipeline state in
real time — it never writes anywhere.

```
!`node "${CLAUDE_PLUGIN_ROOT}/bin/opc-status.mjs" $ARGUMENTS`
```

Pass `--json` if you want the machine-readable snapshot, or `--session <id>`
to pin a specific session instead of the auto-picked newest one.
