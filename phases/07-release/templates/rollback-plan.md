# Rollback Plan — <feature-name>

> Phase: 07-release • Node: rollback-plan
> 模板：触发条件 + 路径 + dry-run 报告齐备；目标 ≤ 15 min。

## 1. 适用范围

- **本次发布版本**：v<x.y.z>
- **部署方式**：<canary / blue-green / rolling>
- **影响面**：<服务列表 / 受影响用户估算>

## 2. 触发条件（任一满足即触发）

| 指标 | 阈值 | 时间窗 | 检测来源 |
|---|---|---|---|
| 错误率 | > 1% | 连续 5 min | <slo-monitoring alert ID> |
| p95 | > 500ms | 连续 5 min | <alert ID> |
| 关键业务指标降幅 | > 30% | 单点 | <dashboard URL> |
| 用户报告 | ≥ 10 起 | 30 min | <on-call 渠道> |

## 3. 回滚路径

### 3.1 应用层

```bash
# step 1: 切流量回前一版本
<kubectl rollout undo deploy/foo>

# step 2: 验证健康检查
<curl https://api.../healthz>
```

- **预期耗时**：< 5 min
- **预期输出**：<示例输出>
- **故障分支**：若 step 2 失败 → <下一步>

### 3.2 数据层

- **schema 变更可逆性**：<可逆 / 不可逆>
- **若不可逆**：forward-fix 方案如下：
  - <SQL 修复脚本 / data backfill 步骤>
- **数据回滚 owner**：<人名>

## 4. Dry-Run 报告

- **执行日期**：YYYY-MM-DD
- **执行环境**：staging
- **总耗时**：<X min>
- **遇到问题**：<列表>
- **结论**：<符合 / 不符合 15 min 目标>

## 5. blast-radius 估算

- **受影响服务**：<列表>
- **受影响用户峰值**：<数字>
- **潜在数据丢失**：<是 / 否；若是则量化>

## 6. 责任人

- **执行人**：<人名>
- **审批人**：<人名>
- **通知渠道**：<列表>

---
*与 slo-monitoring 联动：本预案触发条件必须与 slo-monitoring 的 alert 规则一致或更早。*
