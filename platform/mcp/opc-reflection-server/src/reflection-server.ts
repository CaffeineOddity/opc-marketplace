import { randomUUID } from "node:crypto";

import { pickMethods, type MethodPlan } from "./methods.js";
import {
  saveReflectionArtifact,
  type EvidenceArtifact,
  type Objection,
  type PendingReflectionContract,
  type ReflectionArtifact,
  type ReflectionMethod,
  type ReflectionVerdict,
  type StepId,
} from "./store.js";
import {
  explainReflection,
  ExplainNotFoundError,
  type ExplainResponse,
} from "./explain.js";
import {
  aggregateTelemetry,
  type QueryStatsResponse,
} from "./query-stats.js";
import {
  loadUnlearnState,
  unlearnMethod,
  type UnlearnEntry,
  type UnlearnMethodResponse,
  type UnlearnTrigger,
} from "./unlearn.js";
import { runOnDemand, type OnDemandResponse } from "./on-demand.js";
import { appendTelemetry, type TelemetryEntry } from "./telemetry.js";
import { validateAll, type ValidatorContext, type ValidatorResult } from "./validators.js";

export interface ReflectionServerOptions {
  root: string;
  now?: () => Date;
  uuid?: () => string;
}

export class ReflectionServerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReflectionServerError";
  }
}

export interface ReflectPlanRequest {
  session_id: string;
  step_id: StepId;
  artifact_summary?: string;
  prior_corrections?: string;
  budget_disable_secondary?: boolean;
}

export interface ReflectPlanResponse {
  recommended_methods: { primary: ReflectionMethod; secondary: ReflectionMethod | null };
  enhanced_prompts: Record<ReflectionMethod, string>;
  max_rounds: number;
  next_step_hint: string;
  prior_corrections: string[];
  theory_docs: string[];
  unlearned_methods: string[];
}

export interface ReflectCritiqueRequest {
  session_id: string;
  step_id: StepId;
  artifact: EvidenceArtifact;
  enhanced_prompt: string;
  method?: ReflectionMethod;
}

export interface ReflectCritiqueResponse {
  critic_spec: {
    tools: readonly string[];
    prompt: string;
    context: {
      step_id: StepId;
      artifact_type: string;
      method: ReflectionMethod;
    };
  };
}

export interface ReflectCritiqueCompleteRequest {
  session_id: string;
  step_id: StepId;
  method: ReflectionMethod;
  objections: Objection[];
  reasoning_trace: string[];
  round: number;
  max_rounds?: number;
  evidence_diff?: Record<string, unknown> | null;
  validator_context?: ValidatorContext;
  artifact?: EvidenceArtifact;
  /**
   * Hard invariant per spec §六: pending_reflections[] must be empty before a
   * new reflection artifact is produced. Caller (state-server consumer) MUST
   * pass the current count read from flow-state; if > 0, this tool throws
   * `previous_pending_unregistered`. Omitting the field is permitted only for
   * legacy callers / unit tests that bypass the invariant.
   */
  current_pending_count?: number;
  /**
   * Optional telemetry fields (M18.a). When supplied, the values are emitted
   * to opc-logs/reflection/&lt;session_id&gt;/telemetry.jsonl alongside the
   * artifact so that opc_reflect_admin({action:"query_stats"}) can aggregate
   * latency / token / fallback metrics without re-reading every artifact.
   */
  telemetry?: {
    latency_ms?: number;
    tokens_in?: number;
    tokens_out?: number;
    fallback_triggered?: boolean;
  };
}

export interface ReflectCritiqueCompleteResponse {
  verdict: ReflectionVerdict;
  kept_objections: Objection[];
  reasoning_trace: string[];
  next_step_hint: string;
  pending_reflection: PendingReflectionContract;
  validator_results?: ValidatorResult[];
}

