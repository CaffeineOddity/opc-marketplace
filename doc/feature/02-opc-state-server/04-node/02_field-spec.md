# 02 字段规范

节点 frontmatter 完整字段定义。

---

## 一、基础

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 节点唯一标识，kebab-case |
| `phase` | string | 是 | 所属阶段 |
| `description` | string | 是 | 用于节点选择列表展示和语义匹配 |
| `tags` | string[] | 是 | 技术标签。与任务 tags 求交集 |
| `mode` | string | 是 | `parallel` / `sequential` |

---

## 二、Agent

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `agents.primary` | string[] | 是 | 核心 Agent，不可用则节点无法执行 |
| `agents.optional` | string[] | 否 | 辅助 Agent，可用则加入，不可用则跳过 |
| `skills` | string[] | 否 | 需要加载的 Skill 列表 |

---

## 三、质量门

| gate 类型 | 含义 | 校验方式 |
|-----------|------|---------|
| `test_pass` | 测试全部通过 | `evidence.test_results.failed === 0` |
| `lint_pass` | 无 lint 错误 | `evidence.lint_results.errors === 0` |
| `build_pass` | 构建成功 | `evidence.build_passed === true` |
| `type_check_pass` | 类型检查通过 | `evidence.type_check_passed === true` |

不声明 `quality_gates` 仅检查 L1（产出物存在性）；声明后附加 L2 校验。

---

## 四、超时与重试

| 字段 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `timeout_minutes` | number | 否 | 无 | 从 `opc_node_start` 起算 |
| `max_retries` | number | 否 | 3 | 超时自动重试上限 |

超时检测是惰性的：在 `opc_pipeline_status`、`opc_phase_start`、`opc_node_start` 等调用时触发。

---

## 五、input 格式

```yaml
input:
  - knowledge: user-auth/login/spec
  - knowledge: user-auth/login/architecture
  - knowledge: user-auth/login/api
    min_version: 2
```

`min_version` 校验在 `opc_node_start` 时强制执行。

---

## 六、output 格式

```yaml
output:
  - artifacts: [tests/, src/]
  - knowledge: user-auth/session/api
  - knowledge: user-auth/session/architecture
```

`artifacts` 是文件/目录路径列表；`knowledge` 是知识单元路径，由 `opc_knowledge_write` 在执行中产出。

---

## 相关文档

- [03_signal-matching.md](03_signal-matching.md) — `tags` 在信号匹配中的作用
- [04_concurrency-and-deps.md](04_concurrency-and-deps.md) — `output` 在文件域隔离中的作用
- [05_execution-and-retry.md](05_execution-and-retry.md) — `quality_gates` + `max_retries` 在执行中的作用
