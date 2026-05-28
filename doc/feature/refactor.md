# OPC 设计

## 一、Marketplace 目录结构

```
opc-marketplace/
│
├── marketplace.json
├── README.md
├── CLAUDE.md
│
├── platform/
│   │
│   ├── opc-core/
│   │   ├── .claude-plugin/plugin.json
│   │   ├── mcp/
│   │   │   ├── index.ts
│   │   │   ├── server.ts
│   │   │   ├── tools/
│   │   │   │   ├── state.ts
│   │   │   │   ├── knowledge.ts
│   │   │   │   ├── session.ts
│   │   │   │   ├── stage.ts
│   │   │   │   ├── node.ts
│   │   │   │   └── guidance.ts
│   │   │   ├── engine/
│   │   │   │   ├── gate-evaluator.ts
│   │   │   │   ├── stage-validator.ts
│   │   │   │   ├── task-analyzer.ts
│   │   │   │   ├── node-resolver.ts
│   │   │   │   └── knowledge-flow.ts
│   │   │   ├── state.ts
│   │   │   ├── session.ts
│   │   │   ├── lock.ts
│   │   │   └── paths.ts
│   │   ├── hooks/
│   │   │   ├── entry-gate-check.json
│   │   │   ├── exit-gate-check.json
│   │   │   ├── knowledge-load.json
│   │   │   ├── knowledge-save.json
│   │   │   └── stage-transition.json
│   │   └── references/
│   │       └── platform-protocol.md
│   │
│   └── opc-orchestrator/
│       ├── .claude-plugin/plugin.json
│       ├── agents/
│       │   ├── orchestrator.md
│       │   ├── task-classifier.md
│       │   └── stage-guide.md
│       ├── skills/
│       │   ├── opc-status/SKILL.md
│       │   ├── opc-stage/SKILL.md
│       │   └── opc-nodes/SKILL.md
│       ├── hooks/
│       │   └── capability-discovery.json
│       └── references/
│           ├── orchestration-guide.md
│           └── stage-protocol.md
│
├── stages/
│   ├── 00-ideation/
│   │   ├── stage.md
│   │   ├── entry-gates.md
│   │   ├── exit-gates.md
│   │   ├── nodes.md
│   │   └── deliverables.md
│   ├── 01-validation/
│   ├── 02-planning/
│   ├── 03-design/
│   ├── 04-implementation/
│   ├── 05-testing/
│   ├── 06-release/
│   ├── 07-growth/
│   └── 08-scale/
│
├── scenarios/
│   ├── build-saas.md
│   ├── build-mobile-app.md
│   ├── add-feature.md
│   ├── fix-bug.md
│   ├── security-audit.md
│   ├── redesign-product.md
│   ├── performance-optimize.md
│   ├── launch-product.md
│   └── incident-response.md
│
├── kits/
│   │
│   ├── product-kit/
│   │   ├── .claude-plugin/plugin.json
│   │   ├── agents/
│   │   │   ├── product-manager.md
│   │   │   ├── market-analyst.md
│   │   │   ├── startup-advisor.md
│   │   │   └── ux-researcher.md
│   │   ├── skills/
│   │   │   ├── write-prd/
│   │   │   │   ├── SKILL.md
│   │   │   │   ├── checklist.md
│   │   │   │   └── examples.md
│   │   │   ├── competitor-analysis/
│   │   │   ├── market-sizing/
│   │   │   ├── startup-brainstorm/
│   │   │   └── pricing-strategy/
│   │   ├── nodes/
│   │   │   ├── market-research.md
│   │   │   ├── competitive-analysis.md
│   │   │   ├── user-persona.md
│   │   │   ├── prd-writing.md
│   │   │   └── opportunity-sizing.md
│   │   ├── knowledge/
│   │   │   ├── jobs-to-be-done.md
│   │   │   ├── lean-startup.md
│   │   │   └── product-playbooks.md
│   │   ├── templates/
│   │   │   ├── prd-template.md
│   │   │   └── persona-template.md
│   │   ├── hooks/
│   │   │   └── spec-validation.json
│   │   └── mcp/.mcp.json
│   │
│   ├── design-kit/
│   │   ├── .claude-plugin/plugin.json
│   │   ├── agents/
│   │   │   ├── ui-designer.md
│   │   │   ├── ux-designer.md
│   │   │   └── design-reviewer.md
│   │   ├── skills/
│   │   │   ├── generate-wireframe/
│   │   │   ├── create-design-system/
│   │   │   ├── generate-ui/
│   │   │   ├── accessibility-audit/
│   │   │   └── mobile-ux-review/
│   │   ├── nodes/
│   │   │   ├── wireframe.md
│   │   │   ├── design-system.md
│   │   │   ├── web-ui.md
│   │   │   ├── mobile-ui.md
│   │   │   ├── brand-identity.md
│   │   │   ├── interaction-design.md
│   │   │   └── accessibility-review.md
│   │   ├── knowledge/
│   │   │   ├── ios-hig.md
│   │   │   ├── material-design.md
│   │   │   └── interaction-patterns.md
│   │   ├── templates/
│   │   │   ├── design-spec-template.md
│   │   │   └── design-system-template.md
│   │   ├── hooks/
│   │   └── mcp/.mcp.json
│   │
│   ├── dev-kit/
│   │   ├── .claude-plugin/plugin.json
│   │   ├── agents/
│   │   │   ├── frontend-engineer.md
│   │   │   ├── backend-engineer.md
│   │   │   ├── database-engineer.md
│   │   │   ├── security-engineer.md
│   │   │   └── architect.md
│   │   ├── skills/
│   │   │   ├── scaffold-nextjs/
│   │   │   ├── build-api/
│   │   │   ├── auth-system/
│   │   │   ├── code-review/
│   │   │   └── security-audit/
│   │   ├── nodes/
│   │   │   ├── scaffold.md
│   │   │   ├── api-design.md
│   │   │   ├── database-schema.md
│   │   │   ├── tdd-implementation.md
│   │   │   ├── frontend-component.md
│   │   │   ├── backend-endpoint.md
│   │   │   ├── auth-integration.md
│   │   │   ├── security-review.md
│   │   │   ├── performance-optimize.md
│   │   │   └── dependency-update.md
│   │   ├── knowledge/
│   │   │   ├── clean-architecture.md
│   │   │   ├── react-patterns.md
│   │   │   └── database-patterns.md
│   │   ├── templates/
│   │   │   ├── architecture-template.md
│   │   │   └── api-spec-template.md
│   │   ├── hooks/
│   │   │   ├── tdd-gate.json
│   │   │   └── verification-gate.json
│   │   └── mcp/.mcp.json
│   │
│   ├── qa-kit/
│   │   └── ...
│   │
│   ├── ship-kit/
│   │   └── ...
│   │
│   └── growth-kit/
│       └── ...
│
├── scripts/
├── .github/workflows/
└── .mcp.json
```

