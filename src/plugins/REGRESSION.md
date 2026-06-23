# plugins/ REGRESSION

> **v2 重写说明**：本文档原为 v1 `kits/`（6 个独立 kit）的 M13.h 审计。v2 将六 kit
> 合并进单一 `opc/official-kits` 插件，agent 归入 6 个 category 目录（product/design/
> dev/infra/qa/reflection），并新增 `opc-distiller`（共 27 个）。下面"§1 Inventory"按 v2
> 重新列数；其余章节（命名唯一性、phase-node 交叉引用、frontmatter 契约）的核查方法不变，
> 只是 `kits/<kit>/agents/` 路径换成 `official-kits/agents/<category>/`。
>
> §3.2 列出的 5 个 v1 fallback 缺口（tech-lead / tdd-orchestrator / security-auditor /
> microservices-architect / devops-incident-responder）在 v2 仍是 **deferred** —— primary
> 已覆盖，仅 fallback 降级，不阻塞发布。

## 1. Inventory

| Category | Agents (count) |
|---|---|
| `product/` | product-manager / business-analyst / startup-advisor (**3**) |
| `design/` | ux-researcher / ux-designer / ui-designer / design-bridge (**4**) |
| `dev/` | backend-architect / backend-engineer / frontend-developer / fullstack-engineer / database-administrator / cloud-architect (**6**) |
| `infra/` | devops-engineer / deployment-engineer / sre-engineer (**3**) |
| `qa/` | test-automator / qa-expert / security-engineer / penetration-tester / performance-engineer (**5**) |
| `reflection/` | critic / debater / tot-explorer / meta-synthesizer / cove-verifier / opc-distiller (**6**) |

**Total: 27 agents across 6 categories.** (v1 had 26 across 6 separate kits; v2 拆出
infra/ 与 qa/ 的边界、把 ux-researcher 归入 design/，并新增 opc-distiller。)

## 2. Agent name uniqueness (cross-category)

✅ **PASS** — All 27 `name:` fields unique across all categories. Verified via:

```bash
for f in src/plugins/official-kits/agents/*/*.md; do grep "^name:" "$f" | head -1; done \
  | sort -u | wc -l   # → 27
```

## 3. Phase-node ↔ kit-agent cross-reference

> **首个发布版说明**：§3.2 原列出的 5 个 v1 deferred fallback agent（tech-lead /
> tdd-orchestrator / security-auditor / microservices-architect /
> devops-incident-responder）已从 node frontmatter 移除（见 commit
> `feat(phases): drop v1 deferred fallback agents`）。primary 全部 kit-resident，
> 无节点失去 agent 覆盖。§3.2 表格保留作历史记录。

### 3.1 Agents referenced by `phases/*/nodes/*.md` `agents.primary[]` or `agents.fallback[]`

All primaries and surviving fallbacks resolve to kit-resident agents. ✅ **PASS**.

### 3.2 [历史] v1 deferred fallback agents — 已于首个发布版移除

| Missing name | Was referenced by (fallback) | v1 plan | Release resolution |
|---|---|---|---|
| `tech-lead` | feasibility-analysis / prd-draft | Defer to v2 | fallback cleared (prd-draft → []; feasibility → [business-analyst]) |
| `tdd-orchestrator` | tdd-implementation | Defer to v2 | fallback cleared → [] |
| `security-auditor` | security-review / security-scan | Defer to v2 | fallback cleared (security-review → []; security-scan → [penetration-tester]) |
| `microservices-architect` | architecture-evolution | Defer to v2 | fallback cleared → [cloud-architect] |
| `devops-incident-responder` | rollback-plan | Defer to v2 | fallback cleared → [deployment-engineer] |

**Action (release)**: removed from frontmatter rather than implemented. Every node
retains ≥ 1 kit-resident agent, so `opc_node_start`'s availability check still passes.

### 3.3 Agents in official-kits but not referenced by any node

| Agent | Reason it's still useful |
|---|---|
| `critic` / `debater` / `tot-explorer` / `meta-synthesizer` / `cove-verifier` | Reflection-role agents — invoked by reflection-server (M3 / M4 / M5 / M6 / Meta), not by phase node frontmatter. Expected. |
| `opc-distiller` | Serves corrections-store distillation — invoked by reflection-server, not phase nodes. Expected. |
| `startup-advisor` | Reflection-role for product-side go/no-go — invoked by reflection-server in greenfield scenarios. Expected. |
| `ux-designer` | Future-proofing for ux-flow specialization beyond ui-designer's overlap. Held as an explicit role even though ui-designer carries primary for ux-flow. |

**All unreferenced agents are intentional.** None should be removed.

