# 工作单生成

> 本文档是 [意图分析总览](../01_intent-analysis-overview.md) 的子文档。其他子文档：
> [Hook 与混合架构](01_hook-architecture.md) · [流程工具 · 入口与生命周期](02_flow-tools-entry-lifecycle.md) · [流程工具 · 步骤路由](03_flow-tools-step-routing.md) · [流程工具 · 修订与重启](04_flow-tools-revise-restart.md) · [意图识别](05_intent-recognition.md) · [任务分析](06_task-analysis.md) · [任务拆分](07_task-decomposition.md) · [管线创建与阶段执行](09_pipeline-creation.md) · [flow-state schema](10_flow-state-schema.md) · [完整流程示例](11_complete-example.md)

---

## 八、工作单生成（方法论：prompts/brief-generation.md）

仅 medium / high 时生成。opc_intent_complete/opc_task_analysis_complete 路由到 brief_generation 时返回模板指令：

```json
{
  "step": "brief_generation",
  "step_instruction": "按 brief-generation.md 模板生成 brief markdown，提交给 opc_brief_complete。",
  "methodology": {
    "docs": ["prompts/brief-generation.md"],
    "ref": "§8.1 模板 + §8.2 生成规则",
    "summary": "8 个固定段落：描述/基本信息/范围/约束/阶段计划/关联知识/准入检查"
  },
  "schema": { "brief_content": "string (markdown)" },
  "next": {"tool": "opc_brief_complete"}
}
```

### 8.1 模板

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

### 8.2 生成规则

- **问题描述**：从 task_analysis_result.description 取，一句话，不扩展
- **范围**：根据 tags 和 description 推导 in-scope；out-of-scope 宁可多列不遗漏
- **约束**：仅写入用户显式提出的约束，不臆造
- **阶段计划**：从 suggested_phases 按顺序列出
- **关联知识**：逐条列 knowledge_unit → 折叠为已有 subsection 路径，标注操作类型和当前状态
- **准入检查**：固定 4 条基础检查项
- **写入后不修改**：brief.md 生成后不随管线执行自动修改

---

