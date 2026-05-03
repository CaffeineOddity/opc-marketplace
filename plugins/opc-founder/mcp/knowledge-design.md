# OPC Knowledge MCP Tools Design

## Overview

Knowledge library for self-evolving project documentation. Each requirement has structured knowledge across domains.

## Directory Structure

```
.opc/knowledgebase/
├── REQ-001/
│   ├── requirement/
│   │   └── main.md
│   ├── design/
│   │   ├── ui.md
│   │   └── interaction.md
│   ├── platforms/
│   │   ├── web/
│   │   │   ├── tech.md
│   │   │   └── test.md
│   │   ├── ios/
│   │   │   ├── tech.md
│   │   │   └── test.md
│   │   ├── android/
│   │   │   ├── tech.md
│   │   │   └── test.md
│   │   └── miniprogram/
│   │   │   ├── tech.md
│   │   │   └── test.md
│   ├── backend/
│   │   ├── api.md
│   │   ├── architecture.md
│   │   └── test.md
│   ├── shared/
│   │   ├── database.md
│   │   └── infrastructure.md
│   └── growth/
│       ├── metrics.md
│       └── analytics.md
├── REQ-002/
│   └── ...
└── index.json
```

## Knowledge Structure Definition

```typescript
const KNOWLEDGE_STRUCTURE = {
  requirement: {
    docs: ["main"],
    hasSubdocs: false
  },
  design: {
    docs: ["ui", "interaction"],
    hasSubdocs: false
  },
  platforms: {
    platforms: ["web", "ios", "android", "miniprogram"],
    docs: ["tech", "test"],
    hasSubdocs: true
  },
  backend: {
    docs: ["api", "architecture", "test"],
    hasSubdocs: false
  },
  shared: {
    docs: ["database", "infrastructure"],
    hasSubdocs: false
  },
  growth: {
    docs: ["metrics", "analytics"],
    hasSubdocs: false
  }
};
```

## MCP Tools

### 1. opc_knowledge_init

Initialize knowledge library for a requirement.

```typescript
{
  name: "opc_knowledge_init",
  description: "Initialize knowledge library for a requirement. Creates directory structure and index entry.",
  inputSchema: {
    type: "object",
    properties: {
      requirementId: { type: "string", description: "Requirement ID (e.g., REQ-001)" },
      title: { type: "string", description: "Requirement title" },
      workingDirectory: { type: "string" }
    },
    required: ["requirementId", "title"]
  }
}

// Returns
{
  content: [{
    type: "text",
    text: "✅ Knowledge library initialized for REQ-001\nPath: .opc/knowledgebase/REQ-001/"
  }]
}
```

### 2. opc_knowledge_read

Read knowledge from a specific domain/platform/doc.

```typescript
{
  name: "opc_knowledge_read",
  description: "Read knowledge from knowledge library. Can read specific doc or entire domain.",
  inputSchema: {
    type: "object",
    properties: {
      requirementId: { type: "string", description: "Requirement ID" },
      domain: { type: "string", enum: ["requirement", "design", "platforms", "backend", "shared", "growth"] },
      platform: { type: "string", enum: ["web", "ios", "android", "miniprogram"], description: "Required when domain='platforms'" },
      doc: { type: "string", description: "Document name (e.g., 'main', 'ui', 'api', 'tech', 'test')" },
      workingDirectory: { type: "string" }
    },
    required: ["requirementId", "domain"]
  }
}

// Returns (when doc specified)
{
  content: [{
    type: "text",
    text: "# REQ-001 Requirement\n\n## User Story\n..."
  }]
}

// Returns (when doc not specified, returns all docs in domain)
{
  content: [{
    type: "text",
    text: "## requirement/main.md\n# REQ-001 Requirement\n...\n\n## design/ui.md\n# UI Design\n..."
  }]
}
```

### 3. opc_knowledge_write

Write/update knowledge to a specific doc.

