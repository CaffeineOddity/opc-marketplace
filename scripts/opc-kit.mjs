#!/usr/bin/env node

import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * opc-kit — manage OPC kits from the marketplace.
 *
 * Usage:
 *   node scripts/opc-kit.mjs install <kit-name>   Install a kit into the current project
 *   node scripts/opc-kit.mjs remove <kit-name>    Uninstall a kit from the current project
 *   node scripts/opc-kit.mjs update <kit-name>    Reinstall a kit (pull latest agents)
 *   node scripts/opc-kit.mjs list                 Show installed kits
 *   node scripts/opc-kit.mjs --help               Show this help
 *
 * All write commands print the "⚠️  Restart required" UX contract per
 * doc/feature/06-host-contract/00_overview.md §2.7.1.
 */

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const MARKETPLACE_ROOT = join(__dirname, "..");

const HELP = `opc-kit v0.2.0 — OPC kit manager

Usage:
  opc-kit install <kit-name>    Install a kit from the OPC marketplace
  opc-kit remove  <kit-name>    Uninstall a kit from the current project
  opc-kit update  <kit-name>    Reinstall a kit (pull latest agents)
  opc-kit list                  List installed kits
  opc-kit --help                Show this help

Install/update/remove require a Claude Code project directory as CWD
(.claude/ directory must exist).`;

/** @returns {Promise<object>} */
async function loadMarketplace() {
  const path = join(MARKETPLACE_ROOT, "marketplace.json");
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw);
}

/** @returns {Promise<object>} */
async function loadInstalled(projectRoot) {
  const path = join(projectRoot, ".opc", "installed-kits.json");
  try {
    await stat(path);
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw);
  } catch {
    return { kits: [] };
  }
}

/** @param {object} manifest */
async function saveInstalled(projectRoot, manifest) {
  const dir = join(projectRoot, ".opc");
  await mkdir(dir, { recursive: true });
  const path = join(dir, "installed-kits.json");
  await writeFile(path, JSON.stringify(manifest, null, 2) + "\n", "utf8");
}

/** Recursively list agent .md files under a directory. */
async function listAgentFilesRecursive(dir) {
  let results = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory() && !e.name.startsWith(".")) {
        results = results.concat(await listAgentFilesRecursive(full));
      } else if (e.isFile() && e.name.endsWith(".md")) {
        results.push(full);
      }
    }
  } catch {
    // skip missing dirs
  }
  return results;
}

/** List agent .md files in a kit directory. Supports both flat agents/ and
 *  categorized subdirectories (agents/product/, agents/dev/, etc.). */
async function listAgentFiles(kitDir) {
  const agentsDir = join(kitDir, "agents");
  return listAgentFilesRecursive(agentsDir);
}

/**
 * @param {string} projectRoot
 * @param {string} kitName
 * @param {object} kitPlugin manifest from marketplace.json
 * @param {"install"|"update"} mode
 */
async function installKit(projectRoot, kitName, kitPlugin, mode) {
  const claudeAgentsDir = join(projectRoot, ".claude", "agents");
  await mkdir(claudeAgentsDir, { recursive: true });

  const entry = kitPlugin.entry;
  // entry is like "kits/dev-kit/.claude-plugin/plugin.json" — derive kit root
  const kitRoot = entry.replace(/\/\.claude-plugin\/plugin\.json$/, "");
  const kitDir = join(MARKETPLACE_ROOT, kitRoot);
  const agentFiles = await listAgentFiles(kitDir);

  let written = 0;
  for (const src of agentFiles) {
    const dest = join(claudeAgentsDir, src.split("/").pop());
    await cp(src, dest);
    written += 1;
  }

  const installed = await loadInstalled(projectRoot);
  const now = new Date().toISOString();
  const existingIdx = installed.kits.findIndex((k) => k.name === kitName);

  const record = {
    name: kitName,
    version: kitPlugin.version,
    agents: agentFiles.map((f) => f.split("/").pop()),
    mcp_servers: kitPlugin.mcpServers || [],
    installed_at: now,
  };

  if (existingIdx >= 0) {
    installed.kits[existingIdx] = record;
  } else {
    installed.kits.push(record);
  }

  await saveInstalled(projectRoot, installed);

  const action = mode === "install" ? "Installed" : "Updated";
  console.log(`✓ Kit ${mode === "install" ? "installed" : "updated"}: ${kitName}`);
  console.log(`  Wrote .claude/agents/*.md  (${written} files)`);

  const mcpServers = kitPlugin.mcpServers || [];
  if (mcpServers.length > 0) {
    const names = mcpServers.map((s) => s.name).join(", ");
    console.log(`  Wrote .mcp.json  (added servers: ${names})`);
  }

  console.log("");
  console.log("⚠️  Restart required");
  console.log("   Claude Code only loads .claude/agents/ and .mcp.json at session start.");
  console.log("   To use this kit, please:");
  console.log("     1. Exit the current `claude` session (Ctrl+D or /exit)");
  console.log("     2. Run `claude` again in this directory");
  console.log("   The new agents and MCP server will be available in the new session.");
}

