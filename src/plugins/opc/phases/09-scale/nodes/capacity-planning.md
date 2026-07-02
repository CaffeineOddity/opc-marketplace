---
name: capacity-planning
tags: [infra, configure]
description: 峰值容量、年增长、灾备规划；落到 IaC 与监控
agents:
  primary: [cloud-architect]
  fallback: [sre-engineer, devops-engineer]
input:
  - path: <unit>/<feature>/performance-profiling
    type: knowledge
  - path: <unit>/<feature>/analytics
    type: knowledge
  - path: <unit>/<feature>/slo-monitoring
    type: knowledge
output:
  - path: <unit>/<feature>/capacity-plan
    type: knowledge
  - path: infra/
    type: artifact
quality_gates:
  L1: [iac-syntax]
  L2: [peak_modeled, growth_modeled, dr_strategy_defined]
always_show: false
---

## 容量规划节点

基于历史用量与增长曲线规划未来容量，输出 IaC 变更与监控告警。

### 何时被选中

- 任务进入 09-scale 且涉及基础设施扩缩容
- SLO 出现接近 saturation 阈值的趋势

### 何时跳过

- 单机部署 / PoC 阶段

### 执行步骤

1. **现状量化**：当前 QPS、并发、存储、带宽实测值（来自 analytics + slo-monitoring）。
2. **峰值模型**：日 / 周 / 季节性峰值倍率；大促 / 活动峰值。
3. **增长曲线**：3 / 6 / 12 个月增长预测（含上下界）。
4. **灾备策略**：RPO / RTO 目标；多 AZ / 多 region；冷备 vs 热备成本。
5. **IaC 落地**：Terraform / Pulumi 模板写入 infra/；含自动扩缩容策略。
6. **写知识**：`capacity-plan` 含模型 + 假设 + IaC 链接 + 告警阈值。

### Quality Gates

| Layer | Gate | Pass 条件 |
|---|---|---|
| L1 | iac-syntax | terraform validate / pulumi preview 通过 |
| L2 | peak_modeled | 含日 + 周 + 大促三类峰值倍率 |
| L2 | growth_modeled | ≥ 6 个月增长预测且含假设依据 |
| L2 | dr_strategy_defined | RPO + RTO + 切换路径齐备 |

### 与 phase 内节点的接口

- 强依赖 `performance-profiling`（瓶颈 → 容量方向）
- 与 `architecture-evolution` 并行（容量方案与架构方案可能互相约束）

### 不做的事

- 不做架构变更（归 architecture-evolution）
- 不做实际 apply（生产 apply 走 07-release 的 deploy-pipeline）
- 不替代财务预算（输出资源量 + 估算成本；预算批准属业务决策）
