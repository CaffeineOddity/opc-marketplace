/**
 * Spec §06-host-contract M10 end-to-end integration test.
 *
 * Exercises all 6 host-contract checkpoints in a single session-style
 * scenario so that any regression in C1/C2/A4 wiring surfaces here even
 * if individual unit tests drift apart.
 *
 * Scenario:
 *   1. C1: start a stdio session — derive sess-PID-TS id
 *   2. C2: query with explicit claude_pid in stdio mode → rejected
 *   3. C1 orphan: leave a dead-pid orphan + a live other-pid session on
 *      disk; current query surfaces only the dead one as orphan_candidate
 *   4. C1 recover aliveness: try to take over the live other-pid → reject;
 *      take over the dead pid → accept
 *   5. A4 warning: install a kit AFTER session start, query returns
 *      KIT_PROBABLY_NOT_LOADED + restart_session suggested_action
 *   6. A4 hard gate: opc_pipeline_create with required_agents from the
 *      fresh kit → KIT_NOT_LOADED_PRE_FLIGHT reject
 *   7. A4 gate clears: simulate session restart (new session, started_at
 *      after kit install) → pipeline_create succeeds
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  FlowServer,
  KitNotLoadedPreFlightError,
  OwnerStillAliveError,
  PipelineServer,
  INSTALLED_KITS_FILENAME,
  loadFlowState,
  saveFlowState,
  parseSessionId,
} from "./index.js";
import { TransportArgError } from "./transport.js";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "host-contract-e2e-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("M10 host-contract end-to-end", () => {
  it("walks C1 + C2 + A4 in one stdio session and a recovery session", async () => {
    // Step 1 — C1: stdio start derives sess-PID-TS id ----------------------
    const sessionStartAt = new Date("2026-06-10T00:00:00Z");
    const ppid = 4242;
    const fs = new FlowServer({
      root,
      now: () => sessionStartAt,
      pid: () => 9999, // server pid; unused in stdio derivation
      uuid: () => "uuid-1",
      transport: "stdio",
      ppid: () => ppid,
      isAlive: (pid) => pid === ppid || pid === 7000, // live: current + "other"
    });
    const started = await fs.lifecycle({ action: "start" });
    const sid = started.state.session_id;
    const parts = parseSessionId(sid);
    expect(parts).not.toBeNull();
    expect(parts?.pid).toBe(ppid);
    expect(started.state.owner.pid).toBe(ppid);
    expect(started.state.owner.transport).toBe("stdio");

    // Step 2 — C2: stdio rejects explicit claude_pid on query --------------
    await expect(
      fs.query({ session_id: sid, claude_pid: 12345 }),
    ).rejects.toBeInstanceOf(TransportArgError);

    // Step 3 — C1 orphan: plant a live "other" pid + a dead orphan ---------
    const liveOther = await loadFlowState(root, sid);
    await saveFlowState(
      root,
      {
        ...liveOther,
        session_id: "sess-7000-other",
        owner: { ...liveOther.owner, pid: 7000 },
      },
      sessionStartAt,
    );
    await saveFlowState(
      root,
      {
        ...liveOther,
        session_id: "sess-8000-orphan",
        owner: { ...liveOther.owner, pid: 8000 },
      },
      sessionStartAt,
    );
    const q1 = await fs.query({ session_id: sid });
    expect(q1.orphan_candidates).toHaveLength(1);
    expect(q1.orphan_candidates?.[0]?.session_id).toBe("sess-8000-orphan");

    // Step 4 — C1 recover aliveness: stealing live other fails, dead OK ----
    await expect(
      fs.lifecycle({ action: "recover", session_id: "sess-7000-other", pid: ppid }),
    ).rejects.toBeInstanceOf(OwnerStillAliveError);
    const recovered = await fs.lifecycle({
      action: "recover",
      session_id: "sess-8000-orphan",
      pid: ppid,
    });
    expect(recovered.state.owner.pid).toBe(ppid);

    // Step 5 — A4 warning: install kit AFTER session start -----------------
    await writeFile(
      join(root, INSTALLED_KITS_FILENAME),
      JSON.stringify({
        kits: [
          {
            name: "backend-pro",
            agents: ["backend-engineer", "api-designer"],
            mcp_servers: ["postgres"],
            installed_at: "2026-06-10T05:00:00Z",
          },
        ],
      }),
    );
    const q2 = await fs.query({ session_id: sid });
    expect(q2._warnings).toHaveLength(1);
    expect(q2._warnings?.[0]?.code).toBe("KIT_PROBABLY_NOT_LOADED");
    expect(q2.suggested_actions?.some((a) => a.action === "restart_session")).toBe(
      true,
    );

    // Step 6 — A4 hard gate: pipeline_create rejects ----------------------
    const pipe = new PipelineServer({
      root,
      now: () => sessionStartAt,
      pid: () => ppid,
      uuid: () => "uuid-pl",
    });
    let caught: unknown = null;
    try {
      await pipe.create({
        session_id: sid,
        description: "build api",
        brief_content: "brief",
        complexity: "medium",
        knowledge_unit: ["api"],
        suggested_phases: ["01-discovery"],
        phase_selection_rationale: "minimal",
        required_agents: ["backend-engineer"],
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(KitNotLoadedPreFlightError);
    expect((caught as KitNotLoadedPreFlightError).affected_kits).toEqual([
      "backend-pro",
    ]);

    // Step 7 — A4 gate clears in a NEW session started AFTER kit install ---
    const restartAt = new Date("2026-06-10T06:00:00Z");
    const fs2 = new FlowServer({
      root,
      now: () => restartAt,
      pid: () => 9999,
      uuid: () => "uuid-restart",
      transport: "stdio",
      ppid: () => 5555,
      isAlive: () => true,
    });
    const restarted = await fs2.lifecycle({ action: "start" });
    const pipe2 = new PipelineServer({
      root,
      now: () => restartAt,
      pid: () => 5555,
      uuid: () => "uuid-pl2",
    });
    const ok = await pipe2.create({
      session_id: restarted.state.session_id,
      description: "build api",
      brief_content: "brief",
      complexity: "medium",
      knowledge_unit: ["api"],
      suggested_phases: ["01-discovery"],
      phase_selection_rationale: "minimal",
      required_agents: ["backend-engineer"],
    });
    expect(ok.pipeline_id).toMatch(/^pl-/);
    const q3 = await fs2.query({ session_id: restarted.state.session_id });
    expect(q3._warnings).toBeUndefined();
  });
});
