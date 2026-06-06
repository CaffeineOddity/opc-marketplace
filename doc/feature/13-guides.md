# 节点系统（Nodes）

节点按阶段组织在 `phases/<phase>/nodes/`，模板在 `phases/<phase>/templates/`。管线控制节点在 `platform/opc-orchestrator/pipeline/`。

不区分 "Guide" 和 "Node"——管线控制和任务执行都是节点，格式相同（frontmatter + 执行指令）。

## 目录结构

```
phases/
├── 00-ideation/
│   ├── phase.md
│   ├── nodes.md                      # 选择策略
│   ├── nodes/                        # 节点
│   │   ├── market-research.md
│   │   ├── competitive-analysis.md
│   │   └── opportunity-sizing.md
│   └── templates/
│
├── 01-validation/
│   ├── phase.md
│   ├── nodes.md
│   ├── nodes/
│   │   ├── user-persona.md
│   │   └── prd-writing.md
│   └── templates/
│       ├── prd-template.md
│       └── persona-template.md
│
├── 04-implement-design/
│   ├── phase.md
│   ├── nodes.md
│   ├── nodes/
│   │   ├── api-design.md
│   │   ├── database-schema.md
│   │   └── scaffold.md
│   └── templates/
│       ├── architecture-template.md
│       └── api-spec-template.md
│
├── 05-implement/
│   ├── phase.md
│   ├── nodes.md
│   ├── nodes/
│   │   ├── tdd-implementation.md
│   │   ├── frontend-component.md
│   │   ├── backend-endpoint.md
│   │   ├── auth-integration.md
│   │   ├── security-review.md
│   │   ├── performance-optimize.md
│   │   └── dependency-update.md
│   └── templates/
│
├── 03-design/
│   ├── phase.md
│   ├── nodes.md
│   ├── nodes/
│   │   ├── wireframe.md
│   │   ├── design-system.md
│   │   ├── web-ui.md
│   │   ├── mobile-ui.md
│   │   ├── brand-identity.md
│   │   ├── interaction-design.md
│   │   └── accessibility-review.md
│   └── templates/
│       ├── design-spec-template.md
│       └── design-system-template.md
│
├── 06-testing/
│   ├── phase.md
│   ├── nodes.md
│   ├── nodes/
│   │   └── accessibility-audit.md
│   └── templates/
│
├── 07-release/
│   ├── phase.md
│   ├── nodes.md
│   ├── nodes/
│   │   ├── deployment-setup.md
│   │   └── ci-cd-pipeline.md
│   └── templates/
│
├── 08-growth/
│   ├── phase.md
│   ├── nodes.md
│   ├── nodes/
│   │   └── seo-optimize.md
│   └── templates/
│
└── 09-scale/
    ├── phase.md
    ├── nodes.md
    ├── nodes/
    │   └── architecture-evolve.md
    └── templates/
```

## 节点类型

| 类型 | frontmatter 标识 | 驱动对象 | 执行者 |
|------|-----------------|---------|--------|
| 管线控制节点 | `used_by: [orchestrator, ...]` | 管线步骤（意图识别、任务分析、阶段执行） | orchestrator / engine |
| 任务执行节点 | `phase: 05-implement` | 任务内容（编码、测试、设计） | Agent |

两类节点格式完全相同。`opc_phase_start` 扫描 `platform/opc-orchestrator/pipeline/` + `<phase>/nodes/`，按 tag 交集 + 语义匹配排序。

## 节点来源

节点按阶段组织在 `phases/` 下，项目通过 `opc-nodes/` 覆盖。

- 内置节点随 marketplace 分发，与阶段定义、模板同目录
- 废弃了原来的 `kits/*/nodes/` 分散结构

## 加载时机

```
Session Start
  → orchestrator 扫描 platform/opc-orchestrator/pipeline/ 获取管线控制节点
  → 扫描 phases/ 下所有子目录的 nodes/ + templates/ 建立索引
  → 项目 opc-nodes/ 下同名子目录/文件覆盖内置任务节点

管线执行时:
  → opc_phase_start 加载 platform/opc-orchestrator/pipeline/ + phases/<phase>/nodes/
  → Agent 按 node body 中的指令执行具体操作
```

## 项目覆盖

