import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  SERVER_NAME,
  FlowServer,
  OwnerStillAliveError,
  loadFlowState,
  saveFlowState,
  SessionNotFoundError,
  INSTALLED_KITS_FILENAME,
} from "./index.js";
import { writeFile } from "node:fs/promises";

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

  it("recover updates pid + heartbeat when prior owner is dead", async () => {
    const fs = new FlowServer({
      root,
      now: fixedNow,
      pid: () => 1234,
      uuid: fixedUuid,
      transport: "stdio",
      ppid: () => 1234,
      isAlive: () => false, // prior owner is dead → recovery allowed
    });
    const a = await fs.lifecycle({ action: "start" });
    const b = await fs.lifecycle({
      action: "recover",
      session_id: a.state.session_id,
      pid: 9999,
    });
    expect(b.state.owner.pid).toBe(9999);
  });

  it("query on missing session lazy-creates it (stdio, ppid-derived id)", async () => {
    const fs = new FlowServer({
      root,
      now: fixedNow,
      pid: () => 1234,
      uuid: fixedUuid,
      transport: "stdio",
      ppid: () => 4242,
    });
    // A non-existent, non-canonical session_id is ignored in favour of
    // auto-derivation: the server builds sess-<ppid>-<ts> and creates it.
    const q = await fs.query({ session_id: "missing" });
    expect(q.state.status).toBe("in_progress");
    expect(q.state.current_step).toBe("intent_analysis");
    expect(q.state.session_id).toBe("sess-4242-1781049600");
    expect(q.state.owner.pid).toBe(4242);
    // Idempotent: a second query with the derived id loads the same state.
    const q2 = await fs.query({ session_id: q.state.session_id });
    expect(q2.state.session_id).toBe(q.state.session_id);
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
  it("promotes expired pending_reflections to expired_pending_decision + emits ask_user (M8.c)", async () => {
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
    expect(q.state.pending_reflections).toHaveLength(1);
    expect(q.state.pending_reflections[0]?.status).toBe("expired_pending_decision");
    expect(q.state.pending_user_question).not.toBeNull();
    expect(q.state.pending_user_question?.question_id).toBe("uq-expired-rfl-old");
    expect(q.next.tool).toBe("opc_flow_user_reply");
  });
});

describe("M8.b registerPendingReflection max-1 invariant", () => {
  it("rejects second registration when one is already pending", async () => {
    const fs = fresh();
    const a = await fs.lifecycle({ action: "start" });
    const state = await loadFlowState(root, a.state.session_id);
    fs.registerPendingReflection(state, {
      reflection_id: "rfl-1",
      artifact_path: "p",
      step_id: "intent_analysis",
      issued_by: "x",
      issued_at: fixedNow().toISOString(),
      expires_at: new Date(fixedNow().getTime() + 60_000).toISOString(),
      must_be_registered_by: "opc_flow_reflect",
    });
    expect(() =>
      fs.registerPendingReflection(state, {
        reflection_id: "rfl-2",
        artifact_path: "p2",
        step_id: "intent_analysis",
        issued_by: "x",
        issued_at: fixedNow().toISOString(),
        expires_at: new Date(fixedNow().getTime() + 60_000).toISOString(),
        must_be_registered_by: "opc_flow_reflect",
      }),
    ).toThrow(/pending_reflections_max_1_violated/);
  });
});

