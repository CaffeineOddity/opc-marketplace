# 08 管线状态展示

`opc_pipeline_status` 与 `/opc-status` 渲染规范。所有展示均从 `pipeline-plan.json` + `state.json` 实时计算。

---

## 一、单管线

```
管线: user-auth (pipeline-20260530-001)
状态: in_progress

▸ sub-1: 用户认证系统  ⟳
  04-implement-design  ✓ (2/2 nodes)
    api-design         ✓  backend-engineer
    database-schema    ✓  database-engineer
  05-implement  ⟳ (1/4 nodes)
    tdd-implementation ⟳  backend-engineer     ← 当前
    auth-integration   ○  (等待 tdd-implementation)
    security-review    ○  (等待 tdd-implementation)
  06-testing  ○
```

---

## 二、拆分管线

```
管线: 电商系统 (pipeline-ecommerce-001)
状态: in_progress

▸ sub-1: 商品管理         ✓  completed
▸ sub-2: 用户中心         ⟳  in_progress
    04-implement-design  ✓ (2/2 nodes)
    05-implement  ⟳ (1/3 nodes)
      tdd-implementation ⟳  backend-engineer     ← 当前
▸ sub-3: 购物车           ○  pending (等待 sub-1, sub-2)
▸ sub-4: 下单与支付       ○  pending (等待 sub-3, sub-2)
```

---

## 三、状态符号

| 符号 | 含义 |
|------|------|
| `✓` | completed |
| `⟳` | in_progress |
| `○` | pending |
| `✗` | failed |
| `⊘` | aborted |
| `←` 当前 | flow-state.current_pipeline_pointer 指向的节点 |

---

## 相关文档

- [04_state-json.md](04_state-json.md) — 状态字段定义
- [09_tools.md](09_tools.md) — `opc_pipeline_status` 工具
- [opc-status CLI](../../../../platform/opc-orchestrator/bin/opc-status.mjs) — 终端只读快照（同符号集，含 `--json` / `--session <id>` / `--root <path>`）
- [opc-status slash 命令](../../../../platform/opc-orchestrator/commands/opc-status.md) — `/opc-status`（slash 桥接 CLI）
