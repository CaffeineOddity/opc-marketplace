/**
 * OPC MCP Tool Handlers
 *
 * Handles all MCP tool calls for the OPC State Server.
 */

import { existsSync, readdirSync } from 'fs';
import type { KnowledgeCategory, MemoryEntry, StageState } from './types.js';
import { ensureOpcDir, ensureWorkflowsDir, getWorktreeRoot } from './paths.js';
import { updateGitignore } from './io.js';
import { getCurrentLockId } from './lock.js';
import { readAllWorkflows, matchWorkflow } from './workflow.js';
import {
  readKnowledgeIndex,
  initKnowledgeLibrary,
  readKnowledgeDoc,
  readAllKnowledgeDocs,
  writeKnowledgeDoc,
  knowledgeExists,
  listKnowledgeDocs,
  generateNextRequirementId,
  findCandidateRequirements,
} from './knowledge.js';
import {
  bindSessionToRequirement,
  getCurrentSession,
  clearCurrentTask,
  getCurrentTask,
} from './session.js';
import {
  readProjectState,
  writeProjectState,
  initializeProjectState,
  createCheckpoint,
  readCheckpoint,
  listCheckpoints,
  recordHandoff,
  readProjectMemory,
  addMemoryEntry,
  searchMemory,
  createTaskGroup,
  updateTask,
  getTaskGroups,
} from './state.js';

// ============================================================
// Types
// ============================================================

export type ToolResult = {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
};

// ============================================================
// State Handlers
// ============================================================

export function handleStateRead(cwd: string | undefined): ToolResult {
  const state = getCurrentTask(cwd);

  if (!state) {
    return {
      content: [{
        type: 'text',
        text: 'No active task. Use opc_state_init to start a new project.',
      }],
    };
  }

  const stageStatus = Object.entries(state.pipeline.stages)
    .map(([stage, data]) => {
      const icon = data.status === 'completed' ? '✅' :
                  data.status === 'in_progress' ? '🔄' :
                  data.status === 'blocked' ? '🚫' : '⏳';
      const required = data.config?.required === false ? ' (optional)' : '';
      const desc = data.config?.description ? ` — ${data.config.description}` : '';
      return `${icon} **${stage}**${required}: ${data.status}${desc}${data.progress ? ` (${Object.entries(data.progress).map(([k, v]) => `${k}: ${v}%`).join(', ')})` : ''}`;
    })
    .join('\n');

  const requirementInfo = state.project.requirement_id
    ? `\n**Requirement ID:** ${state.project.requirement_id}`
    : '';

  const workflowInfo = state.workflow
    ? `\n**Workflow:** ${state.workflow.name} (${state.workflow.source}${state.workflow.confidence ? `, ${Math.round(state.workflow.confidence * 100)}% match` : ''})`
    : '';

  const rulesInfo = state.rules
    ? `\n\n### Rules\n${state.rules.tdd ? '- ✅ TDD enabled\n' : ''}${state.rules.sdd ? '- ✅ SDD enabled\n' : ''}${state.rules.parallel_allowed ? '- ✅ Parallel execution allowed\n' : ''}${state.rules.knowledge_enabled ? '- ✅ Knowledge flow enabled\n' : ''}`
    : '';

  const currentStage = state.pipeline.stages[state.pipeline.current_stage];
  const knowledgeInfo = currentStage?.config?.knowledge
    ? `\n\n### Current Stage Knowledge\n` +
      (currentStage.config.knowledge.read_before
        ? `- **Read before:** ${Array.isArray(currentStage.config.knowledge.read_before) ? currentStage.config.knowledge.read_before.join(', ') : 'none'}\n`
        : '') +
      (currentStage.config.knowledge.write_after
        ? `- **Write after:** ${currentStage.config.knowledge.domain}/${currentStage.config.knowledge.doc}\n`
        : '')
    : '';

  return {
    content: [{
      type: 'text',
      text: `## OPC Project State

**Project:** ${state.project.name}${requirementInfo}
**Lock ID:** ${state.context.lock_id}
**Current Stage:** ${state.pipeline.current_stage}${workflowInfo}
**Created:** ${state.project.created_at}
**Updated:** ${state.project.updated_at}

### Pipeline Progress

${stageStatus}${rulesInfo}${knowledgeInfo}

### Artifacts
${Object.entries(state.pipeline.stages)
  .filter(([, data]) => data.artifacts?.length)
  .map(([stage, data]) => `- **${stage}**: ${data.artifacts?.join(', ')}`)
  .join('\n') || 'No artifacts recorded yet.'}
`,
    }],
  };
}