用户可在 `opc-nodes/` 下按相同目录结构覆盖：

```
my-project/
└── opc-nodes/
    ├── 04-implement-design/nodes/
    │   └── api-design.md               # 覆盖内置任务节点
    └── 05-implement/nodes/
        └── tdd-implementation.md
```

优先级：`opc-nodes/` > `phases/`。部分覆盖即可。

## 管线控制节点

驱动机器行为，不绑定特定 phase，由 orchestrator 在各步骤直接引用。

### intent-analysis

```markdown
---
name: intent-analysis
description: 分析用户自然语言输入，识别意图类型和置信度
used_by: [orchestrator, task-classifier]
model: haiku
input:
  - user_message: string
output:
  - intent: task | project_question | general_question | chat
  - confidence: 0.0-1.0
  - needs_clarification: boolean
---

## 分类规则

### 任务意图 (task)
用户想完成一个具体的开发任务：
- 动词 + 目标："实现用户认证系统"、"修复登录页样式"
- 明确功能需求："加一个导出 PDF 的功能"
- 包含技术动作："重构 user 模块"、"部署到生产环境"
→ 触发 opc_pipeline_start，走完整管线

### 项目问答意图 (project_question)
用户针对当前项目提问，回答需要项目上下文：
- 代码/设计询问："这个模块为什么这样设计"、"我们的用户认证是怎么做的"
- 项目内对比："这里用 Redis 还是 Memcached 更合适"
- 关联知识库的审查："帮我看下这段代码"、"这变量命名怎么样"
→ 触发 opc_knowledge_search 轻量查询，不启动管线，不创建 state

### 通用问答意图 (general_question)
与当前项目无关的纯知识问答：
- "Rust 的 ownership 机制是什么"
- "闭包和匿名函数有什么区别"
- "Kubernetes 的基本组件有哪些"
→ 零 OPC 介入，直接回答

### 闲聊意图 (chat)
与技术任务无关的对话：
- 问候、闲聊、无实际技术内容
→ 零 OPC 介入，直接回复

## 区分 project_question vs general_question 的信号

| 信号 | 偏向 |
|------|------|
| 提及项目中的具体文件、函数、模块名 | project_question |
| 使用"我们"、"这里的"、"这个项目"等指代词 | project_question |
| 引用 opc-knowledge/ 中的概念 | project_question |
| 通用技术概念，无项目指代 | general_question |
| 纯定义/解释类问题 | general_question |

## 置信度计算

| 信号 | 加权 |
|------|------|
| 包含动作动词（实现、修复、部署、重构） | +0.3 |
| 包含明确交付物（系统、功能、页面） | +0.2 |
| `!task` / `?` 显式前缀 | +1.0（直接确定） |
| 疑问词（怎么样、为什么、如何） | -0.3 |
| 简短无动词（"这个"、"帮忙"） | -0.2 |

## 阈值处理

| 置信度 | 行为 |
|--------|------|
| > 0.8 | 直接判定，不追问 |
| 0.5 - 0.8 | 主动确认 |
| < 0.5 | 按最高分意图执行，但不启动管线 |

## 纠错处理

- "不用启动管线" / "just answer" → 取消管线，作为问答处理
- "先不做了" / "cancel" → 取消管线，标记 aborted
- "这不是任务" / "not a task" → 取消管线，标记为问答样本
```

### task-analysis

