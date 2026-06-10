# 01 — 5 种纳入方法的完整定义

> 本章为 `00_overview.md` 标准库（M2–M6）的展开定义。每种方法包含：
> 学术来源、核心机制、输入/输出 contract、适用场景、已知失败模式、
> 与 OPC 具体实现的对应关系。

## M2 Reflexion — 教训注入

**学术来源**：Shinn et al. (2023), "Reflexion: Language Agents with Verbal Reinforcement Learning"

**核心机制**：任务失败后，LLM 生成一段自然语言「教训记忆」(reflexion text)，
存入外部记忆库。下次执行同类任务时，将历史教训注入 prompt 前缀，
使模型在行动前先回顾过往失败。

**在 OPC 中的实现**：

| 环节 | OPC 对应 |
|---|---|
| 失败信号 | V1–V5 validator `verdict: objection` + user intervention (L1/L2) |
| 教训存储 | `opc_corrections({action:"record"})` → L2 project store (`.opc/corrections/`) |
| 教训检索 | `opc_corrections({action:"query"})` by step + keywords，按 hotness 排序 |
| 教训注入 | `opc_reflect_plan` → `enhanced_prompt` 中拼入 top-K 历史教训 |
| 教训晋升 | Distiller agent (M21.d) 定期将 L1 干预汇总到 L2，高泛化教训 → L3 |

**Input contract**（sub-agent 看到的 prompt）：

```
你是 Reflexion critic。请阅读以下节点执行结果，并结合历史教训逐条检查。

历史教训（来自 opc_corrections）：
{top-K lessons, each with: step, keywords, lesson_text, severity}

当前节点：
{node_type, phase, evidence}

请输出：
1. 历史教训中哪些与当前输出相关？
2. 当前输出是否重蹈了某条教训的覆辙？
3. 如有，建议如何修正？
```

**Output contract**（sub-agent 必须返回的 JSON）：

```json
{
  "relevant_lessons": ["<lesson_id>..."],
  "violations": [
    {
      "lesson_id": "<id>",
      "violation_detail": "<具体重复了什么>",
      "severity": "info | warning | critical"
    }
  ],
  "suggestion": "<修正建议> | null"
}
```

**适用场景**：同一节点类型被多次执行且历史有用户干预记录。

**不适用场景**：首次执行（无历史教训）、greenfield 项目（corrections 冷启动）。

**已知失败模式**：

| 模式 | 症状 | 缓解 |
|---|---|---|
| 过度泛化 | 教训 A 被错误应用到不相关的节点 B | keyword 匹配 + similarity threshold |
| 教训膨胀 | 存了 500 条教训，注入 prompt 超 token 预算 | top-K 截断 (K=5)，TTL 自动过期 |
| 错误教训传播 | 一次错误干预被记录为教训，持续污染后续 | hotness 衰减 + unlearn_method |

## M3 CoVe — 逐条验证

**学术来源**：Dhuliawala et al. (2023), "Chain-of-Verification Reduces Hallucination in Large Language Models"

**核心机制**：(1) 将原始输出的核心断言拆解为独立可验证的命题；
(2) 对每条命题生成一个验证问题；(3) 独立回答每个验证问题；
(4) 将验证结果与原始断言比对，修正不一致之处。

**在 OPC 中的实现**：

| 环节 | OPC 对应 |
|---|---|
| 断言拆解 | `opc_reflect_plan` → sub-agent (CoVe verifier) 收到原始输出 + 拆解指令 |
| 验证问题生成 | sub-agent 为每条断言生成验证问题，写入 `verification_questions[]` |
| 独立验证 | sub-agent 逐条回答验证问题（不可回看原始输出） |
| 比对修正 | sub-agent 输出 `revised_output` + `changes[]` |
| 校验 | TS CoVe Validator (V2) 检查：`verification_questions` 非空、每条 `answered`、`revised_output` 与原始 `baseline` 的 diff 对应 `changes` 条目 |

**Input contract**：

```
你是 CoVe verifier。请对以下输出执行 Chain-of-Verification：

原始输出：
{artifact.payload}

步骤：
1. 列出该输出包含的所有核心断言（factual claims / design decisions / assumptions）
2. 为每条断言生成 1-2 个验证问题
3. 独立回答每个验证问题（不要回看原始输出）
4. 比对：验证答案与原始断言是否一致？标记不一致之处
5. 若有不一致，生成 revised_output
```

**Output contract**：

```json
{
  "baseline": "<原始输出文本>",
  "claims": [
    {
      "id": "C1",
      "claim_text": "<断言原文>",
      "verification_questions": ["<Q1>", "<Q2>"],
      "verification_answers": ["<A1>", "<A2>"],
      "consistent": true,
      "discrepancy": null
    }
  ],
  "revised_output": "<修正后输出> | null",
  "changes": ["<修改描述>"] | []
}
```