export interface ReflectRecordInterventionsRequest {
  session_id: string;
  pipeline_id: string;
  flow_state_path?: string;
  rounds_exceeded_artifacts?: string[];
  pipeline_metadata?: {
    scope?: string;
    phases_executed?: number;
    nodes_completed?: number;
    nodes_failed?: number;
    modify_units?: string[];
  };
  budget?: {
    max_new_corrections?: number;
    max_merge_operations?: number;
    max_runtime_sec?: number;
  };
}

export interface DistillerDispatchContext {
  pipeline_id: string;
  flow_session_id: string;
  l1_source: {
    user_interventions_path: string;
    reflection_log_path: string;
    rounds_exceeded_artifacts: string[];
  };
  pipeline_metadata: NonNullable<ReflectRecordInterventionsRequest["pipeline_metadata"]>;
  budget: Required<NonNullable<ReflectRecordInterventionsRequest["budget"]>>;
}

export interface DistillerTaskSpec {
  subagent_type: string;
  tools: readonly string[];
  prompt: string;
  dispatch_context: DistillerDispatchContext;
}

export interface ReflectRecordInterventionsResponse {
  dispatched: boolean;
  distiller_agent: string;
  task_spec: DistillerTaskSpec;
  notes: string;
}

// ---- M17.e: discriminator-style facades for opc_reflect_execute / complete / admin ----

export type ReflectExecuteRequest =
  | ({ method: ReflectionMethod } & ReflectCritiqueRequest);

export type ReflectExecuteResponse = ReflectCritiqueResponse & {
  method: ReflectionMethod;
};

export type ReflectCompleteRequest =
  | ({ method: ReflectionMethod } & Omit<ReflectCritiqueCompleteRequest, "method">);

export type ReflectCompleteResponse = ReflectCritiqueCompleteResponse & {
  method: ReflectionMethod;
};

export type ReflectAdminRequest =
  | ({ action: "record_interventions" } & ReflectRecordInterventionsRequest)
  | {
      action: "on_demand";
      session_id: string;
      step: StepId;
      reflection_id?: string;
      artifact_summary?: string;
      method?: ReflectionMethod;
      reason?: string;
    }
  | { action: "explain"; session_id: string; reflection_id: string }
  | { action: "query_stats"; session_id: string; window?: string; flow_state_path?: string }
  | {
      action: "unlearn_method";
      session_id: string;
      method: ReflectionMethod;
      step?: StepId;
      duration_hours?: number;
      reason?: string;
      triggered_by?: UnlearnTrigger;
    };

export type ReflectAdminResponse =
  | ({ action: "record_interventions" } & ReflectRecordInterventionsResponse)
  | ({ action: "query_stats" } & QueryStatsResponse)
  | ({ action: "explain" } & ExplainResponse)
  | { action: "explain"; not_found: true; reflection_id: string; reason: string }
  | ({ action: "unlearn_method" } & UnlearnMethodResponse)
  | ({ action: "on_demand" } & OnDemandResponse);

const READ_ONLY_TOOL_WHITELIST: readonly string[] = Object.freeze([
  "Read",
  "Glob",
  "Grep",
  "opc_knowledge_read",
  "opc_flow_query",
  "opc_pipeline_status",
]);

const DISTILLER_TOOL_WHITELIST: readonly string[] = Object.freeze([
  "opc_corrections_query",
  "opc_corrections_upsert",
  "opc_knowledge_read",
  "opc_flow_query",
]);

const DISTILLER_DEFAULT_BUDGET = Object.freeze({
  max_new_corrections: 8,
  max_merge_operations: 20,
  max_runtime_sec: 90,
});

const PENDING_TTL_MS = 15 * 60 * 1000;

export class ReflectionServer {
  readonly root: string;
  private readonly now: () => Date;
  private readonly uuid: () => string;

  constructor(opts: ReflectionServerOptions) {
    this.root = opts.root;
    this.now = opts.now ?? ((): Date => new Date());
    this.uuid = opts.uuid ?? ((): string => randomUUID());
  }

