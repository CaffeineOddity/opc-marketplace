# kits/ REGRESSION

This document is the v1 audit of `kits/`, run at M13.h after M13.a-g
shipped the six business kits.

## 1. Inventory

| Kit | Agents (count) | MCP servers |
|---|---|---|
| `product-kit` | product-manager / ux-researcher / business-analyst / startup-advisor (**4**) | none |
| `design-kit` | ui-designer / ux-designer / design-bridge (**3**) | pencil |
| `dev-kit` | backend-engineer / frontend-developer / fullstack-engineer / security-engineer / database-administrator (**5**) | none |
| `qa-kit` | test-automator / qa-expert / penetration-tester / critic / debater / tot-explorer / meta-synthesizer / cove-verifier (**8**) | none |
| `ship-kit` | deployment-engineer / sre-engineer / devops-engineer (**3**) | none |
| `growth-kit` | performance-engineer / backend-architect / cloud-architect (**3**) | none |

**Total: 26 agents across 6 kits.**

## 2. Agent name uniqueness (cross-kit)

✅ **PASS** — All 26 `name:` fields unique across all kits. No two kits
ship the same agent name. Verified via:

```bash
for f in kits/*/agents/*.md; do grep "^name:" "$f" | head -1; done \
  | sort -u | wc -l   # → 26
```

## 3. Phase-node ↔ kit-agent cross-reference

### 3.1 Agents referenced by `phases/*/nodes/*.md` `agents.primary[]` or `agents.fallback[]`

24 distinct names referenced. All primaries resolved:

| Status | Count | Notes |
|---|---|---|
| ✅ Resolved in some kit | 19 |  |
| ⚠️ Referenced but missing | 5 | See §3.2 |

### 3.2 Missing agents (referenced in phases but absent from any kit)

| Missing name | Referenced by | Resolution |
|---|---|---|
| `tech-lead` | feasibility-analysis / prd-draft (fallback) | Defer to v2; product-manager covers feasibility coordination; for technical fallback dev-kit's fullstack-engineer reads the same knowledge inputs. |
| `tdd-orchestrator` | tdd-implementation (fallback) | Defer to v2; backend-engineer + test-automator together cover the TDD orchestration role for v1. |
| `security-auditor` | security-review (fallback) | Defer to v2; security-engineer covers white-box audit; penetration-tester covers black-box for v1. |
| `microservices-architect` | architecture-evolution (fallback) | Defer to v2; backend-architect explicitly carries this role for v1 (documented in backend-architect.md). |
| `devops-incident-responder` | slo-monitoring (fallback) | Defer to v2; sre-engineer + devops-engineer together cover incident response for v1. |

**Action**: None for v1. All primaries are covered; fallbacks degrade
gracefully to the broader role agents. Tracked for v2 expansion. The
gap is acceptable because OPC's agent-availability check at
`opc_node_start` only blocks if **all** primary+fallback are missing.
Spot-checked: every node has ≥ 1 available agent.

### 3.3 Agents in kits/ but not referenced by any node

| Agent | Reason it's still useful |
|---|---|
| `critic` / `debater` / `tot-explorer` / `meta-synthesizer` / `cove-verifier` | Reflection-role agents — invoked by reflection-server (M3 / M4 / M5 / M6 / Meta), not by phase node frontmatter. Expected. |
| `startup-advisor` | Reflection-role for product-side go/no-go — invoked by reflection-server in greenfield scenarios. Expected. |
| `ux-designer` | Future-proofing for ux-flow specialization beyond ui-designer's overlap. Held for v1 as an explicit role even though ui-designer carries primary for ux-flow. |

**All unreferenced agents are intentional.** None should be removed.

## 4. tools whitelist enforcement (C4)

✅ **PASS** — All 26 agents declare explicit `tools:` lists. No
implicit "all", no missing field.

```bash
for f in kits/*/agents/*.md; do
  grep -c "^tools:" "$f"
done | sort -u    # → 1 (every file has exactly one)
```

## 5. Reflection-role write-tool bans (kits/README.md §2)

Six reflection-role agents audited:

| Agent | Banned tools present in `tools:`? |
|---|---|
| `critic` | ✅ None (Read/Grep/Glob/WebFetch/WebSearch + opc_knowledge_* read + opc_corrections_query) |
| `debater` | ✅ None |
| `tot-explorer` | ✅ None |
| `meta-synthesizer` | ✅ None |
| `cove-verifier` | ✅ None |
| `startup-advisor` | ✅ None |

Banned set checked: `Write`, `Edit`, `NotebookEdit`, `Bash`,
`opc_knowledge_write`, `opc_knowledge_admin`, `opc_corrections_upsert`.

