---
description: Opt the current project into OPC — scaffold .opc/ and install the project-scoped hook.
---

`/opc init` opts the current project into OPC. It is the explicit, per-project
onboarding step (vs. the plugin's MCP servers which start whenever the plugin
is enabled). Run it once in any project where you want OPC active.

It:

1. Creates `.opc/` + a `.project-init` marker, and **seeds `.opc/phases/` and
   `.opc/scenarios/` from the installed plugin's bundle** (the `phases/` +
   `scenarios/` dirs shipped inside the plugin). Seeding happens HERE, at init
   time — the `opc-state-server` only reads `.opc/`, it never writes
   phases/scenarios, so there is no bootstrap at server startup and **no restart
   is needed** to start a flow. Enabling the plugin alone never silently writes
   `.opc/` into a project; the marker is the opt-in signal.
2. Re-runs are idempotent and perform a **three-way merge** against the previous
   bundle snapshot (`.opc/.builtin-manifest.json`): clean upgrades overwrite
   untouched files, new bundle files are added, and files you edited locally
   that the bundle also changed get a git-style `<file>.conflict` (your edit is
   preserved, never lost). So `/opc init` after a plugin upgrade is safe.
3. Copies the hook scripts (`opc-hook.sh` + `opc-check.sh`) from the installed
   plugin into the project's `.opc/bin/`. They run as local copies so the
   project-scoped commands below work without `${CLAUDE_PLUGIN_ROOT}` (which the
   host does NOT expand in project settings — only `${CLAUDE_PROJECT_DIR}` is).
4. Registers two project-scoped hooks in `.claude/settings.json` (shareable via
   git), instead of firing globally from the plugin manifest:
   - `UserPromptSubmit` → `${CLAUDE_PROJECT_DIR}/.opc/bin/opc-hook.sh` — the
     per-message nudge to call `opc_flow_query()` first.
   - `SessionStart` → `${CLAUDE_PROJECT_DIR}/.opc/bin/opc-check.sh` — runs once
     per session; if the local `.opc/bin/opc-hook.sh` copy OR the seeded
     `.opc/phases`+`scenarios/` have drifted from the installed plugin (e.g.
     after `claude plugin install opc` upgraded it), it prints a one-line nudge
     to re-run `/opc init` and refresh.
5. Adds an OPC block to the project's `.gitignore`: ignores all of `.opc/`
   except re-includes `.opc/knowledge/` and `.opc/memory/` so the team-shareable
   trees (knowledge base, project memory) can be committed while runtime state
   (sessions, logs, indexes, and the local `.opc/bin/` hook copies) stays local.

```
!`node "${CLAUDE_PLUGIN_ROOT}/bin/opc-init.mjs" $ARGUMENTS`
```

Idempotent — safe to re-run. Once it completes, `.opc/` is fully seeded and the
hooks are registered — **no restart required**. Start a flow with
`mcp__opc-state-server__opc_flow_lifecycle({ action: "start" })`.

**After a plugin upgrade:** when you next start Claude Code, `opc-check.sh`
will detect the local hook copies and/or seeded phases/scenarios are stale and
print a nudge. Re-run `/opc init` in that project to refresh `.opc/bin/` and
merge the new bundle (local edits are preserved as `.conflict` files if they
collide).
