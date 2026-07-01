---
description: Opt the current project into OPC — scaffold .opc/ and install the project-scoped hook.
---

`/opc init` opts the current project into OPC. It is the explicit, per-project
onboarding step (vs. the plugin's MCP servers which start whenever the plugin
is enabled). Run it once in any project where you want OPC active.

It:

1. Creates `.opc/` + a `.project-init` marker. The state-server's bootstrap
   (which seeds `.opc/phases/` and `.opc/scenarios/` from the bundle) **only**
   runs when this marker exists — so enabling the plugin alone never silently
   writes `.opc/` into a project.
2. Installs the `UserPromptSubmit` hook into the project's `.claude/settings.json`
   (project-scoped, shareable via git), instead of firing globally from the
   plugin manifest.
3. Adds an OPC block to the project's `.gitignore`: ignores all of `.opc/`
   except re-includes `.opc/knowledge/` and `.opc/memory/` so the team-shareable
   trees (knowledge base, project memory) can be committed while runtime state
   (sessions, logs, indexes) stays local.

```
!`node "${CLAUDE_PLUGIN_ROOT}/bin/opc-init.mjs" $ARGUMENTS`
```

Idempotent — safe to re-run. After it completes, **restart Claude Code** so
`opc-state-server` picks up the scaffold and the hook takes effect, then start
a flow with `mcp__opc-state-server__opc_flow_lifecycle({ action: "start" })`.
