# dev-kit

> [中文](#中文) | **English**

Development stage plugin — architecture, frontend, backend, security, mobile, database, and performance for the one-person company.

## Components

### Skills

| Skill | Description |
|-------|-------------|
| `/architect` | Architecture design document |
| `/code-review` | Code review (Bug / Security / Performance / Readability) |
| `/openapi-spec` | OpenAPI 3.1 spec generation |
| `/frontend-design` | Production-grade frontend interfaces with distinctive aesthetics |
| `/shadcn-ui` | shadcn/ui component integration and customization |
| `/mcp-builder` | MCP server development guide (Python/TypeScript) |
| `/systematic-debugging` | Four-phase debugging methodology |
| `/test-driven-development` | TDD red-green-refactor cycle |
| `/verification-before-completion` | Completion verification protocol |
| `/baoyu-diagram` | Professional SVG diagrams (architecture, flowchart, sequence, mind map, timeline) |

### Agents

| Agent | Model | Description |
|-------|-------|-------------|
| frontend-agent | sonnet | Frontend development, component architecture, performance |
| backend-agent | sonnet | Backend development, API, data layer, server architecture |
| backend-architect | inherit | API design, microservices, distributed systems |
| security-auditor | opus | DevSecOps, OWASP, security audit |
| mobile-developer | inherit | React Native / Flutter / Native development |
| database-architect | inherit | Data modeling, schema design, migration planning |
| performance-engineer | sonnet | Performance profiling, optimization, benchmarking |
| ai-engineer | opus | AI systems engineering, model deployment, MLOps |
| prompt-engineer | inherit | Prompt engineering, LLM optimization |
| technical-writer | sonnet | Technical documentation, API docs, developer guides |

### Hooks

| Hook | Description |
|------|-------------|
| auto-lint | Auto-lint on file edit (eslint / py_compile / go vet / cargo check) |

## Quick Start

### Architecture

```shell
/architect <feature or system>
```

Generates architecture document with:
- System overview
- Component breakdown
- API design
- Data model
- Infrastructure plan

### Code Review

```shell
/code-review
```

Reviews code across four dimensions:
- Bug & Edge Cases
- Security
- Performance
- Readability

### OpenAPI Spec

```shell
/openapi-spec <api description>
```

Generates OpenAPI 3.1 specification.

### Systematic Debugging

```shell
/systematic-debugging
```

Four-phase debugging:
1. **Root Cause Investigation** — Read errors, reproduce, trace
2. **Pattern Analysis** — Find working examples, compare
3. **Hypothesis Testing** — Form theory, test minimally
4. **Implementation** — Create test, fix, verify

### Test-Driven Development

```shell
/test-driven-development
```

Red-Green-Refactor cycle:
1. **RED** — Write failing test
2. **Verify RED** — Watch it fail correctly
3. **GREEN** — Write minimal code
4. **Verify GREEN** — Watch it pass
5. **REFACTOR** — Clean up

### Verification Before Completion

```shell
/verification-before-completion
```

Ensures:
- Tests actually pass
- Build succeeds
- Requirements met

## Agent Usage

### frontend-agent

Use for:
- UI implementation
- Component architecture
- State management
- Performance optimization (Core Web Vitals)

**Receives from:** ui-agent (design specs)
**Delivers to:** qa-agent (test cases)

### backend-agent

Use for:
- API development
- Database operations
- Server architecture
- Background jobs

**Receives from:** backend-architect (API design)
**Delivers to:** frontend-agent (API docs)

### security-auditor (opus)

Use for:
- Security audits
- OWASP compliance
- Vulnerability assessment
- DevSecOps practices

### ai-engineer (opus)

Use for:
- AI/ML system design
- Model deployment
- MLOps pipelines
- LLM integration

## Workflow Integration

### TDD + SDD Implementation Flow

**When implementing any feature in dev-kit, follow this sequence:**

```
┌─────────────────────────────────────────────────────────┐
│ Phase 1: SPEC (from product-kit)                        │
│   /spec-driven-development                              │
│   Output: Interface Contract, Data Model, Behavior Rules│
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 2: ARCHITECTURE                                   │
│   /architect                                            │
│   Output: System design, component structure            │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 3: TDD IMPLEMENTATION                             │
│   For each spec item:                                   │
│   1. /test-driven-development → RED (write failing test)│
│   2. Implement minimal code → GREEN                     │
│   3. Refactor → REFACTOR                                │
│   4. /verification-before-completion                    │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 4: QUALITY                                        │
│   /code-review → /systematic-debugging (if issues)      │
│   qa-kit: /test-plan → /e2e-test                        │
└─────────────────────────────────────────────────────────┘
```

### SDD + TDD Flow (Simple View)

```
product-kit: /spec-driven-development
    ↓
dev-kit: /architect → /test-driven-development
    ↓
qa-kit: /test-plan → /verification-before-completion
```

### TDD for Each Spec Item

```markdown
For each item in the specification:

1. **Derive Test Case**
   - Spec: "GET /api/users returns paginated list"
   - Test: test_list_users_pagination()

2. **RED Phase**
   - Write failing test
   - Verify it fails for the right reason

3. **GREEN Phase**
   - Write minimal implementation
   - Verify test passes

4. **REFACTOR Phase**
   - Clean up code
   - Verify tests still pass

5. **Verify**
   - /verification-before-completion
   - Does implementation match spec?
```

### Diagram Generation

```shell
/baoyu-diagram <description>
```

Creates professional SVG diagrams:
- **Architecture** — System components & relationships
- **Flowchart** — Decision logic, process steps
- **Sequence** — Time-ordered interactions
- **Mind Map** — Brainstorming, topic exploration
- **Timeline** — Chronological events
- **State Machine** — State transitions

### Full Development Pipeline

```
/architect → frontend-agent + backend-agent (parallel)
    ↓
/code-review → /systematic-debugging (if issues)
    ↓
/verification-before-completion
```

## Debugging Workflow

```
Bug Found
    │
    ├── /systematic-debugging (find root cause)
    │
    ├── /test-driven-development (write failing test)
    │
    ├── Fix implementation
    │
    └── /verification-before-completion (verify fix)
```

---

## 中文

开发阶段插件 —— 一人公司的架构、前端、后端、安全、移动端、数据库和性能优化。

## 组件

### 技能

| 技能 | 描述 |
|------|------|
| `/architect` | 架构设计文档 |
| `/code-review` | 代码审查 (Bug / 安全 / 性能 / 可读性) |
| `/openapi-spec` | OpenAPI 3.1 规范生成 |
| `/frontend-design` | 生产级前端界面 |
| `/shadcn-ui` | shadcn/ui 组件集成和定制 |
| `/mcp-builder` | MCP 服务器开发指南 (Python/TypeScript) |
| `/systematic-debugging` | 四阶段调试方法论 |
| `/test-driven-development` | TDD 红绿重构循环 |
| `/verification-before-completion` | 完成验证协议 |
| `/baoyu-diagram` | 专业 SVG 图表（架构图、流程图、时序图、思维导图、时间线） |

### 代理

| 代理 | 模型 | 描述 |
|------|------|------|
| frontend-agent | sonnet | 前端开发、组件架构、性能优化 |
| backend-agent | sonnet | 后端开发、API、数据层、服务架构 |
| backend-architect | inherit | API 设计、微服务、分布式系统 |
| security-auditor | opus | DevSecOps、OWASP、安全审计 |
| mobile-developer | inherit | React Native / Flutter / 原生开发 |
| database-architect | inherit | 数据建模、Schema 设计、迁移规划 |
| performance-engineer | sonnet | 性能分析、优化、基准测试 |
| ai-engineer | opus | AI 系统工程、模型部署、MLOps |
| prompt-engineer | inherit | 提示词工程、LLM 优化 |
| technical-writer | sonnet | 技术文档、API 文档、开发指南 |

## 快速开始

### 架构设计

```shell
/architect <功能或系统>
```

生成架构文档：
- 系统概览
- 组件分解
- API 设计
- 数据模型
- 基础设施规划

### 代码审查

```shell
/code-review
```

四个维度审查代码：
- Bug 和边缘情况
- 安全问题
- 性能问题
- 可读性

### 系统化调试

```shell
/systematic-debugging
```

四阶段调试：
1. **根因调查** — 阅读错误、复现、追踪
2. **模式分析** — 找工作示例、对比
3. **假设测试** — 形成理论、最小测试
4. **实现** — 创建测试、修复、验证

### 测试驱动开发

```shell
/test-driven-development
```

红绿重构循环：
1. **RED** — 写失败测试
2. **验证 RED** — 确认正确失败
3. **GREEN** — 写最小代码
4. **验证 GREEN** — 确认通过
5. **REFACTOR** — 重构清理

## 工作流集成

### TDD + SDD 实现流程

**在 dev-kit 实现任何功能时，遵循以下顺序：**

```
┌─────────────────────────────────────────────────────────┐
│ 阶段 1: 规范 (来自 product-kit)                          │
│   /spec-driven-development                              │
│   输出: 接口契约、数据模型、行为规则                      │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 阶段 2: 架构                                            │
│   /architect                                            │
│   输出: 系统设计、组件结构                               │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 阶段 3: TDD 实现                                        │
│   对每个规范项:                                          │
│   1. /test-driven-development → RED (写失败测试)        │
│   2. 实现最小代码 → GREEN                                │
│   3. 重构 → REFACTOR                                    │
│   4. /verification-before-completion                    │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 阶段 4: 质量                                            │
│   /code-review → /systematic-debugging (如有问题)       │
│   qa-kit: /test-plan → /e2e-test                        │
└─────────────────────────────────────────────────────────┘
```

### SDD + TDD 流程 (简化视图)

```
product-kit: /spec-driven-development
    ↓
dev-kit: /architect → /test-driven-development
    ↓
qa-kit: /test-plan → /verification-before-completion
```

### 每个规范项的 TDD 流程

```markdown
对规范中的每一项:

1. **推导测试用例**
   - 规范: "GET /api/users 返回分页列表"
   - 测试: test_list_users_pagination()

2. **RED 阶段**
   - 写失败测试
   - 确认因正确原因失败

3. **GREEN 阶段**
   - 写最小实现
   - 确认测试通过

4. **REFACTOR 阶段**
   - 清理代码
   - 确认测试仍通过

5. **验证**
   - /verification-before-completion
   - 实现是否符合规范？
```

### 调试工作流

```
发现 Bug
    │
    ├── /systematic-debugging (找根因)
    │
    ├── /test-driven-development (写失败测试)
    │
    ├── 修复实现
    │
    └── /verification-before-completion (验证修复)
```
