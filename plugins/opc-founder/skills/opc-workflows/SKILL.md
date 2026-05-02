---
name: opc-workflows
invoke-name: opc-founder:opc-workflows
description: Manage OPC workflow specifications — create, list, update, or customize workflows for different task scenarios
---

# OPC Workflows Manager

Manage workflow specifications that guide OPC pipeline assembly.

## Usage

```shell
/opc-workflows [command] [options]
```

## Commands

| Command | Description |
|---------|-------------|
| `list` | List all workflow specs |
| `show <name>` | Show a specific workflow spec |
| `create <name>` | Create a new workflow spec (interactive) |
| `update <name>` | Update an existing workflow spec |
| `delete <name>` | Delete a workflow spec |
| `export <name>` | Export workflow spec to file |
| `import <file>` | Import workflow spec from file |

## What is a Workflow Spec?

A **Workflow Spec** is a reusable template that defines:

1. **When to use** — Keywords/triggers that match this workflow
2. **Pipeline stages** — Which stages to execute
3. **Stage requirements** — Required outputs, gates, and constraints
4. **Agent selection** — Which agents for each stage
5. **Execution rules** — TDD, SDD, parallel/sequential, etc.

## Built-in Workflows

Run `/opc-workflows list` to see all available workflows.

| Workflow | Triggers | Description |
|----------|----------|-------------|
| feature-development | 实现、开发、功能 | 通用功能开发 (SDD + TDD) |
| bug-fix | 修复、bug、错误 | Bug 诊断 + TDD 修复 |
| security-fix | 安全、漏洞、CVE | 安全审计 + TDD 修复 |
| performance-optimization | 性能、优化、慢 | 性能基准 + 优化 |
| api-development | API、接口、REST | API-First + 契约测试 |
| refactor | 重构、清理 | 保持测试通过 |
| documentation | 文档、readme | 文档更新 |
| config-change | 配置、环境变量 | 配置变更 |
| product-design | 产品设计 | 需求 + 设计 + 评审 |
| feature-page | 独立页面、landing page | 完整功能页面 (前后端并行) |

Use `/opc-workflows show <name>` for details.

## Workflow Spec Structure

```json
{
  "name": "workflow-name",
  "description": "When to use this workflow",
  "triggers": {
    "keywords": ["关键词1", "关键词2"],
    "patterns": ["regex pattern"]
  },
  "pipeline": [
    {
      "stage": "product",
      "required": true,
      "outputs": ["spec.md", "acceptance-criteria.json"],
      "agents": ["product-agent"],
      "agent_mode": "sequential",
      "skills": ["spec-driven-development"],
      "constraints": ["sdd_spec_required"]
    },
    {
      "stage": "dev",
      "required": true,
      "outputs": ["tests/", "implementation"],
      "agents": ["frontend-agent", "backend-agent"],
      "agent_mode": "parallel",
      "skills": ["test-driven-development"],
      "constraints": ["tdd_red_first", "tdd_green_minimal"]
    }
  ],
  "gates": [
    {
      "name": "sdd_spec_required",
      "description": "Product must produce Spec before Dev",
      "check": "stages.product.artifacts.includes('spec.md')",
      "blocker": "Dev blocked: No Spec found"
    }
  ],
  "rules": {
    "tdd": true,
    "sdd": true,
    "parallel_allowed": true
  }
}
```

### Key Fields

| Field | Description |
|-------|-------------|
| `agents` | Array of agent names for this stage |
| `agent_mode` | `"parallel"` or `"sequential"` (default: sequential) |
| `skills` | Skills to invoke for this stage |
| `constraints` | Gates that must pass before/during stage |
| `required` | Whether this stage is mandatory |

### Agent Execution Modes

| Mode | Behavior | Use When |
|------|----------|----------|
| `sequential` | Agents run one after another | Order matters, output feeds next |
| `parallel` | All agents run simultaneously | Independent work, no dependencies |

**Example:**
```json
{
  "stage": "dev",
  "agents": ["frontend-agent", "backend-agent"],
  "agent_mode": "parallel"
}
```
→ frontend-agent and backend-agent start together, work independently.

### Gates

**Gates** are checkpoints that block a stage from starting until conditions are met.

