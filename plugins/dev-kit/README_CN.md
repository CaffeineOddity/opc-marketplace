# dev-kit

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
