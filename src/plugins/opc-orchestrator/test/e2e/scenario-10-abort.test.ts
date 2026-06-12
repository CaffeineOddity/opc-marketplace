/**
 * M15.d: Scenario 10 — abort flow.
 *
 * Doc: doc/feature/04-e2e/02-test/10_abort.md
 * Input: "不做了，取消"
 *
 * 2 calls (per doc):
 *  1. opc_flow_query (active=true after some prior work)
 *  2. opc_flow_lifecycle({action:"abort", reason})
 *
 * Asserts state.status=aborted + aborted_at + abort_reason. The doc claims
 * abort auto-cascades to opc_pipeline_lifecycle({action:"abort", kill_agents:true})
 * — the current server impl (flow-server.ts lifecycleAbort) does NOT cascade.
 * The cascade is deferred to M16+ (kit-level orchestrator). This test
 * documents the gap rather than asserting the cascade.
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

describe("scenario 10 — abort", () => {
  it("opc_flow_lifecycle({action:'abort'}) marks status=aborted + reason + timestamp", async () => {
    // Pre-step: start a flow we will then abort.
    const started = await app.flow.lifecycle({
      action: "start",
      initial_message: "开始一个会被取消的任务",
    });
    const session_id = started.state.session_id;
    // Move into task_analysis to make abort meaningful (active mid-flow).
    await app.flow.stepComplete({
      step: "intent_analysis",
      session_id,
      intent: "task",
    });

    // 1: query — confirms the flow is active and shows suggested_actions in
    //    real prod (includes abort suggestion).
    const queried = await app.recorder.record(
      "opc-state-server",
      "opc_flow_query",
      { session_id },
      () => app.flow.query({ session_id }),
    );
    expect(queried.state.status).toBe("in_progress");
    expect(queried.state.current_step).toBe("task_analysis");

    // 2: lifecycle.abort
    const aborted = await app.recorder.record(
      "opc-state-server",
      "opc_flow_lifecycle",
      { action: "abort", session_id, reason: "user_cancel" },
      () => app.flow.lifecycle({ action: "abort", session_id, reason: "user_cancel" }),
    );
    expect(aborted.state.status).toBe("aborted");
    expect(aborted.state.current_step).toBe("aborted");
    expect(aborted.state.aborted_at).not.toBeNull();
    expect(aborted.state.abort_reason).toBe("user_cancel");
    expect(aborted.next).toEqual({ tool: "aborted" });

    const calls = app.recorder.freeze();
    expect(calls.map((c) => c.tool)).toEqual([
      "opc_flow_query",
      "opc_flow_lifecycle",
    ]);
    expect(calls.every((c) => !c.error)).toBe(true);

    // Doc gap: 10_abort.md describes auto-cascade to pipeline_lifecycle abort
    // + kill_agents. Not implemented in the current state-server. This test
    // intentionally does NOT assert the cascade; tracked for M16+ orchestrator
    // layer (which holds the sub-agent process registry).
  });

  it("post-abort opc_flow_query returns aborted state (next-message safety)", async () => {
    const started = await app.flow.lifecycle({
      action: "start",
      initial_message: "test",
    });
    const session_id = started.state.session_id;
    await app.flow.lifecycle({ action: "abort", session_id, reason: "test" });
    const queried = await app.flow.query({ session_id });
    expect(queried.state.status).toBe("aborted");
    expect(queried.next).toEqual({ tool: "aborted" });
  });
});
