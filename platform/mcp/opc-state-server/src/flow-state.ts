import { atomicWrite, withFileLock } from "@opc/memory-store";

export type FlowStatus = "in_progress" | "completed" | "aborted";

export type FlowStep =
  | "intent_analysis"
  | "task_analysis"
  | "task_decomposition"
  | "brief_generation"
  | "pipeline_execution"
  | "phase_execution"
  | "phase_confirmed"
  | "completed"
  | "aborted";

export type Intent = "task" | "project_question" | "general_question" | "chat";

export interface FlowOwner {
  pid: number;
  started_at: string;
  last_heartbeat_at: string;
  /**
   * Spec §06-host-contract §2.1 (C1): seconds-resolution unix timestamp that
   * also seeds session_id. Persisted so opc_flow_recover can reason about
   * "same (pid, started_at_unix_ts) pair" without re-deriving from now().
   */
  started_at_unix_ts?: number;
  /**
   * Spec §06-host-contract §2.3 (C2): transport mode that determined how
   * pid was acquired. "stdio" = process.ppid; "http"/"sse" = explicit
   * param from opc_flow_query. Defaults to "stdio".
   */
  transport?: "stdio" | "http" | "sse";
}

export interface AnalysisResult {
  description?: string;
  tags?: string[];
  complexity?: "low" | "medium" | "high";
  suggested_phases?: string[];
  phase_selection_rationale?: string;
  knowledge_unit?: string[];
  scenario?: string;
  knowledge_plan?: Array<{ path: string; operation: string }>;
  [k: string]: unknown;
}

export interface SubPipelineSpec {
  id: string;
  description?: string;
  phases?: string[];
  [k: string]: unknown;
}

export interface DecompositionResult {
  sub_pipelines: SubPipelineSpec[];
  execution_order?: string[][];
  [k: string]: unknown;
}

export interface Accumulated {
  intent: Intent | null;
  intent_evidence_ref: string | null;
  analysis_result: AnalysisResult | null;
  analysis_evidence_ref: string | null;
  decomposition_result: DecompositionResult | null;
  decomposition_evidence_ref: string | null;
  brief_content: string | null;
  brief_evidence_ref: string | null;
}

export interface HistoryEntry {
  step: FlowStep | string;
  tool: string;
  input: unknown;
  output: unknown;
  at: string;
}

export interface ReflectionLogEntry {
  step_id: string;
  round?: number;
  method?: string;
  reflection_id?: string;
  artifact_path?: string;
  verdict?:
    | "clean"
    | "objections_remain"
    | "rounds_exceeded"
    | "skipped_by_user_after_expiry"
    | "discarded_by_user_after_expiry";
  evidence_diff?: { added?: string[]; modified?: string[]; removed?: string[] };
  validator_result?: Record<string, "ok" | "fail" | "skip">;
  objections_kept_by_meta?: number;
  notes?: string;
  pipeline_pointer_ref?: PipelinePointer;
  log_entry_id?: string;
  at: string;
}

export interface PendingReflection {
  reflection_id: string;
  artifact_path: string;
  step_id: string;
  issued_by: string;
  issued_at: string;
  expires_at: string;
  must_be_registered_by: "opc_flow_reflect";
  pipeline_pointer_ref?: PipelinePointer | null;
  /**
   * Spec §六·补: `pending` is the normal queued state; on `cleanupExpired`
   * pass an expired entry is promoted to `expired_pending_decision` and the
   * cleanup pass MUST emit a `pending_user_question` with the matching
   * `question_id = uq-expired-<reflection_id>`. Only `opc_flow_user_reply`
   * may consume an `expired_pending_decision` entry.
   */
  status?: "pending" | "expired_pending_decision";
}

export interface PendingUserQuestion {
  question_id: string;
  step_id: string;
  round: number;
  asked_at: string;
  expires_at: string;
  must_be_resolved_by: "opc_flow_user_reply";
  reasoning_trace: string[];
  kept_objections: Array<{ id: string; text: string; evidence_ref?: string }>;
  context_artifacts: string[];
  pipeline_pointer_ref?: PipelinePointer | null;
}

