# 06 反思调用契约（三层防御）

> 本文档是 [反思流程总览](00_overview.md) 的子文档。
> **核心规则**：reflection-server 工具**禁止返回 `flow_next`**；驱动权归 state-server 独占。Claude 通过"理论文档 + `next_step_hint` + `pending_reflection`"三层防御遵循固定调用顺序。

---

## 一、命名与概念（必读）

本文档是反思登记机制相关命名的**唯一真相源**。所有名称如下，其他文档一律对齐：

| 概念 | 含义 |
|---|---|
| **反思产物（artifact）** | reflection-server 每跑完一轮反思后**自己写盘**得到的 JSON 文件，含 `verdict / kept_objections / reasoning_trace / evidence_diff` 等完整内容 |
| **`reflection_id`** | 一轮反思的唯一标识，人类可读形如 `rfl-P5-r1-<ulid>`。同时是 artifact 文件名的稳定锚 |
| **`artifact_path`** | 反思产物在文件系统的物理路径，形如 `opc-logs/reflection/<session_id>/<reflection_id>.json` |
| **`pending_reflection`** | 已写盘但未在 `flow-state.json.reflection_log[]` 登记的反思记录——由 reflection-server 在 `opc_reflect_*_complete` 返回值中下发，等待 state-server 登记 |
| **`pending_reflections[]`** | `flow-state.json` 中的待登记队列。**hard invariant：任何时刻最多 1 个元素**（详见 三 不变量） |
| **`reflection-registry-guard`**（旧名 ack-guard）| state-server 写类工具的前置校验器——若 `pending_reflections[]` 非空且当前工具不是登记口，则 reject |
| **登记口** | 当前唯一为 `opc_flow_reflect`——拿 `reflection_id` 把 pending 项转入 `reflection_log[]` |

> **旧名 → 新名对照（向后兼容期）**：
> - `ack_token` → `reflection_id`
> - `pending_reflection_ack` → `pending_reflection`
> - `pending_acks[]` → `pending_reflections[]`
> - `ack-guard` → `reflection-registry-guard`
> - `must_be_acked_by` → `must_be_registered_by`
> - `reflect_record`（Claude 整块搬回的对象）→ **删除**，由 `reflection_id` 直接定位 artifact 文件

---

## 二、架构分裂的故意承认（方案 a）

反思日志的物理实体与索引**分裂在两个 server 各自的存储域**，这是有意的架构隔离：

| 谁写 | 写什么 | 写到哪 |
|---|---|---|
| reflection-server | 反思产物全文（artifact） | `opc-logs/reflection/<session_id>/<reflection_id>.json` |
| state-server | 反思登记指针 | `flow-state.json.reflection_log[]`（含 `{reflection_id, artifact_path}`）|

**单一真相源约定**：
- 反思**内容**的真相源 = reflection-server 写的 artifact 文件
- 反思**链路顺序 / 登记完整性**的真相源 = `flow-state.json.reflection_log[]`

`reflection-registry-guard` 是兜底——保证 reflection-server 写了 artifact 但 state-server 没登记时，下一次写类调用会被拦下，强制补登记。**容忍分裂、靠 guard 拉回一致**是这套机制的核心立场。

---

## 三、单驱动者原则

| 权限 | 拥有者 | 说明 |
|---|---|---|
| **`flow_next` 发起权**（指挥下一步） | ✅ state-server 独占 | 整个流程链路里只有 state-server 工具能返回 `flow_next` |
| **被 `flow_next` 指向的能力** | ✅ 任何 server | state-server 的 `flow_next.tool` 可以指向 reflection / knowledge 任意工具 |
| **领域判定权**（meta-validator / 方法选择 / 知识 CRUD） | ✅ 各 server 独占 | reflection-server 独占反思方法；knowledge-server 独占知识 |
| **`next_step_hint` 发起权**（使用说明） | ✅ 任何 server | 非指令性提示，告诉 Claude 这堆数据该交给谁处理 |
| **`pending_reflection` 发起权**（登记契约） | ✅ reflection-server 独占 | 仅 `opc_reflect_*_complete` 发，必须由 `opc_flow_reflect` 登记 |

**类比**：state-server 是导演（唯一能喊"下一个镜头拍 X"），reflection-server 是法律顾问（被叫上场说"这证据不合法"，但不能擅自指挥下一个镜头）。

---

## 四、反思一轮的固定 5 步铁律

