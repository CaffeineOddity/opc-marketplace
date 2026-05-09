---
name: OPC Knowledge 扩展开发指南
description: 描述如何扩展 OPC Knowledge 系统，包括添加新工具、新工作流和新知识类别的详细指南。
category: tech-doc
topic: opc-state
created_at: 2026-05-09T09:04:10.449Z
updated_at: 2026-05-09T09:04:10.449Z
tags: [extension, development, plugin, workflow]
---
# OPC Knowledge 扩展开发指南

## 概述

本文档描述如何扩展 OPC Knowledge 系统，包括添加新工具、新工作流和新知识类别。

## 添加新 MCP 工具

### 步骤 1: 定义工具 Schema

在 `src/mcp/tools.ts` 中添加工具定义：

```typescript
const myNewTools: Tool[] = [
  {
    name: 'opc_my_tool',
    description: '工具描述',
    inputSchema: {
      type: 'object',
      properties: {
        param1: { type: 'string', description: '参数1描述' },
        param2: { type: 'number', description: '参数2描述' },
        workingDirectory: { type: 'string' },
      },
      required: ['param1'],
    },
  },
];

// 添加到导出
export const tools: Tool[] = [
  ...stateTools,
  ...handoffTools,
  ...sessionTools,
  ...taskGroupTools,
  ...workflowTools,
  ...knowledgeTools,
  ...myNewTools,  // 新增
];
```

### 步骤 2: 实现 Handler

在 `src/mcp/handlers/` 中创建 handler：

```typescript
// src/mcp/handlers/my-tool.ts
export async function handleMyTool(args: Record<string, unknown>): Promise<McpResponse> {
  const param1 = args.param1 as string;
  const param2 = args.param2 as number | undefined;
  const cwd = args.workingDirectory as string | undefined;
  
  try {
    // 实现工具逻辑
    const result = doSomething(param1, param2, cwd);
    
    return {
      content: [{ type: 'text', text: `Result: ${result}` }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true,
    };
  }
}
```

### 步骤 3: 注册 Handler

在 `src/mcp/handlers/index.ts` 中注册：

```typescript
import { handleMyTool } from './my-tool.js';

export async function handleToolCall(name: string, args: Record<string, unknown>): Promise<McpResponse> {
  switch (name) {
    // 现有 handlers...
    
    case 'opc_my_tool':
      return handleMyTool(args);
    
    default:
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      };
  }
}
```

### 步骤 4: 构建和测试

```bash
# 构建
npm run build

# 测试
npm test
```

---

## 添加新工作流

### 工作流文件结构

在 `.opc/workflows/` 目录下创建 JSON 文件：

```json
{
  "name": "my-workflow",
  "description": "工作流描述",
  "triggers": {
    "keywords": ["关键词1", "关键词2"],
    "patterns": ["正则模式1", "正则模式2"]
  },
  "pipeline": [
    {
      "stage": "product",
      "required": true,
      "agents": ["product-agent"],
      "skills": ["spec-driven-development"],
      "knowledge": {
        "domain": "requirement",
        "doc": "main",
        "write_after": true
      }
    },
    {
      "stage": "dev",
      "required": true,
      "agents": ["frontend-agent", "backend-agent"],
      "agent_mode": "parallel",
      "constraints": ["tdd_red_first"],
      "knowledge": {
        "frontend": {
          "domain": "web",
          "doc": "tech",
          "read_before": ["requirement"],
          "write_after": true
        },
        "backend": {
          "domain": "backend",
          "doc": "api",
          "read_before": ["requirement"],
          "write_after": true
        }
      }
    }
  ],
  "gates": [
    {
      "name": "spec_required",
      "description": "Product 必须产出 Spec",
      "check": "stages.product.artifacts.includes('spec.md')",
      "blocker": "Dev 阻止：缺少 Spec"
    }
  ],
  "rules": {
    "tdd": true,
    "sdd": true,
    "parallel_allowed": true,
    "knowledge_enabled": true
  }
}
```

### 工作流字段说明

| 字段 | 类型 | 描述 |
|------|------|------|
| `name` | string | 工作流标识 |
| `description` | string | 工作流描述 |
| `triggers.keywords` | string[] | 触发关键词 |
| `triggers.patterns` | string[] | 触发正则模式 |
| `pipeline` | StageDefinition[] | 阶段定义 |
| `gates` | Gate[] | 门禁检查 |
| `rules` | Rules | 执行规则 |

### 阶段定义

| 字段 | 类型 | 描述 |
|------|------|------|
| `stage` | string | 阶段名称 |
| `required` | boolean | 是否必需 |
| `agents` | string[] | 使用的 Agent |
| `agent_mode` | string | Agent 模式（sequential/parallel） |
| `skills` | string[] | 使用的 Skill |
| `constraints` | string[] | 约束条件 |
| `knowledge` | object | 知识配置 |

### 内置工作流

