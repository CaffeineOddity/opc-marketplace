/**
 * M15.h: Scenario 08 — recovery (orphan + recover).
 *
 * Doc: doc/feature/04-e2e/02-test/08_recovery.md
 *
 * Validates the orphan-detection + recover path:
 *  1. Original session started by pid 12345 (simulated as dead).
 *  2. New process queries flow → orphan scan flags pipeline-001.
 *  3. opc_flow_lifecycle({action:"recover"}) takes ownership.
 *
 * Simulating cross-process recovery in-harness:
 *  - bootstrap() creates the original FlowServer with pid=4242 (alive).
 *  - To make session 4242 look orphan, we spin up a SECOND FlowServer
 *    sharing the same root, with a different pid (e.g. 5555) and
 *    isAlive that returns false for 4242 (the old owner).
 *  - This is the same shape as a SessionStart hook firing on the next
 *    Claude Code process after the original died.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FlowServer } from "@opc/state-server";

import { bootstrap, type Bootstrap } from "./harness.js";

let app: Bootstrap;

beforeEach(async () => {
  app = await bootstrap();
});

afterEach(async () => {
  await app.cleanup();
});

describe("scenario 08 — recovery (orphan + recover)", () => {
  it("orphan session detected on new-process query; recover takes ownership", async () => {
    // 1: Original-process session start, advance to phase_execution-ish state.
    const started = await app.flow.lifecycle({
      action: "start",
      initial_message: "断电前任务",
    });
    const session_id = started.state.session_id;
    await app.flow.stepComplete({ step: "intent_analysis", session_id, intent: "task" });
    expect(started.state.owner.pid).toBe(4242);

    // Simulate process death: instantiate a new FlowServer over the SAME
    // root, but pretend pid 4242 is dead (isAlive returns false) and the
    // current process is pid 5555.
    const newPid = 5555;
    const flow2 = new FlowServer({
      root: app.root,
      now: app.clock.now,
      pid: () => newPid,
      uuid: app.uuid,
      transport: "stdio",
      ppid: () => newPid,
      isAlive: (p) => p === newPid, // 4242 is dead, only 5555 alive
    });

    // 2: opc_flow_query — should surface the orphan via orphan_candidates.
    // Use the session_id of the orphan so we get its state back (the query
    // tool looks up the specific session); orphan_candidates comes from
    // scanning the sessions/ dir.
    const queried = await app.recorder.record(
      "opc-state-server",
      "opc_flow_query",
      { session_id },
      () => flow2.query({ session_id }),
    );
    expect(queried.state.status).toBe("in_progress");
    expect(queried.state.owner.pid).toBe(4242);
    expect(queried.orphan_candidates?.length).toBeGreaterThan(0);
    const orphan = queried.orphan_candidates?.find((c) => c.session_id === session_id);
    expect(orphan).toBeDefined();
    expect(orphan?.classification).toBe("orphan");
    expect(orphan?.owner_pid).toBe(4242);

    // 3: opc_flow_lifecycle({action:"recover"}) — new pid takes over.
    const recovered = await app.recorder.record(
      "opc-state-server",
      "opc_flow_lifecycle",
      { action: "recover", session_id },
      () => flow2.lifecycle({ action: "recover", session_id }),
    );
    expect(recovered.state.owner.pid).toBe(newPid);
    expect(recovered.state.status).toBe("in_progress");
    expect(recovered.state.current_step).toBe("task_analysis");

    // 4: post-recover query — orphan no longer flagged for this session.
    const postQueried = await app.recorder.record(
      "opc-state-server",
      "opc_flow_query",
      { session_id },
      () => flow2.query({ session_id }),
    );
    const stillOrphan = postQueried.orphan_candidates?.find(
      (c) => c.session_id === session_id,
    );
    expect(stillOrphan).toBeUndefined();
    expect(postQueried.state.owner.pid).toBe(newPid);

    const calls = app.recorder.freeze();
    expect(calls.map((c) => c.tool)).toEqual([
      "opc_flow_query",
      "opc_flow_lifecycle",
      "opc_flow_query",
    ]);
    expect(calls.every((c) => !c.error)).toBe(true);
  });

  it("recover refuses takeover when original owner is still alive (steal guard)", async () => {
    const started = await app.flow.lifecycle({
      action: "start",
      initial_message: "alive owner",
    });
    const session_id = started.state.session_id;

    // New "process" pid 5555 with isAlive saying 4242 is STILL alive.
    const otherPid = 5555;
    const flow2 = new FlowServer({
      root: app.root,
      now: app.clock.now,
      pid: () => otherPid,
      uuid: app.uuid,
      transport: "stdio",
      ppid: () => otherPid,
      isAlive: () => true, // both 4242 and 5555 alive — this is a steal attempt
    });

    await expect(flow2.lifecycle({ action: "recover", session_id })).rejects.toThrow(
      /refusing takeover/,
    );
    // Owner unchanged after rejected steal attempt.
    const queried = await flow2.query({ session_id });
    expect(queried.state.owner.pid).toBe(4242);
  });
});
