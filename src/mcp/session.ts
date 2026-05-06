/**
 * OPC Session Management
 *
 * Session index maps lock_id to requirement_id with workflow source.
 */

import { existsSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { ensureOpcDir } from './paths.js';
import { readJsonFile, atomicWriteJson } from './io.js';
import type { SessionIndex, ProjectState } from './types.js';
import { readProjectState, getHandoffPath } from './state.js';
import { getCurrentLockId } from './lock.js';

// ============================================================
// Session Index
// ============================================================

function getSessionIndexPath(cwd?: string): string {
  const stateDir = ensureOpcDir('state', cwd);
  return join(stateDir, 'sessions.json');
}

export function readSessionIndex(cwd?: string): SessionIndex {
  const path = getSessionIndexPath(cwd);
  const index = readJsonFile<SessionIndex>(path);
  return index || { sessions: {} };
}

function writeSessionIndex(index: SessionIndex, cwd?: string): void {
  const path = getSessionIndexPath(cwd);
  atomicWriteJson(path, index);
}

// ============================================================
// Session Binding
// ============================================================

export function bindSessionToRequirement(
  lockId: string,
  requirementId: string,
  source: 'matched' | 'auto_assembled',
  workflowName?: string,
  cwd?: string
): void {
  const index = readSessionIndex(cwd);
  const now = new Date().toISOString();

  if (index.sessions[lockId]) {
    index.sessions[lockId].requirement_id = requirementId;
    index.sessions[lockId].source = source;
    index.sessions[lockId].workflow_name = workflowName;
    index.sessions[lockId].updated_at = now;
  } else {
    index.sessions[lockId] = {
      requirement_id: requirementId,
      source: source,
      workflow_name: workflowName,
      created_at: now,
      updated_at: now,
    };
  }

  writeSessionIndex(index, cwd);
}

// ============================================================
// Session Query
// ============================================================

export function getCurrentSession(lockId: string, cwd?: string): SessionIndex['sessions'][string] | null {
  const index = readSessionIndex(cwd);
  return index.sessions[lockId] || null;
}

export function getCurrentRequirementId(lockId: string, cwd?: string): string | null {
  const session = getCurrentSession(lockId, cwd);
  return session?.requirement_id || null;
}

// ============================================================
// Task Listing
// ============================================================

export function listAllTasks(cwd?: string): string[] {
  const stateDir = ensureOpcDir('state', cwd);
  if (!existsSync(stateDir)) return [];
  return readdirSync(stateDir).filter(f =>
    f.startsWith('REQ-') || f.match(/^REQ-\d+_(matched|auto_assembled)$/)
  );
}

// ============================================================
// Current Task
// ============================================================

export function getCurrentTask(cwd?: string): ProjectState | null {
  const lockId = getCurrentLockId(cwd);
  const session = getCurrentSession(lockId, cwd);

  if (!session) {
    return null;
  }

  return readProjectState(session.requirement_id, session.source, cwd);
}

// ============================================================
// Clear Task
// ============================================================

export function clearCurrentTask(cwd?: string): boolean {
  const lockId = getCurrentLockId(cwd);
  const index = readSessionIndex(cwd);

  if (index.sessions[lockId]) {
    delete index.sessions[lockId];
    writeSessionIndex(index, cwd);

    // Also clear handoffs for this session
    const handoffPath = getHandoffPath(lockId, cwd);
    if (existsSync(handoffPath)) {
      unlinkSync(handoffPath);
    }

    return true;
  }

  return false;
}
