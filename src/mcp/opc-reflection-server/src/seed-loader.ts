import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Correction } from "./corrections-store.js";

const SEED_DIR = join(
  fileURLToPath(import.meta.url),
  "..",
  "..",
  "seed-corrections",
);

export async function loadSeedCorrections(): Promise<Correction[]> {
  const out: Correction[] = [];
  try {
    await walkJsonFiles(SEED_DIR, async (path) => {
      const raw = await readFile(path, "utf8");
      const parsed = JSON.parse(raw) as Correction;
      if (parsed.id && parsed.step && parsed.lesson) {
        out.push(parsed);
      }
    });
  } catch (err) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "ENOENT"
    ) {
      return [];
    }
    throw err;
  }
  return out;
}

export async function seedCorrectionsCount(): Promise<number> {
  let count = 0;
  try {
    await walkJsonFiles(SEED_DIR, async () => {
      count += 1;
    });
  } catch {
    return 0;
  }
  return count;
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