export function handleStateInit(args: Record<string, unknown>, cwd: string | undefined): ToolResult {
  const projectName = args.project_name as string;
  const projectDescription = (args.project_description as string) || '';
  const providedRequirementId = args.requirement_id as string | undefined;
  const lockId = getCurrentLockId(cwd);

  // Check if current window already has a task bound
  const currentSession = getCurrentSession(lockId, cwd);

  if (currentSession) {
    const existingTask = readProjectState(currentSession.requirement_id, currentSession.source, cwd);
    if (existingTask) {
      const currentStatus = existingTask.pipeline.stages[existingTask.pipeline.current_stage]?.status;
      if (currentStatus === 'in_progress') {
        return {
          content: [{
            type: 'text',
            text: `## Task Already Bound

**Current Task:** ${existingTask.project.name}
**Requirement ID:** ${existingTask.project.requirement_id || 'Not set'}
**Stage:** ${existingTask.pipeline.current_stage}
**Status:** 🔄 in_progress

One window can only have one active task at a time.

Options:
1. Continue the current task with \`opc_state_read\`
2. Unbind from current task with \`opc_state_clear\` and start fresh
`,
          }],
        };
      }
    }
  }

  // Determine requirement ID
  let requirementId = providedRequirementId;
  let requirementMatchInfo = '';

  if (!requirementId) {
    const index = readKnowledgeIndex(cwd);
    const candidates = findCandidateRequirements(index, projectName);

    if (candidates.length > 0 && candidates[0].score >= 0.5) {
      requirementId = candidates[0].id;
      requirementMatchInfo = `\n\n🔗 **Matched existing requirement:** ${requirementId} (similarity: ${Math.round(candidates[0].score * 100)}%)`;
    } else if (candidates.length > 0) {
      const candidateList = candidates.slice(0, 3)
        .map(c => `  - **${c.id}**: ${c.title} (${Math.round(c.score * 100)}% match)`)
        .join('\n');

      return {
        content: [{
          type: 'text',
          text: `## Similar Requirements Found

The following requirements may be related to your task:

${candidateList}

**Options:**
1. Specify a requirement ID: \`opc_state_init(project_name, requirement_id="REQ-XXX")\`
2. Create new: \`opc_state_init(project_name, requirement_id="new")\`
3. Let system auto-generate: call again without requirement_id (will create REQ-XXX)

Please choose how to proceed.
`,
        }],
      };
    } else {
      requirementId = generateNextRequirementId(cwd);
      requirementMatchInfo = `\n\n🆕 **Generated new requirement ID:** ${requirementId}`;
    }
  } else if (requirementId === 'new') {
    requirementId = generateNextRequirementId(cwd);
    requirementMatchInfo = `\n\n🆕 **Generated new requirement ID:** ${requirementId}`;
  }

  // Initialize knowledge library (idempotent)
  const knowledgeResult = initKnowledgeLibrary(requirementId, projectName, cwd);
  const knowledgeInfo = knowledgeResult.isNew
    ? 'Knowledge library initialized.'
    : `Resumed existing requirement: "${knowledgeResult.title}"`;

  // Try to match workflow FIRST (before binding session)
  const taskDescription = `${projectName} ${projectDescription}`.trim();
  const workflows = readAllWorkflows(cwd);
  const workflowMatch = matchWorkflow(taskDescription, workflows);

  let workflowInfo = '';
  let matchedWorkflow = null;
  let workflowSource: 'matched' | 'auto_assembled' = 'auto_assembled';
  let workflowConfidence: number | undefined;

  if (workflowMatch && workflowMatch.score >= 0.3) {
    matchedWorkflow = workflowMatch.workflow;
    workflowSource = 'matched';
    workflowConfidence = workflowMatch.score;
    workflowInfo = `\n\n📋 **Workflow:** ${matchedWorkflow.name} (matched, ${Math.round(workflowMatch.score * 100)}% confidence)`;
  } else {
    workflowInfo = '\n\n🔧 **Pipeline:** Auto-assembled based on task analysis';
  }

  // Bind current session to this requirement (with workflow source)
  bindSessionToRequirement(
    lockId,
    requirementId,
    workflowSource,
    matchedWorkflow?.name,
    cwd
  );

  // Initialize new task with workflow
  const state = initializeProjectState(
    projectName,
    projectDescription,
    lockId,
    requirementId,
    cwd,
    matchedWorkflow,
    workflowSource,
    workflowConfidence
  );

  // Mark first stage as in_progress
  const firstStage = state.pipeline.current_stage;
  if (state.pipeline.stages[firstStage]) {
    state.pipeline.stages[firstStage].status = 'in_progress';
    state.pipeline.stages[firstStage].started_at = new Date().toISOString();
  }
  writeProjectState(state, cwd);

  // Update .gitignore if needed
  const gitignoreUpdated = updateGitignore(cwd);
  const gitignoreMsg = gitignoreUpdated
    ? '\n\n📝 **.gitignore updated**: Added `.opc/state/` to ignore personal session data.'
    : '';

  // Build stage info for output
  const stageList = Object.entries(state.pipeline.stages)
    .map(([stageName, stageData]) => {
      const required = stageData.config?.required ? ' (required)' : '';
      const desc = stageData.config?.description ? ` - ${stageData.config.description}` : '';
      return `- **${stageName}**${required}${desc}`;
    })
    .join('\n');

  return {
    content: [{
      type: 'text',
      text: `## OPC Task Initialized

**Lock ID:** ${lockId}
**Project:** ${projectName}
**Requirement ID:** ${requirementId}${requirementMatchInfo}${workflowInfo}

### Pipeline Stages

${stageList}

### Knowledge Library
${knowledgeInfo}

The pipeline is ready. Stage "${firstStage}" is now in progress.
Use \`opc_state_write\` to update progress as you advance through stages.
Use \`opc_knowledge_read\` and \`opc_knowledge_write\` to manage knowledge.${gitignoreMsg}
`,
    }],
  };
}

