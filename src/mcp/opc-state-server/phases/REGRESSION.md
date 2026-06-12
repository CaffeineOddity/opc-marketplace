# phases/ Regression Audit

> Auto-generated regression record for M12.i. Re-run any time
> phases/ structure changes.

## 1. Structure inventory

| Phase | nodes/ | templates/ |
|---|---|---|
| 00-ideation | 2 (problem-statement, feasibility-analysis) | 1 (problem-statement.md) |
| 01-validation | 3 (user-research, competitor-analysis, prd-draft) | 1 (prd.md) |
| 03-design | 3 (ui-design, ux-flow, brand-system) | 1 (brand-system.md) |
| 04-implement-design | 3 (api-design, database-schema, scaffold) | 1 (api.md) |
| 05-implement | 6 (tdd-implementation, auth-integration, backend-endpoint, frontend-component, security-review, refactor) | 1 (architecture.md) |
| 06-testing | 3 (integration-test, security-scan, quality-gate) | 1 (quality-gate.md) |
| 07-release | 3 (deploy-pipeline, rollback-plan, slo-monitoring) | 1 (rollback-plan.md) |
| 08-growth | 3 (seo-audit, marketing-content, analytics-integration) | 1 (analytics.md) |
| 09-scale | 3 (performance-profiling, architecture-evolution, capacity-planning) | 1 (performance-profiling.md) |
| **Total** | **29 nodes** | **9 templates** |

## 2. Tag consistency audit

All 18 unique `tags:` combinations across 29 nodes draw exclusively
from the canonical pool defined in
[`platform/mcp/opc-state-server/prompts/02_task-analysis.md §3.2`](../platform/mcp/opc-state-server/prompts/02_task-analysis.md):

| Category | Allowed tags |
|---|---|
| Stack | backend, frontend, fullstack, mobile, desktop, infra |
| Domain | auth, database, api, ui, payment, storage, security, messaging |
| Operation | add-feature, fix-bug, refactor, optimize, migrate, configure |

**Verification**: zero tag-pool violations. Run
`grep -h "^tags:" phases/*/nodes/*.md | sort -u` to reproduce.

## 3. Tag-pool extension decision

### 3.1 Observed friction

Early-phase (00-ideation / 01-validation) and growth/scale-phase
nodes ship work that is **not stack-specific** (product research,
PRD, brand, capacity planning). The canonical pool was designed
for code-task routing and lacks first-class categories for:

- **Research** (user research, competitor analysis, market data)
- **Product** (PRD authoring, problem statement, feasibility)
- **Brand & content** (visual identity, marketing copy)
- **Operations** (SLO, capacity, rollback)

These nodes currently map to forced combinations:
`[add-feature, configure]` / `[add-feature, ui]` / `[ui, configure]`.

### 3.2 Decision: defer extension

**Status**: pool stays as-is for v1.

**Rationale**:

1. **Task-side tagging dominates routing.** P5 V1 `matched_tags`
   computes intersection of `task.tags ∩ node.tags`. Task tags are
   set by P2 task-analysis from the canonical pool. As long as
   greenfield/new-product tasks tag themselves with `add-feature`
   (which they do — Operation is mandatory), the forced
   `[add-feature, *]` node tags will match.

2. **Tag pool changes touch validators.** V1 strictness, P2
   `tags[]` validation, and corrections-store similarity engine
   all consume the pool. A pool expansion would ripple to M6
   `validators.ts`, M7 `similarity.ts`, and prompts §3.2. Not a
   solo M12 sub-letter scope.

3. **No observed routing failure.** Greenfield e2e walkthroughs
   already route through 00/01/03 phases correctly under the
   current mapping. The friction is aesthetic (the tag does not
   read as "product research"), not functional.

### 3.3 If this becomes a real problem

Future pool extension should add a fourth category — not bloat
existing ones — to keep V1 intersection semantics clean:

