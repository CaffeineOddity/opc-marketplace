/**
 * Spec §06-host-contract §2.2 (C1 配套): orphan session detection.
 *
 * Scan .opc/sessions/sess-XXX/flow-state.json and classify each in-progress
 * session relative to the current Claude Code pid:
 *
 *   - active     : owner.pid == currentPid → the current live session
 *   - other_live : owner.pid != currentPid AND kill(pid, 0) succeeds
 *                  → another running Claude Code instance; do not touch
 *   - orphan     : owner.pid != currentPid AND kill(pid, 0) fails (ESRCH)
 *                  → previous process is dead; eligible for opc_flow_recover
 *
 * Note: only relevant in stdio mode where kill(pid,0) carries truth. In
 * http/sse the heartbeat ledger replaces this; orphan-scanner is a no-op
 * for non-stdio transports (the caller should not invoke it there).
 */

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import type { FlowState } from "./flow-state.js";
import { SESSIONS_SUBDIR, FLOW_STATE_FILENAME } from "./flow-state.js";

export type OrphanClassification = "active" | "other_live" | "orphan";

export interface SessionScanEntry {
  session_id: string;
  owner_pid: number;
  status: string;
  classification: OrphanClassification;
}

export interface SuggestedAction {
  action: "recover_orphan_session";
  session_id: string;
  reason: "owner_pid_dead";
  details: { owner_pid: number; suggested_call: string };
}

export interface OrphanScanResult {
  scanned: SessionScanEntry[];
  orphan_candidates: SessionScanEntry[];
  suggested_actions: SuggestedAction[];
}

export interface OrphanScanArgs {
  root: string;
  currentPid: number;
  isAlive?: (pid: number) => boolean;
}

/**
 * Returns true if process pid is still alive on this host. Uses
 * process.kill(pid, 0) which sends no signal but reports ESRCH for dead
 * pids. Negative/zero/NaN pids are treated as not alive.
 */
export function defaultIsAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err) {
      const code = (err as { code: unknown }).code;
      if (code === "EPERM") {
        // EPERM means the process exists but we lack permission to signal
        // it — still alive from an orphan-detection perspective.
        return true;
      }
    }
    return false;
  }
}

export async function scanForOrphans(args: OrphanScanArgs): Promise<OrphanScanResult> {
  const isAlive = args.isAlive ?? defaultIsAlive;
  const sessionsRoot = join(args.root, SESSIONS_SUBDIR);
  const scanned: SessionScanEntry[] = [];
  let entries: string[];
  try {
    entries = await readdir(sessionsRoot);
  } catch (err) {
    if (isENOENT(err)) return emptyResult();
    throw err;
  }
  for (const name of entries) {
    if (!name.startsWith("sess-")) continue;
    const statePath = join(sessionsRoot, name, FLOW_STATE_FILENAME);
    let state: FlowState;
    try {
      state = JSON.parse(await readFile(statePath, "utf8")) as FlowState;
    } catch (err) {
      if (isENOENT(err)) continue;
      throw err;
    }
    if (state.status !== "in_progress") continue;
    const ownerPid = state.owner.pid;
    let classification: OrphanClassification;
    if (ownerPid === args.currentPid) {
      classification = "active";
    } else if (isAlive(ownerPid)) {
      classification = "other_live";
    } else {
      classification = "orphan";
    }
    scanned.push({
      session_id: state.session_id,
      owner_pid: ownerPid,
      status: state.status,
      classification,
    });
  }
  const orphan_candidates = scanned.filter((e) => e.classification === "orphan");
  const suggested_actions: SuggestedAction[] = orphan_candidates.map((e) => ({
    action: "recover_orphan_session",
    session_id: e.session_id,
    reason: "owner_pid_dead",
    details: {
      owner_pid: e.owner_pid,
      suggested_call: `opc_flow_lifecycle({action:"recover", session_id:"${e.session_id}"})`,
    },
  }));
  return { scanned, orphan_candidates, suggested_actions };
}

function emptyResult(): OrphanScanResult {
  return { scanned: [], orphan_candidates: [], suggested_actions: [] };
}

function isENOENT(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "ENOENT"
  );
}
