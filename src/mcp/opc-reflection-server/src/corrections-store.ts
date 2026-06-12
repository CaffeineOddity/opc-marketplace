import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

import { atomicWrite, withFileLock } from "@opc/memory-store";

import type { StepId } from "./store.js";

export const CORRECTIONS_DIR = "opc-memory/corrections";
const CORRECTIONS_INDEX_FILENAME = "corrections-index.json";

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
  endorsed_by?: string;
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

// --- Full-text index ---

export interface CorrectionIndexEntry {
  id: string;
  step: StepId;
  unit: string;
  section: string;
  subsection: string;
  tokens: string[];
}

export interface CorrectionIndex {
  entries: CorrectionIndexEntry[];
  built_at: string;
  total: number;
}

export function correctionsIndexPath(root: string): string {
  return join(correctionsRoot(root), CORRECTIONS_INDEX_FILENAME);
}

export function buildIndex(corrections: Correction[]): CorrectionIndex {
  const entries: CorrectionIndexEntry[] = corrections.map((c) => ({
    id: c.id,
    step: c.step,
    unit: c.unit,
    section: c.section,
    subsection: c.subsection,
    tokens: tokenizeAll(c),
  }));
  return {
    entries,
    built_at: new Date().toISOString(),
    total: entries.length,
  };
}

export async function saveCorrectionIndex(
  root: string,
  index: CorrectionIndex,
): Promise<string> {
  const path = correctionsIndexPath(root);
  await mkdir(dirname(path), { recursive: true });
  await withFileLock(path, async () => {
    await atomicWrite(path, `${JSON.stringify(index, null, 2)}\n`);
  });
  return path;
}

export async function loadCorrectionIndex(
  root: string,
): Promise<CorrectionIndex | null> {
  const path = correctionsIndexPath(root);
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as CorrectionIndex;
  } catch (err) {
    if (isENOENT(err)) return null;
    throw err;
  }
}

function tokenizeAll(c: Correction): string[] {
  const texts = [
    c.lesson,
    c.rationale ?? "",
    c.subsection,
    c.section,
    ...c.applies_when.keywords,
  ];
  const tokens = new Set<string>();
  for (const text of texts) {
    for (const t of text
      .toLowerCase()
      .replace(/[^a-z0-9一-鿿\s]+/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1)) {
      tokens.add(t);
    }
  }
  return Array.from(tokens);
}
