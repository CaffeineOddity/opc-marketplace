/**
 * OPC MCP Tool Definitions
 *
 * Defines all MCP tools for the OPC State Server.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

// ============================================================
// State Tools
// ============================================================

const stateTools: Tool[] = [
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
    description: 'Update OPC project state. Used by founder-agent to track pipeline progress.',
    inputSchema: {
      type: 'object',
      properties: {
        project_name: { type: 'string', description: 'Project name (for new projects)' },
        project_description: { type: 'string', description: 'Project description' },
        stage: { type: 'string', enum: ['product', 'design', 'dev', 'qa', 'ship', 'growth'] },
        stage_status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'blocked'] },
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
    description: 'Initialize a new OPC project state with automatic knowledge library association. Creates pipeline tracking and links to requirement ID. One task per window.',
    inputSchema: {
      type: 'object',
      properties: {
        project_name: { type: 'string', description: 'Project name' },
        project_description: { type: 'string', description: 'Project description' },
        requirement_id: { type: 'string', description: 'Optional requirement ID (e.g., REQ-001). If not provided, will auto-generate or match existing.' },
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
// Checkpoint Tools
// ============================================================

const checkpointTools: Tool[] = [
  {
    name: 'opc_checkpoint_create',
    description: 'Create a checkpoint before risky operations. Enables rollback if things go wrong.',
    inputSchema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Description of what this checkpoint captures' },
        workingDirectory: { type: 'string' },
      },
      required: ['description'],
    },
  },
  {
    name: 'opc_checkpoint_list',
    description: 'List all available checkpoints.',
    inputSchema: {
      type: 'object',
      properties: {
        workingDirectory: { type: 'string' },
      },
    },
  },
  {
    name: 'opc_checkpoint_rollback',
    description: 'Rollback to a previous checkpoint. Restores state.',
    inputSchema: {
      type: 'object',
      properties: {
        checkpoint_id: { type: 'string', description: 'Checkpoint ID to rollback to' },
        workingDirectory: { type: 'string' },
      },
      required: ['checkpoint_id'],
    },
  },
];

// ============================================================
// Handoff Tools
// ============================================================

const handoffTools: Tool[] = [
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
// Memory Tools
// ============================================================

const memoryTools: Tool[] = [
  {
    name: 'opc_memory',
    description: 'Read, write, or search project memory. Stores decisions, patterns, and lessons.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['read', 'write', 'search'] },
        category: { type: 'string', enum: ['decision', 'pattern', 'lesson', 'constraint'] },
        content: { type: 'string', description: 'Content to write' },
        query: { type: 'string', description: 'Search query' },
        workingDirectory: { type: 'string' },
      },
      required: ['action'],
    },
  },
];

// ============================================================
// Session Tools
// ============================================================

const sessionTools: Tool[] = [
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

const taskGroupTools: Tool[] = [
  {
    name: 'opc_task_group_create',
    description: 'Create a parallel task group for a stage. Enables tracking multiple concurrent agents.',
    inputSchema: {
      type: 'object',
      properties: {
        stage: { type: 'string', description: 'Stage name (product/design/dev/qa/ship/growth)' },
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
        stage: { type: 'string', description: 'Stage name' },
        group_id: { type: 'string', description: 'Group ID (optional, shows all if omitted)' },
        workingDirectory: { type: 'string' },
      },
    },
  },
];

// ============================================================
// Workflow Tools
// ============================================================

const workflowTools: Tool[] = [
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

const KNOWLEDGE_CATEGORIES = ['requirement', 'design', 'backend', 'ios', 'android', 'harmony', 'web', 'miniprogram', 'qa', 'ship', 'growth'] as const;

const knowledgeTools: Tool[] = [
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
        category: { type: 'string', enum: KNOWLEDGE_CATEGORIES, description: 'Knowledge category (pipeline stage)' },
        doc: { type: 'string', description: 'Document name (without .md extension)' },
        workingDirectory: { type: 'string' },
      },
      required: ['category'],
    },
  },
  {
    name: 'opc_knowledge_write',
    description: 'Write or update knowledge document. Uses topic from current task if not specified. Supports append, update section, or overwrite.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Knowledge topic (uses current task topic if not specified)' },
        category: { type: 'string', enum: KNOWLEDGE_CATEGORIES, description: 'Knowledge category (pipeline stage)' },
        doc: { type: 'string', description: 'Document name (without .md extension)' },
        content: { type: 'string', description: 'Content to write' },
        section: { type: 'string', description: 'Section header to update (optional)' },
        mode: { type: 'string', enum: ['append', 'update', 'overwrite'], description: 'Write mode (default: append)' },
        workingDirectory: { type: 'string' },
      },
      required: ['category', 'doc', 'content'],
    },
  },
  {
    name: 'opc_knowledge_exists',
    description: 'Check if knowledge document exists. Uses topic from current task if not specified.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Knowledge topic (uses current task topic if not specified)' },
        category: { type: 'string', enum: KNOWLEDGE_CATEGORIES, description: 'Knowledge category (pipeline stage)' },
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
        category: { type: 'string', enum: KNOWLEDGE_CATEGORIES, description: 'Filter by category' },
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
        category: { type: 'string', enum: KNOWLEDGE_CATEGORIES, description: 'Knowledge category (pipeline stage)' },
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
        category: { type: 'string', enum: KNOWLEDGE_CATEGORIES, description: 'Filter by category' },
        workingDirectory: { type: 'string' },
      },
    },
  },
];

// ============================================================
// All Tools
// ============================================================

export const tools: Tool[] = [
  ...stateTools,
  ...checkpointTools,
  ...handoffTools,
  ...memoryTools,
  ...sessionTools,
  ...taskGroupTools,
  ...workflowTools,
  ...knowledgeTools,
];
