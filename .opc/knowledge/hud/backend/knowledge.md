---
name: knowledge
description: 生成 HUD 知识库 - 为 OPC Marketplace 的 HUD 组件创建完整的知识库文档
category: backend
topic: hud
created_at: 2026-05-07T04:30:24.788Z
updated_at: 2026-05-08T06:43:10.614Z
---
# HUD Knowledge Library

## Knowledge Organization

知识库按主题（topic）组织，每个主题可以有多个领域文档。

### 目录结构

```
.opc/knowledge/
├── index.json              # 知识库索引
├── hud/                    # 主题: HUD
│   ├── backend/
│   │   ├── architecture.md
│   │   ├── tools.md
│   │   ├── state.md
│   │   └── knowledge.md
│   ├── design/
│   │   └── ui.md
│   └── requirement/
│       └── main.md
└── state-management/       # 主题: State Management
    └── backend/
        └── api.md
```

## Knowledge Index

```typescript
interface KnowledgeIndex {
  topics: Record<string, {
    title: string;
    description?: string;
    status: 'in_progress' | 'completed' | 'paused';
    created_at: string;
    updated_at: string;
    domains: Record<string, string[]>;  // domain -> [doc names]
  }>;
}
```

### Example Index

```json
{
  "topics": {
    "hud": {
      "title": "HUD 知识库",
      "description": "HUD 状态栏系统的完整文档",
      "status": "in_progress",
      "created_at": "2026-05-07T12:30:00.000Z",
      "updated_at": "2026-05-07T12:35:00.000Z",
      "domains": {
        "backend": ["architecture", "tools", "state", "knowledge"],
        "design": ["ui"],
        "requirement": ["main"]
      }
    }
  }
}
```

## Knowledge Categories

Categories 与 Pipeline Stages 对齐：

| Stage | Category | Description |
|-------|----------|-------------|
| Product | `requirement` | 需求规格、用户故事 |
| Design | `design` | UI/UX、交互、视觉资源 |
| Dev | `backend`, `ios`, `android`, `harmony`, `web`, `miniprogram` | 平台特定实现 |
| QA | `qa` | 测试计划、测试用例 |
| Ship | `ship` | 部署、CI/CD、基础设施 |
| Growth | `growth` | 指标、分析、营销 |

## Topic Generation

### Topic Slug 生成

```typescript
function generateTopicSlug(title: string): string {
  // 尝试提取有意义的英文单词
  const englishWords = title.match(/[a-zA-Z]+/g);
  if (englishWords && englishWords.length > 0) {
    const significant = englishWords.find(w => w.length > 2) || englishWords[0];
    return significant.toLowerCase().replace(/[^a-z0-9]/g, '-');
  }
  
  // 对于中文或其他语言，基于时间戳生成
  return `topic-${Date.now().toString(36)}`;
}
```

### Examples

| Title | Generated Slug |
|-------|---------------|
| "HUD 状态栏实时更新修复" | `hud` |
| "State Management" | `state-management` |
| "用户认证功能" | `topic-xyz123` |

## Topic Matching

当创建新任务时，系统会尝试匹配现有主题：

```typescript
function findOrCreateTopic(taskTitle: string, taskDescription: string): { topic: string; isNew: boolean } {
  const index = readKnowledgeIndex();
  const searchQuery = `${taskTitle} ${taskDescription}`.toLowerCase();
  
  // 计算相似度分数
  const candidates = Object.entries(index.topics)
    .map(([slug, data]) => {
      const titleWords = data.title.toLowerCase().split(/\s+/);
      const queryWords = searchQuery.split(/\s+/).filter(w => w.length > 1);
      
      let matchCount = 0;
      for (const queryWord of queryWords) {
        for (const titleWord of titleWords) {
          if (queryWord === titleWord || queryWord.includes(titleWord) || titleWord.includes(queryWord)) {
            matchCount++;
            break;
          }
        }
      }
      
      return { slug, data, score: queryWords.length > 0 ? matchCount / queryWords.length : 0 };
    })
    .filter(c => c.score >= 0.3)
    .sort((a, b) => b.score - a.score);
  
  // 高相似度 (>50%) 使用现有主题
  if (candidates.length > 0 && candidates[0].score >= 0.5) {
    return { topic: candidates[0].slug, isNew: false };
  }
  
  // 否则创建新主题
  const slug = generateTopicSlug(taskTitle);
  // ... 创建主题
  return { topic: slug, isNew: true };
}
```

