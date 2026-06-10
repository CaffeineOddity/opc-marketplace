/**
 * M15.k: Scenarios 06 + 07 — multi-sub-pipeline split (3-sub + 5-sub).
 *
 * Docs:
 *  - doc/feature/04-e2e/02-test/06_split-3-sub.md
 *  - doc/feature/04-e2e/02-test/07_split-5-sub.md
 *
 * NOTE on doc title vs content:
 *  - Doc 06 is titled "3 条子管线" but the inline pseudo-code only spells
 *    out 2 subs (product + cart with blocked_by:[product]). This test
 *    mirrors the inline content faithfully — 2 subs is the smallest
 *    multi-sub split that exercises the blocked_by + execution_order
 *    + serial handoff contract.
 *  - Doc 07 is titled "5 条子管线" but the inline pseudo-code lists 4
 *    subs (product, user-center, cart, order+payment). This test uses
 *    4 subs to match the inline content; the serial-chain contract is
 *    identical regardless of count.
 *
 * Validates per scenario doc:
 *  1. decomposition with blocked_by produces a valid DAG + execution_order
 *  2. pipeline_create returns flow_next pointing at the FIRST root sub
 *  3. driving each sub through its phase → phase.complete returns
 *     pipeline_progress.next_sub_pipeline pointing at the next
 *     ready sub (blocked_by all completed)
 *  4. Claude need never guess which sub to start next — it's always in
 *     flow_next.args.sub_pipeline_id
 *  5. After the LAST sub completes its last phase, next_sub_pipeline=null
 *     and the caller can opc_pipeline_lifecycle({action:"complete"})
 *
 * Out of scope (orchestrator-level concerns, M16+):
 *  - P3 reflection (M6-ToT / inline) — handled by reflection-server, not
 *    state-server; covered in scenario 14.
 *  - opc_pipeline_lifecycle({action:"complete"}) wiring — pipeline-server
 *    contract test, not a multi-sub-chain concern.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  loadPipelinePlan,
  newStateJson,
  saveStateJson,
} from "@opc/state-server";

import { bootstrap, type Bootstrap } from "./harness.js";

let app: Bootstrap;

beforeEach(async () => {
  app = await bootstrap();
});

afterEach(async () => {
  await app.cleanup();
});

const PHASES = ["05-implement"];

interface SubSpec {
  id: string;
  title: string;
  knowledge_unit: string[];
  blocked_by?: string[];
}

async function setupMultiSub(
  b: Bootstrap,
  initial_message: string,
  subs: SubSpec[],
  knowledge_units: string[],
): Promise<{ session_id: string; pipeline_id: string }> {
  const started = await b.flow.lifecycle({ action: "start", initial_message });
  const session_id = started.state.session_id;
  await b.flow.stepComplete({ step: "intent_analysis", session_id, intent: "task" });
  await b.flow.stepComplete({
    step: "task_analysis",
    session_id,
    analysis_result: {
      description: initial_message,
      complexity: "high",
      suggested_phases: PHASES,
      knowledge_unit: knowledge_units,
      scenario: "greenfield",
    },
  });
  await b.flow.stepComplete({
    step: "task_decomposition",
    session_id,
    sub_pipelines: subs.map((s) => ({
      id: s.id,
      description: s.title,
      phases: PHASES,
    })),
  });
  await b.flow.stepComplete({
    step: "brief_generation",
    session_id,
    brief_content: subs.map((s) => s.title).join(" + "),
  });
  const created = await b.pipeline.create({
    session_id,
    description: initial_message,
    brief_content: subs.map((s) => s.title).join(" + "),
    complexity: "high",
    knowledge_unit: knowledge_units,
    suggested_phases: PHASES,
    phase_selection_rationale: "split by knowledge unit; serial via blocked_by",
    sub_pipelines: subs.map((s) => ({
      id: s.id,
      title: s.title,
      knowledge_unit: s.knowledge_unit,
      suggested_phases: PHASES,
      ...(s.blocked_by ? { blocked_by: s.blocked_by } : {}),
    })),
  });
  return { session_id, pipeline_id: created.pipeline_id };
}

/** Drive a single sub through its single 05-implement phase. */
async function runSub(
  b: Bootstrap,
  session_id: string,
  pipeline_id: string,
  sub_id: string,
  unit: string,
): Promise<void> {
  await b.phase.start({ session_id, pipeline_id, sub_pipeline_id: sub_id, phase: "05-implement" });
  await b.node.start({
    session_id,
    pipeline_id,
    sub_pipeline_id: sub_id,
    phase: "05-implement",
    node_name: "tdd-impl",
    node_definition: {
      name: "tdd-impl",
      phase: "05-implement",
      description: `impl ${unit}`,
      tags: ["backend"],
      mode: "sequential",
      agents: { primary: ["backend-engineer"] },
      output: [{ artifacts: [], knowledge: `${unit}/impl/summary` }],
    },
  });
  const w = await b.knowledge.write({
    unit,
    section: "impl",
    sub: "summary",
    content: `## ${unit} impl\nbasic`,
  });
  await b.node.complete({
    session_id,
    pipeline_id,
    sub_pipeline_id: sub_id,
    phase: "05-implement",
    node_name: "tdd-impl",
    evidence: {
      knowledge_written: [{ path: `${unit}/impl/summary`, version: w.version }],
    },
  });
}