  /** Tool 1: opc_reflect_plan — returns method plan; NO flow_next. */
  async plan(req: ReflectPlanRequest): Promise<ReflectPlanResponse> {
    const planArgs: Parameters<typeof pickMethods>[0] = { step_id: req.step_id };
    if (typeof req.artifact_summary === "string") planArgs.artifact_summary = req.artifact_summary;
    if (typeof req.prior_corrections === "string")
      planArgs.prior_corrections = req.prior_corrections;
    if (typeof req.budget_disable_secondary === "boolean")
      planArgs.budget_disable_secondary = req.budget_disable_secondary;
    const plan: MethodPlan = pickMethods(planArgs);

    // M19: consult unlearn state and filter out suppressed methods
    const now = this.now();
    const unlearnState = await loadUnlearnState(this.root);
    const unlearnedMethods: string[] = [];
    let primary = plan.primary;
    let secondary = plan.secondary;

    for (const entry of unlearnState.active) {
      if (new Date(entry.expires_at) <= now) continue; // expired, skip
      const matchesStep =
        entry.step === null || entry.step === req.step_id;
      if (!matchesStep) continue;

      if (entry.method === primary) {
        unlearnedMethods.push(
          `primary:${primary} (${entry.reason}, expires ${entry.expires_at})`,
        );
        // Demote: promote secondary to primary if available and not also unlearned
        primary = secondary ?? "validator";
        secondary = null;
      } else if (entry.method === secondary) {
        unlearnedMethods.push(
          `secondary:${secondary} (${entry.reason}, expires ${entry.expires_at})`,
        );
        secondary = null;
      }
    }

    return {
      recommended_methods: { primary, secondary },
      enhanced_prompts: plan.enhanced_prompts,
      max_rounds: plan.max_rounds,
      next_step_hint: plan.next_step_hint,
      prior_corrections: req.prior_corrections ? [req.prior_corrections] : [],
      theory_docs: theoryDocsFor(primary, secondary),
      unlearned_methods: unlearnedMethods,
    };
  }

  /** Tool 2: opc_reflect_critique — returns sub-agent dispatch spec; NO flow_next. */
  async critique(req: ReflectCritiqueRequest): Promise<ReflectCritiqueResponse> {
    const method: ReflectionMethod = req.method ?? "critique";
    return {
      critic_spec: {
        tools: READ_ONLY_TOOL_WHITELIST,
        prompt: req.enhanced_prompt,
        context: {
          step_id: req.step_id,
          artifact_type: req.artifact.artifact_type,
          method,
        },
      },
    };
  }

