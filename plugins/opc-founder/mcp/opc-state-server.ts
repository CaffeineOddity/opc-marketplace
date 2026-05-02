/**
 * OPC State MCP Server
 *
 * Provides state management tools for OPC Founder agent.
 * Enables cross-session persistence, stage tracking, and agent handoffs.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from 'fs';
import { join, resolve, relative, isAbsolute } from 'path';
import { createHash } from 'crypto';

// ============================================================
// Path Utilities
// ============================================================

const OPC_PATHS = {
  ROOT: '.opc',
  STATE: '.opc/state',
  SESSIONS: '.opc/state/sessions',
  CHECKPOINTS: '.opc/state/checkpoints',
  MEMORY: '.opc/memory',
  ARTIFACTS: '.opc/artifacts',
  LOGS: '.opc/logs',
} as const;

function getWorktreeRoot(cwd?: string): string {
  const effectiveCwd = cwd || process.cwd();
  try {
    const { execSync } = require('child_process');
    return execSync('git rev-parse --show-toplevel', {
      cwd: effectiveCwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return effectiveCwd;
  }
}

function getOpcRoot(cwd?: string): string {
  const root = getWorktreeRoot(cwd);
  return join(root, OPC_PATHS.ROOT);
}

function ensureOpcDir(subdir: string, cwd?: string): string {
  const root = getWorktreeRoot(cwd);
  const dir = join(root, OPC_PATHS.ROOT, subdir);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function validatePath(inputPath: string): void {
  if (inputPath.includes('..')) {
    throw new Error('Path traversal not allowed');
  }
  if (isAbsolute(inputPath)) {
    throw new Error('Absolute paths not allowed');
  }
}

function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `sess-${timestamp}-${random}`;
}

function generateCheckpointId(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  return `cp-${timestamp}`;
}

// ============================================================
// State I/O
// ============================================================

function atomicWriteJson(filePath: string, data: unknown): void {
  const tempPath = `${filePath}.tmp-${process.pid}`;
  writeFileSync(tempPath, JSON.stringify(data, null, 2), { mode: 0o600 });
  const { renameSync } = require('fs');
  renameSync(tempPath, filePath);
}

function readJsonFile<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  try {
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

// ============================================================
// Project State
// ============================================================

interface ParallelTask {
  task_id: string;
  agent: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress: number;  // 0-100
  started_at?: string;
  completed_at?: string;
  artifacts?: string[];
  dependencies?: string[];  // task_ids this depends on
}

interface TaskGroup {
  group_id: string;
  name: string;
  tasks: ParallelTask[];
  parallel: boolean;  // true = run concurrently, false = sequential
  completion_condition: 'all' | 'any' | 'threshold';  // when group is considered complete
  threshold?: number;  // for 'threshold' condition, minimum completed tasks
  started_at?: string;
  completed_at?: string;
}

interface StageState {
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  agents_used?: string[];
  artifacts?: string[];
  started_at?: string;
  completed_at?: string;
  verification_passed?: boolean;
  progress?: Record<string, number>;
  blockers?: string[];
  // Enhanced: Parallel Task Groups
  task_groups?: TaskGroup[];
  active_parallel_tasks?: string[];  // currently running parallel task_ids
}

interface ProjectState {
  project: {
    name: string;
    description: string;
    created_at: string;
    updated_at: string;
  };
  pipeline: {
    current_stage: string;
    stages: Record<string, StageState>;
  };
  context: {
    session_id: string;
    parent_session_id?: string;
    worktree: string;
  };
  _meta: {
    version: string;
    updated_by: string;
  };
}

function getProjectStatePath(sessionId: string, cwd?: string): string {
  const sessionsDir = ensureOpcDir('state/sessions', cwd);
  return join(sessionsDir, sessionId, 'project-state.json');
}

function readProjectState(sessionId: string, cwd?: string): ProjectState | null {
  const path = getProjectStatePath(sessionId, cwd);
  return readJsonFile<ProjectState>(path);
}

function writeProjectState(state: ProjectState, cwd?: string): void {
  const path = getProjectStatePath(state.context.session_id, cwd);
  const dir = join(path, '..');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  state.project.updated_at = new Date().toISOString();
  state._meta.updated_by = 'opc_state_write';
  atomicWriteJson(path, state);
}

function initializeProjectState(
  name: string,
  description: string,
  sessionId: string,
  cwd?: string
): ProjectState {
  const now = new Date().toISOString();
  const stages = ['product', 'design', 'dev', 'qa', 'ship', 'growth'];

  return {
    project: {
      name,
      description,
      created_at: now,
      updated_at: now,
    },
    pipeline: {
      current_stage: 'product',
      stages: stages.reduce((acc, stage) => {
        acc[stage] = { status: 'pending' };
        return acc;
      }, {} as Record<string, StageState>),
    },
    context: {
      session_id: sessionId,
      worktree: getWorktreeRoot(cwd),
    },
    _meta: {
      version: '1.0.0',
      updated_by: 'opc_state_init',
    },
  };
}

// ============================================================
// Checkpoint
// ============================================================

interface Checkpoint {
  checkpoint_id: string;
  created_at: string;
  stage: string;
  description: string;
  snapshot: {
    files_changed: string[];
    tests_status: string;
    git_status: string;
  };
  state_snapshot: ProjectState;
  can_rollback: boolean;
}

function getCheckpointPath(checkpointId: string, cwd?: string): string {
  const checkpointsDir = ensureOpcDir('state/checkpoints', cwd);
  return join(checkpointsDir, `${checkpointId}.json`);
}

function createCheckpoint(
  state: ProjectState,
  description: string,
  cwd?: string
): Checkpoint {
  const checkpointId = generateCheckpointId();
  const checkpoint: Checkpoint = {
    checkpoint_id: checkpointId,
    created_at: new Date().toISOString(),
    stage: state.pipeline.current_stage,
    description,
    snapshot: {
      files_changed: [],
      tests_status: 'unknown',
      git_status: 'unknown',
    },
    state_snapshot: JSON.parse(JSON.stringify(state)),
    can_rollback: true,
  };

  const path = getCheckpointPath(checkpointId, cwd);
  atomicWriteJson(path, checkpoint);
  return checkpoint;
}

function readCheckpoint(checkpointId: string, cwd?: string): Checkpoint | null {
  const path = getCheckpointPath(checkpointId, cwd);
  return readJsonFile<Checkpoint>(path);
}

function listCheckpoints(cwd?: string): Checkpoint[] {
  const checkpointsDir = ensureOpcDir('state/checkpoints', cwd);
  if (!existsSync(checkpointsDir)) return [];

  const files = readdirSync(checkpointsDir).filter(f => f.endsWith('.json'));
  return files
    .map(f => readJsonFile<Checkpoint>(join(checkpointsDir, f)))
    .filter((c): c is Checkpoint => c !== null)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// ============================================================
// Agent Handoff
// ============================================================

interface HandoffRecord {
  handoff_id: string;
  created_at: string;
  from_agent: string;
  to_agent: string;
  artifacts: string[];
  constraints: string[];
  context: string;
  session_id: string;
}

function getHandoffPath(sessionId: string, cwd?: string): string {
  const sessionsDir = ensureOpcDir('state/sessions', cwd);
  return join(sessionsDir, sessionId, 'handoffs.json');
}

function recordHandoff(
  fromAgent: string,
  toAgent: string,
  artifacts: string[],
  constraints: string[],
  context: string,
  sessionId: string,
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
    session_id: sessionId,
  };

  const path = getHandoffPath(sessionId, cwd);
  let handoffs: HandoffRecord[] = readJsonFile(path) || [];
  handoffs.push(handoff);
  atomicWriteJson(path, handoffs);

  return handoff;
}

function getHandoffs(sessionId: string, cwd?: string): HandoffRecord[] {
  const path = getHandoffPath(sessionId, cwd);
  return readJsonFile(path) || [];
}

// ============================================================
// Project Memory
// ============================================================

interface MemoryEntry {
  id: string;
  created_at: string;
  category: 'decision' | 'pattern' | 'lesson' | 'constraint';
  content: string;
  metadata?: Record<string, unknown>;
}

interface ProjectMemory {
  entries: MemoryEntry[];
  updated_at: string;
}

function getMemoryPath(cwd?: string): string {
  return join(getOpcRoot(cwd), 'memory', 'project-memory.json');
}

function readProjectMemory(cwd?: string): ProjectMemory {
  const path = getMemoryPath(cwd);
  const memory = readJsonFile<ProjectMemory>(path);
  return memory || { entries: [], updated_at: new Date().toISOString() };
}

function writeProjectMemory(memory: ProjectMemory, cwd?: string): void {
  const path = getMemoryPath(cwd);
  const dir = join(path, '..');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  memory.updated_at = new Date().toISOString();
  atomicWriteJson(path, memory);
}

function addMemoryEntry(
  category: MemoryEntry['category'],
  content: string,
  metadata?: Record<string, unknown>,
  cwd?: string
): MemoryEntry {
  const memory = readProjectMemory(cwd);
  const entry: MemoryEntry = {
    id: `mem-${Date.now().toString(36)}`,
    created_at: new Date().toISOString(),
    category,
    content,
    metadata,
  };
  memory.entries.push(entry);
  writeProjectMemory(memory, cwd);
  return entry;
}

function searchMemory(query: string, cwd?: string): MemoryEntry[] {
  const memory = readProjectMemory(cwd);
  const lowerQuery = query.toLowerCase();
  return memory.entries.filter(e =>
    e.content.toLowerCase().includes(lowerQuery) ||
    e.category.toLowerCase().includes(lowerQuery)
  );
}

// ============================================================
// Session Management
// ============================================================

function listSessions(cwd?: string): string[] {
  const sessionsDir = ensureOpcDir('state/sessions', cwd);
  if (!existsSync(sessionsDir)) return [];
  return readdirSync(sessionsDir).filter(f => f.startsWith('sess-'));
}

function getActiveSession(cwd?: string): ProjectState | null {
  const sessions = listSessions(cwd);
  for (const sessionId of sessions) {
    const state = readProjectState(sessionId, cwd);
    if (state && state.pipeline.stages[state.pipeline.current_stage]?.status === 'in_progress') {
      return state;
    }
  }
  return null;
}

// ============================================================
// MCP Tool Definitions
// ============================================================

const tools = [
  // opc_state_read
  {
    name: 'opc_state_read',
    description: 'Read the current OPC project state. Shows pipeline progress, stage status, and agent activity.',
    inputSchema: {
      type: 'object',
      properties: {
        workingDirectory: { type: 'string', description: 'Working directory (defaults to cwd)' },
        session_id: { type: 'string', description: 'Session ID for session-scoped state' },
      },
    },
  },
  // opc_state_write
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
        session_id: { type: 'string' },
      },
    },
  },
  // opc_state_init
  {
    name: 'opc_state_init',
    description: 'Initialize a new OPC project state. Creates session and pipeline tracking.',
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
  // opc_checkpoint_create
  {
    name: 'opc_checkpoint_create',
    description: 'Create a checkpoint before risky operations. Enables rollback if things go wrong.',
    inputSchema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Description of what this checkpoint captures' },
        workingDirectory: { type: 'string' },
        session_id: { type: 'string' },
      },
      required: ['description'],
    },
  },
  // opc_checkpoint_list
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
  // opc_checkpoint_rollback
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
  // opc_handoff
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
        session_id: { type: 'string' },
      },
      required: ['from_agent', 'to_agent', 'artifacts'],
    },
  },
  // opc_memory
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
  // opc_session_list
  {
    name: 'opc_session_list',
    description: 'List all OPC sessions.',
    inputSchema: {
      type: 'object',
      properties: {
        workingDirectory: { type: 'string' },
      },
    },
  },
  // opc_session_resume
  {
    name: 'opc_session_resume',
    description: 'Find and resume the most recent active session.',
    inputSchema: {
      type: 'object',
      properties: {
        workingDirectory: { type: 'string' },
      },
    },
  },
  // opc_task_group_create
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
        session_id: { type: 'string' },
      },
      required: ['stage', 'group_name', 'tasks'],
    },
  },
  // opc_task_update
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
        session_id: { type: 'string' },
      },
      required: ['task_id', 'status'],
    },
  },
  // opc_task_group_status
  {
    name: 'opc_task_group_status',
    description: 'Get status of a task group. Shows progress of all parallel tasks.',
    inputSchema: {
      type: 'object',
      properties: {
        stage: { type: 'string', description: 'Stage name' },
        group_id: { type: 'string', description: 'Group ID (optional, shows all if omitted)' },
        workingDirectory: { type: 'string' },
        session_id: { type: 'string' },
      },
    },
  },
];

// ============================================================
// Tool Handlers
// ============================================================

async function handleToolCall(name: string, args: Record<string, unknown>): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  const cwd = args.workingDirectory as string | undefined;

  try {
    switch (name) {
      // ============================================================
      case 'opc_state_read': {
        const sessionId = args.session_id as string | undefined;
        let state: ProjectState | null = null;

        if (sessionId) {
          state = readProjectState(sessionId, cwd);
        } else {
          state = getActiveSession(cwd);
        }

        if (!state) {
          return {
            content: [{
              type: 'text',
              text: 'No active OPC session found. Use opc_state_init to start a new project.',
            }],
          };
        }

        const stageStatus = Object.entries(state.pipeline.stages)
          .map(([stage, data]) => {
            const icon = data.status === 'completed' ? '✅' :
                        data.status === 'in_progress' ? '🔄' :
                        data.status === 'blocked' ? '🚫' : '⏳';
            return `${icon} **${stage}**: ${data.status}${data.progress ? ` (${Object.entries(data.progress).map(([k, v]) => `${k}: ${v}%`).join(', ')})` : ''}`;
          })
          .join('\n');

        return {
          content: [{
            type: 'text',
            text: `## OPC Project State

**Project:** ${state.project.name}
**Session:** ${state.context.session_id}
**Current Stage:** ${state.pipeline.current_stage}
**Created:** ${state.project.created_at}
**Updated:** ${state.project.updated_at}

### Pipeline Progress

${stageStatus}

### Artifacts
${Object.entries(state.pipeline.stages)
  .filter(([, data]) => data.artifacts?.length)
  .map(([stage, data]) => `- **${stage}**: ${data.artifacts?.join(', ')}`)
  .join('\n') || 'No artifacts recorded yet.'}
`,
          }],
        };
      }

      // ============================================================
      case 'opc_state_init': {
        const projectName = args.project_name as string;
        const projectDescription = (args.project_description as string) || '';
        const sessionId = generateSessionId();

        const state = initializeProjectState(projectName, projectDescription, sessionId, cwd);
        state.pipeline.stages.product.status = 'in_progress';
        state.pipeline.stages.product.started_at = new Date().toISOString();
        writeProjectState(state, cwd);

        return {
          content: [{
            type: 'text',
            text: `## OPC Session Initialized

**Session ID:** ${sessionId}
**Project:** ${projectName}
**Current Stage:** product

The pipeline is ready. Stage "product" is now in progress.
Use opc_state_write to update progress as you advance through stages.
`,
          }],
        };
      }

      // ============================================================
      case 'opc_state_write': {
        let sessionId = args.session_id as string | undefined;
        let state: ProjectState | null;

        if (sessionId) {
          state = readProjectState(sessionId, cwd);
        } else {
          state = getActiveSession(cwd);
          sessionId = state?.context.session_id;
        }

        if (!state || !sessionId) {
          return {
            content: [{
              type: 'text',
              text: 'No active session. Use opc_state_init to start a new project.',
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
          }

          // Update current stage if starting a new one
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
          if (!state.pipeline.stages[stage].agents_used.includes(args.agent as string)) {
            state.pipeline.stages[stage].agents_used.push(args.agent as string);
          }
        }

        // Add artifact
        if (args.artifact) {
          const stage = state.pipeline.current_stage;
          if (!state.pipeline.stages[stage].artifacts) {
            state.pipeline.stages[stage].artifacts = [];
          }
          state.pipeline.stages[stage].artifacts.push(args.artifact as string);
        }

        // Update progress
        if (args.progress) {
          const stage = state.pipeline.current_stage;
          state.pipeline.stages[stage].progress = args.progress as Record<string, number>;
        }

        // Add blocker
        if (args.blocker) {
          const stage = state.pipeline.current_stage;
          if (!state.pipeline.stages[stage].blockers) {
            state.pipeline.stages[stage].blockers = [];
          }
          state.pipeline.stages[stage].blockers.push(args.blocker as string);
          state.pipeline.stages[stage].status = 'blocked';
        }

        writeProjectState(state, cwd);

        return {
          content: [{
            type: 'text',
            text: `State updated for session ${sessionId}.

**Current Stage:** ${state.pipeline.current_stage}
**Stage Status:** ${state.pipeline.stages[state.pipeline.current_stage].status}
`,
          }],
        };
      }

      // ============================================================
      case 'opc_checkpoint_create': {
        let sessionId = args.session_id as string | undefined;
        let state: ProjectState | null;

        if (sessionId) {
          state = readProjectState(sessionId, cwd);
        } else {
          state = getActiveSession(cwd);
        }

        if (!state) {
          return {
            content: [{
              type: 'text',
              text: 'No active session to checkpoint.',
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

      // ============================================================
      case 'opc_checkpoint_list': {
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

      // ============================================================
      case 'opc_checkpoint_rollback': {
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

        // Restore state
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
      case 'opc_handoff': {
        let sessionId = args.session_id as string | undefined;
        if (!sessionId) {
          const state = getActiveSession(cwd);
          sessionId = state?.context.session_id;
        }

        if (!sessionId) {
          return {
            content: [{
              type: 'text',
              text: 'No active session for handoff.',
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
          sessionId,
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
      case 'opc_memory': {
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
      case 'opc_session_list': {
        const sessions = listSessions(cwd);
        const details = sessions.map(sid => {
          const state = readProjectState(sid, cwd);
          if (!state) return `- ${sid} (no state)`;
          return `- **${sid}**: ${state.project.name} - Stage: ${state.pipeline.current_stage}`;
        }).join('\n');

        return {
          content: [{
            type: 'text',
            text: `## OPC Sessions (${sessions.length})

${details || 'No sessions found.'}
`,
          }],
        };
      }

      // ============================================================
      case 'opc_session_resume': {
        const state = getActiveSession(cwd);

        if (!state) {
          return {
            content: [{
              type: 'text',
              text: 'No active session to resume. Use opc_state_init to start a new project.',
            }],
          };
        }

        const stageStatus = Object.entries(state.pipeline.stages)
          .map(([stage, data]) => {
            const icon = data.status === 'completed' ? '✅' :
                        data.status === 'in_progress' ? '🔄' :
                        data.status === 'blocked' ? '🚫' : '⏳';
            return `${icon} ${stage}: ${data.status}`;
          })
          .join('\n');

        return {
          content: [{
            type: 'text',
            text: `## Session Resumed

**Session ID:** ${state.context.session_id}
**Project:** ${state.project.name}
**Current Stage:** ${state.pipeline.current_stage}

### Pipeline Status

${stageStatus}

Continue from where you left off.
`,
          }],
        };
      }

      // ============================================================
      case 'opc_task_group_create': {
        let sessionId = args.session_id as string | undefined;
        let state: ProjectState | null;

        if (sessionId) {
          state = readProjectState(sessionId, cwd);
        } else {
          state = getActiveSession(cwd);
          sessionId = state?.context.session_id;
        }

        if (!state || !sessionId) {
          return {
            content: [{ type: 'text', text: 'No active session. Use opc_state_init first.' }],
            isError: true,
          };
        }

        const stage = args.stage as string;
        const groupName = args.group_name as string;
        const tasks = args.tasks as Array<{ agent: string; description: string; dependencies?: string[] }>;
        const parallel = args.parallel !== false;
        const completionCondition = (args.completion_condition as string) || 'all';
        const threshold = args.threshold as number | undefined;

        // Create task group
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
          completion_condition: completionCondition as TaskGroup['completion_condition'],
          threshold,
          started_at: now,
        };

        // Add to stage
        if (!state.pipeline.stages[stage]) {
          state.pipeline.stages[stage] = { status: 'pending' };
        }
        if (!state.pipeline.stages[stage].task_groups) {
          state.pipeline.stages[stage].task_groups = [];
        }
        state.pipeline.stages[stage].task_groups!.push(taskGroup);

        writeProjectState(state, cwd);

        const taskList = taskGroup.tasks
          .map(t => `- **${t.task_id}**: ${t.agent} - ${t.description}`)
          .join('\n');

        return {
          content: [{
            type: 'text',
            text: `## Task Group Created

**Group ID:** ${groupId}
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

      // ============================================================
      case 'opc_task_update': {
        let sessionId = args.session_id as string | undefined;
        let state: ProjectState | null;

        if (sessionId) {
          state = readProjectState(sessionId, cwd);
        } else {
          state = getActiveSession(cwd);
          sessionId = state?.context.session_id;
        }

        if (!state || !sessionId) {
          return {
            content: [{ type: 'text', text: 'No active session.' }],
            isError: true,
          };
        }

        const taskId = args.task_id as string;
        const status = args.status as ParallelTask['status'];
        const progress = args.progress as number | undefined;
        const artifact = args.artifact as string | undefined;

        // Find and update task
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
              const failedCount = group.tasks.filter(t => t.status === 'failed').length;

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

        if (!found) {
          return {
            content: [{ type: 'text', text: `Task not found: ${taskId}` }],
            isError: true,
          };
        }

        writeProjectState(state, cwd);

        return {
          content: [{
            type: 'text',
            text: `Task ${taskId} updated: ${status}${progress !== undefined ? ` (${progress}%)` : ''}`,
          }],
        };
      }

      // ============================================================
      case 'opc_task_group_status': {
        let sessionId = args.session_id as string | undefined;
        let state: ProjectState | null;

        if (sessionId) {
          state = readProjectState(sessionId, cwd);
        } else {
          state = getActiveSession(cwd);
          sessionId = state?.context.session_id;
        }

        if (!state || !sessionId) {
          return {
            content: [{ type: 'text', text: 'No active session.' }],
            isError: true,
          };
        }

        const stage = args.stage as string | undefined;
        const groupId = args.group_id as string | undefined;

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

// ============================================================
// Server Setup
// ============================================================

const server = new Server(
  { name: 'opc-state', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return handleToolCall(name, args || {});
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
