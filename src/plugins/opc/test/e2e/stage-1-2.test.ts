/**
 * M14.b: Walkthrough stages 1 + 2 on the auth-feature golden path.
 *
 * Stage 1 — Hook + flow lifecycle start.
 * Stage 2 — intent_analysis → task_analysis with knowledge_unit=[user-auth],
 *   complexity=medium, scenario=greenfield.
 *
 * Assertions match doc/feature/04-e2e/01-walkthrough/02_stage1_hook_state.md
 * and 03_stage2_intent_task_analysis.md so the recorder transcript can be
 * frozen as fixtures/walkthrough-auth.jsonl in M14.g.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { bootstrap, type Bootstrap } from "./harness.js";

let app: Bootstrap;

beforeEach(async () => {
  app = await bootstrap();
});

afterEach(async () => {
  await app.cleanup();
});

describe("walkthrough stage 1+2 — auth feature", () => {
  it("starts a session, declares task intent, completes task_analysis", async () => {
    // Stage 1: hook fires → flow_lifecycle(start) with the user's initial
    // message describing the auth feature.
    const initial_message =
      "我想给项目加上用户认证：邮箱+密码注册/登录，含找回密码。前端用 React，后端 Node/TS。";
    const started = await app.recorder.record(
      "opc-state-server",
      "opc_flow_lifecycle",
      { action: "start", initial_message },
      () => app.flow.lifecycle({ action: "start", initial_message }),
    );
    expect(started.state.status).toBe("in_progress");
    expect(started.state.current_step).toBe("intent_analysis");
    expect(started.state.owner.pid).toBe(app.pid);
    expect(started.state.user_message_history).toEqual([initial_message]);
    expect(started.next).toEqual({
      tool: "opc_flow_step_complete",
      step: "intent_analysis",
    });

    const session_id = started.state.session_id;

    // Stage 2a: classify intent as "task" (auth feature is a build request).
    const intentDone = await app.recorder.record(
      "opc-state-server",
      "opc_flow_step_complete",
      {
        step: "intent_analysis",
        session_id,
        intent: "task",
        reasoning: "用户提出明确的功能开发请求（用户认证模块），属 task 意图。",
      },
      () =>
        app.flow.stepComplete({
          step: "intent_analysis",
          session_id,
          intent: "task",
          reasoning: "用户提出明确的功能开发请求（用户认证模块），属 task 意图。",
        }),
    );
    expect(intentDone.state.accumulated.intent).toBe("task");
    expect(intentDone.state.current_step).toBe("task_analysis");
    expect(intentDone.next).toEqual({
      tool: "opc_flow_step_complete",
      step: "task_analysis",
    });

    // Stage 2b: task_analysis — single sub-pipeline, greenfield, medium.
    const analysis_result = {
      description: "用户认证模块（邮箱密码 + 找回密码）端到端实现",
      tags: ["认证", "前后端", "邮箱密码", "找回密码"],
      complexity: "medium" as const,
      suggested_phases: [
        "00-ideation",
        "01-validation",
        "03-design",
        "04-implement-design",
        "05-implement",
        "06-testing",
        "07-release",
      ],
      phase_selection_rationale:
        "greenfield 新建模块需走完整流程；growth/scale 暂不需要。",
      knowledge_unit: ["user-auth"],
      scenario: "greenfield",
      knowledge_plan: [
        { path: ".opc/knowledge/units/user-auth/ideation/scope.md", operation: "write" },
        { path: ".opc/knowledge/units/user-auth/validation/feasibility.md", operation: "write" },
        { path: ".opc/knowledge/units/user-auth/design/api-spec.md", operation: "write" },
      ],
    };
    const taskDone = await app.recorder.record(
      "opc-state-server",
      "opc_flow_step_complete",
      { step: "task_analysis", session_id, analysis_result },
      () =>
        app.flow.stepComplete({
          step: "task_analysis",
          session_id,
          analysis_result,
        }),
    );
    expect(taskDone.state.accumulated.analysis_result).toEqual(analysis_result);
    expect(taskDone.state.current_step).toBe("task_decomposition");
    expect(taskDone.next).toEqual({
      tool: "opc_flow_step_complete",
      step: "task_decomposition",
    });

    // Recorder transcript: 3 calls (start + 2 step_complete), no errors.
    const calls = app.recorder.freeze();
    expect(calls).toHaveLength(3);
    expect(calls.map((c) => c.tool)).toEqual([
      "opc_flow_lifecycle",
      "opc_flow_step_complete",
      "opc_flow_step_complete",
    ]);
    expect(calls.every((c) => !c.error)).toBe(true);
  });

  it("project_question intent short-circuits without entering task_analysis", async () => {
    const started = await app.flow.lifecycle({
      action: "start",
      initial_message: "我们项目用的什么 ORM？",
    });
    const session_id = started.state.session_id;

    const done = await app.flow.stepComplete({
      step: "intent_analysis",
      session_id,
      intent: "project_question",
      reasoning: "纯查询型问题，无修改意图。",
    });
    expect(done.state.status).toBe("completed");
    expect(done.state.current_step).toBe("completed");
    expect(done.next).toEqual({ tool: "completed" });
  });
});