export function handleStateClear(cwd: string | undefined): ToolResult {
  const lockId = getCurrentLockId(cwd);
  const session = getCurrentSession(lockId, cwd);
  const cleared = clearCurrentTask(cwd);

  if (cleared) {
    return {
      content: [{
        type: 'text',
        text: `## Task Unbound

**Previous Requirement:** ${session?.requirement_id}

The current window has been unbound from this requirement.
You can start a new task with \`opc_state_init\`.

**Note:** The requirement's state file is preserved for history.
Use \`opc_state_init(requirement_id="${session?.requirement_id}")\` to resume.`,
      }],
    };
  } else {
    return {
      content: [{
        type: 'text',
        text: `No task to clear. Use \`opc_state_init\` to start a new task.`,
      }],
    };
  }
}

export function handleStateWrite(args: Record<string, unknown>, cwd: string | undefined): ToolResult {
  const state = getCurrentTask(cwd);

  if (!state) {
    return {
      content: [{
        type: 'text',
        text: 'No active task. Use opc_state_init to start a new project.',
      }],
      isError: true,
    };
  }

  // Update stage status
  if (args.stage && args.stage_status) {
    const stage = args.stage as string;
    const stageStatus = args.stage_status as string;

    if (!state.pipeline.stages[stage]) {
      state.pipeline.stages[stage] = { status: 'pending' };
    }

    state.pipeline.stages[stage].status = stageStatus as StageState['status'];

    if (stageStatus === 'in_progress' && !state.pipeline.stages[stage].started_at) {
      state.pipeline.stages[stage].started_at = new Date().toISOString();
    }
    if (stageStatus === 'completed') {
      state.pipeline.stages[stage].completed_at = new Date().toISOString();
      state.pipeline.stages[stage].verification_passed = true;

      // Auto-advance to next stage
      const stageOrder = Object.keys(state.pipeline.stages);
      const currentIndex = stageOrder.indexOf(stage);
      if (currentIndex >= 0 && currentIndex < stageOrder.length - 1) {
        const nextStage = stageOrder[currentIndex + 1];
        if (state.pipeline.stages[nextStage]?.status === 'pending' || !state.pipeline.stages[nextStage]) {
          state.pipeline.current_stage = nextStage;
          state.pipeline.stages[nextStage] = { status: 'pending' };
        }
      }
    }

    if (stageStatus === 'in_progress') {
      state.pipeline.current_stage = stage;
    }
  }

  // Add agent
  if (args.agent) {
    const stage = state.pipeline.current_stage;
    if (!state.pipeline.stages[stage].agents_used) {
      state.pipeline.stages[stage].agents_used = [];
    }
    if (!state.pipeline.stages[stage].agents_used!.includes(args.agent as string)) {
      state.pipeline.stages[stage].agents_used!.push(args.agent as string);
    }
  }

  // Add artifact
  if (args.artifact) {
    const stage = (args.stage as string) || state.pipeline.current_stage;
    if (!state.pipeline.stages[stage]) {
      state.pipeline.stages[stage] = { status: 'pending' };
    }
    if (!state.pipeline.stages[stage].artifacts) {
      state.pipeline.stages[stage].artifacts = [];
    }
    state.pipeline.stages[stage].artifacts!.push(args.artifact as string);
  }

  // Update progress
  if (args.progress) {
    const stage = (args.stage as string) || state.pipeline.current_stage;
    if (!state.pipeline.stages[stage]) {
      state.pipeline.stages[stage] = { status: 'pending' };
    }
    state.pipeline.stages[stage].progress = args.progress as Record<string, number>;
  }

  // Add blocker
  if (args.blocker) {
    const stage = (args.stage as string) || state.pipeline.current_stage;
    if (!state.pipeline.stages[stage]) {
      state.pipeline.stages[stage] = { status: 'pending' };
    }
    if (!state.pipeline.stages[stage].blockers) {
      state.pipeline.stages[stage].blockers = [];
    }
    state.pipeline.stages[stage].blockers!.push(args.blocker as string);
    state.pipeline.stages[stage].status = 'blocked';
  }

  writeProjectState(state, cwd);

  return {
    content: [{
      type: 'text',
      text: `State updated.

**Current Stage:** ${state.pipeline.current_stage}
**Stage Status:** ${state.pipeline.stages[state.pipeline.current_stage].status}
`,
    }],
  };
}

