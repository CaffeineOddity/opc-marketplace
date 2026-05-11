---
name: 技术指南
description: 开发语言/框架确认、实现要点、关键决策与注意事项。
category: tech_guide
feature_name: dev-engineering
created_at: 2026-05-11T16:41:31.394Z
updated_at: 2026-05-12T10:00:00.000Z
tags: [tech_guide]
---
## 技术栈

### 语言支持

| 语言 | Lint 工具 | 适用场景 |
|------|-----------|----------|
| JavaScript/TypeScript | eslint | 前端开发、Node.js 后端 |
| Python | py_compile | 后端开发、AI/ML 工程 |
| Go | go vet | 后端开发、云原生应用 |
| Rust | cargo check | 系统编程、高性能服务 |

### 框架支持

**前端框架：**
- React/Next.js（推荐）
- Vue/Nuxt.js
- Svelte/SvelteKit
- shadcn/ui 组件库

**后端框架：**
- Node.js: Express, NestJS, Fastify
- Python: FastAPI, Django, Flask
- Go: Gin, Echo, Chi
- Rust: Actix, Rocket, Axum

**移动框架：**
- React Native（推荐）
- Flutter
- 原生 iOS (Swift/SwiftUI)
- 原生 Android (Kotlin/Compose)

### 依赖

**核心依赖：**
- Claude Code SDK
- MCP (Model Context Protocol)
- OpenAPI 3.1 规范

**工具依赖：**
- eslint（JavaScript/TypeScript lint）
- py_compile（Python 语法检查）
- go vet（Go 静态分析）
- cargo check（Rust 编译检查）

## 实现要点

### 1. 架构设计流程

```shell
/architect <feature or system>
```

生成内容：
- 系统概览（文本图表）
- 组件分解和职责
- 技术栈选型和理由
- 组件间数据流
- API 设计（端点、Schema）
- 数据模型（实体、关系、索引）
- 基础设施规划
- 风险评估

### 2. 代码审查流程

```shell
/code-review
```

审查维度：
- **Bug & 边界情况**：逻辑错误、未处理路径、并发问题
- **安全**：注入漏洞、认证授权、敏感数据暴露
- **性能**：冗余计算、N+1 查询、内存泄漏
- **可读性**：命名清晰度、复杂度、注释质量

输出格式：
```
- Severity: Critical / Warning / Info
- Category: Bug / Security / Performance / Readability
- Location: file:line
- Issue: One-sentence description
- Fix: Concrete suggestion or code snippet
```

### 3. 系统化调试方法

四阶段调试：

```
Phase 1: Root Cause Investigation
  - Read errors carefully
  - Reproduce the issue
  - Trace execution flow

Phase 2: Pattern Analysis
  - Find working examples
  - Compare with broken code
  - Identify differences

Phase 3: Hypothesis Testing
  - Form a theory
  - Test minimally
  - Validate or refute

Phase 4: Implementation
  - Create failing test
  - Implement fix
  - Verify test passes
```

### 4. TDD 开发流程

红-绿-重构循环：

```
RED Phase:
  1. Write failing test
  2. Verify it fails for the right reason

GREEN Phase:
  1. Write minimal implementation
  2. Verify test passes

REFACTOR Phase:
  1. Clean up code
  2. Verify tests still pass

VERIFY:
  /verification-before-completion
```

### 5. OpenAPI 规范生成

```shell
/openapi-spec <api description>
```

生成内容：
- OpenAPI 3.1 YAML/JSON
- 路径定义
- 请求/响应 Schema
- 认证配置
- 示例数据

### 6. 图表生成

```shell
/baoyu-diagram <description>
```

支持类型：
- 架构图：系统组件与关系
- 流程图：决策逻辑、流程步骤
- 时序图：时间顺序交互
- 思维导图：头脑风暴、主题探索
- 时间线：按时间排列的事件
- 状态机：状态转换

## 关键决策

### D1: 模型分层策略

**决策**：使用 opus/sonnet/inherit 三层模型策略

**理由**：
- opus 用于需要深度推理的任务（安全、AI）
- sonnet 用于平衡性能与质量的常规任务
- inherit 用于可复用调用者上下文的任务

### D2: TDD 优先原则

**决策**：所有功能实现遵循 TDD 流程

**理由**：
- 测试先行确保需求覆盖
- 重构阶段保证代码质量
- 验证协议确保实现正确

### D3: 安全左移

**决策**：安全审计 Agent 使用 opus 模型，贯穿开发全流程

**理由**：
- 早期发现安全漏洞成本更低
- OWASP Top 10 需要深度分析
- DevSecOps 最佳实践

### D4: 数据库优先架构

**决策**：database-architect 在 backend-architect 之前工作

**理由**：
- 数据模型是系统基础
- Schema 设计影响 API 设计
- 避免后期重构成本

### D5: 自动 Lint 钩子

**决策**：文件编辑后自动执行 lint

**理由**：
- 即时反馈减少问题积累
- 统一代码风格
- 提高代码质量

## 注意事项

### 常见问题

1. **架构文档过于复杂**
   - 解决：聚焦核心组件，避免过度设计
   - 原则：简单优先，按需扩展

2. **代码审查误报**
   - 解决：结合上下文判断，优先处理 Critical 级别
   - 原则：工具辅助，人工决策

3. **TDD 流程中断**
   - 解决：使用 /verification-before-completion 确保完整
   - 原则：不跳过验证步骤

4. **调试陷入循环**
   - 解决：使用 /systematic-debugging 四阶段方法
   - 原则：假设驱动，最小测试

### 最佳实践

1. **架构设计**
   - 从需求出发，不是从技术出发
   - 记录决策理由，不是只记录决策
   - 考虑演进路径，不是只考虑当前

2. **代码审查**
   - 优先处理安全和性能问题
   - 可读性问题要具体，不要笼统
   - 提供可执行的修复建议

3. **TDD 开发**
   - 测试要简洁，覆盖核心逻辑
   - 重构要渐进，保持测试通过
   - 验证要完整，不要跳过步骤

4. **性能优化**
   - 先测量，后优化
   - 关注瓶颈，不要过度优化
   - 保持可读性，不要牺牲维护性
