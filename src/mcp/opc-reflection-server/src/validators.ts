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

export interface ValidatorFailure {
  field: string;
  expected: string;
  actual: string;
  severity: "error" | "warning";
}

export interface ValidatorResult {
  validator: ValidatorId;
  verdict: "pass" | "fail";
  failures: ValidatorFailure[];
  ran_at: string;
  duration_us: number;
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

function fail(
  validator: ValidatorId,
  field: string,
  expected: string,
  actual: string,
  severity: "error" | "warning" = "error",
): ValidatorResult {
  return {
    validator,
    verdict: "fail",
    failures: [{ field, expected, actual, severity }],
    ran_at: new Date().toISOString(),
    duration_us: 0,
  };
}

function pass(validator: ValidatorId): ValidatorResult {
  return {
    validator,
    verdict: "pass",
    failures: [],
    ran_at: new Date().toISOString(),
    duration_us: 0,
  };
}

export function validateV1Schema(artifact: EvidenceArtifact): ValidatorResult {
  if (!artifact || typeof artifact !== "object") {
    return fail("V1", "artifact", "object", typeof artifact);
  }
  if (!artifact.step || typeof artifact.step !== "string") {
    return fail("V1", "step", "non-empty string", String(artifact.step));
  }
  if (!artifact.artifact_type || typeof artifact.artifact_type !== "string") {
    return fail("V1", "artifact_type", "non-empty string", String(artifact.artifact_type));
  }
  if (!artifact.payload || typeof artifact.payload !== "object") {
    return fail("V1", "payload", "object", typeof artifact.payload);
  }
  if (!artifact.collected_at || !artifact.collected_by) {
    return fail("V1", "collected_at/collected_by", "both present", `${!!artifact.collected_at}/${!!artifact.collected_by}`);
  }
  return pass("V1");
}

export function validateV2Referential(
  artifact: EvidenceArtifact,
  ctx: ValidatorContext,
): ValidatorResult {
  const refs = collectStringRefs(artifact.payload, "knowledge_ref");
  if (ctx.known_paths) {
    for (const r of refs) {
      if (!ctx.known_paths.has(r)) {
        return fail("V2", `knowledge_ref:${r}`, "known path", "unknown path");
      }
    }
  }
  if (ctx.known_nodes) {
    const nodeRefs = collectStringRefs(artifact.payload, "node_ref");
    for (const n of nodeRefs) {
      if (!ctx.known_nodes.has(n)) {
        return fail("V2", `node_ref:${n}`, "known node", "unknown node");
      }
    }
  }
  return pass("V2");
}

export async function validateV3Presence(
  artifact: EvidenceArtifact,
): Promise<ValidatorResult> {
  const required = REQUIRED_PAYLOAD_FIELDS_BY_STEP[artifact.step] ?? [];
  for (const field of required) {
    const v = artifact.payload[field];
    if (v === undefined || v === null || (typeof v === "string" && v.length === 0)) {
      return fail("V3", field, `non-null non-empty ${typeof v === "string" ? "string" : "value"}`, String(v));
    }
  }
  const filePaths = collectStringRefs(artifact.payload, "file_ref");
  for (const p of filePaths) {
    try {
      await stat(p);
    } catch {
      return fail("V3", `file_ref:${p}`, "existing file", "not found");
    }
  }
  return pass("V3");
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
      return fail("V4", "coverage_ratio", `>= ${threshold}`, ratio.toFixed(2), "warning");
    }
  }
  return pass("V4");
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
      return fail("V5", "discrimination_ratio", `< ${1 - threshold}`, ratio.toFixed(2), "warning");
    }
  }
  return pass("V5");
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
    return fail("coverage-guard", "coverage", `>= ${threshold}`, (matchedTags.length / requirements.length).toFixed(2));
  }
  return pass("coverage-guard");
}

export function checkRoundsGuard(ctx: ValidatorContext): ValidatorResult {
  if (typeof ctx.current_round === "number" && typeof ctx.max_rounds === "number") {
    if (ctx.current_round > ctx.max_rounds) {
      return fail("rounds-guard", "current_round", `<= ${ctx.max_rounds}`, String(ctx.current_round));
    }
  }
  return pass("rounds-guard");
}

export function checkFreshness(ctx: ValidatorContext): ValidatorResult {
  for (const ref of ctx.freshness_refs ?? []) {
    if (ref.current_version < ref.min_version) {
      return fail("freshness", ref.path, `>= v${ref.min_version}`, `v${ref.current_version}`);
    }
  }
  return pass("freshness");
}

export async function validateAll(
  artifact: EvidenceArtifact,
  ctx: ValidatorContext = {},
): Promise<{ pass: boolean; results: ValidatorResult[] }> {
  const results: ValidatorResult[] = [];

  results.push(validateV1Schema(artifact));
  results.push(validateV2Referential(artifact, ctx));
  results.push(await validateV3Presence(artifact));
  results.push(validateV4Coverage(artifact, ctx));
  results.push(validateV5Discrimination(artifact, ctx));
  results.push(checkCoverageGuard(artifact, ctx));
  results.push(checkRoundsGuard(ctx));
  results.push(checkFreshness(ctx));

  const pass = results.every((r) => r.verdict === "pass");
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
