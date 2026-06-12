#!/usr/bin/env node
/**
 * build-release.mjs — produce dist/ release artifacts for the OPC marketplace.
 *
 * Outputs:
 *   dist/mcp/<name>/dist/<entry>.js     — esbuild bundle, shared deps inlined
 *   dist/mcp/<name>/<resources>/        — runtime resources (prompts, seed-corrections)
 *   dist/plugins/opc-orchestrator/      — plugin metadata + opc-status CLI bundle
 *   dist/plugins/official-kits/         — agent .md files (copied as-is)
 *
 * Paths in src/plugins/opc-orchestrator/.claude-plugin/.mcp.json
 *   ${CLAUDE_PLUGIN_ROOT}/../../mcp/<name>/dist/<entry>.js
 * resolve under dist/ to dist/mcp/<name>/dist/<entry>.js — same layout, no rewrite needed.
 */

import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SRC = join(ROOT, "src");
const DIST = join(ROOT, "dist");

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

/** MCP servers to bundle. */
const MCP_SERVERS = [
  { name: "opc-state-server", entry: "src/server.ts", out: "dist/server.js", resources: ["prompts"] },
  { name: "opc-knowledge-server", entry: "src/mcp-server.ts", out: "dist/mcp-server.js", resources: [] },
  { name: "opc-reflection-server", entry: "src/mcp-server.ts", out: "dist/mcp-server.js", resources: ["seed-corrections"] },
];

/** Run esbuild against an MCP server entry. */
async function bundleMcp(server) {
  const srcDir = join(SRC, "mcp", server.name);
  const outDir = join(DIST, "mcp", server.name);
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

/** Build the opc-orchestrator plugin: metadata + opc-status CLI.
 *  Scenarios are now bootstrapped by opc-state-server; this plugin only
 *  wires the hook + slash command. */
async function buildOrchestratorPlugin() {
  const srcPlugin = join(SRC, "plugins", "opc-orchestrator");
  const outPlugin = join(DIST, "plugins", "opc-orchestrator");

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
  console.log("→ Cleaning dist/");
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  console.log("→ Bundling MCP servers");
  for (const server of MCP_SERVERS) {
    process.stdout.write(`  - ${server.name} ... `);
    await bundleMcp(server);
    console.log("ok");
  }

  console.log("→ Building opc-orchestrator plugin");
  await buildOrchestratorPlugin();

  console.log("→ Copying official-kits");
  await buildOfficialKits();

  console.log("✓ Release built at dist/");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