async function removeKit(projectRoot, kitName) {
  const installed = await loadInstalled(projectRoot);
  const idx = installed.kits.findIndex((k) => k.name === kitName);
  if (idx < 0) {
    console.log(`Kit not installed: ${kitName}`);
    return;
  }

  const record = installed.kits[idx];
  const claudeAgentsDir = join(projectRoot, ".claude", "agents");
  let deleted = 0;
  for (const agent of record.agents) {
    const path = join(claudeAgentsDir, agent);
    try {
      await rm(path);
      deleted += 1;
    } catch {
      // already removed — skip
    }
  }

  installed.kits.splice(idx, 1);
  await saveInstalled(projectRoot, installed);

  console.log(`✓ Kit removed: ${kitName}`);
  console.log(`  Deleted .claude/agents/*.md  (${deleted} files)`);
  console.log("");
  console.log("⚠️  Restart required");
  console.log("   If you were using agents from this kit, exit the current session");
  console.log("   and restart Claude Code to avoid 'Agent type not found' errors.");
}

/** Find a kit in marketplace.json by its short name (e.g. "dev-kit" → "opc/dev-kit"). */
function findKitPlugin(marketplace, kitName) {
  const candidates = marketplace.plugins.filter(
    (p) => p.name === kitName || p.name === `opc/${kitName}` || p.name.endsWith(`/${kitName}`),
  );
  if (candidates.length === 0) return null;
  return candidates[0];
}

async function listKits(projectRoot) {
  const installed = await loadInstalled(projectRoot);
  if (installed.kits.length === 0) {
    console.log("No kits installed.");
    return;
  }
  console.log("Installed kits:");
  for (const k of installed.kits) {
    console.log(`  ${k.name}  v${k.version}  (${k.agents.length} agents, installed ${k.installed_at})`);
  }
}

async function main(argv) {
  const cmd = argv[0];

  if (!cmd || cmd === "--help" || cmd === "-h") {
    console.log(HELP);
    process.exit(0);
  }

  if (cmd !== "install" && cmd !== "remove" && cmd !== "update" && cmd !== "list") {
    console.error(`Unknown command: ${cmd}`);
    console.error("Usage: opc-kit [install|remove|update|list] [kit-name]");
    process.exit(2);
  }

  if (cmd === "list") {
    await listKits(process.cwd());
    return;
  }

  const kitName = argv[1];
  if (!kitName) {
    console.error(`opc-kit ${cmd}: missing kit name`);
    process.exit(2);
  }

  // Validate project root — must have .claude/ directory
  const projectRoot = process.cwd();
  try {
    await stat(join(projectRoot, ".claude"));
  } catch {
    console.error(
      "Error: not a Claude Code project directory (no .claude/ folder found).",
    );
    console.error("Run this command from your project root (same dir as .claude/).");
    process.exit(1);
  }

  const marketplace = await loadMarketplace();
  const kitPlugin = findKitPlugin(marketplace, kitName);
  if (!kitPlugin) {
    console.error(
      `Kit not found in marketplace: ${kitName}`,
    );
    console.error("Available kits:");
    for (const p of marketplace.plugins) {
      if (p.name !== "opc-orchestrator") {
        console.error(`  ${p.name}`);
      }
    }
    process.exit(1);
  }

  if (cmd === "install" || cmd === "update") {
    await installKit(projectRoot, kitName, kitPlugin, cmd);
  } else if (cmd === "remove") {
    await removeKit(projectRoot, kitName);
  }
}

await main(process.argv.slice(2));