  /**
   * Tool 3: opc_reflect_critique_complete — writes ReflectionArtifact to
   * opc-logs/reflection/{session}/{id}.json and emits pending_reflection
   * contract. NO flow_next (caller must invoke opc_flow_reflect to register).
   */
  async critiqueComplete(
    req: ReflectCritiqueCompleteRequest,
  ): Promise<ReflectCritiqueCompleteResponse> {
    if (typeof req.current_pending_count === "number" && req.current_pending_count > 0) {
      throw new ReflectionServerError(
        `previous_pending_unregistered: pending_reflections has ${req.current_pending_count} unregistered entry(ies); call opc_flow_reflect to register the previous artifact before producing a new one`,
      );
    }
    let validatorResults: ValidatorResult[] | undefined;
    if (req.artifact) {
      const ctxForValidator: ValidatorContext = {
        ...(req.validator_context ?? {}),
        current_round: req.round,
        ...(req.max_rounds !== undefined ? { max_rounds: req.max_rounds } : {}),
      };
      const v = await validateAll(req.artifact, ctxForValidator);
      validatorResults = v.results;
      if (!v.pass) {
        const blockerFromValidator: Objection = {
          id: `obj-validator-${this.uuid()}`,
          severity: "blocker",
          category: "validator",
          text: v.results
            .filter((r) => !r.pass)
            .map((r) => `${r.validator}: ${r.reason}`)
            .join("; "),
        };
        req.objections = [...req.objections, blockerFromValidator];
      }
    }

    const kept = req.objections.filter((o) => o.resolution !== "dismissed");
    const hasBlocker = kept.some((o) => o.severity === "blocker");
    const exceeded =
      typeof req.max_rounds === "number" && req.round > req.max_rounds;

    let verdict: ReflectionVerdict;
    if (exceeded) verdict = "rounds_exceeded";
    else if (hasBlocker || kept.length > 0) verdict = "objections_remain";
    else verdict = "clean";

    const now = this.now();
    const reflection_id = `rf-${this.uuid()}`;
    const artifact: ReflectionArtifact = {
      reflection_id,
      session_id: req.session_id,
      step: req.step_id,
      method: req.method,
      verdict,
      kept_objections: kept,
      reasoning_trace: req.reasoning_trace,
      evidence_diff: req.evidence_diff ?? null,
      round: req.round,
      created_at: now.toISOString(),
    };
    const artifact_path = await saveReflectionArtifact(this.root, artifact);

    const objectionsRaised = req.objections.length;
    const evidenceDiffPresent =
      req.evidence_diff !== undefined &&
      req.evidence_diff !== null &&
      Object.keys(req.evidence_diff).length > 0;
    const telemetryEntry: TelemetryEntry = {
      ts: now.toISOString(),
      session_id: req.session_id,
      step: req.step_id,
      method: req.method,
      reflection_id,
      round: req.round,
      verdict,
      objections_raised: objectionsRaised,
      objections_kept: kept.length,
      evidence_diff: evidenceDiffPresent,
      ...(validatorResults
        ? { validator_pass: validatorResults.every((r) => r.pass) }
        : {}),
      ...(req.telemetry?.latency_ms !== undefined ? { latency_ms: req.telemetry.latency_ms } : {}),
      ...(req.telemetry?.tokens_in !== undefined ? { tokens_in: req.telemetry.tokens_in } : {}),
      ...(req.telemetry?.tokens_out !== undefined ? { tokens_out: req.telemetry.tokens_out } : {}),
      ...(req.telemetry?.fallback_triggered !== undefined
        ? { fallback_triggered: req.telemetry.fallback_triggered }
        : {}),
    };
    await appendTelemetry(this.root, telemetryEntry);

    const expires_at = new Date(now.getTime() + PENDING_TTL_MS).toISOString();
    const pending_reflection: PendingReflectionContract = {
      reflection_id,
      artifact_path,
      expires_at,
      must_be_registered_by: "opc_flow_reflect",
    };

    const next_step_hint =
      verdict === "clean"
        ? "call opc_flow_reflect to register this reflection, then continue to next step"
        : verdict === "rounds_exceeded"
          ? "call opc_flow_reflect (will trigger ask_user); rounds budget exhausted"
          : "address objections, then re-dispatch a critique sub-agent and call opc_reflect_<method>_complete again";

    const resp: ReflectCritiqueCompleteResponse = {
      verdict,
      kept_objections: kept,
      reasoning_trace: req.reasoning_trace,
      next_step_hint,
      pending_reflection,
    };
    if (validatorResults) resp.validator_results = validatorResults;
    return resp;
  }

