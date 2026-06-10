import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, readFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";

import { atomicWrite, withFileLock } from "@opc/memory-store";

import type { StepId } from "./store.js";

const GLOBAL_CORRECTIONS_FILE = "global-corrections.jsonl";

function defaultRoot(): string {
  return process.env.OPC_GLOBAL_CORRECTIONS_ROOT ?? join(homedir(), ".opc");
}

export function globalCorrectionsPath(root?: string): string {
  return join(root ?? defaultRoot(), GLOBAL_CORRECTIONS_FILE);
}

export interface GlobalCorrectionsOptions {
  root?: string;
  now?: () => Date;
}

export interface GlobalCorrection {
  id: string;
  l2_source_id: string;
  step: StepId;
  unit: string;
  section: string;
  subsection: string;
  lesson: string;
  rationale?: string;
  keywords: string[];
  source_project?: string;
  promoted_at: string;
  promoted_by_session_id: string;
}

export async function promoteToGlobal(
  correction: {
    id: string;
    step: StepId;
    unit: string;
    section: string;
    subsection: string;
    lesson: string;
    rationale?: string;
    applies_when: { keywords: string[] };
  },
  opts: {
    session_id: string;
    source_project?: string;
    root?: string;
    now?: () => Date;
  },
): Promise<GlobalCorrection> {
  const now = (opts.now ?? (() => new Date()))();
  const entry: GlobalCorrection = {
    id: `glb-${randomUUID()}`,
    l2_source_id: correction.id,
    step: correction.step,
    unit: correction.unit,
    section: correction.section,
    subsection: correction.subsection,
    lesson: correction.lesson,
    ...(correction.rationale !== undefined ? { rationale: correction.rationale } : {}),
    keywords: correction.applies_when.keywords ?? [],
    ...(opts.source_project !== undefined ? { source_project: opts.source_project } : {}),
    promoted_at: now.toISOString(),
    promoted_by_session_id: opts.session_id,
  };

  const path = globalCorrectionsPath(opts.root);
  const parentDir = opts.root ?? defaultRoot();
  await mkdir(parentDir, { recursive: true });
  await withFileLock(path, async () => {
    const line = `${JSON.stringify(entry)}\n`;
    const existing = await fileExists(path)
      ? await readFile(path, "utf8")
      : "";
    await atomicWrite(path, `${existing}${line}`);
  });

  return entry;
}

export async function loadGlobalCorrections(
  opts?: { step?: StepId; limit?: number; root?: string },
): Promise<GlobalCorrection[]> {
  const path = globalCorrectionsPath(opts?.root);
  if (!(await fileExists(path))) return [];

  const entries: GlobalCorrection[] = [];
  const fileStream = createReadStream(path, "utf8");
  const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry = JSON.parse(trimmed) as GlobalCorrection;
      if (opts?.step && entry.step !== opts.step) continue;
      entries.push(entry);
    } catch {
      // skip malformed lines
    }
  }

  // Most recent first, optionally limited
  entries.sort(
    (a, b) =>
      new Date(b.promoted_at).getTime() - new Date(a.promoted_at).getTime(),
  );
  if (opts?.limit && opts.limit > 0) {
    return entries.slice(0, opts.limit);
  }
  return entries;
}

export async function globalCorrectionsCount(
  root?: string,
): Promise<number> {
  const path = globalCorrectionsPath(root);
  if (!(await fileExists(path))) return 0;

  let count = 0;
  const fileStream = createReadStream(path, "utf8");
  const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (line.trim()) count += 1;
  }
  return count;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (err) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "ENOENT"
    ) {
      return false;
    }
    throw err;
  }
}
