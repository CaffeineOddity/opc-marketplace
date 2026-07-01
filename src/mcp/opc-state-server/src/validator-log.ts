import { mkdir, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import { atomicWrite, withFileLock } from "@opc/memory-store";

export const VALIDATOR_LOGS_DIR = ".opc/logs/validator";

export type ValidatorStep = "node_execution" | "phase_completion";
export type ValidatorOutcome = "pass" | "fail";

export interface ValidatorResults {
  v1?: ValidatorOutcome;
  v2?: ValidatorOutcome;
  v3?: ValidatorOutcome;
  v4?: ValidatorOutcome;
  v5?: ValidatorOutcome;
  l1?: ValidatorOutcome;
  l2?: ValidatorOutcome;
}

export interface ValidatorArtifact {
  step: ValidatorStep;
  session_id: string;
  pipeline_id: string;
  sub_pipeline_id: string;
  phase: string;
  node?: string;
  validator_results: ValidatorResults;
  failure_reasons?: string[];
  ran_at: string;
  ran_by: "state-manager";
}

export interface WriteValidatorArtifactInput {
  root: string;
  session_id: string;
  step: ValidatorStep;
  pipeline_id: string;
  sub_pipeline_id: string;
  phase: string;
  node?: string;
  validator_results: ValidatorResults;
  failure_reasons?: string[];
  now: () => Date;
}

export function validatorLogDir(root: string, session_id: string): string {
  return join(root, VALIDATOR_LOGS_DIR, session_id);
}

export async function writeValidatorArtifact(
  input: WriteValidatorArtifactInput,
): Promise<{ path: string; artifact: ValidatorArtifact }> {
  const dir = validatorLogDir(input.root, input.session_id);
  await mkdir(dir, { recursive: true });
  const seq = await nextSequence(dir, input.step);
  const filename = `${input.step}-${seq}.json`;
  const path = join(dir, filename);

  const failures = input.failure_reasons?.filter((r) => r.length > 0) ?? [];

  const artifact: ValidatorArtifact = {
    step: input.step,
    session_id: input.session_id,
    pipeline_id: input.pipeline_id,
    sub_pipeline_id: input.sub_pipeline_id,
    phase: input.phase,
    ...(input.node !== undefined ? { node: input.node } : {}),
    validator_results: { ...input.validator_results },
    ...(failures.length > 0 ? { failure_reasons: failures } : {}),
    ran_at: input.now().toISOString(),
    ran_by: "state-manager",
  };

  await mkdir(dirname(path), { recursive: true });
  await withFileLock(path, async () => {
    await atomicWrite(path, `${JSON.stringify(artifact, null, 2)}\n`);
  });

  return { path, artifact };
}

async function nextSequence(dir: string, step: ValidatorStep): Promise<number> {
  const prefix = `${step}-`;
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (err) {
    if (isENOENT(err)) return 1;
    throw err;
  }
  let max = 0;
  for (const name of entries) {
    if (!name.startsWith(prefix) || !name.endsWith(".json")) continue;
    const middle = name.slice(prefix.length, -".json".length);
    const n = Number.parseInt(middle, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

function isENOENT(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "ENOENT"
  );
}