describe("M8.c expired-reflection dispositions via userReply", () => {
  async function setupExpired(fs: FlowServer): Promise<{ s: string; qid: string }> {
    const a = await fs.lifecycle({ action: "start" });
    const s = a.state.session_id;
    const state = await loadFlowState(root, s);
    fs.registerPendingReflection(state, {
      reflection_id: "rfl-exp",
      artifact_path: "art.json",
      step_id: "intent_analysis",
      issued_by: "x",
      issued_at: "2026-06-09T00:00:00Z",
      expires_at: "2026-06-09T00:30:00Z",
      must_be_registered_by: "opc_flow_reflect",
    });
    await saveFlowState(root, state, fixedNow());
    const q = await fs.query({ session_id: s });
    return { s, qid: q.state.pending_user_question!.question_id };
  }

  it("disposition=resume re-arms pending and emits intervention", async () => {
    const fs = fresh();
    const { s, qid } = await setupExpired(fs);
    const r = await fs.userReply({
      session_id: s,
      question_id: qid,
      user_reply: "let's try again",
      resolution: { disposition: "resume" },
    });
    expect(r.state.pending_user_question).toBeNull();
    expect(r.state.pending_reflections).toHaveLength(1);
    expect(r.state.pending_reflections[0]?.status).toBe("pending");
    expect(r.state.user_interventions[0]?.trigger).toBe("expired_reflection_resumed");
  });

  it("disposition=discard drops pending and appends discarded reflection_log entry", async () => {
    const fs = fresh();
    const { s, qid } = await setupExpired(fs);
    const r = await fs.userReply({
      session_id: s,
      question_id: qid,
      user_reply: "drop it",
      resolution: { disposition: "discard" },
    });
    expect(r.state.pending_reflections).toEqual([]);
    expect(r.state.user_interventions[0]?.trigger).toBe("expired_reflection_discarded");
    expect(r.state.reflection_log.at(-1)?.verdict).toBe("discarded_by_user_after_expiry");
    expect(r.state.skip_reflection_once_for_step).toBeFalsy();
  });

  it("disposition=skip drops pending, logs skipped, sets skip_reflection_once_for_step", async () => {
    const fs = fresh();
    const { s, qid } = await setupExpired(fs);
    const r = await fs.userReply({
      session_id: s,
      question_id: qid,
      user_reply: "skip ahead",
      resolution: { disposition: "skip" },
    });
    expect(r.state.pending_reflections).toEqual([]);
    expect(r.state.user_interventions[0]?.trigger).toBe("expired_reflection_skipped");
    expect(r.state.reflection_log.at(-1)?.verdict).toBe("skipped_by_user_after_expiry");
    expect(r.state.skip_reflection_once_for_step).toBe("intent_analysis");
  });

  it("rejects expired reply without disposition", async () => {
    const fs = fresh();
    const { s, qid } = await setupExpired(fs);
    await expect(
      fs.userReply({ session_id: s, question_id: qid, user_reply: "x", resolution: {} }),
    ).rejects.toThrow(/disposition is required/);
  });
});

describe("M8.d skip_reflection_once_for_step lifecycle", () => {
  it("rounds_exceeded user_reply sets flag; matching stepComplete clears it", async () => {
    const fs = fresh();
    const a = await fs.lifecycle({ action: "start" });
    const s = a.state.session_id;
    const rx = await fs.reflect({
      session_id: s,
      reflection_id: "rfl-rx",
      verdict: "rounds_exceeded",
      step_id: "intent_analysis",
      rounds_exceeded_payload: {
        reasoning_trace: [],
        kept_objections: [],
        context_artifacts: [],
      },
    });
    const qid = rx.state.pending_user_question!.question_id;
    const reply = await fs.userReply({
      session_id: s,
      question_id: qid,
      user_reply: "go",
      resolution: { accumulated_patch: { intent: "task" } },
    });
    expect(reply.state.skip_reflection_once_for_step).toBe("intent_analysis");
    const done = await fs.stepComplete({
      step: "intent_analysis",
      session_id: s,
      intent: "task",
    });
    expect(done.state.skip_reflection_once_for_step).toBeNull();
  });
});

