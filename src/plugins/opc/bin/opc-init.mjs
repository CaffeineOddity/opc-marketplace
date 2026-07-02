#!/usr/bin/env node
// src/plugins/opc/bin/opc-init.mjs
//
// `/opc init` — opt a project into OPC. This is the ONE place that seeds
// `.opc/phases/` and `.opc/scenarios/` from the installed plugin's bundle
// (copied at build time to <plugin>/phases + <plugin>/scenarios). The
// opc-state-server only READS `.opc/` — it never writes phases/scenarios, so
// there is no bootstrap at server startup. init is idempotent and performs a
// three-way merge on re-run so user edits to seeded files survive upgrades.
//
// Layout after init:
//   <root>/.opc/phases/                 — copy of bundle phases/
//   <root>/.opc/scenarios/              — copy of bundle scenarios/
//   <root>/.opc/.builtin-manifest.json  — sha256 snapshot of the bundle's
//                                         original contents; the "common
//                                         ancestor" for next init's three-way
//                                         merge.
//
// Merge rules (per file, A=ancestor/bundle-last-init, B=bundle-now, C=user-now):
//   B == A           → bundle unchanged since last init; leave user alone
//   B != A && C == A → clean upgrade: overwrite user file with B
//   B != A && C == B → already in sync; skip
//   B != A && C != A && C != B
//                    → three-way conflict: write <file>.conflict with git-style
//                      markers (user file left untouched). Reported in output.
//   bundle-new file  → copy to user dir
//   bundle-removed   → leave user copy untouched (never delete)
//
// Hooks installed (all project-scoped, shareable via git):
//   - UserPromptSubmit → ${CLAUDE_PROJECT_DIR}/.opc/bin/opc-hook.sh   (per-message nudge)
//   - SessionStart     → ${CLAUDE_PROJECT_DIR}/.opc/bin/opc-check.sh  (once-per-session staleness check)
//   - UserPromptSubmit / PreToolUse / PostToolUse / Stop
//                     → ${CLAUDE_PROJECT_DIR}/.opc/bin/opc-trace.sh  (session tracing for opc-marketplace tuning)
//
// opc-trace.sh writes JSONL logs under .opc/logs/<session>/ (NOT git-tracked —
// covered by the existing `.opc/**/*` ignore). It records every user input,
// tool call (input + output), and assistant stop, newest-first.

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, copyFile, chmod, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative, basename } from "node:path";

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const opcDir = join(root, ".opc");
const marker = join(opcDir, ".project-init");
const settingsPath = join(root, ".claude", "settings.json");
const gitignorePath = join(root, ".gitignore");

// This script runs from inside the installed plugin dir (CLAUDE_PLUGIN_ROOT is
// available to slash commands), so the dir holding it IS the plugin root.
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT ?? dirname(new URL(".", import.meta.url).pathname);
const pluginBin = join(pluginRoot, "bin");

// Built-in phases/ + scenarios/ ship inside the plugin dir (copied there by
// build-release.mjs). init reads them ONCE to seed <project>/.opc/; the server
// never touches them afterwards.
const SCOPED_DIRS = ["phases", "scenarios"];
const MANIFEST_NAME = ".builtin-manifest.json";
const MANIFEST_VERSION = 1;

// Local copies live under <project>/.opc/bin/. Commands use ${CLAUDE_PROJECT_DIR}
// (expanded by the host even in project-scoped settings) so they stay portable
// across machines/users without baking an absolute path.
const projectBin = join(opcDir, "bin");
const HOOK_COMMAND = "${CLAUDE_PROJECT_DIR}/.opc/bin/opc-hook.sh";
const CHECK_COMMAND = "${CLAUDE_PROJECT_DIR}/.opc/bin/opc-check.sh";
const TRACE_COMMAND = "${CLAUDE_PROJECT_DIR}/.opc/bin/opc-trace.sh";
const HOOK_FILES = [
  { src: join(pluginBin, "opc-hook.sh"), dest: join(projectBin, "opc-hook.sh") },
  { src: join(pluginBin, "opc-check.sh"), dest: join(projectBin, "opc-check.sh") },
  { src: join(pluginBin, "opc-trace.sh"), dest: join(projectBin, "opc-trace.sh") },
];

