/**
 * M15.c: Scenario 03 — low-complexity quick dispatch.
 *
 * Doc: doc/feature/04-e2e/02-test/03_low-complexity.md
 * Input: "修复登录页按钮颜色不对"
 *
 * 6 calls:
 *  1. opc_flow_lifecycle({action:"start"})
 *  2. opc_flow_query (active=true)
 *  3. opc_flow_step_complete({step:"intent_analysis", intent:"task"})
 *  4. opc_knowledge_read({mode:"list"}) — sub-agent lookup (precursor to task_analysis)
 *  5. opc_flow_step_complete({step:"task_analysis", complexity:"low"})
 *  6. opc_flow_quick_dispatch — flow auto-completes
 *
 * The actual quick-dispatch impl is minimal (sets intent + status=completed);
 * the doc's richer return shape (agent_hint / knowledge_context /
 * dispatch_context) is an M19 orchestrator concern. This test asserts the
 * server-side contract and call sequence.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { bootstrap, type Bootstrap } from "./harness.js";

let app: Bootstrap;

beforeEach(async () => {
  app = await bootstrap();
  // Seed minimal user-auth knowledge so list-mode read returns something.
  await app.knowledge.write({
    unit: "user-auth",
    section: "login",
    sub: "ui",
    content: "## Login UI\n- 邮箱输入框\n- 密码输入框\n- 主按钮（color: primary）",
  });
});

afterEach(async () => {
  await app.cleanup();
});

describe("scenario 03 — low complexity quick dispatch", () => {
  it("task with complexity=low routes to opc_quick_dispatch and auto-completes", async () => {
    // 1: lifecycle.start
    const started = await app.recorder.record(
      "opc-state-server",
      "opc_flow_lifecycle",
      { action: "start", initial_message: "修复登录页按钮颜色不对" },
      () => app.flow.lifecycle({ action: "start", initial_message: "修复登录页按钮颜色不对" }),
    );
    const session_id = started.state.session_id;

    // 2: query
    await app.recorder.record(
      "opc-state-server",
      "opc_flow_query",
      { session_id },
      () => app.flow.query({ session_id }),
    );

    // 3: intent_analysis(task)
    const intentDone = await app.recorder.record(
      "opc-state-server",
      "opc_flow_step_complete",
      { step: "intent_analysis", session_id, intent: "task" },
      () =>
        app.flow.stepComplete({
          step: "intent_analysis",
          session_id,
          intent: "task",
          reasoning: "动作动词'修复'+ 具体缺陷描述",
        }),
    );
    expect(intentDone.state.current_step).toBe("task_analysis");

    // 4: knowledge_read(list) — sub-agent gathering scope
    const list = await app.recorder.record(
      "opc-knowledge-server",
      "opc_knowledge_read",
      { mode: "list", unit: "user-auth" },
      () => app.knowledge.read({ mode: "list", unit: "user-auth" }),
    );
    if (list.mode !== "list") throw new Error("expected list response");
    expect(list.items.length).toBeGreaterThan(0);

    // 5: task_analysis(complexity:"low")
    const taskDone = await app.recorder.record(
      "opc-state-server",
      "opc_flow_step_complete",
      {
        step: "task_analysis",
        session_id,
        analysis_result: {
          description: "登录页主按钮颜色修正",
          complexity: "low",
          tags: ["frontend", "ui-fix"],
          knowledge_unit: ["user-auth"],
          suggested_phases: [],
          phase_selection_rationale: "low complexity 走快速通道，无需 phase 拓扑",
          scenario: "fix-bug",
        },
      },
      () =>
        app.flow.stepComplete({
          step: "task_analysis",
          session_id,
          analysis_result: {
            description: "登录页主按钮颜色修正",
            complexity: "low",
            tags: ["frontend", "ui-fix"],
            knowledge_unit: ["user-auth"],
            suggested_phases: [],
            phase_selection_rationale: "low complexity 走快速通道，无需 phase 拓扑",
            scenario: "fix-bug",
          },
        }),
    );
    // After task_analysis, flow moves to task_decomposition state — but for
    // complexity=low the orchestrator is expected to skip decomposition and
    // call quick_dispatch directly. quick_dispatch.assertOpen accepts any
    // non-terminal status so it's callable from current_step=task_decomposition.
    expect(taskDone.state.accumulated.analysis_result?.complexity).toBe("low");

    // 6: quick_dispatch
    const dispatched = await app.recorder.record(
      "opc-state-server",
      "opc_flow_quick_dispatch",
      { session_id, intent: "task", note: "fix login button color" },
      () => app.flow.quickDispatch({ session_id, intent: "task", note: "fix login button color" }),
    );
    expect(dispatched.state.status).toBe("completed");
    expect(dispatched.state.current_step).toBe("completed");
    expect(dispatched.state.completed_at).not.toBeNull();
    expect(dispatched.next).toEqual({ tool: "completed" });

    const calls = app.recorder.freeze();
    expect(calls.map((c) => `${c.server}:${c.tool}`)).toEqual([
      "opc-state-server:opc_flow_lifecycle",
      "opc-state-server:opc_flow_query",
      "opc-state-server:opc_flow_step_complete",
      "opc-knowledge-server:opc_knowledge_read",
      "opc-state-server:opc_flow_step_complete",
      "opc-state-server:opc_flow_quick_dispatch",
    ]);
    expect(calls.every((c) => !c.error)).toBe(true);
  });
});
