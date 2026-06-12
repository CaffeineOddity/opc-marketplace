/**
 * M15.a: Scenario 01 — chat / no OPC intervention.
 *
 * Doc: doc/feature/04-e2e/02-test/01_chat.md
 * Input: "你好，今天天气怎么样"
 *
 * Three calls only — flow lifecycle short-circuits at intent_analysis
 * when intent="chat":
 *  1. opc_flow_query → active=false (no prior session in scope)
 *  2. opc_flow_lifecycle({action:"start"}) → status=in_progress, current_step=intent_analysis
 *  3. opc_flow_step_complete({step:"intent_analysis", intent:"chat"}) →
 *     status=completed, current_step=completed, next={tool:"completed"}
 *
 * Asserts the chat path never creates pipeline/knowledge resources and
 * leaves the session in a terminal state so the next hook fire does not
 * misclassify a stale in_progress.
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

describe("scenario 01 — chat", () => {
  it("opc_flow_query → lifecycle.start → step_complete(intent=chat) terminates the flow", async () => {
    // 1: opc_flow_query with no session_id surrogate — we query the empty
    // root via a fresh session_id that does not yet exist. The flow server
    // creates a default state on read, so "active=false" maps to
    // current_step === "intent_analysis" with no accumulated.intent.
    // Practically the e2e harness skips the no-session query (the harness
    // unit test covers that) and instead exercises the chat-shortcut path
    // starting at lifecycle.start.
    const initial_message = "你好，今天天气怎么样";
    const started = await app.recorder.record(
      "opc-state-server",
      "opc_flow_lifecycle",
      { action: "start", initial_message },
      () => app.flow.lifecycle({ action: "start", initial_message }),
    );
    expect(started.state.status).toBe("in_progress");
    expect(started.state.current_step).toBe("intent_analysis");
    const session_id = started.state.session_id;

    // 2: opc_flow_query AFTER start — returns the active session.
    const queried = await app.recorder.record(
      "opc-state-server",
      "opc_flow_query",
      { session_id },
      () => app.flow.query({ session_id }),
    );
    expect(queried.state.status).toBe("in_progress");
    expect(queried.next).toEqual({
      tool: "opc_flow_step_complete",
      step: "intent_analysis",
    });

    // 3: intent_analysis with intent=chat short-circuits.
    const done = await app.recorder.record(
      "opc-state-server",
      "opc_flow_step_complete",
      {
        step: "intent_analysis",
        session_id,
        intent: "chat",
        reasoning: "纯问候+闲聊话题，无动作动词/交付物",
      },
      () =>
        app.flow.stepComplete({
          step: "intent_analysis",
          session_id,
          intent: "chat",
          reasoning: "纯问候+闲聊话题，无动作动词/交付物",
        }),
    );
    expect(done.state.status).toBe("completed");
    expect(done.state.current_step).toBe("completed");
    expect(done.state.completed_at).not.toBeNull();
    expect(done.state.accumulated.intent).toBe("chat");
    // No analysis_result / decomposition / brief written (initial state
    // leaves them as null sentinels — neither populated nor user-touched).
    expect(done.state.accumulated.analysis_result).toBeNull();
    expect(done.state.accumulated.decomposition_result).toBeNull();
    expect(done.state.accumulated.brief_content).toBeNull();
    expect(done.next).toEqual({ tool: "completed" });

    const calls = app.recorder.freeze();
    expect(calls.map((c) => c.tool)).toEqual([
      "opc_flow_lifecycle",
      "opc_flow_query",
      "opc_flow_step_complete",
    ]);
    expect(calls.every((c) => !c.error)).toBe(true);
  });
});
