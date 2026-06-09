import { stat } from "node:fs/promises";

import type { EvidenceArtifact, StepId } from "./store.js";

export type ValidatorId =
  | "V1"
  | "V2"
  | "V3"
  | "V4"
  | "V5"
  | "coverage-guard"
  | "rounds-guard"
  | "freshness";

export interface ValidatorResult {
  validator: ValidatorId;
  pass: boolean;
  reason?: string;
}

export interface ValidatorContext {
  root?: string;
  current_round?: number;
  max_rounds?: number;
  known_paths?: Set<string>;
  known_nodes?: Set<string>;
  freshness_refs?: Array<{ path: string; min_version: number; current_version: number }>;
  coverage_threshold?: number;
  discrimination_threshold?: number;
}

const REQUIRED_PAYLOAD_FIELDS_BY_STEP: Record<StepId, string[]> = {
  P1: ["intent"],
  P2: ["analysis_result"],
  P3: ["decomposition_result"],
  P4: ["brief_content"],
  P5: ["matched_tags", "blocked_by_graph"],
  P6: [],
  P7: [],
  P8: ["evidence"],
};

export function validateV1Schema(artifact: EvidenceArtifact): ValidatorResult {
  if (!artifact || typeof artifact !== "object") {
    return { validator: "V1", pass: false, reason: "artifact must be an object" };
  }
  if (!artifact.step || typeof artifact.step !== "string") {
    return { validator: "V1", pass: false, reason: "missing step" };
  }
  if (!artifact.artifact_type || typeof artifact.artifact_type !== "string") {
    return { validator: "V1", pass: false, reason: "missing artifact_type" };
  }
  if (!artifact.payload || typeof artifact.payload !== "object") {
    return { validator: "V1", pass: false, reason: "missing payload" };
  }
  if (!artifact.collected_at || !artifact.collected_by) {
    return { validator: "V1", pass: false, reason: "missing collected_at/by" };
  }
  return { validator: "V1", pass: true };
}

export function validateV2Referential(
  artifact: EvidenceArtifact,
  ctx: ValidatorContext,
): ValidatorResult {
  const refs = collectStringRefs(artifact.payload, "knowledge_ref");
  if (ctx.known_paths) {
    for (const r of refs) {
      if (!ctx.known_paths.has(r)) {
        return {
          validator: "V2",
          pass: false,
          reason: `unknown knowledge_ref: ${r}`,
        };
      }
    }
  }
  if (ctx.known_nodes) {
    const nodeRefs = collectStringRefs(artifact.payload, "node_ref");
    for (const n of nodeRefs) {
      if (!ctx.known_nodes.has(n)) {
        return { validator: "V2", pass: false, reason: `unknown node_ref: ${n}` };
      }
    }
  }
  return { validator: "V2", pass: true };
}

export async function validateV3Presence(
  artifact: EvidenceArtifact,
): Promise<ValidatorResult> {
  const required = REQUIRED_PAYLOAD_FIELDS_BY_STEP[artifact.step] ?? [];
  for (const field of required) {
    const v = artifact.payload[field];
    if (v === undefined || v === null || (typeof v === "string" && v.length === 0)) {
      return {
        validator: "V3",
        pass: false,
        reason: `required field ${field} missing for step ${artifact.step}`,
      };
    }
  }
  const filePaths = collectStringRefs(artifact.payload, "file_ref");
  for (const p of filePaths) {
    try {
      await stat(p);
    } catch {
      return { validator: "V3", pass: false, reason: `referenced file does not exist: ${p}` };
    }
  }
  return { validator: "V3", pass: true };
}

export function validateV4Coverage(
  artifact: EvidenceArtifact,
  ctx: ValidatorContext,
): ValidatorResult {
  const threshold = ctx.coverage_threshold ?? 0.5;
  const hits = artifact.payload["task_criteria_hits"];
  const required = artifact.payload["task_criteria_required"];
  if (Array.isArray(hits) && Array.isArray(required) && required.length > 0) {
    const ratio = hits.length / required.length;
    if (ratio < threshold) {
      return {
        validator: "V4",
        pass: false,
        reason: `coverage ratio ${ratio.toFixed(2)} < threshold ${threshold}`,
      };
    }
  }
  return { validator: "V4", pass: true };
}

