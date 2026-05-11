---
name: API 指南
description: 开发工程 Skills API 规范，包括架构设计、代码审查、OpenAPI 规范生成、系统化调试、TDD 开发流程、完成验证和图表生成等能力。
category: api_guide
feature_name: dev-engineering
created_at: 2026-05-12T10:00:00.000Z
updated_at: 2026-05-12T10:00:00.000Z
tags: [api_guide]
---

## 概览

dev-kit 通过 Skills 和 Agents 提供完整的开发工程支持。Skills 提供结构化的方法论和模板，Agents 提供智能化的实现能力。

### Skills API

| Skill | 命令 | 描述 |
|-------|------|------|
| `/architect` | `/architect <feature>` | 架构设计文档生成 |
| `/code-review` | `/code-review` | 代码审查（Bug/安全/性能/可读性） |
| `/openapi-spec` | `/openapi-spec <api>` | OpenAPI 3.1 规范生成 |
| `/frontend-design` | `/frontend-design <spec>` | 生产级前端界面生成 |
| `/shadcn-ui` | `/shadcn-ui <component>` | shadcn/ui 组件集成 |
| `/mcp-builder` | `/mcp-builder` | MCP 服务器开发指南 |
| `/systematic-debugging` | `/systematic-debugging` | 四阶段调试方法论 |
| `/test-driven-development` | `/test-driven-development` | TDD 红绿重构循环 |
| `/verification-before-completion` | `/verification-before-completion` | 完成验证协议 |
| `/baoyu-diagram` | `/baoyu-diagram <type>` | 专业 SVG 图表生成 |

### Agents API

| Agent | 调用方式 | 描述 |
|-------|----------|------|
| frontend-agent | Agent tool | 前端开发、组件架构、性能优化 |
| backend-agent | Agent tool | 后端开发、API、数据层、服务架构 |
| backend-architect | Agent tool | API 设计、微服务、分布式系统 |
| security-auditor | Agent tool (opus) | DevSecOps、OWASP、安全审计 |
| mobile-developer | Agent tool | React Native/Flutter/原生开发 |
| database-architect | Agent tool | 数据建模、Schema设计、迁移规划 |
| performance-engineer | Agent tool | 性能分析、优化、基准测试 |
| ai-engineer | Agent tool (opus) | AI 系统工程、模型部署、MLOps |
| prompt-engineer | Agent tool | 提示词工程、LLM 优化 |
| technical-writer | Agent tool | 技术文档、API 文档、开发指南 |

## 认证与授权

dev-kit 继承 Claude Code 的认证机制，无需额外配置。

### 模型访问

| 模型 | 用途 | 访问要求 |
|------|------|----------|
| opus | security-auditor, ai-engineer | 需要 Opus 访问权限 |
| sonnet | frontend-agent, backend-agent 等 | 需要 Sonnet 访问权限 |
| haiku | seo-keyword-strategist 等 | 需要 Haiku 访问权限 |
| inherit | 继承调用者模型 | 无额外要求 |

## Skills API 详细规范

### /architect - 架构设计

**描述**: 从需求和设计规格生成架构设计文档。

**调用方式**:
```
/architect <feature or system>
```

**参数**:

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| feature | string | 是 | 功能或系统描述 |

**输出结构**:

```markdown
# 架构文档

## 1. 需求分析
- 功能需求摘要
- 非功能需求（性能、规模、安全）
- 技术约束和现有系统上下文

## 2. 高层架构
- 系统概览图（文本图表）
- 组件分解和职责
- 技术栈选型及理由
- 数据流图

## 3. API 设计
- API 端点和方法
- 请求/响应 Schema
- 认证授权模型
- 错误处理约定

## 4. 数据模型
- 实体定义和关系
- 数据库 Schema（表、索引）
- 缓存策略
- 数据迁移考虑

## 5. 基础设施
- 部署架构
- 环境策略（dev/staging/prod）
- 监控告警计划
- 扩展策略

## 6. 风险评估
- 技术风险和缓解策略
- 性能瓶颈关注点
- 安全考虑
- 依赖风险
```

**示例**:

```
/architect 用户认证系统

# 输出架构文档包含：
# - 前后端分离架构图
# - JWT 认证流程
# - PostgreSQL Schema
# - Redis 缓存策略
# - 部署架构
```

