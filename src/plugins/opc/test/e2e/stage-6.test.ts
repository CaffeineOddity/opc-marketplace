/**
 * M14.f: Walkthrough stage 6 — phase 06-testing (integration-test).
 *
 * Runs the final phase of the auth pipeline:
 *  - opc_phase_start(06-testing)
 *  - opc_node_start(integration-test, quality_gates=[test_pass])
 *  - opc_knowledge_write(user-auth/integration/test-report)
 *  - opc_node_complete with evidence.test_results.{passed:N, failed:0}
 *  - opc_phase_complete → next_phase=null + flow_next=opc_pipeline_complete
 *
 * Asserts that 06-testing as the LAST phase in the selected plan flips
 * isLastPhase=true → pipeline/sub_pipeline status=completed, and that
 * flow_next correctly points to opc_pipeline_complete (no auto_advance to
 * a non-existent next phase).
 *
 * The integration-test node's "no_mock_db" doctrine is enforced at the
 * agent prompt level (src/plugins/official-kits/agents/qa/test-automator.md) rather than
 * the L2 gate layer; here we exercise the supported test_pass gate which
 * is what the state-server actually validates.
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

const SUGGESTED_PHASES = ["06-testing"];

async function setupAtPhase06(b: Bootstrap): Promise<{
  session_id: string;
  pipeline_id: string;
  sub_pipeline_id: string;
}> {
  const started = await b.flow.lifecycle({
    action: "start",
    initial_message: "用户认证模块测试阶段（continuing M14.f）",
  });
  const session_id = started.state.session_id;
  await b.flow.stepComplete({ step: "intent_analysis", session_id, intent: "task" });
  await b.flow.stepComplete({
    step: "task_analysis",
    session_id,
    analysis_result: {
      description: "auth testing only",
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
      { id: "sub-auth", description: "auth testing", phases: SUGGESTED_PHASES },
    ],
  });
  await b.flow.stepComplete({
    step: "brief_generation",
    session_id,
    brief_content: "integration tests for auth",
  });
  const created = await b.pipeline.create({
    session_id,
    description: "auth testing",
    brief_content: "integration tests for auth",
    complexity: "medium",
    knowledge_unit: ["user-auth"],
    suggested_phases: SUGGESTED_PHASES,
    phase_selection_rationale: "testing-only sub-letter for stage-6",
    sub_pipelines: [
      {
        id: "sub-auth",
        title: "auth testing sub",
        knowledge_unit: ["user-auth"],
        suggested_phases: SUGGESTED_PHASES,
      },
    ],
  });
  return { session_id, pipeline_id: created.pipeline_id, sub_pipeline_id: "sub-auth" };
}

describe("walkthrough stage 6 — phase 06-testing", () => {
  it("runs integration-test node, completes phase as last → flow_next=opc_pipeline_complete", async () => {
    const { session_id, pipeline_id, sub_pipeline_id } = await setupAtPhase06(app);

    // 6a: phase_start.
    const phaseStarted = await app.recorder.record(
      "opc-state-server",
      "opc_phase_start",
      { session_id, pipeline_id, sub_pipeline_id, phase: "06-testing" },
      () =>
        app.phase.start({
          session_id,
          pipeline_id,
          sub_pipeline_id,
          phase: "06-testing",
        }),
    );
    expect(phaseStarted.status).toBe("in_progress");
    expect(phaseStarted.phase).toBe("06-testing");

    // 6b: node_start integration-test with quality_gates=[test_pass].
    const testReportPath = "user-auth/integration/test-report";
    const nodeStarted = await app.recorder.record(
      "opc-state-server",
      "opc_node_start",
      {
        session_id,
        pipeline_id,
        sub_pipeline_id,
        phase: "06-testing",
        node_name: "integration-test",
      },
      () =>
        app.node.start({
          session_id,
          pipeline_id,
          sub_pipeline_id,
          phase: "06-testing",
          node_name: "integration-test",
          node_definition: {
            name: "integration-test",
            phase: "06-testing",
            description: "Integration + E2E tests for auth flow (register→login→session→logout)",
            tags: ["backend", "fullstack"],
            mode: "sequential",
            agents: { primary: ["test-automator"] },
            quality_gates: ["test_pass"],
            output: [{ artifacts: [], knowledge: testReportPath }],
          },
        }),
    );
    expect(nodeStarted.status).toBe("in_progress");
    expect(nodeStarted.agent).toBe("test-automator");
    expect(nodeStarted.dispatch_instruction.subagent_type).toBe("test-automator");

    // 6c: knowledge_write — test-report records pass count + coverage + no-mock-db note.
    const reportWrite = await app.recorder.record(
      "opc-knowledge-server",
      "opc_knowledge_write",
      {
        unit: "user-auth",
        section: "integration",
        sub: "test-report",
        content: "test-report summary",
      },
      () =>
        app.knowledge.write({
          unit: "user-auth",
          section: "integration",
          sub: "test-report",
          content:
            "## Integration Test Report\n\n" +
            "- 集成测试: 24 passed / 0 failed\n" +
            "- E2E 测试: 注册→登录→受保护接口→登出 全绿\n" +
            "- 覆盖率: lines=82%, branches=74% (≥ PRD 70% 阈值)\n" +
            "- 数据库: 真实 PostgreSQL 容器（no mocks per qa doctrine）\n" +
            "- 性能样本: p50=12ms, p95=38ms (login endpoint)",
        }),
    );
    expect(reportWrite.written).toBe(true);
    expect(reportWrite.version).toBe(1);

    // 6d: node_complete — L1 (knowledge_written) + L2 (test_pass) satisfied.
    const nodeDone = await app.recorder.record(
      "opc-state-server",
      "opc_node_complete",
      {
        session_id,
        pipeline_id,
        sub_pipeline_id,
        phase: "06-testing",
        node_name: "integration-test",
      },
      () =>
        app.node.complete({
          session_id,
          pipeline_id,
          sub_pipeline_id,
          phase: "06-testing",
          node_name: "integration-test",
          evidence: {
            test_results: { passed: 24, failed: 0 },
            knowledge_written: [{ path: testReportPath, version: reportWrite.version }],
          },
        }),
    );
    expect(nodeDone.status).toBe("completed");
    expect(nodeDone.flow_next.tool).toBe("opc_phase_complete");

    // 6e: phase_complete — 06-testing is the LAST phase → next_phase=null,
    //     auto_advance=false (no next), flow_next=opc_pipeline_complete.
    const phaseDone = await app.recorder.record(
      "opc-state-server",
      "opc_phase_complete",
      { session_id, pipeline_id, sub_pipeline_id, phase: "06-testing" },
      () =>
        app.phase.complete({
          session_id,
          pipeline_id,
          sub_pipeline_id,
          phase: "06-testing",
        }),
    );
    expect(phaseDone.status).toBe("completed");
    expect(phaseDone.next_phase).toBe(null);
    expect(phaseDone.auto_advance).toBe(false);
    expect(phaseDone.flow_next.tool).toBe("opc_pipeline_lifecycle");
    expect(phaseDone.flow_next.args?.action).toBe("complete");
    expect(phaseDone.flow_next.args?.pipeline_id).toBe(pipeline_id);

    const calls = app.recorder.freeze();
    expect(calls.every((c) => !c.error)).toBe(true);
    expect(calls.map((c) => c.tool)).toEqual([
      "opc_phase_start",
      "opc_node_start",
      "opc_knowledge_write",
      "opc_node_complete",
      "opc_phase_complete",
    ]);
  });

  it("L2 test_pass gate rejects integration-test when failed != 0", async () => {
    const { session_id, pipeline_id, sub_pipeline_id } = await setupAtPhase06(app);
    await app.phase.start({
      session_id,
      pipeline_id,
      sub_pipeline_id,
      phase: "06-testing",
    });
    const testReportPath = "user-auth/integration/test-report";
    await app.node.start({
      session_id,
      pipeline_id,
      sub_pipeline_id,
      phase: "06-testing",
      node_name: "integration-test",
      node_definition: {
        name: "integration-test",
        phase: "06-testing",
        description: "x",
        tags: [],
        mode: "sequential",
        agents: { primary: ["test-automator"] },
        quality_gates: ["test_pass"],
        output: [{ artifacts: [], knowledge: testReportPath }],
      },
    });
    const w = await app.knowledge.write({
      unit: "user-auth",
      section: "integration",
      sub: "test-report",
      content: "x",
    });
    await expect(
      app.node.complete({
        session_id,
        pipeline_id,
        sub_pipeline_id,
        phase: "06-testing",
        node_name: "integration-test",
        evidence: {
          test_results: { passed: 18, failed: 3 },
          knowledge_written: [{ path: testReportPath, version: w.version }],
        },
      }),
    ).rejects.toThrow(/L2: test_pass not satisfied/);
  });
});
