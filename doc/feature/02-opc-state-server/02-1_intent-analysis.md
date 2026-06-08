# 02-1 意图识别与任务分析

不设 `/opc` 入口命令。自然语言就是入口。UserPromptSubmit hook 将 `pipeline/intent-analysis.md` 注入 Claude 上下文，Claude 自行判断意图后按序执行后续分析。

---

## 一、触发机制

opc-orchestrator 插件通过 `UserPromptSubmit` hook 接管用户输入：

```json
// opc-orchestrator/.claude-plugin/plugin.json
{
  "name": "opc-orchestrator",
  "depends": ["mcp"],
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [{
          "type": "command",
          "command": "cat ${CLAUDE_PLUGIN_ROOT}/pipeline/intent-analysis.md"
        }]
      }
    ]
  }
}
```

每次用户发消息时，hook 自动将 `pipeline/intent-analysis.md` 注入 Claude 的上下文。Claude 读取后按指令执行意图识别。

---

## 二、Pipeline 文档链（Claude 的操作手册）

```
platform/opc-orchestrator/pipeline/
├── intent-analysis.md        ← 步骤①：UserPromptSubmit hook 自动注入
├── task-analysis.md          ← 步骤②：Claude 判断 intent=task 后主动读取
├── task-decomposition.md     ← 步骤②b：修改 unit ≥ 2 时读取
├── brief-generation.md       ← 步骤③：生成工作单内容
├── knowledge-operation.md    ← 步骤④：知识初始化
└── phase-execution.md        ← 步骤⑤：进入阶段执行循环
```

每篇文档是一个自包含的 prompt 模板，告诉 Claude：
- 前置条件（什么时候读这篇）
- 当前任务（做什么判断/分析）
- 输出格式（结构化 JSON，后续用于 MCP 工具参数）
- 下一步（读哪篇文档或调哪个 MCP 工具）

---

## 三、步骤①：意图识别（Claude 读 intent-analysis.md）

Claude 自行判断用户输入的意图。四种意图：

| 意图 | 说明 | 行为 |
|------|------|------|
| `task` | 用户想完成具体的开发任务 | 继续步骤② |
| `project_question` | 针对当前项目提问 | 调用 `opc_knowledge_search`，注入上下文回答，不创建管线 |
| `general_question` | 与项目无关的纯知识问答 | 零 OPC 介入，Claude 直接回答 |
| `chat` | 闲聊 / 无技术内容 | 零 OPC 介入 |

### 3.1 task 信号

| 信号 | 加权 |
|------|------|
| 包含动作动词（实现、修复、部署、重构） | +0.3 |
| 包含明确交付物（系统、功能、页面） | +0.2 |
| `!task` / `?` 显式前缀 | +1.0（直接确定） |
| 疑问词（怎么样、为什么、如何） | -0.3 |
| 简短无动词（"这个"、"帮忙"） | -0.2 |

### 3.2 project_question vs general_question

| 信号 | 偏向 |
|------|------|
| 提及项目中的具体文件、函数、模块名 | project_question |
| 使用"我们"、"这里的"、"这个项目"等指代词 | project_question |
| 引用 opc-knowledge/ 中的概念 | project_question |
| 通用技术概念，无项目指代 | general_question |
| 纯定义/解释类问题 | general_question |

---

## 四、置信度与纠错

### 4.1 置信度阈值

| 置信度 | 行为 |
|--------|------|
| > 0.8 | 直接判定，不追问 |
| 0.5 - 0.8 | 主动确认 |
| < 0.5 | 按最高分意图执行，但不启动管线 |

```
用户: 这个函数的性能怎么样
Claude: task(0.45) / question(0.55)  → 追问: "需要我启动性能优化流程，还是先帮你分析？"
用户: 先分析一下               → 识别为问答，不启动管线
```

### 4.2 纠错指令

| 纠错指令 | 效果 |
|----------|------|
| "不用启动管线" / "just answer" | 取消管线，作为普通问答处理 |
| "先不做了" / "cancel" | 取消管线，标记为 aborted |
| "这不是任务" / "not a task" | 取消并学习：标记为问答样本 |

### 4.3 显式声明

| 前缀 | 效果 |
|------|------|
| `!task <描述>` | 强制作为任务执行 |
| `? <问题>` | 强制作为问答处理 |

---

## 五、步骤②：任务分析（Claude 读 task-analysis.md）

仅 intent = task 时触发。Claude 主动读取 `pipeline/task-analysis.md`，按其中的 prompt 模板执行分析。

**Claude 首先调用:** `opc_knowledge_list` → 获取已有 unit 列表及结构

**然后 Claude 分析，输出结构化 JSON:**

`{ description, tags, complexity, suggested_phases, knowledge_unit, scenario, knowledge_plan }`

### 5.1 分析步骤（Claude 执行）

**① 提炼描述** — 将用户原始输入提炼为一句精确的任务描述。补全隐含信息，去掉无关修饰。

