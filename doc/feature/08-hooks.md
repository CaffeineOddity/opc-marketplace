# Hook 体系

```
entry-gate-check   PreToolUse(Agent)    调度前检查入口条件
exit-gate-check    PostToolUse(Agent)   完成后检查出口条件
knowledge-load     PreToolUse(Agent)    自动加载前置知识
knowledge-save     PostToolUse(Agent)   自动保存产出知识（draft 状态）
stage-transition   Stop                检测完成，提示推进
node-completion    PostToolUse(Agent)   解锁依赖节点
tdd-gate           PreToolUse(Write, "src/**")  RED 阶段放行 / GREEN+REFACTOR 拦截
verification-gate  PreToolUse(Write, "src/**")  强制验证完成
spec-validation    PostToolUse(Write, "specs/**")  自动校验 spec
capability-scan    SessionStart         扫描插件能力
```

## Hook 路径过滤

PreToolUse/PostToolUse hook 支持路径匹配，避免全局拦截：

- `PreToolUse(Write, "src/**")` —— 只拦截源代码目录的写入
- `PreToolUse(Write, "specs/**")` —— 只拦截 spec 文件目录
- 配置文件和日志文件不会被意外拦截

## TDD Gate 的阶段感知

tdd-gate 根据当前 node 执行阶段调整行为：

| TDD 阶段 | Gate 行为 |
|----------|----------|
| RED（写测试） | 放行 `tests/` 目录写入，不要求测试通过 |
| GREEN（写实现） | 要求 `tests/` 目录有修改，且测试通过 |
| REFACTOR（重构） | 放行，但要求已有测试继续通过 |

## knowledge-save 条件触发

并非所有 Agent 调用都触发知识保存。只有被标记为 "production" 级别的 Agent 调用（即 node 中定义的 primary/optional agent）才触发。探索性调用不保存。
