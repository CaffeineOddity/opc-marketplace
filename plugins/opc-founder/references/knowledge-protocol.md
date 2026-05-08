# Knowledge Library Protocol

OPC provides a self-evolving knowledge library that accumulates project knowledge across the full lifecycle.

## Overview

The knowledge library enables:
- **Self-evolution**: Each task builds upon previous knowledge
- **Cross-stage continuity**: Later stages learn from earlier stages
- **Team memory**: Knowledge persists across sessions and team members
- **Progressive loading**: Documents include metadata for efficient browsing

## Document Frontmatter

Each knowledge document includes YAML frontmatter for self-description:

```yaml
---
name: 文档名称（人类可读，如"iOS多语言系统架构设计"）
description: 文档功能描述（用于列表展示和渐进加载，说明文档的作用和内容）
category: requirement | design | backend | ios | android | harmony | web | miniprogram | qa | ship | growth
topic: 主题标识（如 "ios-localization", "user-auth"）
created_at: 创建时间
updated_at: 更新时间
tags: [可选标签]
---
```

### Frontmatter Guidelines

**IMPORTANT: When writing knowledge documents, AI should provide meaningful metadata:**

| Field | Guidelines | Example |
|-------|------------|---------|
| `name` | Human-readable document name, describe what the document is | `iOS多语言系统架构设计` (NOT just `architecture`) |
| `description` | What the document contains and its purpose | `描述iOS项目中多语言系统的架构设计，包括LanguageManager、BundleProvider等核心组件的实现细节和使用方式。` |
| `topic` | Semantic topic identifier, avoid category names | `ios-localization` (NOT `ios`) |
| `tags` | Optional keywords for filtering | `[ios, localization, architecture, i18n]` |

### Why Meaningful Metadata Matters

| Without Good Metadata | With Good Metadata |
|-----------------------|-------------------|
| `name: architecture` | `name: iOS多语言系统架构设计` |
| `description: 生成iOS多语言方案` (task description) | `description: 描述iOS项目中多语言系统的架构设计...` (document purpose) |
| `topic: ios` (collision with category) | `topic: ios-localization` (semantic identifier) |
| Hard to find in list views | Easy to identify and select |
| No context before reading | Clear understanding from metadata |

### Benefits

| Feature | Without Frontmatter | With Frontmatter |
|---------|---------------------|------------------|
| Document discovery | Read full content | Read metadata only |
| List views | No context | Name + description |
| Progressive loading | All-or-nothing | Load metadata first |
| Self-describing | Requires index.json | Document is complete |

## Path Format

```
.opc/knowledge/{topic}/{category}/xxx.md
```

| Component | Description | Example |
|-----------|-------------|---------|
| `{topic}` | Topic identifier | hud, state-management |
| `{category}` | Knowledge category | requirement, design, backend... |
| `xxx.md` | Markdown document with frontmatter | main.md, tech.md |

## Directory Structure

### Basic Structure

```
.opc/knowledgebase/REQ-001/
├── requirement/
│   └── main.md
├── design/
│   └── ui.md
└── backend/
    └── api.md
```

### Extended Structure (With Subdirectories)

```
.opc/knowledgebase/REQ-001/
├── requirement/
│   ├── main.md
│   ├── user-stories.md
│   └── plugins/
│       ├── opc-founder.md
│       ├── product-kit.md
│       ├── design-kit.md
│       ├── dev-kit.md
│       ├── qa-kit.md
│       ├── ship-kit.md
│       ├── growth-kit.md
│       └── docs-kit.md
├── design/
│   ├── ui/
│   │   ├── main.md
│   │   └── components.md
│   └── interaction/
│       └── flows.md
├── backend/
│   ├── api/
│   │   ├── rest.md
│   │   └── graphql.md
│   ├── architecture/
│   │   └── main.md
│   └── database/
│       └── schema.md
├── web/
│   ├── tech.md
│   └── components/
│       ├── auth.md
│       └── dashboard.md
├── qa/
│   ├── test-plan.md
│   └── cases/
│       ├── auth.md
│       └── api.md
├── ship/
│   ├── deployment.md
│   └── infrastructure/
│       └── aws.md
├── growth/
│   ├── metrics.md
│   └── analytics/
│       └── setup.md
└── references/
    ├── api-docs.md
    └── third-party/
        ├── payment/
        │   └── stripe.md
        └── auth/
            └── auth0.md
```

