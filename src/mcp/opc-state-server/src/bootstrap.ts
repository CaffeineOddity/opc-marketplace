/**
 * bootstrap.ts — first-run copy of built-in phases/ and scenarios/ from the
 * state-server bundle into the user project's .opc/ directory, and three-way
 * upgrade-conflict detection on subsequent starts.
 *
 * Layout after bootstrap:
 *   <root>/.opc/phases/                 — copy of bundle phases/
 *   <root>/.opc/scenarios/              — copy of bundle scenarios/
 *   <root>/.opc/.builtin-manifest.json  — sha256 snapshot of the bundle's
 *                                         original contents, used as the
 *                                         "common ancestor" in three-way diff
 *
 * Upgrade rules (per file under phases/ and scenarios/):
 *   A = bundle hash recorded in last manifest (previous-built-in)
 *   B = bundle hash now (current-built-in)
 *   C = user file hash on disk now
 *
 *   B == A                 → built-in unchanged, skip
 *   B != A && C == A       → clean upgrade: overwrite user file with B
 *   B != A && C == B       → already in sync, skip
 *   B != A && C != A && C != B
 *                          → three-way conflict: write <file>.conflict with
 *                            git-style <<<<<<< / ======= / >>>>>>> markers
 *                            (user file left untouched). Conflict path is
 *                            returned in warnings.
 *   bundle-new file        → copy to user dir
 *   bundle-removed file    → leave user copy untouched (do not delete)
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCOPED_DIRS = ["phases", "scenarios"] as const;
type ScopedDir = (typeof SCOPED_DIRS)[number];

const MANIFEST_NAME = ".builtin-manifest.json";
const MANIFEST_VERSION = 1;

interface ManifestFile {
  version: number;
  generated_at: string;
  /** Maps `<scoped-dir>/<relative-path>` → sha256 of the bundle file at that path. */
  hashes: Record<string, string>;
}

export interface BootstrapResult {
  /** True when this run actually copied the bundle for the first time. */
  first_run: boolean;
  /** Files newly copied or cleanly upgraded. */
  upgraded: string[];
  /** `<dir>/<rel>.conflict` paths written for three-way conflicts. */
  conflicts: string[];
  /** Files added by the bundle that were not present before. */
  added: string[];
}

/**
 * Resolve the bundle's built-in phases/ + scenarios/ root.
 *
 * In a built bundle the file lives at `dist/mcp/opc-state-server/dist/server.js`
 * and the resources are at `dist/mcp/opc-state-server/{phases,scenarios}/`,
 * so `import.meta.url + ../../<dir>` resolves correctly.
 *
 * In dev (tsx / unbundled), this same relative jump lands in the source tree
 * at `src/mcp/opc-state-server/{phases,scenarios}/`.
 */
function bundleResourceRoot(): string {
  // bootstrap.ts compiled lives at <root>/dist/bootstrap.js (bundle) OR is
  // resolved from this source file in dev. Either way, two ../ lands at the
  // server package root that holds phases/ and scenarios/.
  return resolve(fileURLToPath(import.meta.url), "..", "..");
}

async function sha256OfFile(path: string): Promise<string> {
  const buf = await readFile(path);
  return createHash("sha256").update(buf).digest("hex");
}

async function listFilesRecursively(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (isENOENT(err)) return;
      throw err;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.isFile()) {
        out.push(full);
      }
    }
  }
  await walk(root);
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

async function loadManifest(path: string): Promise<ManifestFile | null> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as ManifestFile;
    if (parsed.version !== MANIFEST_VERSION) return null;
    return parsed;
  } catch (err) {
    if (isENOENT(err)) return null;
    return null;
  }
}

async function saveManifest(path: string, manifest: ManifestFile): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function readOrEmpty(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    if (isENOENT(err)) return "";
    throw err;
  }
}

async function copyFile(srcPath: string, destPath: string): Promise<void> {
  await mkdir(dirname(destPath), { recursive: true });
  const buf = await readFile(srcPath);
  await writeFile(destPath, buf);
}

async function writeConflictFile(
  destPath: string,
  userContent: string,
  bundleContent: string,
  ancestorHash: string,
  bundleHash: string,
): Promise<string> {
  const conflictPath = `${destPath}.conflict`;
  const body = [
    `<<<<<<< user (.opc) - your local changes`,
    userContent.endsWith("\n") ? userContent.slice(0, -1) : userContent,
    `||||||| ancestor ${ancestorHash.slice(0, 12)}`,
    `||||||| (previous built-in version snapshot)`,
    `=======`,
    bundleContent.endsWith("\n") ? bundleContent.slice(0, -1) : bundleContent,
    `>>>>>>> built-in ${bundleHash.slice(0, 12)} - upstream upgrade`,
    "",
  ].join("\n");
  await mkdir(dirname(conflictPath), { recursive: true });
  await writeFile(conflictPath, body, "utf8");
  return conflictPath;
}