---

## 二、用户项目目录结构

```
my-project/                              # 用户工程目录（claude 执行目录）
│
├── .claude/
│   ├── settings.json
│   └── permissions.json
│
├── .opc/                                # 运行时状态（gitignore）
│   ├── state/
│   │   ├── locks/
│   │   └── sessions/
│   └── .project-init
│
├── opc-knowledge/                       # 项目知识库（git 跟踪）
│   ├── index.json
│   └── features/
│       ├── user-auth/
│       │   ├── requirement/main.md
│       │   ├── planning/architecture.md
│       │   ├── implementation/tech.md
│       │   └── testing/test-plan.md
│       └── payment/
│           └── ...
│
├── opc-memory/                          # 项目持久记忆（git 跟踪）
│   ├── architecture.md
│   ├── api-contracts.md
│   ├── coding-conventions.md
│   ├── design-system.md
│   └── decisions.md
│
├── opc-deliverables/                    # 阶段产出物（git 跟踪）
│   ├── 02-planning/
│   │   ├── api-design.md
│   │   └── database-schema.md
│   └── 04-implementation/
│       └── ...
│
├── opc-logs/                            # 运行日志（gitignore）
│   ├── stages/
│   ├── agent-runs/
│   ├── failures/
│   └── telemetry/
│
├── src/                                 # 项目实际代码
├── tests/
├── package.json
└── ...
```

---

## 三、架构分层

