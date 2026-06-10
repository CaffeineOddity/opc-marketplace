---
name: quality-gate
tags: [fullstack, infra]
description: 发布门禁——聚合测试/扫描/性能结果，给出可否进入 07-release 的判定
agents:
  primary: [qa-expert]
  fallback: [sre-engineer, devops-engineer]
input:
  - path: <unit>/<feature>/test-report
    type: knowledge
  - path: <unit>/<feature>/security-scan
    type: knowledge
  - path: <unit>/<feature>/architecture
    type: knowledge
output:
  - path: <unit>/<feature>/quality-gate
    type: knowledge
quality_gates:
  L1: [performance-baseline]
  L2: [release_verdict_pass]
always_show: true
---

## 发布门禁节点

聚合 06-testing 内所有产物（test-report + security-scan + 性能基线），输出**单一发布判定**：`PASS` / `BLOCK`。

### 何时被选中

- 任何进入 06-testing 的任务都必须以本节点收尾（`always_show: true`）
- 是 06-testing 与 07-release 的硬隔离

### 何时跳过

- 不可跳过；唯一例外是 scenario = `security-audit` 单 phase 任务（无 07-release 后续）

### 执行步骤

1. **聚合输入**：`opc_knowledge_get_batch` 一次取齐 test-report + security-scan + architecture。
2. **性能基线**：跑关键接口压测（p95 / p99）、首屏 LCP、TTI，与 PRD 验收线比对。
3. **判定矩阵**：

   | 维度 | PASS 条件 | BLOCK 条件 |
   |---|---|---|
   | 集成/E2E | 全绿 + 覆盖率达标 | 任一红 OR 覆盖率不达标 |
   | 安全扫描 | critical+high = 0 | 任一 critical/high |
   | 性能基线 | 所有指标 ≤ PRD 上限 | 任一指标超线 |
   | 架构合规 | 无 high-severity 决策违反 | 有 |

4. **任一 BLOCK** → 写 `<unit>/<feature>/quality-gate` 记录失败原因 + 责任节点 → `opc_node_finish({status:'failed'})` 触发 phase_reset 到 05-implement L1 重做对应节点。
5. **全部 PASS** → 写 quality-gate 知识 + 调 `opc_phase_complete` 推进到 07-release。

### Quality Gates

| Layer | Gate | Pass 条件 |
|---|---|---|
| L1 | performance-baseline | 压测脚本运行成功 + 数据采集完成 |
| L2 | release_verdict_pass | 上述判定矩阵全 PASS |

### 与 phase 内节点的接口

- 强依赖 `integration-test` 与 `security-scan` 的产物（blocked_by 两者）
- 本节点是 06-testing → 07-release 的唯一出口

### 不做的事

- 不重跑测试（信任 integration-test 的产物；如怀疑陈旧 → 让那个节点 rerun）
- 不修代码（只做判定）
- 不做发布部署（归 07-release）
- 不在 BLOCK 时擅自降档"medium 转 high 接受"（需用户介入显式 `accept_risk`）