```
[1] state-server:      opc_<step>_complete(evidence)
                       ← flow_next: opc_reflect_plan          ← 唯一驱动者发出指令

[2] reflection-server: opc_reflect_plan(step, ctx)
                       ← { method, agent_spec, next_step_hint }   ← 无 flow_next

[3] Claude + Task:     Task(agent_spec) 派 sub-agent
                       ← { objections, reasoning_trace }

[4] reflection-server: opc_reflect_<method>_complete(objections)
                       内部:
                          1. 写盘 opc-logs/reflection/<session>/<reflection_id>.json
                          2. 返回 pending_reflection + next_step_hint
                       ←  {
                            verdict, kept_objections, reasoning_trace,
                            next_step_hint,
                            pending_reflection: {
                              reflection_id, artifact_path,
                              must_be_registered_by: "opc_flow_reflect"
                            }
                          }                                          ← 无 flow_next

[5] state-server:      opc_flow_reflect({ reflection_id })
                       内部:
                          1. 校验 reflection_id ∈ pending_reflections[]
                          2. 读 artifact_path 验证文件存在
                          3. 把 {reflection_id, artifact_path, verdict, ...} 追加到 reflection_log[]
                          4. 从 pending_reflections[] 移除
                          5. 路由 flow_next
                       ←  flow_next: 继续反思 / 跳出 / ask_user      ← 登记完成 + 驱动下一步
```

