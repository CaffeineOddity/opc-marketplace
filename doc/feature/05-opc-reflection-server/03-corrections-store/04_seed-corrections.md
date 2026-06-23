# 04 — Seed Corrections 冷启动

> 本章定义 L2 冷启动 seed 库的目录结构、注入策略、用户覆盖规则、
> marketplace 升级流程、以及 seed→project 的迁移路径。

## 一、问题定义

新项目或新用户首次 pipeline 时，`opc-memory/corrections/` 为空。
没有历史教训可注入，M2 Reflexion 在首个 pipeline 的 P2 步骤无教训可检索。
Seed corrections 解决此问题——预置一组从社区与维护者经验中提炼的通用纠正，
在第 1 个 pipeline 就能提供反思参考。

## 二、Seed 来源与分类

### 2.1 存储位置

```
src/mcp/opc-reflection-server/seed-corrections/
  intent-analysis/           # P1 reflections
    task-vs-chat/
      ambiguous-question.md
      single-action-mistake.md
    missing-context/
      agent-context-gap.md
  task-analysis/             # P2 reflections
    requirement-gaps/
      missing-non-functional.md
      missing-security.md
    scope-boundary/
      over-scoping.md
  decomposition/             # P3 reflections
    sub-pipeline-coupling/
      tight-interface.md
      missing-dependency.md
  node-execution/            # P6 reflections
    evidence-quality/
      missing-test-evidence.md
      fake-evidence.md
    artifact-completeness/
      partial-output.md
  meta/                      # 跨 step 元条目
    general-lessons/
      prompt-ambiguity.md
      spec-drift.md
```

### 2.2 分类标记

每个 seed 文件的 frontmatter 额外携带：

```yaml
source: seed
seed_origin: community | maintainer | synthesized
seed_version: 1
seed_min_projects: 0     # 被多少项目采纳过（L2 运行时统计）
seed_category: common | domain-specific | experimental
```

| `seed_category` | 注入条件 | 示例 |
|---|---|---|
| `common` | 始终注入 | "ambiguous-question" — 通用 |
| `domain-specific` | 项目类型匹配时注入 | "api-versioning-mistake" — 仅 API 项目 |
| `experimental` | 用户显式 opt-in | 新提交的、尚未验证的 seed |

### 2.3 质量标准

进入 `common` 类别的 seed 必须满足：

- 来源于 ≥ 3 个独立项目的实际纠正记录
- 经过 OPC 维护者 review
- 通过脱敏检查（无项目名、文件名、具体 API key 等敏感信息）

## 三、注入策略

### 3.1 冷启动注入时机

```
opc_reflect_plan({step}) 首次执行时：
    │
    ├── ① 查 L2: opc_corrections({action:"query", step})
    │       ├── 有结果 → 使用 L2（项目优先）
    │       └── 无结果 →
    │               │
    │               ├── ② 查 seed: 同 step + seed_category 匹配
    │               ├── ③ 注入 seed 条目（hotness 初值 = 3，source = seed）
    │               └── ④ 写入 L2 副本（seed 条目以 source=seed 写入项目 L2）
    │
    └── 后续 pipeline：L2 已有条目 → 不再查 seed（即使 L2 条目 hotness 低于 seed）
```

### 3.2 项目优先原则

```
规则：一旦项目的 L2 存在同 path（同 unit/section/subsection）的条目，
      该 path 的 seed 条目永久让位给项目条目。
      即使项目条目被冷冻（frozen=true），也不回退到 seed。
```

这确保项目自身积累的经验始终优先于通用 seed。

### 3.3 hotness 初始值

| 来源 | 初始 hotness | 理由 |
|---|---|---|
| `source=user` | 5 | 用户直接创建，信任度最高 |
| `source=seed` | 3 | 通用经验，中等信任 |
| `source=distiller` | 1 | 单次 pipeline 提炼，需积累验证 |
| `source=reflexion` | 1 | 反思发现，需积累验证 |

seed 的 hotness=3 意味着它在早期 pipeline 中有足够的优先级被注入（高于 distiller/reflexion 的新条目），
但如果项目自身产生了同领域的 `source=user` 条目（hotness=5），seed 会自然被排到后面。

## 四、用户覆盖

### 4.1 覆盖方式

用户对 seed 注入的 L2 副本有完全控制权：

