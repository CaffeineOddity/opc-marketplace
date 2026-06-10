---
name: slo-monitoring
tags: [infra, configure]
description: SLO 指标接入、dashboard、alert 配置
agents:
  primary: [sre-engineer]
  fallback: [performance-engineer, devops-engineer]
input:
  - path: <unit>/<feature>/prd
    type: knowledge
  - path: <unit>/<feature>/deploy-pipeline
    type: knowledge
output:
  - path: <unit>/<feature>/slo-monitoring
    type: knowledge
  - path: ops/dashboards/
    type: artifact
  - path: ops/alerts/
    type: artifact
quality_gates:
  L1: [dashboard-deployed, alert-syntax]
  L2: [sli_to_slo_mapped, alert_owner_defined]
always_show: true
---

## SLO 监控节点

把 PRD 的可度量验收线落成 SLI / SLO，配 dashboard 与 alert，并指定 owner。

### 何时被选中

- 任务进入 07-release（`always_show: true`）
- 涉及面向用户的生产服务

### 何时跳过

- 内部一次性脚本（无持续运行需求）

### 执行步骤

1. **SLI 选型**：可用性、延迟、吞吐、错误率、饱和度（USE 模型 + RED 模型）。
2. **SLO 阈值**：从 PRD 验收线提取（如 p95 < 200ms / 月度可用性 ≥ 99.9%）。
3. **Error budget**：1 - SLO；用于 09-scale 阶段的风险预算决策。
4. **Dashboard**：每 SLO 一张图；含当前值 / 阈值线 / 历史趋势 / error budget 剩余。
5. **Alert**：分级（page / ticket / log），含 runbook 链接；owner 必须是人不是组。
6. **写知识**：`slo-monitoring` 含 SLI 定义 + 阈值 + dashboard URL + alert 规则。

### Quality Gates

| Layer | Gate | Pass 条件 |
|---|---|---|
| L1 | dashboard-deployed | dashboard URL 可访问 |
| L1 | alert-syntax | alert 规则语法校验通过 |
| L2 | sli_to_slo_mapped | 每条 PRD 验收线对应至少 1 个 SLO |
| L2 | alert_owner_defined | 每条 alert 有具体 owner（人） |

### 与 phase 内节点的接口

- 弱依赖 `deploy-pipeline`（部署完才能采集指标）
- 与 `rollback-plan` 互补：alert 触发条件应与回滚触发条件一致或更早

### 不做的事

- 不做性能优化（归 09-scale 的 performance-profiling）
- 不做业务分析埋点（归 08-growth 的 analytics-integration）
- 不替代日志系统建设（仅消费已有日志做指标）