**适用方法**：以上 5 步铁律适用于全部 6 种反思方法——`cove` / `critique` / `debate` / `tot` / `reflexion` / `validator`。其中：
- `cove` / `critique` / `debate` / `tot` / `reflexion` 走完整 5 步（含 `pending_reflection` 登记）
- `validator` 用于 P6（node_execution）/ P7（phase_completion），**不产生 `pending_reflection`**（validator 在 `opc_reflect_*_complete` 内直接写 verdict 到 flow-state，不走登记队列）。详见 [02-server-design 三·补](../02-server-design/00_overview.md#三补-p6--p7-不走-reflection-工具面边界澄清)

**关键不变量**：
- 步骤 [2][4] 由 reflection-server 完成，**不发 `flow_next`**
- 步骤 [4] artifact 物理落盘**由 reflection-server 完成**，state-server 不参与写
- 步骤 [4] 发出的 `pending_reflection` 必须在步骤 [5] 被 `opc_flow_reflect` 登记（validator 除外——不产生 pending_reflection）
- 步骤 [5] 完成前，**任何受 registry-guard 保护的 state-server 写类工具都会被拒绝**
- 任何 reflection-server 工具调用之后，下一个工具**必然是 state-server 的工具或 Task** —— 要么 `opc_flow_reflect` 登记，要么 Claude 通过 Task 派 sub-agent 跑反思方法

---

## 五、多轮反思如何工作

```
Round 1 反思:
  reflection-server 跑完 →
    artifact:   opc-logs/reflection/<session>/rfl-P5-r1-01HXYZ.json
    返回:        pending_reflection { reflection_id: "rfl-P5-r1-01HXYZ", ... }
  Claude → opc_flow_reflect({reflection_id: "rfl-P5-r1-01HXYZ"})
    state-server:
      验证 artifact 存在 → 登记到 reflection_log[0] → 清空 pending_reflections[]
      verdict=objections_remain → flow_next: opc_reflect_plan

Round 2 反思:
  opc_reflect_plan 调用时，state-server 透传上一轮 artifact_path:
    prior_reflections: [{round: 1, artifact_path: "opc-logs/.../rfl-P5-r1-01HXYZ.json"}]
  sub-agent 读 prior artifact → 在 Round 1 基础上继续反思
  reflection-server 写 artifact: rfl-P5-r2-01HXY8.json
  返回 pending_reflection { reflection_id: "rfl-P5-r2-01HXY8" }
  Claude → opc_flow_reflect({reflection_id: "rfl-P5-r2-01HXY8"})

Round 3:  (verdict=clean 也要登记)
  artifact: rfl-P5-r3-01HXY9.json
  pending_reflection { reflection_id: "rfl-P5-r3-01HXY9" }
  Claude → opc_flow_reflect({reflection_id: "rfl-P5-r3-01HXY9"})
    state-server 看到 verdict=clean → flow_next: opc_phase_confirm（跳出反思）
```

**多轮的内容累积** = 每轮 sub-agent 主动读上几轮的 `artifact_path` 继续推理（这是反思方法学层面的累积，不是工程登记层面的）。
**每轮独立登记** = 每个 round 单独 1 个 artifact + 1 个 `reflection_id` + 1 次 `opc_flow_reflect` 调用。

---

## 六、`pending_reflections[]` 不变量（hard invariant）

| 不变量 | 强度 | 违反处理 |
|---|---|---|
| `pending_reflections[]` 任何时刻最多 1 个元素 | **hard** | 第二次 `opc_reflect_*_complete` 调用前若 `pending_reflections` 非空 → reflection-server 自身 reject（`error: previous_pending_unregistered`），要求 Claude 先调 `opc_flow_reflect` 登记上一轮。⚠️ **过期场景的细化**见 [六·补 与现有 hard invariants 的关系修订](#与现有-hard-invariants-的关系修订) |
| `verdict=clean` 也发 `pending_reflection` | **hard** | 反思日志必须落盘——`verdict=clean` 时 `opc_flow_reflect` 登记后 `flow_next` 指向上层 step（跳出反思），而不是再发 `opc_reflect_plan` |
| 跨 phase 切换前必须清空 | **hard** | `opc_phase_complete` 出口校验 `pending_reflections.length == 0`，否则 reject 并要求先 `opc_flow_reflect` |
| 跨 sub-pipeline 切换前必须清空 | **hard** | 同上（`opc_phase_complete` 的同一校验覆盖：完成最后一个 phase 时同时检查） |
| 同一 `reflection_id` 不可重复登记 | **hard** | 第二次 `opc_flow_reflect({same reflection_id})` → reject `error: reflection_already_registered` |
| `reflection_id` 过期（默认 30min，artifact 保留 7 天） | **soft → ask_user** | 不再"自动清理 + 静默标 incomplete"。下一次 `opc_flow_query` 检测到过期 pending → 走 ask_user 路径（详见 六·补 过期处理契约）。artifact 文件保留 7 天，期间用户可选"丢弃"或"补登记" |

---

## 六·补 反思过期处理契约（不再静默吞反思）

### 背景

旧版规则是「过期自动清理 + 标 incomplete + 不阻塞」。问题：**30 分钟没登记不一定是死锁**，可能是 Claude 被用户切走、token 耗光、上下文压缩丢失中间状态。"自动清理 + 不阻塞" = 反思 artifact 被静默吞掉，用户毫无感知。

### 新规则：过期 → ask_user

| 阶段 | 旧行为 | 新行为 |
|---|---|---|
| `expires_at` 到达 | `opc_flow_query` 自动从 `pending_reflections[]` 移除 + 标 incomplete | **保留 pending_reflections[] 项不变**，仅标 `status: expired_pending_decision` |
| artifact 文件 | 立即孤儿化 | **保留 7 天**（`opc-logs/reflection/<session>/<reflection_id>.json` 不删） |
| 下一次 `opc_flow_query` | 不感知 | 检测到过期 pending → 返回 `flow_next: ask_user`（专用 question_id `uq-expired-<reflection_id>`） |
| 用户答复入口 | — | 复用 `opc_flow_user_reply`，`resolution.disposition` ∈ `discard` / `resume` |
| 7 天后 artifact 仍未处理 | — | **物理删除** artifact + 从 pending_reflections[] 移除 + 写 `flow-state.history` 一条 `event: reflection_artifact_purged` |

### 过期 ask_user 的 question payload

```typescript
opc_flow_query() 检测到过期 pending → 返回:
{
  active: true,
  flow_next: {
    action: "ask_user",
    question_id: "uq-expired-rfl-P5-r2-01HXY8",
    display_to_user: {
      summary: "反思 rfl-P5-r2-01HXY8 在 30 分钟内未登记（可能因为上下文切换/token 耗尽）。artifact 还在磁盘上，请决定如何处理。",
      step_id: "node_selection",
      reflection_id: "rfl-P5-r2-01HXY8",
      artifact_path: "opc-logs/reflection/sess-abc/rfl-P5-r2-01HXY8.json",
      asked_at: "<原 expires_at>",
      artifact_purge_at: "<asked_at + 7d>",
      options: [
        { value: "resume",  label: "补登记并继续按反思结论推进" },
        { value: "discard", label: "丢弃这次反思（保留 artifact 7 天用于审计），重新跑反思方法" },
        { value: "skip",    label: "丢弃 + 跳过本步反思一次，直接 phase_confirm" }
      ]
    },
    required_next_tool: "opc_flow_user_reply"
  }
}
```

### `opc_flow_user_reply` 处理过期 question 的扩展

```typescript
opc_flow_user_reply({
  question_id: "uq-expired-rfl-P5-r2-01HXY8",
  user_reply: "<原话>",
  resolution: {
    disposition: "resume" | "discard" | "skip",
    notes?: string
  }
})

内部分支:
  disposition === "resume":
    → 等价调用 opc_flow_reflect({reflection_id}) 走正常登记 + 路由 flow_next
    → user_interventions[] 追加 {trigger: "expired_reflection_resumed", ...}

  disposition === "discard":
    → 从 pending_reflections[] 移除该项
    → artifact 文件保留 7 天，标记 status: discarded_by_user
    → 路由 flow_next 回到触发反思的上一个 step（如 P5 → 重新走 opc_reflect_plan）
    → user_interventions[] 追加 {trigger: "expired_reflection_discarded", ...}

  disposition === "skip":
    → 从 pending_reflections[] 移除该项
    → 标记 reflection_log[] 追加一条 {reflection_id, verdict: "skipped_by_user_after_expiry"}
    → 路由 flow_next 直接到反思后的 step（如 P5 → opc_phase_confirm，含 _skip_reflection_once 旁路）
    → user_interventions[] 追加 {trigger: "expired_reflection_skipped", ...}
```

### Hard invariants（六·补 补充）

| 不变量 | 强度 | 违反处理 |
|---|---|---|
| 过期 pending 不被自动从 `pending_reflections[]` 移除 | **hard** | 只能由 `opc_flow_user_reply` 显式消费 |
| 过期 pending 与新创建 pending 共存时，**优先消费过期项** | **hard** | reflection-server `opc_reflect_*_complete` 校验"前序 pending 是否过期"——若过期 → reject `error: previous_expired_pending`，要求先走 ask_user |
| artifact 物理保留 ≥ 7 天 | **hard** | `opc-logs` 清理脚本必须按 `discarded_at + 7d` / `expired_at + 7d` 才能删 |
| 7 天 hard purge 必写 history | **hard** | `flow-state.history` 追加 `event: reflection_artifact_purged`，便于审计 |

### 与现有 hard invariants 的关系修订

> 修订原"`pending_reflections[]` 任何时刻最多 1 个元素"不变量为：
> - **正常态**：最多 1 个 `status: pending` 元素
> - **过期未决态**：允许出现 1 个 `status: expired_pending_decision` 元素（等待 ask_user 消费）
> - **绝对禁止**：同时存在 2 个 `status: pending`，或 1 个 pending + 1 个 expired_pending_decision
>
> 实施上，`opc_reflect_*_complete` 在写新 pending 前必须先校验"是否存在任何状态的旧 pending"——若有，要求 Claude 先调 `opc_flow_user_reply` 或 `opc_flow_reflect` 把旧的清掉。

### 告警维度（opc_reflect_admin({action:"query_stats"}) 新增字段）

`opc_reflect_admin({action:"query_stats"})` 返回中新增三个计数器，作为反思链路健康度的关键告警指标：

```typescript
type ReflectionStatsResponse = {
  // ... 既有字段 ...

  expiry_metrics: {
    expired_pending_count_24h: number       // 过去 24h 触发 ask_user 的过期反思数
    expired_resumed_count_24h: number       // 其中用户选 resume 的数
    expired_discarded_count_24h: number     // 其中用户选 discard 的数
    expired_skipped_count_24h: number       // 其中用户选 skip 的数
    artifact_purged_7d_count: number        // 过去 30d 因 7 天到期被物理删除的 artifact 数（**应永远为 0**，非 0 即说明用户长期没回 ask_user）
  }
}
```

**告警阈值建议**（写进 platform/opc-orchestrator 默认配置）：

| 指标 | 阈值 | 含义 |
|---|---|---|
| `expired_pending_count_24h` > 3 | warning | 反思频繁过期，可能 token budget 不够或 hook 失效 |
| `expired_discarded_count_24h / expired_pending_count_24h` > 0.5 | warning | 反思方法 FP 率可能太高，用户倾向于丢弃 |
| `artifact_purged_7d_count` > 0 | **error** | 用户有 7 天没回 ask_user，OPC 整体使用率异常 |

---



### 防御 1：理论文档（语义层）

本文档（四 5 步铁律 + 五 多轮反思）作为 Claude 在 long context 里的语义提示，以及开发者 onboarding 的入门读物。

**强度**：弱。LLM 在长对话里经常忘文档。

### 防御 2：`next_step_hint` 字段（数据层）

reflection-server 所有工具返回里都带 `next_step_hint`，明确告诉 Claude "我返回的这堆数据该交给谁处理"。

```typescript
type NextStepHint = {
  suggestion: string              // 一句话提示
  suggested_tool: string          // 下一个该调的工具
  suggested_args: object          // 预填的参数（只含 reflection_id，不再整块搬运 reflect_record）
  why: string                     // 为什么这样做
}
```

**示例**：

```typescript
// opc_reflect_complete({method:"critique"}) 返回（结构同 cove / debate / tot / reflexion；validator 无 pending_reflection）
{
  verdict: "objections_remain",
  kept_objections: [{ id: "obj-1", text: "...", evidence_ref: "..." }],
  reasoning_trace: ["...", "..."],
  next_step_hint: {
    suggestion: "调 opc_flow_reflect 登记本轮反思（artifact 已写盘），state-server 会决定是否继续",
    suggested_tool: "opc_flow_reflect",
    suggested_args: {
      reflection_id: "rfl-P5-r2-01HXY8"
    },
    why: "未登记的反思会在 phase_confirm 时被 registry-guard 拒绝"
  },
  pending_reflection: {
    reflection_id: "rfl-P5-r2-01HXY8",
    artifact_path: "opc-logs/reflection/sess-abc/rfl-P5-r2-01HXY8.json",
    expires_at: "2026-06-09T11:00:00Z",
    must_be_registered_by: "opc_flow_reflect"
  }
}
```

**关键区别**：
- `flow_next`（指令）= "你**必须**调 X" → state-server 独占
- `next_step_hint`（建议）= "**建议**你调 X，参数大概这样" → 任何 server 都能给

**强度**：中。LLM 对结构化"使用说明"的遵从度远高于纯文本文档。

### 防御 3：`reflection-registry-guard`（工程层）

不依赖 Claude 的自觉，**用登记表锁住流程**——Claude 不调 `opc_flow_reflect`，任何 state-server 写工具都会被拒绝。

#### `pending_reflection` 生命周期

```
[创建] opc_reflect_*_complete 调用结束:
       1. 写盘 artifact:
          path = opc-logs/reflection/<session_id>/<reflection_id>.json
       2. 校验 pending_reflections.length == 0
          否则 reject (error: previous_pending_unregistered)
       3. 返回 pending_reflection {
            reflection_id    = "rfl-<step>-r<n>-<ulid>"
            artifact_path    = <上一步路径>
            expires_at       = now + 30min
            must_be_registered_by = "opc_flow_reflect"
          }
       4. state-server 收到后写入 flow-state.json.pending_reflections[]

[拦截] 任何 state-server 写类工具调用前，registry-guard 校验:
       if flow_state.pending_reflections.length > 0
          && callerTool !== pending.must_be_registered_by:
         → 拒绝执行 + 返回 required_action

[登记] opc_flow_reflect({reflection_id}) 被调用:
       1. 校验 reflection_id 存在于 pending_reflections[] 且未过期
       2. 读 artifact_path 验证文件存在（含 verdict / reasoning_trace 等关键字段）
       3. 追加到 flow-state.json.reflection_log[] 一条 {reflection_id, artifact_path, verdict, registered_at}
       4. 从 pending_reflections[] 移除
       5. 返回 flow_next

[过期] expires_at 到达后:
       → 下一次 opc_flow_query 检测到过期 pending → 走 ask_user 路径
         （详见 六·补 过期处理契约，**不再自动清理 + 静默标 incomplete**）
       → artifact 文件保留 7 天，期间可通过 opc_flow_reflect_resume 补登记或丢弃
```

#### 受 reflection-registry-guard 保护的工具清单（唯一真相源）

> ⚠️ 本节是保护清单的**唯一真相源**。其他文档（02-server-design / 10_flow-state-schema / 07_three-server-seam-matrix / 03_flow-tools-step-routing / 阶段·节点·管线工具文档）一律以指针形式引用本节，不再列举工具名。

按反思位点 P1–P8 推进顺序排列：

| # | 工具 | 校验时机 | 何时可能有未登记 pending | 拦截后 `required_action` |
|---|---|---|---|---|
| 1 | `opc_flow_reflect` | 登记入口（自身校验） | — | 缺 `reflection_id` / 不匹配 → reject |
| 2 | `opc_flow_step_complete({step:"task_analysis"})` | P1 反思未登记时 Claude 跳过来调 | P1 pending 未登记 | `opc_flow_reflect({reflection_id})` |
| 3 | `opc_flow_step_complete({step:"task_decomposition"})` | P2 反思未登记时 | P2 pending 未登记 | 同上 |
| 4 | `opc_flow_step_complete({step:"brief_generation"})` | P2 / P3 反思未登记时 | P2 或 P3 pending 未登记 | 同上 |
| 5 | `opc_pipeline_create` | P4 反思未登记时 | P4 pending 未登记 | 同上 |
| 6 | `opc_phase_confirm` | P5 反思未登记 | P5 pending 未登记 | 同上 |
| 7 | `opc_node_start` | P5 反思未登记 | P5 pending 未登记 | 同上 |
| 8 | `opc_phase_complete` | P5（残留）反思未登记 | P5 pending 未登记；**同时也是跨 phase/sub 切换的清空校验点**。P6 / P7 走 Validator-only 不产生 pending（[02-server-design 三·补](../02-server-design/00_overview.md#三补-p6--p7-不走-reflection-工具面边界澄清)） | 同上 |
| 9 | `opc_pipeline_lifecycle({action:"complete"})` | P5 / P8 反思未登记 | 任意 phase 残留 pending（P6/P7 不入此列） | 同上 |

**不受保护清单（故意豁免）**：

| 工具 | 豁免理由 |
|---|---|
| `opc_flow_correct({action:"revise"\|"restart"\|"phase_reset"})` / `opc_pipeline_lifecycle({action:"replan"})` | 纠错类通道——反思未登记时用户也可能想纠错，不该被锁死 |
| `opc_flow_lifecycle({action:"abort"})` | 用户跑路权，永远允许 |
| `opc_node_finish({status:"success"\|"failed"})` | sub-agent 回报通道，不能被反思阻塞 |

#### 失败返回示例

```typescript
opc_phase_confirm({...}) 被调用时存在未登记反思:

→ 返回:
{
  error: "pending_reflection_unregistered",
  message: "存在未登记的反思记录，无法推进 phase_confirm",
  pending_reflection_id: "rfl-P5-r2-01HXY8",
  pending_artifact_path: "opc-logs/reflection/sess-abc/rfl-P5-r2-01HXY8.json",
  pending_step_id: "node_selection",
  required_action: {
    tool: "opc_flow_reflect",
    args: {
      reflection_id: "rfl-P5-r2-01HXY8"
    },
    why: "先登记反思记录，再推进流程"
  }
}
```

**强度**：强。Claude 想跳也跳不了，工程层兜底。

---

## 八、契约违反场景与排错

| 场景 | 现象 | 排查 |
|---|---|---|
| Claude 跳过 `opc_flow_reflect` 直接调 `opc_phase_confirm` | 返回 `pending_reflection_unregistered` 错误 | 看错误里的 `required_action`，按提示调 `opc_flow_reflect({reflection_id})` |
| Claude 重复调 `opc_flow_reflect` 同一个 `reflection_id` | 第二次返回 `reflection_already_registered` | `flow-state.json.pending_reflections` 应已为空，无需再调 |
| `reflection_id` 过期后再登记 | 返回 `reflection_id_expired` | 重新跑反思方法（reflection-server 会发新 `reflection_id`） |
| Claude 跳过 `opc_flow_reflect` 又跑下一轮 `opc_reflect_execute({method:"critique"})` | reflection-server 自身 reject `previous_pending_unregistered` | 先调 `opc_flow_reflect` 登记上一轮 |
| `pending_reflections[]` 出现 2 个元素 | 视为**实现 bug**，单测必拦截 | 检查 reflection-server 是否漏了不变量校验（六 第 1 条）|
| reflection-server 工具意外返回 `flow_next` | 视为**协议违反**，单测必拦截 | reflection-server 单测断言 `response.flow_next === undefined` |
| `opc_flow_reflect` 收到的 `reflection_id` 文件不存在 | 返回 `artifact_missing` | 反思 server 写盘失败 → 检查磁盘权限 / 日志目录 |

---

## 八·补 ask_user 回灌闭环（A3 契约）

### 触发条件

`opc_flow_reflect` 路由判定时，若 `reflection_log[step].length == max_rounds 且 artifact.verdict == "objections_remain"`，触发 `verdict: rounds_exceeded`，进入 ask_user 路径。

### 命名

| 概念 | 含义 |
|---|---|
| **`pending_user_question`** | flow-state.json 中的"待回灌的用户提问"，由 state-server 在触发 ask_user 时写入；由 `opc_flow_user_reply` 消费清除 |
| **`question_id`** | 单次 ask_user 的稳定 ID，形如 `uq-P2-r3-<ulid>` |
| **`pending-question-guard`** | 与 reflection-registry-guard 平行的第二道软锁——`pending_user_question` 非空时所有写工具被拦截，提示 Claude 调 `opc_flow_user_reply` |
| **`opc_flow_user_reply`** | 唯一的回灌入口工具，按 `pending_user_question.step_id` 路由到对应 step 续上 |

### 5 步闭环流程

```
[1] state-server: opc_flow_reflect 路由判定
                  reflection_log[step].length == max_rounds && verdict == "objections_remain"
                  →  生成 question_id
                  →  写 flow-state.pending_user_question {
                       question_id, step_id, round = max_rounds,
                       reasoning_trace, kept_objections, context_artifacts,
                       asked_at = now, expires_at = now + 30min,
                       must_be_resolved_by = "opc_flow_user_reply"
                     }
                  ←  flow_next: {
                       action: "ask_user",
                       question_id,
                       display_to_user: { summary, reasoning_trace, kept_objections },
                       required_next_tool: "opc_flow_user_reply",
                       why: "用户答复后调 opc_flow_user_reply 灌回；不要调其他工具"
                     }

[2] Claude: 把 display_to_user 渲染给用户

[3] 用户: 自然语言答复（如 "complexity 改 high，加 audit unit"）

[4] Claude: 把答复转译为结构化 resolution
            opc_flow_user_reply({
              question_id,
              user_reply: "<用户原话>",
              resolution: {
                accumulated_patch: { complexity: "high", knowledge_unit: [..., "audit"] },
                objections_resolved: ["obj-1", "obj-3"],
                objections_dismissed: ["obj-2"],
                notes: "<可选解释>"
              }
            })

[5] state-server: opc_flow_user_reply 内部
                  1. 校验 question_id 匹配 pending_user_question.question_id + 未过期
                  2. 校验 pending_reflections.length == 0（rounds 触发时最后一轮反思已登记）
                  3. 写 L1: flow-state.user_interventions[] 追加 {
                       intervention_id, trigger: "ask_user_rounds_exceeded",
                       step_id, question_summary, user_reply, resolution,
                       linked_reflection_artifacts: context_artifacts,
                       at: now
                     }
                  4. 应用 resolution.accumulated_patch 到 flow-state.accumulated
                  5. 清 pending_user_question = null
                  6. 路由 flow_next 按 step_id 续上（见下表）
                  ←  flow_next: { tool, args, why }
```

### `flow_next` 路由表（按触发 ask_user 的 step_id）

| step_id | 回灌后 flow_next | 行为细节 |
|---|---|---|
| `intent_analysis` (P1) | `opc_flow_step_complete({step:"intent_analysis"})`（带 resolution 修正后的 intent） | 跳过反思一次（避免 round 再触发） |
| `task_analysis` (P2) | `opc_flow_step_complete({step:"task_analysis"})`（带 accumulated_patch 后的 analysis_result） | 跳过反思一次 |
| `task_decomposition` (P3) | `opc_flow_step_complete({step:"task_decomposition"})`（带 resolution 修正后的 sub_pipelines） | 跳过反思一次 |
| `brief_generation` (P4) | `opc_flow_step_complete({step:"brief_generation"})` | 跳过反思一次 |
| `node_selection` (P5) | `opc_phase_confirm`（直接采用用户决策的 selected_nodes，写入 state.json.phases[].selected_nodes） | 跳过反思一次 |
| `node_execution` (P6) | `opc_node_finish({status:"success"})`（直接采纳用户对 evidence 的裁定） | 跳过反思一次 |
| `phase_completion` (P7) | `opc_phase_complete` | 跳过反思一次 |
| `phase_advance` (P8) | `opc_phase_start(next_phase)` 或 `opc_flow_correct({action:"phase_reset"})`（按用户裁定） | 跳过反思一次 |

> **跳过反思一次**：实现上在 `opc_flow_step_complete({step})` / 对应工具内部加临时标志（如 `_skip_reflection_once: true` 从 user_intervention 路径传入），避免立刻又走到 rounds-guard 形成 ping-pong。

### `pending_user_question` 生命周期

```
[创建] opc_flow_reflect 触发 rounds_exceeded:
       → 校验 pending_user_question == null（hard invariant：同时只能有 1 个未回灌的提问）
         若非空 → reject (error: previous_question_unresolved)
       → 写 pending_user_question
       → flow_next: ask_user

[拦截] 任何 state-server 写类工具调用前 pending-question-guard 校验:
       if flow_state.pending_user_question != null
          && callerTool !== "opc_flow_user_reply":
         → reject {
             error: "pending_user_question",
             question_id, asked_at, step_id,
             required_action: { tool: "opc_flow_user_reply", args: { question_id } }
           }

[消费] opc_flow_user_reply({question_id, user_reply, resolution}):
       → 校验 + 写 L1 + 应用 patch + 清 pending_user_question + 路由 flow_next

[过期] expires_at 到达后:
       → 下一次 opc_flow_query 自动清空 pending_user_question
       → 在 flow-state.history 追加 { event: "user_question_expired", question_id }
       → 不阻塞后续推进（与 pending_reflection 过期同样的软兜底）
```

### 受 pending-question-guard 保护的工具

**完全复用 reflection-registry-guard 的 9 项清单**（见 [七 防御 3 受 reflection-registry-guard 保护的工具清单](#受-reflection-registry-guard-保护的工具清单唯一真相源)）。两个 guard 都是写类工具的前置校验，校验顺序：

```
checkPendingReflection(flowState, callerTool)   // ① 先校反思登记
checkPendingUserQuestion(flowState, callerTool) // ② 再校用户问答
// 任一抛错即 reject
```

豁免清单也复用——`opc_flow_lifecycle({action:"abort"})` / `opc_flow_correct({action:"revise"|"restart"|"phase_reset"})` / `opc_pipeline_lifecycle({action:"replan"})` / `opc_node_finish({status:"success"|"failed"})` 永远放行（用户跑路 / 主动纠错 / sub-agent 回报通道）。

### Hard invariants（A3 补充）

| 不变量 | 强度 | 违反处理 |
|---|---|---|
| `pending_user_question` 任何时刻最多 1 个（null 或 1 个对象，不是数组） | **hard** | 第二次 rounds_exceeded 前未回灌 → opc_flow_reflect reject `previous_question_unresolved` |
| 跨 phase 切换前必须清空 | **hard** | `opc_phase_complete` 走 pending-question-guard，未回灌自动 reject |
| 跨 sub-pipeline 切换前必须清空 | **hard** | 同上 |
| 同 `question_id` 不可重复回灌 | **hard** | 第二次 `opc_flow_user_reply` → reject `question_already_resolved` |
| `question_id` 过期 30min | **soft** | `opc_flow_query` 自动清；不阻塞推进 |
| `pending_reflections` 与 `pending_user_question` 不可同时非空 | **hard** | rounds-guard 触发时上一轮 reflection 必已登记；违反 = 实现 bug |

### 与 corrections 三层归档的关系

`opc_flow_user_reply` 写入的 `user_interventions[]` 条目带 `trigger: "ask_user_rounds_exceeded"`，distiller sub-agent 在 pipeline 结束时（`opc_reflect_admin({action:"record_interventions"})`）优先级更高地处理这类条目——因为它们附带了 `linked_reflection_artifacts`（指向 N 轮反思 artifact 路径），上下文比纯"用户主动纠错"丰富得多，提炼成 corrections 后命中率也更高。

### 失败返回示例

```typescript
// 场景 1：Claude 跳过 opc_flow_user_reply 直接调 opc_phase_confirm
{
  error: "pending_user_question",
  message: "存在未回灌的用户提问，无法推进 phase_confirm",
  question_id: "uq-P5-r2-01HXY8",
  asked_at: "...",
  step_id: "node_selection",
  required_action: {
    tool: "opc_flow_user_reply",
    args: { question_id: "uq-P5-r2-01HXY8" },
    why: "先把用户答复回灌到流程，再推进"
  }
}

// 场景 2：rounds 触发时上一个 ask_user 还没消费
opc_flow_reflect({ reflection_id, ... }):
→ 计算 rounds 触发 → 检查 pending_user_question != null
→ reject {
    error: "previous_question_unresolved",
    pending_question_id: "uq-P2-r2-01HXY8",
    required_action: { tool: "opc_flow_user_reply", args: { question_id: "uq-P2-r2-01HXY8" }}
  }
```

---

## 九、与单驱动者原则的关系

加上 `pending_reflection` + `pending_user_question` 后，单驱动者原则的精确表述是：

> **驱动权 100% 归 state-server。reflection-server 只通过三种渠道与 state-server 协作：**
> 1. **返回值数据**（含 `next_step_hint`）——告诉 Claude 该把这堆数据带给谁
> 2. **写盘 artifact**——把反思内容物理落地到 `opc-logs/reflection/`
> 3. **`pending_reflection` 登记契约**——让 state-server 写工具被动等待反思登记
>
> **用户回灌**走第四条渠道，但完全由 state-server 自己驱动（reflection-server 不涉入）：
> 4. **`pending_user_question` + `opc_flow_user_reply` 回灌契约**——state-server 触发 ask_user 时挂锁，由 `opc_flow_user_reply` 唯一登记口消费

reflection-server 永远不指挥流程，只提供"能力 + 内容 + 提示 + 锁"。

---

## 十、registry-guard 校验工具的实现伪代码

```typescript
// state-server/engine/reflection-registry-guard.ts
export function checkPendingReflection(flowState: FlowState, callerTool: string) {
  const pendings = flowState.pending_reflections ?? []
  if (pendings.length === 0) return

  // 不变量校验：永远最多 1 个
  if (pendings.length > 1) {
    throw new Error("invariant_violation: pending_reflections.length > 1")
  }

  const pending = pendings[0]
  // 当前调用的就是该 pending 期待的登记口 → 放行（在工具内登记）
  if (callerTool === pending.must_be_registered_by) return

  // 否则拒绝
  throw {
    error: "pending_reflection_unregistered",
    message: `存在未登记的反思记录，无法调用 ${callerTool}`,
    pending_reflection_id: pending.reflection_id,
    pending_artifact_path: pending.artifact_path,
    pending_step_id: pending.step_id,
    required_action: {
      tool: pending.must_be_registered_by,
      args: { reflection_id: pending.reflection_id },
      why: "先登记反思记录，再推进流程"
    }
  }
}

// 在三 防御 3 清单列出的全部 9 个工具入口处调用:
opc_flow_reflect({ reflection_id }) {
  const flowState = loadFlowState()
  const pending = flowState.pending_reflections.find(p => p.reflection_id === reflection_id)
  if (!pending) throw { error: "missing_or_invalid_reflection_id" }
  if (Date.now() > Date.parse(pending.expires_at)) throw { error: "reflection_id_expired" }

  // 读 artifact 验证文件存在 + 抽 verdict
  const artifact = readJson(pending.artifact_path)
  if (!artifact) throw { error: "artifact_missing", artifact_path: pending.artifact_path }

  // 登记 + 移除 pending
  flowState.reflection_log.push({
    reflection_id, artifact_path: pending.artifact_path,
    verdict: artifact.verdict, registered_at: nowIso()
  })
  flowState.pending_reflections = flowState.pending_reflections.filter(p => p.reflection_id !== reflection_id)
  saveFlowState(flowState)

  return { flow_next: routeNextStep(flowState, artifact) }
}

opc_phase_confirm({...}) {
  checkPendingReflection(loadFlowState(), "opc_phase_confirm")
  // 正常逻辑...
}
// opc_flow_step_complete({step:"task_analysis"|"task_decomposition"|"brief_generation"}) /
// opc_pipeline_create / opc_phase_complete / opc_node_start / opc_pipeline_lifecycle({action:"complete"}) 同理

// 跨 phase 切换额外校验:
opc_phase_complete({...}) {
  checkPendingReflection(loadFlowState(), "opc_phase_complete")
  // 正常逻辑... 完成后:
  if (flowState.pending_reflections.length !== 0) {
    throw new Error("invariant_violation: pending must be cleared before phase advance")
  }
}
```

---

## 十一、相关文档

- [00_overview.md](00_overview.md) — 反思流程总览（per-step 时序）
- [../02-server-design/00_overview.md](../02-server-design/00_overview.md) — 13 个工具签名 + registry-guard 实现指针
- [../../02-opc-state-server/01-intent-analysis/03_flow-tools-step-routing.md](../../02-opc-state-server/01-intent-analysis/03_flow-tools-step-routing.md) — `opc_flow_reflect` 完整规范
- [../../02-opc-state-server/01-intent-analysis/10_flow-state-schema.md](../../02-opc-state-server/01-intent-analysis/10_flow-state-schema.md) — `pending_reflections` / `reflection_log` 字段