describe("FlowServer C2 transport guard (spec §06-host-contract §2.3)", () => {
  it("stdio mode: lifecycle.start uses ppid and stamps owner.transport=stdio", async () => {
    const fs = new FlowServer({
      root,
      now: fixedNow,
      uuid: fixedUuid,
      transport: "stdio",
      ppid: () => 9999,
      pid: () => 1234,
    });
    const r = await fs.lifecycle({ action: "start" });
    expect(r.state.owner.pid).toBe(9999);
    expect(r.state.owner.transport).toBe("stdio");
    expect(r.state.session_id).toBe("sess-9999-1781049600");
  });

  it("stdio mode: lifecycle.start with claude_pid throws TransportArgError", async () => {
    const fs = new FlowServer({
      root,
      now: fixedNow,
      uuid: fixedUuid,
      transport: "stdio",
      ppid: () => 9999,
    });
    await expect(fs.lifecycle({ action: "start", claude_pid: 1234 })).rejects.toThrow(
      /claude_pid must not be passed in stdio mode/,
    );
  });

  it("stdio mode: query with claude_pid throws TransportArgError", async () => {
    const fs = new FlowServer({
      root,
      now: fixedNow,
      uuid: fixedUuid,
      transport: "stdio",
      ppid: () => 9999,
    });
    const r = await fs.lifecycle({ action: "start" });
    await expect(fs.query({ session_id: r.state.session_id, claude_pid: 5555 })).rejects.toThrow(
      /claude_pid must not be passed in stdio mode/,
    );
  });

  it("stdio mode: query without claude_pid succeeds", async () => {
    const fs = new FlowServer({
      root,
      now: fixedNow,
      uuid: fixedUuid,
      transport: "stdio",
      ppid: () => 9999,
    });
    const r = await fs.lifecycle({ action: "start" });
    const q = await fs.query({ session_id: r.state.session_id });
    expect(q.state.session_id).toBe(r.state.session_id);
  });

  it("http mode: lifecycle.start with claude_pid uses it and stamps transport=http", async () => {
    const fs = new FlowServer({
      root,
      now: fixedNow,
      uuid: fixedUuid,
      transport: "http",
      pid: () => 1234,
    });
    const r = await fs.lifecycle({ action: "start", claude_pid: 7777 });
    expect(r.state.owner.pid).toBe(7777);
    expect(r.state.owner.transport).toBe("http");
  });

  it("http mode: lifecycle.start without claude_pid falls back to server pid", async () => {
    const fs = new FlowServer({
      root,
      now: fixedNow,
      uuid: fixedUuid,
      transport: "http",
      pid: () => 5555,
    });
    const r = await fs.lifecycle({ action: "start" });
    expect(r.state.owner.pid).toBe(5555);
    expect(r.state.owner.transport).toBe("http");
  });

  it("stdio mode: lifecycle.recover with claude_pid throws TransportArgError", async () => {
    const fs = new FlowServer({
      root,
      now: fixedNow,
      uuid: fixedUuid,
      transport: "stdio",
      ppid: () => 9999,
    });
    const r = await fs.lifecycle({ action: "start" });
    await expect(
      fs.lifecycle({ action: "recover", session_id: r.state.session_id, claude_pid: 1 }),
    ).rejects.toThrow(/claude_pid must not be passed in stdio mode/);
  });

  it("http mode: lifecycle.recover with claude_pid swaps owner.pid", async () => {
    const fs = new FlowServer({
      root,
      now: fixedNow,
      uuid: fixedUuid,
      transport: "http",
      pid: () => 1,
    });
    const r = await fs.lifecycle({ action: "start", claude_pid: 100 });
    const rec = await fs.lifecycle({
      action: "recover",
      session_id: r.state.session_id,
      claude_pid: 200,
    });
    expect(rec.state.owner.pid).toBe(200);
  });

  it("defaults to stdio transport when option omitted", async () => {
    const fs = new FlowServer({
      root,
      now: fixedNow,
      uuid: fixedUuid,
      ppid: () => 4242,
    });
    const r = await fs.lifecycle({ action: "start" });
    expect(r.state.owner.transport).toBe("stdio");
    expect(r.state.owner.pid).toBe(4242);
  });
});

