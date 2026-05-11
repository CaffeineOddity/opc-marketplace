/**
 * State Handlers
 *
 * Handles opc_state_* tool calls.
 */
import { getCurrentLockId } from '../lock.js';
import { readAllWorkflows, matchWorkflow } from '../workflow.js';
import { findSimilarKnowledgeFeature, } from '../knowledge.js';
import { bindSessionToRequirement, getCurrentSession, clearCurrentTask, getCurrentTask, generateNextRequirementId, findSimilarTask, } from '../session.js';
import { readProjectState, writeProjectState, initializeProjectState, } from '../state.js';
import { updateGitignore } from '../io.js';
export function handleStateRead(cwd) {
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
    const topicInfo = state.project.knowledge_feature_name
        ? `\n**Knowledge Feature:** ${state.project.knowledge_feature_name}${state.project.knowledge_category ? ` (${state.project.knowledge_category})` : ''}`
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
                ? `- **Write after:** ${currentStage.config.knowledge.category}/${currentStage.config.knowledge.doc}\n`
                : '')
        : '';
    return {
        content: [{
                type: 'text',
                text: `## OPC Project State

**Project:** ${state.project.name}${requirementInfo}${topicInfo}
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
export function handleStateInit(args, cwd) {
    const projectName = args.project_name;
    const projectDescription = args.project_description || '';
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
**Knowledge Feature:** ${existingTask.project.knowledge_feature_name || 'Not set'}
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
    // Try to find similar existing task
    const similarTask = findSimilarTask(projectName, projectDescription, cwd, 0.5);
    let requirementId;
    let workflowSource;
    let matchedWorkflow = null;
    let workflowConfidence;
    let isReused = false;
    if (similarTask) {
        // Reuse existing task
        requirementId = similarTask.requirementId;
        workflowSource = similarTask.source;
        matchedWorkflow = similarTask.state.workflow?.name ? readAllWorkflows(cwd).find(w => w.name === similarTask.state.workflow.name) || null : null;
        workflowConfidence = similarTask.state.workflow?.confidence;
        isReused = true;
    }
    else {
        // Match workflow FIRST to determine source
        const taskDescription = `${projectName} ${projectDescription}`.trim();
        const workflows = readAllWorkflows(cwd);
        const workflowMatch = matchWorkflow(taskDescription, workflows);
        workflowSource = 'auto_assembled';
        if (workflowMatch && workflowMatch.score >= 0.3) {
            matchedWorkflow = workflowMatch.workflow;
            workflowSource = 'matched';
            workflowConfidence = workflowMatch.score;
        }
        // NOW generate requirement_id with the correct source
        requirementId = generateNextRequirementId(workflowSource, cwd);
    }
    // Match knowledge feature BEFORE initializing state
    let matchedKnowledgeFeatureName;
    let matchedKnowledgeCategory;
    let knowledgeTopicInfo = '';
    if (!isReused || !similarTask.state.project.knowledge_feature_name) {
        const similarFeature = findSimilarKnowledgeFeature(projectName, projectDescription, cwd, 0.5);
        if (similarFeature) {
            matchedKnowledgeFeatureName = similarFeature.feature_name;
            matchedKnowledgeCategory = similarFeature.category;
            knowledgeTopicInfo = `\n\n📚 **Matched knowledge feature:** ${similarFeature.feature_name}${similarFeature.category ? ` (${similarFeature.category})` : ''} (${Math.round(similarFeature.score * 100)}% similarity)`;
        }
    }
    else {
        // Reused task already has knowledge feature
        matchedKnowledgeFeatureName = similarTask.state.project.knowledge_feature_name;
        matchedKnowledgeCategory = similarTask.state.project.knowledge_category;
    }
    bindSessionToRequirement(lockId, requirementId, workflowSource, matchedWorkflow?.name, cwd);
    const state = isReused
        ? similarTask.state
        : initializeProjectState(projectName, projectDescription, lockId, requirementId, cwd, matchedWorkflow, workflowSource, workflowConfidence, matchedKnowledgeFeatureName, matchedKnowledgeCategory);
    // Update project name/description if reused (task evolved)
    if (isReused) {
        state.project.name = projectName;
        state.project.description = projectDescription;
    }
    const firstStage = state.pipeline.current_stage;
    if (state.pipeline.stages[firstStage]) {
        state.pipeline.stages[firstStage].status = 'in_progress';
        if (!state.pipeline.stages[firstStage].started_at) {
            state.pipeline.stages[firstStage].started_at = new Date().toISOString();
        }
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
    const workflowInfo = matchedWorkflow
        ? `\n\n📋 **Workflow:** ${matchedWorkflow.name} (matched, ${Math.round(workflowConfidence * 100)}% confidence)`
        : '\n\n🔧 **Pipeline:** Auto-assembled';
    const reuseInfo = isReused
        ? `\n\n🔗 **Reused existing task:** ${similarTask.requirementId} (${Math.round(similarTask.score * 100)}% similarity)`
        : `\n\n🆕 **Created new task:** ${requirementId}`;
    const knowledgeTopicDisplay = state.project.knowledge_feature_name
        ? `\n**Knowledge Feature:** ${state.project.knowledge_feature_name}${state.project.knowledge_category ? ` (${state.project.knowledge_category})` : ''}`
        : '\n**Knowledge Feature:** (not set)';
    const nextSteps = state.project.knowledge_feature_name
        ? `1. **Update Progress:** Use \`opc_state_write\` as you advance through stages
2. **Manage Knowledge:** Use \`opc_knowledge_read\` and \`opc_knowledge_write\` to manage knowledge documents`
        : `1. **Set Knowledge Feature:** Use \`opc_knowledge_list\` to check existing features, then \`opc_state_write(knowledge_feature_name="...")\` to set
2. **Update Progress:** Use \`opc_state_write\` as you advance through stages
3. **Manage Knowledge:** Use \`opc_knowledge_read\` and \`opc_knowledge_write\` to manage knowledge documents`;
    return {
        content: [{
                type: 'text',
                text: `## OPC Task ${isReused ? 'Resumed' : 'Initialized'}

**Lock ID:** ${lockId}
**Project:** ${projectName}
**Requirement ID:** ${requirementId}${knowledgeTopicDisplay}${workflowInfo}${reuseInfo}${knowledgeTopicInfo}

### Pipeline Stages

${stageList}

### Next Steps

${nextSteps}${gitignoreMsg}
`,
            }],
    };
}
export function handleStateClear(cwd) {
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
To resume, use \`opc_state_init\` with a similar project name (auto-matching will find it).`,
                }],
        };
    }
    else {
        return {
            content: [{
                    type: 'text',
                    text: `No task to clear. Use \`opc_state_init\` to start a new task.`,
                }],
        };
    }
}
export function handleStateWrite(args, cwd) {
    const state = getCurrentTask(cwd);
    if (!state) {
        return {
            content: [{ type: 'text', text: 'No active task. Use opc_state_init to start a new project.' }],
            isError: true,
        };
    }
    // Update knowledge_feature_name
    if (args.knowledge_feature_name) {
        state.project.knowledge_feature_name = args.knowledge_feature_name;
    }
    if (args.stage && args.stage_status) {
        const stage = args.stage;
        const stageStatus = args.stage_status;
        if (!state.pipeline.stages[stage]) {
            state.pipeline.stages[stage] = { status: 'pending' };
        }
        state.pipeline.stages[stage].status = stageStatus;
        if (stageStatus === 'in_progress' && !state.pipeline.stages[stage].started_at) {
            state.pipeline.stages[stage].started_at = new Date().toISOString();
        }
        if (stageStatus === 'completed') {
            state.pipeline.stages[stage].completed_at = new Date().toISOString();
            state.pipeline.stages[stage].verification_passed = true;
            // Use preserved stage_order from pipeline, fallback to Object.keys for legacy states
            const stageOrder = state.pipeline.stage_order || Object.keys(state.pipeline.stages);
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
        if (!state.pipeline.stages[stage].agents_used.includes(args.agent)) {
            state.pipeline.stages[stage].agents_used.push(args.agent);
        }
    }
    if (args.artifact) {
        const stage = args.stage || state.pipeline.current_stage;
        if (!state.pipeline.stages[stage]) {
            state.pipeline.stages[stage] = { status: 'pending' };
        }
        if (!state.pipeline.stages[stage].artifacts) {
            state.pipeline.stages[stage].artifacts = [];
        }
        state.pipeline.stages[stage].artifacts.push(args.artifact);
    }
    if (args.progress) {
        const stage = args.stage || state.pipeline.current_stage;
        if (!state.pipeline.stages[stage]) {
            state.pipeline.stages[stage] = { status: 'pending' };
        }
        state.pipeline.stages[stage].progress = args.progress;
    }
    if (args.blocker) {
        const stage = args.stage || state.pipeline.current_stage;
        if (!state.pipeline.stages[stage]) {
            state.pipeline.stages[stage] = { status: 'pending' };
        }
        if (!state.pipeline.stages[stage].blockers) {
            state.pipeline.stages[stage].blockers = [];
        }
        state.pipeline.stages[stage].blockers.push(args.blocker);
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
