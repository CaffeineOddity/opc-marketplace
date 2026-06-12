import type { AppliesWhen, Correction } from "./corrections-store.js";

export const SIM_MERGE_THRESHOLD = 0.72;
export const SIM_WARN_THRESHOLD = 0.5;

export interface SimilarityInput {
  keywords: string[];
  lesson: string;
  applies_when: AppliesWhen;
}

export interface SimilarityResult {
  score: number;
  keyword_jaccard: number;
  lesson_jaccard: number;
  applies_when_overlap: number;
}

export function similarity(
  candidate: SimilarityInput,
  existing: Correction,
): SimilarityResult {
  const kw = jaccard(new Set(normalize(candidate.keywords)), new Set(normalize(existing.applies_when.keywords)));
  const lt = jaccard(tokenize(candidate.lesson), tokenize(existing.lesson));
  const aw = appliesWhenOverlap(candidate.applies_when, existing.applies_when);
  const score = 0.5 * kw + 0.3 * lt + 0.2 * aw;
  return {
    score,
    keyword_jaccard: kw,
    lesson_jaccard: lt,
    applies_when_overlap: aw,
  };
}

export function appliesWhenOverlap(a: AppliesWhen, b: AppliesWhen): number {
  const phaseA = new Set(a.phase_id ?? []);
  const phaseB = new Set(b.phase_id ?? []);
  const phaseJ = phaseA.size === 0 && phaseB.size === 0 ? 1 : jaccard(phaseA, phaseB);
  const globMatch = globRelated(a.modify_unit_pattern, b.modify_unit_pattern);
  return (phaseJ + globMatch) / 2;
}

function globRelated(a?: string, b?: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ap = stripGlob(a);
  const bp = stripGlob(b);
  if (ap.startsWith(bp) || bp.startsWith(ap)) return 0.5;
  return 0;
}

function stripGlob(p: string): string {
  return p.replace(/\/\*\*$/, "").replace(/\/\*$/, "");
}

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9一-鿿\s]+/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1),
  );
}

function normalize(arr: string[]): string[] {
  return arr.map((s) => s.toLowerCase().trim()).filter((s) => s.length > 0);
}

function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}