describe("FlowServer orphan detection (spec §06-host-contract §2.2)", () => {
  it("stdio mode: query surfaces orphan_candidates + suggested_actions when another session's owner is dead", async () => {
    // Session A: current claude process (ppid=100)
    const fsA = new FlowServer({
      root,
      now: fixedNow,
      uuid: fixedUuid,
      transport: "stdio",
      ppid: () => 100,
      isAlive: (pid) => pid === 100,
    });
    const a = await fsA.lifecycle({ action: "start", initial_message: "A" });

    // Session B: previously owned by pid 200, which is now dead.
    const fsB = new FlowServer({
      root,
      now: fixedNow,
      uuid: fixedUuid,
      transport: "stdio",
      ppid: () => 200,
      isAlive: () => true,
    });
    const b = await fsB.lifecycle({ action: "start", initial_message: "B" });
    expect(b.state.session_id).not.toBe(a.state.session_id);

    // Now query from A's perspective: A is active, B's owner pid 200 is dead.
    const q = await fsA.query({ session_id: a.state.session_id });
    expect(q.orphan_candidates).toBeDefined();
    expect(q.orphan_candidates).toHaveLength(1);
    expect(q.orphan_candidates?.[0]?.session_id).toBe(b.state.session_id);
    expect(q.suggested_actions?.[0]?.action).toBe("recover_orphan_session");
    expect(q.suggested_actions?.[0]?.session_id).toBe(b.state.session_id);
  });

  it("query omits orphan_candidates field when no orphans found", async () => {
    const fs = new FlowServer({
      root,
      now: fixedNow,
      uuid: fixedUuid,
      transport: "stdio",
      ppid: () => 100,
      isAlive: () => true,
    });
    const r = await fs.lifecycle({ action: "start" });
    const q = await fs.query({ session_id: r.state.session_id });
    expect(q.orphan_candidates).toBeUndefined();
    expect(q.suggested_actions).toBeUndefined();
  });

  it("query in http mode does not perform orphan scan", async () => {
    // In http mode, kill(pid,0) is meaningless across hosts; should skip scan.
    const fs = new FlowServer({
      root,
      now: fixedNow,
      uuid: fixedUuid,
      transport: "http",
      pid: () => 100,
      isAlive: () => false, // would mark all as orphans if called
    });
    // Pre-create a session that would look orphaned if scanned.
    const fsOther = new FlowServer({
      root,
      now: fixedNow,
      uuid: fixedUuid,
      transport: "stdio",
      ppid: () => 999,
    });
    await fsOther.lifecycle({ action: "start" });

    const r = await fs.lifecycle({ action: "start", claude_pid: 100 });
    const q = await fs.query({ session_id: r.state.session_id, claude_pid: 100 });
    expect(q.orphan_candidates).toBeUndefined();
    expect(q.suggested_actions).toBeUndefined();
  });
});