export function validateV5Discrimination(
  artifact: EvidenceArtifact,
  ctx: ValidatorContext,
): ValidatorResult {
  const threshold = ctx.discrimination_threshold ?? 0.1;
  const matched = artifact.payload["matched_tags"];
  const candidatePool = artifact.payload["candidate_pool_size"];
  if (Array.isArray(matched) && typeof candidatePool === "number" && candidatePool > 0) {
    const ratio = matched.length / candidatePool;
    if (ratio >= 1 - threshold) {
      return {
        validator: "V5",
        pass: false,
        reason: `all-pass tag matching detected (${matched.length}/${candidatePool}); no discrimination`,
      };
    }
  }
  return { validator: "V5", pass: true };
}

export function checkCoverageGuard(
  artifact: EvidenceArtifact,
  ctx: ValidatorContext,
): ValidatorResult {
  const requirements = artifact.payload["requirements"];
  const matchedTags = artifact.payload["matched_tags"];
  const threshold = ctx.coverage_threshold ?? 0.5;
  if (
    Array.isArray(requirements) &&
    Array.isArray(matchedTags) &&
    requirements.length > 0 &&
    matchedTags.length / requirements.length < threshold
  ) {
    return {
      validator: "coverage-guard",
      pass: false,
      reason: `matched_tags/requirements ratio < ${threshold}`,
    };
  }
  return { validator: "coverage-guard", pass: true };
}

export function checkRoundsGuard(ctx: ValidatorContext): ValidatorResult {
  if (typeof ctx.current_round === "number" && typeof ctx.max_rounds === "number") {
    if (ctx.current_round > ctx.max_rounds) {
      return {
        validator: "rounds-guard",
        pass: false,
        reason: `round ${ctx.current_round} exceeds max_rounds ${ctx.max_rounds}`,
      };
    }
  }
  return { validator: "rounds-guard", pass: true };
}

export function checkFreshness(ctx: ValidatorContext): ValidatorResult {
  for (const ref of ctx.freshness_refs ?? []) {
    if (ref.current_version < ref.min_version) {
      return {
        validator: "freshness",
        pass: false,
        reason: `${ref.path}@v${ref.current_version} stale; requires >=v${ref.min_version}`,
      };
    }
  }
  return { validator: "freshness", pass: true };
}

export async function validateAll(
  artifact: EvidenceArtifact,
  ctx: ValidatorContext = {},
): Promise<{ pass: boolean; results: ValidatorResult[] }> {
  const results: ValidatorResult[] = [];
  const v1 = validateV1Schema(artifact);
  results.push(v1);
  if (!v1.pass) return { pass: false, results };

  const v2 = validateV2Referential(artifact, ctx);
  results.push(v2);
  if (!v2.pass) return { pass: false, results };

  const v3 = await validateV3Presence(artifact);
  results.push(v3);
  if (!v3.pass) return { pass: false, results };

  results.push(validateV4Coverage(artifact, ctx));
  results.push(validateV5Discrimination(artifact, ctx));
  results.push(checkCoverageGuard(artifact, ctx));
  results.push(checkRoundsGuard(ctx));
  results.push(checkFreshness(ctx));

  const pass = results.every((r) => r.pass);
  return { pass, results };
}

function collectStringRefs(payload: Record<string, unknown>, key: string): string[] {
  const out: string[] = [];
  const visit = (v: unknown): void => {
    if (Array.isArray(v)) for (const x of v) visit(x);
    else if (v && typeof v === "object") {
      const obj = v as Record<string, unknown>;
      if (typeof obj[key] === "string") out.push(obj[key] as string);
      for (const value of Object.values(obj)) visit(value);
    }
  };
  visit(payload);
  return out;
}
