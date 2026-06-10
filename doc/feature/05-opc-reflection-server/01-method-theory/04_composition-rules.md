# 04 — Primary / Secondary / 禁用矩阵 + max_rounds 配置

> 本章定义方法组合的编排规则：primary+secondary 双层机制、
> 禁用矩阵、max_rounds 预算、method 健康度驱动的自动 unlearn、
> 以及降级链。

## 一、双层机制

```
run_primary(method, step, artifact)
    │
    ├── validator.verify(primary_output)
    │       │
    │       ├── verdict: clean → done (无 objection)
    │       │
    │       ├── verdict: objection →
    │       │       │
    │       │       ▼
    │       │   run_secondary(secondary_method, step, artifact, primary_output)
    │       │       │
    │       │       ├── verdict: clean → record corrections + done
    │       │       └── verdict: objection → fallback
    │       │
    │       └── verdict: severe → skip secondary → fallback
    │
    └── fallback = validator_only + ask_user
```

**设计理由**：
- Primary 必跑是为了保证基础质量检查全覆盖
- Secondary 仅在 primary 发现问题时才跑，节省 token（实测省 ~40%）
- Severe 直接跳过 secondary，避免在已确认错误的输出上继续浪费 token

## 二、token 预算与 max_rounds

### 2.1 预算模型

每个 reflection point 的 token 预算 = `base_budget × complexity_factor × phase_factor`。

| 参数 | simple | medium | high |
|---|---|---|---|
| `complexity_factor` | 0.5 | 1.0 | 2.0 |
| `phase_factor`（早期 phase 01-03） | 1.0 | 1.0 | 1.0 |
| `phase_factor`（核心 phase 04-06） | 1.0 | 1.5 | 2.0 |
| `phase_factor`（后期 phase 07-09） | 1.0 | 1.0 | 1.0 |

`base_budget` = 8000 token（per single method invocation）。

### 2.2 max_rounds 配置

| Method | 默认 max_rounds | 可配置 | 超限行为 |
|---|---|---|---|
| M2 Reflexion | 1 | 否（单次注入） | N/A |
| M3 CoVe | 2 | 是 `OPC_COVE_MAX_ROUNDS` | `verdict: rounds_exceeded` → fallback |
| M4 Critique | 1 | 否（单次审查） | N/A |
| M5 Debate | 3 | 是 `OPC_DEBATE_MAX_ROUNDS` | `verdict: inconclusive` → ask_user |
| M6 ToT | 3 层 | 是 `OPC_TOT_MAX_DEPTH` | 取当前最优分支 |

### 2.3 预算超限处理

当某 step 累计 token 超过预算时：
1. 停止当前 reflection point 的所有 secondary method
2. 未执行的方法标记为 `skipped: budget_exceeded`
3. 降级到 `validator-only + ask_user`
4. 记录 `opc_corrections({action:"record", ...})` 标记 `budget_exhausted: true`

## 三、禁用矩阵

### 3.1 静态禁用规则

| 条件 | 禁用的 method | 理由 |
|---|---|---|
| `complexity = simple` | M5 Debate, M6 ToT | 太重，token 浪费；简单任务不需要多 agent 辩论或树搜索 |
| `token_budget_exhausted` | 所有 secondary | 预算用尽，只保留 primary |
| `phase ∈ {01, 02, 03}` (早期) | M5 Debate | 早期阶段以确定性检查为主 |
| `step = P6` (节点执行) | M6 ToT | 节点执行是线性流程，不适用树搜索 |
| `node_type = control` | M5 Debate, M6 ToT | 控制类节点输出为 status，不需要搜索 |
| `corrections_hit ≥ 3` 同 step | M2 Reflexion 升级为 primary | 历史教训多 → 教训注入优先于 CoVe/Critique |

### 3.2 动态禁用规则（method 健康度驱动）

```
opc_reflect_plan 启动时：
    ① 查 method_stats (近 100 次调用)
    ② 对每种 method:
        FP_rate = (meta_validator_rejections / total_calls)
        if FP_rate > THRESH_FP (0.3):
            unlearn(method, ttl=UNLEARN_TTL_HOURS)
    ③ 被 unlearn 的 method 从候选池中移除
    ④ primary 被移除 → secondary 升级为 primary
    ⑤ primary + secondary 都被移除 → skip reflection for this step
```

**unlearn 恢复**：
- `UNLEARN_TTL_HOURS`（默认 24h）后自动恢复
- 可通过 `opc_reflect_admin({action:"unlearn_method", method:"<m>", undo:true})` 手动恢复
- 恢复后 `FP_rate` 统计清零

### 3.3 降级链

```
完整 reflection (primary + secondary)
    ↓ primary 失败
完整 reflection (secondary only)
    ↓ secondary 失败 或 budget 耗尽
validator-only (V1-V5 确定性校验)
    ↓ validator 判定 objection
ask_user（用户介入，提供选项）
    ↓ 用户无响应 或 用户选择 skip
skip（标记 skipped_by_user，不阻塞流程）
```

## 四、并发与隔离

### 4.1 方法串行执行

方法始终串行执行：primary → (可选 secondary) → (可选 fallback)。
不做方法并行——因为 secondary 依赖 primary 的结果做决策。

### 4.2 Sub-agent 隔离

每个 method dispatch 到独立的 sub-agent：
- CoVe → `cove-verifier` agent
- Critique → `critic` agent
- Debate → `debater` agent (×2-3 实例)
- ToT → `tot-explorer` agent
- Reflexion(M2) → 不派 sub-agent（直接查 corrections + 拼 prompt）

Sub-agent 之间不共享上下文，各自独立运行。

### 4.3 跨 reflection point 隔离

不同 P 点的 reflection 互不干扰：
- P5 的 critic 看不到 P3 的 ToT 输出
- 每个 P 点独立管理自己的 `max_rounds` 计数器
- token 预算按 P 点独立计算（不跨 P 点累计）

## 五、配置参数速查

| 参数 | 默认值 | 环境变量 | 说明 |
|---|---|---|---|
| `base_budget` | 8000 token | `OPC_REFLECT_TOKEN_BUDGET` | 单方法调用基准预算 |
| `max_rounds_cove` | 2 | `OPC_COVE_MAX_ROUNDS` | CoVe 最大验证轮次 |
| `max_rounds_debate` | 3 | `OPC_DEBATE_MAX_ROUNDS` | Debate 最大辩论轮次 |
| `max_depth_tot` | 3 | `OPC_TOT_MAX_DEPTH` | ToT 搜索最大深度 |
| `THRESH_FP` | 0.3 | — | 方法被自动 unlearn 的 FP 率阈值 |
| `UNLEARN_TTL_HOURS` | 24 | — | 方法被 unlearn 后的自动恢复时间 |
| `MIN_SAMPLES` | 10 | — | 触发健康度评估的最小样本数 |
| `OPC_REFLECTION_MODE` | `full` | `inline` 强制内联 | 全局覆盖反射模式 |

## 六、相关文档

- [01 方法目录](./01_method-catalog.md) — 每种方法的详细定义
- [02 决策矩阵](./02_step-method-mapping.md) — Step → 方法路由
- [03 失败模式](./03_failure-modes.md) — 失败分类与路由
- [父文档](./00_overview.md) — 方法学总览
