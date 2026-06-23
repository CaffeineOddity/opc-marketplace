import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Root vitest config — resolves `@opc/*` workspace packages to their TypeScript
 * source so tests can run without a prior per-package `tsc` build (the release
 * pipeline is esbuild-only via scripts/build-release.mjs; package.json `exports`
 * point at `./dist/index.js` which is never generated in a test checkout).
 *
 * Mirrors the `workspaceResolver` esbuild plugin in scripts/build-release.mjs.
 */
const src = (p: string) => fileURLToPath(new URL(`./src/${p}`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@opc/memory-store": src("shared/memory-store/src/index.ts"),
      "@opc/tool-aliases": src("shared/tool-aliases/src/index.ts"),
      "@opc/state-server": src("mcp/opc-state-server/src/index.ts"),
      "@opc/knowledge-server": src("mcp/opc-knowledge-server/src/index.ts"),
      "@opc/reflection-server": src("mcp/opc-reflection-server/src/index.ts"),
    },
  },
});
