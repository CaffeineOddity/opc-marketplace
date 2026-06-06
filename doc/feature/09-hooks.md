# Hook 体系

```
knowledge-load     PreToolUse(Agent)    自动加载前置知识
phase-transition   Stop                检测完成，提示推进
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

## knowledge-load Hook

知识加载由 hook 自动触发，在 Agent 开始执行前，读取 node 的 `input.knowledge` 列表，通过 MCP 工具逐条读取知识内容，注入 Agent 上下文。

知识写入不再通过 hook 自动保存，而是由 Agent 在 node 执行中通过 MCP 工具显式调用。
