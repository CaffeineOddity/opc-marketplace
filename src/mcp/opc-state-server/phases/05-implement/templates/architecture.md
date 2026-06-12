# Architecture — <feature-name>

> Phase: 05-implement • Node: auth-integration / tdd-implementation / refactor
> 模板：每条决策含 why / before / after / 风险；版本化追加，不覆盖。

## 1. 决策日志（ADR-style，倒序）

### ADR-002: <决策标题>

- **日期**：YYYY-MM-DD
- **背景**：<为什么需要此决策；引用上下文>
- **选项**：
  - A: <选项 + 优缺点>
  - B: <选项 + 优缺点>
- **决策**：选 <A/B>
- **理由**：<量化或定性论据>
- **影响**：
  - **before**：<旧实现>
  - **after**：<新实现>
- **风险**：
  - <风险 + 缓解 + owner>

### ADR-001: <更早决策>

...

## 2. 关键组件拓扑

```
[Client] → [API Gateway] → [Service A] → [Repo] → [DB]
                        ↓
                    [Service B] → [Cache]
```

## 3. 横切关注点

- **认证**：<引用 auth-integration 的密码哈希 + token 策略>
- **日志**：<结构化 JSON；级别约定>
- **追踪**：<OTel + trace-id 透传方式>
- **错误**：<错误信封 + 重试策略>

## 4. 已知技术债

| 项 | 严重度 | 修复时机 |
|---|---|---|
| <如：sync 调用应改 async> | medium | 09-scale 阶段 |

## 5. 重构记录（refactor 节点追加）

| 日期 | 操作 | before → after | 覆盖率影响 |
|---|---|---|---|
| YYYY-MM-DD | <提取函数 X> | <旧名 → 新名> | 80% → 80% |

---
*多节点写入提示：本知识由多个节点追加，写入走 base_version + 3-way merge（见 [[project_knowledge_write_conflict]]）。架构破坏性演进归 09-scale 的 architecture-evolution 节点。*
