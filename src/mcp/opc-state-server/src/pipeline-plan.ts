import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { atomicWrite, withFileLock } from "@opc/memory-store";

import { sessionDir } from "./flow-state.js";

export const PIPELINES_SUBDIR = "pipelines";
export const PIPELINE_PLAN_FILENAME = "pipeline-plan.json";
export const SUB_PIPELINES_SUBDIR = "sub-pipelines";
export const MANIFEST_FILENAME = "manifest.md";

export type PipelineStatus = "pending" | "in_progress" | "completed" | "failed" | "aborted";
export type SubPipelineStatus =
  | "pending"
  | "in_progress"
  | "paused"
  | "completed"
  | "failed"
  | "aborted";

export type ExecutionPriority = "normal" | "immediate";

export interface PipelineOwner {
  session_id: string;
  pid: number;
  since: string;
}

export interface PausedAt {
  at: string;
  node: string;
  phase: string;
}

export interface SubPipeline {
  id: string;
  title: string;
  knowledge_unit: string[];
  status: SubPipelineStatus;
  blocked_by: string[];
  execution_priority?: ExecutionPriority;
  inserted_at?: string;
  paused_at?: PausedAt;
  description?: string;
  phases?: string[];
}

export interface ExecutionGroup {
  group: number;
  sub_pipeline_ids: string[];
}

export interface ReplanEntry {
  replan_history_id: string;
  at: string;
  reason?: string;
  applied_changes: unknown;
  rejected_changes?: unknown[];
}

export type PipelineComplexity = "simple" | "medium" | "high";

export interface PipelinePlan {
  id: string;
  description: string;
  complexity: PipelineComplexity;
  status: PipelineStatus;
  knowledge_unit: string[];
  owner: PipelineOwner;
  sub_pipelines: SubPipeline[];
  execution_order: ExecutionGroup[];
  replan_history: ReplanEntry[];
  created_at: string;
  last_active_at: string;
  tags?: string[];
  scenario?: string;
  suggested_phases?: string[];
  phase_selection_rationale?: string;
}

export function pipelinesDir(root: string, session_id: string): string {
  return join(sessionDir(root, session_id), PIPELINES_SUBDIR);
}

export function pipelineDir(root: string, session_id: string, pipeline_id: string): string {
  return join(pipelinesDir(root, session_id), pipeline_id);
}

export function pipelinePlanPath(root: string, session_id: string, pipeline_id: string): string {
  return join(pipelineDir(root, session_id, pipeline_id), PIPELINE_PLAN_FILENAME);
}

export function subPipelineDir(
  root: string,
  session_id: string,
  pipeline_id: string,
  sub_pipeline_id: string,
): string {
  return join(pipelineDir(root, session_id, pipeline_id), SUB_PIPELINES_SUBDIR, sub_pipeline_id);
}

export function manifestPath(root: string, session_id: string, pipeline_id: string): string {
  return join(pipelineDir(root, session_id, pipeline_id), MANIFEST_FILENAME);
}

export class PipelineNotFoundError extends Error {
  constructor(pipeline_id: string) {
    super(`pipeline ${pipeline_id} not found`);
    this.name = "PipelineNotFoundError";
  }
}

export async function loadPipelinePlan(
  root: string,
  session_id: string,
  pipeline_id: string,
): Promise<PipelinePlan> {
  const path = pipelinePlanPath(root, session_id, pipeline_id);
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as PipelinePlan;
  } catch (err) {
    if (isENOENT(err)) throw new PipelineNotFoundError(pipeline_id);
    throw err;
  }
}

export async function savePipelinePlan(
  root: string,
  session_id: string,
  plan: PipelinePlan,
  now: Date = new Date(),
): Promise<void> {
  const path = pipelinePlanPath(root, session_id, plan.id);
  await mkdir(dirname(path), { recursive: true });
  await withFileLock(path, async () => {
    plan.last_active_at = now.toISOString();
    await atomicWrite(path, `${JSON.stringify(plan, null, 2)}\n`);
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
