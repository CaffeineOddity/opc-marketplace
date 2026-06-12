import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SESSIONS_SUBDIR } from "./flow-state.js";
import { scanForOrphans, defaultIsAlive } from "./orphan-scanner.js";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "orphan-scanner-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function writeSession(
  session_id: string,
  owner_pid: number,
  status: "in_progress" | "completed" | "aborted",
): Promise<void> {
  const dir = join(root, SESSIONS_SUBDIR, session_id);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "flow-state.json"),
    JSON.stringify({
      session_id,
      status,
      owner: { pid: owner_pid, started_at: "x", last_heartbeat_at: "x" },
    }),
  );
}

describe("orphan-scanner (C1 配套)", () => {
  it("returns empty result when sessions dir missing", async () => {
    const r = await scanForOrphans({ root, currentPid: 100, isAlive: () => true });
    expect(r.scanned).toEqual([]);
    expect(r.orphan_candidates).toEqual([]);
    expect(r.suggested_actions).toEqual([]);
  });

  it("classifies current pid as active", async () => {
    await writeSession("sess-100-1", 100, "in_progress");
    const r = await scanForOrphans({ root, currentPid: 100, isAlive: () => true });
    expect(r.scanned).toHaveLength(1);
    expect(r.scanned[0]?.classification).toBe("active");
    expect(r.orphan_candidates).toHaveLength(0);
  });

  it("classifies live other pid as other_live", async () => {
    await writeSession("sess-200-1", 200, "in_progress");
    const r = await scanForOrphans({
      root,
      currentPid: 100,
      isAlive: (pid) => pid === 200,
    });
    expect(r.scanned[0]?.classification).toBe("other_live");
    expect(r.orphan_candidates).toHaveLength(0);
    expect(r.suggested_actions).toEqual([]);
  });

  it("classifies dead other pid as orphan and emits suggested_action", async () => {
    await writeSession("sess-200-1", 200, "in_progress");
    const r = await scanForOrphans({ root, currentPid: 100, isAlive: () => false });
    expect(r.orphan_candidates).toHaveLength(1);
    expect(r.orphan_candidates[0]?.session_id).toBe("sess-200-1");
    expect(r.suggested_actions[0]).toMatchObject({
      action: "recover_orphan_session",
      session_id: "sess-200-1",
      reason: "owner_pid_dead",
    });
    expect(r.suggested_actions[0]?.details.suggested_call).toContain(
      'opc_flow_lifecycle({action:"recover"',
    );
  });

  it("skips completed and aborted sessions", async () => {
    await writeSession("sess-200-1", 200, "completed");
    await writeSession("sess-300-1", 300, "aborted");
    const r = await scanForOrphans({ root, currentPid: 100, isAlive: () => false });
    expect(r.scanned).toHaveLength(0);
  });

  it("mixes classifications correctly across multiple sessions", async () => {
    await writeSession("sess-100-1", 100, "in_progress"); // active
    await writeSession("sess-200-2", 200, "in_progress"); // live other
    await writeSession("sess-300-3", 300, "in_progress"); // orphan
    const r = await scanForOrphans({
      root,
      currentPid: 100,
      isAlive: (pid) => pid === 200, // 100 = current (handled by currentPid branch), 300 dead
    });
    const byId = Object.fromEntries(r.scanned.map((e) => [e.session_id, e.classification]));
    expect(byId).toEqual({
      "sess-100-1": "active",
      "sess-200-2": "other_live",
      "sess-300-3": "orphan",
    });
    expect(r.orphan_candidates.map((e) => e.session_id)).toEqual(["sess-300-3"]);
  });

  it("ignores non-sess- directories", async () => {
    await mkdir(join(root, SESSIONS_SUBDIR, "garbage-dir"), { recursive: true });
    await writeFile(join(root, SESSIONS_SUBDIR, "garbage-dir", "flow-state.json"), "{}");
    const r = await scanForOrphans({ root, currentPid: 1, isAlive: () => false });
    expect(r.scanned).toHaveLength(0);
  });
});

describe("defaultIsAlive", () => {
  it("returns true for current process pid", () => {
    expect(defaultIsAlive(process.pid)).toBe(true);
  });

  it("returns false for invalid pids", () => {
    expect(defaultIsAlive(0)).toBe(false);
    expect(defaultIsAlive(-1)).toBe(false);
    expect(defaultIsAlive(1.5)).toBe(false);
    expect(defaultIsAlive(Number.NaN)).toBe(false);
  });

  it("returns false for almost-certainly-dead high pid", () => {
    // pid 2_147_483_640 is near INT_MAX, extremely unlikely to be live.
    expect(defaultIsAlive(2_147_483_640)).toBe(false);
  });
});
