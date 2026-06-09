import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { atomicWrite, withFileLock } from "@opc/memory-store";

import { subPipelineDir } from "./pipeline-plan.js";

export const STATE_FILENAME = "state.json";
export const BRIEF_FILENAME = "brief.md";

export type NodeStatus = "pending" | "in_progress" | "completed" | "failed";
export type PhaseStatus = "pending" | "in_progress" | "completed" | "blocked";
export type SubStateStatus =
  | "pending"
  | "in_progress"
  | "paused"
  | "completed"
  | "failed"
  | "aborted";

export type PhaseSelectedBy =
  | "task_analysis"
  | "scenario_template"
  | "user_specified"
  | "replan"
  | "task_decomposition";

export interface IoArtifact {
  type: string;
  path: string;
  version?: number;
}

export interface NodeState {
  name: string;
  status: NodeStatus;
  agent: string;
  blocked_by: string[];
  input: IoArtifact[];
  output: IoArtifact[];
  error: null | { message: string; type: string };
  timeout_minutes: number;
  retry_count: number;
  max_retries: number;
}

export interface PhaseState {
  phase: string;
  status: PhaseStatus;
  nodes: NodeState[];
  confirm_commit_ref?: string;
  reflection_log?: Array<{ at: string; round: number; method?: string; notes?: string }>;
}

export interface PhasePlan {
  available: string[];
  selected: string[];
  selected_by: PhaseSelectedBy;
  selection_rationale: string;
  scenario_hints: string[];
  order_validated: boolean;
}

export interface TaskMeta {
  description: string;
  tags: string[];
  complexity: "low" | "medium" | "high";
  knowledge_unit: string[];
  scenario_hints: string[];
}

export interface StateJson {
  id: string;
  title: string;
  task: TaskMeta;
  status: SubStateStatus;
  phase_plan: PhasePlan;
  phases: PhaseState[];
  created_at: string;
  last_active_at: string;
}

export function statePath(
  root: string,
  session_id: string,
  pipeline_id: string,
  sub_pipeline_id: string,
): string {
  return join(subPipelineDir(root, session_id, pipeline_id, sub_pipeline_id), STATE_FILENAME);
}

export function briefPath(
  root: string,
  session_id: string,
  pipeline_id: string,
  sub_pipeline_id: string,
): string {
  return join(subPipelineDir(root, session_id, pipeline_id, sub_pipeline_id), BRIEF_FILENAME);
}

export class SubPipelineStateNotFoundError extends Error {
  constructor(sub_pipeline_id: string) {
    super(`sub-pipeline state ${sub_pipeline_id} not found`);
    this.name = "SubPipelineStateNotFoundError";
  }
}

export async function loadStateJson(
  root: string,
  session_id: string,
  pipeline_id: string,
  sub_pipeline_id: string,
): Promise<StateJson> {
  const path = statePath(root, session_id, pipeline_id, sub_pipeline_id);
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as StateJson;
  } catch (err) {
    if (isENOENT(err)) throw new SubPipelineStateNotFoundError(sub_pipeline_id);
    throw err;
  }
}

export async function saveStateJson(
  root: string,
  session_id: string,
  pipeline_id: string,
  state: StateJson,
  now: Date = new Date(),
): Promise<void> {
  const path = statePath(root, session_id, pipeline_id, state.id);
  await mkdir(dirname(path), { recursive: true });
  await withFileLock(path, async () => {
    state.last_active_at = now.toISOString();
    await atomicWrite(path, `${JSON.stringify(state, null, 2)}\n`);
  });
}

export async function writeBrief(
  root: string,
  session_id: string,
  pipeline_id: string,
  sub_pipeline_id: string,
  content: string,
): Promise<void> {
  const path = briefPath(root, session_id, pipeline_id, sub_pipeline_id);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

export interface NewStateJsonArgs {
  sub_pipeline_id: string;
  title: string;
  description: string;
  tags?: string[];
  complexity: "low" | "medium" | "high";
  knowledge_unit: string[];
  scenario_hints?: string[];
  suggested_phases: string[];
  phase_selection_rationale: string;
  selected_by?: PhaseSelectedBy;
  now: Date;
}

export function newStateJson(args: NewStateJsonArgs): StateJson {
  const iso = args.now.toISOString();
  return {
    id: args.sub_pipeline_id,
    title: args.title,
    task: {
      description: args.description,
      tags: args.tags ?? [],
      complexity: args.complexity,
      knowledge_unit: args.knowledge_unit,
      scenario_hints: args.scenario_hints ?? [],
    },
    status: "pending",
    phase_plan: {
      available: args.suggested_phases.slice(),
      selected: args.suggested_phases.slice(),
      selected_by: args.selected_by ?? "task_decomposition",
      selection_rationale: args.phase_selection_rationale,
      scenario_hints: args.scenario_hints ?? [],
      order_validated: true,
    },
    phases: args.suggested_phases.map((p) => ({
      phase: p,
      status: "pending",
      nodes: [],
    })),
    created_at: iso,
    last_active_at: iso,
  };
}

function isENOENT(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "ENOENT"
  );
}