**② 打标签** — 从以下标签池中选择 2-4 个：

| 类别 | 可用标签 |
|------|---------|
| 技术栈 | backend, frontend, fullstack, mobile, desktop, infra |
| 领域 | auth, database, api, ui, payment, storage, security, messaging |
| 操作 | add-feature, fix-bug, refactor, optimize, migrate, configure |

**③ 判复杂度** — 两问法：

```
需要设计规划吗？
  → 不需要 → low
  → 需要 → 能一轮解决且不复杂吗？
    → 能 → medium
    → 不能 → high
```

| 复杂度 | 判定标准 | 典型场景 |
|--------|---------|---------|
| **low** | 不需要规划，简单修改即可完成 | 修样式、改文案、加日志、调配置 |
| **medium** | 需要规划，但一轮即可完成 | 新增功能、接入第三方服务 |
| **high** | 需要规划，且需多轮推进或复杂度高 | 重构核心模块、迁移数据库、改 API 协议 |

**④ 推荐阶段** — 根据任务性质选择必经阶段：

| 任务性质 | 推荐阶段 |
|---------|---------|
| 新功能 / Bug修复 / 重构 | 04-implement-design → 05-implement → 06-testing |
| 安全审计 | 06-testing（仅安全扫描节点） |
| 新项目 | 00-ideation → 03-design → 04-implement-design → 05-implement → 06-testing |

**⑤ 提取知识点** — 从任务描述中识别领域概念，输出为 unit 名称：

```
"实现用户认证系统"                           → ["user-auth"]
"实现支付和订阅功能"                         → ["payment", "subscription"]
"修复角色权限检查"                           → ["authorization"]
```

**⑥ 匹配 Scenario** — Claude 扫描 `scenarios/` 目录，选择最匹配的 1-2 个：

`add-feature` / `fix-bug` / `redesign-product` / `performance-optimize` / `security-audit` / `launch-product` / `incident-response`

**⑦ 生成知识操作计划** — 逐条知识路径标注操作类型（read / update / create）和当前状态。

### 5.2 complexity 分叉

| 维度 | low | medium | high |
|------|-----|--------|------|
| 执行路径 | 快速通道：无管线/无 phases/无 state | 完整管线 | 完整管线 |
| 反思轮次 | — | 2-3 | 3-5 |
| 阶段推进 | — | 高置信度自动 | 每阶段需确认 |
| brief | 不生成 | 标准版 | 详细版 |
| 节点选择 | — | 标准 tag+语义筛选 | 不可跳过匹配节点 |
| 知识读取 | Agent 自行决定 | 按 node input 加载 | 额外展开 _refs 关联 unit |
| 知识写入 | 通常不写 | 正常写入 | 更严格审查 |

---

## 六、步骤②b：任务拆分（Claude 读 task-decomposition.md）

### 6.1 触发条件

当 task-analysis 输出中需要**修改**的 unit 数量 ≥ 2 时，Claude 读取 `pipeline/task-decomposition.md` 执行拆分分析。只读 unit 不计入拆分判断。

```
修改数 = 1：跳过拆分
  → 例："给用户认证加个短信验证" → user-auth(update) + notification(read)
  → notification 只读 → 单管线

修改数 ≥ 2：执行拆分分析
  → 修改的 unit 之间互相 _refs → 合并为一条子管线
  → 修改的 unit 之间独立 → 拆分
  → 例："实现用户认证 + 消息通知" → user-auth(create) + notification(create)
  → 两者无 _refs → 两条子管线
```

### 6.2 拆分原则

**按领域边界拆分** — 每个 knowledge_unit 对应一个领域，一条子管线负责 1-2 个紧密耦合的 unit：

```
knowledge_unit: [product, cart, order, payment, user-center]
                    ↓
子管线-1: product          (商品管理)
子管线-2: user-center      (用户中心)
子管线-3: cart             (购物车，依赖 product + user-center)
子管线-4: order + payment  (下单支付，依赖 cart + user-center)
```

**独立可并行的拆开** — 两个 unit 之间没有 `_refs` → 拆成独立子管线，可并行执行。

**紧密耦合的合并** — 两个 unit 之间有强 `_refs` 引用 → 合并到同一子管线。

**依赖推导**（管线级 output → input）— 通过 `_refs` 关系自动推导 blocked_by：

```
cart._refs → [product, user-center]
  → cart 子管线 blocked_by: [product 子管线, user-center 子管线]

order._refs → [cart, user-center]
  → order+payment 子管线 blocked_by: [cart 子管线, user-center 子管线]
```

### 6.3 输出格式（Claude 生成）

```json
{
  "sub_pipelines": [
    { "id": "sub-1", "title": "商品管理", "knowledge_unit": ["product"],
      "blocked_by": [] },
    { "id": "sub-2", "title": "用户中心", "knowledge_unit": ["user-center"],
      "blocked_by": [] },
    { "id": "sub-3", "title": "购物车", "knowledge_unit": ["cart"],
      "blocked_by": ["sub-1", "sub-2"] },
    { "id": "sub-4", "title": "下单与支付", "knowledge_unit": ["order", "payment"],
      "blocked_by": ["sub-3", "sub-2"] }
  ]
}
```

