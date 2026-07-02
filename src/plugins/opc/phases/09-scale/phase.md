---
phase: 09-scale
name: 规模化
description: 性能优化、架构演进、容量规划
order:
  prev: 08-growth
  next: null
---

## 目标

针对已增长到规模化压力的产品做性能优化与架构演进，确保未来 N 倍流量下仍能维持 SLO。

## 职责

- 性能 profiling（CPU、内存、I/O、查询计划）与瓶颈分类
- 架构演进方案（拆分、缓存、异步、读写分离、CQRS 等）并评估迁移成本
- 容量规划（峰值、年增长、灾备）并落到 IaC 与监控
- 凡涉及破坏性接口变更回流到 04-implement-design 的 L2 phase_reset；性能优化结果回写 opc-knowledge/perf/