// ============================================================
// Checkpoint Handlers
// ============================================================

export function handleCheckpointCreate(args: Record<string, unknown>, cwd: string | undefined): ToolResult {
  const state = getCurrentTask(cwd);

  if (!state) {
    return {
      content: [{
        type: 'text',
        text: 'No active task to checkpoint.',
      }],
      isError: true,
    };
  }

  const checkpoint = createCheckpoint(state, args.description as string, cwd);

  return {
    content: [{
      type: 'text',
      text: `## Checkpoint Created

**Checkpoint ID:** ${checkpoint.checkpoint_id}
**Stage:** ${checkpoint.stage}
**Description:** ${checkpoint.description}
**Can Rollback:** ${checkpoint.can_rollback}

Use \`opc_checkpoint_rollback\` with the checkpoint ID to restore this state.
`,
    }],
  };
}

export function handleCheckpointList(cwd: string | undefined): ToolResult {
  const checkpoints = listCheckpoints(cwd);

  if (checkpoints.length === 0) {
    return {
      content: [{
        type: 'text',
        text: 'No checkpoints found.',
      }],
    };
  }

  const list = checkpoints
    .map(cp => `- **${cp.checkpoint_id}**: ${cp.description} (${cp.stage}) - ${cp.created_at}`)
    .join('\n');

  return {
    content: [{
      type: 'text',
      text: `## Checkpoints (${checkpoints.length})

${list}
`,
    }],
  };
}

export function handleCheckpointRollback(args: Record<string, unknown>, cwd: string | undefined): ToolResult {
  const checkpoint = readCheckpoint(args.checkpoint_id as string, cwd);

  if (!checkpoint) {
    return {
      content: [{
        type: 'text',
        text: `Checkpoint not found: ${args.checkpoint_id}`,
      }],
      isError: true,
    };
  }

  writeProjectState(checkpoint.state_snapshot, cwd);

  return {
    content: [{
      type: 'text',
      text: `## Rolled Back to Checkpoint

**Checkpoint ID:** ${checkpoint.checkpoint_id}
**Stage:** ${checkpoint.stage}
**Description:** ${checkpoint.description}

The project state has been restored to the checkpoint.
`,
    }],
  };
}