## Categories

| Category | Stage | Description |
|----------|-------|-------------|
| `requirement` | Product | Requirement specs, user stories |
| `design` | Design | UI/UX design, interaction flows |
| `backend` | Dev | Backend API, services, architecture |
| `ios` | Dev | iOS native development |
| `android` | Dev | Android native development |
| `harmony` | Dev | HarmonyOS development |
| `web` | Dev | Web frontend development |
| `miniprogram` | Dev | Mini program development |
| `qa` | QA | Test plans, test cases |
| `ship` | Ship | Deployment, CI/CD, infrastructure |
| `growth` | Growth | Growth metrics, analytics |

## MCP Tools

| Tool | Purpose |
|------|---------|
| `opc_knowledge_init` | Initialize knowledge library for a requirement |
| `opc_knowledge_read` | Read knowledge from category/doc |
| `opc_knowledge_write` | Write or update knowledge document |
| `opc_knowledge_exists` | Check if knowledge document exists |
| `opc_knowledge_list` | List requirements in knowledge library |
| `opc_knowledge_docs` | List available documents in a category |

## Stage-to-Domain Mapping

| Stage | Category | Doc | Description |
|-------|----------|-----|-------------|
| product | requirement | main | User stories, acceptance criteria |
| design | design | ui, interaction | UI specs, interaction flows |
| dev (web) | web | tech | Web frontend architecture |
| dev (ios) | ios | tech | iOS architecture |
| dev (android) | android | tech | Android architecture |
| dev (harmony) | harmony | tech | HarmonyOS architecture |
| dev (miniprogram) | miniprogram | tech | Miniprogram architecture |
| dev (backend) | backend | api, architecture | API design, backend architecture |
| qa | qa | test-plan, cases | Test cases, test reports |
| ship | ship | deployment, infrastructure | Deployment, infrastructure |
| growth | growth | metrics, analytics | Growth metrics, analytics |

## Knowledge Protocol (Always Apply)

**IMPORTANT:** Whether using a workflow or manually assembling a pipeline, ALWAYS follow this protocol.

### Step 1: Extract Requirement ID

Before starting any pipeline:
```
- If user mentions "REQ-XXX" → use that ID
- If user describes a new feature → generate ID like "REQ-001"
- Use opc_knowledge_list() to check existing requirements
```

### Step 2: Initialize Knowledge Library

```typescript
opc_knowledge_init(requirementId, title)
```

### Step 3: Knowledge Flow Per Stage

**Before dispatching to any agent:**
```typescript
// Determine category from stage
const categoryMap = {
  product: "requirement",
  design: "design",
  dev: determinePlatformCategory(),  // "web" or "backend"
  qa: "qa",
  ship: "ship",
  growth: "growth"
}

// Read all prior categories
const categoriesToRead = getPriorCategories(currentStage)
for (const category of categoriesToRead) {
  if (opc_knowledge_exists(requirementId, category)) {
    knowledge += opc_knowledge_read(requirementId, category)
  }
}

// Inject knowledge into agent context
```

**After agent completes:**
```typescript
// Extract knowledge from agent output
const knowledgeUpdate = extractKnowledgeUpdate(agentOutput)

// Write to current category
opc_knowledge_write(requirementId, currentCategory, doc, knowledgeUpdate)
```

### Step 4: Category Resolution Logic

```typescript
function getPriorCategories(stage: string): string[] {
  const stageOrder = ['product', 'design', 'dev', 'qa', 'ship', 'growth']
  const currentIndex = stageOrder.indexOf(stage)

  // Read all prior stage categories
  return stageOrder.slice(0, currentIndex).map(s => stageToCategory(s))
}

function stageToCategory(stage: string): string {
  const map = {
    product: "requirement",
    design: "design",
    dev: "web",  // or "backend" based on task
    qa: "qa",
    ship: "ship",
    growth: "growth"
  }
  return map[stage]
}
```

