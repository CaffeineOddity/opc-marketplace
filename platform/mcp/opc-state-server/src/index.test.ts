import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  SERVER_NAME,
  FlowServer,
  loadFlowState,
  saveFlowState,
  SessionNotFoundError,
} from "./index.js";

let root: string;
let counter = 0;
const fixedNow = (): Date => new Date("2026-06-10T00:00:00Z");
const fixedUuid = (): string => {
  counter += 1;
  return `id-${counter}`;
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "stateserver-"));
  counter = 0;
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const fresh = (): FlowServer =>
  new FlowServer({ root, now: fixedNow, pid: () => 1234, uuid: fixedUuid });

describe("@opc/state-server skeleton", () => {
  it("exposes server name", () => {
    expect(SERVER_NAME).toBe("opc-state-server");
  });
});

describe("FlowServer.lifecycle", () => {
  it("start creates a new session in_progress at intent_analysis", async () => {
    const fs = fresh();
    const r = await fs.lifecycle({ action: "start", initial_message: "do X" });
    expect(r.state.status).toBe("in_progress");
    expect(r.state.current_step).toBe("intent_analysis");
    expect(r.state.user_message_history).toEqual(["do X"]);
    expect(r.next).toEqual({ tool: "opc_flow_step_complete", step: "intent_analysis" });
    const reloaded = await loadFlowState(root, r.state.session_id);
    expect(reloaded.session_id).toBe(r.state.session_id);
  });

  it("abort marks aborted and stores reason", async () => {
    const fs = fresh();
    const a = await fs.lifecycle({ action: "start" });
    const b = await fs.lifecycle({
      action: "abort",
      session_id: a.state.session_id,
      reason: "user-cancel",
    });
    expect(b.state.status).toBe("aborted");
    expect(b.state.abort_reason).toBe("user-cancel");
    expect(b.next).toEqual({ tool: "aborted" });
  });

  it("recover updates pid + heartbeat", async () => {
    const fs = fresh();
    const a = await fs.lifecycle({ action: "start" });
    const b = await fs.lifecycle({
      action: "recover",
      session_id: a.state.session_id,
      pid: 9999,
    });
    expect(b.state.owner.pid).toBe(9999);
  });

  it("query on missing session throws SessionNotFoundError", async () => {
    const fs = fresh();
    await expect(fs.query({ session_id: "missing" })).rejects.toBeInstanceOf(SessionNotFoundError);
  });
});

describe("FlowServer.stepComplete dispatch", () => {
  it("intent=task → advances to task_analysis", async () => {
    const fs = fresh();
    const a = await fs.lifecycle({ action: "start", initial_message: "build auth" });
    const r = await fs.stepComplete({
      step: "intent_analysis",
      session_id: a.state.session_id,
      intent: "task",
    });
    expect(r.state.accumulated.intent).toBe("task");
    expect(r.state.current_step).toBe("task_analysis");
    expect(r.next).toEqual({ tool: "opc_flow_step_complete", step: "task_analysis" });
  });

  it("intent=chat → marks completed", async () => {
    const fs = fresh();
    const a = await fs.lifecycle({ action: "start" });
    const r = await fs.stepComplete({
      step: "intent_analysis",
      session_id: a.state.session_id,
      intent: "chat",
    });
    expect(r.state.status).toBe("completed");
    expect(r.next).toEqual({ tool: "completed" });
  });

  it("intent=project_question → marks completed", async () => {
    const fs = fresh();
    const a = await fs.lifecycle({ action: "start" });
    const r = await fs.stepComplete({
      step: "intent_analysis",
      session_id: a.state.session_id,
      intent: "project_question",
    });
    expect(r.state.status).toBe("completed");
    expect(r.state.accumulated.intent).toBe("project_question");
  });

  it("intent=general_question → marks completed", async () => {
    const fs = fresh();
    const a = await fs.lifecycle({ action: "start" });
    const r = await fs.stepComplete({
      step: "intent_analysis",
      session_id: a.state.session_id,
      intent: "general_question",
    });
    expect(r.state.status).toBe("completed");
    expect(r.state.accumulated.intent).toBe("general_question");
  });

  it("full intent → task_analysis → decomposition → brief chain", async () => {
    const fs = fresh();
    const a = await fs.lifecycle({ action: "start" });
    const s = a.state.session_id;
    await fs.stepComplete({ step: "intent_analysis", session_id: s, intent: "task" });
    await fs.stepComplete({
      step: "task_analysis",
      session_id: s,
      analysis_result: { complexity: "medium" },
    });
    await fs.stepComplete({
      step: "task_decomposition",
      session_id: s,
      sub_pipelines: [{ id: "sub-1" }],
      execution_order: [["sub-1"]],
    });
    const r = await fs.stepComplete({
      step: "brief_generation",
      session_id: s,
      brief_content: "do it",
    });
    expect(r.state.current_step).toBe("pipeline_execution");
    expect(r.state.accumulated.brief_content).toBe("do it");
    expect(r.next).toEqual({ tool: "opc_pipeline_create" });
  });

  it("rejects when step doesn't match current_step", async () => {
    const fs = fresh();
    const a = await fs.lifecycle({ action: "start" });
    await expect(
      fs.stepComplete({
        step: "task_analysis",
        session_id: a.state.session_id,
        analysis_result: {},
      }),
    ).rejects.toThrow(/expected current_step/);
  });
});