// Gitignore lines /opc init ensures are present. `.opc/**/*` ignores everything
// inside .opc; the re-includes un-ignore the team-shareable trees. Git quirk:
// to un-ignore a dir's contents you must un-ignore BOTH the dir (`!.opc/knowledge/`)
// AND its contents (`!.opc/knowledge/**`). Derived index/refs files stay ignored.
const GITIGNORE_BLOCK = [
  "# --- OPC (managed by /opc init) ---",
  ".opc/**/*",
  "!.opc/knowledge/",
  "!.opc/knowledge/**",
  "!.opc/memory/",
  "!.opc/memory/**",
  ".opc/knowledge/.opc-knowledge.idx",
  ".opc/knowledge/.opc-knowledge.idx.broken",
  ".opc/knowledge/.opc-knowledge.json",
  "# --- end OPC ---",
];
const GITIGNORE_MARKER = "# --- OPC (managed by /opc init) ---";

function log(msg) {
  process.stdout.write(`${msg}\n`);
}

async function ensureOpcScaffold() {
  await mkdir(opcDir, { recursive: true });
  // Marker — records that this project has opted into OPC. The state-server no
  // longer gates anything on it (bootstrap was removed), but it's still a
  // useful "this project ran /opc init" signal for other tooling/checks.
  if (!existsSync(marker)) {
    const stamp = `OPC project initialized.\ncreated_at=${new Date(0).toISOString()}\n`;
    await writeFile(marker, stamp, "utf8");
    log(`✓ created ${rel(marker)}`);
  } else {
    log(`• ${rel(marker)} already exists`);
  }
}

function rel(p) {
  return p.startsWith(root + "/") ? p.slice(root.length + 1) : p;
}

/** Copy opc-hook.sh + opc-check.sh from the installed plugin into
 *  <project>/.opc/bin/. Overwrites on every run so a re-init after an upgrade
 *  refreshes the copies (the SessionStart opc-check.sh nudges users to do this).
 *  Idempotent: identical bytes re-written is a no-op effect. */
async function copyHookScripts() {
  await mkdir(projectBin, { recursive: true });
  for (const { src, dest } of HOOK_FILES) {
    if (!existsSync(src)) {
      log(`! missing plugin hook source: ${src} (plugin install incomplete?)`);
      continue;
    }
    await copyFile(src, dest);
    // Ensure executable — copyFile preserves mode, but be defensive in case the
    // source lost its x bit (e.g. extracted from a tarball without --no-same-owner).
    await chmod(dest, 0o755);
    log(`✓ refreshed ${rel(dest)}`);
  }
}

// --- built-in phase/scenario seeding (three-way merge against the bundle) ---

async function sha256OfFile(path) {
  const buf = await readFile(path);
  return createHash("sha256").update(buf).digest("hex");
}

/** Recursively list all regular files under `dir` (absolute paths). */
async function listFilesRecursively(dir) {
  const out = [];
  async function walk(d) {
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch (err) {
      if (err?.code === "ENOENT") return;
      throw err;
    }
    for (const e of entries) {
      const full = join(d, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.isFile()) {
        out.push(full);
      }
    }
  }
  await walk(dir);
  return out;
}

function isENOENT(err) {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    err.code === "ENOENT"
  );
}

async function loadManifest(path) {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed.version !== MANIFEST_VERSION) return null;
    return parsed;
  } catch (err) {
    if (isENOENT(err)) return null;
    return null;
  }
}

async function saveManifest(path, manifest) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function readOrEmpty(path) {
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    if (isENOENT(err)) return "";
    throw err;
  }
}

async function copyFileInto(srcPath, destPath) {
  await mkdir(dirname(destPath), { recursive: true });
  const buf = await readFile(srcPath);
  await writeFile(destPath, buf);
}

/** Write a git-style three-way conflict file next to destPath (destPath itself
 *  is left untouched). Returns the relative conflict path for reporting. */
