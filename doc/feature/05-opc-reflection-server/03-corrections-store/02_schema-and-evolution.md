# 02 — Schema 版本与演化规则

> 本章定义 L1/L2/L3 三层 schema 的版本化管理、演化兼容策略、
> 迁移工具行为、以及 version bump 的触发条件。

## 一、版本化范围

三层各自独立版本化：

| 层 | 版本字段 | 当前版本 | 粒度 |
|---|---|---|---|
| L1 | （无，隐含） | N/A | 随 flow-state.json schema 整体管理 |
| L2 | `schema_version` (per `.md` file) | 2 | 逐文件独立版本 |
| L3 | （无，隐含） | N/A | 固定在 `global-corrections.jsonl` 格式 |

L1 和 L3 的 schema 跟随所在文件的顶层格式定义，不逐条版本化。
L2 的每个 `.md` 文件携带独立 `schema_version`，因为 L2 条目来自
不同时间、不同来源（user/distiller/reflexion/seed），演化速度不一致。

## 二、L2 Schema 当前版本 (v2)

### 2.1 完整字段定义

```yaml
---
id: corr-<ulid>              # ULID，主键
type: correction | lesson    # correction=纠正已知错误，lesson=一般性原则
step: P1..P8                 # 关联的 reflection point
unit: <step-unit>            # 目录第一层，如 intent-analysis
section: <section-name>      # 目录第二层，如 task-vs-chat
subsection: <subsection>     # 目录第三层，即文件名（不含 .md）
hotness: <integer>           # 命中次数，每次采纳 +1，每周 ×0.9
frozen: false                # true=停止注入但保留可查
source: user|distiller|reflexion|seed
created_at: <ISO 8601>
updated_at: <ISO 8601>
schema_version: 2            # 本文件 schema 版本
related: [corr-xxx]          # 关联条目 ID 列表
keywords: [string]           # 匹配关键字
applies_when:                # TS 可判定的注入条件（v2 新增）
  - step: P1
  - intent_signals_contains: ["问句无动作"]
deprecated_by: null          # 被更新纠正替代时指向新 ID（v2 新增）
---
```

### 2.2 v2 新增字段（相对 v1）

| 字段 | 类型 | 说明 |
|---|---|---|
| `applies_when` | object[] | 让 TS 在注入前做确定性判定，减少无效注入 |
| `deprecated_by` | string\|null | 支持纠正条目间的替代链，避免僵尸条目持续注入 |

### 2.3 Markdown Body 结构

```
# <标题>

## 失败模式
<原始用户介入或反思 objection 的精炼描述>

## 纠正建议
<如何避免/修正，具体可操作>

## 反思 prompt 增强片段
> 当 step={step} 且匹配 keywords 时注入 enhanced_prompt

## 证据 / 原文链接
- L1 source: ...
- pipeline-id: ...
```

Body 结构不纳入 schema_version 管理——由 reader 按标题匹配解析，
未识别的 section 标题忽略不报错。

## 三、演化兼容规则

### 3.1 添加字段：始终允许

新字段必须是 optional（reader 容忍缺失）。writer 始终写入最新 schema 的全部字段。

```
规则 1：新增字段 → bump schema_version，reader 对缺失字段回退到默认值
```

### 3.2 删除字段：禁止

```
规则 2：已发布的字段永远不删除。
       若某个字段不再需要，标记为 deprecated（文档说明），
       reader 仍必须容忍其存在。
```

### 3.3 修改字段语义：禁止

```
规则 3：字段名和类型一旦发布，不可修改。
       如需变更语义，新增一个不同名的字段，旧字段标记 deprecated。
```

### 3.4 重命名字段：通过新增 + 废弃实现

```
规则 4：新增新名字段，旧字段保留但 reader 优先读新字段。
       两版本共存至少一个 major version 周期后旧字段方可标记 deprecated。
```

## 四、版本迁移

### 4.1 迁移触发

迁移由用户或系统触发：

- **手动**：`opc_corrections({action:"migrate", target_version: 3})`
- **自动**：reader 遇到高于自身支持版本的条目时，提示用户迁移
- **延迟迁移**：低版本条目在读时实时兼容，不强制立即升级

### 4.2 迁移流程

```
opc_corrections({action:"migrate", target_version: N})
    │
    ├── ① 扫描 .opc/memory/corrections/ 所有 .md 文件
    ├── ② 过滤 schema_version < target_version 的文件
    ├── ③ 对每个文件按版本链逐级升级：
    │        v1 → v2: 添加 applies_when: [], deprecated_by: null
    │        v2 → v3: (未来) 按迁移规则执行
    ├── ④ 写回文件（updated_at 不变，避免扰乱 hotness 衰减）
    ├── ⑤ 重建 .opc-memory.idx 索引
    └── ⑥ 输出迁移报告：{ migrated: N, skipped: M, errors: [] }
```

### 4.3 迁移幂等性

- 同版本文件跳过（不重复处理）
- 迁移失败的文件记录到 errors[]，不阻塞其他文件
- 已迁移文件可安全重复执行迁移（无副作用）

### 4.4 回滚

不提供自动回滚。迁移前自动创建 git commit（若 workspace 是 git repo），
用户可通过 `git revert` 回滚。

## 五、Reader 兼容矩阵

Reader 按自身支持的最新版本读取条目：

| 条目版本 | Reader 版本 | 行为 |
|---|---|---|
| v1 | v2 reader | 缺失字段回退默认值：`applies_when=[]`, `deprecated_by=null` |
| v2 | v2 reader | 正常读取 |
| v3 | v2 reader | 警告 "unknown schema_version 3"，尝试按 v2 解析（容忍未知字段） |

**跨版本读取的核心原则**：Reader 必须容忍未知字段（跳过），容忍缺失字段（回退默认值）。

## 六、Version Bump 触发条件

| 触发条件 | 示例 | 新版本 |
|---|---|---|
| 新增 optional 字段 | 加入 `auto_freeze_after: <days>` | minor bump（v2 → v3） |
| 字段语义重大变化 | `hotness` 改为基于时间的非线性衰减 | major bump（v2 → v3，但需迁移） |
| 新增 required 字段 | （不允许，违反兼容规则 1）| N/A |
| Body 结构变化 | 新增 `## 适用项目类型` section | 不 bump（reader 容忍受限） |

实际上由于规则限制（只加不删、新字段必须 optional），
绝大多数变化为 minor bump，迁移脚本的工作就是为新字段填充默认值。

## 七、L1 / L3 Schema 版本

### 7.1 L1（flow-state.json）

L1 schema 不逐条版本化。`user_interventions[]` 的字段随 `flow-state.json`
整体 schema 管理。当 L1 需要新增字段时：

- 新增字段放在 `user_interventions` 对象末尾
- 旧 pipeline 的 flow-state.json 快照不迁移
- L2 distiller 在读取 L1 时容忍缺失字段

### 7.2 L3（global-corrections.jsonl）

L3 schema 固定。每行一条 JSON 的结构不版本化。
如需变更 L3 格式，修改 `global-corrections.jsonl` 的 writer 和 reader
同步升级，旧行不做迁移（数量少，手动管理）。

## 八、相关文档

- [01 存储层定义](./01_storage-layers.md) — L1/L2/L3 完整 schema
- [03 膨胀控制](./03_expansion-controls.md) — C1–C4 与 schema 的交互
- [04 Seed Corrections](./04_seed-corrections.md) — seed 条目的版本管理
- [父文档](./00_overview.md) — corrections 存储总览
