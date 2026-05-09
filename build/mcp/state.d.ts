/**
 * OPC State Management
 *
 * Project state and handoffs.
 */
import type { ProjectState, HandoffRecord, TaskGroup, WorkflowSpec } from './types.js';
/**
 * Generate session filename from requirement_id
 * requirement_id is already in the format: YYYYMMDD_XXX_source
 * Just add .json extension
 */
export declare function generateSessionFilename(requirementId: string, source: 'matched' | 'auto_assembled'): string;
/**
 * Get the path for a session file
 * Uses requirement_id as the filename
 */
export declare function getProjectStatePath(requirementId: string, source: 'matched' | 'auto_assembled', cwd?: string): string;
/**
 * Get session file path by filename (for existing sessions)
 */
export declare function getSessionPathByFilename(filename: string, cwd?: string): string;
/**
 * Find session file by requirement_id
 * Returns the path if found, null otherwise
 */
export declare function findSessionByRequirementId(requirementId: string, cwd?: string): string | null;
export declare function readProjectState(requirementId: string, source: 'matched' | 'auto_assembled', cwd?: string): ProjectState | null;
export declare function writeProjectState(state: ProjectState, cwd?: string): void;
export declare function initializeProjectState(name: string, description: string, lockId: string, requirementId?: string, cwd?: string, workflow?: WorkflowSpec | null, workflowSource?: 'matched' | 'auto_assembled', workflowConfidence?: number, knowledgeTopic?: string, knowledgeCategory?: string): ProjectState;
export declare function getHandoffPath(lockId: string, cwd?: string): string;
export declare function recordHandoff(fromAgent: string, toAgent: string, artifacts: string[], constraints: string[], context: string, lockId: string, cwd?: string): HandoffRecord;
export declare function getHandoffs(lockId: string, cwd?: string): HandoffRecord[];
export declare function createTaskGroup(state: ProjectState, stage: string, groupName: string, tasks: Array<{
    agent: string;
    description: string;
    dependencies?: string[];
}>, parallel: boolean, completionCondition: 'all' | 'any' | 'threshold', threshold?: number, cwd?: string): {
    state: ProjectState;
    groupId: string;
};
export declare function updateTask(state: ProjectState, taskId: string, status: 'pending' | 'in_progress' | 'completed' | 'failed', progress?: number, artifact?: string, cwd?: string): ProjectState;
export declare function getTaskGroups(state: ProjectState, stage?: string, groupId?: string): TaskGroup[];