### /code-review - 代码审查

**描述**: 审查代码的 Bug、安全、性能和可读性问题。

**调用方式**:
```
/code-review
```

**审查维度**:

| 维度 | 检查项 |
|------|--------|
| Bug & Edge Cases | 逻辑错误、边界条件、空值风险、并发问题 |
| Security | 注入漏洞、认证授权、敏感数据暴露 |
| Performance | 不必要重渲染、N+1 查询、内存泄漏 |
| Readability | 命名清晰度、复杂度、注释质量 |

**输出格式**:

```markdown
## Bug & Edge Cases

### [Critical] 空值未处理
- **Location:** auth.js:45
- **Issue:** user.profile 可能为 undefined
- **Fix:** 添加空值检查或使用可选链

### [Warning] 边界条件缺失
- **Location:** utils.js:12
- **Issue:** 数组长度为 0 时未处理
- **Fix:** 添加空数组检查

## Security

### [Critical] SQL 注入风险
- **Location:** db.js:78
- **Issue:** 直接拼接用户输入
- **Fix:** 使用参数化查询

## Performance

### [Warning] N+1 查询
- **Location:** api.js:120
- **Issue:** 循环中执行数据库查询
- **Fix:** 使用批量查询或 JOIN

## Readability

### [Info] 函数过长
- **Location:** service.js:200-350
- **Issue:** 函数超过 150 行
- **Fix:** 拆分为多个小函数
```

### /openapi-spec - OpenAPI 规范生成

**描述**: 生成 OpenAPI 3.1 规范文档。

**调用方式**:
```
/openapi-spec <api description>
```

**参数**:

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| api description | string | 是 | API 功能描述 |

**输出格式**:

```yaml
openapi: 3.1.0
info:
  title: User Management API
  description: |
    API for managing users and their profiles.

    ## Authentication
    All endpoints require Bearer token authentication.

    ## Rate Limiting
    - 1000 requests per minute for standard tier
    - 10000 requests per minute for enterprise tier
  version: 2.0.0
  contact:
    name: API Support
    email: api-support@example.com

servers:
  - url: https://api.example.com/v2
    description: Production
  - url: https://staging-api.example.com/v2
    description: Staging

tags:
  - name: Users
    description: User management operations
  - name: Profiles
    description: User profile operations

paths:
  /users:
    get:
      operationId: listUsers
      summary: List all users
      tags:
        - Users
      parameters:
        - $ref: "#/components/parameters/PageParam"
        - $ref: "#/components/parameters/LimitParam"
      responses:
        "200":
          description: Successful response
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/UserListResponse"
        "401":
          $ref: "#/components/responses/Unauthorized"
      security:
        - bearerAuth: []

    post:
      operationId: createUser
      summary: Create a new user
      tags:
        - Users
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/CreateUserRequest"
      responses:
        "201":
          description: User created successfully
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/User"
        "400":
          $ref: "#/components/responses/BadRequest"

components:
  schemas:
    User:
      type: object
      required:
        - id
        - email
        - name
      properties:
        id:
          type: string
          format: uuid
        email:
          type: string
          format: email
        name:
          type: string
          minLength: 1
          maxLength: 100

  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
```

### /systematic-debugging - 系统化调试

**描述**: 四阶段调试方法论，确保找到根因后再修复。

**调用方式**:
```
/systematic-debugging
```

**铁律**:

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

**四阶段流程**:

| 阶段 | 活动 | 成功标准 |
|------|------|----------|
| 1. Root Cause | 读错误、复现、检查变更、收集证据 | 理解 WHAT 和 WHY |
| 2. Pattern | 找工作示例、对比 | 识别差异 |
| 3. Hypothesis | 形成理论、最小测试 | 确认或新假设 |
| 4. Implementation | 创建测试、修复、验证 | Bug 解决，测试通过 |

**输出格式**:

