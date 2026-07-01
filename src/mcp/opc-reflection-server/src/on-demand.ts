import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import { atomicWrite, withFileLock } from "@opc/memory-store";

import { pickMethods } from "./methods.js";
import type { ReflectionMethod, StepId } from "./store.js";

export const ON_DEMAND_LOGS_DIR = ".opc/logs/on-demand";

export interface OnDemandRequest {
  session_id: string;
  step: StepId;
  reflection_id?: string;
  artifact_summary?: string;
  method?: ReflectionMethod;
  reason?: string;
}

export interface OnDemandDispatchSpec {
  tools: readonly string[];
  prompt: string;
  context: {
    step: StepId;
    method: ReflectionMethod;
    on_demand: true;
    target_reflection_id: string | null;
  };
}

export interface OnDemandResponse {
  request_id: string;
  dispatched: true;
  method: ReflectionMethod;
  dispatch_spec: OnDemandDispatchSpec;
  log_path: string;
  note: string;
}

const READ_ONLY_TOOL_WHITELIST: readonly string[] = Object.freeze([
  "Read",
  "Glob",
  "Grep",
  "opc_knowledge_read",
  "opc_flow_query",
  "opc_pipeline_status",
]);

export function onDemandLogPath(root: string, session_id: string, request_id: string): string {
  return join(root, ON_DEMAND_LOGS_DIR, session_id, `${request_id}.json`);
}

export async function runOnDemand(
  root: string,
  req: OnDemandRequest,
  now: () => Date,
  uuid: () => string,
): Promise<OnDemandResponse> {
  const plan = pickMethods({
    step_id: req.step,
    ...(req.artifact_summary !== undefined ? { artifact_summary: req.artifact_summary } : {}),
    budget_disable_secondary: true,
  });
  const method: ReflectionMethod = req.method ?? plan.primary;
  const promptFromPlan = plan.enhanced_prompts[method];
  const prompt =
    typeof promptFromPlan === "string"
      ? promptFromPlan
      : `[on_demand] manual reflection over step=${req.step} with method=${method}; no template available, dispatch host should supply context.`;

  const request_id = `od-${uuid()}`;
  const ts = now().toISOString();
  const log_path = onDemandLogPath(root, req.session_id, request_id);

  const dispatch_spec: OnDemandDispatchSpec = {
    tools: READ_ONLY_TOOL_WHITELIST,
    prompt,
    context: {
      step: req.step,
      method,
      on_demand: true,
      target_reflection_id: req.reflection_id ?? null,
    },
  };

  const logEntry = {
    request_id,
    session_id: req.session_id,
    step: req.step,
    method,
    target_reflection_id: req.reflection_id ?? null,
    reason: req.reason ?? "user-initiated reflection",
    dispatched_at: ts,
  };

  await mkdir(dirname(log_path), { recursive: true });
  await withFileLock(log_path, async () => {
    await atomicWrite(log_path, `${JSON.stringify(logEntry, null, 2)}\n`);
  });

  return {
    request_id,
    dispatched: true,
    method,
    dispatch_spec,
    log_path,
    note:
      "on_demand reflection does NOT produce a pending_reflection contract; host runs the dispatched sub-agent and may call opc_reflect_complete to persist results if desired",
  };
}
