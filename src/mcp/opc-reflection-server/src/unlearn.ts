import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { atomicWrite, withFileLock } from "@opc/memory-store";

import type { ReflectionMethod, StepId } from "./store.js";

export const UNLEARN_STATE_DIR = ".opc/state";
export const UNLEARN_STATE_FILENAME = "unlearn-state.json";
export const DEFAULT_UNLEARN_TTL_HOURS = 24;
export const UNLEARN_HISTORY_RETENTION_DAYS = 30;

export type UnlearnTrigger = "auto" | "manual";

export interface UnlearnEntry {
  method: ReflectionMethod;
  step: StepId | null;
  reason: string;
  activated_at: string;
  expires_at: string;
  triggered_by: UnlearnTrigger;
  session_id: string;
}

export interface UnlearnHistoryEntry extends UnlearnEntry {
  deactivated_at: string;
  deactivation_reason: "expired" | "manual_restore" | "superseded";
}

export interface UnlearnState {
  active: UnlearnEntry[];
  history: UnlearnHistoryEntry[];
}

export function unlearnStatePath(root: string): string {
  return join(root, UNLEARN_STATE_DIR, UNLEARN_STATE_FILENAME);
}

export async function loadUnlearnState(root: string): Promise<UnlearnState> {
  const path = unlearnStatePath(root);
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<UnlearnState>;
    return {
      active: Array.isArray(parsed.active) ? parsed.active : [],
      history: Array.isArray(parsed.history) ? parsed.history : [],
    };
  } catch (err) {
    if (isENOENT(err)) return { active: [], history: [] };
    throw err;
  }
}

export async function saveUnlearnState(root: string, state: UnlearnState): Promise<void> {
  const path = unlearnStatePath(root);
  await mkdir(dirname(path), { recursive: true });
  await withFileLock(path, async () => {
    await atomicWrite(path, `${JSON.stringify(state, null, 2)}\n`);
  });
}

export interface UnlearnMethodRequest {
  session_id: string;
  method: ReflectionMethod;
  step?: StepId;
  duration_hours?: number;
  reason?: string;
  triggered_by?: UnlearnTrigger;
}

export interface UnlearnMethodResponse {
  unlearned: UnlearnEntry;
  previously_active: UnlearnEntry | null;
  active_count: number;
  expires_at: string;
  note: string;
}

export async function unlearnMethod(
  root: string,
  req: UnlearnMethodRequest,
  now: () => Date,
): Promise<UnlearnMethodResponse> {
  const state = await loadUnlearnState(root);
  const cleaned = pruneState(state, now());

  const step = req.step ?? null;
  const ttlHours = req.duration_hours ?? DEFAULT_UNLEARN_TTL_HOURS;
  if (!Number.isFinite(ttlHours) || ttlHours <= 0) {
    throw new Error(
      `opc_reflect_admin({action:"unlearn_method"}): duration_hours must be > 0 (got ${ttlHours})`,
    );
  }
  const triggered_by: UnlearnTrigger = req.triggered_by ?? "manual";
  const reason = req.reason ?? "manual unlearn via opc_reflect_admin";

  const nowDate = now();
  const expiresAt = new Date(nowDate.getTime() + ttlHours * 3_600_000).toISOString();

  const existingIdx = cleaned.active.findIndex(
    (e) => e.method === req.method && (e.step ?? null) === step,
  );
  let previously_active: UnlearnEntry | null = null;
  if (existingIdx >= 0) {
    const removed = cleaned.active[existingIdx];
    if (removed) {
      previously_active = removed;
      cleaned.history.push({
        ...removed,
        deactivated_at: nowDate.toISOString(),
        deactivation_reason: "superseded",
      });
      cleaned.active.splice(existingIdx, 1);
    }
  }

  const entry: UnlearnEntry = {
    method: req.method,
    step,
    reason,
    activated_at: nowDate.toISOString(),
    expires_at: expiresAt,
    triggered_by,
    session_id: req.session_id,
  };
  cleaned.active.push(entry);
  cleaned.history = trimHistory(cleaned.history, nowDate);

  await saveUnlearnState(root, cleaned);

  return {
    unlearned: entry,
    previously_active,
    active_count: cleaned.active.length,
    expires_at: expiresAt,
    note:
      "method × step is unlearned for this session+root; opc_reflect_plan must consult loadUnlearnState before picking methods (full integration tracked in M19)",
  };
}

function pruneState(state: UnlearnState, now: Date): UnlearnState {
  const live: UnlearnEntry[] = [];
  const newlyExpired: UnlearnHistoryEntry[] = [];
  for (const e of state.active) {
    const exp = Date.parse(e.expires_at);
    if (Number.isFinite(exp) && exp <= now.getTime()) {
      newlyExpired.push({
        ...e,
        deactivated_at: new Date(Math.min(exp, now.getTime())).toISOString(),
        deactivation_reason: "expired",
      });
    } else {
      live.push(e);
    }
  }
  return {
    active: live,
    history: [...state.history, ...newlyExpired],
  };
}

function trimHistory(history: UnlearnHistoryEntry[], now: Date): UnlearnHistoryEntry[] {
  const cutoff = now.getTime() - UNLEARN_HISTORY_RETENTION_DAYS * 86_400_000;
  return history.filter((h) => {
    const t = Date.parse(h.deactivated_at);
    return !Number.isFinite(t) || t >= cutoff;
  });
}

function isENOENT(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "ENOENT"
  );
}