| Gate | Check | Blocks |
|------|-------|--------|
| `sdd_spec_required` | Product produced spec.md | Dev stage |
| `tdd_red_first` | Failing test written | Implementation |
| `design_required` | Design produced wireframes | Dev stage |
| `security_audit_required` | Security audit passed | Ship stage |

## Interactive Workflow Creation

When user runs `/opc-workflows create <name>`:

```
OPC: Let's create a new workflow spec together.

1. What triggers this workflow? (keywords)
   User: 移动端开发、app、iOS、Android

2. What stages should be executed?
   Available: product, design, dev, qa, ship, growth

   User: product → design → dev → qa

3. For each stage, tell me:
   - Required outputs?
   - Required or optional?
   - Agent mode: parallel or sequential?
   - Special constraints?

   Product stage:
   - Outputs: spec.md, mobile-spec.md
   - Required: yes
   - Agents: product-agent
   - Mode: sequential

   Design stage:
   - Outputs: mobile-design/, platform-specs.md
   - Required: yes (mobile needs design)
   - Agents: web-agent, mobile-agent
   - Mode: parallel

   Dev stage:
   - Outputs: app code
   - Required: yes
   - Agents: mobile-developer, backend-agent
   - Mode: parallel
   - TDD: yes

   QA stage:
   - Outputs: device test report
   - Required: yes
   - Agents: qa-agent
   - Mode: sequential

4. Any gates/constraints?
   User: 必须有移动端设计规范才能开发

5. Summary:

   Workflow: mobile-development
   Triggers: 移动端开发、app、iOS、Android
   Pipeline: Product → Design → Dev → QA

   Gates:
   - mobile_design_required: Design must produce mobile-spec

   Save? [Y/n]
```

## Workflow Selection Logic

When `/opc <task>` is invoked:

```
1. Extract task description
2. Match against workflow triggers (keywords + patterns)
3. If multiple matches, ask user to confirm
4. If no match, OPC uses default reasoning to assemble pipeline
5. Load workflow spec and execute according to its rules
```

## File Locations

```
.opc/
└── workflows/
    ├── feature-development.json
    ├── bug-fix.json
    ├── security-fix.json
    ├── product-design.json
    ├── api-development.json
    ├── refactor.json
    ├── documentation.json
    ├── feature-page.json
    └── my-custom-workflow.json   # User-created workflows
```

**Note:** Built-in workflows are installed to `.opc/workflows/` when running `/opc-plugin install`. Users can:
- View and edit any workflow directly
- Create new workflows with `/opc-workflows create`
- All workflows in this directory are available for OPC to use

## Examples

### List workflows
```
/opc-workflows list

Output:
Built-in Workflows:
  1. feature-development (SDD + TDD)
  2. bug-fix (Diagnosis + TDD)
  3. security-fix (Security + TDD)
  4. performance-optimization
  5. api-development
  6. refactor
  7. documentation
  8. config-change
  9. product-design
  10. feature-page

Custom Workflows:
  11. mobile-development (your custom)
```

### Show a workflow
```
/opc-workflows show feature-development

Output:
Workflow: feature-development
Triggers: 实现、开发、添加、新增、功能
Pipeline: Product → Design (optional) → Dev → QA → Ship (optional)

Stage Requirements:
  Product: Required, outputs spec.md, acceptance-criteria.json
  Dev: Required, TDD enforced (RED → GREEN → REFACTOR)

Gates:
  - sdd_spec_required: Dev blocked without Spec
  - tdd_red_first: Implementation blocked without failing test
```

### Create custom workflow
```
/opc-workflows create my-workflow

[Interactive conversation to define workflow]
```

### Use workflow in task
```
/opc 实现用户登录

OPC detects: feature-development workflow
Shows: "Using feature-development (SDD + TDD). Confirm? [Y/n]"

Or explicitly:
/opc 实现用户登录 --workflow=api-development
```

## Integration with OPC

The `opc-workflows` skill provides workflow specs that `opc` skill uses:

1. **opc skill** reads workflow specs at initialization
2. **opc skill** matches task to appropriate workflow
3. **opc skill** executes pipeline according to workflow rules
4. **opc-workflows skill** allows users to customize/create workflows

## Guidelines

- Built-in workflows are best practices — don't modify directly
- Create custom workflows for team-specific processes
- Use `show` to understand a workflow before applying
- Gates ensure quality — don't bypass them
- TDD/SDD workflows are recommended for code changes