  /**
   * Tool 4: opc_reflect_record_interventions — dispatches a distiller
   * sub-agent at pipeline completion to mine user_interventions[] into
   * corrections. The actual mining is the sub-agent's job; this tool just
   * emits the dispatch signal (and is the only path that authorizes
   * opc_corrections_record).
   */
  async recordInterventions(
    req: ReflectRecordInterventionsRequest,
  ): Promise<ReflectRecordInterventionsResponse> {
    const budget = {
      max_new_corrections:
        req.budget?.max_new_corrections ?? DISTILLER_DEFAULT_BUDGET.max_new_corrections,
      max_merge_operations:
        req.budget?.max_merge_operations ?? DISTILLER_DEFAULT_BUDGET.max_merge_operations,
      max_runtime_sec:
        req.budget?.max_runtime_sec ?? DISTILLER_DEFAULT_BUDGET.max_runtime_sec,
    };
    const flowPath = req.flow_state_path ?? `.opc/sessions/${req.session_id}/flow-state.json`;
    const dispatch_context: DistillerDispatchContext = {
      pipeline_id: req.pipeline_id,
      flow_session_id: req.session_id,
      l1_source: {
        user_interventions_path: `${flowPath}#user_interventions`,
        reflection_log_path: `${flowPath}#reflection_log`,
        rounds_exceeded_artifacts: req.rounds_exceeded_artifacts ?? [],
      },
      pipeline_metadata: req.pipeline_metadata ?? {},
      budget,
    };

    return {
      dispatched: true,
      distiller_agent: "opc-distiller",
      task_spec: {
        subagent_type: "opc-distiller",
        tools: DISTILLER_TOOL_WHITELIST,
        prompt: renderDistillerPrompt(dispatch_context),
        dispatch_context,
      },
      notes:
        "host must Task(subagent_type=opc-distiller) with the tools whitelist above; distiller commits via opc_corrections_upsert; on failure, log to opc-logs/distiller/ and continue",
    };
  }

  /**
   * Tool 5 (M17.e): opc_reflect_execute — facade over critique(); passes the
   * declared method through to critic_spec.context so the dispatching host
   * knows which method this round is running.
   */
  async execute(req: ReflectExecuteRequest): Promise<ReflectExecuteResponse> {
    if (!isReflectionMethod(req.method)) {
      throw new ReflectionServerError(
        `opc_reflect_execute: unknown method=${String(req.method)}`,
      );
    }
    const { method, ...inner } = req;
    const resp = await this.critique({ ...inner, method });
    return { ...resp, method };
  }

  /**
   * Tool 6 (M17.e): opc_reflect_complete — facade over critiqueComplete().
   * Requires method discriminator (the 4 baked methods M3-cove / M4-critique /
   * M5-debate / M6-tot all share the same complete signature).
   */
  async complete(req: ReflectCompleteRequest): Promise<ReflectCompleteResponse> {
    if (!isReflectionMethod(req.method)) {
      throw new ReflectionServerError(
        `opc_reflect_complete: unknown method=${String(req.method)}`,
      );
    }
    const { method, ...inner } = req;
    const resp = await this.critiqueComplete({ ...inner, method });
    return { ...resp, method };
  }

  /**
   * Tool 7 (M17.e): opc_reflect_admin — dispatcher for non-method admin ops.
   * All 5 actions (record_interventions / query_stats / explain / unlearn_method
   * / on_demand) fully implemented (M18.a–M18.i).
   */
  async admin(req: ReflectAdminRequest): Promise<ReflectAdminResponse> {
    switch (req.action) {
      case "record_interventions": {
        const { action: _a, ...inner } = req;
        void _a;
        const resp = await this.recordInterventions(inner);
        return { action: "record_interventions", ...resp };
      }
      case "query_stats": {
        const stats = await aggregateTelemetry(this.root, {
          session_id: req.session_id,
          ...(req.window !== undefined ? { window: req.window } : {}),
          ...(req.flow_state_path !== undefined ? { flow_state_path: req.flow_state_path } : {}),
          now: this.now,
        });
        return { action: "query_stats", ...stats };
      }
      case "explain": {
        try {
          const detail = await explainReflection(this.root, {
            session_id: req.session_id,
            reflection_id: req.reflection_id,
          });
          return { action: "explain", ...detail };
        } catch (err) {
          if (err instanceof ExplainNotFoundError) {
            return {
              action: "explain",
              not_found: true,
              reflection_id: req.reflection_id,
              reason: err.message,
            };
          }
          throw err;
        }
      }
      case "on_demand": {
        const resp = await runOnDemand(
          this.root,
          {
            session_id: req.session_id,
            step: req.step,
            ...(req.reflection_id !== undefined ? { reflection_id: req.reflection_id } : {}),
            ...(req.artifact_summary !== undefined
              ? { artifact_summary: req.artifact_summary }
              : {}),
            ...(req.method !== undefined ? { method: req.method } : {}),
            ...(req.reason !== undefined ? { reason: req.reason } : {}),
          },
          this.now,
          this.uuid,
        );
        return { action: "on_demand", ...resp };
      }
      case "unlearn_method": {
        const resp = await unlearnMethod(
          this.root,
          {
            session_id: req.session_id,
            method: req.method,
            ...(req.step !== undefined ? { step: req.step } : {}),
            ...(req.duration_hours !== undefined ? { duration_hours: req.duration_hours } : {}),
            ...(req.reason !== undefined ? { reason: req.reason } : {}),
            ...(req.triggered_by !== undefined ? { triggered_by: req.triggered_by } : {}),
          },
          this.now,
        );
        return { action: "unlearn_method", ...resp };
      }
      default: {
        const _exhaustive: never = req;
        throw new ReflectionServerError(
          `opc_reflect_admin: unknown action=${String((_exhaustive as { action?: string }).action)}`,
        );
      }
    }
  }
}

