import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

import { atomicWrite, withFileLock } from "@opc/memory-store";

import type { StepId } from "./store.js";

export const CORRECTIONS_DIR = "opc-memory/corrections";

export type CorrectionSource = "user" | "distiller" | "reflexion" | "seed";
export type CorrectionTrigger =
  | "intervention"
  | "rounds_exceeded"
  | "reflection_objection";

export interface AppliesWhen {
  keywords: string[];
  phase_id?: string[];
  modify_unit_pattern?: string;
  step?: StepId;
  intent_signals_contains?: string[];
}

export interface LinkedIntervention {
  ts: string;
  text: string;
}

export interface Correction {
  id: string;
  step: StepId;
  unit: string;
  section: string;
  subsection: string;
  lesson: string;
  rationale?: string;
  applies_when: AppliesWhen;
  source: CorrectionSource;
  trigger?: CorrectionTrigger;
  linked_reflection_artifacts: string[];
  linked_interventions: LinkedIntervention[];
  hotness: number;
  frozen: boolean;
  schema_version: number;
  created_at: string;
  updated_at: string;
  related: string[];
  deprecated_by: string | null;
}

export interface CorrectionLocation {
  unit: string;
  section: string;
  subsection: string;
  id: string;
}

export class CorrectionNotFoundError extends Error {
  constructor(id: string) {
    super(`correction ${id} not found`);
    this.name = "CorrectionNotFoundError";
  }
}

export function correctionsRoot(root: string): string {
  return join(root, CORRECTIONS_DIR);
}

export function correctionPath(root: string, c: CorrectionLocation): string {
  return join(
    correctionsRoot(root),
    c.unit,
    c.section,
    c.subsection,
    `${c.id}.json`,
  );
}

export async function saveCorrection(root: string, c: Correction): Promise<string> {
  const path = correctionPath(root, c);
  await mkdir(dirname(path), { recursive: true });
  await withFileLock(path, async () => {
    await atomicWrite(path, `${JSON.stringify(c, null, 2)}\n`);
  });
  return path;
}

export async function loadCorrection(
  root: string,
  loc: CorrectionLocation,
): Promise<Correction> {
  const path = correctionPath(root, loc);
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as Correction;
  } catch (err) {
    if (isENOENT(err)) throw new CorrectionNotFoundError(loc.id);
    throw err;
  }
}

export async function loadCorrectionById(
  root: string,
  id: string,
): Promise<{ correction: Correction; path: string }> {
  const all = await listAllCorrections(root);
  for (const c of all) {
    if (c.correction.id === id) return c;
  }
  throw new CorrectionNotFoundError(id);
}

export async function listAllCorrections(
  root: string,
): Promise<Array<{ correction: Correction; path: string }>> {
  const dir = correctionsRoot(root);
  const out: Array<{ correction: Correction; path: string }> = [];
  try {
    await walkJsonFiles(dir, async (path) => {
      const raw = await readFile(path, "utf8");
      out.push({ correction: JSON.parse(raw) as Correction, path });
    });
  } catch (err) {
    if (isENOENT(err)) return [];
    throw err;
  }
  return out;
}

export async function listCorrectionsByStep(
  root: string,
  step: StepId,
): Promise<Correction[]> {
  const all = await listAllCorrections(root);
  return all
    .map((x) => x.correction)
    .filter((c) => c.step === step && !c.frozen && !c.deprecated_by);
}

async function walkJsonFiles(
  dir: string,
  visit: (path: string) => Promise<void>,
): Promise<void> {
  const entries = await readdir(dir);
  for (const e of entries) {
    const p = join(dir, e);
    const st = await stat(p);
    if (st.isDirectory()) {
      await walkJsonFiles(p, visit);
    } else if (e.endsWith(".json")) {
      await visit(p);
    }
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
