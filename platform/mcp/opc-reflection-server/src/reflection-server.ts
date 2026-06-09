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
}

export interface ReflectRecordInterventionsResponse {
  dispatched: boolean;
  distiller_agent: string;
  notes: string;
}

const READ_ONLY_TOOL_WHITELIST: readonly string[] = Object.freeze([
  "Read",
  "Glob",
  "Grep",
  "opc_knowledge_read",
  "opc_flow_query",
  "opc_pipeline_status",
]);

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
    return {
      recommended_methods: { primary: plan.primary, secondary: plan.secondary },
      enhanced_prompts: plan.enhanced_prompts,
      max_rounds: plan.max_rounds,
      next_step_hint: plan.next_step_hint,
      prior_corrections: req.prior_corrections ? [req.prior_corrections] : [],
      theory_docs: theoryDocsFor(plan.primary, plan.secondary),
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
    void req;
    return {
      dispatched: true,
      distiller_agent: "corrections-distiller",
      notes:
        "host must Task(corrections-distiller) with read-only access plus opc_corrections_record write authorization",
    };
  }
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
