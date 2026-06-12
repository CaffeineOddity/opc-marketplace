---
name: auth-integration
tags: [auth, backend]
description: 认证流程集成（密码哈希、Session/JWT、中间件、错误处理）
agents:
  primary: [backend-engineer]
  fallback: [security-engineer]
input:
  - path: <unit>/<feature>/api
    type: knowledge
  - path: <unit>/<feature>/model
    type: knowledge
output:
  - path: src/auth/
    type: artifact
  - path: <unit>/<feature>/architecture
    type: knowledge
quality_gates:
  L1: [build, lint, unit-test]
  L2: [test_pass, lint_pass]
always_show: false
---

## 认证集成节点

将 04-implement-design 产出的认证 API 与数据模型集成为可运行的认证流程。

### 执行步骤

1. **加载契约**：`opc_knowledge_get_batch` 拿到相关 `api` + `model` (min_version: 1)。
2. **密码处理**：选 bcrypt / argon2 / scrypt，参数化 cost。
3. **会话管理**：
   - Session-based：随机 token + 服务端 store + Cookie HttpOnly+Secure+SameSite
   - JWT-based：选签名算法（HS256/RS256）、过期、刷新策略
4. **中间件接入**：`requireAuth` / `optionalAuth` / 路由级权限。
5. **错误处理**：统一 envelope，区分 401 / 403 / 422。
6. **写知识**：在 `<unit>/<feature>/architecture` 记录决策（哈希算法、token 策略、cookie 配置），如已存在 v1 走 base_version + 3-way merge → v2。

### 与同 phase 节点的接口

- 与 `tdd-implementation` 频繁出现文件域冲突（`src/auth/`），node-resolver 自动降级为串行。
- 与 `security-review` 互为前置：本节点先实现，后由 security-review 审查。

### Quality Gates 同 tdd-implementation

### 不做的事

- 不修改 API 契约文件
- 不做安全审查（归 `security-review` 节点；本节点只是实现）
- 不做生产部署相关的密钥管理（归 `07-release`）