## 4. tools whitelist enforcement (C4)

✅ **PASS** — All 27 agents declare explicit `tools:` lists. No
implicit "all", no missing field.

```bash
for f in src/plugins/official-kits/agents/*/*.md; do
  grep -c "^tools:" "$f"
done | sort -u    # → 1 (every file has exactly one)
```

## 5. Reflection-role write-tool bans (plugins/README.md §Hard rules 2)

Six reflection-role agents audited:

| Agent | Banned tools present in `tools:`? |
|---|---|
| `critic` | ✅ None (Read/Grep/Glob/WebFetch/WebSearch + opc_knowledge_open + opc_knowledge_read + opc_corrections) |
| `debater` | ✅ None |
| `tot-explorer` | ✅ None |
| `meta-synthesizer` | ✅ None |
| `cove-verifier` | ✅ None |
| `startup-advisor` | ✅ None |

> **v2 工具名说明**：v2 工具合并后（54→24），knowledge 侧只剩 `opc_knowledge_open`
> / `opc_knowledge_read` / `opc_knowledge_write` / `opc_knowledge_admin` 四个工具，
> corrections 侧合并为单一 `opc_corrections`（discriminator 区分 query/migrate/endorse/
> freeze/delete 等动作）。反思 agent 只白名单 `opc_corrections` 的 query 语义 ——
> 由于工具是单一入口、靠 discriminator 分流，"只允许 query"的约束靠 reflection-server
> 侧 `dispatch_context.role` 检查兜底（见下 Backstop）。v1 旧名 `opc_corrections_upsert`
> / `opc_knowledge_admin` 在 v2 已不存在，但禁止意图一致：反思角色不得写入。
>
> 因此"反思角色禁写"在 v2 的精确表达是：reflection/ 下的 agent `tools:` 不得包含
> `opc_knowledge_write` / `opc_knowledge_admin` / `Bash` / `Write` / `Edit`。审计通过。

Banned set checked (v2): `Write`, `Edit`, `NotebookEdit`, `Bash`,
`opc_knowledge_write`, `opc_knowledge_admin`.

```bash
# YAML-scope check (not prose):
for f in src/plugins/official-kits/agents/reflection/*.md; do
  awk '/^---$/{c++; next} c==1{print}' "$f"
done | grep -E "Write|Edit|NotebookEdit|Bash|opc_knowledge_write|opc_knowledge_admin"   # → empty
```

**Backstop**: even if a future kit accidentally grants a write tool to
a reflection-class agent, the OPC server checks
`dispatch_context.role` and rejects writes from reflection roles.
Whitelist is primary defense; OPC server check is backstop.

## 6. Frontmatter contract completeness

All 27 agents have `name`, `description`, `tools`. All 27 `name:`
fields equal `basename(file) - .md`. ✅ **PASS**.

## 7. External MCP server dependencies

v2 的 `opc/official-kits` 插件本身**不自带** `.mcp.json`（v1 六 kit 各自的 `.mcp.json`
已移除）。部分 agent 的 `tools:` 白名单引用了外部 MCP server 工具，这些 server 需用户
另行安装/启用 —— Claude Code 会聚合所有已加载插件的 MCP 注册，agent 白名单只控访问权：

| Agent | External MCP tools referenced | Notes |
|---|---|---|
| design/ `ui-designer`, `ux-designer`, `design-bridge` | `mcp__pencil__*` | .pen 文件加密，仅 pencil 工具可读写 |
| dev/ + infra/ + qa/ 多个工程 agent | `mcp__plugin_context7_context7__*` | 库/框架文档，避免训练数据过期 |

未安装对应 server 时，这些工具对 agent 不可见 —— agent 应在 body 里给出降级路径
（退回 `WebFetch` / `Bash`）。**发布前 TODO**：在 README 明示 pencil/context7 为可选依赖。

## 8. Cross-category boundary clarity

Every agent's "不做的事" section explicitly defers cross-category territory:

| From → To | Boundary documented |
|---|---|
| product → dev | "不做技术选型 / 归 04-implement-design" |
| product → design | "不做 UI / 归 03-design" |
| design → dev | "不写代码 / 归 frontend-developer" |
| dev → qa (security) | "白盒视角 / 渗透归 penetration-tester" |
| dev → infra | "不做 deploy / 归 infra/" |
| qa → dev | "QA 是 gatekeeper 不是 fixer / 派回 dev/" |
| infra → dev | "不写业务代码 / 归 dev/" |
| infra ↔ infra | deployment "how to ship" / devops "how to build infra" / sre "how to keep stable" |
| qa (performance) → dev/cloud | "不做实现 / 归 dev/" |

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