```markdown
## Phase 1: Root Cause Investigation

### Error Analysis
- 错误信息：TypeError: Cannot read property 'id' of undefined
- 位置：auth.js:45
- 复现步骤：用户未登录时访问 /profile

### Evidence Gathering
- 添加日志：console.log('user:', user)
- 运行结果：user is undefined when token missing

### Root Cause
- user 变量在 token 缺失时未初始化

## Phase 2: Pattern Analysis

### Working Examples
- auth.js:30 - 有 token 时的处理正确

### Differences
- 缺少 token 时的初始化逻辑

## Phase 3: Hypothesis Testing

### Hypothesis
- 在 token 验证失败时，应返回 null 或抛出错误

### Test
- 添加 token 缺失的测试用例
- 结果：测试失败，确认假设

## Phase 4: Implementation

### Failing Test
```javascript
test('returns null when token is missing', () => {
  const result = authenticate(null);
  expect(result).toBeNull();
});
```

### Fix
```javascript
function authenticate(token) {
  if (!token) return null;
  // ... existing logic
}
```

### Verification
- 测试通过
- 其他测试未受影响
```

### /test-driven-development - TDD 开发流程

**描述**: 红绿重构循环，确保测试先行。

**调用方式**:
```
/test-driven-development
```

**铁律**:

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

**红绿重构循环**:

```
RED → Verify RED → GREEN → Verify GREEN → REFACTOR → Repeat
```

| 阶段 | 活动 | 要求 |
|------|------|------|
| RED | 写失败测试 | 一个行为、清晰命名、真实代码 |
| Verify RED | 确认失败 | 失败原因正确（功能缺失，非语法错误） |
| GREEN | 最小代码 | 最简单实现，不过度设计 |
| Verify GREEN | 确认通过 | 测试通过、其他测试未受影响 |
| REFACTOR | 清理代码 | 去除重复、改进命名、提取辅助函数 |

**示例**:

```markdown
## RED - Write Failing Test

```typescript
test('retries failed operations 3 times', async () => {
  let attempts = 0;
  const operation = () => {
    attempts++;
    if (attempts < 3) throw new Error('fail');
    return 'success';
  };

  const result = await retryOperation(operation);

  expect(result).toBe('success');
  expect(attempts).toBe(3);
});
```

## Verify RED

```bash
$ npm test
FAIL: expected 'success', got Error: fail
```

## GREEN - Minimal Code

```typescript
async function retryOperation<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; i < 3; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === 2) throw e;
    }
  }
  throw new Error('unreachable');
}
```

## Verify GREEN

```bash
$ npm test
PASS: 34/34 tests pass
```

## REFACTOR

- 提取 retry 逻辑为可配置函数
- 添加 maxRetries 参数
```

### /verification-before-completion - 完成验证

**描述**: 完成验证协议，确保证据优先于声明。

**调用方式**:
```
/verification-before-completion
```

**铁律**:

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

**门禁函数**:

```
BEFORE claiming any status:
1. IDENTIFY: What command proves this claim?
2. RUN: Execute the FULL command
3. READ: Full output, check exit code
4. VERIFY: Does output confirm the claim?
5. ONLY THEN: Make the claim
```

**验证清单**:

| 声明 | 需要 | 不充分 |
|------|------|--------|
| Tests pass | 测试输出：0 failures | "应该通过" |
| Linter clean | Linter 输出：0 errors | 部分检查 |
| Build succeeds | 构建输出：exit 0 | Linter 通过 |
| Bug fixed | 原症状测试通过 | 代码修改 |
| Requirements met | 逐项检查清单 | 测试通过 |

**示例**:

```markdown
## Verification Before Completion

### Tests
```
✅ [Run npm test] [See: 34/34 pass] "All tests pass"
❌ "Should pass now" / "Looks correct"
```

### Build
```
✅ [Run npm build] [See: exit 0] "Build passes"
❌ "Linter passed" (linter ≠ compiler)
```

### Regression Test (TDD Red-Green)
```
✅ Write → Run (pass) → Revert fix → Run (MUST FAIL) → Restore → Run (pass)
❌ "I've written a regression test" (without red-green verification)
```
```

### /baoyu-diagram - 图表生成

**描述**: 生成专业 SVG 图表，支持多种图表类型。

**调用方式**:
```
/baoyu-diagram <description>
```

**参数**:

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| description | string | 是 | 图表描述，包含类型和内容 |

**支持类型**:

