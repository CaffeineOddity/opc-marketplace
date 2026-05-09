/**
 * OPC MCP Tool Definitions
 *
 * Defines all MCP tools for the OPC State Server.
 */
import { RECOMMENDED_CATEGORIES, TASK_STAGES, STAGE_STATUSES } from './types.js';
// ============================================================
// State Tools
// ============================================================
const stateTools = [
    {
        name: 'opc_state_read',
        description: 'Read the current OPC project state. Shows pipeline progress, stage status, and agent activity.',
        inputSchema: {
            type: 'object',
            properties: {
                workingDirectory: { type: 'string', description: 'Working directory (defaults to cwd)' },
            },
        },
    },
    {
        name: 'opc_state_write',
        description: 'Update OPC project state. Used by founder-agent to track pipeline progress and set knowledge topic.',
        inputSchema: {
            type: 'object',
            properties: {
                project_name: { type: 'string', description: 'Project name (for new projects)' },
                project_description: { type: 'string', description: 'Project description' },
                knowledge_topic: { type: 'string', description: 'Knowledge topic to associate with this task (e.g., "ios-localization")' },
                stage: { type: 'string', enum: [...TASK_STAGES] },
                stage_status: { type: 'string', enum: [...STAGE_STATUSES] },
                agent: { type: 'string', description: 'Agent name to record' },
                artifact: { type: 'string', description: 'Artifact path to record' },
                progress: { type: 'object', description: 'Progress percentages by subtask' },
                blocker: { type: 'string', description: 'Blocker description' },
                workingDirectory: { type: 'string' },
            },
        },
    },
    {
        name: 'opc_state_init',
        description: 'Initialize a new OPC project state with automatic knowledge library association. Creates pipeline tracking and links to requirement ID. One task per window. Skills should first check opc_sessions_list, opc_knowledge_list to decide whether to reuse existing resources or create new ones. Automatically matches workflows from .opc/workflows/ directory.',
        inputSchema: {
            type: 'object',
            properties: {
                project_name: { type: 'string', description: 'Project name' },
                project_description: { type: 'string', description: 'Project description' },
                workingDirectory: { type: 'string' },
            },
            required: ['project_name'],
        },
    },
    {
        name: 'opc_state_clear',
        description: 'Clear current task. Use when abandoning or restarting. The task will be permanently removed.',
        inputSchema: {
            type: 'object',
            properties: {
                workingDirectory: { type: 'string' },
            },
        },
    },
];
// ============================================================
// Handoff Tools
// ============================================================
const handoffTools = [
    {
        name: 'opc_handoff',
        description: 'Hand off work from one agent to another. Preserves context and constraints.',
        inputSchema: {
            type: 'object',
            properties: {
                from_agent: { type: 'string', description: 'Agent handing off work' },
                to_agent: { type: 'string', description: 'Agent receiving work' },
                artifacts: { type: 'array', items: { type: 'string' }, description: 'Artifacts being handed off' },
                constraints: { type: 'array', items: { type: 'string' }, description: 'Constraints for receiving agent' },
                context: { type: 'string', description: 'Additional context' },
                workingDirectory: { type: 'string' },
            },
            required: ['from_agent', 'to_agent', 'artifacts'],
        },
    },
];
// ============================================================
// Session Tools
// ============================================================
const sessionTools = [
    {
        name: 'opc_sessions_list',
        description: 'List all OPC tasks. Shows task name, current stage, and status.',
        inputSchema: {
            type: 'object',
            properties: {
                workingDirectory: { type: 'string' },
            },
        },
    },
];
// ============================================================
// Task Group Tools
// ============================================================
const taskGroupTools = [
    {
        name: 'opc_task_group_create',
        description: 'Create a parallel task group for a stage. Enables tracking multiple concurrent agents.',
        inputSchema: {
            type: 'object',
            properties: {
                stage: { type: 'string', enum: [...TASK_STAGES] },
                group_name: { type: 'string', description: 'Name for this task group' },
                tasks: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            agent: { type: 'string', description: 'Agent assigned to this task' },
                            description: { type: 'string', description: 'Task description' },
                            dependencies: { type: 'array', items: { type: 'string' }, description: 'Task IDs this depends on' },
                        },
                        required: ['agent', 'description'],
                    },
                    description: 'Tasks in this group',
                },
                parallel: { type: 'boolean', description: 'Run tasks in parallel (default: true)' },
                completion_condition: { type: 'string', enum: ['all', 'any', 'threshold'], description: 'When group is complete' },
                threshold: { type: 'number', description: 'For threshold condition, min completed tasks' },
                workingDirectory: { type: 'string' },
            },
            required: ['stage', 'group_name', 'tasks'],
        },
    },
    {
        name: 'opc_task_update',
        description: 'Update a parallel task status. Used by agents to report progress.',
        inputSchema: {
            type: 'object',
            properties: {
                task_id: { type: 'string', description: 'Task ID to update' },
                status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'failed'], description: 'New status' },
                progress: { type: 'number', description: 'Progress percentage (0-100)' },
                artifact: { type: 'string', description: 'Artifact produced by this task' },
                workingDirectory: { type: 'string' },
            },
            required: ['task_id', 'status'],
        },
    },
    {
        name: 'opc_task_group_status',
        description: 'Get status of a task group. Shows progress of all parallel tasks.',
        inputSchema: {
            type: 'object',
            properties: {
                stage: { type: 'string', enum: [...TASK_STAGES], description: 'Stage name' },
                group_id: { type: 'string', description: 'Group ID (optional, shows all if omitted)' },
                workingDirectory: { type: 'string' },
            },
        },
    },
];
// ============================================================
// Workflow Tools
// ============================================================
const workflowTools = [
    {
        name: 'opc_workflows_path',
        description: 'Get the workflows directory path. Always uses git toplevel root for consistency.',
        inputSchema: {
            type: 'object',
            properties: {
                workingDirectory: { type: 'string' },
            },
        },
    },
];
// ============================================================
// Knowledge Tools
// ============================================================
// Build category description from RECOMMENDED_CATEGORIES
const CATEGORY_EXAMPLES = RECOMMENDED_CATEGORIES.slice(0, 8).join(', ');
const CATEGORY_DESCRIPTION = `Knowledge category. Examples: ${CATEGORY_EXAMPLES}. You can also use custom categories.`;
const knowledgeTools = [
    {
        name: 'opc_knowledge_init',
        description: 'Initialize knowledge library for a topic. Creates directory structure and index entry.',
        inputSchema: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'Topic title (can be Chinese or English)' },
                en_topic_name: { type: 'string', description: 'English topic name for directory naming (e.g., "localization", "app-login", "image-upload-r2")' },
                workingDirectory: { type: 'string' },
            },
            required: ['title', 'en_topic_name'],
        },
    },
    {
        name: 'opc_knowledge_read',
        description: 'Read knowledge from knowledge library. Can read specific doc or all docs in a category. Uses topic from current task if not specified.',
        inputSchema: {
            type: 'object',
            properties: {
                topic: { type: 'string', description: 'Knowledge topic (uses current task topic if not specified)' },
                category: { type: 'string', description: CATEGORY_DESCRIPTION },
                doc: { type: 'string', description: 'Document name (without .md extension)' },
                workingDirectory: { type: 'string' },
            },
            required: ['category'],
        },
    },
    {
        name: 'opc_knowledge_write',
        description: 'Write or update knowledge document. Uses topic from current task if not specified. Supports append, update section, or overwrite. IMPORTANT: Provide name and description for clear document identification.',
        inputSchema: {
            type: 'object',
            properties: {
                topic: { type: 'string', description: 'Knowledge topic (uses current task topic if not specified)' },
                category: { type: 'string', description: CATEGORY_DESCRIPTION },
                doc: { type: 'string', description: 'Document name (without .md extension)' },
                content: { type: 'string', description: 'Content to write' },
                name: { type: 'string', description: 'Document title (human-readable name, e.g., "技术架构文档", "API接口文档")' },
                description: { type: 'string', description: 'Brief description of the document content' },
                tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags for filtering' },
                section: { type: 'string', description: 'Section header to update (optional)' },
                mode: { type: 'string', enum: ['append', 'update', 'overwrite'], description: 'Write mode (default: append)' },
                workingDirectory: { type: 'string' },
            },
            required: ['category', 'doc', 'content', 'name', 'description', 'tags'],
        },
    },
    {
        name: 'opc_knowledge_exists',
        description: 'Check if knowledge document exists. Uses topic from current task if not specified.',
        inputSchema: {
            type: 'object',
            properties: {
                topic: { type: 'string', description: 'Knowledge topic (uses current task topic if not specified)' },
                category: { type: 'string', description: CATEGORY_DESCRIPTION },
                doc: { type: 'string', description: 'Document name' },
                workingDirectory: { type: 'string' },
            },
            required: [],
        },
    },
    {
        name: 'opc_knowledge_list',
        description: 'List topics in knowledge library.',
        inputSchema: {
            type: 'object',
            properties: {
                status: { type: 'string', enum: ['in_progress', 'completed', 'paused'], description: 'Filter by status' },
                category: { type: 'string', description: CATEGORY_DESCRIPTION },
                workingDirectory: { type: 'string' },
            },
        },
    },
    {
        name: 'opc_knowledge_docs',
        description: 'List available documents in a category. Uses topic from current task if not specified.',
        inputSchema: {
            type: 'object',
            properties: {
                topic: { type: 'string', description: 'Knowledge topic (uses current task topic if not specified)' },
                category: { type: 'string', description: CATEGORY_DESCRIPTION },
                workingDirectory: { type: 'string' },
            },
            required: ['category'],
        },
    },
    {
        name: 'opc_knowledge_list_brief',
        description: 'List all knowledge documents with brief metadata (name, description, topic, category). Enables progressive loading without reading full document content.',
        inputSchema: {
            type: 'object',
            properties: {
                topic: { type: 'string', description: 'Filter by topic' },
                category: { type: 'string', description: CATEGORY_DESCRIPTION },
                workingDirectory: { type: 'string' },
            },
        },
    },
    {
        name: 'opc_knowledge_rebuild_index',
        description: 'Rebuild the knowledge library index.json from the filesystem. Use when index is corrupted, missing, or out of sync with actual files. Scans all topic directories and reconstructs the index with current filesystem state.',
        inputSchema: {
            type: 'object',
            properties: {
                workingDirectory: { type: 'string' },
            },
        },
    },
];
// ============================================================
// All Tools
// ============================================================
export const tools = [
    ...stateTools,
    ...handoffTools,
    ...sessionTools,
    ...taskGroupTools,
    ...workflowTools,
    ...knowledgeTools,
];
