/**
 * Task Group Handlers
 *
 * Handles opc_task_* tool calls.
 */
import { getCurrentTask } from '../session.js';
import { createTaskGroup, updateTask, getTaskGroups } from '../state.js';
export function handleTaskGroupCreate(args, cwd) {
    const state = getCurrentTask(cwd);
    if (!state) {
        return {
            content: [{ type: 'text', text: 'No active task. Use opc_state_init first.' }],
            isError: true,
        };
    }
    const stage = args.stage;
    const groupName = args.group_name;
    const tasks = args.tasks;
    const parallel = args.parallel !== false;
    const completionCondition = args.completion_condition || 'all';
    const threshold = args.threshold;
    const result = createTaskGroup(state, stage, groupName, tasks, parallel, completionCondition, threshold, cwd);
    const taskList = result.state.pipeline.stages[stage].task_groups
        .find(g => g.group_id === result.groupId)
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
export function handleTaskUpdate(args, cwd) {
    const state = getCurrentTask(cwd);
    if (!state) {
        return {
            content: [{ type: 'text', text: 'No active task.' }],
            isError: true,
        };
    }
    const taskId = args.task_id;
    const status = args.status;
    const progress = args.progress;
    const artifact = args.artifact;
    updateTask(state, taskId, status, progress, artifact, cwd);
    return {
        content: [{
                type: 'text',
                text: `Task ${taskId} updated: ${status}${progress !== undefined ? ` (${progress}%)` : ''}`,
            }],
    };
}
export function handleTaskGroupStatus(args, cwd) {
    const state = getCurrentTask(cwd);
    if (!state) {
        return {
            content: [{ type: 'text', text: 'No active task.' }],
            isError: true,
        };
    }
    const stage = args.stage;
    const groupId = args.group_id;
    const groups = getTaskGroups(state, stage, groupId);
    if (groups.length === 0) {
        return { content: [{ type: 'text', text: 'No task groups found.' }] };
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
        content: [{ type: 'text', text: `## Task Group Status\n\n${output}` }],
    };
}