describe("FlowServer recover aliveness check (spec §06-host-contract §2.2 step ①)", () => {
  it("rejects recover when existing owner.pid is still alive", async () => {
    // Owner pid 200 created the session and is still alive on this host.
    const fsOwner = new FlowServer({
      root,
      now: fixedNow,
      uuid: fixedUuid,
      transport: "stdio",
      ppid: () => 200,
      isAlive: () => true,
    });
    const orig = await fsOwner.lifecycle({ action: "start" });

    // A different stdio process (ppid=300) attempts to recover. With owner
    // still alive, this MUST be rejected.
    const fsStealer = new FlowServer({
      root,
      now: fixedNow,
      uuid: fixedUuid,
      transport: "stdio",
      ppid: () => 300,
      isAlive: () => true,
    });
    await expect(
      fsStealer.lifecycle({ action: "recover", session_id: orig.state.session_id }),
    ).rejects.toThrow(OwnerStillAliveError);
  });

  it("accepts recover when existing owner.pid is dead (true orphan takeover)", async () => {
    const fsOriginal = new FlowServer({
      root,
      now: fixedNow,
      uuid: fixedUuid,
      transport: "stdio",
      ppid: () => 200,
    });
    const orig = await fsOriginal.lifecycle({ action: "start" });

    const fsNew = new FlowServer({
      root,
      now: fixedNow,
      uuid: fixedUuid,
      transport: "stdio",
      ppid: () => 400,
      isAlive: (pid) => pid !== 200, // 200 is dead, 400 alive
    });
    const rec = await fsNew.lifecycle({
      action: "recover",
      session_id: orig.state.session_id,
    });
    expect(rec.state.owner.pid).toBe(400);
    expect(rec.state.session_id).toBe(orig.state.session_id);
  });

  it("idempotent self-recover (same pid) does not trip the aliveness guard", async () => {
    const fs = new FlowServer({
      root,
      now: fixedNow,
      uuid: fixedUuid,
      transport: "stdio",
      ppid: () => 500,
      isAlive: () => true,
    });
    const orig = await fs.lifecycle({ action: "start" });
    // Same pid recovering own session is a no-op-ish bump; must not throw.
    const rec = await fs.lifecycle({
      action: "recover",
      session_id: orig.state.session_id,
    });
    expect(rec.state.owner.pid).toBe(500);
  });

  it("http mode: aliveness guard is skipped (kill(pid,0) meaningless cross-host)", async () => {
    const fsHttp = new FlowServer({
      root,
      now: fixedNow,
      uuid: fixedUuid,
      transport: "http",
      pid: () => 1,
      isAlive: () => true, // would block stdio recovery, but http skips check
    });
    const orig = await fsHttp.lifecycle({ action: "start", claude_pid: 600 });

    const rec = await fsHttp.lifecycle({
      action: "recover",
      session_id: orig.state.session_id,
      claude_pid: 700,
    });
    expect(rec.state.owner.pid).toBe(700);
  });

  it("OwnerStillAliveError carries diagnostic fields", async () => {
    const fsOwner = new FlowServer({
      root,
      now: fixedNow,
      uuid: fixedUuid,
      transport: "stdio",
      ppid: () => 800,
      isAlive: () => true,
    });
    const orig = await fsOwner.lifecycle({ action: "start" });
    const fsStealer = new FlowServer({
      root,
      now: fixedNow,
      uuid: fixedUuid,
      transport: "stdio",
      ppid: () => 900,
      isAlive: () => true,
    });
    try {
      await fsStealer.lifecycle({
        action: "recover",
        session_id: orig.state.session_id,
      });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OwnerStillAliveError);
      const e = err as OwnerStillAliveError;
      expect(e.session_id).toBe(orig.state.session_id);
      expect(e.owner_pid).toBe(800);
      expect(e.attempted_pid).toBe(900);
    }
  });
});