// ============================================================
// Handoff Handler
// ============================================================

export function handleHandoff(args: Record<string, unknown>, cwd: string | undefined): ToolResult {
  const state = getCurrentTask(cwd);

  if (!state) {
    return {
      content: [{
        type: 'text',
        text: 'No active task for handoff.',
      }],
      isError: true,
    };
  }

  const handoff = recordHandoff(
    args.from_agent as string,
    args.to_agent as string,
    args.artifacts as string[],
    (args.constraints as string[]) || [],
    (args.context as string) || '',
    state.context.lock_id,
    cwd
  );

  return {
    content: [{
      type: 'text',
      text: `## Handoff Recorded

**From:** ${handoff.from_agent}
**To:** ${handoff.to_agent}
**Artifacts:** ${handoff.artifacts.join(', ')}
**Constraints:** ${handoff.constraints.length > 0 ? handoff.constraints.join(', ') : 'None'}

The receiving agent should check constraints and artifacts before starting work.
`,
    }],
  };
}

// ============================================================
// Memory Handler
// ============================================================

export function handleMemory(args: Record<string, unknown>, cwd: string | undefined): ToolResult {
  const action = args.action as string;

  if (action === 'read') {
    const memory = readProjectMemory(cwd);
    const grouped = memory.entries.reduce((acc, entry) => {
      if (!acc[entry.category]) acc[entry.category] = [];
      acc[entry.category].push(entry);
      return acc;
    }, {} as Record<string, MemoryEntry[]>);

    const output = Object.entries(grouped)
      .map(([category, entries]) => {
        const items = entries.map(e => `- ${e.content}`).join('\n');
        return `### ${category}\n${items}`;
      })
      .join('\n\n');

    return {
      content: [{
        type: 'text',
        text: `## Project Memory (${memory.entries.length} entries)

${output || 'No entries yet.'}
`,
      }],
    };
  }

  if (action === 'write') {
    if (!args.category || !args.content) {
      return {
        content: [{
          type: 'text',
          text: 'category and content are required for write action.',
        }],
        isError: true,
      };
    }

    const entry = addMemoryEntry(
      args.category as MemoryEntry['category'],
      args.content as string,
      undefined,
      cwd
    );

    return {
      content: [{
        type: 'text',
        text: `Memory entry added: [${entry.category}] ${entry.content}`,
      }],
    };
  }

  if (action === 'search') {
    const results = searchMemory(args.query as string, cwd);
    const output = results
      .map(e => `- [${e.category}] ${e.content}`)
      .join('\n');

    return {
      content: [{
        type: 'text',
        text: `## Search Results (${results.length})

${output || 'No matches found.'}
`,
      }],
    };
  }

  return {
    content: [{
      type: 'text',
      text: 'Invalid action. Use read, write, or search.',
    }],
    isError: true,
  };
}

// ============================================================
// Session Handler
// ============================================================

export function handleSessionsList(cwd: string | undefined): ToolResult {
  const lockId = getCurrentLockId(cwd);
  const currentSession = getCurrentSession(lockId, cwd);
  const stateDir = ensureOpcDir('state', cwd);

  const allTaskDirs = existsSync(stateDir)
    ? readdirSync(stateDir).filter((f: string) =>
        f.match(/^REQ-\d+_(matched|auto_assembled)$/)
      )
    : [];

  if (allTaskDirs.length === 0) {
    return {
      content: [{
        type: 'text',
        text: 'No tasks found. Use opc_state_init to start a new project.',
      }],
    };
  }

  const taskList = allTaskDirs
    .map((dirName: string) => {
      const match = dirName.match(/^(REQ-\d+)_(matched|auto_assembled)$/);
      if (!match) return null;

      const reqId = match[1];
      const source = match[2] as 'matched' | 'auto_assembled';
      const state = readProjectState(reqId, source, cwd);
      if (!state) return null;

      const isCurrent = currentSession &&
        currentSession.requirement_id === reqId &&
        currentSession.source === source;
      const status = state.pipeline.stages[state.pipeline.current_stage]?.status || 'pending';
      const icon = status === 'in_progress' ? '🔄' :
                   status === 'completed' ? '✅' :
                   status === 'blocked' ? '🚫' : '⏳';
      const currentMarker = isCurrent ? ' ← **current**' : '';
      const workflowTag = state.workflow?.name || source;

      return `${icon} **${reqId}** [${workflowTag}]: ${state.project.name} (${status})${currentMarker}`;
    })
    .filter(Boolean)
    .join('\n');

  return {
    content: [{
      type: 'text',
      text: `## All Tasks (${allTaskDirs.length})

${taskList}

Use \`opc_state_init(requirement_id="REQ-XXX")\` to resume a task.`,
    }],
  };
}

