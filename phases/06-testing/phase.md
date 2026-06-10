---
phase: 06-testing
name: 测试
description: 集成测试、E2E、安全审计、性能基线
order:
  prev: 05-implement
  next: 07-release
---

## 目标

以系统级视角验证 05-implement 的实现满足 PRD/约束/安全/性能基线，并产出可发布判定。

## 职责

- 跑集成测试 / E2E 用例，覆盖主流程与高频边界
- 执行安全扫描（SAST/SCA/敏感信息），输出修复优先级
- 建立性能基线（关键接口 p95、首屏 LCP 等），与 PRD 验收线比对
- 给出"是否可进入 07-release"的明确结论，不可时回滚到 05-implement L1 重做对应节点
