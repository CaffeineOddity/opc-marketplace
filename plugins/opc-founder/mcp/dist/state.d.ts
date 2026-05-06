/**
 * OPC State Management
 *
 * Project state, checkpoints, handoffs, and memory.
 */
import type { ProjectState, Checkpoint, HandoffRecord, MemoryEntry, ProjectMemory, TaskGroup, WorkflowSpec } from './types.js';
export declare function getProjectStatePath(requirementId: string, source: 'matched' | 'auto_assembled', cwd?: string): string;
export declare function readProjectState(requirementId: string, source: 'matched' | 'auto_assembled', cwd?: string): ProjectState | null;
export declare function writeProjectState(state: ProjectState, cwd?: string): void;
export declare function initializeProjectState(name: string, description: string, lockId: string, requirementId?: string, cwd?: string, workflow?: WorkflowSpec | null, workflowSource?: 'matched' | 'auto_assembled', workflowConfidence?: number): ProjectState;
export declare function createCheckpoint(state: ProjectState, description: string, cwd?: string): Checkpoint;
export declare function readCheckpoint(checkpointId: string, cwd?: string): Checkpoint | null;
export declare function listCheckpoints(cwd?: string): Checkpoint[];
export declare function getHandoffPath(lockId: string, cwd?: string): string;
export declare function recordHandoff(fromAgent: string, toAgent: string, artifacts: string[], constraints: string[], context: string, lockId: string, cwd?: string): HandoffRecord;
export declare function getHandoffs(lockId: string, cwd?: string): HandoffRecord[];
export declare function readProjectMemory(cwd?: string): ProjectMemory;
export declare function addMemoryEntry(category: MemoryEntry['category'], content: string, metadata?: Record<string, unknown>, cwd?: string): MemoryEntry;
export declare function searchMemory(query: string, cwd?: string): MemoryEntry[];
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
