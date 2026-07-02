---
phase: 05-implement
name: 编码实现
description: TDD、业务逻辑实现、集成
order:
  prev: 04-implement-design
  next: 06-testing
---

## 目标

按照 04-implement-design 冻结的接口契约与 schema 完成业务代码、单元测试，达到可被 06-testing 接收的状态。

## 职责

- 按 TDD（红-绿-重构）实现业务模块
- 单元测试覆盖核心分支，按节点 quality_gates.L1 (lint+typecheck+unit) 验证
- 完成模块间集成（依赖注入、事件流等）
- 凡涉及契约变更必须回流到 04-implement-design 的 L2 phase_reset 重写知识，禁止"先实现再改契约"