export interface UserIntervention {
  intervention_id: string;
  trigger:
    | "ask_user_rounds_exceeded"
    | "ask_user_expired_reflection"
    | "expired_reflection_resumed"
    | "expired_reflection_discarded"
    | "expired_reflection_skipped"
    | "user_initiated_revise"
    | "user_initiated_restart"
    | "user_initiated_phase_reset"
    | "user_initiated_replan";
  step_id: string;
  question_id?: string;
  user_reply?: string;
  resolution?: {
    accumulated_patch?: Partial<Accumulated> | Record<string, unknown>;
    objections_resolved?: string[];
    objections_dismissed?: string[];
    notes?: string | null;
    disposition?: "resume" | "discard" | "skip";
  };
  linked_reflection_artifacts?: string[];
  at: string;
}

export interface PipelinePointer {
  pipeline_id?: string;
  sub_pipeline_id?: string;
  phase?: string;
  node?: string;
}

export interface FlowState {
  session_id: string;
  status: FlowStatus;
  owner: FlowOwner;
  created_at: string;
  last_active_at: string;
  aborted_at: string | null;
  abort_reason: string | null;
  completed_at: string | null;

  current_step: FlowStep;
  current_step_round: number | null;

  user_message_history: string[];
  accumulated: Accumulated;

  history: HistoryEntry[];
  reflection_log: ReflectionLogEntry[];
  pending_reflections: PendingReflection[];
  pending_user_question: PendingUserQuestion | null;
  user_interventions: UserIntervention[];

  pipeline_id: string | null;
  current_pipeline_pointer: PipelinePointer | null;
  /**
   * Spec §七 路由表: after `opc_flow_user_reply` consumes either a
   * `ask_user_rounds_exceeded` question or an `expired_pending_decision`
   * with disposition=skip, set this to the step_id so the next
   * `opc_<step>_complete` knows to bypass the reflection cycle once
   * (preventing ping-pong with the rounds-guard). Consumed (cleared) the
   * next time `opc_flow_step_complete` runs for that step.
   */
  skip_reflection_once_for_step?: string | null;
}

export function emptyAccumulated(): Accumulated {
  return {
    intent: null,
    intent_evidence_ref: null,
    analysis_result: null,
    analysis_evidence_ref: null,
    decomposition_result: null,
    decomposition_evidence_ref: null,
    brief_content: null,
    brief_evidence_ref: null,
  };
}

export function newFlowState(args: {
  session_id: string;
  pid: number;
  now: Date;
  initialMessage?: string;
  started_at_unix_ts?: number;
  transport?: "stdio" | "http" | "sse";
}): FlowState {
  const iso = args.now.toISOString();
  const owner: FlowOwner = {
    pid: args.pid,
    started_at: iso,
    last_heartbeat_at: iso,
  };
  if (args.started_at_unix_ts !== undefined) owner.started_at_unix_ts = args.started_at_unix_ts;
  if (args.transport !== undefined) owner.transport = args.transport;
  return {
    session_id: args.session_id,
    status: "in_progress",
    owner,
    created_at: iso,
    last_active_at: iso,
    aborted_at: null,
    abort_reason: null,
    completed_at: null,
    current_step: "intent_analysis",
    current_step_round: null,
    user_message_history: args.initialMessage ? [args.initialMessage] : [],
    accumulated: emptyAccumulated(),
    history: [],
    reflection_log: [],
    pending_reflections: [],
    pending_user_question: null,
    user_interventions: [],
    pipeline_id: null,
    current_pipeline_pointer: null,
    skip_reflection_once_for_step: null,
  };
}

// --- session store ---

import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const SESSIONS_SUBDIR = ".opc/sessions";
export const FLOW_STATE_FILENAME = "flow-state.json";

export function sessionDir(root: string, session_id: string): string {
  return join(root, SESSIONS_SUBDIR, session_id);
}

export function flowStatePath(root: string, session_id: string): string {
  return join(sessionDir(root, session_id), FLOW_STATE_FILENAME);
}

export class SessionNotFoundError extends Error {
  constructor(session_id: string) {
    super(`session ${session_id} not found`);
    this.name = "SessionNotFoundError";
  }
}

export async function loadFlowState(root: string, session_id: string): Promise<FlowState> {
  const path = flowStatePath(root, session_id);
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as FlowState;
  } catch (err) {
    if (isENOENT(err)) throw new SessionNotFoundError(session_id);
    throw err;
  }
}

export async function saveFlowState(
  root: string,
  state: FlowState,
  now: Date = new Date(),
): Promise<void> {
  const path = flowStatePath(root, state.session_id);
  await mkdir(dirname(path), { recursive: true });
  await withFileLock(path, async () => {
    state.last_active_at = now.toISOString();
    state.owner.last_heartbeat_at = state.last_active_at;
    await atomicWrite(path, `${JSON.stringify(state, null, 2)}\n`);
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