// ============================================================
// Task Group Handlers
// ============================================================

export function handleTaskGroupCreate(args: Record<string, unknown>, cwd: string | undefined): ToolResult {
  const state = getCurrentTask(cwd);

  if (!state) {
    return {
      content: [{ type: 'text', text: 'No active task. Use opc_state_init first.' }],
      isError: true,
    };
  }

  const stage = args.stage as string;
  const groupName = args.group_name as string;
  const tasks = args.tasks as Array<{ agent: string; description: string; dependencies?: string[] }>;
  const parallel = args.parallel !== false;
  const completionCondition = (args.completion_condition as string) || 'all';
  const threshold = args.threshold as number | undefined;

  const result = createTaskGroup(
    state,
    stage,
    groupName,
    tasks,
    parallel,
    completionCondition as 'all' | 'any' | 'threshold',
    threshold,
    cwd
  );

  const taskList = result.state.pipeline.stages[stage].task_groups!
    .find(g => g.group_id === result.groupId)!
    .tasks
    .map(t => `- **${t.task_id}**: ${t.agent} - ${t.description}`)
    .join('\n');

  return {
    content: [{
      type: 'text',
      text: `## Task Group Created

**Group ID:** ${result.groupId}
**Stage:** ${stage}
**Parallel:** ${parallel}
**Completion:** ${completionCondition}${threshold ? ` (threshold: ${threshold})` : ''}

### Tasks (${tasks.length})

${taskList}

Use \`opc_task_update\` to update task progress.
`,
    }],
  };
}

export function handleTaskUpdate(args: Record<string, unknown>, cwd: string | undefined): ToolResult {
  const state = getCurrentTask(cwd);

  if (!state) {
    return {
      content: [{ type: 'text', text: 'No active task.' }],
      isError: true,
    };
  }

  const taskId = args.task_id as string;
  const status = args.status as 'pending' | 'in_progress' | 'completed' | 'failed';
  const progress = args.progress as number | undefined;
  const artifact = args.artifact as string | undefined;

  updateTask(state, taskId, status, progress, artifact, cwd);

  return {
    content: [{
      type: 'text',
      text: `Task ${taskId} updated: ${status}${progress !== undefined ? ` (${progress}%)` : ''}`,
    }],
  };
}

export function handleTaskGroupStatus(args: Record<string, unknown>, cwd: string | undefined): ToolResult {
  const state = getCurrentTask(cwd);

  if (!state) {
    return {
      content: [{ type: 'text', text: 'No active task.' }],
      isError: true,
    };
  }

  const stage = args.stage as string | undefined;
  const groupId = args.group_id as string | undefined;

  const groups = getTaskGroups(state, stage, groupId);

  if (groups.length === 0) {
    return {
      content: [{ type: 'text', text: 'No task groups found.' }],
    };
  }

  const output = groups.map(group => {
    const completed = group.tasks.filter(t => t.status === 'completed').length;
    const inProgress = group.tasks.filter(t => t.status === 'in_progress').length;
    const failed = group.tasks.filter(t => t.status === 'failed').length;
    const pending = group.tasks.filter(t => t.status === 'pending').length;

    const taskList = group.tasks
      .map(t => {
        const icon = t.status === 'completed' ? '✅' :
                    t.status === 'in_progress' ? '🔄' :
                    t.status === 'failed' ? '❌' : '⏳';
        return `  ${icon} ${t.task_id}: ${t.agent} (${t.progress}%) - ${t.description}`;
      })
      .join('\n');

    return `### ${group.name} (${group.group_id})
**Parallel:** ${group.parallel} | **Completion:** ${group.completion_condition}
**Status:** ✅${completed} 🔄${inProgress} ❌${failed} ⏳${pending}
${group.completed_at ? `**Completed:** ${group.completed_at}` : ''}

${taskList}`;
  }).join('\n\n');

  return {
    content: [{
      type: 'text',
      text: `## Task Group Status\n\n${output}`,
    }],
  };
}

