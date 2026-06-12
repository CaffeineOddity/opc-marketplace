/**
 * Spec §06-host-contract §2.7.5 (A4): kit-loading health check.
 *
 * Reads .opc/installed-kits.json and detects kits whose files landed on
 * disk AFTER the current session started — those are almost certainly
 * not loaded into the running Claude Code process. Surfaces a warning
 * + suggested_action so Claude can prompt the user to restart instead
 * of failing deep inside a Task dispatch with "Agent type not found".
 *
 * Heuristic: compare each kit's `installed_at` against owner.started_at.
 * If installed_at > session_started_at → KIT_PROBABLY_NOT_LOADED.
 *
 * Failure modes:
 *   - false positive (kit installed before session but mtime drift) →
 *     warning only, never blocks opc_flow_query.
 *   - false negative (kit not loaded but detection missed) → degrades to
 *     the original "Agent type not found" path; no regression.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const INSTALLED_KITS_FILENAME = "installed-kits.json" as const;

export interface InstalledKit {
  name: string;
  version?: string;
  agents?: string[];
  mcp_servers?: string[];
  installed_at: string;
}

export interface InstalledKitsFile {
  kits: InstalledKit[];
}

export interface KitWarning {
  level: "warning";
  code: "KIT_PROBABLY_NOT_LOADED";
  kit: string;
  affected_agents: string[];
  affected_mcp_servers: string[];
  remediation: string;
  installed_at: string;
  session_started_at: string;
}

export interface KitSuggestedAction {
  action: "restart_session";
  reason: "kit_not_loaded";
  details: {
    kit: string;
    affected_agents: string[];
    affected_mcp_servers: string[];
  };
}

export interface KitHealthResult {
  warnings: KitWarning[];
  suggested_actions: KitSuggestedAction[];
}

export interface KitHealthArgs {
  root: string;
  sessionStartedAt: string;
  readFileFn?: (path: string) => Promise<string>;
}

const REMEDIATION =
  "Exit current `claude` session and re-run `claude` in this directory.";

/**
 * Reads .opc/installed-kits.json and returns warnings for kits installed
 * after the session started. Returns an empty result when:
 *   - the file does not exist (no kits installed)
 *   - the file is malformed (best-effort: silently skipped)
 *   - sessionStartedAt is unparseable
 *   - no kits have installed_at > session_started_at
 */
export async function checkKitHealth(args: KitHealthArgs): Promise<KitHealthResult> {
  const readFn = args.readFileFn ?? ((p): Promise<string> => readFile(p, "utf8"));
  const sessionStartedMs = Date.parse(args.sessionStartedAt);
  if (!Number.isFinite(sessionStartedMs)) return empty();

  const kitsPath = join(args.root, INSTALLED_KITS_FILENAME);
  let raw: string;
  try {
    raw = await readFn(kitsPath);
  } catch (err) {
    if (isENOENT(err)) return empty();
    throw err;
  }

  let parsed: InstalledKitsFile;
  try {
    parsed = JSON.parse(raw) as InstalledKitsFile;
  } catch {
    return empty();
  }
  if (!parsed || !Array.isArray(parsed.kits)) return empty();

  const warnings: KitWarning[] = [];
  const suggested_actions: KitSuggestedAction[] = [];
  for (const kit of parsed.kits) {
    if (!kit || typeof kit.name !== "string" || typeof kit.installed_at !== "string") {
      continue;
    }
    const installedMs = Date.parse(kit.installed_at);
    if (!Number.isFinite(installedMs)) continue;
    if (installedMs <= sessionStartedMs) continue;
    const affected_agents = Array.isArray(kit.agents) ? kit.agents.slice() : [];
    const affected_mcp_servers = Array.isArray(kit.mcp_servers)
      ? kit.mcp_servers.slice()
      : [];
    warnings.push({
      level: "warning",
      code: "KIT_PROBABLY_NOT_LOADED",
      kit: kit.name,
      affected_agents,
      affected_mcp_servers,
      remediation: REMEDIATION,
      installed_at: kit.installed_at,
      session_started_at: args.sessionStartedAt,
    });
    suggested_actions.push({
      action: "restart_session",
      reason: "kit_not_loaded",
      details: {
        kit: kit.name,
        affected_agents,
        affected_mcp_servers,
      },
    });
  }
  return { warnings, suggested_actions };
}

function empty(): KitHealthResult {
  return { warnings: [], suggested_actions: [] };
}

function isENOENT(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "ENOENT"
  );
}

/**
 * Optional helper used by opc_pipeline_create (M10.f). Returns the set of
 * agent names belonging to kits that are probably not loaded — caller
 * can intersect with the pipeline plan's required subagent_types to
 * decide whether to hard-reject pipeline creation.
 */
export function notLoadedAgents(result: KitHealthResult): Set<string> {
  const set = new Set<string>();
  for (const w of result.warnings) {
    for (const a of w.affected_agents) set.add(a);
  }
  return set;
}
