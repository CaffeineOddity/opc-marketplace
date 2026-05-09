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
 * Uses the session filename (without .json) as the requirement_id
 * Format: YYYYMMDD_XXX_source (e.g., 20260509_001_auto_assembled)
 */
export function generateNextRequirementId(
  source: 'matched' | 'auto_assembled' = 'auto_assembled',
  cwd?: string
): string {
  const sessionsDir = ensureOpcDir('state/sessions', cwd);
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD

  // Find existing sessions for today to determine next number
  let nextNum = 1;
  if (existsSync(sessionsDir)) {
    const existingFiles = readdirSync(sessionsDir)
      .filter(f => f.startsWith(dateStr) && f.endsWith('.json'))
      .map(f => {
        const match = f.match(/^\d{8}_(\d{3})_/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter(n => !isNaN(n));

    if (existingFiles.length > 0) {
      nextNum = Math.max(...existingFiles) + 1;
    }
  }

  const numStr = String(nextNum).padStart(3, '0');
  return `${dateStr}_${numStr}_${source}`;
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
  const sessionsDir = ensureOpcDir('state/sessions', cwd);
  if (!existsSync(sessionsDir)) return [];

  return readdirSync(sessionsDir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const path = join(sessionsDir, f);
      const state = readJsonFile<ProjectState>(path);
      return state?.project?.requirement_id;
    })
    .filter((id): id is string => !!id);
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
  const sessionsDir = ensureOpcDir('state/sessions', cwd);
  if (!existsSync(sessionsDir)) return null;

  const query = `${projectName} ${projectDescription}`.toLowerCase();
  const queryWords = query.split(/\s+/).filter(w => w.length > 1);

  let bestMatch: { requirementId: string; source: 'matched' | 'auto_assembled'; state: ProjectState; score: number } | null = null;

  const sessionFiles = readdirSync(sessionsDir).filter(f => f.endsWith('.json'));

  for (const file of sessionFiles) {
    const path = join(sessionsDir, file);
    const state = readJsonFile<ProjectState>(path);
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
      const requirementId = state.project.requirement_id || '';
      const source = state.workflow?.source || 'auto_assembled';
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