describe("FlowServer kit-health A4 (spec §06-host-contract §2.7.5)", () => {
  it("returns no _warnings when installed-kits.json absent", async () => {
    const fs = fresh();
    const start = await fs.lifecycle({ action: "start" });
    const q = await fs.query({ session_id: start.state.session_id });
    expect(q._warnings).toBeUndefined();
    expect(q.suggested_actions).toBeUndefined();
  });

  it("emits _warnings + suggested_actions for kit installed after session start", async () => {
    const fs = fresh();
    const start = await fs.lifecycle({ action: "start" });
    // owner.started_at is fixedNow = 2026-06-10T00:00:00Z
    await writeFile(
      join(root, INSTALLED_KITS_FILENAME),
      JSON.stringify({
        kits: [
          {
            name: "backend-pro",
            agents: ["backend-engineer"],
            mcp_servers: ["postgres"],
            installed_at: "2026-06-10T05:00:00Z",
          },
        ],
      }),
    );
    const q = await fs.query({ session_id: start.state.session_id });
    expect(q._warnings).toHaveLength(1);
    expect(q._warnings?.[0]).toMatchObject({
      code: "KIT_PROBABLY_NOT_LOADED",
      kit: "backend-pro",
      affected_agents: ["backend-engineer"],
    });
    expect(q.suggested_actions).toHaveLength(1);
    expect(q.suggested_actions?.[0]).toMatchObject({
      action: "restart_session",
      reason: "kit_not_loaded",
    });
  });

  it("does NOT warn when kit installed BEFORE session start", async () => {
    const fs = fresh();
    const start = await fs.lifecycle({ action: "start" });
    await writeFile(
      join(root, INSTALLED_KITS_FILENAME),
      JSON.stringify({
        kits: [
          {
            name: "old-kit",
            agents: ["x"],
            installed_at: "2026-06-09T00:00:00Z",
          },
        ],
      }),
    );
    const q = await fs.query({ session_id: start.state.session_id });
    expect(q._warnings).toBeUndefined();
  });

  it("kit-health runs even in http transport mode (heuristic transport-agnostic)", async () => {
    const fs = new FlowServer({
      root,
      now: fixedNow,
      pid: () => 1234,
      uuid: fixedUuid,
      transport: "http",
    });
    const start = await fs.lifecycle({ action: "start", claude_pid: 1234 });
    await writeFile(
      join(root, INSTALLED_KITS_FILENAME),
      JSON.stringify({
        kits: [
          {
            name: "k",
            agents: ["a"],
            installed_at: "2026-06-10T05:00:00Z",
          },
        ],
      }),
    );
    const q = await fs.query({ session_id: start.state.session_id });
    expect(q._warnings).toHaveLength(1);
    // In http mode there should be no orphan_candidates field even when kit
    // warnings are present.
    expect(q.orphan_candidates).toBeUndefined();
  });

  it("orphan suggested_actions and kit suggested_actions both populate the aggregated array", async () => {
    // Create one orphan session (dead pid) + a stale kit, both visible from
    // the current session's query.
    const fs = new FlowServer({
      root,
      now: fixedNow,
      pid: () => 1234,
      uuid: fixedUuid,
      transport: "stdio",
      ppid: () => 1234,
      isAlive: (pid) => pid === 1234,
    });
    // Live current session.
    const live = await fs.lifecycle({ action: "start" });
    // Inject an orphan session (dead pid 9999) on disk by direct save.
    const orphanState = await loadFlowState(root, live.state.session_id);
    const orphanCopy = {
      ...orphanState,
      session_id: "sess-9999-orphan",
      owner: { ...orphanState.owner, pid: 9999 },
    };
    await saveFlowState(root, orphanCopy, fixedNow());
    // Install a fresh kit.
    await writeFile(
      join(root, INSTALLED_KITS_FILENAME),
      JSON.stringify({
        kits: [
          { name: "k", agents: ["a"], installed_at: "2026-06-10T05:00:00Z" },
        ],
      }),
    );
    const q = await fs.query({ session_id: live.state.session_id });
    expect(q.orphan_candidates).toHaveLength(1);
    expect(q._warnings).toHaveLength(1);
    expect(q.suggested_actions).toHaveLength(2);
    const actions = q.suggested_actions?.map((a) => a.action).sort() ?? [];
    expect(actions).toEqual(["recover_orphan_session", "restart_session"]);
  });

  it("malformed installed-kits.json is swallowed (best-effort, never blocks query)", async () => {
    const fs = fresh();
    const start = await fs.lifecycle({ action: "start" });
    await writeFile(join(root, INSTALLED_KITS_FILENAME), "{ broken");
    const q = await fs.query({ session_id: start.state.session_id });
    expect(q._warnings).toBeUndefined();
    expect(q.state.session_id).toBe(start.state.session_id);
  });
});

