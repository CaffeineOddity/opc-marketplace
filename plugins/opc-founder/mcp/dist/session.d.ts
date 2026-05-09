/**
 * OPC Session Management
 *
 * Session index maps lock_id to requirement_id with workflow source.
 */
import type { SessionIndex, ProjectState } from './types.js';
/**
 * Generate the next available requirement ID
 * Scans existing session files to find the next number
 */
export declare function generateNextRequirementId(cwd?: string): string;
export declare function readSessionIndex(cwd?: string): SessionIndex;
export declare function bindSessionToRequirement(lockId: string, requirementId: string, source: 'matched' | 'auto_assembled', workflowName?: string, cwd?: string): void;
export declare function getCurrentSession(lockId: string, cwd?: string): SessionIndex['sessions'][string] | null;
export declare function getCurrentRequirementId(lockId: string, cwd?: string): string | null;
export declare function listAllTasks(cwd?: string): string[];
/**
 * Find similar existing task by project name/description similarity.
 * Returns the most similar task if similarity >= threshold.
 */
export declare function findSimilarTask(projectName: string, projectDescription: string, cwd?: string, threshold?: number): {
    requirementId: string;
    source: 'matched' | 'auto_assembled';
    state: ProjectState;
    score: number;
} | null;
export declare function getCurrentTask(cwd?: string): ProjectState | null;
export declare function clearCurrentTask(cwd?: string): boolean;