| 类型 | 用途 | 特点 |
|------|------|------|
| architecture | 系统架构 | 分组框、连接箭头、区域边界 |
| flowchart | 决策逻辑 | 菱形决策、圆角步骤、方向流 |
| sequence | 时序交互 | 垂直生命线、水平消息、激活条 |
| structural | 结构图 | 分隔框、类型关系（继承、组合） |
| mindmap | 思维导图 | 中心节点、辐射分支、有机布局 |
| timeline | 时间线 | 水平/垂直轴、事件标记、时段跨度 |
| illustrative | 概念图 | 自由布局、图标、注释、视觉隐喻 |
| statemachine | 状态机 | 圆角状态、标记转换、开始/结束标记 |
| dataflow | 数据流 | 处理气泡、数据存储、外部实体 |

**颜色系统**:

| 类别 | 填充 | 边框 | 用途 |
|------|------|------|------|
| Primary | rgba(8,51,68,0.4) | #22d3ee | 前端、用户界面 |
| Secondary | rgba(6,78,59,0.4) | #34d399 | 后端、服务 |
| Tertiary | rgba(76,29,149,0.4) | #a78bfa | 数据库、存储 |
| Accent | rgba(120,53,15,0.3) | #fbbf24 | 云、基础设施 |
| Alert | rgba(136,19,55,0.4) | #fb7185 | 安全、错误 |

**输出**:

- 单个 `.svg` 文件
- 自包含样式和字体
- 同时生成 @2x PNG

**示例**:

```
/baoyu-diagram 用户认证系统架构图

# 输出 SVG 文件：
# - 前端组件（Primary 颜色）
# - 后端 API（Secondary 颜色）
# - PostgreSQL（Tertiary 颜色）
# - Redis 缓存（Tertiary 颜色）
# - AWS 区域（Accent 颜色）
```

## Agents API 详细规范

### Agent 调用格式

```json
{
  "agent": "<agent-name>",
  "task": "<task-description>",
  "context": {
    "knowledge": "<knowledge-context>",
    "constraints": ["<constraint-1>", "<constraint-2>"]
  }
}
```

### frontend-agent

**描述**: 前端开发 Agent，负责 UI 实现、组件架构、性能优化。

**调用示例**:

```json
{
  "agent": "frontend-agent",
  "task": "实现用户登录页面，包含表单验证和错误提示",
  "context": {
    "design_spec": "设计规范文档",
    "api_docs": "API 文档"
  }
}
```

**能力范围**:

- React/Vue/Angular 组件开发
- TypeScript 类型定义
- 状态管理（Redux/Vuex/MobX）
- CSS/SCSS/Tailwind 样式
- 性能优化（懒加载、缓存）
- 测试编写（Jest/Vitest）

### backend-agent

**描述**: 后端开发 Agent，负责 API、数据层、服务架构。

**调用示例**:

```json
{
  "agent": "backend-agent",
  "task": "实现用户认证 API，包含登录、注册、密码重置",
  "context": {
    "architecture_doc": "架构文档",
    "database_schema": "数据库 Schema"
  }
}
```

**能力范围**:

- Node.js/Python/Go/Java 后端
- RESTful API 设计
- 数据库操作（SQL/NoSQL）
- 认证授权（JWT/OAuth）
- 缓存策略（Redis/Memcached）
- API 测试

### backend-architect

**描述**: 后端架构 Agent，负责 API 设计、微服务、分布式系统。

**调用示例**:

```json
{
  "agent": "backend-architect",
  "task": "设计微服务架构，包含服务拆分和通信方案",
  "context": {
    "requirement": "需求文档",
    "scale_requirements": "性能和规模要求"
  }
}
```

**能力范围**:

- 微服务架构设计
- API 契约设计
- 分布式系统模式
- 服务通信（gRPC/REST/消息队列）
- 数据一致性方案

### security-auditor (opus)

**描述**: 安全审计 Agent，负责 DevSecOps、OWASP、安全审计。

**调用示例**:

```json
{
  "agent": "security-auditor",
  "task": "审计认证系统的安全性，检查 OWASP Top 10",
  "context": {
    "code_files": ["auth.js", "user.js"],
    "config_files": ["config.yaml"]
  }
}
```

**能力范围**:

- OWASP Top 10 检查
- 认证授权审计
- 加密和密钥管理
- 输入验证审计
- 安全配置检查
- 渗透测试建议

**模型要求**: 需要 Opus 访问权限。

### mobile-developer

**描述**: 移动开发 Agent，负责 React Native/Flutter/原生开发。

