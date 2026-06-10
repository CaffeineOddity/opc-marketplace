---
name: performance-profiling
tags: [backend, optimize]
description: CPU / 内存 / I/O / 查询计划 profiling，瓶颈分类
agents:
  primary: [performance-engineer]
  fallback: [sre-engineer, backend-engineer]
input:
  - path: <unit>/<feature>/slo-monitoring
    type: knowledge
  - path: <unit>/<feature>/analytics
    type: knowledge
  - path: <unit>/<feature>/architecture
    type: knowledge
output:
  - path: <unit>/<feature>/performance-profiling
    type: knowledge
  - path: opc-knowledge/perf/
    type: artifact
quality_gates:
  L1: [profile-data-collected]
  L2: [bottlenecks_classified, baseline_recorded]
always_show: true
---

## 性能 Profiling 节点

针对达到规模化压力的服务做系统级 profiling，输出瓶颈清单。

### 何时被选中

- 任务进入 09-scale（`always_show: true`）
- SLO 出现 error budget 持续消耗 / p95 阶梯式上升

### 何时跳过

- 任务为纯需求新增（不在规模化压力下）

### 执行步骤

1. **基线确认**：从 slo-monitoring 取当前 SLI 实测值，建立 perf baseline。
2. **CPU profiling**：火焰图（pprof / async-profiler / node --prof）。
3. **内存 profiling**：heap dump + 对象保留分析；找 leak / 长尾对象。
4. **I/O & 网络**：磁盘 IOPS、网络吞吐、连接池饱和度。
5. **DB 查询计划**：慢查询日志 + EXPLAIN；找 N+1、缺索引、全表扫。
6. **瓶颈分类**：按 USE 模型（utilization / saturation / errors）+ 影响面排序。
7. **写知识**：`performance-profiling` + `opc-knowledge/perf/` 含火焰图链接 / 慢查询样本 / 修复建议。

### Quality Gates

| Layer | Gate | Pass 条件 |
|---|---|---|
| L1 | profile-data-collected | 至少 1 套 CPU + 内存 + DB profile 数据 |
| L2 | bottlenecks_classified | 瓶颈按 USE 模型分类且排序 |
| L2 | baseline_recorded | baseline 实测值持久化以便对比优化前后 |

### 与 phase 内节点的接口

- 是 `architecture-evolution` 的强前置（不 profile 就改架构 = 凭感觉）
- 是 `capacity-planning` 的输入（瓶颈决定扩容方向）

### 不做的事

- 不直接改代码（finding → 新建 sub-pipeline 回 05-implement，禁止本节点写业务代码）
- 不做容量决策（归 capacity-planning）
- 不替代 APM 工具建设（消费已有 APM 数据）
