# product-kit

Product stage plugin — research, requirements, brainstorming, and specification for the one-person company.

## Components

### Skills

| Skill | Description |
|-------|-------------|
| `/research` | Market and user research |
| `/requirement` | Product requirements document (PRD) |
| `/brainstorm` | Structured brainstorming (SCAMPER / First Principles / Inversion) |
| `/spec-driven-development` | Define specifications before implementation (SDD + TDD integration) |

### Agents

| Agent | Model | Description |
|-------|-------|-------------|
| product-agent | sonnet | Product manager agent — research, requirements, brainstorming |
| startup-analyst | inherit | TAM/SAM/SOM, financial modeling, competitive analysis |
| business-analyst | sonnet | Business process analysis, requirements elicitation, stakeholder management |

## Quick Start

### Research

```shell
/research <topic>
```

Conducts market research, user interviews, competitive analysis.

### Requirements

```shell
/requirement <feature>
```

Generates structured PRD with:
- Problem statement
- User stories
- Acceptance criteria
- Success metrics

### Brainstorm

```shell
/brainstorm <challenge>
```

Structured ideation using:
- **SCAMPER**: Substitute, Combine, Adapt, Modify, Put to other use, Eliminate, Reverse
- **First Principles**: Break to fundamentals, rebuild
- **Inversion**: What would guarantee failure? Flip it

### Spec-Driven Development

```shell
/spec-driven-development
```

Defines specifications before implementation:
1. Interface Contract (API, request/response)
2. Data Model (entities, constraints)
3. Behavior Rules (business logic)
4. Boundary Conditions (validation, edge cases)

## Workflow Integration

```
/research → /requirement → /spec-driven-development → /architect (dev-kit)
```

### SDD → TDD Flow

```
Spec Definition → Spec Review → Test Derivation → Implementation → Verification
```

## Agent Usage

### product-agent

Use for:
- Market research and analysis
- User story writing
- Feature prioritization
- Product roadmap planning

### startup-analyst

Use for:
- Market sizing (TAM/SAM/SOM)
- Financial projections
- Competitive landscape
- Business model validation

### business-analyst

Use for:
- Process mapping
- Requirements gathering
- Stakeholder analysis
- Gap analysis

## Handoff Protocol

### To design-kit
- Requirements → ux-agent for user flows
- User stories → ui-agent for UI specs

### To dev-kit
- Specifications → /architect for architecture
- API contracts → backend-agent for implementation
