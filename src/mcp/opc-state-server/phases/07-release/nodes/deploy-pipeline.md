---
name: deploy-pipeline
tags: [infra, configure]
description: CI/CD 流水线（构建 / 镜像 / 签名 / 灰度）
agents:
  primary: [deployment-engineer]
  fallback: [devops-engineer, sre-engineer]
input:
  - path: <unit>/<feature>/quality-gate
    type: knowledge
  - path: <unit>/<feature>/architecture
    type: knowledge
output:
  - path: <unit>/<feature>/deploy-pipeline
    type: knowledge
  - path: .github/workflows/
    type: artifact
quality_gates:
  L1: [pipeline-syntax, image-build]
  L2: [signed_image, canary_strategy_defined]
always_show: true
---

## 部署流水线节点

把 quality-gate 通过的版本以可重复、可签名、可灰度的方式推到生产入口。

### 何时被选中

- 任务进入 07-release（`always_show: true`）
- 已有流水线时仍可执行（增量更新场景）

### 何时跳过

- 任务为热修复脚本（hotfix-only）且已有同流水线（仅触发现有 workflow）

### 执行步骤

1. **加载契约**：quality-gate 知识中的 release_verdict 必须为 PASS；architecture 提供部署拓扑。
2. **流水线构成**：build → test → image → sign（cosign/notary）→ scan（容器漏洞）→ push → deploy。
3. **环境分层**：dev → staging → prod；prod 强制人工 approve。
4. **灰度策略**：canary 1% → 10% → 50% → 100%，每阶段 SLO 自动检查 + 自动回滚条件。
5. **写知识**：`deploy-pipeline` 记录流水线 ID / image registry / canary 策略。

### Quality Gates

| Layer | Gate | Pass 条件 |
|---|---|---|
| L1 | pipeline-syntax | YAML / Workflow 语法校验通过 |
| L1 | image-build | 构建并推送镜像到 registry 成功 |
| L2 | signed_image | 镜像签名存在且可验证 |
| L2 | canary_strategy_defined | 灰度阶段 + 回滚阈值齐备 |

### 与 phase 内节点的接口

- 与 `rollback-plan` 互补：本节点定义"如何上"，rollback-plan 定义"如何下"
- 是 `slo-monitoring` 的前置（先有部署才能挂监控）

### 不做的事

- 不做代码变更（归 05-implement）
- 不绕过 quality-gate（verdict != PASS 直接拒绝）
- 不替代密钥管理（KMS / Vault 接入由专项节点；本节点仅消费已有 secret）