```typescript
{
  name: "opc_knowledge_write",
  description: "Write or update knowledge document. Supports append, update section, or overwrite.",
  inputSchema: {
    type: "object",
    properties: {
      requirementId: { type: "string", description: "Requirement ID" },
      domain: { type: "string", enum: ["requirement", "design", "platforms", "backend", "shared", "growth"] },
      platform: { type: "string", enum: ["web", "ios", "android", "miniprogram"], description: "Required when domain='platforms'" },
      doc: { type: "string", description: "Document name (e.g., 'main', 'ui', 'api', 'tech', 'test')" },
      content: { type: "string", description: "Content to write" },
      section: { type: "string", description: "Section header to update (optional)" },
      mode: { type: "string", enum: ["append", "update", "overwrite"], default: "append" },
      workingDirectory: { type: "string" }
    },
    required: ["requirementId", "domain", "doc", "content"]
  }
}

// Returns
{
  content: [{
    type: "text",
    text: "✅ Knowledge written to REQ-001/platforms/web/tech.md\nMode: append\nSection: 2025-05-03 Component Update"
  }]
}
```

### 4. opc_knowledge_exists

Check if knowledge exists.

```typescript
{
  name: "opc_knowledge_exists",
  description: "Check if knowledge document exists.",
  inputSchema: {
    type: "object",
    properties: {
      requirementId: { type: "string", description: "Requirement ID" },
      domain: { type: "string", enum: ["requirement", "design", "platforms", "backend", "shared", "growth"] },
      platform: { type: "string", enum: ["web", "ios", "android", "miniprogram"] },
      doc: { type: "string" },
      workingDirectory: { type: "string" }
    },
    required: ["requirementId"]
  }
}

// Returns
{
  content: [{
    type: "text",
    text: "true"  // or "false"
  }]
}
```

### 5. opc_knowledge_list

List all requirements or filter by status/domain.

```typescript
{
  name: "opc_knowledge_list",
  description: "List requirements in knowledge library.",
  inputSchema: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["in_progress", "completed", "paused"] },
      domain: { type: "string", enum: ["requirement", "design", "platforms", "backend", "shared", "growth"] },
      workingDirectory: { type: "string" }
    },
    required: []
  }
}

// Returns
{
  content: [{
    type: "text",
    text: "## Knowledge Library\n\n| ID | Title | Status | Domains | Updated |\n|-----|-------|--------|---------|--------|\n| REQ-001 | 用户登录 | completed | requirement, design, platforms(web,ios), backend | 2025-05-03 |\n| REQ-002 | 用户注册 | in_progress | requirement, design | 2025-05-02 |"
  }]
}
```

### 6. opc_knowledge_docs

List available docs in a domain.

```typescript
{
  name: "opc_knowledge_docs",
  description: "List available documents in a domain for a requirement.",
  inputSchema: {
    type: "object",
    properties: {
      requirementId: { type: "string", description: "Requirement ID" },
      domain: { type: "string", enum: ["requirement", "design", "platforms", "backend", "shared", "growth"] },
      workingDirectory: { type: "string" }
    },
    required: ["requirementId", "domain"]
  }
}

// Returns
{
  content: [{
    type: "text",
    text: "## REQ-001/platforms docs\n\n- web/tech.md\n- web/test.md\n- ios/tech.md"
  }]
}
```

## Index.json Structure

```json
{
  "requirements": {
    "REQ-001": {
      "title": "用户登录功能",
      "status": "completed",
      "created_at": "2025-05-01T10:00:00",
      "updated_at": "2025-05-03T15:30:00",
      "domains": {
        "requirement": ["main"],
        "design": ["ui", "interaction"],
        "platforms": ["web", "ios"],
        "backend": ["api", "architecture"],
        "shared": ["database"],
        "growth": ["metrics"]
      }
    }
  }
}
```

## Usage Examples

### Initialize new requirement

```typescript
opc_knowledge_init("REQ-001", "用户登录功能")
```

### Read requirement before design

```typescript
opc_knowledge_read("REQ-001", "requirement")
// Returns requirement/main.md content
```

### Write design after design phase

```typescript
opc_knowledge_write("REQ-001", "design", "ui", "## 登录页面布局\n...", { mode: "append" })
```

### Read web tech before development

```typescript
opc_knowledge_read("REQ-001", "platforms", "web", "tech")
// Returns platforms/web/tech.md content
```

### Write web tech after development

```typescript
opc_knowledge_write("REQ-001", "platforms", "web", "tech", "## 2025-05-03\n- LoginForm 组件\n- useAuth hook", { mode: "append" })
```

### Check if knowledge exists

```typescript
opc_knowledge_exists("REQ-001", "platforms", "web", "tech")
// Returns true if platforms/web/tech.md exists
```