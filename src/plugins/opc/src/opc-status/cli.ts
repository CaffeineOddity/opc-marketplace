/**
 * `opc-status` CLI entry (M18.h).
 *
 * Usage:
 *   opc-status [--session <id>] [--root <path>] [--json] [--help]
 *
 * Defaults:
 *   --root    process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
 *   --session newest session under .opc/sessions/<id>/
 *
 * Exit codes:
 *   0 — snapshot rendered (incl. empty state when no session exists yet)
 *   1 — session not found / flow-state unreadable
 *   2 — bad CLI usage
 */

import { loadSnapshot, SnapshotError } from "./snapshot.js";
import { renderSnapshot, renderEmpty } from "./render.js";

export interface ParsedArgs {
  root?: string;
  session_id?: string;
  json: boolean;
  help: boolean;
  unknown: string[];
}

export function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { json: false, help: false, unknown: [] };
  let i = 0;
  while (i < argv.length) {
    const a = argv[i]!;
    switch (a) {
      case "-h":
      case "--help":
        out.help = true;
        i += 1;
        break;
      case "--json":
        out.json = true;
        i += 1;
        break;
      case "--session": {
        const v = argv[i + 1];
        if (!v) throw new Error("--session requires a value");
        out.session_id = v;
        i += 2;
        break;
      }
      case "--root": {
        const v = argv[i + 1];
        if (!v) throw new Error("--root requires a value");
        out.root = v;
        i += 2;
        break;
      }
      default:
        out.unknown.push(a);
        i += 1;
    }
  }
  return out;
}

export const HELP = `opc-status — read-only health snapshot for the active OPC session

Usage:
  opc-status [--session <id>] [--root <path>] [--json]

Options:
  --session <id>   session id under .opc/sessions/<id>/ (default: newest)
  --root <path>    project root containing .opc/ (default: CLAUDE_PROJECT_DIR or cwd)
  --json           emit machine-readable JSON snapshot instead of the terminal layout
  -h, --help       show this help

Reads from pipeline-plan.json + state.json + flow-state.json in real time
(spec §02-pipeline/08_status-display.md). Never writes anywhere.
`;

export interface RunIO {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  exit: (code: number) => void;
  now?: () => Date;
  cwd: () => string;
  env: NodeJS.ProcessEnv;
}

export async function run(argv: string[], io: RunIO): Promise<void> {
  let args: ParsedArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    io.stderr(`opc-status: ${(err as Error).message}\n`);
    io.exit(2);
    return;
  }

  if (args.help) {
    io.stdout(HELP);
    io.exit(0);
    return;
  }
  if (args.unknown.length > 0) {
    io.stderr(`opc-status: unknown args: ${args.unknown.join(" ")}\n`);
    io.exit(2);
    return;
  }

  const root = args.root ?? io.env.CLAUDE_PROJECT_DIR ?? io.cwd();

  try {
    const opts: Parameters<typeof loadSnapshot>[0] = { root };
    if (args.session_id !== undefined) opts.session_id = args.session_id;
    if (io.now !== undefined) opts.now = io.now;
    const snap = await loadSnapshot(opts);
    if ("empty" in snap && snap.empty) {
      // No session yet — a normal state, not an error. Render the friendly
      // empty view and exit 0.
      if (args.json) {
        io.stdout(JSON.stringify(snap, null, 2) + "\n");
      } else {
        io.stdout(renderEmpty(snap) + "\n");
      }
      io.exit(0);
      return;
    }
    if (args.json) {
      io.stdout(JSON.stringify(snap, null, 2) + "\n");
    } else {
      io.stdout(renderSnapshot(snap) + "\n");
    }
    io.exit(0);
  } catch (err) {
    if (err instanceof SnapshotError) {
      io.stderr(`opc-status: ${err.message}\n`);
      io.exit(1);
      return;
    }
    io.stderr(`opc-status: ${(err as Error).message}\n`);
    io.exit(1);
  }
}