## Knowledge Read/Write

### Read Knowledge

```typescript
// 读取特定文档
function readKnowledgeDoc(topic: string, category: string, doc: string): string | null {
  const path = `.opc/knowledge/${topic}/${category}/${doc}.md`;
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf-8');
}

// 读取整个 category 的所有文档
function readAllKnowledgeDocs(topic: string, category: string): string | null {
  const categoryPath = `.opc/knowledge/${topic}/${category}`;
  if (!existsSync(categoryPath)) return null;
  
  const results: string[] = [];
  for (const docFile of readdirSync(categoryPath)) {
    if (!docFile.endsWith('.md')) continue;
    const content = readFileSync(join(categoryPath, docFile), 'utf-8');
    results.push(`## ${docFile}\n\n${content}`);
  }
  
  return results.join('\n\n---\n\n');
}
```

### Write Knowledge

```typescript
function writeKnowledgeDoc(
  topic: string,
  category: string,
  doc: string,
  content: string,
  mode: 'append' | 'update' | 'overwrite' = 'append',
  section?: string
): void {
  const path = `.opc/knowledge/${topic}/${category}/${doc}.md`;
  
  let finalContent = content;
  
  if (mode === 'append' && existsSync(path)) {
    const existing = readFileSync(path, 'utf-8');
    const timestamp = new Date().toISOString().split('T')[0];
    finalContent = `${existing}\n\n## ${timestamp}\n\n${content}`;
  } else if (mode === 'update' && section && existsSync(path)) {
    const existing = readFileSync(path, 'utf-8');
    const sectionRegex = new RegExp(`(## ${section}[\s]*\n)([^#]*)(?=##|$)`, 'g');
    if (sectionRegex.test(existing)) {
      finalContent = existing.replace(sectionRegex, `$1${content}\n\n`);
    } else {
      finalContent = `${existing}\n\n## ${section}\n\n${content}`;
    }
  }
  
  writeFileSync(path, finalContent, 'utf-8');
  
  // 更新索引
  const index = readKnowledgeIndex();
  if (index.topics[topic]) {
    index.topics[topic].updated_at = new Date().toISOString();
    if (!index.topics[topic].domains[category]) {
      index.topics[topic].domains[category] = [];
    }
    if (!index.topics[topic].domains[category].includes(doc)) {
      index.topics[topic].domains[category].push(doc);
    }
    writeKnowledgeIndex(index);
  }
}
```

## Knowledge Flow in Pipeline

### Stage Knowledge Config

```typescript
// 在 workflow spec 中定义
{
  "stage": "dev",
  "knowledge": {
    "frontend": {
      "domain": "platforms",
      "platform": "web",
      "doc": "tech",
      "read_before": ["requirement", "design"],
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
```

### Knowledge Flow Pattern

```
BEFORE STAGE:
1. Get requirement_id from opc_state_read()
2. Parse stage's knowledge config from workflow
3. For each domain in read_before:
   - Call opc_knowledge_read(topic, domain)
4. Combine all knowledge into context
5. Inject knowledge context into agent dispatch

STAGE EXECUTION: Agent performs work with full context

AFTER STAGE:
6. Extract knowledge update from agent output
7. Call opc_knowledge_write(topic, domain, doc, content)
8. Knowledge is now available for next stage
```

## Integration with State

### Knowledge Topic in State

```typescript
// 在 opc_state_init 中设置
state.project.knowledge_topic = topic;

// 后续操作中使用
const topic = state.project.knowledge_topic;
opc_knowledge_read(topic, "backend", "architecture");
```

### Automatic Topic Resolution

```typescript
function resolveTopic(args: Record<string, unknown>, cwd?: string): string | null {
  // 如果直接提供 topic，使用它
  if (args.topic) {
    return args.topic as string;
  }
  
  // 否则从当前任务获取
  const state = getCurrentTask(cwd);
  if (state?.project.knowledge_topic) {
    return state.project.knowledge_topic;
  }
  
  return null;
}
```