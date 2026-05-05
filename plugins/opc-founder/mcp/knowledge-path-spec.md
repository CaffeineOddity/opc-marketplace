# OPC Knowledge Library Path Specification

## Directory Structure

```
{git_root}/.opc/knowledge/{requirement_id}/{category}/xxxx.md
```

### Components

- **git_root**: Git repository root directory
- **.opc/knowledge**: Knowledge library root
- **requirement_id**: Unique requirement identifier (e.g., `REQ-001`, `REQ-002`)
- **category**: Knowledge category (aligned with OPC pipeline stages)
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

## Example Structure

```
.opc/knowledge/REQ-001/
├── requirement/
│   ├── main.md           # Main requirement document
│   ├── user-stories.md   # User stories
│   └── acceptance.md     # Acceptance criteria
├── design/
│   ├── ui.md             # UI design spec
│   ├── interaction.md    # Interaction design
│   └── assets.md         # Design assets reference
├── backend/
│   ├── api.md            # API design
│   ├── architecture.md   # Backend architecture
│   └── test.md           # Backend test plan
├── ios/
│   ├── tech.md           # iOS technical design
│   └── test.md           # iOS test plan
├── android/
│   ├── tech.md           # Android technical design
│   └── test.md           # Android test plan
├── harmony/
│   ├── tech.md           # HarmonyOS technical design
│   └── test.md           # HarmonyOS test plan
├── web/
│   ├── tech.md           # Web technical design
│   └── test.md           # Web test plan
├── miniprogram/
│   ├── tech.md           # Mini program technical design
│   └── test.md           # Mini program test plan
├── qa/
│   ├── test-plan.md      # Overall test plan
│   ├── test-cases.md     # Test cases
│   └── regression.md     # Regression test checklist
├── ship/
│   ├── deployment.md     # Deployment guide
│   ├── ci-cd.md          # CI/CD configuration
│   ├── infrastructure.md # Infrastructure setup
│   └── runbook.md        # Operations runbook
└── growth/
    ├── metrics.md        # Growth metrics definition
    ├── analytics.md      # Analytics implementation
    └── marketing.md      # Marketing strategy
```

## MCP Tools

### opc_knowledge_init
Initialize knowledge library for a requirement.

### opc_knowledge_read
Read knowledge documents. Parameters:
- `requirementId`: Requirement ID
- `category`: Knowledge category (required)
- `doc`: Document name (optional, if omitted reads all docs in category)

### opc_knowledge_write
Write or update knowledge documents. Parameters:
- `requirementId`: Requirement ID
- `category`: Knowledge category
- `doc`: Document name
- `content`: Content to write
- `mode`: `append` | `update` | `overwrite`
- `section`: Section header to update (for `update` mode)

### opc_knowledge_exists
Check if a knowledge document exists.

### opc_knowledge_list
List all requirements in the knowledge library. Optional filters:
- `status`: Filter by status
- `category`: Filter by category

### opc_knowledge_docs
List all documents in a specific category for a requirement.

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