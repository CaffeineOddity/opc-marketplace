/**
 * OPC State Management
 *
 * Project state and handoffs.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ensureOpcDir, getWorktreeRoot } from './paths.js';
import { readJsonFile, atomicWriteJson } from './io.js';
import type { ProjectState, HandoffRecord, TaskGroup, StageState, WorkflowSpec } from './types.js';
import { buildStagesFromWorkflow, buildStagesAuto, buildDefaultGates } from './workflow.js';

// ============================================================
// Session File Naming
// ============================================================

/**
 * Generate session filename from requirement_id
 * requirement_id is already in the format: YYYYMMDD_XXX_source
 * Just add .json extension
 */
export function generateSessionFilename(
  requirementId: string,
  source: 'matched' | 'auto_assembled'
): string {
  // requirement_id is the filename without extension
  return `${requirementId}.json`;
}

/**
 * Get the path for a session file
 * Uses requirement_id as the filename
 */
export function getProjectStatePath(
  requirementId: string,
  source: 'matched' | 'auto_assembled',
  cwd?: string
): string {
  const sessionsDir = ensureOpcDir('state/sessions', cwd);
  const filename = generateSessionFilename(requirementId, source);
  return join(sessionsDir, filename);
}

/**
 * Get session file path by filename (for existing sessions)
 */
export function getSessionPathByFilename(filename: string, cwd?: string): string {
  const sessionsDir = ensureOpcDir('state/sessions', cwd);
  return join(sessionsDir, filename);
}

/**
 * Find session file by requirement_id
 * Returns the path if found, null otherwise
 */
export function findSessionByRequirementId(
  requirementId: string,
  cwd?: string
): string | null {
  const sessionsDir = ensureOpcDir('state/sessions', cwd);
  if (!existsSync(sessionsDir)) {
    return null;
  }

  const files = readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const path = join(sessionsDir, file);
    const state = readJsonFile<ProjectState>(path);
    if (state?.project?.requirement_id === requirementId) {
      return path;
    }
  }

  return null;
}

export function readProjectState(requirementId: string, source: 'matched' | 'auto_assembled', cwd?: string): ProjectState | null {
  // First try to find existing session by requirement_id
  const existingPath = findSessionByRequirementId(requirementId, cwd);
  if (existingPath) {
    return readJsonFile<ProjectState>(existingPath);
  }
  // Fallback to old path logic for backward compatibility
  const path = getProjectStatePath(requirementId, source, cwd);
  return readJsonFile<ProjectState>(path);
}

export function writeProjectState(state: ProjectState, cwd?: string): void {
  const requirementId = state.project.requirement_id;
  if (!requirementId) {
    throw new Error('Cannot write project state without requirement_id');
  }
  const source = state.workflow?.source || 'auto_assembled';

  // Try to find existing session file to update
  let path = findSessionByRequirementId(requirementId, cwd);
  if (!path) {
    // Create new session file
    path = getProjectStatePath(requirementId, source, cwd);
  }

  const dir = join(path, '..');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  state.project.updated_at = new Date().toISOString();
  state._meta.updated_by = 'opc_state_write';
  atomicWriteJson(path, state);
}

// ============================================================
// Project State Initialization
// ============================================================

export function initializeProjectState(
  name: string,
  description: string,
  lockId: string,
  requirementId?: string,
  cwd?: string,
  workflow?: WorkflowSpec | null,
  workflowSource?: 'matched' | 'auto_assembled',
  workflowConfidence?: number,
  knowledgeFeatureName?: string,
  knowledgeCategory?: string
): ProjectState {
  const now = new Date().toISOString();

  let stages: Record<string, StageState>;
  let gates: ProjectState['gates'];
  let rules: ProjectState['rules'];
  let workflowMeta: ProjectState['workflow'];

  if (workflow) {
    stages = buildStagesFromWorkflow(workflow);
    gates = workflow.gates;
    rules = workflow.rules;
    workflowMeta = {
      name: workflow.name,
      source: workflowSource || 'matched',
      matched_at: now,
      confidence: workflowConfidence,
    };
  } else {
    stages = buildStagesAuto(description);
    gates = buildDefaultGates(stages);
    rules = {
      tdd: !!stages.dev?.config?.constraints?.includes('tdd_red_first'),
      sdd: !!stages.product,
      parallel_allowed: stages.dev?.config?.agent_mode === 'parallel',
      knowledge_enabled: true,
    };
    workflowMeta = {
      name: 'auto-assembled',
      source: 'auto_assembled',
      matched_at: now,
    };
  }

  const stageOrder = Object.keys(stages);
  const firstStage = stageOrder[0] || 'product';

  return {
    project: {
      name,
      description,
      requirement_id: requirementId,
      knowledge_feature_name: knowledgeFeatureName || '',
      knowledge_category: knowledgeCategory || '',
      created_at: now,
      updated_at: now,
    },
    pipeline: {
      current_stage: firstStage,
      stage_order: stageOrder,  // Preserve stage order
      stages,
    },
    workflow: workflowMeta,
    gates,
    rules,
    context: {
      lock_id: lockId,
      worktree: getWorktreeRoot(cwd),
    },
    _meta: {
      version: '3.1.0',
      updated_by: 'opc_state_init',
    },
  };
}

