---
name: database-schema
tags: [database, backend]
description: 设计数据库表结构、索引、迁移策略
agents:
  primary: [backend-engineer]
  fallback: [database-administrator]
input:
  - path: <unit>/<feature>/api
    type: knowledge
output:
  - path: <unit>/<feature>/model
    type: knowledge
  - path: <unit>/<feature>/architecture
    type: knowledge
quality_gates:
  L1: []
  L2: []
always_show: false
---

## 数据库设计节点

依据 `api-design` 节点产出的端点契约推导数据库表结构、索引、迁移策略。

### 执行步骤

1. **读 api-design output**：`opc_knowledge_get_batch` 拿到所有相关 `<unit>/<feature>/api`。
2. **推导实体**：识别 API 中的资源、关联与生命周期事件。
3. **设计表结构**：
   - 字段名、类型、约束、默认值、可空性
   - 主键、外键、唯一约束、联合索引
   - 标准列（created_at / updated_at / soft delete）
4. **设计索引策略**：基于 API 查询模式（高频 WHERE / ORDER BY / JOIN）。
5. **迁移策略**：
   - 新建表 → forward-only migration
   - 改字段 → 双写 / shadow column / cutover 步骤
6. **写知识**：
   - `<unit>/<feature>/model` — SQL DDL + 字段说明
   - `<unit>/<feature>/architecture` — 关键流程（如密码哈希、会话签发）的架构图与决策记录

### 输出契约

| 路径 | 内容 |
|---|---|
| `<unit>/<feature>/model` | `CREATE TABLE` SQL + 字段语义说明 |
| `<unit>/<feature>/architecture` | 处理流程、安全决策、性能权衡 |

### 与下游节点的接口

- `tdd-implementation`（05-implement）读取本节点输出生成 ORM 模型与 migration 文件。
- `integration-test`（06-testing）读取 architecture 节点验证流程覆盖。

### 不做的事

- 不写真实迁移文件（归 `tdd-implementation`，由 ORM 工具生成）
- 不创建 seed 数据（归 05-implement）
- 不调整 API 契约（如有冲突，回到本阶段重写 `api-design` 输出后再继续）