async function writeConflictFile(destPath, userContent, bundleContent, ancestorHash, bundleHash) {
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

/** Snapshot every file under each SCOPED_DIR in the bundle into a
 *  Map<`<scoped>/<rel>` (posix), sha256>. Missing bundle dirs are skipped. */
async function snapshotBundle(bundleRoot) {
  const result = new Map();
  for (const dir of SCOPED_DIRS) {
    const base = join(bundleRoot, dir);
    if (!existsSync(base)) continue;
    const files = await listFilesRecursively(base);
    for (const abs of files) {
      const relPath = relative(base, abs).split("\\").join("/");
      result.set(`${dir}/${relPath}`, await sha256OfFile(abs));
    }
  }
  return result;
}

/**
 * Seed <root>/.opc/{phases,scenarios}/ from the plugin bundle, performing a
 * three-way merge on re-run. Writes/refreshes .builtin-manifest.json so the
 * NEXT init has a common ancestor. Returns counts for the summary line.
 *
 * `first_run` distinguishes the very first init (no manifest yet) — on first
 * run every file is a fresh copy, which is not worth alarming the user about.
 */
async function seedBuiltins() {
  const manifestPath = join(opcDir, MANIFEST_NAME);
  const previousManifest = await loadManifest(manifestPath);
  const firstRun = previousManifest === null;

  // If the plugin bundle has no phases/scenarios at all, there's nothing to
  // seed — log and bail (don't write an empty manifest, so a later install
  // that does ship them still counts as first-run).
  let bundleHashes;
  try {
    bundleHashes = await snapshotBundle(pluginRoot);
  } catch (err) {
    log(`! could not read built-in bundle at ${rel(pluginRoot)}: ${err?.message ?? err}`);
    return { first_run: firstRun, copied: 0, upgraded: 0, conflicts: 0, added: 0 };
  }
  if (bundleHashes.size === 0) {
    log(`! no built-in phases/scenarios found under ${rel(pluginRoot)} (plugin install incomplete?)`);
    return { first_run: firstRun, copied: 0, upgraded: 0, conflicts: 0, added: 0 };
  }

  let copied = 0; // first-run fresh copies
  let upgraded = 0; // clean upgrade (user hadn't edited)
  let conflicts = 0; // three-way conflict → .conflict written
  let added = 0; // bundle-new file on a re-run

  for (const [relKey, bundleHash] of bundleHashes) {
    const [scoped, ...rest] = relKey.split("/");
    if (!scoped || rest.length === 0) continue;
    const relPath = rest.join("/");
    const srcPath = join(pluginRoot, scoped, relPath);
    const destPath = join(opcDir, scoped, relPath);
    const destExists = existsSync(destPath);

    if (!destExists) {
      // New file: just copy it.
      await copyFileInto(srcPath, destPath);
      if (firstRun) copied++;
      else added++;
      continue;
    }

    const ancestorHash = previousManifest?.hashes[relKey];
    if (!ancestorHash) {
      // File on disk but no ancestor record — treat as user-owned from before
      // manifest tracking. Conservative: don't overwrite, don't conflict.
      continue;
    }

    if (bundleHash === ancestorHash) {
      // Built-in unchanged since last init; leave user's copy alone.
      continue;
    }

    const userHash = await sha256OfFile(destPath);
    if (userHash === ancestorHash) {
      // Clean upgrade — user didn't touch this file.
      await copyFileInto(srcPath, destPath);
      upgraded++;
      continue;
    }
    if (userHash === bundleHash) {
      // User already matches the new bundle (manual sync). Skip.
      continue;
    }

    // Three-way conflict: user changed + bundle changed.
    const [userContent, bundleContent] = await Promise.all([
      readOrEmpty(destPath),
      readOrEmpty(srcPath),
    ]);
    await writeConflictFile(destPath, userContent, bundleContent, ancestorHash, bundleHash);
    conflicts++;
  }

  // Persist the bundle snapshot as the new ancestor for next time.
  const manifest = {
    version: MANIFEST_VERSION,
    generated_at: new Date().toISOString(),
    hashes: Object.fromEntries(bundleHashes),
  };
  await saveManifest(manifestPath, manifest);

  return { first_run: firstRun, copied, upgraded, conflicts, added };
}

async function installProjectHook() {
  await mkdir(dirname(settingsPath), { recursive: true });

  let settings = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(await readFile(settingsPath, "utf8"));
      if (typeof settings !== "object" || settings === null) settings = {};
    } catch {
      // Corrupt settings — back off rather than clobber.
      log(`! ${rel(settingsPath)} is unreadable; skipping hook install`);
      return;
    }
  }

  // Each event maps to { command → present? }. We register both events; an
  // event is considered present if ANY of its hook entries already carries the
  // exact command string. Missing ones get appended; existing ones untouched.
  const hooks = (settings.hooks ??= {});

  // Canonical commands for THIS version of /opc init. Commands point at
  // <project>/.opc/bin/ via ${CLAUDE_PROJECT_DIR} (the one var the host expands
  // in project-scoped settings).
  const targets = [
    { event: "UserPromptSubmit", command: HOOK_COMMAND },
    { event: "SessionStart", command: CHECK_COMMAND },
    // opc-trace.sh is registered on all four events so the full input/output +
    // tool-call stream is captured for opc-marketplace tuning. Logs land under
    // .opc/logs/<session>/ (git-ignored). UserPromptSubmit carries BOTH the
    // nudge hook (opc-hook.sh) and the trace hook (opc-trace.sh).
    { event: "UserPromptSubmit", command: TRACE_COMMAND },
    { event: "PreToolUse", command: TRACE_COMMAND },
    { event: "PostToolUse", command: TRACE_COMMAND },
    { event: "Stop", command: TRACE_COMMAND },
  ];

  // The exact basename an OPC hook script must end with for each event. Any
  // hook entry whose command basename matches one of these — regardless of the
  // path/variable prefix used by a PRIOR version of /opc init — is a stale OPC
  // entry and gets pruned. This keeps the hook list from accumulating one entry
  // per historical command form (e.g. ${CLAUDE_PLUGIN_ROOT}/bin/opc-hook.sh,
  // an absolute /Users/.../bin/opc-hook.sh, ${CLAUDE_PROJECT_DIR}/.opc/bin/...).
  // Non-OPC hooks (any other command) are left untouched. opc-trace.sh is a
  // single script reused across four events, so its basename prunes stale trace
  // entries on every one of those events.
  //
  // IMPORTANT: UserPromptSubmit carries BOTH opc-hook.sh (nudge) AND opc-trace.sh
  // (tracing). isOpcHookEntry must therefore recognise BOTH as canonical for
  // that event — otherwise the second target's prune step would delete the first
  // target's freshly-added entry. The "stale" form we're pruning is an OPC hook
  // pointing at a NON-canonical path (e.g. ${CLAUDE_PLUGIN_ROOT}/...), so we
  // only prune an entry when its basename is OPC-managed AND its command is not
  // exactly one of the canonical commands we're about to (re)install.
  const hookBasenameByEvent = {
    UserPromptSubmit: ["opc-hook.sh", "opc-trace.sh"],
    SessionStart: ["opc-check.sh"],
    PreToolUse: ["opc-trace.sh"],
    PostToolUse: ["opc-trace.sh"],
    Stop: ["opc-trace.sh"],
  };
  // Canonical commands per event — entries matching one of these are KEPT (they
  // are the current form); only OPC-basename entries NOT matching are pruned.
  const canonicalCommandsByEvent = targets.reduce((acc, t) => {
    (acc[t.event] ??= []).push(t.command);
    return acc;
  }, {});
  const isStaleOpcHookEntry = (event, entry) => {
    const want = hookBasenameByEvent[event];
    if (!want) return false;
    if (!Array.isArray(entry?.hooks)) return false;
    // An entry is stale iff at least one of its hooks has an OPC basename that
    // is NOT one of this event's canonical commands. Entries whose hooks are all
    // canonical (or have no OPC basename at all) are kept.
    return entry.hooks.some(
      (h) =>
        typeof h?.command === "string" &&
        want.some((w) => h.command.endsWith("/" + w)) &&
        !(canonicalCommandsByEvent[event] ?? []).includes(h.command),
    );
  };

  // Process each event ONCE (not once per target), so the prune+ensure pair
  // for UserPromptSubmit — which has two canonical commands — runs a single
  // time instead of twice (the second pass would otherwise find the first
  // target's entry "already present" and double-log).
  const eventsInOrder = [];
  for (const { event } of targets) {
    if (!eventsInOrder.includes(event)) eventsInOrder.push(event);
  }

  let changedAny = false;
  for (const event of eventsInOrder) {
    const list = (hooks[event] ??= []);
    const canonicals = canonicalCommandsByEvent[event];

    // 1. Drop stale OPC hook entries from prior /opc init versions. Keep only
    //    entries that are NOT stale-OPC for this event. Canonical commands are
    //    preserved even if they share an OPC basename (UserPromptSubmit has two).
    const kept = list.filter((entry) => !isStaleOpcHookEntry(event, entry));
    if (kept.length !== list.length) {
      changedAny = true;
      log(`✓ pruned stale ${event} OPC hook(s) from ${rel(settingsPath)}`);
    }

    // 2. Ensure every canonical command for this event is present exactly once.
    //    (UserPromptSubmit has two canonical commands: opc-hook.sh + opc-trace.sh.)
    for (const command of canonicals) {
      const hasCurrent = kept.some(
        (entry) =>
          Array.isArray(entry?.hooks) &&
          entry.hooks.some((h) => h?.command === command),
      );
      if (hasCurrent) {
        log(`• ${event} hook already present in ${rel(settingsPath)} (${basename(command)})`);
      } else {
        kept.push({
          matcher: "",
          hooks: [{ type: "command", command }],
        });
        changedAny = true;
        log(`✓ added ${event} hook to ${rel(settingsPath)} (${basename(command)})`);
      }
    }

    if (kept.length > 0) {
      hooks[event] = kept;
    } else {
      // No OPC hooks and nothing else either — drop the empty event key rather
      // than leaving `hooks[event]: []`.
      delete hooks[event];
      changedAny = true;
    }
  }

  if (changedAny) {
    if (Object.keys(hooks).length === 0) {
      delete settings.hooks;
    } else {
      settings.hooks = hooks;
    }
    await writeFile(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf8");
  }
}

