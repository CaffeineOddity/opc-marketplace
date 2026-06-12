# Scenario: security-audit

> Lightweight security review recipe. Focuses on scanning and remediation,
> skipping design/implement phases per the task-analysis phase table:
> "安全审计 → 06-testing（仅安全扫描节点）".

## Trigger phrases

- "安全审计 / 安全检查 / 漏洞扫描 / 渗透测试 / 安全评估 / 代码审计"
- "security audit / vulnerability scan / pen test / security review / SAST / DAST"
- "检查安全问题 / 有没有安全漏洞 / 安全吗 / audit dependencies"

## Tool sequence

1. `opc_flow_query` — confirm no active flow blocks the request.
2. `opc_flow_lifecycle(action="start", initial_message=<user text>)`.
3. `opc_flow_step_complete(step="intent_analysis", intent="task")`.
4. `opc_flow_step_complete(step="task_analysis", analysis_result={...})` — `complexity` is typically `"low"` or `"medium"`; `suggested_phases: ["06-testing"]`; `tags: ["security"]`.
5. If `complexity="low"`: route directly to `opc_quick_dispatch` (no pipeline, no phases). Claude runs security scan tools ad-hoc.
6. If `complexity="medium"` (multi-service audit, compliance scope): proceed to `opc_pipeline_create` → `opc_phase_start` for `06-testing` with security-scan nodes only.
7. `opc_phase_start(phase="06-testing")` — filter nodes to security-scan, dependency-audit, secret-detection, compliance-check.
8. For each security node: `opc_node_start` → execute scan → `opc_node_complete` with findings artifact.
9. `opc_phase_complete` with aggregated vulnerability report.
10. `opc_reflect_record_interventions` to mine security corrections.

## Reflection touchpoints

- After `task_analysis`: one round of `critique` to verify scope (is this audit-only or audit+remediate?).
- After each scan node: `opc_reflect_critique` on the findings — prioritise by severity, eliminate false positives.
- `validator` runs implicitly via V1-V5 on the vulnerability report artifact.

## Suggested phases

`06-testing` (security-scan nodes only)

- **dependency-audit**: `npm audit` / `pip audit` / OWASP Dependency-Check.
- **secret-detection**: gitleaks, truffleHog, or equivalent.
- **sast**: static analysis with Semgrep, CodeQL, or SonarQube.
- **compliance-check**: GDPR/PCI-DSS/HIPAA checklist against the target scope.
- **remediation-plan**: prioritised fix list with severity, CVSS, and owner assignment.

## Anti-patterns

- Running `05-implement` nodes during a pure audit — this is a read-and-report flow, not a build flow.
- Treating every finding as a blocker — triage by severity; low-severity findings should not stall the pipeline.
- Auditing without defining scope first — the `brief` step (if medium complexity) must state which repos/services are in scope.
