/**
 * Spec §06-host-contract §2.3 (C2): transport-aware pid resolution.
 *
 * The way MCP server acquires the Claude Code pid depends on transport:
 *
 *   - stdio (default): use `process.ppid` (the spawning Claude Code process).
 *     `opc_flow_query` MUST NOT accept `claude_pid` as input — server-derived
 *     pid is authoritative; an explicit param would let Claude misreport.
 *
 *   - http / sse: Claude passes `{claude_pid, claude_started_at}` explicitly
 *     on first `opc_flow_query()`. If absent → fall back to server's own
 *     `(process.pid, uptime)` and emit a warning (handled by caller).
 *
 * Transport mode is decided once at server startup via the `MCP_TRANSPORT`
 * env var (`stdio` | `http` | `sse`). Default is `stdio`.
 */

export type TransportMode = "stdio" | "http" | "sse";

const VALID_TRANSPORTS: ReadonlySet<TransportMode> = new Set(["stdio", "http", "sse"]);

export function readTransportFromEnv(env: NodeJS.ProcessEnv = process.env): TransportMode {
  const raw = env.MCP_TRANSPORT?.trim().toLowerCase();
  if (!raw) return "stdio";
  if (!VALID_TRANSPORTS.has(raw as TransportMode)) {
    throw new TransportConfigError(
      `MCP_TRANSPORT must be one of stdio|http|sse, got "${raw}"`,
    );
  }
  return raw as TransportMode;
}

export class TransportConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransportConfigError";
  }
}

export class TransportArgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransportArgError";
  }
}

export interface ResolvedClaudePid {
  pid: number;
  source: "stdio_ppid" | "http_explicit" | "http_fallback";
}

export interface ResolveClaudePidArgs {
  transport: TransportMode;
  claude_pid?: number;
  ppid?: () => number;
  serverPid?: () => number;
}

/**
 * Spec §06-host-contract §2.3 implementation note (line 113):
 *   "stdio 模式下 opc_flow_query() 不接受 claude_pid 入参（防止 Claude 误传），
 *    server 一律用 process.ppid"
 *
 * In stdio mode, passing `claude_pid` is a hard error — Claude must not
 * second-guess the kernel-supplied parent pid. In http/sse, the explicit
 * param is the authoritative source; falling back to server pid is allowed
 * but should trigger a warning at the caller layer.
 */
export function resolveClaudePid(args: ResolveClaudePidArgs): ResolvedClaudePid {
  const ppidFn = args.ppid ?? ((): number => process.ppid);
  const serverPidFn = args.serverPid ?? ((): number => process.pid);

  if (args.transport === "stdio") {
    if (args.claude_pid !== undefined) {
      throw new TransportArgError(
        "claude_pid must not be passed in stdio mode; server uses process.ppid (spec §06-host-contract §2.3)",
      );
    }
    const pid = ppidFn();
    if (!Number.isInteger(pid) || pid <= 0) {
      throw new TransportConfigError(
        `stdio transport: process.ppid is not a valid pid (got ${pid})`,
      );
    }
    return { pid, source: "stdio_ppid" };
  }

  if (args.claude_pid !== undefined) {
    if (!Number.isInteger(args.claude_pid) || args.claude_pid <= 0) {
      throw new TransportArgError(
        `claude_pid must be a positive integer, got ${args.claude_pid}`,
      );
    }
    return { pid: args.claude_pid, source: "http_explicit" };
  }

  return { pid: serverPidFn(), source: "http_fallback" };
}