```markdown
---
name: task-analysis
description: 分析任务描述，提取 tags、复杂度、推荐阶段、知识单元
used_by: [task-analyzer, task-classifier]
model: haiku
input:
  - user_message: string
  - intent: task
  - knowledge_context:                    # 来自 knowledge_list 的已有 unit 列表
      units: [{name, sections, status}]
output:
  - description: string (一句话任务描述)
  - tags: string[]
  - complexity: low | medium | high
  - suggested_phases: string[]
  - knowledge_unit: string[]
  - scenario_hints: string[]
  - task_brief:                           # 写入 .opc/pipelines/<id>/brief.md
      title: string
      constraints: string[]               # 用户显式约束
      knowledge_plan:                     # 知识操作计划
        - path: unit/section/subsection
          action: read | update | create
          current: string                  # 当前状态（version, 或 "—"）
          note: string
---

## 分析步骤

### 1. 提炼任务描述
将用户原始输入提炼为一句精确的任务描述。
- 补全隐含信息（上下文、技术栈）
- 去掉无关修饰
- 保留核心交付物

### 2. 打标签
从以下标签池中选择最匹配的 2-4 个：

| 类别 | 可用标签 |
|------|---------|
| 层次 | backend, frontend, fullstack, mobile, desktop, infra |
| 领域 | auth, database, api, ui, payment, storage, security, messaging |
| 操作 | add-feature, fix-bug, refactor, optimize, migrate, configure |

### 3. 判断复杂度

| 复杂度 | 判定标准 | 典型场景 |
|--------|---------|---------|
| **low** | 不需要规划，简单修改即可完成 | 修样式、改文案、加日志、调配置、小重构 |
| **medium** | 需要规划，但一轮即可完成，复杂程度不高 | 新增功能、加导出/导入、接入第三方服务 |
| **high** | 需要规划，且需要多轮推进 或 复杂程度高 | 重构核心模块、迁移数据库、改 API 协议、支付/认证体系改造 |

两问法定级：
1. 需要设计规划吗？ → 不需要 → **low**
2. 需要 → 能一轮解决且不复杂吗？ → 能 → **medium**；不能 → **high**

complexity 决定后续执行路径：

| 维度 | low | medium | high |
|------|-----|--------|------|
| 执行路径 | 快速通道：无管线/无 phases/无 state | 完整管线 | 完整管线 |
| 反思轮次 | — | 2-3 | 3-5 |
| 阶段推进 | — | 高置信度自动，其余确认 | 每阶段需用户确认 |
| brief | 不生成 | 标准：含完整 in/out scope | 详细：含 _refs 关联 unit + 风险提示 |
| 节点选择 | — | 标准 tag+语义筛选 | 不可跳过任何匹配节点 |
| 回退 | — | 需确认后回退 | 回退需说明原因 |
| 知识读取 | Agent 自行决定是否 opc_knowledge_get | 按节点 input 加载，opc_knowledge_get 前置 | 同 medium，额外展开 _refs 关联 unit |
| 知识写入 | 通常不写（无新增知识点）；微小修正可 opc_knowledge_write | opc_knowledge_write，写入即生效 | opc_knowledge_write，需更严格审查 |

### 4. 推荐阶段
根据任务性质选择必经阶段（跳过无关阶段）：

| 任务性质 | 推荐阶段 |
|---------|---------|
| 新功能 | 04-implement-design → 05-implement → 06-testing |
| Bug 修复 | 04-implement-design → 05-implement → 06-testing |
| 重构 | 04-implement-design → 05-implement → 06-testing |
| 安全审计 | 06-testing（仅安全扫描节点） |
| 新项目 | 00-ideation → 03-design → 04-implement-design → 05-implement → 06-testing |

### 5. 提取知识点
从任务描述中识别涉及的领域概念，输出为 unit 名称：

```
"实现用户认证系统" → ["user-auth"]
"实现支付和订阅功能" → ["payment", "subscription"]
"修复角色权限检查" → ["authorization"]
```

### 6. 匹配 Scenario
从以下 scenario 中选择最匹配的 1-2 个：
- `add-feature`：新增功能
- `fix-bug`：修复缺陷
- `redesign-product`：重新设计
- `performance-optimize`：性能优化
- `security-audit`：安全审计
- `launch-product`：产品发布
- `incident-response`：事故响应

### 7. 生成工作单
由 `brief-generation` 节点完成，详见 #brief-generation。

### task-decomposition

```markdown
---
name: task-decomposition
description: 大需求拆分为多条独立管线，分析 knowledge_unit 间依赖，输出并行/串行编排方案
used_by: [opc_pipeline_start]
trigger: 需要修改（update/create）的 knowledge_unit 数量 ≥ 2
  → 只读的 unit 不计入拆分判断。读不产生耦合
  → 仅 1 个 unit 需要修改 → 单管线（即使读取 N 个其他 unit）
  → 多个 unit 需要修改 → 执行拆分分析
model: haiku
input:
  - task_analysis_result:
      description: string
      tags: string[]
      complexity: high
      knowledge_unit: string[]           # > 2 个
      scenario_hints: string[]
  - knowledge_list_result:
      units: [{name, sections, _refs}]