describe("M18.g reflectionUnavailable degradation", () => {
  it("ask_user severity synthesizes pending_user_question with uq-rs-unavailable- prefix", async () => {
    const fs = fresh();
    const a = await fs.lifecycle({ action: "start" });
    const s = a.state.session_id;
    const r = await fs.reflectionUnavailable({
      session_id: s,
      step_id: "intent_analysis",
      reason: "MCP transport ECONNRESET",
      validator_summary: { v1: "ok", v2: "ok", v3: "skip" },
      context_artifacts: [".opc/logs/validator/.../node_execution-1.json"],
    });
    expect(r.degraded).toBe(true);
    expect(r.question_id).toMatch(/^uq-rs-unavailable-/);
    expect(r.state.pending_user_question?.question_id).toBe(r.question_id);
    expect(r.state.pending_user_question?.must_be_resolved_by).toBe("opc_flow_user_reply");
    expect(r.state.reflection_log.at(-1)?.verdict).toBe("validator_only_fallback");
    expect(r.state.reflection_log.at(-1)?.method).toBe("validator_only_fallback");
    expect(r.state.reflection_log.at(-1)?.validator_result).toEqual({ v1: "ok", v2: "ok", v3: "skip" });
    expect(r.next).toEqual({ tool: "opc_flow_user_reply" });
  });

  it("warning_only severity logs but does NOT block (no pending question)", async () => {
    const fs = fresh();
    const a = await fs.lifecycle({ action: "start" });
    const s = a.state.session_id;
    const r = await fs.reflectionUnavailable({
      session_id: s,
      step_id: "brief_generation",
      reason: "P4 brief critique server down",
      severity: "warning_only",
    });
    expect(r.degraded).toBe(true);
    expect(r.question_id).toBeNull();
    expect(r.state.pending_user_question).toBeNull();
    expect(r.state.reflection_log.at(-1)?.verdict).toBe("validator_only_fallback");
    expect(r.next).toEqual({ tool: "opc_flow_step_complete", step: "intent_analysis" });
  });

  it("preserves pre-existing pending_user_question instead of clobbering", async () => {
    const fs = fresh();
    const a = await fs.lifecycle({ action: "start" });
    const s = a.state.session_id;
    const rx = await fs.reflect({
      session_id: s,
      reflection_id: "rfl-keep",
      verdict: "rounds_exceeded",
      rounds_exceeded_payload: {
        reasoning_trace: ["keep-me"],
        kept_objections: [],
        context_artifacts: [],
      },
    });
    const originalQid = rx.state.pending_user_question!.question_id;
    const r = await fs.reflectionUnavailable({
      session_id: s,
      step_id: "intent_analysis",
      reason: "server flapping",
    });
    expect(r.question_id).toBe(originalQid);
    expect(r.state.pending_user_question?.question_id).toBe(originalQid);
    expect(r.state.pending_user_question?.reasoning_trace).toContain("keep-me");
    expect(r.state.reflection_log.at(-1)?.verdict).toBe("validator_only_fallback");
  });

  it("userReply consumes the unavailable question with reflection_server_unavailable_acknowledged trigger", async () => {
    const fs = fresh();
    const a = await fs.lifecycle({ action: "start" });
    const s = a.state.session_id;
    const r = await fs.reflectionUnavailable({
      session_id: s,
      step_id: "task_analysis",
      reason: "transport timeout",
    });
    const qid = r.question_id!;
    const reply = await fs.userReply({
      session_id: s,
      question_id: qid,
      user_reply: "acknowledged, proceed validator-only",
      resolution: { notes: "user accepted degraded path" },
    });
    expect(reply.state.pending_user_question).toBeNull();
    expect(reply.state.user_interventions.at(-1)?.trigger).toBe(
      "reflection_server_unavailable_acknowledged",
    );
    expect(reply.state.user_interventions.at(-1)?.question_id).toBe(qid);
    expect(reply.state.skip_reflection_once_for_step).toBe("task_analysis");
  });

  it("blocks subsequent stepComplete until user replies (ask_user pathway)", async () => {
    const fs = fresh();
    const a = await fs.lifecycle({ action: "start" });
    const s = a.state.session_id;
    await fs.reflectionUnavailable({
      session_id: s,
      step_id: "intent_analysis",
      reason: "RS down",
    });
    await expect(
      fs.stepComplete({ step: "intent_analysis", session_id: s, intent: "task" }),
    ).rejects.toThrow(/pending-question-guard/);
  });
});