// ============================================================
// Workflow Handler
// ============================================================

export function handleWorkflowsPath(cwd: string | undefined): ToolResult {
  const workflowsDir = ensureWorkflowsDir(cwd);
  const gitRoot = getWorktreeRoot(cwd);

  return {
    content: [{
      type: 'text',
      text: `## Workflows Directory

**Path:** ${workflowsDir}
**Git Root:** ${gitRoot}

All workflow files should be read from/written to this directory.
This ensures consistency regardless of current working directory.`,
    }],
  };
}

// ============================================================
// Knowledge Handlers
// ============================================================

export function handleKnowledgeInit(args: Record<string, unknown>, cwd: string | undefined): ToolResult {
  const requirementId = args.requirementId as string;
  const title = args.title as string;

  try {
    initKnowledgeLibrary(requirementId, title, cwd);

    return {
      content: [{
        type: 'text',
        text: `## Knowledge Library Initialized

**Requirement ID:** ${requirementId}
**Title:** ${title}
**Path:** .opc/knowledge/${requirementId}/

Knowledge documents will be created on-demand when writing to each category.

### Categories (aligned with pipeline stages)

| Stage | Category | Description |
|-------|----------|-------------|
| Product | requirement | Requirement specs, user stories |
| Design | design | UI/UX, interaction, visual assets |
| Dev | backend, ios, android, harmony, web, miniprogram | Platform-specific implementation |
| QA | qa | Test plans, test cases |
| Ship | ship | Deployment, CI/CD, infrastructure |
| Growth | growth | Metrics, analytics, marketing |`,
      }],
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error: ${error instanceof Error ? error.message : String(error)}`,
      }],
      isError: true,
    };
  }
}

export function handleKnowledgeRead(args: Record<string, unknown>, cwd: string | undefined): ToolResult {
  const requirementId = args.requirementId as string;
  const category = args.category as KnowledgeCategory;
  const doc = args.doc as string | undefined;

  if (doc) {
    const content = readKnowledgeDoc(requirementId, category, doc, cwd);

    if (!content) {
      return {
        content: [{
          type: 'text',
          text: `Knowledge document not found: ${requirementId}/${category}/${doc}.md`,
        }],
      };
    }

    return {
      content: [{
        type: 'text',
        text: content,
      }],
    };
  }

  const content = readAllKnowledgeDocs(requirementId, category, cwd);

  if (!content) {
    return {
      content: [{
        type: 'text',
        text: `No knowledge documents found for ${requirementId}/${category}`,
      }],
    };
  }

  return {
    content: [{
      type: 'text',
      text: content,
    }],
  };
}

export function handleKnowledgeWrite(args: Record<string, unknown>, cwd: string | undefined): ToolResult {
  const requirementId = args.requirementId as string;
  const category = args.category as KnowledgeCategory;
  const doc = args.doc as string;
  const content = args.content as string;
  const mode = (args.mode as 'append' | 'update' | 'overwrite') || 'append';
  const section = args.section as string | undefined;

  const index = readKnowledgeIndex(cwd);
  if (!index.requirements[requirementId]) {
    return {
      content: [{
        type: 'text',
        text: `Error: Requirement ${requirementId} not found. Initialize with opc_knowledge_init first.`,
      }],
      isError: true,
    };
  }

  writeKnowledgeDoc(requirementId, category, doc, content, mode, section, cwd);

  return {
    content: [{
      type: 'text',
      text: `## Knowledge Written

**Requirement:** ${requirementId}
**Document:** ${category}/${doc}.md
**Mode:** ${mode}${section ? `\n**Section:** ${section}` : ''}

Content has been ${mode === 'overwrite' ? 'written' : mode === 'update' ? 'updated' : 'appended'}.`,
    }],
  };
}

export function handleKnowledgeExists(args: Record<string, unknown>, cwd: string | undefined): ToolResult {
  const requirementId = args.requirementId as string;
  const category = args.category as KnowledgeCategory | undefined;
  const doc = args.doc as string | undefined;

  const exists = knowledgeExists(requirementId, category, doc, cwd);

  return {
    content: [{
      type: 'text',
      text: exists ? 'true' : 'false',
    }],
  };
}

export function handleKnowledgeList(args: Record<string, unknown>, cwd: string | undefined): ToolResult {
  const status = args.status as string | undefined;
  const categoryFilter = args.category as KnowledgeCategory | undefined;

  const index = readKnowledgeIndex(cwd);
  let requirements = Object.entries(index.requirements);

  if (status) {
    requirements = requirements.filter(([, r]) => r.status === status);
  }

  if (categoryFilter) {
    requirements = requirements.filter(([, r]) => r.domains[categoryFilter]?.length > 0);
  }

  if (requirements.length === 0) {
    return {
      content: [{
        type: 'text',
        text: 'No requirements found in knowledge library.',
      }],
    };
  }

  const table = requirements
    .map(([id, r]) => {
      const categories = Object.keys(r.domains).join(', ') || '-';
      return `| ${id} | ${r.title} | ${r.status} | ${categories} | ${r.updated_at.split('T')[0]} |`;
    })
    .join('\n');

  return {
    content: [{
      type: 'text',
      text: `## Knowledge Library

| ID | Title | Status | Categories | Updated |
|-----|-------|--------|---------|--------|
${table}`,
    }],
  };
}

export function handleKnowledgeDocs(args: Record<string, unknown>, cwd: string | undefined): ToolResult {
  const requirementId = args.requirementId as string;
  const category = args.category as KnowledgeCategory;

  const docs = listKnowledgeDocs(requirementId, category, cwd);

  if (docs.length === 0) {
    return {
      content: [{
        type: 'text',
        text: `No documents found for ${requirementId}/${category}`,
      }],
    };
  }

  const docList = docs.map(d => `- ${d}.md`).join('\n');

  return {
    content: [{
      type: 'text',
      text: `## ${requirementId}/${category} Documents

${docList}`,
    }],
  };
}

// ============================================================
// Main Handler Router
// ============================================================

export async function handleToolCall(
  name: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const cwd = args.workingDirectory as string | undefined;

  try {
    switch (name) {
      case 'opc_state_read':
        return handleStateRead(cwd);
      case 'opc_state_init':
        return handleStateInit(args, cwd);
      case 'opc_state_clear':
        return handleStateClear(cwd);
      case 'opc_state_write':
        return handleStateWrite(args, cwd);
      case 'opc_checkpoint_create':
        return handleCheckpointCreate(args, cwd);
      case 'opc_checkpoint_list':
        return handleCheckpointList(cwd);
      case 'opc_checkpoint_rollback':
        return handleCheckpointRollback(args, cwd);
      case 'opc_handoff':
        return handleHandoff(args, cwd);
      case 'opc_memory':
        return handleMemory(args, cwd);
      case 'opc_sessions_list':
        return handleSessionsList(cwd);
      case 'opc_task_group_create':
        return handleTaskGroupCreate(args, cwd);
      case 'opc_task_update':
        return handleTaskUpdate(args, cwd);
      case 'opc_task_group_status':
        return handleTaskGroupStatus(args, cwd);
      case 'opc_workflows_path':
        return handleWorkflowsPath(cwd);
      case 'opc_knowledge_init':
        return handleKnowledgeInit(args, cwd);
      case 'opc_knowledge_read':
        return handleKnowledgeRead(args, cwd);
      case 'opc_knowledge_write':
        return handleKnowledgeWrite(args, cwd);
      case 'opc_knowledge_exists':
        return handleKnowledgeExists(args, cwd);
      case 'opc_knowledge_list':
        return handleKnowledgeList(args, cwd);
      case 'opc_knowledge_docs':
        return handleKnowledgeDocs(args, cwd);
      default:
        return {
          content: [{
            type: 'text',
            text: `Unknown tool: ${name}`,
          }],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error: ${error instanceof Error ? error.message : String(error)}`,
      }],
      isError: true,
    };
  }
}
