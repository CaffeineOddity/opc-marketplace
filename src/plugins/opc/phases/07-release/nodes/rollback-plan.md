---
name: rollback-plan
tags: [infra, configure]
description: 回滚预案 / runbook / 故障演练
agents:
  primary: [sre-engineer]
  fallback: [deployment-engineer]
input:
  - path: <unit>/<feature>/deploy-pipeline
    type: knowledge
  - path: <unit>/<feature>/architecture
    type: knowledge
output:
  - path: <unit>/<feature>/rollback-plan
    type: knowledge
  - path: docs/runbook/
    type: artifact
quality_gates:
  L1: []
  L2: [rollback_triggers_defined, runbook_dry_run_passed, blast_radius_estimated]
always_show: true
---

## 回滚预案节点

为本次发布建立可执行的回滚路径与 runbook，并完成一次 dry-run。

### 何时被选中

- 任务进入 07-release（`always_show: true`）
- 任何涉及生产部署的变更

### 何时跳过

- 仅静态资源 CDN 刷新（可回退性内嵌于 CDN 自身）

### 执行步骤

1. **触发条件**：错误率 > X% / p95 > Y ms / 关键业务指标降幅 > Z% / 用户报告 ≥ N 起。
2. **回滚路径**：列出技术路径（镜像版本回退 / 蓝绿切换 / feature flag 关闭 / DB migration revert）。
3. **数据回滚**：若 schema 变更不可逆，需提前定义 forward-fix 方案（不允许"祈祷不出事"）。
4. **runbook 撰写**：每步骤含命令、预期输出、故障分支；用纯文本，不依赖个人记忆。
5. **dry-run**：staging 完整跑一遍回滚流程；记录耗时（目标 ≤ 15 min）。
6. **写知识**：`rollback-plan` 含触发条件 + 路径 + dry-run 报告。

### Quality Gates

| Layer | Gate | Pass 条件 |
|---|---|---|
| L2 | rollback_triggers_defined | 触发指标 + 阈值 + 责任人齐备 |
| L2 | runbook_dry_run_passed | staging dry-run 报告附在知识中 |
| L2 | blast_radius_estimated | 受影响用户 / 服务范围量化 |

### 与 phase 内节点的接口

- 强依赖 `deploy-pipeline`（要知道部署方式才能定义回滚）
- 与 `slo-monitoring` 互补：本节点的触发条件应能被 slo-monitoring 自动检测

### 不做的事

- 不做部署（归 deploy-pipeline）
- 不做 forward-fix 实现（属于发现问题后的新增 sub-pipeline，不在预案内）
- 不做合规审计（如有 GDPR 数据回滚要求，归专项节点）