| 工作流 | 触发条件 | 流程 |
|--------|----------|------|
| `feature-development` | 实现、开发、添加、功能 | Product → Design → Dev → QA → Ship |
| `bug-fix` | 修复、bug、错误、崩溃 | Diagnosis → Dev → QA |
| `security-fix` | 安全、漏洞、CVE | Diagnosis → Dev → Security Audit → QA |
| `api-development` | API、接口、REST | Product → Dev → QA |
| `refactor` | 重构、优化、清理 | Dev → QA |
| `documentation` | 文档、说明、readme | Docs |
| `product-design` | 产品设计 | Product → Design → Review |

---

## 添加新知识类别

知识类别是灵活的字符串类型，无需预定义。只需在使用时指定即可。

### 推荐类别

```typescript
const RECOMMENDED_CATEGORIES = [
  'requirement',  // 需求
  'design',       // 设计
  'backend',      // 后端
  'ios',          // iOS
  'android',      // Android
  'harmony',      // 鸿蒙
  'web',          // Web
  'miniprogram',  // 小程序
  'qa',           // 测试
  'ship',         // 部署
  'growth',       // 增长
  'bug-fix',      // Bug 修复
  'issue',        // 问题
  'tech-doc',     // 技术文档
  'guide',        // 指南
  'api',          // API
  'architecture', // 架构
] as const;
```

### 使用自定义类别

```typescript
// 直接使用自定义类别
opc_knowledge_write({
  topic: "my-project",
  category: "custom-category",  // 自定义类别
  doc: "my-doc",
  content: "...",
  name: "自定义文档",
  description: "自定义类别的文档",
  tags: ["custom"]
});
```

---

## 添加新文档类型默认值

在 `src/mcp/knowledge.ts` 中添加：

```typescript
const DOC_TYPE_DEFAULTS: Record<string, { name: string; description: string }> = {
  // 现有默认值...
  
  // 添加新文档类型
  'my-doc-type': {
    name: '我的文档类型',
    description: '文档类型描述',
  },
};
```

---

## 自定义知识匹配算法

### 当前算法

```typescript
// 简单的词频匹配
function findSimilarKnowledgeTopic(
  taskTitle: string,
  taskDescription: string,
  cwd?: string,
  threshold: number = 0.5
): { topic: string; title: string; score: number } | null {
  // 实现见 knowledge.ts
}
```

### 自定义匹配

可以扩展匹配算法，例如：

```typescript
// 使用更复杂的相似度算法
function advancedSimilarity(query: string, target: string): number {
  // 1. 分词
  // 2. 词向量
  // 3. 余弦相似度
  // 4. 返回分数
}
```

---

## 扩展类型定义

在 `src/mcp/types.ts` 中添加新类型：

```typescript
// 添加新的阶段配置选项
export interface StageConfig {
  // 现有字段...
  
  // 新增字段
  custom_option?: string;
  plugin_config?: Record<string, unknown>;
}

// 添加新的状态字段
export interface ProjectState {
  // 现有字段...
  
  // 新增字段
  custom_data?: Record<string, unknown>;
}
```

---

## 插件开发

### 插件结构

```
my-plugin/
├── plugin.json       # 插件配置
├── agents/           # Agent 定义
├── skills/           # Skill 定义
├── workflows/        # 工作流定义
└── mcp/              # MCP 服务器（可选）
```

### 插件配置

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "插件描述",
  "agents": ["agents/my-agent.md"],
  "skills": ["skills/my-skill"],
  "workflows": ["workflows/my-workflow.json"],
  "mcp": "mcp/dist/bundle.cjs"
}
```

---

## 测试扩展

### 单元测试

```typescript
// tests/my-tool.test.ts
import { handleMyTool } from '../src/mcp/handlers/my-tool.js';

describe('opc_my_tool', () => {
  it('should return expected result', async () => {
    const result = await handleMyTool({ param1: 'test' });
    expect(result.content[0].text).toContain('Result:');
  });
});
```

### 集成测试

```bash
# 运行所有测试
npm test

# 运行特定测试
npm test -- --grep "my-tool"
```

---

## 发布扩展

### 版本控制

遵循语义化版本：

- `MAJOR.MINOR.PATCH`
- MAJOR: 不兼容的 API 变更
- MINOR: 向后兼容的功能新增
- PATCH: 向后兼容的问题修复

### 变更日志

在 `CHANGELOG.md` 中记录变更：

```markdown
## [1.1.0] - 2026-05-09

### Added
- 新增 opc_my_tool 工具
- 支持自定义知识类别

### Changed
- 优化知识匹配算法

### Fixed
- 修复陈旧锁清理问题
```

---

## 最佳实践

### 工具开发

1. 保持工具职责单一
2. 提供清晰的错误信息
3. 支持 workingDirectory 参数
4. 使用原子写入

### 工作流设计

1. 合理设置触发条件
2. 明确阶段依赖关系
3. 配置适当的门禁
4. 启用知识流

### 知识管理

1. 使用有意义的主题名称
2. 提供完整的文档元数据
3. 定期重建索引
4. 提交知识到 Git
