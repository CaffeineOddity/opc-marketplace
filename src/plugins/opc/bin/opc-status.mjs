#!/usr/bin/env node
// src/plugins/opc/bin/opc-status.mjs
//
// Thin shim that invokes the compiled CLI. We import from `dist/` after
// `pnpm --filter @opc/plugin build`; in dev/test the source is consumed
// directly through the TS test files.

import { run } from "../dist/opc-status/cli.js";

await run(process.argv.slice(2), {
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
  exit: (code) => process.exit(code),
  cwd: () => process.cwd(),
  env: process.env,
});
