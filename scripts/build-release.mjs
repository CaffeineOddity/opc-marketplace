#!/usr/bin/env node
/**
 * build-release.mjs — produce versioned dist/ release artifacts for the OPC marketplace.
 *
 * Version selection:
 *   Reads OPC_RELEASE_VERSION (e.g. "v0.1.0-dev1"). When unset, defaults to "local".
 *   Output goes to dist/<version>/ — never to bare dist/.
 *
 * Outputs (under dist/<version>/):
 *   marketplace.json                  — self-contained manifest for this version
 *   plugins/opc/mcp/<name>/dist/<entry>.js — esbuild bundle, shared deps inlined
 *   plugins/opc/mcp/<name>/<resources>/    — runtime resources (prompts, seed-corrections)
 *   plugins/opc/                      — plugin metadata + opc-status CLI bundle
 *   plugins/official-kits/            — agent .md files (copied as-is)
 *
 * MCP servers live INSIDE the opc plugin dir (plugins/opc/mcp/<name>/) so the
 * whole plugin is self-contained: `claude plugin install` copies only the
 * plugin dir into its cache, so a sibling top-level dist/<version>/mcp/ tree
 * would be left behind. Paths in src/plugins/opc/.claude-plugin/.mcp.json
 *   ${CLAUDE_PLUGIN_ROOT}/mcp/<name>/dist/<entry>.js
 * resolve under the installed plugin root to plugins/opc/mcp/<name>/dist/<entry>.js.
 *
 * The root .claude-plugin/marketplace.json (the "latest" pointer) is NOT touched
 * by this script — publish.mjs updates it after a successful build.
 */

import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SRC = join(ROOT, "src");
const DIST_ROOT = join(ROOT, "dist");

const VERSION = process.env.OPC_RELEASE_VERSION || "local";
const DIST = join(DIST_ROOT, VERSION);

/**
 * Resolve `@opc/<name>` workspace imports straight to their TypeScript source.
 * Avoids requiring a prior `tsc` build of shared packages — esbuild compiles TS on the fly.
 * Maps both src/shared/<name>/ and src/mcp/opc-<name>/ entry points.
 */
