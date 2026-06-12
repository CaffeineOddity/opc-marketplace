import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { atomicWrite } from "./atomic.js";
import type { IndexEntry } from "./types.js";

export interface IndexFile {
  version: 1;
  built_at: string;
  entries: IndexEntry[];
}

export const INDEX_FILENAME = ".opc-knowledge.idx";

export function indexPath(root: string): string {
  return join(root, INDEX_FILENAME);
}

export function buildIndex(entries: IndexEntry[]): IndexFile {
  return {
    version: 1,
    built_at: new Date().toISOString(),
    entries: [...entries].sort(sortEntry),
  };
}

export async function saveIndex(path: string, idx: IndexFile): Promise<void> {
  await atomicWrite(path, `${JSON.stringify(idx, null, 2)}\n`);
}

export async function loadIndex(path: string): Promise<IndexFile> {
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as IndexFile;
  if (parsed.version !== 1 || !Array.isArray(parsed.entries)) {
    throw new Error(`memory-store: invalid index format at ${path}`);
  }
  return parsed;
}

function sortEntry(a: IndexEntry, b: IndexEntry): number {
  return (
    a.unit.localeCompare(b.unit) || a.section.localeCompare(b.section) || a.sub.localeCompare(b.sub)
  );
}
