/**
 * E2E harness: wires Knowledge / Flow / Pipeline / Phase / Node / Reflection /
 * Corrections servers against a shared tmp root with deterministic clocks and
 * sequential UUIDs. Each test calls `bootstrap()` from a fresh dir; assertions
 * exercise the same in-process servers Claude Code would mount over MCP.
 *
 * Real-subprocess MCP framing is deferred to M19 — at this layer we validate
 * the contract of every server method, which is what the walkthrough doc
 * specifies. The recorder produces a tool-call fixture identical in shape to
 * what an MCP transcript would capture.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { KnowledgeServer } from "@opc/knowledge-server";
import {
  FlowServer,
  PipelineServer,
  PhaseServer,
  NodeServer,
} from "@opc/state-server";
import {
  ReflectionServer,
  CorrectionsServer,
} from "@opc/reflection-server";

export interface E2EClock {
  now: () => Date;
  tick: (ms?: number) => Date;
}

export interface ToolCall {
  seq: number;
  at: string;
  server: string;
  tool: string;
  input: unknown;
  output: unknown;
  error?: string;
}

export interface Recorder {
  calls: ToolCall[];
  record: <T>(server: string, tool: string, input: unknown, fn: () => Promise<T>) => Promise<T>;
  freeze: () => ToolCall[];
}

export interface Bootstrap {
  root: string;
  pid: number;
  clock: E2EClock;
  uuid: () => string;
  recorder: Recorder;
  knowledge: KnowledgeServer;
  flow: FlowServer;
  pipeline: PipelineServer;
  phase: PhaseServer;
  node: NodeServer;
  reflection: ReflectionServer;
  corrections: CorrectionsServer;
  cleanup: () => Promise<void>;
}

export interface BootstrapOptions {
  /** Base instant for the deterministic clock. Defaults to 2026-06-10T00:00:00Z. */
  startAt?: Date;
  /** Default tick between recorded calls (ms). Defaults to 1000. */
  defaultTickMs?: number;
  /** Optional pre-populated kits registry (kit names → installed_at iso). */
  installedKits?: Record<string, string>;
}

const DEFAULT_START = new Date("2026-06-10T00:00:00Z");

export function makeClock(start: Date, defaultTickMs = 1000): E2EClock {
  let cursor = start.getTime();
  return {
    now: () => new Date(cursor),
    tick: (ms = defaultTickMs) => {
      cursor += ms;
      return new Date(cursor);
    },
  };
}

export function makeRecorder(clock: E2EClock): Recorder {
  const calls: ToolCall[] = [];
  let seq = 0;
  return {
    calls,
    async record<T>(server: string, tool: string, input: unknown, fn: () => Promise<T>): Promise<T> {
      seq += 1;
      const at = clock.now().toISOString();
      try {
        const output = await fn();
        calls.push({ seq, at, server, tool, input, output });
        return output;
      } catch (err) {
        calls.push({
          seq,
          at,
          server,
          tool,
          input,
          output: null,
          error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
        });
        throw err;
      }
    },
    freeze() {
      return calls.map((c) => ({ ...c }));
    },
  };
}

export async function bootstrap(opts: BootstrapOptions = {}): Promise<Bootstrap> {
  const root = await mkdtemp(join(tmpdir(), "opc-e2e-"));
  const clock = makeClock(opts.startAt ?? DEFAULT_START, opts.defaultTickMs);
  let counter = 0;
  const uuid = (): string => {
    counter += 1;
    return `id-${counter}`;
  };
  const pid = 4242;

  // Pre-seed installed-kits ledger if requested so kit-health check is
  // deterministic (defaults to none installed, no warnings).
  if (opts.installedKits) {
    const opcDir = join(root, ".opc");
    await mkdir(opcDir, { recursive: true });
    const payload = {
      kits: Object.entries(opts.installedKits).map(([kit, installed_at]) => ({
        kit,
        installed_at,
        agents: [],
      })),
    };
    await writeFile(join(opcDir, "installed-kits.json"), JSON.stringify(payload, null, 2));
  }

  const knowledge = new KnowledgeServer({ root, now: clock.now });
  const flow = new FlowServer({
    root,
    now: clock.now,
    pid: () => pid,
    uuid,
    transport: "stdio",
    ppid: () => pid,
    isAlive: (p) => p === pid,
  });
  const pipeline = new PipelineServer({ root, now: clock.now, uuid, pid: () => pid });
  const phase = new PhaseServer({ root, now: clock.now, uuid, pid: () => pid });
  const node = new NodeServer({ root, now: clock.now, uuid, pid: () => pid });
  const reflection = new ReflectionServer({ root, now: clock.now, uuid });
  const corrections = new CorrectionsServer({ root, now: clock.now, uuid, autoDecay: false });

  const recorder = makeRecorder(clock);

  const cleanup = async (): Promise<void> => {
    await rm(root, { recursive: true, force: true });
  };

  return {
    root,
    pid,
    clock,
    uuid,
    recorder,
    knowledge,
    flow,
    pipeline,
    phase,
    node,
    reflection,
    corrections,
    cleanup,
  };
}
