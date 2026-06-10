# 03 — 4 类失败模式的诊断与缓解

> 本章展开 `00_overview.md` §四的失败分类，为每种失败提供诊断信号、
> 严重度评估、路由到具体方法的规则、以及升级路径。

## 一、失败分类总览

| 类 | 名称 | 典型实例 | 诊断信号 | 严重度 | 单管线预期频率 |
|---|---|---|---|---|---|
| A | 分类错误 | chat→task 误判、task→chat 漏判 | intent_evidence 与 user_quotes 矛盾 | 中 | ~5% 用户消息 |
| B | 完整性缺失 | 漏需求、漏依赖、漏 quality_gate | task_analysis 输出字段不完整 | 中-高 | ~15% 首次分析 |
| C | 执行偏差 | evidence 缺失/造假、artifact 不存在 | V1 (L1) 工件缺失、V2-V5 evidence 不通过 | 高（阻塞） | ~10% 节点执行 |
| D | 元决策错误 | 选错节点、分解不合理、该回退却前进 | M4 Critique objection 或 V5 分支同质化 | 严重（影响后续全部流程） | ~5% 决策点 |

## 二、A 类：分类错误

### 诊断

| 信号 | 来源 | 检测方式 |
|---|---|---|
| intent_evidence.task_criteria_hits 含弱信号 | opc_flow_step_complete response | V2 判定 criteria 与 user_quotes 不匹配 |
| 用户后续消息显式纠正 | opc_flow_user_reply | 用户说 "这不是任务" / "just answer" |
| P1 reflection objection | opc_reflect_execute({method:"cove"}) | V2 ≥1 objection |

### 路由

```
A 类失败
    ├── 用户显式纠正 → opc_flow_correct({action:"restart", from_step:"task_analysis"})
    │       └── 绕过 reflection
    ├── V2 objection → M4 Critique (secondary)
    │       ├── critic 确认分类错误 → ask_user
    │       └── critic 认为分类正确 → 降级到 record correction + 继续
    └── V2 severe → ask_user (不再浪费 token 跑 secondary)
```

### 缓解

- P1 支持 inline-mode 快速确认（3 步代替 6 步）
- `@corrections` 按 `step=P1 + keywords + user_text` 记录误判案例
- 历史同类型误判 ≥ 3 条 → M2 Reflexion 注入优先

## 三、B 类：完整性缺失

### 诊断

| 信号 | 来源 | 检测方式 |
|---|---|---|
| task_analysis 输出字段不完整 | opc_flow_step_complete({step:"task_analysis"}) | M3 CoVe 逐字段检查 |
| brief 字段与 task_analysis 不对齐 | opc_flow_step_complete({step:"brief_generation"}) | M3 CoVe 交叉验证 |
| 用户追加输入 "还要加 X" | opc_flow_user_reply | `opc_flow_correct({action:"restart", additional_input:"X"})` |

### 路由

```
B 类失败
    ├── 用户追加输入 → opc_flow_correct({action:"restart"}) + 注入 additional_input
    │       └── 绕过 reflection
    ├── M3 CoVe objection → M2 Reflexion (secondary)
    │       ├── 命中历史教训 → 注入教训 + 重分析
    │       └── 无历史 → M4 Critique 二次检查 → ask_user
    └── 完整性缺失严重（错过核心需求）→ 直接 ask_user
```

### 缓解

- M2 Reflexion 教训库按 step + domain 索引
- Brief 生成时强制对照 task_analysis 输出字段表
- `opc_flow_correct({action:"restart"})` 支持 `additional_input` 增量补充

## 四、C 类：执行偏差

### 诊断

| 信号 | 来源 | 检测方式 |
|---|---|---|
| L1 工件缺失 | opc_node_finish | V1 (Declared `output.knowledge` vs 实际文件) |
| L2 quality_gate 未通过 | opc_node_finish | `evidence.test_results.failed > 0` |
| evidence 字段缺失或作假 | opc_node_finish | V2-V5 按 node_type 对应 validator |
| evidence 不可复现 | opc_node_finish | V5 (可复现性检查) |