```diff
  | Stack     | backend, frontend, fullstack, mobile, desktop, infra |
  | Domain    | auth, database, api, ui, payment, storage, security, messaging |
  | Operation | add-feature, fix-bug, refactor, optimize, migrate, configure |
+ | Activity  | research, product-spec, brand, content, ops |
```

Tracking issue: open one when ≥ 3 distinct nodes hit a real
routing miss caused by the current forced mappings.

## 4. Spec-link audit

`phases/README.md` references five source-of-truth specs. All five
paths verified to exist (2026-06-10):

| Path | Status |
|---|---|
| `doc/feature/02-opc-state-server/01-intent-analysis/06_task-analysis.md` | OK |
| `doc/feature/02-opc-state-server/02-pipeline/04_state-json.md` | OK |
| `doc/feature/02-opc-state-server/03-phase/01_nine-phases.md` | OK |
| `doc/feature/02-opc-state-server/03-phase/02_node-selection.md` | OK |
| `platform/mcp/opc-state-server/prompts/05_phase-execution.md` | OK |

## 5. Cross-phase artifact path consistency

Knowledge artifact paths follow two patterns:

- `<unit>/<feature>/<sub>` — most artifacts (api, model, architecture, prd, ...)
- `design/<feature>/<sub>` — design-phase artifacts (ui, ux-flow, ia, brand-system, tokens, components)

Verified handoffs (output of upstream node = input of downstream node):

| Producer | Artifact | Consumer | Status |
|---|---|---|---|
| 01-validation/user-research | `personas` | 03-design/ui-design + ux-flow; 04-implement-design (implicit); 08-growth/marketing-content | OK |
| 01-validation/prd-draft | `prd` | 03-design (all); 04-implement-design/api-design; 07-release/slo-monitoring; 08-growth | OK |
| 03-design/brand-system | `brand-system` | 03-design/ui-design; 08-growth/marketing-content | OK |
| 03-design/ux-flow | `ux-flow`, `ia` | 04-implement-design (implicit); 08-growth/seo-audit + analytics-integration | OK |
| 04-implement-design/api-design | `api` | 05-implement/* | OK |
| 04-implement-design/database-schema | `model` | 05-implement/tdd-implementation, auth-integration, backend-endpoint | OK |
| 05-implement/auth-integration + refactor + arch-evolution | `architecture` | 05-implement/security-review; 06-testing/security-scan; 09-scale/* | OK |
| 05-implement/security-review | `security-review` | 06-testing/security-scan | OK |
| 06-testing/integration-test | `test-report` | 06-testing/quality-gate | OK |
| 06-testing/security-scan | `security-scan` | 06-testing/quality-gate | OK |
| 06-testing/quality-gate | `quality-gate` | 07-release/deploy-pipeline | OK |
| 07-release/deploy-pipeline | `deploy-pipeline` | 07-release/rollback-plan + slo-monitoring | OK |
| 07-release/slo-monitoring | `slo-monitoring` | 08-growth/seo-audit; 09-scale/performance-profiling | OK |
| 08-growth/analytics-integration | `analytics` | 09-scale/performance-profiling + capacity-planning | OK |
| 09-scale/performance-profiling | `performance-profiling` | 09-scale/architecture-evolution + capacity-planning | OK |

No dangling artifact paths.

## 6. Reproduction commands

```bash
# Tag pool check
grep -h "^tags:" phases/*/nodes/*.md | sort -u

# Phase / node / template counts
ls phases/*/phase.md | wc -l
for d in phases/*/nodes; do echo "$d: $(ls $d 2>/dev/null | wc -l)"; done
for d in phases/*/templates; do echo "$d: $(ls $d 2>/dev/null | wc -l)"; done

# Spec link verification
grep -oE "\(\.\./[^\)]+\)" phases/README.md | tr -d '()' | sed 's|^\.\./||' | while read p; do
  [ -f "$p" ] && echo "OK: $p" || echo "MISSING: $p"
done
```

---
*This file is regenerated when M12 structure changes. Last audit: 2026-06-10.*
