# dev-kit

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
