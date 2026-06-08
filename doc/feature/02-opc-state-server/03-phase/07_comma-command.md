# 07 /comma 命令：阶段独立运行

`/comma` 命令允许在不启动完整管线的情况下，单独运行和测试任意阶段。底层调 `opc_phase_run` 工具。

---

## 一、命令格式

```
/comma <phase-id> [选项]
```

| 选项 | 说明 |
|------|------|
| `--pipeline <id>` | 在已有管线上下文中运行 |
| `--dry-run` | 测试模式：执行但不持久化 |
| `--mock-inputs` | 自动生成 mock 知识数据 |
| `--nodes <list>` | 指定运行的节点子集 |
| `--report <path>` | 执行报告输出路径 |

---

## 二、运行模式

**独立模式**（无 `--pipeline`）：创建临时管线上下文，执行完毕后自动清理（dry-run）或保留产物。

**附加模式**（有 `--pipeline`）：在已有管线上下文中运行，复用 brief + state。

---

## 三、dry-run vs 正常执行

| 行为 | 正常执行 | dry-run |
|------|---------|---------|
| knowledge 写入 | 正常写入 | 跳过 |
| L1 校验 | 执行 | 跳过 |
| L2 校验 | 执行 | 执行 |
| state.json | 正常更新 | 临时，结束后删除 |

dry-run 用于验证阶段配置（节点是否齐全、依赖是否合理、质量门是否能跑通），不污染真实工程。

---

## 四、opc_phase_run

```
参数: phase, pipeline_id?, dry_run?, mock_inputs?, nodes?, report_path?

行为:
  ① 校验 phase-id 存在
  ② standalone（创建临时管线）或 attached（复用已有）
  ③ 输入检查 + mock 补齐
  ④ phase_start → 确认 → 逐 node 执行 → phase_complete
  ⑤ 清理临时管线（dry-run）/ 保留产物

返回: 阶段执行报告（nodes, knowledge_produced, duration_ms, warnings）
```

---

## 相关文档

- [08_tools-and-automation.md](08_tools-and-automation.md) — `opc_phase_run` 在工具表中的位置
- [../01-intent-analysis/02_flow-tools-entry-lifecycle.md](../01-intent-analysis/02_flow-tools-entry-lifecycle.md) — `/comma` 不走流程层