const workspaceResolver = {
  name: "opc-workspace-source",
  setup(build) {
    const sharedRoot = join(SRC, "shared");
    const mcpRoot = join(SRC, "mcp");
    build.onResolve({ filter: /^@opc\/[^/]+$/ }, (args) => {
      const pkg = args.path.replace(/^@opc\//, "");
      // memory-store, tool-aliases live under src/shared/
      // state-server, knowledge-server, reflection-server live under src/mcp/opc-<name>/
      const sharedEntry = join(sharedRoot, pkg, "src", "index.ts");
      const mcpEntry = join(mcpRoot, `opc-${pkg}`, "src", "index.ts");
      return { path: pkg.endsWith("-server") ? mcpEntry : sharedEntry };
    });
  },
};

/** MCP servers to bundle. Each is emitted under the opc plugin dir at
 *  plugins/opc/mcp/<name>/ so the plugin is self-contained when copied
 *  into the install cache (only the plugin dir is copied at install time). */
const MCP_SERVERS = [
  { name: "opc-state-server", entry: "src/server.ts", out: "dist/server.js", resources: ["prompts"] },
  { name: "opc-knowledge-server", entry: "src/mcp-server.ts", out: "dist/mcp-server.js", resources: [] },
  { name: "opc-reflection-server", entry: "src/mcp-server.ts", out: "dist/mcp-server.js", resources: ["seed-corrections"] },
];

/** Run esbuild against an MCP server entry. */
async function bundleMcp(server, mcpRoot) {
  const srcDir = join(SRC, "mcp", server.name);
  const outDir = join(mcpRoot, server.name);
  const entryPath = join(srcDir, server.entry);
  const outFile = join(outDir, server.out);

  await esbuild.build({
    entryPoints: [entryPath],
    outfile: outFile,
    bundle: true,
    platform: "node",
    target: "node20",
    format: "esm",
    // Inline everything (including @modelcontextprotocol/sdk) so the release is zero-dependency.
    // Only Node built-ins remain external.
    plugins: [workspaceResolver],
    banner: {
      // ESM bundles lack __dirname/__filename; ensure import.meta.url works for resource loaders.
      js: "// @opc bundled by esbuild",
    },
    logLevel: "warning",
    minify: false,
    sourcemap: false,
  });

  // Copy runtime resource directories (referenced relative to import.meta.url).
  for (const res of server.resources) {
    const srcRes = join(srcDir, res);
    const destRes = join(outDir, res);
    await cp(srcRes, destRes, { recursive: true });
  }

  // Copy built-in phases/ and scenarios/ — bootstrapped into .opc/ on first run.
  for (const dir of ["phases", "scenarios"]) {
    const srcDir2 = join(srcDir, dir);
    const destDir2 = join(outDir, dir);
    try {
      await cp(srcDir2, destDir2, { recursive: true });
    } catch {
      // Directory may not exist; skip quietly.
    }
  }

  // Write a minimal package.json so node treats the bundle as ESM.
  const pkg = {
    name: `@opc/${server.name}-release`,
    version: "0.0.0",
    private: true,
    type: "module",
    main: server.out,
  };
  await writeFile(join(outDir, "package.json"), JSON.stringify(pkg, null, 2) + "\n", "utf8");
}

/** Build the opc plugin: metadata + opc-status CLI.
 *  Scenarios are now bootstrapped by opc-state-server; this plugin only
 *  wires the opc-status/opc-init slash commands + hook script (the hook is
 *  registered per-project by /opc init, not in plugin.json). */
async function buildOrchestratorPlugin() {
  const srcPlugin = join(SRC, "plugins", "opc");
  const outPlugin = join(DIST, "plugins", "opc");

  // Plugin metadata (plugin.json + .mcp.json).
  await cp(join(srcPlugin, ".claude-plugin"), join(outPlugin, ".claude-plugin"), {
    recursive: true,
  });

  // Hook script + opc-status shim.
  await cp(join(srcPlugin, "bin"), join(outPlugin, "bin"), { recursive: true });

  // Slash command.
  await cp(join(srcPlugin, "commands"), join(outPlugin, "commands"), { recursive: true });

  // Bundle the opc-status CLI so bin/opc-status.mjs's `../dist/opc-status/cli.js` resolves.
  await esbuild.build({
    entryPoints: [join(srcPlugin, "src", "opc-status", "cli.ts")],
    outfile: join(outPlugin, "dist", "opc-status", "cli.js"),
    bundle: true,
    platform: "node",
    target: "node20",
    format: "esm",
    plugins: [workspaceResolver],
    logLevel: "warning",
  });

  // package.json for ESM resolution.
  const pkg = {
    name: "@opc/orchestrator-release",
    version: "0.0.0",
    private: true,
    type: "module",
  };
  await writeFile(join(outPlugin, "package.json"), JSON.stringify(pkg, null, 2) + "\n", "utf8");
}

/** Copy official-kits — pure markdown, no build step. */
async function buildOfficialKits() {
  const srcKit = join(SRC, "plugins", "official-kits");
  const outKit = join(DIST, "plugins", "official-kits");
  await cp(srcKit, outKit, { recursive: true });
}

async function main() {
  console.log(`→ Cleaning dist/${VERSION}/`);
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  console.log("→ Building opc plugin");
  await buildOrchestratorPlugin();

  console.log("→ Bundling MCP servers (into plugins/opc/mcp/)");
  const mcpRoot = join(DIST, "plugins", "opc", "mcp");
  for (const server of MCP_SERVERS) {
    process.stdout.write(`  - ${server.name} ... `);
    await bundleMcp(server, mcpRoot);
    console.log("ok");
  }

  console.log("→ Copying official-kits");
  await buildOfficialKits();

  // Write a self-contained manifest at dist/<version>/.claude-plugin/marketplace.json.
  // Its `source` paths are relative to the version dir, so a tarball of
  // dist/<version>/ (or a clone of a release branch containing it) can be
  // added directly as a path marketplace — `claude plugin marketplace add
  // <path>` looks for .claude-plugin/marketplace.json at the path root.
  const manifestDir = join(DIST, ".claude-plugin");
  await mkdir(manifestDir, { recursive: true });
  await writeFile(
    join(manifestDir, "marketplace.json"),
    JSON.stringify(versionedManifest(VERSION), null, 2) + "\n",
    "utf8",
  );

  console.log(`✓ Release built at dist/${VERSION}/`);
}

/** Build the self-contained manifest for a version dir.
 *  Paths are relative to dist/<version>/. */
function versionedManifest(version) {
  return {
    name: "opc-marketplace",
    description: `Caffeine's one-person company plugin marketplace — 27 agents, MCP servers, hooks covering the full product lifecycle (release ${version})`,
    owner: { name: "caffeine" },
    plugins: [
      {
        name: "opc-official-kits",
        source: "./plugins/official-kits",
        description:
          "OPC official kits — 27 sub-agents across product, design, dev, infra, QA, and reflection categories for full pipeline lifecycle",
        version: "0.1.0",
        author: { name: "caffeine" },
        category: "orchestration",
        keywords: ["agents", "product", "design", "dev", "qa", "reflection", "lifecycle"],
      },
      {
        name: "opc",
        source: "./plugins/opc",
        description:
          "OPC — /opc-status + /opc init slash commands, opc-status CLI, opc-hook script (project-scoped via /opc init), and MCP server config (state, knowledge, reflection)",
        version: "0.1.0",
        author: { name: "caffeine" },
        category: "infrastructure",
        keywords: ["opc", "mcp", "hook", "status", "init", "cli"],
      },
    ],
  };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