output:
  - sub_pipelines: [{
      id: string
      title: string
      knowledge_unit: string[]           # 本管线负责的 unit（1-2 个）
      suggested_phases: string[]
      blocked_by: string[]               # 依赖的其他子管线 id
    }]
---

## 触发条件

按需要**修改**的 unit 数量判断（`read` 不计入）：

- 修改数 = 1：跳过
  - 例："给用户认证加个短信验证" → knowledge_unit: [user-auth(update), notification(read)]
  - notification 只读不写 → 单管线 sub-1: user-auth
- 修改数 ≥ 2：执行拆分分析
  - 修改的 unit 之间互相 _refs → 合并，输出 1 条管线
  - 修改的 unit 之间独立 → 拆分
  - 例："实现用户认证 + 消息通知" → knowledge_unit: [user-auth(create), notification(create)]
  - 两者无 _refs → sub-1: user-auth ∥ sub-2: notification

## 拆分原则

### 1. 按领域边界拆分
每个 knowledge_unit 天然对应一个领域（product → 商品、payment → 支付）。优先按 unit 边界拆，一个子管线负责 1-2 个紧密耦合的 unit：

```
knowledge_unit: [product, cart, order, payment, user-center]
                    ↓
子管线-1: product          (商品管理)
子管线-2: user-center      (用户中心)
子管线-3: cart             (购物车，依赖 product + user-center)
子管线-4: order + payment  (下单支付，依赖 cart + user-center)
```

### 2. 独立可并行的拆开
两个 unit 之间没有 `_refs` 引用、没有数据流依赖 → 拆成独立子管线，可并行执行：

```
product 和 user-center 没有互引 → 子管线-1 ∥ 子管线-2
```

### 3. 紧密耦合的合并
两个 unit 之间有强 `_refs` 引用（如 order 引用 payment 的计费逻辑）→ 合并到同一子管线：

```
order._refs → payment → 合并为子管线-4
```

### 4. 依赖推导（管线级 output → input）

子管线的 dependencies 通过 knowledge_unit 的 `_refs` 关系自动推导：

```
cart._refs → [product, user-center]
  → cart 子管线 blocked_by: [product 子管线, user-center 子管线]

order._refs → [cart, user-center]
  → order+payment 子管线 blocked_by: [cart 子管线, user-center 子管线]
```

## 输出格式

```json
{
  "sub_pipelines": [
    {
      "id": "sub-1",
      "title": "商品管理",
      "knowledge_unit": ["product"],
      "suggested_phases": ["04-implement-design", "05-implement", "06-testing"],
      "blocked_by": []
    },
    {
      "id": "sub-2",
      "title": "用户中心",
      "knowledge_unit": ["user-center"],
      "suggested_phases": ["04-implement-design", "05-implement", "06-testing"],
      "blocked_by": []
    },
    {
      "id": "sub-3",
      "title": "购物车",
      "knowledge_unit": ["cart"],
      "suggested_phases": ["04-implement-design", "05-implement", "06-testing"],
      "blocked_by": ["sub-1", "sub-2"]
    },
    {
      "id": "sub-4",
      "title": "下单与支付",
      "knowledge_unit": ["order", "payment"],
      "suggested_phases": ["04-implement-design", "05-implement", "06-testing"],
      "blocked_by": ["sub-3", "sub-2"]
    }
  ]
}
```

## 后续流程

拆分结果经用户确认后：
- 父级目录写入 `pipeline-plan.json`（子管线列表 + 依赖 + execution_order）
- 每条子管线独立执行后续步骤（knowledge_open → brief → state → phases）
- 按 blocked_by 决定执行顺序：sub-1 ∥ sub-2 → sub-3 → sub-4
- 每条子管线有自己的 `state.json` + `brief.md`，结构同单管线
- `opc_pipeline_status` 读取 pipeline-plan.json 展示整体进度
```

### brief-generation

```markdown
---
name: brief-generation
description: 根据任务分析结果和知识上下文生成工作单 brief.md
used_by: [opc_pipeline_start]
input:
  - task_analysis_result:
      description: string
      tags: string[]
      complexity: low | medium | high
      suggested_phases: string[]
      knowledge_unit: string[]
      scenario_hints: string[]
  - knowledge_list_result:
      units: [{name, sections, status}]
