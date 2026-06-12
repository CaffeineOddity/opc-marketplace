import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { withFileLock } from "@opc/memory-store";

import { REFLECTION_LOGS_DIR, type ReflectionMethod, type ReflectionVerdict, type StepId } from "./store.js";

export const TELEMETRY_FILENAME = "telemetry.jsonl";

export interface TelemetryEntry {
  ts: string;
  session_id: string;
  step: StepId;
  method: ReflectionMethod;
  reflection_id: string;
  round: number;
  verdict: ReflectionVerdict;
  objections_raised: number;
  objections_kept: number;
  evidence_diff: boolean;
  validator_pass?: boolean;
  latency_ms?: number;
  tokens_in?: number;
  tokens_out?: number;
  fallback_triggered?: boolean;
}

export function telemetryPath(root: string, session_id: string): string {
  return join(root, REFLECTION_LOGS_DIR, session_id, TELEMETRY_FILENAME);
}

export async function appendTelemetry(root: string, entry: TelemetryEntry): Promise<string> {
  const path = telemetryPath(root, entry.session_id);
  await mkdir(dirname(path), { recursive: true });
  const line = `${JSON.stringify(entry)}\n`;
  await withFileLock(path, async () => {
    await appendFile(path, line, "utf8");
  });
  return path;
}

export async function readTelemetry(root: string, session_id: string): Promise<TelemetryEntry[]> {
  const path = telemetryPath(root, session_id);
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if (isENOENT(err)) return [];
    throw err;
  }
  const out: TelemetryEntry[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed) as TelemetryEntry);
    } catch {
      // skip malformed lines (tolerant reader)
    }
  }
  return out;
}

function isENOENT(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "ENOENT"
  );
}
