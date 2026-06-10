# 02 — 用户自治（intensity / skip / on_demand）

> 本章定义用户对反思强度的三级控制、单步跳过、事后反思的完整 API、
> 配置持久化、以及与 method 健康度建议的交互。

## 一、设计原则

反思在 OPC 中默认开启，但最终控制权在用户。三条原则：

1. **默认安全**：不配置任何参数时，intensity=medium，覆盖大多数场景
2. **可降级不可强升**：server 可建议提升 intensity，但不可强行设置高于用户配置的级别
3. **可事后补救**：即使某 step 跳过了反思，用户仍可事后触发 on_demand

## 二、Intensity（反思强度）

### 2.1 四级定义

| 级别 | Primary | Secondary | 覆盖范围 |
|---|---|---|---|
| `high` | 所有 8 step | 所有 8 step（含 P6/P7）| 最严格，token 消耗最高 |
| `medium`（默认）| 所有 8 step | P3/P5/P8（高价值决策点）| 平衡覆盖与成本 |
| `low` | P3/P5 only | 无 | 仅在最高风险步骤反思 |
| `off` | 无 | 无 | 全部跳过，仅 validator-only |

### 2.2 配置方式

**持久化设置**（`.opc/config.json`）：

```json
{
  "reflection": {
    "intensity": "medium"
  }
}
```

**会话级覆盖**（slash command）：

```
/opc reflect intensity high    # 当前 session 启用高强度
/opc reflect intensity low     # 当前 session 降为低强度
/opc reflect intensity off     # 当前 session 关闭反思
/opc reflect intensity medium  # 恢复默认
```

会话级覆盖不写入 `.opc/config.json`，session 结束后恢复持久化设置。

### 2.3 生效时机

```
opc_reflect_plan 被调用时：
    │
    ├── ① 查会话级覆盖（优先级最高）
    ├── ② 查 .opc/config.json（持久化设置）
    ├── ③ 若均未配置 → 使用默认值 medium
    └── ④ 按 intensity 级别裁剪 method 候选池
```

### 2.4 各 intensity 下的 Step-Method 映射

| Step | high | medium | low | off |
|---|---|---|---|---|
| P1 意图 | M3 CoVe + M4 Critique | M3 CoVe | — | — |
| P2 任务分析 | M3 CoVe + M2 Reflexion | M3 CoVe | — | — |
| P3 分解 | M6 ToT + M5 Debate | M6 ToT + M5 Debate | M6 ToT | — |
| P4 Brief | M3 CoVe + M4 Critique | M3 CoVe | — | — |
| P5 节点选择 | M4 Critique + M5 Debate | M4 Critique + M5 Debate | M4 Critique | — |
| P6 节点执行 | M4 Critique | V1-V5 | — | — |
| P7 阶段完成 | M3 CoVe | V1-V5 | — | — |
| P8 阶段推进 | M4 Critique + M5 Debate | M4 Critique + M5 Debate | — | — |

### 2.5 Intensity 与 complexity 的交互

`complexity=simple` 的 pipeline 在 intensity=medium 下 P3 仍跑 M6 ToT（因 P3 是核心决策点），
但 token 预算按 `complexity_factor=0.5` 缩减。详见 [04_composition-rules.md](../01-method-theory/04_composition-rules.md)。

## 三、Skip（单步跳过）

### 3.1 API

```
opc_flow_skip_reflection({step: "P4", reason: "brief 是纯格式输出，不需要反思"})
```

### 3.2 行为

- 当前 step 的 reflection 跳过，直接走 validator-only
- skip 只影响当前 pipeline 的当前 step，不持久化
- skip 记录写入 `reflection_log[]`，标记 `skipped: true` + `skip_reason`
- 若 step 已被 skip 但 validator 判定 objection，仍会 ask_user（不静默放行）

### 3.3 不可跳过的步骤

| Step | 原因 |
|---|---|
| P6 节点执行 | L1 工件存在性检查是硬约束，不可跳过 |
| P7 阶段完成 | quality_gate 是硬约束，不可跳过 |

即使 intensity=off，P6/P7 的 V1-V5 校验仍然执行（确定性 TS，无 token 成本）。

## 四、On-Demand（事后反思）

### 4.1 API

```
opc_reflect_admin({
  action: "on_demand",
  target: {
    pipeline_id: "pl-xxx",
    step: "P3",
    round: 1    // 可选，不传则对最新一轮
  },
  method: "M5-debate"  // 可选，不传则按决策矩阵自动选择
})
```

### 4.2 行为

- 对已完成的 pipeline 中某 step 重新执行反思
- 新的反思结果追加到 `reflection_log[]`（不覆盖原记录）
- 产生新的 corrections（如发现新问题）
- 不影响已完成 pipeline 的状态（事后反思不触发 phase_reset）

### 4.3 典型场景

| 场景 | 示例 |
|---|---|
| 复盘 | pipeline 完成后回头检查 P3 分解是否合理 |
| 教训提取 | 发现某个 bug 后，反思当时 P6 的 evidence 是否充分 |
| 方法对比 | 用不同 method 反思同一步，比较 objection 质量 |
| 训练 seed | 维护者用 on_demand 批量检查历史 pipeline，提炼通用教训 |

## 五、Server 建议 vs 用户决策

### 5.1 Server 建议

`opc_reflect_plan` 可在返回中携带 `intensity_suggestion`：

```json
{
  "method": "M3-cove",
  "intensity_suggestion": {
    "recommended": "low",
    "reason": "近 24h P1 步 FP 率 0.45（> 0.3 阈值），反思收益低",
    "current": "medium",
    "auto_applied": false
  }
}
```

### 5.2 自动降级（需用户 opt-in）

用户可在 `.opc/config.json` 中授权自动降级：

```json
{
  "reflection": {
    "intensity": "medium",
    "auto_degrade": {
      "enabled": true,
      "min_intensity": "low",
      "fp_threshold": 0.4
    }
  }
}
```

启用后，当某 method 的 FP 率超过 `fp_threshold` 且当前 intensity ≥ `min_intensity` 时，
server 自动降级一级（如 medium → low）。

**未启用 auto_degrade 时**：server 只发建议，不自动降级。

### 5.3 用户否决

用户可随时通过 slash command 覆盖 server 建议：

```
/opc reflect intensity high   # 忽略 server 的 low 建议
```

用户显式设置的 intensity 在 session 内不会被 server 自动降级覆盖。

## 六、配置优先级链

```
会话级 slash command  (最高)
    ↓
.opc/config.json 显式设置
    ↓
auto_degrade 自动调整  (需 opt-in)
    ↓
server intensity_suggestion  (仅建议，不强制)
    ↓
默认值 medium  (最低)
```

## 七、Intensity 统计

`opc_reflect_admin({action:"query_stats"})` 返回用户自治相关指标：

```json
{
  "autonomy_stats": {
    "current_intensity": "medium",
    "intensity_changes_24h": 2,
    "skip_count_24h": 1,
    "on_demand_count_24h": 0,
    "auto_degrade_events_24h": 0,
    "server_suggestions_declined_24h": 1
  }
}
```

## 八、相关文档

- [00 反思流程总览](./00_overview.md) — 整体时序与自治在流程中的位置
- [01 Per-Step 时序](./01_per-step-sequence.md) — 各 step 的完整调用链
- [03 介入归档](./03_intervention-archival.md) — 用户介入如何沉淀为纠正
- [05 Phase Reset 交互](./05_phase-reset-interaction.md) — 回退时反思状态处理
- [父文档 二](./00_overview.md#二用户自治intensity--skip--on_demand) — 用户自治总览