### 路由

```
C 类失败
    ├── L1 工件缺失 → 直接 failed (不跑 reflection，node 未完成)
    │       └── opc_node_finish({status:"failed"})
    ├── L2 quality_gate 未通过 → failed + ask_user
    │       └── opc_node_finish({status:"failed"})
    ├── V2-V5 objection → M4 Critique (secondary)
    │       ├── critic 确认偏差 → ask_user + record correction
    │       └── critic 认为 evidence 可接受 → 降级为 warning + 继续
    └── 偏差严重 (evidence 造假) → 直接 failed + 强制 phase_reset
```

### 缓解

- V1–V5 是 TS 确定性校验，不是 LLM 判断
- evidence 写入 flow-state.json，可审计
- L1 失败有 `required_action` 提示（"请确认节点输出文件已写入"）

## 五、D 类：元决策错误

### 诊断

| 信号 | 来源 | 检测方式 |
|---|---|---|
| 节点选择组合不合理 | opc_phase_confirm | M4 Critique objection (P5) |
| 分解方案最优解未选 | opc_flow_step_complete({step:"task_decomposition"}) | M6 ToT 多个方案中 best_score < 3 |
| 该回退却推进 | auto_advance | M4 Critique objection (P8) |
| 分支同质化 | M6 ToT | V5 判定所有分支相似度过高 |

### 路由

```
D 类失败
    ├── 节点选择错误 →
    │       M4 Critique objection → M5 Debate (complexity ≥ medium)
    │           ├── debate 建议重新选择 → opc_flow_correct({action:"phase_reset"})
    │           └── debate 认为选择可接受 → record correction + warning
    ├── 分解不合理 →
    │       M6 ToT + M5 Debate → ask_user 选择方案
    │       或 opc_flow_correct({action:"restart", from_step:"task_decomposition"})
    ├── 该回退却推进 →
    │       M5 Debate (pro advance / con reset) → phase_reset
    └── 不确定 → ask_user
```

### 缓解

- 高风险决策 (complexity ≥ high) 强制 M5 Debate
- 回退决策 (L1/L2/L3 层级) 有明确的分层回退规则
- `opc_flow_correct({action:"phase_reset"})` 支持 L0-L3 分层回退

## 六、严重度判定规则

| 严重度 | 定义 | 对反思的影响 | 升级路径 |
|---|---|---|---|
| `info` | 轻微偏离，不影响后续 | 记录 correction，不阻塞 | 无 |
| `warning` | 有可能影响后续，但可继续 | 记录 correction + 注入 M2 Reflexion | 累计 3 条 warning → 升级为 objection |
| `critical` | 阻断性错误，不可继续 | 停止当前步骤，强制 ask_user | ask_user → 用户决定 abort / restart / revise |
| `severe` | validator 直接拒收，无法判定 | 跳过 secondary，直接 ask_user | ask_user |

## 七、失败统计与趋势

`opc_reflect_admin({action:"query_stats"})` 返回每种失败类的发生频率：

```json
{
  "failure_stats": {
    "A_classification": { "count": 3, "last_24h": 1, "trend": "stable" },
    "B_completeness": { "count": 12, "last_24h": 4, "trend": "rising" },
    "C_execution": { "count": 8, "last_24h": 2, "trend": "falling" },
    "D_meta_decision": { "count": 2, "last_24h": 0, "trend": "stable" }
  }
}
```

趋势指标用于触发 method 健康度检查和 unlearn 决策。

## 八、相关文档

- [01 方法目录](./01_method-catalog.md) — 每种方法的失败模式
- [02 决策矩阵](./02_step-method-mapping.md) — Step → 方法路由
- [04 组合规则](./04_composition-rules.md) — 禁用/降级/unlearn
- [父文档](./00_overview.md) — 方法学总览