```
┌──────────────────────────────────────────────────┐
│  kits/ (业务层)                                    │
│  领域 Agent + Skill + Node + Knowledge + Template  │
│  每个 kit 通过 plugin.json 声明式暴露能力            │
├──────────────────────────────────────────────────┤
│  platform/opc-orchestrator (编排层)                 │
│  意图识别 → 任务分析 → 阶段推荐 → 节点解析 → 调度    │
├──────────────────────────────────────────────────┤
│  platform/opc-core (基础设施层)                      │
│  MCP 工具 + Gate 引擎 + 节点解析器 + 知识流引擎       │
│  所有引擎都是 TypeScript 代码，不是 prompt           │
└──────────────────────────────────────────────────┘
```

---

## 四、核心设计

### 1. 意图触发

不设 `/opc` 入口命令。自然语言就是入口。orchestrator 自动判断用户意图：

```
用户: 实现用户认证系统      → 识别为任务，启动管线
用户: 修复登录页样式错乱    → 识别为任务，启动管线
用户: 这个变量命名怎么样    → 识别为问答，直接回答
用户: 今天天气怎么样        → 静默，不介入
```

保留三个精确命令用于手动控制：

| 命令 | 用途 |
|------|------|
| `/opc-status` | 查看管线进度 + 下一步建议 |
| `/opc-stage` | 手动跳转/重试某个阶段 |
| `/opc-nodes` | 查看当前阶段的节点选项 |

### 2. Marketplace 与项目分离

- Marketplace 只提供 platform + kits。不含项目数据。
- 用户运行 `claude` 的目录就是项目根目录。OPC 在此创建 `.opc/`、`opc-knowledge/`、`opc-memory/`、`opc-deliverables/`。
- 知识库和记忆属于项目，切换目录 = 切换知识上下文。

### 3. 三层知识体系

| 层 | 位置 | 性质 | 类比 |
|---|------|------|------|
| knowledge | kit 内 | 静态领域知识，随 kit 分发 | 教科书 |
| opc-knowledge | 项目内 | 阶段知识积累，随阶段推进写入 | 课堂笔记 |
| opc-memory | 项目内 | 跨任务持久记忆，缓慢演进 | 个人心得 |

### 4. 节点（Node）替代工作流（Workflow）

不用预设流程模板。阶段根据任务信号自主选择节点，node-resolver 自动解析依赖、拓扑排序、生成执行计划。

**节点定义**（每个节点一个 markdown 文件，frontmatter + 执行指令）：

```markdown
---
name: tdd-implementation
stage: 04-implementation
description: TDD 驱动的功能实现，RED → GREEN → REFACTOR

requires:
  - type: artifact
    value: spec.md
  - type: artifact
    value: architecture.md
  - type: knowledge
    category: requirement
    doc: main

provides:
  - artifacts: [tests/, src/]
  - knowledge:
      category: implementation
      doc: tech

agents:
  primary: [backend-engineer, frontend-engineer]
  optional: [database-engineer]
skills: [test-driven-development]
mode: parallel

entry_gates: [spec-exists, architecture-reviewed]
exit_gates: [tests-passing, coverage-80pct, verification-complete]

depends_on: []
conflicts_with: []
enhances: []

effort: medium
reusable: true

signals:
  keywords: [实现, 开发, implement, build, feature, 功能]
  requires_frontend: false
  requires_backend: true
  requires_database: false
---

## TDD 功能实现

### RED —— 先写失败测试
1. 根据 spec.md 中的验收标准，编写测试用例
2. 运行测试，确认测试失败

### GREEN —— 最小实现
1. 编写刚好能让测试通过的代码
2. 不要过度设计

### REFACTOR —— 重构
1. 消除重复代码，改善命名和结构
2. 运行测试，确认仍然全部通过

### Verification
- 运行 /verification-before-completion
```

**节点依赖解析**：

node-resolver.ts 输入选中节点列表，输出有序执行计划：

```
输入: [backend-endpoint, tdd-implementation, security-review]

解析 depends_on:
  backend-endpoint:     []
  tdd-implementation:   []
  security-review:      [tdd-implementation]

拓扑排序:
  Group 1: [backend-endpoint, tdd-implementation]  (并行)
  Group 2: [security-review]                        (依赖 Group 1)
```

### 5. 阶段节点选择

