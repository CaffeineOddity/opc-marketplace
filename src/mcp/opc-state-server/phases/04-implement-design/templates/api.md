# API Contract — <feature-name>

> Phase: 04-implement-design • Node: api-design
> 模板：每个端点必须有 happy path + 异常列表 + 鉴权说明。

## 1. 总览

- **风格**：REST / GraphQL / RPC（择一）
- **Base URL**：`<https://api.example.com/v1>`
- **鉴权**：<Bearer JWT / Session Cookie / API Key>
- **错误信封统一格式**：

  ```json
  { "error": { "code": "STRING", "message": "STRING", "details": {} } }
  ```

## 2. 端点清单

### 2.1 `POST /endpoint`

- **目的**：<一句话>
- **鉴权**：<required / optional>
- **请求体**：

  ```json
  { "field": "type" }
  ```

- **响应 200**：

  ```json
  { "field": "type" }
  ```

- **错误**：

  | code | http | 触发 |
  |---|---|---|
  | VALIDATION_FAILED | 422 | 字段格式错误 |
  | UNAUTHORIZED | 401 | 未登录 / token 失效 |
  | RATE_LIMITED | 429 | 超限 |

- **happy path 示例**：

  ```bash
  curl -X POST .../endpoint -H "Authorization: Bearer ..." -d '{...}'
  ```

## 3. 速率限制

- <默认 60 req/min/IP；登录后 600 req/min/user>

## 4. 版本策略

- URL 内嵌 `/v1/`；破坏性变更 → `/v2/`，旧版本 ≥ 6 个月并行。
- 非破坏性字段新增不增版本号。

## 5. 与下游节点的约定

- `<unit>/<feature>/model` 中字段名与本契约请求/响应字段一致（蛇形 ↔ 驼峰映射在文档明确）。
- 05-implement 的 tdd-implementation / backend-endpoint / auth-integration 不得在未走 phase_reset 的情况下修改本契约。

---
*破坏性修改流程：发现需变更 → `opc_phase_reset({to:'04-implement-design', layer:'L2'})` → 本节点 v+1 → 下游 phase 重新执行。*