**适用场景**：所有 factuality-critical 步骤（P1/P2/P4/P7）。

**不适用场景**：开放式创意生成（如 brainstorming）、纯偏好选择。

**已知失败模式**：

| 模式 | 症状 | 缓解 |
|---|---|---|
| 验证问题太弱 | "这个设计好吗？" → "好" | prompt 要求 concrete/verifiable 问题 |
| 验证回看 | sub-agent 在回答验证问题时偷偷引用原始输出 | 分两阶段调用（拆解→独立验证），中间清上下文 |
| 假一致 | 明明不一致却说 consistent: true | M4 Critique 二次检查 |

## M4 Critique — 独立质疑

**学术来源**：Self-Critique / Bai et al. (2022), "Training a Helpful and Harmless Assistant with Reinforcement Learning from Human Feedback" (RLAIF Critique)

**核心机制**：用一个独立的 critic agent（不同于产生输出的 agent）审查输出，
列出反对意见、潜在风险、遗漏点。critic 与 producer 的角色分离是核心。

**在 OPC 中的实现**：

| 环节 | OPC 对应 |
|---|---|
| Critic agent | `critic` sub-agent（来自 QA kit，只读权限） |
| 审查对象 | 节点产出 artifact / 节点选择方案 / 阶段推进决策 |
| 输出 | `objections[]` + `severity` + `suggestion` |
| 校验 | TS Critique Validator (V3) 检查：`objections` 非空、每条有 `reasoning`、`severity` 合法 |

**Input contract**：

```
你是独立 critic。请审查以下输出并列出所有你能找到的问题。

输出：
{artifact.payload}

上下文：
- 阶段：{phase}
- 节点类型：{node_type}
- 复杂度：{complexity}

请从以下维度审查：
1. 正确性 — 是否有事实错误？
2. 完整性 — 是否有遗漏？
3. 风险 — 是否有潜在风险未被考虑？
4. 一致性 — 是否与上下游矛盾？
```

**Output contract**：

```json
{
  "objections": [
    {
      "id": "OBJ1",
      "dimension": "correctness | completeness | risk | consistency",
      "objection": "<具体反对意见>",
      "reasoning": "<为什么这是问题>",
      "severity": "info | warning | critical",
      "suggestion": "<改进建议> | null"
    }
  ]
}
```

**适用场景**：所有决策/选择类步骤（P5/P8）、所有节点执行后 artifact 检查（P6）。

**不适用场景**：纯 factuality 检查（用 M3 CoVe 更精确）。

**已知失败模式**：

| 模式 | 症状 | 缓解 |
|---|---|---|
| 假批评 | "看起来没问题"（无实质 objection） | V3 validator 要求 ≥1 条 objection |
| 假对立 | 为反对而反对，提出无关痛痒的问题 | severity 加权 + M5 Debate 交叉验证 |
| critic 偏见 | critic 系统性偏向/偏反对某类输出 | 健康度统计 + unlearn_method |

## M5 Debate — 多立场辩论

**学术来源**：Du et al. (2023), "Improving Factuality and Reasoning in Language Models through Multi-Agent Debate"

**核心机制**：多个 agent 持不同立场（正方/反方/第三方视角）对同一问题进行
多轮辩论，每轮 agent 阅读对方论证后修正自身立场，最终由 meta-synthesizer 汇总。

**在 OPC 中的实现**：

| 环节 | OPC 对应 |
|---|---|
| 正方 agent | 产生原始输出的 agent（或 `debater` 持正方立场） |
| 反方 agent | `debater` sub-agent（QA kit，只读权限） |
| 第三方 agent | `debater` 第二实例（可选）或 `meta-synthesizer` |
| 辩论轮次 | max 3 rounds（per `max_rounds` 配置） |
| 汇总 | `meta-synthesizer` 读取辩论记录，输出 `debate_synthesis` |
| 校验 | TS Debate Validator (V4) 检查：≥2 方参与、每轮每方都有输出、synthesis 引用辩论内容 |

**Input contract**（每轮每方）：

```
你是辩论参与方 [{role}]。当前辩论主题：{topic}

对方论证（上一轮）：
{opponent_argument}

请你：
1. 指出对方论证中的漏洞或遗漏
2. 修正自身立场中的不足（承认对方正确的点）
3. 提出新的支持你立场的论据
```

**Output contract**（每方每轮）：

```json
{
  "role": "pro | con | third_party",
  "round": 1,
  "rebuttal": "<反驳>",
  "concession": "<承认对方正确的点> | null",
  "new_argument": "<新论据>"
}
```

**Debate synthesis** (by meta-synthesizer)：

```json
{
  "topic": "<辩论主题>",
  "total_rounds": 3,
  "pro_position": "<正方最终立场>",
  "con_position": "<反方最终立场>",
  "remaining_disagreements": ["<未解决的分歧>"],
  "verdict": "pro | con | compromise | inconclusive",
  "compromise_suggestion": "<折中方案> | null"
}
```