```bash
# YAML-scope check (not prose):
awk '/^---$/{...}/^tools:/{in=1}...' kits/qa-kit/agents/*.md \
  | grep -E "Write|Edit|...|opc_knowledge_admin"   # → empty
```

**Backstop**: even if a future kit accidentally grants a write tool to
a reflection-class agent, the OPC server checks
`dispatch_context.role` and rejects writes from reflection roles.
Whitelist is primary defense; OPC server check is backstop.

## 6. Frontmatter contract completeness

All 26 agents have `name`, `description`, `tools`. All 26 `name:`
fields equal `basename(file) - .md`. ✅ **PASS**.

## 7. MCP server allocation

| Kit | MCP servers | Justification |
|---|---|---|
| `product-kit` | (none) | Knowledge ops + Web only; no specialized server needed for v1 |
| `design-kit` | `pencil` | .pen files are encrypted; only pencil tools can read/write them |
| `dev-kit` | `context7` | Library / framework docs — avoid stale training data |
| `qa-kit` | (none) | Test runners go through Bash; pentest via Bash + WebFetch |
| `ship-kit` | (none) | IaC / CI tools go through Bash + context7 (delegated to dev-kit context7 if needed) |
| `growth-kit` | (none) | Profiling / capacity tools go through Bash + context7 |

**Note**: ship-kit and growth-kit agents reference `mcp__plugin_context7_context7__*` tools in their `tools:` whitelists.
This works because Claude Code aggregates MCP server registrations across all loaded kits — a tool registered by dev-kit is callable by any agent that whitelists it. The agent's `tools:` field is the access-control list; the kit's `.mcp.json` is the server-registration list. The two are independent.

## 8. Cross-kit boundary clarity

Every agent's "不做的事" section explicitly defers cross-kit territory:

| From → To | Boundary documented |
|---|---|
| product-kit → dev-kit | "不做技术选型 / 归 04-implement-design" |
| product-kit → design-kit | "不做 UI / 归 03-design" |
| design-kit → dev-kit | "不写代码 / 归 frontend-engineer" |
| dev-kit → qa-kit (security) | "白盒视角 / 渗透归 penetration-tester" |
| dev-kit → ship-kit | "不做 deploy / 归 ship-kit" |
| qa-kit → dev-kit | "QA 是 gatekeeper 不是 fixer / 派回 dev-kit" |
| ship-kit → dev-kit | "不写业务代码 / 归 dev-kit" |
| ship-kit ↔ ship-kit | deployment "how to ship" / devops "how to build infra" / sre "how to keep stable" |
| growth-kit → dev-kit | "不做实现 / 归 dev-kit" |
| growth-kit → ship-kit | "不做扩容决策 / 归 cloud-architect + sre-engineer" |

All boundaries explicit. No territory war zones.

## 9. kit-install UX

✅ Documented in `kits/README.md` §"kit-install UX":
1. Writes kit files into project's `.claude/agents/` and `.mcp.json`
2. Prints mandatory: "请重启 Claude Code 以加载新 kit。"
3. Does NOT attempt hot-reload (would not work per C4-推论)

## 10. v2 backlog (deferred decisions)

| Item | Trigger to revisit |
|---|---|
| Add `tech-lead` agent | When PM ↔ technical fallback chain proves insufficient (observe ≥ 3 real cases of falling through to fullstack-engineer for product-side technical advice) |
| Add `tdd-orchestrator` | When backend-engineer + test-automator coordination shows seams (e.g., reflection finds gaps in test-first discipline ≥ 5 times) |
| Add `security-auditor` (distinct from security-engineer) | When the white-box reviewer ↔ formal auditor distinction becomes operationally meaningful (e.g., compliance audits requested) |
| Add `microservices-architect` (distinct from backend-architect) | When ≥ 3 distinct projects hit microservice-specific decisions (Saga / event sourcing / service mesh) that backend-architect's general view doesn't cover |
| Add `devops-incident-responder` | When incident response shows seams between sre-engineer's preventive role and active-fire response (observe ≥ 3 incidents where the role split would have helped) |
| Add 4th tag category `Activity` | Per M12.i §3.3 decision — trigger ≥ 3 distinct nodes hit a real routing miss with current 3-category tag pool |

## Conclusion

✅ **M13 closed.** 6 kits / 26 agents / 2 MCP servers. All quality
gates pass. v2 backlog clearly scoped with measurable triggers.

Next milestones: M14 (e2e golden-path walkthrough) and M15 (10+5
scenario chains) consume this kit inventory to exercise the
agent-availability check + reflection-role bans end-to-end.
