/**
 * M14.c: Walkthrough stage 3 — task_decomposition → brief_generation
 *   → opc_pipeline_create → opc_knowledge_open
 *
 * Continues the auth-feature golden path from M14.b. Since stage 3 starts
 * from `current_step = task_decomposition` we replay stages 1+2 inline
 * (without recording them, to keep the M14.c transcript focused on what
 * this sub-letter actually exercises).
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

async function setupThroughTaskAnalysis(b: Bootstrap): Promise<string> {
  const started = await b.flow.lifecycle({
    action: "start",
    initial_message: "用户认证模块（邮箱密码 + 找回密码）",
  });
  const session_id = started.state.session_id;
  await b.flow.stepComplete({
    step: "intent_analysis",
    session_id,
    intent: "task",
  });
  await b.flow.stepComplete({
    step: "task_analysis",
    session_id,
    analysis_result: {
      description: "用户认证模块",
      tags: ["认证", "前后端"],
      complexity: "medium",
      suggested_phases: ["03-design", "04-implement-design", "05-implement", "06-testing"],
      phase_selection_rationale: "已通过 ideation/validation；本任务从 design 起步。",
      knowledge_unit: ["user-auth"],
      scenario: "greenfield",
    },
  });
  return session_id;
}

describe("walkthrough stage 3 — decomposition + brief + pipeline + knowledge", () => {
  it("decomposes single sub-pipeline, writes brief, creates pipeline, opens knowledge", async () => {
    const session_id = await setupThroughTaskAnalysis(app);

    // 3a: task_decomposition — single sub-pipeline for auth.
    const decomp = await app.recorder.record(
      "opc-state-server",
      "opc_flow_step_complete",
      {
        step: "task_decomposition",
        session_id,
        sub_pipelines: [
          {
            id: "sub-auth",
            description: "邮箱密码注册/登录 + 找回密码",
            phases: ["03-design", "04-implement-design", "05-implement", "06-testing"],
          },
        ],
      },
      () =>
        app.flow.stepComplete({
          step: "task_decomposition",
          session_id,
          sub_pipelines: [
            {
              id: "sub-auth",
              description: "邮箱密码注册/登录 + 找回密码",
              phases: ["03-design", "04-implement-design", "05-implement", "06-testing"],
            },
          ],
        }),
    );
    expect(decomp.state.current_step).toBe("brief_generation");
    expect(decomp.state.accumulated.decomposition_result?.sub_pipelines).toHaveLength(1);
    expect(decomp.next).toEqual({
      tool: "opc_flow_step_complete",
      step: "brief_generation",
    });

    // 3b: brief_generation — concise brief covering scope + acceptance.
    const brief_content =
      "## 范围\n邮箱密码注册 / 登录 / 找回密码；JWT 会话；密码 bcrypt。\n## 验收\n- 注册→登录→受保护接口可访问；- 找回密码 token 24h 失效。";
    const briefDone = await app.recorder.record(
      "opc-state-server",
      "opc_flow_step_complete",
      { step: "brief_generation", session_id, brief_content },
      () =>
        app.flow.stepComplete({
          step: "brief_generation",
          session_id,
          brief_content,
        }),
    );
    expect(briefDone.state.accumulated.brief_content).toBe(brief_content);
    expect(briefDone.state.current_step).toBe("pipeline_execution");
    expect(briefDone.next).toEqual({ tool: "opc_pipeline_create" });

    // 3c: pipeline_create.
    const created = await app.recorder.record(
      "opc-state-server",
      "opc_pipeline_create",
      {
        session_id,
        description: "用户认证模块",
        brief_content,
        complexity: "medium",
        knowledge_unit: ["user-auth"],
        suggested_phases: ["03-design", "04-implement-design", "05-implement", "06-testing"],
        phase_selection_rationale: "design → implement-design → implement → testing 闭环。",
        tags: ["认证"],
        scenario: "greenfield",
      },
      () =>
        app.pipeline.create({
          session_id,
          description: "用户认证模块",
          brief_content,
          complexity: "medium",
          knowledge_unit: ["user-auth"],
          suggested_phases: ["03-design", "04-implement-design", "05-implement", "06-testing"],
          phase_selection_rationale: "design → implement-design → implement → testing 闭环。",
          tags: ["认证"],
          scenario: "greenfield",
        }),
    );
    expect(created.pipeline_id).toMatch(/^pl-id-/);
    expect(created.plan.sub_pipelines).toHaveLength(1);
    expect(created.plan.sub_pipelines[0]?.knowledge_unit).toEqual(["user-auth"]);
    expect(created.plan.status).toBe("in_progress");
    expect(created.flow_next.tool).toBe("opc_phase_start");

    // 3d: knowledge_open — declares the unit so .opc/knowledge/units/user-auth
    // tree is materialized (empty), refs returned for related units (none yet).
    const opened = await app.recorder.record(
      "opc-knowledge-server",
      "opc_knowledge_open",
      { units: ["user-auth"] },
      () => app.knowledge.open({ units: ["user-auth"] }),
    );
    expect(opened.units).toHaveProperty("user-auth");
    expect(opened.related).toEqual([]);

    const calls = app.recorder.freeze();
    expect(calls.map((c) => c.tool)).toEqual([
      "opc_flow_step_complete",
      "opc_flow_step_complete",
      "opc_pipeline_create",
      "opc_knowledge_open",
    ]);
    expect(calls.every((c) => !c.error)).toBe(true);
  });

  it("pipeline_create transitions flow.current_step from pipeline_execution and stamps owner pid", async () => {
    const session_id = await setupThroughTaskAnalysis(app);
    await app.flow.stepComplete({
      step: "task_decomposition",
      session_id,
      sub_pipelines: [{ id: "sub-auth", description: "auth", phases: ["05-implement"] }],
    });
    await app.flow.stepComplete({
      step: "brief_generation",
      session_id,
      brief_content: "brief",
    });
    const created = await app.pipeline.create({
      session_id,
      description: "auth",
      brief_content: "brief",
      complexity: "medium",
      knowledge_unit: ["user-auth"],
      suggested_phases: ["05-implement"],
      phase_selection_rationale: "implement only",
    });
    expect(created.plan.owner.pid).toBe(app.pid);
    expect(created.plan.owner.session_id).toBe(session_id);
  });
});