每个阶段通过 `nodes.md` 定义选择规则，将任务信号与节点的 `signals` 字段匹配：

```
任务: "实现用户认证系统"
分析结果: { domains: ["backend", "auth"], requires_database: true, requires_auth: true }

04-implementation 阶段匹配:
  tdd-implementation:    核心节点 → 必选
  backend-endpoint:      requires_backend=true → 候选
  auth-integration:      requires_auth=true → 候选
  security-review:       auth 相关 → 推荐
  frontend-component:    requires_frontend=false → 跳过
  scaffold:              已有项目 → 跳过

用户确认: [tdd-implementation, backend-endpoint, auth-integration, security-review]

resolver 解析:
  auth-integration depends_on [backend-endpoint]
  security-review depends_on [tdd-implementation]

执行计划:
  Group 1: [backend-endpoint, tdd-implementation]  并行
  Group 2: [auth-integration]                       串行
  Group 3: [security-review]                        串行
```

### 6. Scenario（场景配方）

轻量级推荐参考，不参与匹配逻辑，不强制流程。只在分析结果中作为提示：

```markdown
# Scenario: add-feature

## 推荐
- 02-planning: api-design, database-schema
- 04-implementation: tdd-implementation
- 05-testing: integration-test (+ security-scan 如涉及安全)

## 常见变化
- 只需后端 → 跳过前端节点
- 涉及认证 → 增加 auth-integration
- 新项目 → 增加 scaffold
```

### 7. 引擎（TypeScript 代码，非 prompt）

```
platform/opc-core/mcp/engine/
│
├── gate-evaluator.ts      # 门禁条件求值
├── stage-validator.ts     # 阶段转换校验
├── task-analyzer.ts       # LLM 任务分析
├── node-resolver.ts       # 节点依赖解析 + 拓扑排序
└── knowledge-flow.ts      # 知识流强制执行
```

### 8. 9 阶段

```
00-ideation       构思 —— 想法验证、可行性分析
01-validation     验证 —— 市场验证、用户调研
02-planning       规划 —— 技术选型、架构设计
03-design         设计 —— UI/UX、品牌设计
04-implementation 实现 —— 编码、TDD
05-testing        测试 —— QA、安全审计
06-release        发布 —— 部署、CI/CD
07-growth         增长 —— 营销、SEO
08-scale          规模化 —— 性能优化、架构演进
```

每个阶段目录包含 5 个文件：

| 文件 | 内容 |
|------|------|
| `stage.md` | 阶段目标、职责、参与角色 |
| `entry-gates.md` | 进入条件（可被 gate-evaluator 求值） |
| `exit-gates.md` | 退出条件（可被 gate-evaluator 求值） |
| `nodes.md` | 可用节点 + 选择规则 |
| `deliverables.md` | 必须产出的交付物清单 |

### 9. Hook 体系

```
entry-gate-check   PreToolUse(Agent)   调度前检查入口条件
exit-gate-check    PostToolUse(Agent)  完成后检查出口条件
knowledge-load     PreToolUse(Agent)   自动加载前置知识
knowledge-save     PostToolUse(Agent)  自动保存产出知识
stage-transition   Stop               检测完成，提示推进
node-completion    PostToolUse(Agent)  解锁依赖节点
tdd-gate           PreToolUse(Write)   强制先写测试
verification-gate  PreToolUse(Write)   强制验证完成
spec-validation    PostToolUse(Write)  自动校验 spec
capability-scan    SessionStart        扫描插件能力
```

### 10. plugin.json 声明式能力

```json
{
  "name": "dev-kit",
  "depends": ["opc-core"],
  "capabilities": {
    "stages": ["04-implementation"],
    "agents": [
      { "name": "frontend-engineer", "model": "sonnet", "expertise": ["react", "nextjs"] },
      { "name": "backend-engineer", "model": "sonnet", "expertise": ["api", "database"] }
    ],
    "skills": ["scaffold-nextjs", "build-api", "auth-system", "code-review"],
    "nodes": [
      "scaffold", "api-design", "database-schema", "tdd-implementation",
      "frontend-component", "backend-endpoint", "auth-integration",
      "security-review", "performance-optimize"
    ]
  }
}
```

`capability-discovery` hook 在 SessionStart 时扫描已安装 kit 的 plugin.json，动态构建 agent 目录、skill 索引和节点注册表。

