import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { atomicWrite, withFileLock } from "@opc/memory-store";

export const REFS_FILENAME = ".opc-knowledge.json";

export interface RefsFile {
  _refs: Record<string, string[]>;
}

export function refsPath(root: string): string {
  return join(root, REFS_FILENAME);
}

export async function loadRefs(root: string): Promise<Record<string, string[]>> {
  const path = refsPath(root);
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<RefsFile>;
    if (!parsed._refs || typeof parsed._refs !== "object") return {};
    const out: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(parsed._refs)) {
      if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
        out[k] = [...v];
      }
    }
    return out;
  } catch (err) {
    if (isENOENT(err)) return {};
    throw err;
  }
}

export async function saveRefs(root: string, refs: Record<string, string[]>): Promise<void> {
  const path = refsPath(root);
  await withFileLock(path, async () => {
    const sorted: Record<string, string[]> = {};
    for (const k of Object.keys(refs).sort()) {
      sorted[k] = [...new Set(refs[k])].sort();
    }
    const file: RefsFile = { _refs: sorted };
    await atomicWrite(path, `${JSON.stringify(file, null, 2)}\n`);
  });
  void dirname; // tree-shake guard, keeps import for typecheck below
}

export async function addRefs(
  root: string,
  unit: string,
  newRefs: readonly string[],
): Promise<Record<string, string[]>> {
  const current = await loadRefs(root);
  const existing = current[unit] ?? [];
  const merged = Array.from(new Set([...existing, ...newRefs])).sort();
  current[unit] = merged;
  await saveRefs(root, current);
  return current;
}

export function relatedUnits(refs: Record<string, string[]>, units: readonly string[]): string[] {
  const set = new Set<string>();
  for (const u of units) {
    const r = refs[u];
    if (r) for (const x of r) set.add(x);
    for (const [k, v] of Object.entries(refs)) {
      if (v.includes(u)) set.add(k);
    }
  }
  for (const u of units) set.delete(u);
  return [...set].sort();
}

function isENOENT(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "ENOENT"
  );
}
