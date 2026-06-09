import type { ReflectionMethod, StepId } from "./store.js";

export interface MethodPlan {
  primary: ReflectionMethod;
  secondary: ReflectionMethod | null;
  enhanced_prompts: Record<ReflectionMethod, string>;
  max_rounds: number;
  next_step_hint: string;
}

interface StepMapping {
  primary: ReflectionMethod;
  secondary: ReflectionMethod | null;
  max_rounds: number;
}

const STEP_TO_METHOD: Record<StepId, StepMapping> = {
  P1: { primary: "cove", secondary: "critique", max_rounds: 2 },
  P2: { primary: "cove", secondary: "reflexion", max_rounds: 3 },
  P3: { primary: "tot", secondary: "debate", max_rounds: 3 },
  P4: { primary: "cove", secondary: "critique", max_rounds: 2 },
  P5: { primary: "critique", secondary: "debate", max_rounds: 3 },
  P6: { primary: "validator", secondary: null, max_rounds: 1 },
  P7: { primary: "validator", secondary: null, max_rounds: 1 },
  P8: { primary: "critique", secondary: "debate", max_rounds: 3 },
};

const METHOD_PROMPT_TEMPLATES: Record<ReflectionMethod, string> = {
  cove:
    "Apply Chain-of-Verification (CoVe, Dhuliawala 2023): decompose the claims in {{artifact_summary}} into verifiable sub-claims; for each, ask one verification question; answer independently; then rewrite the final claim using only sub-claims that were verified. Surface any claim you could not verify as a blocker objection.",
  critique:
    "Apply Independent Critique (Self-Critique / RLAIF-style): you are an independent critic with read-only access. List concrete objections about {{artifact_summary}} grouped by severity (blocker / major / minor) and category. Cite line/file references where possible. Do not propose fixes — only enumerate gaps, contradictions, and unverified assumptions.",
  debate:
    "Apply Multi-Agent Debate (Du 2023): take an opposing position to the artifact summarized as {{artifact_summary}}. Argue against the strongest claim using a counter-example or alternative interpretation. Be specific and adversarial. Resolution rules: keep any objection that the proponent cannot answer with concrete evidence.",
  tot:
    "Apply Tree-of-Thoughts (Yao 2023): generate at least 3 alternative branches for the decision in {{artifact_summary}}. For each, evaluate (1) feasibility, (2) risk, (3) information value. Prune branches that score worst on at least 2 of 3. Return the surviving branches with their evaluations.",
  reflexion:
    "Apply Reflexion (Shinn 2023): given prior corrections {{prior_corrections}} relevant to step {{step}}, retrieve any that match the current artifact's intent. Restate each correction as a constraint, then list places in {{artifact_summary}} that violate or risk violating those constraints.",
  validator:
    "Apply pure deterministic validation: run V1-V5 + engineering guards on {{artifact_summary}}. Return validator failures as objections.",
};

export interface PickMethodsInput {
  step_id: StepId;
  artifact_summary?: string;
  prior_corrections?: string;
  budget_disable_secondary?: boolean;
}

export function pickMethods(input: PickMethodsInput): MethodPlan {
  const mapping = STEP_TO_METHOD[input.step_id];
  const summary = input.artifact_summary ?? "<no summary provided>";
  const corrections = input.prior_corrections ?? "<no prior corrections>";
  const renderPrompt = (m: ReflectionMethod): string =>
    METHOD_PROMPT_TEMPLATES[m]
      .replaceAll("{{artifact_summary}}", summary)
      .replaceAll("{{step}}", input.step_id)
      .replaceAll("{{prior_corrections}}", corrections);

  const methods: ReflectionMethod[] = [mapping.primary];
  if (mapping.secondary && !input.budget_disable_secondary) methods.push(mapping.secondary);

  const prompts: Partial<Record<ReflectionMethod, string>> = {};
  for (const m of methods) prompts[m] = renderPrompt(m);

  return {
    primary: mapping.primary,
    secondary: input.budget_disable_secondary ? null : mapping.secondary,
    enhanced_prompts: prompts as Record<ReflectionMethod, string>,
    max_rounds: mapping.max_rounds,
    next_step_hint: `dispatch sub-agent via Task(); then call opc_reflect_${mapping.primary}_complete`,
  };
}

export function availableMethodsForStep(step: StepId): ReflectionMethod[] {
  const m = STEP_TO_METHOD[step];
  return m.secondary ? [m.primary, m.secondary] : [m.primary];
}