## Usage Examples

### New Feature Development

```
# Stage 1: Product
opc_knowledge_init("REQ-001", "User Login")
→ product-agent executes
→ opc_knowledge_write("REQ-001", "requirement", "main", "## User Stories\n...")

# Stage 2: Design
opc_knowledge_read("REQ-001", "requirement")  # Learn requirement
→ design-agent executes with requirement context
→ opc_knowledge_write("REQ-001", "design", "ui/main", "## Login Page\n...")

# Stage 3: Dev (Web)
opc_knowledge_read("REQ-001", "requirement")  # Learn requirement
opc_knowledge_read("REQ-001", "design")       # Learn design
→ frontend-agent executes with full context
→ opc_knowledge_write("REQ-001", "web", "tech", "## Components\n...")

# Stage 4: QA
opc_knowledge_read("REQ-001", "web/tech")  # Learn implementation
→ qa-agent executes
→ opc_knowledge_write("REQ-001", "qa", "test-plan", "## Test Cases\n...")
```

### Bug Fix (No Workflow)

```
User: /opc fix the login bug in REQ-001

1. Extract requirement ID: "REQ-001"
2. Check knowledge exists: opc_knowledge_exists("REQ-001") → true
3. Determine stage: "dev" (bug fix)
4. Read prior knowledge:
   - opc_knowledge_read("REQ-001", "requirement")
   - opc_knowledge_read("REQ-001", "web/tech")
5. Dispatch to frontend-agent with knowledge context
6. After completion:
   - opc_knowledge_write("REQ-001", "web", "tech", "## Bug Fix\n...")
```

### Requirement Adjustment

```
User: /opc add third-party login to REQ-001

1. Extract requirement ID: "REQ-001"
2. Read all existing knowledge:
   - opc_knowledge_read("REQ-001", "requirement")
   - opc_knowledge_read("REQ-001", "design")
   - opc_knowledge_read("REQ-001", "web/tech")
3. Determine starting stage: "design" (requirement already clear)
4. Dispatch to design-agent with full context
5. Continue pipeline with knowledge updates
```

## Dispatch Template

When dispatching to an agent, include knowledge context:

```
Agent({agent_name}, `
## Task: {task description}

## Knowledge Context
${knowledge ? knowledge : "No prior knowledge for this domain."}

## Instructions
1. Review the knowledge context above
2. Execute your stage tasks
3. Output knowledge updates for the next stage

## Output Format
After completing, provide:
1. Your deliverables (code, specs, etc.)
2. Knowledge update for this domain (what should be saved for future reference)
`)
```

## Reference Documents

Reference documents store external resources and third-party documentation:

```
.opc/knowledgebase/REQ-001/
└── references/
    ├── api-docs.md              # External API docs
    ├── design-systems/          # Design system references
    │   ├── material.md
    │   └── ant-design.md
    └── third-party/             # Third-party services
        ├── payment/
        │   └── stripe.md
        └── auth/
            └── auth0.md
```

## Naming Conventions

### Document Naming
- Use lowercase letters and hyphens: `user-stories.md`, `api-design.md`
- Main document: `main.md`
- Technical document: `tech.md`
- Test document: `test.md`

### Subdirectory Naming
- Use lowercase letters and hyphens: `plugins/`, `api/`, `components/`
- Avoid deep nesting (recommended max 3 levels)

## Best Practices

1. **Always initialize** before starting a new requirement
2. **Always read** prior category knowledge before dispatching agents
3. **Always write** knowledge updates after stage completion
4. **Use append mode** by default to preserve history
5. **Commit knowledge** to git for team sharing
6. **Use subdirectories** to organize related documents
7. **Keep references** separate from main project knowledge
8. **Follow naming conventions** for consistency across the team