async function ensureGitignore() {
  let existing = "";
  if (existsSync(gitignorePath)) {
    existing = await readFile(gitignorePath, "utf8");
  }
  if (existing.includes(GITIGNORE_MARKER)) {
    log(`• ${rel(gitignorePath)} already has OPC block`);
    return;
  }
  const block = GITIGNORE_BLOCK.join("\n") + "\n";
  const next = existing.length === 0 ? block : `${existing.replace(/\n+$/, "")}\n\n${block}`;
  await writeFile(gitignorePath, next, "utf8");
  log(`✓ added OPC gitignore block to ${rel(gitignorePath)}`);
}

try {
  log(`OPC init — ${root}`);
  await ensureOpcScaffold();
  const seed = await seedBuiltins();
  await copyHookScripts();
  await installProjectHook();
  await ensureGitignore();

  // Built-in seeding summary. First-run just lists the fresh copy count; re-runs
  // surface clean upgrades, new files, and any three-way conflicts that need a
  // human's eyes (the user's local edits were preserved as <file>.conflict).
  if (seed.first_run) {
    if (seed.copied > 0) log(`✓ seeded ${seed.copied} built-in phase/scenario file(s) into .opc/`);
  } else {
    if (seed.upgraded > 0) log(`✓ upgraded ${seed.upgraded} built-in file(s) cleanly`);
    if (seed.added > 0) log(`✓ added ${seed.added} new built-in file(s)`);
    if (seed.conflicts > 0) {
      log(`! ${seed.conflicts} built-in file(s) conflict with your local edits — written as <file>.conflict`);
      log(`  review the .conflict files under .opc/phases|scenarios/, resolve, then re-run /opc init`);
    }
    if (seed.upgraded === 0 && seed.added === 0 && seed.conflicts === 0) {
      log(`• built-in phases/scenarios already up to date`);
    }
  }

  log("");
  log("Next steps:");
  log("  1. Call mcp__opc-state-server__opc_flow_lifecycle({ action: \"start\" })");
  log("     to create your first session. (.opc/ is already seeded — no restart needed.)");
  log("  2. Run /opc-status anytime to see the flow health snapshot.");
  log("");
  log("Note: after upgrading the opc plugin (claude plugin install opc), the");
  log("SessionStart hook will nudge you to re-run /opc init here so the local");
  log(".opc/bin/ hook copies + phases/scenarios refresh to the new version.");
  process.exit(0);
} catch (err) {
  process.stderr.write(`opc-init: ${err?.message ?? err}\n`);
  process.exit(1);
}