output:
  - brief.md → .opc/pipelines/<id>/sub-pipelines/sub-N/brief.md
---

## 工作单模板

```markdown
# 任务工作单

## 问题描述
<!-- 一句话描述要解决什么问题 -->
[用户原始需求的一句话概括]

## 基本信息
| 属性 | 值 |
|------|-----|
| 管线 ID | pipeline-xxx |
| 复杂度 | low / medium / high |
| 涉及阶段 | 04-implement-design → 05-implement → 06-testing |
| 关联 Scenario | add-feature |

## 范围
### 包含 (In-scope)
- [具体要做的内容 1]
- [具体要做的内容 2]

### 不包含 (Out-of-scope)
- [明确不做的事情 1]
- [明确不做的事情 2]

## 约束
<!-- 用户显式提出的约束条件 -->
- [技术栈限制、时间限制、兼容性要求等]
<!-- 若无显式约束，写"无特殊约束" -->

## 阶段计划
| 阶段 | 目标 | 关键节点 |
|------|------|---------|
| 04-implement-design | 实现设计 | api-design, database-schema, scaffold |
| 05-implement | 编码实现 | tdd-implementation, auth-integration |
| 06-testing | 验证测试 | [节点列表] |

## 关联知识
| 知识路径 | 操作 | 当前状态 | 说明 |
|---------|------|---------|------|
| user-auth/login/api | update | v2 | 需补充新接口 |
| user-auth/register/api | update | v1 | 已有初步内容，继续完善 |
| user-auth/session/api | read | v3 | 已有，直接复用 |
| payment/ | create | — | 全新 domain，从零构建 |

## 准入检查
- [ ] 知识库 `opc_knowledge_list` 已执行，已有 unit 结构已获取
- [ ] 知识库 `opc_knowledge_open` 已执行，目标 unit 已加载/创建
- [ ] 所有 read 目标的知识条目确实存在（不存在则需 planning 阶段补齐）
- [ ] 用户约束已确认（无约束则标注"无特殊约束"）
```

## 生成规则

0. **复杂度适配**：brief-generation 仅在 medium/high 时触发：
   - `low`：不生成 brief，不走管线，Agent 直接执行
   - `medium`：标准版。按模板完整填写
   - `high`：详细版。"范围"明确 in/out scope；"关联知识"额外展开 `_refs` 关联的 unit；"约束"追加风险提示（如"跨模块改动，需关注 xxx 模块兼容性"）
1. **问题描述**：从 task_analysis_result.description 取，保持一句话，不扩展
2. **范围**：根据任务 tags 和 description 推导 in-scope；不明确的事情归入 out-of-scope，宁可多列不遗漏
3. **约束**：仅写入用户显式提出的约束，不臆造约束；无约束时写"无特殊约束"
4. **阶段计划**：从 suggested_phases 按顺序列出，每个阶段补充对应 knowledge_unit 映射的关键节点
5. **关联知识**：逐条列出 knowledge_unit → 折叠为 knowledge_list 中已有的 sub-section 路径 → 标注操作类型和当前状态
   - 已存在且信息充分 → `read`
   - 已存在但需补充/修正 → `update`
   - 不存在 → `create`
   - `high` 复杂度额外展开 `_refs` 关联 unit
6. **准入检查**：固定生成 4 条基础检查项，确保知识前置步骤已执行
7. **写入后不修改**：brief.md 生成后不随管线执行自动修改；如需调整，用户在 phase review 时手动修改
```

### knowledge-operation

```markdown
---
name: knowledge-operation
description: 指导知识的打开、读取、写入、更新、搜索操作
used_by: [Agent, orchestrator]
---

## 操作流程

### 列出知识库 (opc_knowledge_list)
在意图识别之后执行，先于任务分析。为 task-analyzer 提供真实的知识上下文。

1. 扫描 `opc-knowledge/` 下所有 unit 目录
2. 读取每个 unit 的 index.json → 获取 sections 结构 + 状态
3. 返回所有 unit 名称、section 列表、各 subsection 版本号
4. 结果注入 task-analyer 的 knowledge_context

### 打开知识库 (opc_knowledge_open)
在 task-analysis 之后执行，基于准确的 knowledge_unit 定位目标 unit。

