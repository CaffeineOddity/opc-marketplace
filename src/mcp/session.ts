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
// Requirement ID Generation
// ============================================================

/**
 * Generate the next available requirement ID
 * Scans existing task directories to find the next number
 */
export function generateNextRequirementId(cwd?: string): string {
  const stateDir = ensureOpcDir('state', cwd);
  if (!existsSync(stateDir)) {
    return 'REQ-001';
  }

  const existingIds = readdirSync(stateDir)
    .filter(f => f.startsWith('REQ-') && f.includes('_'))
    .map(f => {
      const match = f.match(/^REQ-(\d+)_/);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter(n => !isNaN(n));

  const nextNum = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;
  return `REQ-${String(nextNum).padStart(3, '0')}`;
}

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

/**
 * Find similar existing task by project name/description similarity.
 * Returns the most similar task if similarity >= threshold.
 */
export function findSimilarTask(
  projectName: string,
  projectDescription: string,
  cwd?: string,
  threshold: number = 0.5
): { requirementId: string; source: 'matched' | 'auto_assembled'; state: ProjectState; score: number } | null {
  const stateDir = ensureOpcDir('state', cwd);
  if (!existsSync(stateDir)) return null;

  const taskDirs = readdirSync(stateDir).filter(f =>
    f.match(/^REQ-\d+_(matched|auto_assembled)$/)
  );

  if (taskDirs.length === 0) return null;

  const query = `${projectName} ${projectDescription}`.toLowerCase();
  const queryWords = query.split(/\s+/).filter(w => w.length > 1);

  let bestMatch: { requirementId: string; source: 'matched' | 'auto_assembled'; state: ProjectState; score: number } | null = null;

  for (const dirName of taskDirs) {
    const match = dirName.match(/^(REQ-\d+)_(matched|auto_assembled)$/);
    if (!match) continue;

    const requirementId = match[1];
    const source = match[2] as 'matched' | 'auto_assembled';
    const state = readProjectState(requirementId, source, cwd);
    if (!state) continue;

    // Calculate similarity score
    const titleWords = state.project.name.toLowerCase().split(/\s+/);
    const descWords = (state.project.description || '').toLowerCase().split(/\s+/);
    const allTitleWords = [...titleWords, ...descWords].filter(w => w.length > 1);

    let matchCount = 0;
    for (const queryWord of queryWords) {
      for (const titleWord of allTitleWords) {
        if (queryWord === titleWord || queryWord.includes(titleWord) || titleWord.includes(queryWord)) {
          matchCount++;
          break;
        }
      }
    }

    const score = queryWords.length > 0 ? matchCount / queryWords.length : 0;

    if (score >= threshold && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { requirementId, source, state, score };
    }
  }

  return bestMatch;
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
