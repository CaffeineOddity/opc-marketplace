---
phase: 07-release
name: 发布
description: 部署、CI/CD、回滚预案
order:
  prev: 06-testing
  next: 08-growth
---

## 目标

将 06-testing 通过的版本以可观测、可回滚的方式上线到生产环境，并把上线后的 SLO 监控接入。

## 职责

- 设计/更新 CI/CD 流水线（构建、镜像、签名、灰度策略）
- 准备回滚预案与故障演练（runbook）
- 完成生产部署并验证关键 SLO 指标
- 凡上线引入新的 ops 资产（dashboard、alert）需写入 opc-knowledge 供 09-scale 使用