1. 遍历 knowledge_unit 中的每个 unit
2. 已存在的 unit → 读取 index.json，返回已有结构
3. 不存在的 unit → 创建目录 + 写入 index.json
4. 查找 _refs 关联的 unit → 标记为可读上下文
5. 返回：已有结构树 + 关联 unit

### 读取知识 (opc_knowledge_get)
Agent 执行 task node 时加载前置知识：

1. 解析 node 的 input.knowledge 列表
2. 逐条调用 opc_knowledge_get(unit, section, subsection)
3. 存在的条目 → 注入 Agent 上下文
4. 不存在的条目 → 提示 Agent 需要从头设计
5. 检查 version 是否满足 min_version 要求

### 写入知识 (opc_knowledge_write)
Agent 产出知识时按以下策略：

1. 调用 opc_knowledge_get 检查目标路径是否存在
2. **不存在** → 创建新文件，version: v1
3. **已存在** → 读取当前内容 → 分析差异：
   - 补充新信息 → 合并写入，version: v+1
   - 修正旧信息 → 替换写入，version: v+1
   - 内容无变化 → 不写入，避免无意义版本递增

### 搜索知识 (opc_knowledge_search)
Agent 需要更多上下文时：

1. 按关键词全文搜索所有知识内容
2. 返回匹配的 unit/section/subsection + snippet + 相似度得分
3. Agent 根据结果决定是否加载更多知识

### 列出知识 (opc_knowledge_list)
三种查询模式：
- 只传 unit → 列出所有 section
- 传 unit + section → 列出所有 subsection
- 传 unit + subsection → 跨 section 聚合

## 知识版本

写入即生效，每次写入自动递增 version。git 历史可追溯所有变更。
后续 node 按 `min_version` 校验知识版本，不满足则阻止执行。
version=0 表示被回退标记的过期知识，需重新验证。
```

### phase-execution

```markdown
---
name: phase-execution
description: 指导阶段内节点选择、反思、执行、推进的完整流程
used_by: [phase-validator, node-resolver, orchestrator]
---

## 阶段生命周期

opc_phase_start → 扫描节点 → 匹配排序 → 反思调整 → opc_phase_confirm
    → 逐 node 执行 → opc_phase_complete → 推进/确认

## 1. opc_phase_start — 扫描与匹配

### 扫描节点来源
1. 扫描 `platform/opc-orchestrator/pipeline/` + `phases/<current_phase>/nodes/`
2. 扫描项目 `opc-nodes/` 对应目录 → 同名覆盖内置任务节点
3. 按 phase 字段过滤 → 只保留当前阶段的节点

### 节点匹配
1. **tag 交集过滤**：任务 tags ∩ 节点 tags，交集为 0 的排除
2. **语义匹配排序**：任务 description 与节点 description 做语义相似度
3. **Scenario 加权**：命中 scenario 推荐的节点 +0.3 权重

## 2. 反思调整

轮次由 `phase_review.max_reflection_rounds` 控制（默认 3）：
- **缺漏**：是否有该做但未选中的节点？
- **多余**：是否有不必要或重复的节点？
- **合并/拆分**：相似节点合并？过大节点拆分？
- 达到 max_reflection_rounds 后强制确认

## 3. opc_phase_confirm — 锁定执行计划

node-resolver 接收确认的节点列表：
1. **推导依赖**：匹配 output → input，自动建立 blocked_by
2. **文件域检查**：并行组路径重叠 → 降级为串行
3. **拓扑排序**：生成分组执行计划
4. **写入 state.json**：写入 nodes 数组

## 4. 执行节点

逐组执行，每个 node：
1. opc_node_start → 写入 input，status → in_progress
2. Agent 按 knowledge-operation 节点指令读写知识
3. 执行 node body 指令
4. 成功 → opc_knowledge_write + opc_node_complete
5. 失败 → opc_node_fail → 尝试修复 → retry / abort

## 5. opc_phase_complete — 阶段完成

1. 检查全部 node completed
2. 阶段标记 completed
3. 下一阶段：高置信度自动推进，否则提示确认

## 6. 阶段回退

- 回退点之后的 knowledge version 降为 0
- 回退点之后的 node 状态重置为 pending
```