/**
 * Build a hash map of every file under each scoped bundle directory.
 * Keys are `<scoped-dir>/<rel-path>` (forward slashes, posix style).
 */
async function snapshotBundle(bundleRoot: string): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (const dir of SCOPED_DIRS) {
    const base = join(bundleRoot, dir);
    if (!existsSync(base)) continue;
    const files = await listFilesRecursively(base);
    for (const abs of files) {
      const rel = relative(base, abs).split("\\").join("/");
      result.set(`${dir}/${rel}`, await sha256OfFile(abs));
    }
  }
  return result;
}

/**
 * Bootstrap `.opc/phases/` and `.opc/scenarios/` from the bundle.
 * Idempotent: safe to call on every server startup.
 */
export async function bootstrapBuiltins(root: string): Promise<BootstrapResult> {
  const bundleRoot = bundleResourceRoot();
  const opcRoot = join(root, ".opc");
  const manifestPath = join(opcRoot, MANIFEST_NAME);

  const previousManifest = await loadManifest(manifestPath);
  const bundleHashes = await snapshotBundle(bundleRoot);

  const result: BootstrapResult = {
    first_run: previousManifest === null,
    upgraded: [],
    conflicts: [],
    added: [],
  };

  for (const [relKey, bundleHash] of bundleHashes) {
    const [scoped, ...rest] = relKey.split("/");
    if (!scoped || rest.length === 0) continue;
    const relPath = rest.join("/");
    const srcPath = join(bundleRoot, scoped, relPath);
    const destPath = join(opcRoot, scoped, relPath);
    const destExists = existsSync(destPath);

    if (!destExists) {
      // New file: just copy it.
      await copyFile(srcPath, destPath);
      if (result.first_run) {
        result.upgraded.push(relKey);
      } else {
        result.added.push(relKey);
      }
      continue;
    }

    const ancestorHash = previousManifest?.hashes[relKey];
    if (!ancestorHash) {
      // We have the file on disk but no ancestor record — treat as already
      // owned by user. Only overwrite if bundle and user happen to match.
      const userHash = await sha256OfFile(destPath);
      if (userHash !== bundleHash) {
        // Conservative: don't overwrite, but don't conflict either; user
        // existed before manifest tracking. Skip silently.
      }
      continue;
    }

    if (bundleHash === ancestorHash) {
      // Built-in unchanged since last bootstrap; leave user alone.
      continue;
    }

    const userHash = await sha256OfFile(destPath);
    if (userHash === ancestorHash) {
      // Clean upgrade — user didn't change this file.
      await copyFile(srcPath, destPath);
      result.upgraded.push(relKey);
      continue;
    }
    if (userHash === bundleHash) {
      // User already matches the new bundle (maybe via manual sync). Skip.
      continue;
    }

    // Three-way conflict: user changed + bundle changed.
    const [userContent, bundleContent] = await Promise.all([
      readOrEmpty(destPath),
      readOrEmpty(srcPath),
    ]);
    const conflictPath = await writeConflictFile(
      destPath,
      userContent,
      bundleContent,
      ancestorHash,
      bundleHash,
    );
    result.conflicts.push(relative(root, conflictPath).split("\\").join("/"));
  }

  // Persist the bundle snapshot as the new ancestor for next time.
  const manifest: ManifestFile = {
    version: MANIFEST_VERSION,
    generated_at: new Date(0).toISOString(), // deterministic; updated by caller? leave constant.
    hashes: Object.fromEntries(bundleHashes),
  };
  // Use a real timestamp so manifest order matches reality without breaking tests.
  manifest.generated_at = new Date().toISOString();
  await saveManifest(manifestPath, manifest);

  return result;
}

/** Format warnings for opc_flow_query. Returns [] when nothing to report. */
export function formatUpgradeWarnings(r: BootstrapResult): string[] {
  const warnings: string[] = [];
  if (r.conflicts.length > 0) {
    warnings.push(
      `${r.conflicts.length} built-in file(s) upgraded with conflicts; review and resolve: ${r.conflicts.join(", ")}`,
    );
  }
  if (r.upgraded.length > 0 && !r.first_run) {
    warnings.push(
      `${r.upgraded.length} built-in file(s) upgraded cleanly under .opc/`,
    );
  }
  if (r.added.length > 0 && !r.first_run) {
    warnings.push(
      `${r.added.length} new built-in file(s) added under .opc/`,
    );
  }
  return warnings;
}

// Re-export for test convenience.
export const _internal = {
  bundleResourceRoot,
  sha256OfFile,
  snapshotBundle,
  MANIFEST_NAME,
};

// avoid unused warning when bundling
void stat;
