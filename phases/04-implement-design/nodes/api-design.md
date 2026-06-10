---
name: api-design
tags: [api, backend]
description: 设计 RESTful/GraphQL 端点、请求/响应格式、错误码、鉴权策略
agents:
  primary: [backend-engineer]
  fallback: [fullstack-engineer]
input: []
output:
  - path: <unit>/<feature>/api
    type: knowledge
quality_gates:
  L1: []
  L2: []
always_show: false
---

## API 设计节点

根据 brief.md 与已有架构（opc-knowledge）设计 RESTful / GraphQL / RPC 端点契约。**只产出契约，不写实现**。

### 执行步骤

1. **读 brief**：理解任务范围、约束、目标用户。
2. **梳理资源 / 操作**：识别 CRUD 主体与领域动词（如 `register`, `login`, `logout`）。
3. **定义端点**：
   - HTTP method + path + 路径参数 + 查询参数
   - request body / response body schema（含字段类型、必填、示例）
   - 错误码与错误响应结构（统一 envelope）
   - 鉴权方式（None / Bearer / Session）与速率限制策略
4. **逐条写知识**：每个 endpoint 一条 `opc_knowledge_write({unit, section: <feature>, subsection: 'api', content})`。

### 输出契约

每条输出路径形如 `<unit>/<feature>/api`，例如：

- `user-auth/register/api`
- `user-auth/login/api`
- `user-auth/session/api`

知识体内必含：endpoint 表 / request schema / response schema / 错误码表。

### 与下游节点的接口

- `database-schema` 读取本节点输出推导表结构；本节点 output 是 schema 节点 input。
- `tdd-implementation`（05-implement）读取本节点输出作为接口契约，禁止在实现节点反向修改 API（必须 L2 `opc_phase_reset` 回到本阶段）。

### 不做的事

- 不写代码、不创建路由文件（归 `tdd-implementation`）
- 不设计表结构（归 `database-schema`）
- 不写 OpenAPI 完整 spec 文件（除非 brief 明确要求）；本阶段只产出可读契约