/** Bootstrap per-sub state.json for every sub in the plan (orchestrator job). */
async function bootstrapAllSubStates(
  b: Bootstrap,
  session_id: string,
  pipeline_id: string,
  subs: SubSpec[],
): Promise<void> {
  for (const s of subs) {
    const st = newStateJson({
      sub_pipeline_id: s.id,
      title: s.title,
      description: s.title,
      complexity: "medium",
      knowledge_unit: s.knowledge_unit,
      suggested_phases: PHASES,
      phase_selection_rationale: "serial split",
      now: b.clock.now(),
    });
    await saveStateJson(b.root, session_id, pipeline_id, st, b.clock.now());
  }
}

describe("scenarios 06 + 07 — multi-sub-pipeline split (serial chain)", () => {
  it("Scenario 06 (2-sub minimal chain): product → cart", async () => {
    const subs: SubSpec[] = [
      { id: "sub-1", title: "product", knowledge_unit: ["product"] },
      { id: "sub-2", title: "cart", knowledge_unit: ["cart"], blocked_by: ["sub-1"] },
    ];
    const { session_id, pipeline_id } = await setupMultiSub(
      app,
      "实现商品管理 + 购物车功能",
      subs,
      ["product", "cart"],
    );
    await bootstrapAllSubStates(app, session_id, pipeline_id, subs);

    // After create: next_sub_pipeline = sub-1 (no blocked_by)
    const status0 = await app.recorder.record(
      "opc-state-server",
      "opc_pipeline_status",
      { session_id, pipeline_id },
      () => app.pipeline.status({ session_id, pipeline_id }),
    );
    expect(status0.next_sub_pipeline?.id).toBe("sub-1");
    expect(status0.blocked_sub_pipelines).toEqual([
      { id: "sub-2", waiting_for: ["sub-1"] },
    ]);

    // Drive sub-1 (product)
    await runSub(app, session_id, pipeline_id, "sub-1", "product");
    const p1Done = await app.recorder.record(
      "opc-state-server",
      "opc_phase_complete",
      { session_id, pipeline_id, sub_pipeline_id: "sub-1", phase: "05-implement" },
      () =>
        app.phase.complete({
          session_id,
          pipeline_id,
          sub_pipeline_id: "sub-1",
          phase: "05-implement",
        }),
    );
    expect(p1Done.next_phase).toBeNull();
    expect(p1Done.pipeline_progress.current_sub_status).toBe("completed");
    // sub-2 unblocked; flow_next routes Claude to it without guessing.
    expect(p1Done.pipeline_progress.next_sub_pipeline?.id).toBe("sub-2");
    expect(p1Done.flow_next.tool).toBe("opc_phase_start");
    expect(p1Done.flow_next.args?.sub_pipeline_id).toBe("sub-2");

    // Drive sub-2 (cart)
    await runSub(app, session_id, pipeline_id, "sub-2", "cart");
    const p2Done = await app.recorder.record(
      "opc-state-server",
      "opc_phase_complete",
      { session_id, pipeline_id, sub_pipeline_id: "sub-2", phase: "05-implement" },
      () =>
        app.phase.complete({
          session_id,
          pipeline_id,
          sub_pipeline_id: "sub-2",
          phase: "05-implement",
        }),
    );
    expect(p2Done.next_phase).toBeNull();
    expect(p2Done.pipeline_progress.current_sub_status).toBe("completed");
    expect(p2Done.pipeline_progress.next_sub_pipeline).toBeNull();

    // Plan invariant: both subs completed in execution_order
    const finalPlan = await loadPipelinePlan(app.root, session_id, pipeline_id);
    expect(finalPlan.sub_pipelines.map((s) => s.status)).toEqual([
      "completed",
      "completed",
    ]);
    expect(finalPlan.execution_order.map((g) => g.sub_pipeline_ids)).toEqual([
      ["sub-1"],
      ["sub-2"],
    ]);
  });

  it("Scenario 07 (4-sub serial chain): product → user-center → cart → order-payment", async () => {
    const subs: SubSpec[] = [
      { id: "sub-1", title: "product", knowledge_unit: ["product"] },
      { id: "sub-2", title: "user-center", knowledge_unit: ["user-center"] },
      {
        id: "sub-3",
        title: "cart",
        knowledge_unit: ["cart"],
        blocked_by: ["sub-1", "sub-2"],
      },
      {
        id: "sub-4",
        title: "order-payment",
        knowledge_unit: ["order-payment"],
        blocked_by: ["sub-3"],
      },
    ];
    const { session_id, pipeline_id } = await setupMultiSub(
      app,
      "实现完整电商：商品 + 用户中心 + 购物车 + 下单支付",
      subs,
      ["product", "user-center", "cart", "order-payment"],
    );
    await bootstrapAllSubStates(app, session_id, pipeline_id, subs);

    // After create: two roots (sub-1, sub-2). next_sub_pipeline picks one
    // by execution_order; cart + order-payment are blocked.
    const status0 = await app.pipeline.status({ session_id, pipeline_id });
    expect(["sub-1", "sub-2"]).toContain(status0.next_sub_pipeline?.id);
    const blockedIds = status0.blocked_sub_pipelines.map((b) => b.id).sort();
    expect(blockedIds).toEqual(["sub-3", "sub-4"]);

    // Plan: execution_order separates roots from dependents.
    const plan0 = await loadPipelinePlan(app.root, session_id, pipeline_id);
    // Group 0 holds the parallel roots; group 1 holds cart (blocked on both
    // roots); group 2 holds order-payment.
    expect(plan0.execution_order.length).toBeGreaterThanOrEqual(2);
    const group0Ids = plan0.execution_order[0]!.sub_pipeline_ids.sort();
    expect(group0Ids).toEqual(["sub-1", "sub-2"]);

    // Drive sub-1 → expect next = sub-2 (other root still ready) OR cart
    // (if state-manager picks the next ready by execution_order; sub-2 is
    // still a root so it should come first).
    await runSub(app, session_id, pipeline_id, "sub-1", "product");
    const p1Done = await app.phase.complete({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-1",
      phase: "05-implement",
    });
    expect(p1Done.pipeline_progress.next_sub_pipeline?.id).toBe("sub-2");
    expect(p1Done.flow_next.args?.sub_pipeline_id).toBe("sub-2");

    // Drive sub-2 → cart now unblocked
    await runSub(app, session_id, pipeline_id, "sub-2", "user-center");
    const p2Done = await app.phase.complete({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-2",
      phase: "05-implement",
    });
    expect(p2Done.pipeline_progress.next_sub_pipeline?.id).toBe("sub-3");
    expect(p2Done.flow_next.args?.sub_pipeline_id).toBe("sub-3");

    // Drive sub-3 → order-payment unblocked
    await runSub(app, session_id, pipeline_id, "sub-3", "cart");
    const p3Done = await app.phase.complete({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-3",
      phase: "05-implement",
    });
    expect(p3Done.pipeline_progress.next_sub_pipeline?.id).toBe("sub-4");
    expect(p3Done.flow_next.args?.sub_pipeline_id).toBe("sub-4");

    // Drive sub-4 → terminal: no next sub
    await runSub(app, session_id, pipeline_id, "sub-4", "order-payment");
    const p4Done = await app.phase.complete({
      session_id,
      pipeline_id,
      sub_pipeline_id: "sub-4",
      phase: "05-implement",
    });
    expect(p4Done.pipeline_progress.next_sub_pipeline).toBeNull();

    // Plan invariant: all 4 completed; no rejected_changes (no replan).
    const finalPlan = await loadPipelinePlan(app.root, session_id, pipeline_id);
    expect(finalPlan.sub_pipelines.every((s) => s.status === "completed")).toBe(true);
  });
});