| 操作 | 工具 | 效果 |
|---|---|---|
| 编辑 | `opc_corrections({action:"update"})` | 修改 seed 副本的 body/suggestion |
| 冷冻 | `opc_corrections({action:"freeze"})` | 冻结此条，不再注入 |
| 删除 | `opc_corrections({action:"delete"})` | 删除项目 L2 副本；下次 reflection 时 seed 不会重新注入（记录 deleted_seeds 集合） |
| 提升 | `opc_corrections({action:"endorse"})` | hotness +2，source 从 `seed` 改为 `user`（表示用户认可） |

### 4.2 deleted_seeds 集合

```
opc-memory/corrections/.deleted-seeds.json
["seed-path-1", "seed-path-2"]
```

用户删除过的 seed，后续 pipeline 不再注入。
如需恢复：`opc_corrections({action:"restore_seed", path:"..."})`。

## 五、Marketplace 升级

### 5.1 版本管理

seed 库随 marketplace 的 `opc/official-kits` 插件分发。升级流程：

```
opc-kit update opc/official-kits --diff seed-corrections
    │
    ├── ① 拉取新版 seed-corrections/
    ├── ② diff 新旧 seed 目录：
    │       ├── 新增 seed → 提示用户是否注入
    │       ├── 修改 seed → 提示是否更新项目 L2 副本（仅 source=seed 的条目）
    │       └── 删除 seed → 不影响已有 L2 副本（仅从 seed 库移除）
    └── ③ 用户确认后执行变更
```

### 5.2 变更提示

```
$ opc-kit update opc/official-kits --diff seed-corrections

Seed corrections 变更：
  + intent-analysis/task-vs-chat/pure-question.md    (新增)
  ~ decomposition/sub-pipeline-coupling/tight-interface.md (修改: body 更新)
  - node-execution/evidence-quality/outdated-ref.md  (移除)

是否应用变更？[A]ll / [S]elect / [N]one
```

### 5.3 冲突处理

当 seed 更新与用户修改过的 L2 副本冲突时：

```
seed 条目更新冲突：decomposition/tight-interface.md
  用户版本: hotness=8, source=user（已在 L2 修改过）
  seed 版本: hotness=3, source=seed

  用户版本优先，跳过此条的 seed 更新。
  如需查看 diff: opc_corrections({action:"diff", path:"..."})
```

## 六、Seed → 项目条目的迁移路径

```
seed 注入 L2 (hotness=3, source=seed)
    │
    ├── pipeline 1: 注入，命中，hotness=4
    ├── pipeline 2: 注入，命中，hotness=5
    ├── pipeline 3: ...
    │
    ├── 用户 endorse → source 变为 user，hotness +2
    │       此后不再受 seed 升级影响（source ≠ seed）
    │
    └── 或 用户 delete → 加入 deleted_seeds，不再注入
```

一个 seed 条目在项目中的生命周期：
从 `source=seed, hotness=3` 开始 → 被多次命中加温 →
要么被用户认可（升级为 user）→ 成为项目自身经验 →
要么被删除/冷冻 → 退出注入池。

## 七、贡献 Seed

### 7.1 提交流程

```
用户 L2 中发现一条广泛适用的纠正
    │
    ├── opc_corrections({action:"promote", id:"corr-xxx"})
    │       └── 晋升到 L3 (global-corrections.jsonl)
    │
    └── OPC 维护者定期审查 L3 中 source_projects ≥ 3 的条目
        └── 脱敏后加入 seed-corrections/ 作为 common seed
```

### 7.2 脱敏规则

晋升为 seed 前必须脱敏：

| 敏感信息 | 替换为 |
|---|---|
| 项目名称 | `<project>` |
| 文件路径 | `<workspace>/src/...` |
| 特定 API / 库名 | `<library>` 或保留通用库名 |
| 用户 / 公司名 | `<user>` / `<org>` |
| 具体数字 / 阈值 | 保留（如果对教训有意义）或替换为 `<N>` |

脱敏由 distiller agent 在 L2→L3 晋升时自动执行，维护者在 seed 入库前做人工复核。

## 八、相关文档

- [01 存储层定义](./01_storage-layers.md) — L2/L3 schema
- [02 Schema 演化](./02_schema-and-evolution.md) — seed 条目的 schema_version
- [03 膨胀控制](./03_expansion-controls.md) — seed 如何参与 C1–C4
- [05 Distiller Agent](./05_distiller-agent.md) — L2→L3 晋升与脱敏
- [父文档](./00_overview.md) — corrections 存储总览
