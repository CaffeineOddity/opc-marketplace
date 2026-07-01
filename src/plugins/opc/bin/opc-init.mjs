#!/usr/bin/env node
// src/plugins/opc/bin/opc-init.mjs
//
// `/opc init` — opt a project into OPC. Writes the `.opc/` scaffold +
// `.project-init` marker so the state-server's bootstrap gates on it, and
// installs the project-scoped UserPromptSubmit hook into `.claude/settings.json`.
//
// Idempotent: safe to re-run. Never deletes existing files.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const opcDir = join(root, ".opc");
const marker = join(opcDir, ".project-init");
const settingsPath = join(root, ".claude", "settings.json");
const gitignorePath = join(root, ".gitignore");

const HOOK_COMMAND = "${CLAUDE_PLUGIN_ROOT}/bin/opc-hook.sh";

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
  // Marker — the bootstrap gate (bootstrap.ts isOpcInitialized) keys off this.
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

  const hooks = (settings.hooks ??= {});
  const list = (hooks.UserPromptSubmit ??= []);
  const already = list.some(
    (entry) =>
      Array.isArray(entry?.hooks) &&
      entry.hooks.some((h) => h?.command === HOOK_COMMAND),
  );
  if (already) {
    log(`• project hook already present in ${rel(settingsPath)}`);
    return;
  }

  list.push({
    matcher: "",
    hooks: [{ type: "command", command: HOOK_COMMAND }],
  });
  settings.hooks = hooks;

  await writeFile(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf8");
  log(`✓ added UserPromptSubmit hook to ${rel(settingsPath)}`);
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
  await installProjectHook();
  await ensureGitignore();
  log("");
  log("Next steps:");
  log("  1. Restart Claude Code so opc-state-server picks up the .opc/ scaffold");
  log("     and the project-scoped hook takes effect.");
  log("  2. Call mcp__opc-state-server__opc_flow_lifecycle({ action: \"start\" })");
  log("     to create your first session.");
  log("  3. Run /opc-status anytime to see the flow health snapshot.");
  process.exit(0);
} catch (err) {
  process.stderr.write(`opc-init: ${err?.message ?? err}\n`);
  process.exit(1);
}
