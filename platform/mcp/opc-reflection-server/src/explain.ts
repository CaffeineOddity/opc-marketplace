import {
  loadReflectionArtifact,
  ReflectionArtifactNotFoundError,
  type Objection,
  type ReflectionArtifact,
  type ReflectionMethod,
  type ReflectionVerdict,
  type StepId,
} from "./store.js";
import { readTelemetry, type TelemetryEntry } from "./telemetry.js";

export interface ExplainRequest {
  session_id: string;
  reflection_id: string;
}

export interface ExplainResponse {
  reflection_id: string;
  session_id: string;
  step: StepId;
  method: ReflectionMethod;
  round: number;
  verdict: ReflectionVerdict;
  created_at: string;
  method_choice_reason: string;
  prior_corrections_used: string[];
  evidence_input: { available: boolean; note: string };
  objections_raised: { count: number; source: "telemetry" | "reconstructed_from_artifact" };
  objections_kept: Objection[];
  fallback_chain: string[];
  final_decision: string;
  reasoning_trace: string[];
  data_completeness: {
    artifact: true;
    telemetry_matched: boolean;
    prior_corrections_known: boolean;
    evidence_input_recorded: boolean;
  };
}

export class ExplainNotFoundError extends Error {
  constructor(reflection_id: string) {
    super(`opc_reflect_admin({action:"explain"}): reflection artifact ${reflection_id} not found`);
    this.name = "ExplainNotFoundError";
  }
}

export async function explainReflection(
  root: string,
  req: ExplainRequest,
): Promise<ExplainResponse> {
  let artifact: ReflectionArtifact;
  try {
    artifact = await loadReflectionArtifact(root, req.session_id, req.reflection_id);
  } catch (err) {
    if (err instanceof ReflectionArtifactNotFoundError) {
      throw new ExplainNotFoundError(req.reflection_id);
    }
    throw err;
  }

  const telemetryAll = await readTelemetry(root, req.session_id);
  const tel = telemetryAll.find((t) => t.reflection_id === req.reflection_id);

  const objectionsRaised = tel
    ? { count: tel.objections_raised, source: "telemetry" as const }
    : { count: artifact.kept_objections.length, source: "reconstructed_from_artifact" as const };

  return {
    reflection_id: artifact.reflection_id,
    session_id: artifact.session_id,
    step: artifact.step,
    method: artifact.method,
    round: artifact.round,
    verdict: artifact.verdict,
    created_at: artifact.created_at,
    method_choice_reason: methodChoiceReason(artifact.step, artifact.method, artifact.round),
    prior_corrections_used: [],
    evidence_input: {
      available: artifact.evidence_diff !== null,
      note:
        artifact.evidence_diff !== null
          ? "evidence_diff recorded post-reflection; pre-reflection input not persisted (see M18.c limitation)"
          : "no evidence_diff recorded for this reflection",
    },
    objections_raised: objectionsRaised,
    objections_kept: artifact.kept_objections,
    fallback_chain: buildFallbackChain(artifact, tel),
    final_decision: buildFinalDecision(artifact),
    reasoning_trace: artifact.reasoning_trace,
    data_completeness: {
      artifact: true,
      telemetry_matched: Boolean(tel),
      prior_corrections_known: false,
      evidence_input_recorded: artifact.evidence_diff !== null,
    },
  };
}

function methodChoiceReason(step: StepId, method: ReflectionMethod, round: number): string {
  return `step=${step}, round=${round}, method=${method} (primary picked by method registry; see methods.ts pickMethods + corrections-driven adjustments)`;
}

function buildFallbackChain(
  artifact: ReflectionArtifact,
  tel: TelemetryEntry | undefined,
): string[] {
  const chain: string[] = [];
  const fallback = tel?.fallback_triggered === true;
  if (fallback) {
    chain.push(`${artifact.method} → fallback_triggered`);
  } else {
    chain.push(`${artifact.method} → ${artifact.verdict}`);
  }
  return chain;
}

function buildFinalDecision(artifact: ReflectionArtifact): string {
  switch (artifact.verdict) {
    case "clean":
      return "no kept objections; proceed (call opc_flow_reflect to register and continue)";
    case "objections_remain":
      return `${artifact.kept_objections.length} kept objection(s); re-dispatch critique OR address evidence_diff`;
    case "rounds_exceeded":
      return "rounds budget exhausted; opc_flow_reflect will route to ask_user (A3 closure)";
  }
}
