/**
 * Spec §06-host-contract §2.1 (C1): session_id derivation.
 *
 * Format: `sess-<claude_code_pid>-<started_at_unix_ts>`
 *   - <claude_code_pid> is the Claude Code process pid (stdio: process.ppid; HTTP/SSE: explicit param).
 *   - <started_at_unix_ts> is seconds-resolution unix timestamp when the session was first observed.
 *
 * Invariants:
 *   - Deterministic for the same (pid, ts) tuple.
 *   - Adding the ts component defeats pid recycling collisions (§2.1 "为什么带 ts").
 *   - On crash/restart, a new ts → new session_id; orphan recovery preserves the old session_id
 *     and only swaps owner.pid (§2.2).
 */

const SESSION_ID_REGEX = /^sess-(\d+)-(\d+)$/;

export interface DerivedSessionParts {
  pid: number;
  started_at_unix_ts: number;
}

export function deriveSessionId(parts: DerivedSessionParts): string {
  if (!Number.isInteger(parts.pid) || parts.pid <= 0) {
    throw new Error(`deriveSessionId: pid must be a positive integer, got ${parts.pid}`);
  }
  if (!Number.isInteger(parts.started_at_unix_ts) || parts.started_at_unix_ts <= 0) {
    throw new Error(
      `deriveSessionId: started_at_unix_ts must be a positive integer seconds value, got ${parts.started_at_unix_ts}`,
    );
  }
  return `sess-${parts.pid}-${parts.started_at_unix_ts}`;
}

export function parseSessionId(session_id: string): DerivedSessionParts | null {
  const match = SESSION_ID_REGEX.exec(session_id);
  if (!match) return null;
  return {
    pid: Number(match[1]),
    started_at_unix_ts: Number(match[2]),
  };
}

export function isStdioDerivedSessionId(session_id: string): boolean {
  return SESSION_ID_REGEX.test(session_id);
}

/**
 * Convenience: derive from a Date (seconds resolution per spec).
 */
export function deriveSessionIdFromDate(pid: number, started_at: Date): string {
  return deriveSessionId({
    pid,
    started_at_unix_ts: Math.floor(started_at.getTime() / 1000),
  });
}
