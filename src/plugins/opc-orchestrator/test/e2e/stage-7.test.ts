/**
 * M14.g: Walkthrough stage 7 — full chain end-to-end + fixture freeze.
 *
 * This is the cumulative test for the auth golden path. It runs stages
 * 1→6 in a single test, recording every MCP-equivalent call into the
 * recorder, then:
 *  - asserts pipeline / sub_pipeline status = completed via
 *    opc_pipeline_status (no separate opc_pipeline_complete tool exists
 *    in the state-server — the pipeline aggregates from sub completion
 *    which the last phase_complete on the last phase already triggers)
 *  - asserts the knowledge tree contains all expected artifacts written
 *    across phases 04 / 05 / 06
 *  - writes fixtures/walkthrough-auth.jsonl with the frozen tool-call
 *    transcript and asserts the file matches the expected total
 *
 * The fixture is what M19 (marketplace + CLI) will load to replay the
 * canonical walkthrough; M14.h does an audit pass over it.
 */

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { bootstrap, type Bootstrap } from "./harness.js";

let app: Bootstrap;

beforeEach(async () => {
  app = await bootstrap();
});

afterEach(async () => {
  await app.cleanup();
});

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const FIXTURE_PATH = join(FIXTURE_DIR, "walkthrough-auth.jsonl");

const FULL_SUGGESTED_PHASES = [
  "04-implement-design",
  "05-implement",
  "06-testing",
];

