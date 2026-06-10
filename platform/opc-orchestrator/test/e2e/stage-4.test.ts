/**
 * M14.d: Walkthrough stage 4 — phase 04-implement-design.
 *
 * Runs two nodes (api-design then database-schema) on the auth-feature
 * pipeline created in stages 1-3:
 *  - opc_phase_start({phase: "04-implement-design"})
 *  - opc_node_start(api-design) → opc_knowledge_write(api-spec) → opc_node_complete
 *  - opc_node_start(database-schema) → opc_knowledge_write(schema) → opc_node_complete
 *  - opc_phase_complete (gated by all nodes done)
 *
 * Validates phase pointer, node L1 quality gates (declared knowledge present
 * in evidence.knowledge_written), and the auto-advance/flow_next signal
 * pointing to the next phase 05-implement.
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

const SUGGESTED_PHASES = ["04-implement-design", "05-implement", "06-testing"];

async function setupThroughPipelineCreate(
  b: Bootstrap,
): Promise<{ session_id: string; pipeline_id: string; sub_pipeline_id: string }> {
  const started = await b.flow.lifecycle({
    action: "start",
    initial_message: "用户认证模块（continuing M14.d）",
  });
  const session_id = started.state.session_id;
  await b.flow.stepComplete({ step: "intent_analysis", session_id, intent: "task" });
  await b.flow.stepComplete({
    step: "task_analysis",
    session_id,
    analysis_result: {
      description: "用户认证",
      complexity: "medium",
      suggested_phases: SUGGESTED_PHASES,
      knowledge_unit: ["user-auth"],
      scenario: "greenfield",
    },
  });
  await b.flow.stepComplete({
    step: "task_decomposition",
    session_id,
    sub_pipelines: [
      { id: "sub-auth", description: "auth", phases: SUGGESTED_PHASES },
    ],
  });
  await b.flow.stepComplete({
    step: "brief_generation",
    session_id,
    brief_content: "brief",
  });
  const created = await b.pipeline.create({
    session_id,
    description: "用户认证",
    brief_content: "brief",
    complexity: "medium",
    knowledge_unit: ["user-auth"],
    suggested_phases: SUGGESTED_PHASES,
    phase_selection_rationale: "design → implement → testing 闭环",
    sub_pipelines: [
      {
        id: "sub-auth",
        title: "auth sub-pipeline",
        knowledge_unit: ["user-auth"],
        suggested_phases: SUGGESTED_PHASES,
      },
    ],
  });
  return {
    session_id,
    pipeline_id: created.pipeline_id,
    sub_pipeline_id: "sub-auth",
  };
}

describe("walkthrough stage 4 — phase 04-implement-design", () => {
  it("starts phase, runs api-design + database-schema nodes, completes phase, auto-advances to 05", async () => {
    const { session_id, pipeline_id, sub_pipeline_id } =
      await setupThroughPipelineCreate(app);

    // 4a: phase_start.
    const phaseStarted = await app.recorder.record(
      "opc-state-server",
      "opc_phase_start",
      { session_id, pipeline_id, sub_pipeline_id, phase: "04-implement-design" },
      () =>
        app.phase.start({
          session_id,
          pipeline_id,
          sub_pipeline_id,
          phase: "04-implement-design",
        }),
    );
    expect(phaseStarted.status).toBe("in_progress");
    expect(phaseStarted.phase).toBe("04-implement-design");

    // 4b: node_start (api-design) — provide node_definition so it materializes.
    const apiSpecPath = "user-auth/api/api-spec";
    const apiNodeStarted = await app.recorder.record(
      "opc-state-server",
      "opc_node_start",
      {
        session_id,
        pipeline_id,
        sub_pipeline_id,
        phase: "04-implement-design",
        node_name: "api-design",
      },
      () =>
        app.node.start({
          session_id,
          pipeline_id,
          sub_pipeline_id,
          phase: "04-implement-design",
          node_name: "api-design",
          node_definition: {
            name: "api-design",
            phase: "04-implement-design",
            description: "RESTful endpoint contract for auth",
            tags: ["api", "backend"],
            mode: "sequential",
            agents: { primary: ["backend-engineer"] },
            output: [{ artifacts: [], knowledge: apiSpecPath }],
          },
        }),
    );
    expect(apiNodeStarted.status).toBe("in_progress");
    expect(apiNodeStarted.agent).toBe("backend-engineer");
    expect(apiNodeStarted.dispatch_instruction.subagent_type).toBe("backend-engineer");
    expect(apiNodeStarted.flow_next.tool).toBe("opc_node_complete");

    // Simulate the sub-agent writing knowledge.
    const apiWrite = await app.recorder.record(
      "opc-knowledge-server",
      "opc_knowledge_write",
      { unit: "user-auth", section: "api", sub: "api-spec", content: "POST /auth/register …" },
      () =>
        app.knowledge.write({
          unit: "user-auth",
          section: "api",
          sub: "api-spec",
          content:
            "# Auth API\n\n## POST /auth/register\n\n请求: {email, password}; 响应 201: {user_id}",
        }),
    );
    expect(apiWrite.written).toBe(true);
    expect(apiWrite.version).toBe(1);

    // 4c: node_complete with L1 evidence — knowledge_written must include the declared path.
    const apiNodeDone = await app.recorder.record(
      "opc-state-server",
      "opc_node_complete",
      {
        session_id,
        pipeline_id,
        sub_pipeline_id,
        phase: "04-implement-design",
        node_name: "api-design",
      },
      () =>
        app.node.complete({
          session_id,
          pipeline_id,
          sub_pipeline_id,
          phase: "04-implement-design",
          node_name: "api-design",
          evidence: {
            knowledge_written: [{ path: apiSpecPath, version: apiWrite.version }],
          },
        }),
    );
    expect(apiNodeDone.status).toBe("completed");
    // Only api-design has been materialized so far (database-schema is added
    // dynamically on its node_start), so this looks like an all-done phase
    // until the next node_start adds the second node. flow_next therefore
    // points to opc_phase_complete; the test continues by starting the next
    // node, which puts the phase back into a not-yet-done state.
    expect(apiNodeDone.flow_next.tool).toBe("opc_phase_complete");

    // 4d: node_start (database-schema).
    const schemaPath = "user-auth/db/schema";
    await app.recorder.record(
      "opc-state-server",
      "opc_node_start",
      {
        session_id,
        pipeline_id,
        sub_pipeline_id,
        phase: "04-implement-design",
        node_name: "database-schema",
      },
      () =>
        app.node.start({
          session_id,
          pipeline_id,
          sub_pipeline_id,
          phase: "04-implement-design",
          node_name: "database-schema",
          node_definition: {
            name: "database-schema",
            phase: "04-implement-design",
            description: "Tables and indexes for auth",
            tags: ["db", "backend"],
            mode: "sequential",
            agents: { primary: ["database-administrator"] },
            output: [{ artifacts: [], knowledge: schemaPath }],
          },
        }),
    );
    const schemaWrite = await app.recorder.record(
      "opc-knowledge-server",
      "opc_knowledge_write",
      { unit: "user-auth", section: "db", sub: "schema", content: "users(id, email, …)" },
      () =>
        app.knowledge.write({
          unit: "user-auth",
          section: "db",
          sub: "schema",
          content: "## users\n- id PK\n- email UNIQUE\n- password_hash\n- created_at",
        }),
    );

    // 4e: node_complete database-schema — phase should now be all-done.
    const schemaDone = await app.recorder.record(
      "opc-state-server",
      "opc_node_complete",
      {
        session_id,
        pipeline_id,
        sub_pipeline_id,
        phase: "04-implement-design",
        node_name: "database-schema",
      },
      () =>
        app.node.complete({
          session_id,
          pipeline_id,
          sub_pipeline_id,
          phase: "04-implement-design",
          node_name: "database-schema",
          evidence: {
            knowledge_written: [{ path: schemaPath, version: schemaWrite.version }],
          },
        }),
    );
    expect(schemaDone.flow_next.tool).toBe("opc_phase_complete");

    // 4f: phase_complete — auto_advance to 05-implement (complexity=medium, last node done).
    const phaseDone = await app.recorder.record(
      "opc-state-server",
      "opc_phase_complete",
      { session_id, pipeline_id, sub_pipeline_id, phase: "04-implement-design" },
      () =>
        app.phase.complete({
          session_id,
          pipeline_id,
          sub_pipeline_id,
          phase: "04-implement-design",
        }),
    );
    expect(phaseDone.status).toBe("completed");
    expect(phaseDone.next_phase).toBe("05-implement");
    expect(phaseDone.auto_advance).toBe(true);
    expect(phaseDone.flow_next.tool).toBe("opc_phase_start");
    expect(phaseDone.flow_next.args?.phase).toBe("05-implement");

    const calls = app.recorder.freeze();
    expect(calls.every((c) => !c.error)).toBe(true);
    expect(calls.map((c) => c.tool)).toEqual([
      "opc_phase_start",
      "opc_node_start",
      "opc_knowledge_write",
      "opc_node_complete",
      "opc_node_start",
      "opc_knowledge_write",
      "opc_node_complete",
      "opc_phase_complete",
    ]);
  });

  it("L1 quality gate rejects node_complete when declared knowledge missing from evidence", async () => {
    const { session_id, pipeline_id, sub_pipeline_id } =
      await setupThroughPipelineCreate(app);
    await app.phase.start({
      session_id,
      pipeline_id,
      sub_pipeline_id,
      phase: "04-implement-design",
    });
    await app.node.start({
      session_id,
      pipeline_id,
      sub_pipeline_id,
      phase: "04-implement-design",
      node_name: "api-design",
      node_definition: {
        name: "api-design",
        phase: "04-implement-design",
        description: "x",
        tags: [],
        mode: "sequential",
        agents: { primary: ["backend-engineer"] },
        output: [{ artifacts: [], knowledge: "user-auth/api/api-spec" }],
      },
    });
    // No evidence.knowledge_written → L1 must reject.
    await expect(
      app.node.complete({
        session_id,
        pipeline_id,
        sub_pipeline_id,
        phase: "04-implement-design",
        node_name: "api-design",
        evidence: {},
      }),
    ).rejects.toThrow(/L1: declared output\.knowledge user-auth\/api\/api-spec/);
  });
});
