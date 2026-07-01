import { mkdir, readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import { atomicWrite, withFileLock } from "@opc/memory-store";

export const REFLECTION_LOGS_DIR = ".opc/logs/reflection";

export type StepId = "P1" | "P2" | "P3" | "P4" | "P5" | "P6" | "P7" | "P8";

export type ReflectionMethod =
  | "cove"
  | "critique"
  | "debate"
  | "tot"
  | "reflexion"
  | "validator";

export type ReflectionVerdict = "clean" | "objections_remain" | "rounds_exceeded";

export interface EvidenceArtifact {
  step: StepId;
  artifact_type: string;
  payload: Record<string, unknown>;
  collected_at: string;
  collected_by: string;
}

export interface Objection {
  id: string;
  severity: "blocker" | "major" | "minor";
  category: string;
  text: string;
  evidence_ref?: string;
  resolution?: "kept" | "dismissed" | "resolved";
}

export interface PendingReflectionContract {
  reflection_id: string;
  artifact_path: string;
  expires_at: string;
  must_be_registered_by: string;
}

export interface ReflectionArtifact {
  reflection_id: string;
  session_id: string;
  step: StepId;
  method: ReflectionMethod;
  verdict: ReflectionVerdict;
  kept_objections: Objection[];
  reasoning_trace: string[];
  evidence_diff: Record<string, unknown> | null;
  round: number;
  created_at: string;
}

export function reflectionDir(root: string, session_id: string): string {
  return join(root, REFLECTION_LOGS_DIR, session_id);
}

export function reflectionArtifactPath(
  root: string,
  session_id: string,
  reflection_id: string,
): string {
  return join(reflectionDir(root, session_id), `${reflection_id}.json`);
}

export class ReflectionArtifactNotFoundError extends Error {
  constructor(reflection_id: string) {
    super(`reflection artifact ${reflection_id} not found`);
    this.name = "ReflectionArtifactNotFoundError";
  }
}

export async function saveReflectionArtifact(
  root: string,
  artifact: ReflectionArtifact,
): Promise<string> {
  const path = reflectionArtifactPath(root, artifact.session_id, artifact.reflection_id);
  await mkdir(dirname(path), { recursive: true });
  await withFileLock(path, async () => {
    await atomicWrite(path, `${JSON.stringify(artifact, null, 2)}\n`);
  });
  return path;
}

export async function loadReflectionArtifact(
  root: string,
  session_id: string,
  reflection_id: string,
): Promise<ReflectionArtifact> {
  const path = reflectionArtifactPath(root, session_id, reflection_id);
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as ReflectionArtifact;
  } catch (err) {
    if (isENOENT(err)) throw new ReflectionArtifactNotFoundError(reflection_id);
    throw err;
  }
}

export async function listReflectionArtifacts(
  root: string,
  session_id: string,
): Promise<string[]> {
  const dir = reflectionDir(root, session_id);
  try {
    const entries = await readdir(dir);
    return entries.filter((e) => e.endsWith(".json")).map((e) => e.replace(/\.json$/, ""));
  } catch (err) {
    if (isENOENT(err)) return [];
    throw err;
  }
}

function isENOENT(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "ENOENT"
  );
}