describe("FlowServer.reflect + guards", () => {
  it("registers a pending_reflection on ok verdict and removes it", async () => {
    const fs = fresh();
    const a = await fs.lifecycle({ action: "start" });
    const s = a.state.session_id;
    const state = await loadFlowState(root, s);
    fs.registerPendingReflection(state, {
      reflection_id: "rfl-1",
      artifact_path: "p",
      step_id: "intent_analysis",
      issued_by: "x",
      issued_at: fixedNow().toISOString(),
      expires_at: new Date(fixedNow().getTime() + 60_000).toISOString(),
      must_be_registered_by: "opc_flow_reflect",
    });
    await saveFlowState(root, state, fixedNow());

    const r = await fs.reflect({ session_id: s, reflection_id: "rfl-1", verdict: "ok" });
    expect(r.registered).toBe(true);
    expect(r.state.pending_reflections).toEqual([]);
    expect(r.state.reflection_log.length).toBe(1);
  });

  it("rounds_exceeded creates pending_user_question and routes to user_reply", async () => {
    const fs = fresh();
    const a = await fs.lifecycle({ action: "start" });
    const s = a.state.session_id;
    const r = await fs.reflect({
      session_id: s,
      reflection_id: "rfl-x",
      verdict: "rounds_exceeded",
      round: 3,
      rounds_exceeded_payload: {
        reasoning_trace: ["trace-1"],
        kept_objections: [{ id: "obj-1", text: "lift complexity" }],
        context_artifacts: ["art-1"],
      },
    });
    expect(r.state.pending_user_question).not.toBeNull();
    expect(r.state.pending_user_question?.kept_objections.length).toBe(1);
    expect(r.next).toEqual({ tool: "opc_flow_user_reply" });
  });

  it("reflection-registry-guard blocks stepComplete when pending_reflections non-empty", async () => {
    const fs = fresh();
    const a = await fs.lifecycle({ action: "start" });
    const s = a.state.session_id;
    const state = await loadFlowState(root, s);
    fs.registerPendingReflection(state, {
      reflection_id: "rfl-stuck",
      artifact_path: "p",
      step_id: "intent_analysis",
      issued_by: "x",
      issued_at: fixedNow().toISOString(),
      expires_at: new Date(fixedNow().getTime() + 60_000).toISOString(),
      must_be_registered_by: "opc_flow_reflect",
    });
    await saveFlowState(root, state, fixedNow());
    await expect(
      fs.stepComplete({ step: "intent_analysis", session_id: s, intent: "task" }),
    ).rejects.toThrow(/reflection-registry-guard/);
  });

  it("pending-question-guard blocks stepComplete when pending_user_question is set", async () => {
    const fs = fresh();
    const a = await fs.lifecycle({ action: "start" });
    const s = a.state.session_id;
    await fs.reflect({
      session_id: s,
      reflection_id: "rfl-rx",
      verdict: "rounds_exceeded",
      rounds_exceeded_payload: {
        reasoning_trace: [],
        kept_objections: [],
        context_artifacts: [],
      },
    });
    await expect(
      fs.stepComplete({ step: "intent_analysis", session_id: s, intent: "task" }),
    ).rejects.toThrow(/pending-question-guard/);
  });
});

