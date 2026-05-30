# 知识体系

## Marketplace 与项目分离

- Marketplace 只提供 platform + kits。不含项目数据。
- 用户运行 `claude` 的目录就是项目根目录。OPC 在此创建 `.opc/`、`opc-knowledge/`、`opc-memory/`、`opc-deliverables/`。
- 知识库和记忆属于项目，切换目录 = 切换知识上下文。

## 三层知识体系

| 层 | 位置 | 性质 | 类比 |
|---|------|------|------|
| knowledge | kit 内 | 静态领域知识，随 kit 分发 | 教科书 |
| opc-knowledge | 项目内 | 阶段知识积累，随阶段推进写入 | 课堂笔记 |
| opc-memory | 项目内 | 跨任务持久记忆，缓慢演进 | 个人心得 |

## 知识状态

每条 opc-knowledge 条目有 `draft` / `final` 两种状态：

| 状态 | 含义 | 后续 node 可否加载 |
|------|------|-------------------|
| `draft` | 刚写入，未经验证 | 可加载但需注明 "未验证" |
| `final` | 已由用户确认 | 正常加载 |

knowledge-save hook 写入的知识默认为 `draft`，需通过用户手动确认变为 `final`（`/opc-status` 中标记为 "已确认"）。

## 知识版本

知识条目支持简单版本号（`v1`, `v2`, ...），每次新增写入自动递增。node 的 `input.knowledge` 可指定版本范围：

```yaml
input:
  - knowledge: requirement/main
    min_version: 2  # 至少 v2
```

## opc-memory 演进机制

- opc-memory 中的文件由用户手动维护（或由 `/opc-memory` 命令管理）
- 不在 knowledge-save hook 的自动写入范围内
- 适合架构决策、编码规范、API 契约等缓慢变化的内容