**适用场景**：高风险决策（复杂度 ≥ medium 的 P3/P5/P8）。

**不适用场景**：复杂度 = simple（token 预算浪费）、纯事实核查。

**已知失败模式**：

| 模式 | 症状 | 缓解 |
|---|---|---|
| 假辩论 | 双方快速达成一致，无实质交锋 | V4 validator 检查 `remaining_disagreements` 是否为空 |
| 无限循环 | 3 轮后仍未收敛 | `verdict: inconclusive` → ask_user |
| 一方过强 | 反方/正方论据碾压导致过早收敛 | 第三方 agent 注入新视角 |

## M6 ToT — 思维树搜索

**学术来源**：Yao et al. (2023), "Tree of Thoughts: Deliberate Problem Solving with Large Language Models"

**核心机制**：(1) 将问题分解为多步骤；(2) 每一步生成多个候选分支（BFS/DFS）；
(3) 对每个分支进行估值；(4) 剪枝低分分支，保留高分分支继续探索；
(5) 最终选出最优路径。

**在 OPC 中的实现**：

| 环节 | OPC 对应 |
|---|---|
| 分支生成 | `tot-explorer` sub-agent（QA kit）生成候选分解方案 |
| 分支评估 | `tot-explorer` 对每个方案打分（feasibility / risk / completeness） |
| 剪枝 | 保留 top-3 方案，丢弃低分分支 |
| 深度探索 | 对保留方案展开下一层（最多 3 层） |
| 最终选择 | meta-synthesizer 汇总搜索树，推荐最优方案 |
| 校验 | TS ToT Validator (V5) 检查：≥2 分支、每分支有评估、剪枝有理由 |

**Input contract**：

```
你是 ToT explorer。请对以下问题生成多个候选方案并评估。

问题：{task_description}

步骤：
1. 生成 3-5 个候选方案（每个方案是一组 sub-pipeline 划分方案）
2. 对每个方案从以下维度打分（1-5）：
   - feasibility: 可执行性
   - risk: 低风险（分数越高风险越低）
   - completeness: 覆盖需求的完整度
3. 剪枝：淘汰总分最低的方案，保留 top-3
4. 对保留的 3 个方案展开下一层（细化每个 sub-pipeline 的内容）
5. 最终推荐最优方案
```

**Output contract**：

```json
{
  "search_tree": {
    "depth": 3,
    "root": {
      "branches": [
        {
          "id": "B1",
          "description": "<方案描述>",
          "scores": { "feasibility": 4, "risk": 3, "completeness": 5 },
          "total": 12,
          "pruned": false,
          "children": []
        }
      ]
    }
  },
  "best_path": ["B1", "B1.2", "B1.2.1"],
  "best_description": "<最优方案完整描述>",
  "discarded_rationale": { "<branch_id>": "<剪枝理由>" }
}
```

**适用场景**：规划/分解类步骤（P3 decomposition）。

**不适用场景**：简单任务（分支无意义）、事实核查、执行完成确认。

**已知失败模式**：

| 模式 | 症状 | 缓解 |
|---|---|---|
| 分支同质化 | 3 个方案本质相同 | prompt 要求 explicit diversity check |
| 评分偏差 | 第一个方案总是得分最高 | 随机打乱评估顺序 |
| 深度爆炸 | 3 层 × 3 分支 × 展开 = 超 token 预算 | 深度上限 3 层，分支上限 5 个 |

---

## 方法对比一览

| 维度 | M2 Reflexion | M3 CoVe | M4 Critique | M5 Debate | M6 ToT |
|---|---|---|---|---|---|
| 核心动作 | 检索历史教训 → 对照检查 | 拆断言 → 验证 → 修正 | 独立审查 → 列出反对意见 | 多立场辩论 → 汇总 | 多分支搜索 → 评估 → 剪枝 |
| 参与 agent 数 | 1 | 1（可拆为 2 阶段） | 1（与 producer 不同） | 2-3 | 1（多次调用） |
| Token 消耗 | 低（注入 top-K 条） | 中（拆解 + 逐条验证） | 中（一次审查） | 高（多轮多 agent） | 高（多层多分支） |
| TS Validator | V2 (CoVe) | V2 (CoVe) | V3 (Critique) | V4 (Debate) | V5 (ToT) |
| 适用复杂度 | any | any | ≥ simple | ≥ medium | ≥ medium |
| 最大轮次 | 1 | 2 | 1 | 3 | 3 层 |

---

## 相关文档

- [02 决策矩阵](./02_step-method-mapping.md) — 8 step × 5 method 完整矩阵
- [03 失败模式](./03_failure-modes.md) — 4 类失败的诊断与路由
- [04 组合规则](./04_composition-rules.md) — primary/secondary/禁用/max_rounds
- [父文档](./00_overview.md) — 方法学总览