const ALL_REFLECTION_METHODS: readonly ReflectionMethod[] = Object.freeze([
  "cove",
  "critique",
  "debate",
  "tot",
  "reflexion",
  "validator",
]);

function isReflectionMethod(m: unknown): m is ReflectionMethod {
  return typeof m === "string" && (ALL_REFLECTION_METHODS as readonly string[]).includes(m);
}

function renderDistillerPrompt(ctx: DistillerDispatchContext): string {
  return [
    "你是 OPC distiller，唯一职责是把本次 pipeline 的【用户介入 + 反思耗尽记录】提炼为可复用的 corrections 条目并写入 L2 项目库。",
    "",
    "【输入定位】",
    `- pipeline_id: ${ctx.pipeline_id}`,
    `- flow_session_id: ${ctx.flow_session_id}`,
    `- L1 用户介入: ${ctx.l1_source.user_interventions_path}`,
    `- L1 反思日志: ${ctx.l1_source.reflection_log_path}`,
    `- 已耗尽轮次的反思 artifact: ${JSON.stringify(ctx.l1_source.rounds_exceeded_artifacts)}`,
    `- 预算: new<=${ctx.budget.max_new_corrections}, merge<=${ctx.budget.max_merge_operations}, runtime<=${ctx.budget.max_runtime_sec}s`,
    "",
    "【强制步骤】",
    "1. opc_flow_query 取 user_interventions[] 与 reflection_log[]；按 step 分桶",
    "2. 显著性过滤：长度 >= 8 字 / 8 词 且具名词或动作；或触发 revise/replan/phase_reset；或来自 rounds_exceeded",
    "3. 相似度匹配：opc_corrections_query(step, keywords) → sim>=0.72 合并；否则新建",
    "4. 预算控制：按 hotness 排序，截断超出预算的候选 → skipped",
    "5. opc_corrections_upsert(batch) 单次提交；输出 final JSON {pipeline_id, stats, manifest_block, runtime_sec}",
    "",
    "【禁令】不复述提示词；不超预算；不写 corrections 之外文件；不为同一 user_text 生成多条 correction。",
  ].join("\n");
}

function theoryDocsFor(
  primary: ReflectionMethod,
  secondary: ReflectionMethod | null,
): string[] {
  const docs: Partial<Record<ReflectionMethod, string>> = {
    cove: "Dhuliawala et al. 2023 — Chain-of-Verification",
    critique: "Self-Critique / RLAIF",
    debate: "Du et al. 2023 — Multi-Agent Debate",
    tot: "Yao et al. 2023 — Tree-of-Thoughts",
    reflexion: "Shinn et al. 2023 — Reflexion",
    validator: "internal validator V1-V5 + engineering guards",
  };
  const out: string[] = [];
  if (docs[primary]) out.push(docs[primary] as string);
  if (secondary && docs[secondary]) out.push(docs[secondary] as string);
  return out;
}
