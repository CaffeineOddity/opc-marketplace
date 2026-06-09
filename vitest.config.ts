import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "shared/**/src/**/*.test.ts",
      "platform/mcp/**/src/**/*.test.ts",
      "platform/opc-orchestrator/test/**/*.test.ts",
    ],
    environment: "node",
    reporters: "default",
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["shared/**/src/**", "platform/mcp/**/src/**"],
      exclude: ["**/*.test.ts", "**/dist/**"],
    },
  },
});