describe("walkthrough stage 7 — full chain + fixture freeze", () => {
  it("runs stages 1-6 end-to-end, asserts pipeline completed, freezes fixture", async () => {
    // ── Stage 1: lifecycle start ──────────────────────────────────────────
    const initial_message = "用户认证模块（M14.g full chain）";
    const started = await app.recorder.record(
      "opc-state-server",
      "opc_flow_lifecycle",
      { action: "start", initial_message },
      () => app.flow.lifecycle({ action: "start", initial_message }),
    );
    const session_id = started.state.session_id;

    // ── Stage 2: intent + task_analysis ────────────────────────────────────
    await app.recorder.record(
      "opc-state-server",
      "opc_flow_step_complete",
      { step: "intent_analysis", session_id, intent: "task" },
      () => app.flow.stepComplete({ step: "intent_analysis", session_id, intent: "task" }),
    );
    const analysis_result = {
      description: "用户认证模块（邮箱密码 + 找回密码）端到端实现",
      tags: ["认证", "前后端"],
      complexity: "medium" as const,
      suggested_phases: FULL_SUGGESTED_PHASES,
      phase_selection_rationale: "greenfield 走 design→implement→testing 闭环",
      knowledge_unit: ["user-auth"],
      scenario: "greenfield",
    };
    await app.recorder.record(
      "opc-state-server",
      "opc_flow_step_complete",
      { step: "task_analysis", session_id, analysis_result },
      () => app.flow.stepComplete({ step: "task_analysis", session_id, analysis_result }),
    );

    // ── Stage 3: decomposition + brief + create + open ─────────────────────
    await app.recorder.record(
      "opc-state-server",
      "opc_flow_step_complete",
      {
        step: "task_decomposition",
        session_id,
        sub_pipelines: [
          { id: "sub-auth", description: "auth full chain", phases: FULL_SUGGESTED_PHASES },
        ],
      },
      () =>
        app.flow.stepComplete({
          step: "task_decomposition",
          session_id,
          sub_pipelines: [
            { id: "sub-auth", description: "auth full chain", phases: FULL_SUGGESTED_PHASES },
          ],
        }),
    );
    const brief_content =
      "## 范围\n邮箱密码注册/登录/找回密码 + JWT 会话 + bcrypt 密码哈希。\n## 验收\n- 注册→登录→受保护接口→登出 全绿\n- 集成测试 ≥ 70% 行覆盖";
    await app.recorder.record(
      "opc-state-server",
      "opc_flow_step_complete",
      { step: "brief_generation", session_id, brief_content },
      () => app.flow.stepComplete({ step: "brief_generation", session_id, brief_content }),
    );
    const created = await app.recorder.record(
      "opc-state-server",
      "opc_pipeline_create",
      {
        session_id,
        description: "用户认证模块",
        brief_content,
        complexity: "medium",
        knowledge_unit: ["user-auth"],
        suggested_phases: FULL_SUGGESTED_PHASES,
        phase_selection_rationale: "design → implement → testing 闭环",
      },
      () =>
        app.pipeline.create({
          session_id,
          description: "用户认证模块",
          brief_content,
          complexity: "medium",
          knowledge_unit: ["user-auth"],
          suggested_phases: FULL_SUGGESTED_PHASES,
          phase_selection_rationale: "design → implement → testing 闭环",
          sub_pipelines: [
            {
              id: "sub-auth",
              title: "auth sub-pipeline",
              knowledge_unit: ["user-auth"],
              suggested_phases: FULL_SUGGESTED_PHASES,
            },
          ],
        }),
    );
    const pipeline_id = created.pipeline_id;
    const sub_pipeline_id = "sub-auth";
    await app.recorder.record(
      "opc-knowledge-server",
      "opc_knowledge_open",
      { units: ["user-auth"] },
      () => app.knowledge.open({ units: ["user-auth"] }),
    );

    // ── Stage 4: phase 04-implement-design (api-design + database-schema) ──
    await app.recorder.record(
      "opc-state-server",
      "opc_phase_start",
      { session_id, pipeline_id, sub_pipeline_id, phase: "04-implement-design" },
      () =>
        app.phase.start({
          session_id, pipeline_id, sub_pipeline_id, phase: "04-implement-design",
        }),
    );
    const apiPath = "user-auth/api/api-spec";
    await app.recorder.record(
      "opc-state-server",
      "opc_node_start",
      { session_id, pipeline_id, sub_pipeline_id, phase: "04-implement-design", node_name: "api-design" },
      () =>
        app.node.start({
          session_id, pipeline_id, sub_pipeline_id, phase: "04-implement-design",
          node_name: "api-design",
          node_definition: {
            name: "api-design", phase: "04-implement-design",
            description: "RESTful auth endpoints", tags: ["api", "backend"],
            mode: "sequential", agents: { primary: ["backend-engineer"] },
            output: [{ artifacts: [], knowledge: apiPath }],
          },
        }),
    );
    const apiWrite = await app.recorder.record(
      "opc-knowledge-server",
      "opc_knowledge_write",
      { unit: "user-auth", section: "api", sub: "api-spec" },
      () =>
        app.knowledge.write({
          unit: "user-auth", section: "api", sub: "api-spec",
          content: "# Auth API\n\n## POST /auth/register\n## POST /auth/login\n## POST /auth/logout",
        }),
    );
    await app.recorder.record(
      "opc-state-server",
      "opc_node_complete",
      { session_id, pipeline_id, sub_pipeline_id, phase: "04-implement-design", node_name: "api-design" },
      () =>
        app.node.complete({
          session_id, pipeline_id, sub_pipeline_id, phase: "04-implement-design",
          node_name: "api-design",
          evidence: { knowledge_written: [{ path: apiPath, version: apiWrite.version }] },
        }),
    );
    const schemaPath = "user-auth/db/schema";
    await app.recorder.record(
      "opc-state-server",
      "opc_node_start",
      { session_id, pipeline_id, sub_pipeline_id, phase: "04-implement-design", node_name: "database-schema" },
      () =>
        app.node.start({
          session_id, pipeline_id, sub_pipeline_id, phase: "04-implement-design",
          node_name: "database-schema",
          node_definition: {
            name: "database-schema", phase: "04-implement-design",
            description: "tables for auth", tags: ["db", "backend"],
            mode: "sequential", agents: { primary: ["database-administrator"] },
            output: [{ artifacts: [], knowledge: schemaPath }],
          },
        }),
    );
    const schemaWrite = await app.recorder.record(
      "opc-knowledge-server",
      "opc_knowledge_write",
      { unit: "user-auth", section: "db", sub: "schema" },
      () =>
        app.knowledge.write({
          unit: "user-auth", section: "db", sub: "schema",
          content: "## users\n- id PK\n- email UNIQUE\n- password_hash",
        }),
    );
    await app.recorder.record(
      "opc-state-server",
      "opc_node_complete",
      { session_id, pipeline_id, sub_pipeline_id, phase: "04-implement-design", node_name: "database-schema" },
      () =>
        app.node.complete({
          session_id, pipeline_id, sub_pipeline_id, phase: "04-implement-design",
          node_name: "database-schema",
          evidence: { knowledge_written: [{ path: schemaPath, version: schemaWrite.version }] },
        }),
    );
    await app.recorder.record(
      "opc-state-server",
      "opc_phase_complete",
      { session_id, pipeline_id, sub_pipeline_id, phase: "04-implement-design" },
      () =>
        app.phase.complete({
          session_id, pipeline_id, sub_pipeline_id, phase: "04-implement-design",
        }),
    );

    // ── Stage 5: phase 05-implement (tdd-implementation) ───────────────────
    await app.recorder.record(
      "opc-state-server",
      "opc_phase_start",
      { session_id, pipeline_id, sub_pipeline_id, phase: "05-implement" },
      () => app.phase.start({ session_id, pipeline_id, sub_pipeline_id, phase: "05-implement" }),
    );
    const implPath = "user-auth/impl/summary";
    await app.recorder.record(
      "opc-state-server",
      "opc_node_start",
      { session_id, pipeline_id, sub_pipeline_id, phase: "05-implement", node_name: "tdd-implementation" },
      () =>
        app.node.start({
          session_id, pipeline_id, sub_pipeline_id, phase: "05-implement",
          node_name: "tdd-implementation",
          node_definition: {
            name: "tdd-implementation", phase: "05-implement",
            description: "Red-green-refactor for auth", tags: ["tdd", "backend"],
            mode: "sequential", agents: { primary: ["backend-engineer"] },
            quality_gates: ["test_pass"],
            output: [{ artifacts: [], knowledge: implPath }],
          },
        }),
    );
    const implWrite = await app.recorder.record(
      "opc-knowledge-server",
      "opc_knowledge_write",
      { unit: "user-auth", section: "impl", sub: "summary" },
      () =>
        app.knowledge.write({
          unit: "user-auth", section: "impl", sub: "summary",
          content: "## Implementation\n- bcrypt password hashing\n- JWT tokens\n- 12 unit tests passing",
        }),
    );
    await app.recorder.record(
      "opc-state-server",
      "opc_node_complete",
      { session_id, pipeline_id, sub_pipeline_id, phase: "05-implement", node_name: "tdd-implementation" },
      () =>
        app.node.complete({
          session_id, pipeline_id, sub_pipeline_id, phase: "05-implement",
          node_name: "tdd-implementation",
          evidence: {
            test_results: { passed: 12, failed: 0 },
            knowledge_written: [{ path: implPath, version: implWrite.version }],
          },
        }),
    );
    await app.recorder.record(
      "opc-state-server",
      "opc_phase_complete",
      { session_id, pipeline_id, sub_pipeline_id, phase: "05-implement" },
      () => app.phase.complete({ session_id, pipeline_id, sub_pipeline_id, phase: "05-implement" }),
    );

    // ── Stage 6: phase 06-testing (integration-test) — LAST phase ─────────
    await app.recorder.record(
      "opc-state-server",
      "opc_phase_start",
      { session_id, pipeline_id, sub_pipeline_id, phase: "06-testing" },
      () => app.phase.start({ session_id, pipeline_id, sub_pipeline_id, phase: "06-testing" }),
    );
    const reportPath = "user-auth/integration/test-report";
    await app.recorder.record(
      "opc-state-server",
      "opc_node_start",
      { session_id, pipeline_id, sub_pipeline_id, phase: "06-testing", node_name: "integration-test" },
      () =>
        app.node.start({
          session_id, pipeline_id, sub_pipeline_id, phase: "06-testing",
          node_name: "integration-test",
          node_definition: {
            name: "integration-test", phase: "06-testing",
            description: "Integration + E2E", tags: ["backend", "fullstack"],
            mode: "sequential", agents: { primary: ["test-automator"] },
            quality_gates: ["test_pass"],
            output: [{ artifacts: [], knowledge: reportPath }],
          },
        }),
    );
    const reportWrite = await app.recorder.record(
      "opc-knowledge-server",
      "opc_knowledge_write",
      { unit: "user-auth", section: "integration", sub: "test-report" },
      () =>
        app.knowledge.write({
          unit: "user-auth", section: "integration", sub: "test-report",
          content: "## Integration Report\n- 24 passed / 0 failed\n- coverage 82%",
        }),
    );
    await app.recorder.record(
      "opc-state-server",
      "opc_node_complete",
      { session_id, pipeline_id, sub_pipeline_id, phase: "06-testing", node_name: "integration-test" },
      () =>
        app.node.complete({
          session_id, pipeline_id, sub_pipeline_id, phase: "06-testing",
          node_name: "integration-test",
          evidence: {
            test_results: { passed: 24, failed: 0 },
            knowledge_written: [{ path: reportPath, version: reportWrite.version }],
          },
        }),
    );
    const finalPhase = await app.recorder.record(
      "opc-state-server",
      "opc_phase_complete",
      { session_id, pipeline_id, sub_pipeline_id, phase: "06-testing" },
      () => app.phase.complete({ session_id, pipeline_id, sub_pipeline_id, phase: "06-testing" }),
    );
    expect(finalPhase.next_phase).toBe(null);
    expect(finalPhase.flow_next.tool).toBe("opc_pipeline_complete");

    // ── Stage 7a: pipeline_status — pipeline + sub aggregated to completed ─
    const status = await app.recorder.record(
      "opc-state-server",
      "opc_pipeline_status",
      { session_id, pipeline_id },
      () => app.pipeline.status({ session_id, pipeline_id }),
    );
    expect(status.status).toBe("completed");
    expect(status.sub_pipelines).toEqual([{ id: "sub-auth", status: "completed" }]);

    // ── Stage 7b: knowledge_read list — assert all expected paths present ─
    const list = await app.recorder.record(
      "opc-knowledge-server",
      "opc_knowledge_read",
      { mode: "list", unit: "user-auth" },
      () => app.knowledge.read({ mode: "list", unit: "user-auth" }),
    );
    if (list.mode !== "list") throw new Error("expected list mode response");
    const listedPaths = list.items
      .map((e) => `user-auth/${e.section}/${e.sub}`)
      .sort();
    expect(listedPaths).toEqual([
      "user-auth/api/api-spec",
      "user-auth/db/schema",
      "user-auth/impl/summary",
      "user-auth/integration/test-report",
    ]);

    // ── Stage 7c: freeze recorder transcript to fixtures/walkthrough-auth.jsonl
    const calls = app.recorder.freeze();
    expect(calls.every((c) => !c.error)).toBe(true);
    // Tool counts: 1 lifecycle + 4 step_complete + 1 pipeline_create
    //            + 1 knowledge_open
    //            + (1 phase_start + 4 node ops + 1 phase_complete) × 2 phases [04, 05 simplified]
    //            ... freezing the exact sequence the test produced is more
    //            durable than counting by hand.
    expect(calls.length).toBe(27);

    await mkdir(FIXTURE_DIR, { recursive: true });
    const jsonl = calls
      .map((c) =>
        JSON.stringify({
          seq: c.seq,
          server: c.server,
          tool: c.tool,
          input: c.input,
          output: c.output,
        }),
      )
      .join("\n") + "\n";
    await writeFile(FIXTURE_PATH, jsonl, "utf-8");
    expect(existsSync(FIXTURE_PATH)).toBe(true);

    // Tool-call tally by server (sanity for the fixture).
    const byServer = calls.reduce<Record<string, number>>((acc, c) => {
      acc[c.server] = (acc[c.server] ?? 0) + 1;
      return acc;
    }, {});
    expect(byServer["opc-state-server"]).toBeGreaterThan(0);
    expect(byServer["opc-knowledge-server"]).toBeGreaterThan(0);
  });
});
