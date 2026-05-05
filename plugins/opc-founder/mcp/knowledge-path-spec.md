# OPC Knowledge Library Path Specification

## Path Format

```
{git_root}/.opc/knowledgebase/{requirement_id}/{category}/**/*/xxx.md
```

### Components

- **git_root**: Git repository root directory
- **.opc/knowledgebase**: Knowledge library root
- **requirement_id**: Unique requirement identifier (e.g., `REQ-001`, `REQ-002`)
- **category**: Knowledge category (aligned with OPC pipeline stages)
- **`**/*/`**: Optional subdirectory hierarchy (any depth)
- **xxxx.md**: Document file (Markdown format)

## Categories (Pipeline Stages)

Categories align with the OPC one-person company pipeline: **product → design → dev → qa → ship → growth**

| Stage | Category | Description |
|-------|----------|-------------|
| **Product** | `requirement` | Requirement specs, user stories, acceptance criteria |
| **Design** | `design` | UI/UX design, interaction design, visual assets |
| **Dev** | `backend` | Backend API, services, architecture |
| | `ios` | iOS native development |
| | `android` | Android native development |
| | `harmony` | HarmonyOS development |
| | `web` | Web frontend development |
| | `miniprogram` | Mini program development (WeChat, etc.) |
| **QA** | `qa` | Test plans, test cases, quality assurance |
| **Ship** | `ship` | Deployment, CI/CD, infrastructure, operations |
| **Growth** | `growth` | Growth metrics, analytics, marketing |

## Directory Structure Examples

### Basic Structure (No Subdirectories)

```
.opc/knowledgebase/REQ-001/
├── requirement/
│   └── main.md           # Main requirement document
├── design/
│   └── ui.md             # UI design spec
└── backend/
    └── api.md            # API design
```

### Extended Structure (With Subdirectories)

```
.opc/knowledgebase/REQ-001/
├── requirement/
│   ├── main.md                    # Main requirement document
│   ├── user-stories.md            # User stories
│   ├── acceptance.md              # Acceptance criteria
│   └── plugins/                   # Plugin subdirectory
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
│   │   ├── main.md                # UI main spec
│   │   └── components.md          # Component specs
│   └── interaction/
│       └── flows.md               # Interaction flows
├── backend/
│   ├── api/
│   │   ├── rest.md                # REST API spec
│   │   └── graphql.md             # GraphQL spec
│   ├── architecture/
│   │   └── main.md                # Backend architecture
│   └── database/
│       └── schema.md              # Database schema
├── web/
│   ├── tech.md                    # Web tech decisions
│   └── components/
│       ├── auth.md                # Auth components
│       └── dashboard.md           # Dashboard components
├── qa/
│   ├── test-plan.md               # Overall test plan
│   └── cases/
│       ├── auth.md                # Auth test cases
│       └── api.md                 # API test cases
├── ship/
│   ├── deployment.md              # Deployment guide
│   ├── ci-cd.md                   # CI/CD configuration
│   └── infrastructure/
│       └── aws.md                 # AWS infrastructure
├── growth/
│   ├── metrics.md                 # Growth metrics
│   └── analytics/
│       └── setup.md               # Analytics setup
└── references/                    # Reference documents
    ├── api-docs.md                # External API docs
    └── third-party/
        ├── payment/
        │   └── stripe.md
        └── auth/
            └── auth0.md
```

## MCP Tools

### opc_knowledge_init
Initialize knowledge library for a requirement.

### opc_knowledge_read
Read knowledge documents. Parameters:
- `requirementId`: Requirement ID
- `category`: Knowledge category (required)
- `doc`: Document path relative to category (optional, supports subdirectories)

```typescript
// Read top-level document
opc_knowledge_read("REQ-001", "requirement", "main")

// Read subdirectory document
opc_knowledge_read("REQ-001", "requirement", "plugins/opc-founder")
opc_knowledge_read("REQ-001", "backend", "api/rest")

// Read entire category
opc_knowledge_read("REQ-001", "requirement")
```

### opc_knowledge_write
Write or update knowledge documents. Parameters:
- `requirementId`: Requirement ID
- `category`: Knowledge category
- `doc`: Document path relative to category (supports subdirectories)
- `content`: Content to write
- `mode`: `append` | `update` | `overwrite`
- `section`: Section header to update (for `update` mode)

```typescript
// Write top-level document
opc_knowledge_write("REQ-001", "requirement", "main", content)

// Write subdirectory document
opc_knowledge_write("REQ-001", "requirement", "plugins/opc-founder", content)
opc_knowledge_write("REQ-001", "backend", "api/rest", content)
```

### opc_knowledge_exists
Check if a knowledge document exists.

```typescript
opc_knowledge_exists("REQ-001", "requirement", "main")
opc_knowledge_exists("REQ-001", "requirement", "plugins/opc-founder")
```

### opc_knowledge_list
List all requirements in the knowledge library. Optional filters:
- `status`: Filter by status
- `category`: Filter by category

### opc_knowledge_docs
List all documents in a specific category for a requirement.

```typescript
opc_knowledge_docs("REQ-001", "requirement")
// Returns: main, tech, agents, skills, workflows, implementation, plugins/opc-founder, ...
```

## Self-Evolution Flow

The knowledge library evolves automatically through the pipeline:

```
1. Product Stage → Write requirement/
2. Design Stage → Read requirement/, Write design/
3. Dev Stage → Read design/, Write backend/, ios/, android/, harmony/, web/, miniprogram/
4. QA Stage → Read all platform docs, Write qa/
5. Ship Stage → Read qa/, Write ship/
6. Growth Stage → Read ship/, Write growth/
```

Each stage reads knowledge from previous stages and writes new knowledge, creating a self-evolving knowledge base that accumulates project knowledge across the full lifecycle.

## Naming Conventions

### Document Naming
- Use lowercase letters and hyphens: `user-stories.md`, `api-design.md`
- Main document: `main.md`
- Technical document: `tech.md`
- Test document: `test.md`

### Subdirectory Naming
- Use lowercase letters and hyphens: `plugins/`, `api/`, `components/`
- Avoid deep nesting (recommended max 3 levels)

## Reference Documents

Reference documents are special subdirectories for storing:
- External API documentation references
- Third-party service documentation
- Design system references
- External resource links

### Reference Structure

```
.opc/knowledgebase/REQ-001/
└── references/
    ├── api-docs.md              # API documentation summary
    ├── design-systems/          # Design system references
    │   ├── material.md
    │   └── ant-design.md
    └── third-party/             # Third-party services
        ├── payment/
        │   └── stripe.md
        └── auth/
            └── auth0.md
```

### Reference vs Main Documents

| Type | Location | Purpose |
|------|----------|---------|
| Main | `{category}/xxx.md` | Project core knowledge |
| Reference | `{category}/references/` | External resource references |

## Git Recommendations

| Path | Commit? | Reason |
|------|:-------:|--------|
| `.opc/knowledgebase/` | ✅ | Team-shared knowledge |