// ============================================================
// Handoffs
// ============================================================

export function getHandoffPath(lockId: string, cwd?: string): string {
  const stateDir = ensureOpcDir('state', cwd);
  return join(stateDir, lockId, 'handoffs.json');
}

export function recordHandoff(
  fromAgent: string,
  toAgent: string,
  artifacts: string[],
  constraints: string[],
  context: string,
  lockId: string,
  cwd?: string
): HandoffRecord {
  const handoff: HandoffRecord = {
    handoff_id: `handoff-${Date.now().toString(36)}`,
    created_at: new Date().toISOString(),
    from_agent: fromAgent,
    to_agent: toAgent,
    artifacts,
    constraints,
    context,
    lock_id: lockId,
  };

  const path = getHandoffPath(lockId, cwd);
  let handoffs: HandoffRecord[] = readJsonFile(path) || [];
  handoffs.push(handoff);
  atomicWriteJson(path, handoffs);

  return handoff;
}

export function getHandoffs(lockId: string, cwd?: string): HandoffRecord[] {
  const path = getHandoffPath(lockId, cwd);
  return readJsonFile(path) || [];
}

// ============================================================
// Task Groups
// ============================================================

export function createTaskGroup(
  state: ProjectState,
  stage: string,
  groupName: string,
  tasks: Array<{ agent: string; description: string; dependencies?: string[] }>,
  parallel: boolean,
  completionCondition: 'all' | 'any' | 'threshold',
  threshold?: number,
  cwd?: string
): { state: ProjectState; groupId: string } {
  const groupId = `tg-${Date.now().toString(36)}`;
  const now = new Date().toISOString();

  const taskGroup: TaskGroup = {
    group_id: groupId,
    name: groupName,
    tasks: tasks.map((t, i) => ({
      task_id: `${groupId}-task-${i}`,
      agent: t.agent,
      description: t.description,
      status: 'pending' as const,
      progress: 0,
      dependencies: t.dependencies,
    })),
    parallel,
    completion_condition: completionCondition,
    threshold,
    started_at: now,
  };

  if (!state.pipeline.stages[stage]) {
    state.pipeline.stages[stage] = { status: 'pending' };
  }
  if (!state.pipeline.stages[stage].task_groups) {
    state.pipeline.stages[stage].task_groups = [];
  }
  state.pipeline.stages[stage].task_groups!.push(taskGroup);

  writeProjectState(state, cwd);

  return { state, groupId };
}

export function updateTask(
  state: ProjectState,
  taskId: string,
  status: 'pending' | 'in_progress' | 'completed' | 'failed',
  progress?: number,
  artifact?: string,
  cwd?: string
): ProjectState {
  let found = false;

  for (const stageName of Object.keys(state.pipeline.stages)) {
    const stage = state.pipeline.stages[stageName];
    if (!stage.task_groups) continue;

    for (const group of stage.task_groups) {
      const task = group.tasks.find(t => t.task_id === taskId);
      if (task) {
        task.status = status;
        if (progress !== undefined) task.progress = progress;
        if (status === 'in_progress' && !task.started_at) {
          task.started_at = new Date().toISOString();
        }
        if (status === 'completed' || status === 'failed') {
          task.completed_at = new Date().toISOString();
          task.progress = 100;
        }
        if (artifact) {
          if (!task.artifacts) task.artifacts = [];
          task.artifacts.push(artifact);
        }
        found = true;

        // Check if group is complete
        const completedCount = group.tasks.filter(t => t.status === 'completed').length;
        if (group.completion_condition === 'all' && completedCount === group.tasks.length) {
          group.completed_at = new Date().toISOString();
        } else if (group.completion_condition === 'any' && completedCount > 0) {
          group.completed_at = new Date().toISOString();
        } else if (group.completion_condition === 'threshold' && group.threshold && completedCount >= group.threshold) {
          group.completed_at = new Date().toISOString();
        }

        break;
      }
    }
    if (found) break;
  }

  if (found) {
    writeProjectState(state, cwd);
  }

  return state;
}

export function getTaskGroups(state: ProjectState, stage?: string, groupId?: string): TaskGroup[] {
  const groups: TaskGroup[] = [];

  for (const stageName of Object.keys(state.pipeline.stages)) {
    if (stage && stageName !== stage) continue;
    const stageData = state.pipeline.stages[stageName];
    if (!stageData.task_groups) continue;

    for (const group of stageData.task_groups) {
      if (groupId && group.group_id !== groupId) continue;
      groups.push(group);
    }
  }

  return groups;
}
