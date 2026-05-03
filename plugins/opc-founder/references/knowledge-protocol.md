# Knowledge Library Protocol

OPC provides a self-evolving knowledge library that accumulates project knowledge across the full lifecycle.

## Overview

The knowledge library enables:
- **Self-evolution**: Each task builds upon previous knowledge
- **Cross-stage continuity**: Later stages learn from earlier stages
- **Team memory**: Knowledge persists across sessions and team members

## Directory Structure

```
.opc/knowledge/{REQ-ID}/
├── requirement/
│   └── main.md                    # User stories, acceptance criteria
├── design/
│   ├── ui.md                      # UI specifications
│   └── interaction.md             # Interaction flows
├── platforms/
│   ├── web/
│   │   ├── tech.md                # Web frontend architecture
│   │   └── test.md                # Web tests
│   ├── ios/
│   │   ├── tech.md                # iOS architecture
│   │   └── test.md                # iOS tests
│   ├── android/
│   │   ├── tech.md                # Android architecture
│   │   └── test.md                # Android tests
│   └── miniprogram/
│       ├── tech.md                # Miniprogram architecture
│       └── test.md                # Miniprogram tests
├── backend/
│   ├── api.md                     # API documentation
│   ├── architecture.md            # Backend architecture
│   └── test.md                    # Backend tests
├── shared/
│   ├── database.md                # Database schema
│   └── infrastructure.md          # Infrastructure config
└── growth/
    ├── metrics.md                 # Growth metrics
    └── analytics.md               # Analytics setup
```

## MCP Tools

| Tool | Purpose |
|------|---------|
| `opc_knowledge_init` | Initialize knowledge library for a requirement |
| `opc_knowledge_read` | Read knowledge from domain/platform/doc |
| `opc_knowledge_write` | Write or update knowledge document |
| `opc_knowledge_exists` | Check if knowledge document exists |
| `opc_knowledge_list` | List requirements in knowledge library |
| `opc_knowledge_docs` | List available documents in a domain |

## Stage-to-Domain Mapping

| Stage | Domain | Doc | Description |
|-------|--------|-----|-------------|
| product | requirement | main | User stories, acceptance criteria |
| design | design | ui, interaction | UI specs, interaction flows |
| dev (web) | platforms | web/tech | Web frontend architecture |
| dev (ios) | platforms | ios/tech | iOS architecture |
| dev (android) | platforms | android/tech | Android architecture |
| dev (miniprogram) | platforms | miniprogram/tech | Miniprogram architecture |
| dev (backend) | backend | api, architecture | API design, backend architecture |
| qa | backend | test | Test cases, test reports |
| ship | shared | infrastructure | Deployment, infrastructure |
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
// Determine domain from stage
const domainMap = {
  product: "requirement",
  design: "design",
  dev: determinePlatformDomain(),  // "platforms/web" or "backend"
  qa: "backend",
  ship: "shared",
  growth: "growth"
}

// Read all prior domains
const domainsToRead = getPriorDomains(currentStage)
for (const domain of domainsToRead) {
  if (opc_knowledge_exists(requirementId, domain)) {
    knowledge += opc_knowledge_read(requirementId, domain)
  }
}

// Inject knowledge into agent context
```

**After agent completes:**
```typescript
// Extract knowledge from agent output
const knowledgeUpdate = extractKnowledgeUpdate(agentOutput)

// Write to current domain
opc_knowledge_write(requirementId, currentDomain, doc, knowledgeUpdate)
```

### Step 4: Domain Resolution Logic

```typescript
function getPriorDomains(stage: string): string[] {
  const stageOrder = ['product', 'design', 'dev', 'qa', 'ship', 'growth']
  const currentIndex = stageOrder.indexOf(stage)

  // Read all prior stage domains
  return stageOrder.slice(0, currentIndex).map(s => stageToDomain(s))
}

function stageToDomain(stage: string): string {
  const map = {
    product: "requirement",
    design: "design",
    dev: "platforms",  // or "backend" based on task
    qa: "backend",
    ship: "shared",
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
→ opc_knowledge_write("REQ-001", "design", "ui", "## Login Page\n...")

# Stage 3: Dev (Web)
opc_knowledge_read("REQ-001", "requirement")  # Learn requirement
opc_knowledge_read("REQ-001", "design")       # Learn design
→ frontend-agent executes with full context
→ opc_knowledge_write("REQ-001", "platforms", "web", "tech", "## Components\n...")

# Stage 4: QA
opc_knowledge_read("REQ-001", "platforms", "web", "tech")  # Learn implementation
→ qa-agent executes
→ opc_knowledge_write("REQ-001", "backend", "test", "## Test Cases\n...")
```

### Bug Fix (No Workflow)

```
User: /opc fix the login bug in REQ-001

1. Extract requirement ID: "REQ-001"
2. Check knowledge exists: opc_knowledge_exists("REQ-001") → true
3. Determine stage: "dev" (bug fix)
4. Read prior knowledge:
   - opc_knowledge_read("REQ-001", "requirement")
   - opc_knowledge_read("REQ-001", "platforms", "web", "tech")
5. Dispatch to frontend-agent with knowledge context
6. After completion:
   - opc_knowledge_write("REQ-001", "platforms", "web", "tech", "## Bug Fix\n...")
```

### Requirement Adjustment

```
User: /opc add third-party login to REQ-001

1. Extract requirement ID: "REQ-001"
2. Read all existing knowledge:
   - opc_knowledge_read("REQ-001", "requirement")
   - opc_knowledge_read("REQ-001", "design")
   - opc_knowledge_read("REQ-001", "platforms", "web", "tech")
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

## Best Practices

1. **Always initialize** before starting a new requirement
2. **Always read** prior domain knowledge before dispatching agents
3. **Always write** knowledge updates after stage completion
4. **Use append mode** by default to preserve history
5. **Commit knowledge** to git for team sharing