---

## 五、执行流程

```
用户: 实现用户认证系统
         │
         ▼
┌─ 意图识别 ──────────────────────────────────────────────────┐
│  orchestrator 判断: 这是任务 → 启动管线                        │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌─ 任务分析 ──────────────────────────────────────────────────┐
│  task-classifier agent (haiku) 分析:                          │
│    complexity: medium                                         │
│    domains: [backend, auth]                                   │
│    signals: { backend:true, database:true, auth:true }        │
│    suggested_stages: [02-planning, 04-implementation,         │
│                       05-testing]                             │
│    knowledge_feature: "user-auth"                             │
│    scenario_hints: [add-feature]                              │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌─ 初始化 ────────────────────────────────────────────────────┐
│  opc_state_init:                                              │
│    → 创建/复用 knowledge feature "user-auth"                   │
│    → pipeline 初始化，无关阶段标记 skipped                     │
│    → 02-planning 进入 in_progress                             │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌─ 阶段: 02-planning ─────────────────────────────────────────┐
│                                                              │
│  读取 nodes.md → 匹配信号 → 候选: [api-design, database-schema]│
│  用户确认 → resolver: Group 1 (并行) [api-design, db-schema]  │
│                                                              │
│  执行 Group 1:                                               │
│    entry-gate-check → knowledge-load → Agent →               │
│    knowledge-save (→ opc-knowledge) → exit-gate-check         │
│                                                              │
│  stage-transition → "planning 完成，进入实现?"                │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌─ 阶段: 04-implementation ───────────────────────────────────┐
│                                                              │
│  匹配节点: [tdd-implementation, backend-endpoint,             │
│             auth-integration, security-review]                │
│                                                              │
│  resolver:                                                   │
│    Group 1 (并行): [backend-endpoint, tdd-implementation]     │
│    Group 2 (串行): [auth-integration]                        │
│    Group 3 (串行): [security-review]                         │
│                                                              │
│  逐组执行 → knowledge 流入 opc-knowledge/user-auth/           │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌─ 阶段: 05-testing ─────────────────────────────────────────┐
│  ... 类似流程                                                │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌─ /opc-status ───────────────────────────────────────────────┐
│  pipeline 进度、节点状态、阻塞项、知识库概况                    │
└──────────────────────────────────────────────────────────────┘
```

---

## 六、Gate 强制执行

```
执行 tdd-implementation 节点:
         │
         ▼
  stage-validator:  前置阶段 completed？entry-gates 满足？
  gate-evaluator:   节点 entry_gates [spec-exists, architecture-reviewed] 满足？
  node-resolver:    depends_on 节点全部 completed？
         │
         ▼
  全部通过 → knowledge-flow 加载前置知识 → Agent 执行
         │
         ▼
  Agent 完成 → knowledge-save 写入 opc-knowledge → exit-gate 检查
```

---

## 七、迁移路径

| Phase | 内容 |
|-------|------|
| 1 | 拆分 platform/opc-core + opc-orchestrator |
| 2 | 实现 engine/（gate-evaluator, stage-validator, node-resolver） |
| 3 | 节点化：每个 kit 创建 nodes/，stages 增加 nodes.md，创建 scenarios/ |
| 4 | 意图识别 + task-classifier + Hook 体系 |
| 5 | 9 阶段 + kits/ 完善（knowledge/templates 分离 + plugin.json capabilities） |
| 6 | 项目初始化工具（自动创建 opc-knowledge/、opc-memory/、opc-deliverables/） |

---

## 八、设计原则

1. **意图触发** —— 用户直接说话，不设 `/opc` 前缀
2. **代码引擎 > Prompt 引擎** —— Gate、依赖解析、知识流用 TypeScript 实现
3. **节点组装** —— 阶段自主选择节点，resolver 自动处理依赖
4. **Marketplace 只分发，不存数据** —— 知识、记忆、产出物都在用户项目里
5. **知识属于项目** —— 切换目录 = 切换知识上下文
6. **Hook 驱动自动化** —— gate、knowledge load/save 全自动
7. **声明式发现** —— plugin.json capabilities 让编排器动态发现能力
8. **阶段是强约束** —— entry/exit gates 不满足则阻止
