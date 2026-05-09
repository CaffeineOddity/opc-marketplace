/**
 * OPC Workflow Discovery and Matching
 *
 * Discovers workflow specs and matches tasks to workflows.
 */
import type { WorkflowSpec, StageState, ProjectState } from './types.js';
/**
 * Read all workflow specs from .opc/workflows/ directory.
 */
export declare function readAllWorkflows(cwd?: string): WorkflowSpec[];
/**
 * Match a task description against workflow triggers.
 */
export declare function matchWorkflow(taskDescription: string, workflows: WorkflowSpec[]): {
    workflow: WorkflowSpec;
    score: number;
} | null;
/**
 * Build stages from a matched workflow.
 */
export declare function buildStagesFromWorkflow(workflow: WorkflowSpec): Record<string, StageState>;
/**
 * Build stages automatically when no workflow matches.
 */
export declare function buildStagesAuto(taskDescription: string): Record<string, StageState>;
/**
 * Build default gates for auto-assembled pipeline.
 */
export declare function buildDefaultGates(stages: Record<string, StageState>): ProjectState['gates'];
