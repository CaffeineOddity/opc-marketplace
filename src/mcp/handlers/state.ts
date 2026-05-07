/**
 * State Handlers
 *
 * Handles opc_state_* tool calls.
 */

import type { StageState } from '../types.js';
import { getCurrentLockId } from '../lock.js';
import { readAllWorkflows, matchWorkflow } from '../workflow.js';
import {
  readKnowledgeIndex,
  initKnowledgeLibrary,
  generateNextRequirementId,
  findCandidateRequirements,
} from '../knowledge.js';
import {
  bindSessionToRequirement,
  getCurrentSession,
  clearCurrentTask,
  getCurrentTask,
} from '../session.js';
import {
  readProjectState,
  writeProjectState,
  initializeProjectState,
} from '../state.js';
import { updateGitignore } from '../io.js';
import type { ToolResult } from './index.js';

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

  const knowledgeResult = initKnowledgeLibrary(requirementId, projectName, cwd);
  const knowledgeInfo = knowledgeResult.isNew
    ? 'Knowledge library initialized.'
    : `Resumed existing requirement: "${knowledgeResult.title}"`;

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

  bindSessionToRequirement(lockId, requirementId, workflowSource, matchedWorkflow?.name, cwd);

  const state = initializeProjectState(
    projectName, projectDescription, lockId, requirementId, cwd,
    matchedWorkflow, workflowSource, workflowConfidence
  );

  const firstStage = state.pipeline.current_stage;
  if (state.pipeline.stages[firstStage]) {
    state.pipeline.stages[firstStage].status = 'in_progress';
    state.pipeline.stages[firstStage].started_at = new Date().toISOString();
  }
  writeProjectState(state, cwd);

  const gitignoreUpdated = updateGitignore(cwd);
  const gitignoreMsg = gitignoreUpdated
    ? '\n\n📝 **.gitignore updated**: Added `.opc/state/` to ignore personal session data.'
    : '';

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
      content: [{ type: 'text', text: 'No active task. Use opc_state_init to start a new project.' }],
      isError: true,
    };
  }

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

      // Use predefined stage order instead of Object.keys
      const stageOrder = ['product', 'design', 'dev', 'qa', 'ship', 'growth'];
      const currentIndex = stageOrder.indexOf(stage);
      if (currentIndex >= 0 && currentIndex < stageOrder.length - 1) {
        const nextStage = stageOrder[currentIndex + 1];
        // Only advance if next stage doesn't exist or is pending
        if (!state.pipeline.stages[nextStage] || state.pipeline.stages[nextStage]?.status === 'pending') {
          state.pipeline.current_stage = nextStage;
          if (!state.pipeline.stages[nextStage]) {
            state.pipeline.stages[nextStage] = { status: 'pending' };
          }
        }
      }
    }

    if (stageStatus === 'in_progress') {
      state.pipeline.current_stage = stage;
    }
  }

  if (args.agent) {
    const stage = state.pipeline.current_stage;
    if (!state.pipeline.stages[stage].agents_used) {
      state.pipeline.stages[stage].agents_used = [];
    }
    if (!state.pipeline.stages[stage].agents_used!.includes(args.agent as string)) {
      state.pipeline.stages[stage].agents_used!.push(args.agent as string);
    }
  }

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

  if (args.progress) {
    const stage = (args.stage as string) || state.pipeline.current_stage;
    if (!state.pipeline.stages[stage]) {
      state.pipeline.stages[stage] = { status: 'pending' };
    }
    state.pipeline.stages[stage].progress = args.progress as Record<string, number>;
  }

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