**调用示例**:

```json
{
  "agent": "mobile-developer",
  "task": "实现 iOS 登录页面，支持 Face ID",
  "context": {
    "design_spec": "移动端设计规范",
    "api_docs": "API 文档"
  }
}
```

**能力范围**:

- React Native 开发
- Flutter 开发
- iOS 原生开发（Swift）
- Android 原生开发（Kotlin）
- 移动端性能优化
- 平台特性集成

### database-architect

**描述**: 数据库架构 Agent，负责数据建模、Schema 设计、迁移规划。

**调用示例**:

```json
{
  "agent": "database-architect",
  "task": "设计用户认证系统的数据库 Schema",
  "context": {
    "requirement": "需求文档",
    "scale_requirements": "数据规模预估"
  }
}
```

**能力范围**:

- 数据建模（ER 图）
- Schema 设计
- 索引优化
- 查询优化
- 数据迁移规划
- 分库分表方案

### performance-engineer

**描述**: 性能工程 Agent，负责性能分析、优化、基准测试。

**调用示例**:

```json
{
  "agent": "performance-engineer",
  "task": "分析登录页面的性能瓶颈，提供优化方案",
  "context": {
    "code_files": ["Login.tsx", "auth.ts"],
    "metrics": "当前性能指标"
  }
}
```

**能力范围**:

- 性能分析
- 基准测试
- 性能优化建议
- 资源监控
- 缓存策略
- 负载测试

### ai-engineer (opus)

**描述**: AI 工程 Agent，负责 AI 系统工程、模型部署、MLOps。

**调用示例**:

```json
{
  "agent": "ai-engineer",
  "task": "设计 AI 模型部署架构，包含模型服务化和监控",
  "context": {
    "model_spec": "模型规格",
    "scale_requirements": "推理规模要求"
  }
}
```

**能力范围**:

- 模型部署架构
- MLOps 流程
- 模型服务化
- 推理优化
- 模型监控
- 数据管道设计

**模型要求**: 需要 Opus 访问权限。

### technical-writer

**描述**: 技术文档 Agent，负责技术文档、API 文档、开发指南。

**调用示例**:

```json
{
  "agent": "technical-writer",
  "task": "编写用户认证 API 的完整文档",
  "context": {
    "api_spec": "OpenAPI 规范",
    "code_files": ["auth.js"]
  }
}
```

**能力范围**:

- API 文档编写
- 开发指南编写
- 架构文档编写
- 用户手册编写
- FAQ 编写
- 文档格式化

## 错误处理

### 常见错误

| 错误码 | 描述 | 解决方案 |
|--------|------|----------|
| MODEL_NOT_AVAILABLE | 模型不可用 | 检查模型访问权限 |
| CONTEXT_TOO_LARGE | 上下文过大 | 减少输入内容 |
| SKILL_NOT_FOUND | Skill 不存在 | 检查 Skill 名称 |
| AGENT_NOT_AVAILABLE | Agent 不可用 | 检查 Agent 配置 |
| VERIFICATION_FAILED | 验证失败 | 检查测试/构建输出 |

### 错误响应格式

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "错误描述",
    "details": "详细信息"
  }
}
```

## 最佳实践

### Skills 使用

- `/architect` 在开发前使用，生成架构文档
- `/code-review` 在提交前使用，检查代码质量
- `/openapi-spec` 在 API 开发前使用，定义契约
- `/systematic-debugging` 在遇到 Bug 时使用，找到根因
- `/test-driven-development` 在实现功能时使用，测试先行
- `/verification-before-completion` 在完成前使用，验证证据

### Agents 使用

- 使用 `opc_handoff` 在 Agent 间传递上下文
- 使用知识库存储 Agent 输出
- 选择合适的模型（Opus 用于复杂任务）
- 明确任务描述和约束

### 开发流程

```
1. /architect → 架构设计
2. /openapi-spec → API 契约
3. /test-driven-development → RED
4. Agent → GREEN
5. /code-review → 审查
6. /verification-before-completion → 验证
```

## 参考链接

- [任务编排 API](../opc-task-orchestration/api_guide/main.md)
- [状态持久化 API](../state-persistence/api_guide/main.md)
- [知识库管理 API](../knowledge-library/api_guide/main.md)