拆分方案展示给用户确认后，进入下一步。

---

## 七、步骤③：工作单生成（Claude 读 brief-generation.md）

仅 medium / high 时生成。Claude 读取 `pipeline/brief-generation.md`，按模板生成 brief 内容。

### 7.1 模板

```markdown
# 任务工作单

## 问题描述
[用户原始需求的一句话概括]

## 基本信息
| 属性 | 值 |
|------|-----|
| 管线 ID | pipeline-xxx |
| 复杂度 | medium / high |
| 涉及阶段 | 04-implement-design → 05-implement → 06-testing |
| 关联 Scenario | add-feature |

## 范围
### 包含
- [具体要做的内容]

### 不包含
- [明确不做的事情]

## 约束
[用户显式约束，无约束则写"无特殊约束"]

## 阶段计划
| 阶段 | 目标 | 关键节点 |
|------|------|---------|
| 04-implement-design | 实现设计 | api-design, database-schema |
| 05-implement | 编码实现 | tdd-implementation |
| 06-testing | 验证测试 | integration-test |

## 关联知识
| 知识路径 | 操作 | 当前状态 | 说明 |
|---------|------|---------|------|
| user-auth/login/api | update | v2 | 需补充新接口 |
| payment/ | create | — | 全新 domain |

## 准入检查
- [ ] 知识库 opc_knowledge_list 已执行
- [ ] 知识库 opc_knowledge_open 已执行
- [ ] 目标 unit 已创建
- [ ] 用户约束已确认
```

### 7.2 生成规则

- **问题描述**：从 task_analysis_result.description 取，一句话，不扩展
- **范围**：根据 tags 和 description 推导 in-scope；out-of-scope 宁可多列不遗漏
- **约束**：仅写入用户显式提出的约束，不臆造
- **阶段计划**：从 suggested_phases 按顺序列出
- **关联知识**：逐条列 knowledge_unit → 折叠为已有 subsection 路径，标注操作类型和当前状态
- **准入检查**：固定 4 条基础检查项
- **写入后不修改**：brief.md 生成后不随管线执行自动修改

---

## 八、步骤④：管线创建（opc_pipeline_create）

Claude 完成上述所有分析后，调用一个 MCP 工具将结果持久化：

```
opc_pipeline_create({
  description: "实现用户认证系统（邮箱注册登录 + 会话管理）",
  tags: ["backend", "auth", "database"],
  complexity: "medium",
  knowledge_unit: ["user-auth"],
  suggested_phases: ["04-implement-design", "05-implement", "06-testing"],
  scenario: "add-feature",
  brief_content: "# 任务工作单\n\n...(Claude 生成)",
  sub_pipelines: [{
    id: "sub-1",
    title: "用户认证系统",
    knowledge_unit: ["user-auth"],
    blocked_by: []
  }],
  execution_order: [{ group: 1, parallel: ["sub-1"] }]
})
```

state-server 做的事（纯确定性）：
- 生成 pipeline ID，创建 `.opc/pipelines/<id>/` 目录结构
- 写入 `pipeline-plan.json`
- 写入 `brief.md`（内容由 Claude 提供）
- 写入 `state.json`（初始空 phases）
- 返回 `{ pipeline_id: "pipeline-xxx" }`

---

## 九、完整分析流程

```
用户: "实现用户认证系统"
  │
  ▼ UserPromptSubmit hook 触发
[注入 pipeline/intent-analysis.md]
  │
  ▼ Claude 判断
intent = task
  │
  ▼ Claude 主动读取 pipeline/task-analysis.md
  ├── 调用 opc_knowledge_list → units: []
  └── Claude 分析 → medium, [user-auth], add-feature
  │
  ▼ 修改 unit 数 = 1，跳过 task-decomposition.md
  │
  ▼ Claude 读 pipeline/brief-generation.md → 生成 brief 内容
  │
  ▼ Claude 调 opc_pipeline_create({...完整参数...})
  → state-server 写入文件，返回 pipeline_id
  │
  ▼ Claude 读 pipeline/phase-execution.md → 进入阶段执行循环
```

---

## 十、精确命令

| 命令 | 用途 |
|------|------|
| `/opc-status` | 查看管线进度 + 下一步建议 |
| `/opc-phase` | 手动跳转/重试某个阶段 |
| `/opc-nodes` | 查看当前阶段的节点选项 |

---

## 十一、相关文档

- [02-2 管线](02-2_pipeline.md) — 管线创建与生命周期
- [02-3 阶段](02-3_phase.md) — 阶段执行与节点选择
- [03-1 知识模型](03-1_knowledge-model.md) — 知识结构与存储