describe("FlowServer.userReply A3 loop", () => {
  it("clears pending_user_question, applies accumulated_patch, records intervention", async () => {
    const fs = fresh();
    const a = await fs.lifecycle({ action: "start" });
    const s = a.state.session_id;
    const reflectResult = await fs.reflect({
      session_id: s,
      reflection_id: "rfl-1",
      verdict: "rounds_exceeded",
      rounds_exceeded_payload: {
        reasoning_trace: ["t"],
        kept_objections: [{ id: "obj-1", text: "x" }],
        context_artifacts: ["art-1"],
      },
    });
    const qid = reflectResult.state.pending_user_question?.question_id;
    expect(qid).toBeTruthy();
    const r = await fs.userReply({
      session_id: s,
      question_id: qid!,
      user_reply: "ok bump it",
      resolution: {
        accumulated_patch: { intent: "task" },
        objections_resolved: ["obj-1"],
      },
    });
    expect(r.state.pending_user_question).toBeNull();
    expect(r.state.user_interventions.length).toBe(1);
    expect(r.state.user_interventions[0]?.trigger).toBe("ask_user_rounds_exceeded");
    expect(r.state.accumulated.intent).toBe("task");
  });

  it("throws on unknown question_id", async () => {
    const fs = fresh();
    const a = await fs.lifecycle({ action: "start" });
    await expect(
      fs.userReply({
        session_id: a.state.session_id,
        question_id: "nope",
        user_reply: "x",
        resolution: {},
      }),
    ).rejects.toThrow(/no pending user question/);
  });
});

describe("FlowServer.quickDispatch", () => {
  it("marks session completed for chat", async () => {
    const fs = fresh();
    const a = await fs.lifecycle({ action: "start" });
    const r = await fs.quickDispatch({
      session_id: a.state.session_id,
      intent: "chat",
    });
    expect(r.state.status).toBe("completed");
    expect(r.next).toEqual({ tool: "completed" });
  });
});

describe("FlowServer.correct", () => {
  it("revise patches accumulated and records intervention", async () => {
    const fs = fresh();
    const a = await fs.lifecycle({ action: "start" });
    const s = a.state.session_id;
    await fs.stepComplete({ step: "intent_analysis", session_id: s, intent: "task" });
    const r = await fs.correct({
      action: "revise",
      session_id: s,
      patch: { analysis_result: { complexity: "high" } },
      notes: "user said high",
    });
    expect(r.state.accumulated.analysis_result?.complexity).toBe("high");
    expect(r.state.user_interventions[0]?.trigger).toBe("user_initiated_revise");
  });

  it("restart clears downstream accumulated and resets step", async () => {
    const fs = fresh();
    const a = await fs.lifecycle({ action: "start" });
    const s = a.state.session_id;
    await fs.stepComplete({ step: "intent_analysis", session_id: s, intent: "task" });
    await fs.stepComplete({
      step: "task_analysis",
      session_id: s,
      analysis_result: { complexity: "low" },
    });
    const r = await fs.correct({
      action: "restart",
      session_id: s,
      reset_to_step: "task_analysis",
      additional_input: "more context",
    });
    expect(r.state.current_step).toBe("task_analysis");
    expect(r.state.accumulated.analysis_result).toBeNull();
    expect(r.state.user_message_history).toContain("more context");
  });

  it("phase_reset writes pipeline_pointer and intervention", async () => {
    const fs = fresh();
    const a = await fs.lifecycle({ action: "start" });
    const r = await fs.correct({
      action: "phase_reset",
      session_id: a.state.session_id,
      pipeline_pointer: {
        pipeline_id: "p1",
        sub_pipeline_id: "sub-1",
        phase: "05-implement",
      },
    });
    expect(r.state.current_pipeline_pointer?.phase).toBe("05-implement");
    expect(r.state.user_interventions[0]?.trigger).toBe("user_initiated_phase_reset");
  });
});

describe("FlowServer.query expires cleanup", () => {
  it("removes expired pending_reflections", async () => {
    const fs = fresh();
    const a = await fs.lifecycle({ action: "start" });
    const s = a.state.session_id;
    const state = await loadFlowState(root, s);
    fs.registerPendingReflection(state, {
      reflection_id: "rfl-old",
      artifact_path: "p",
      step_id: "intent_analysis",
      issued_by: "x",
      issued_at: "2026-06-09T00:00:00Z",
      expires_at: "2026-06-09T00:30:00Z",
      must_be_registered_by: "opc_flow_reflect",
    });
    await saveFlowState(root, state, fixedNow());
    const q = await fs.query({ session_id: s });
    expect(q.state.pending_reflections).toEqual([]);
  });
});
