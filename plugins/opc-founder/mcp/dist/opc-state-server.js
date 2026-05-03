/**
 * OPC State MCP Server (Single-Task Model)
 *
 * Provides state management tools for OPC Founder agent.
 * Enables cross-session persistence, stage tracking, and agent handoffs.
 *
 * Single-Task Model:
 * - One window = one task
 * - Task must complete before starting next
 * - ESC interruption = task abandoned (start fresh)
 * - No task queue, no multi-session management
 *
 * Window detection uses PID + O_CREAT|O_EXCL atomic file creation
 * (adopted from OMC's approach - no external dependencies).
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync, openSync, closeSync, writeSync, statSync } from 'fs';
import { join, isAbsolute, dirname } from 'path';
import { constants as fsConstants } from 'fs';
// ============================================================
// Process Session ID (OMC-style: PID + timestamp)
// ============================================================
/**
 * Auto-generated session ID for the current process.
 * Uses PID + process start timestamp to be unique even if PIDs are reused.
 * Generated once at module load time and stable for the process lifetime.
 */
let processSessionId = null;
/**
 * Get or generate a unique session ID for the current process.
 *
 * Format: `pid-{PID}-{startTimestamp}`
 * Example: `pid-12345-1707350400000`
 *
 * This prevents concurrent Claude Code instances in the same repo from
 * sharing state files. The ID is stable for the process lifetime and
 * unique across concurrent processes.
 */
function getProcessSessionId() {
    if (!processSessionId) {
        const pid = process.pid;
        const startTime = Date.now();
        processSessionId = `pid-${pid}-${startTime}`;
    }
    return processSessionId;
}
// ============================================================
// Process Alive Detection (OMC-style: process.kill(pid, 0))
// ============================================================
/**
 * Check if a process is alive using signal 0.
 * Works cross-platform - no external dependencies.
 *
 * - Returns true if process exists (or exists but we lack permission)
 * - Returns false if process doesn't exist (ESRCH)
 */
function isProcessAlive(pid) {
    if (!Number.isInteger(pid) || pid <= 0)
        return false;
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (e) {
        // EPERM means process exists but we lack permission to signal it
        if (e && typeof e === 'object' && 'code' in e &&
            e.code === 'EPERM') {
            return true;
        }
        return false; // ESRCH = process doesn't exist
    }
}
// ============================================================
// File Lock with O_CREAT|O_EXCL (OMC-style atomic creation)
// ============================================================
const O_CREAT = fsConstants.O_CREAT;
const O_EXCL = fsConstants.O_EXCL;
const O_WRONLY = fsConstants.O_WRONLY;
const DEFAULT_STALE_LOCK_MS = 30_000; // 30 seconds
let currentLockId = null;
/**
 * Get the lock file path for a given lock ID.
 */
function getLockPath(lockId, cwd) {
    const lockDir = ensureOpcDir('state/locks', cwd);
    return join(lockDir, `${lockId}.lock`);
}
/**
 * Check if an existing lock file is stale.
 * A lock is stale if older than staleLockMs AND the owning PID is dead.
 */
function isLockStale(lockPath, staleLockMs = DEFAULT_STALE_LOCK_MS) {
    try {
        const stat = statSync(lockPath);
        const ageMs = Date.now() - stat.mtimeMs;
        if (ageMs < staleLockMs)
            return false;
        // Try to read PID from the lock payload
        try {
            const raw = readFileSync(lockPath, 'utf-8');
            const payload = JSON.parse(raw);
            if (payload.pid && isProcessAlive(payload.pid)) {
                return false; // Process is still alive
            }
        }
        catch {
            // Malformed or unreadable -- treat as stale if old enough
        }
        return true;
    }
    catch {
        // Lock file disappeared -- not stale, just gone
        return false;
    }
}
/**
 * Acquire window lock using atomic file creation.
 * No external dependencies (fs-ext not required).
 */
function acquireWindowLock(cwd) {
    // Already holding a lock - return the process session ID
    if (currentLockId) {
        return currentLockId;
    }
    const lockId = getProcessSessionId();
    const lockPath = getLockPath(lockId, cwd);
    const lockDir = dirname(lockPath);
    // Ensure directory exists
    if (!existsSync(lockDir)) {
        mkdirSync(lockDir, { recursive: true });
    }
    // Try atomic creation (O_CREAT | O_EXCL guarantees only one process succeeds)
    try {
        const fd = openSync(lockPath, O_CREAT | O_EXCL | O_WRONLY, 0o600);
        // Write lock payload with PID and timestamp
        const payload = JSON.stringify({
            lockId,
            pid: process.pid,
            timestamp: Date.now(),
        });
        writeSync(fd, payload, null, 'utf-8');
        closeSync(fd);
        currentLockId = lockId;
        return lockId;
    }
    catch (err) {
        // EEXIST means lock file already exists
        if (err && typeof err === 'object' && 'code' in err &&
            err.code === 'EEXIST') {
            // Check if the existing lock is stale
            if (isLockStale(lockPath)) {
                try {
                    unlinkSync(lockPath);
                    // Retry after removing stale lock
                    return acquireWindowLock(cwd);
                }
                catch {
                    // Another process won the race - use our process session ID anyway
                    // (state files will be isolated by lock_id)
                    currentLockId = lockId;
                    return lockId;
                }
            }
            // Lock is not stale - another window is active
            // Use our process session ID for isolation
            currentLockId = lockId;
            return lockId;
        }
        throw err;
    }
}
/**
 * Get current window's task state.
 * Returns null if no task exists for current window.
 */
function getCurrentLockId(cwd) {
    if (!currentLockId) {
        currentLockId = acquireWindowLock(cwd);
    }
    return currentLockId;
}
// ============================================================
// Path Utilities
// ============================================================
const OPC_PATHS = {
    ROOT: '.opc',
    STATE: '.opc/state',
    CHECKPOINTS: '.opc/state/checkpoints',
    LOCKS: '.opc/state/locks',
    MEMORY: '.opc/memory',
    ARTIFACTS: '.opc/artifacts',
    LOGS: '.opc/logs',
    WORKFLOWS: '.opc/workflows',
};
function getWorktreeRoot(cwd) {
    const effectiveCwd = cwd || process.cwd();
    try {
        const { execSync } = require('child_process');
        return execSync('git rev-parse --show-toplevel', {
            cwd: effectiveCwd,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
    }
    catch {
        return effectiveCwd;
    }
}
function getOpcRoot(cwd) {
    const root = getWorktreeRoot(cwd);
    return join(root, OPC_PATHS.ROOT);
}
function getWorkflowsPath(cwd) {
    const root = getWorktreeRoot(cwd);
    return join(root, OPC_PATHS.WORKFLOWS);
}
function ensureWorkflowsDir(cwd) {
    const root = getWorktreeRoot(cwd);
    const dir = join(root, OPC_PATHS.WORKFLOWS);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    return dir;
}
function ensureOpcDir(subdir, cwd) {
    const root = getWorktreeRoot(cwd);
    const dir = join(root, OPC_PATHS.ROOT, subdir);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    return dir;
}
function validatePath(inputPath) {
    if (inputPath.includes('..')) {
        throw new Error('Path traversal not allowed');
    }
    if (isAbsolute(inputPath)) {
        throw new Error('Absolute paths not allowed');
    }
}
function generateCheckpointId() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    return `cp-${timestamp}`;
}
// ============================================================
// State I/O
// ============================================================
function atomicWriteJson(filePath, data) {
    const tempPath = `${filePath}.tmp-${process.pid}`;
    writeFileSync(tempPath, JSON.stringify(data, null, 2), { mode: 0o600 });
    const { renameSync } = require('fs');
    renameSync(tempPath, filePath);
}
function updateGitignore(cwd) {
    const root = getWorktreeRoot(cwd);
    const gitignorePath = join(root, '.gitignore');
    const OPC_GITIGNORE_ENTRY = `
# OPC state - personal session data, don't commit
.opc/state/
`;
    // Check if .gitignore exists
    if (!existsSync(gitignorePath)) {
        writeFileSync(gitignorePath, OPC_GITIGNORE_ENTRY);
        return true;
    }
    // Check if entry already exists
    const content = readFileSync(gitignorePath, 'utf-8');
    if (content.includes('.opc/state/')) {
        return false; // Already has the entry
    }
    // Append the entry
    writeFileSync(gitignorePath, content + OPC_GITIGNORE_ENTRY);
    return true;
}
function readJsonFile(filePath) {
    if (!existsSync(filePath))
        return null;
    try {
        const content = readFileSync(filePath, 'utf-8');
        return JSON.parse(content);
    }
    catch {
        return null;
    }
}
/**
 * Get project state path for a lock ID.
 * Single-task model: one state file per window.
 */
function getProjectStatePath(lockId, cwd) {
    const stateDir = ensureOpcDir('state', cwd);
    return join(stateDir, lockId, 'project-state.json');
}
function readProjectState(lockId, cwd) {
    const path = getProjectStatePath(lockId, cwd);
    return readJsonFile(path);
}
function writeProjectState(state, cwd) {
    const path = getProjectStatePath(state.context.lock_id, cwd);
    const dir = join(path, '..');
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    state.project.updated_at = new Date().toISOString();
    state._meta.updated_by = 'opc_state_write';
    atomicWriteJson(path, state);
}
function initializeProjectState(name, description, lockId, cwd) {
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
            }, {}),
        },
        context: {
            lock_id: lockId,
            worktree: getWorktreeRoot(cwd),
        },
        _meta: {
            version: '3.0.0', // Single-task model
            updated_by: 'opc_state_init',
        },
    };
}
function getCheckpointPath(checkpointId, cwd) {
    const checkpointsDir = ensureOpcDir('state/checkpoints', cwd);
    return join(checkpointsDir, `${checkpointId}.json`);
}
function createCheckpoint(state, description, cwd) {
    const checkpointId = generateCheckpointId();
    const checkpoint = {
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
function readCheckpoint(checkpointId, cwd) {
    const path = getCheckpointPath(checkpointId, cwd);
    return readJsonFile(path);
}
function listCheckpoints(cwd) {
    const checkpointsDir = ensureOpcDir('state/checkpoints', cwd);
    if (!existsSync(checkpointsDir))
        return [];
    const files = readdirSync(checkpointsDir).filter(f => f.endsWith('.json'));
    return files
        .map(f => readJsonFile(join(checkpointsDir, f)))
        .filter((c) => c !== null)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
}
function getHandoffPath(lockId, cwd) {
    const stateDir = ensureOpcDir('state', cwd);
    return join(stateDir, lockId, 'handoffs.json');
}
function recordHandoff(fromAgent, toAgent, artifacts, constraints, context, lockId, cwd) {
    const handoff = {
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
    let handoffs = readJsonFile(path) || [];
    handoffs.push(handoff);
    atomicWriteJson(path, handoffs);
    return handoff;
}
function getHandoffs(lockId, cwd) {
    const path = getHandoffPath(lockId, cwd);
    return readJsonFile(path) || [];
}
function getMemoryPath(cwd) {
    return join(getOpcRoot(cwd), 'memory', 'project-memory.json');
}
function readProjectMemory(cwd) {
    const path = getMemoryPath(cwd);
    const memory = readJsonFile(path);
    return memory || { entries: [], updated_at: new Date().toISOString() };
}
function writeProjectMemory(memory, cwd) {
    const path = getMemoryPath(cwd);
    const dir = join(path, '..');
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    memory.updated_at = new Date().toISOString();
    atomicWriteJson(path, memory);
}
function addMemoryEntry(category, content, metadata, cwd) {
    const memory = readProjectMemory(cwd);
    const entry = {
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
function searchMemory(query, cwd) {
    const memory = readProjectMemory(cwd);
    const lowerQuery = query.toLowerCase();
    return memory.entries.filter(e => e.content.toLowerCase().includes(lowerQuery) ||
        e.category.toLowerCase().includes(lowerQuery));
}
// ============================================================
// Session Management (Single-Task Model)
// ============================================================
/**
 * List all task directories (lock IDs) in state.
 */
function listAllTasks(cwd) {
    const stateDir = ensureOpcDir('state', cwd);
    if (!existsSync(stateDir))
        return [];
    return readdirSync(stateDir).filter(f => f.startsWith('pid-'));
}
/**
 * Get current window's task state.
 */
function getCurrentTask(cwd) {
    const lockId = getCurrentLockId(cwd);
    return readProjectState(lockId, cwd);
}
/**
 * Clear current window's task (abandon).
 */
function clearCurrentTask(cwd) {
    const lockId = getCurrentLockId(cwd);
    const statePath = getProjectStatePath(lockId, cwd);
    const handoffPath = getHandoffPath(lockId, cwd);
    let cleared = false;
    if (existsSync(statePath)) {
        unlinkSync(statePath);
        cleared = true;
    }
    if (existsSync(handoffPath)) {
        unlinkSync(handoffPath);
    }
    // Remove the state directory if empty
    const stateDir = join(statePath, '..');
    try {
        const remaining = readdirSync(stateDir);
        if (remaining.length === 0) {
            unlinkSync(stateDir);
        }
    }
    catch {
        // Directory doesn't exist or not empty
    }
    return cleared;
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
            },
        },
    },
    // opc_state_init
    {
        name: 'opc_state_init',
        description: 'Initialize a new OPC project state. Creates pipeline tracking. One task per window.',
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
    // opc_state_clear
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
    // opc_checkpoint_create
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
    // opc_sessions_list
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
            },
        },
    },
    // opc_workflows_path
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
// Tool Handlers
// ============================================================
async function handleToolCall(name, args) {
    const cwd = args.workingDirectory;
    try {
        switch (name) {
            // ============================================================
            case 'opc_state_read': {
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
                    return `${icon} **${stage}**: ${data.status}${data.progress ? ` (${Object.entries(data.progress).map(([k, v]) => `${k}: ${v}%`).join(', ')})` : ''}`;
                })
                    .join('\n');
                return {
                    content: [{
                            type: 'text',
                            text: `## OPC Project State

**Project:** ${state.project.name}
**Lock ID:** ${state.context.lock_id}
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
                const projectName = args.project_name;
                const projectDescription = args.project_description || '';
                const lockId = getCurrentLockId(cwd);
                // Check if current window already has a task
                const existingTask = readProjectState(lockId, cwd);
                if (existingTask) {
                    const currentStatus = existingTask.pipeline.stages[existingTask.pipeline.current_stage]?.status;
                    if (currentStatus === 'in_progress') {
                        return {
                            content: [{
                                    type: 'text',
                                    text: `## Task Already Exists

**Current Task:** ${existingTask.project.name}
**Stage:** ${existingTask.pipeline.current_stage}
**Status:** 🔄 in_progress

One window can only have one task at a time.

Options:
1. Continue the current task with \`opc_state_read\`
2. Abandon current task with \`opc_state_clear\` and start fresh
`,
                                }],
                        };
                    }
                }
                // Initialize new task
                const state = initializeProjectState(projectName, projectDescription, lockId, cwd);
                state.pipeline.stages.product.status = 'in_progress';
                state.pipeline.stages.product.started_at = new Date().toISOString();
                writeProjectState(state, cwd);
                // Update .gitignore if needed
                const gitignoreUpdated = updateGitignore(cwd);
                const gitignoreMsg = gitignoreUpdated
                    ? '\n\n📝 **.gitignore updated**: Added `.opc/state/` to ignore personal session data.'
                    : '';
                return {
                    content: [{
                            type: 'text',
                            text: `## OPC Task Initialized

**Lock ID:** ${lockId}
**Project:** ${projectName}
**Current Stage:** product

The pipeline is ready. Stage "product" is now in progress.
Use opc_state_write to update progress as you advance through stages.${gitignoreMsg}
`,
                        }],
                };
            }
            // ============================================================
            case 'opc_state_clear': {
                const cleared = clearCurrentTask(cwd);
                if (cleared) {
                    return {
                        content: [{
                                type: 'text',
                                text: `## Task Cleared

The current task has been abandoned. You can start a new task with \`opc_state_init\`.`,
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
            // ============================================================
            case 'opc_state_write': {
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
                    if (!state.pipeline.stages[stage].agents_used.includes(args.agent)) {
                        state.pipeline.stages[stage].agents_used.push(args.agent);
                    }
                }
                // Add artifact
                if (args.artifact) {
                    const stage = state.pipeline.current_stage;
                    if (!state.pipeline.stages[stage].artifacts) {
                        state.pipeline.stages[stage].artifacts = [];
                    }
                    state.pipeline.stages[stage].artifacts.push(args.artifact);
                }
                // Update progress
                if (args.progress) {
                    const stage = state.pipeline.current_stage;
                    state.pipeline.stages[stage].progress = args.progress;
                }
                // Add blocker
                if (args.blocker) {
                    const stage = state.pipeline.current_stage;
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
            // ============================================================
            case 'opc_checkpoint_create': {
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
                const checkpoint = createCheckpoint(state, args.description, cwd);
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
                const checkpoint = readCheckpoint(args.checkpoint_id, cwd);
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
                const handoff = recordHandoff(args.from_agent, args.to_agent, args.artifacts, args.constraints || [], args.context || '', state.context.lock_id, cwd);
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
                const action = args.action;
                if (action === 'read') {
                    const memory = readProjectMemory(cwd);
                    const grouped = memory.entries.reduce((acc, entry) => {
                        if (!acc[entry.category])
                            acc[entry.category] = [];
                        acc[entry.category].push(entry);
                        return acc;
                    }, {});
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
                    const entry = addMemoryEntry(args.category, args.content, undefined, cwd);
                    return {
                        content: [{
                                type: 'text',
                                text: `Memory entry added: [${entry.category}] ${entry.content}`,
                            }],
                    };
                }
                if (action === 'search') {
                    const results = searchMemory(args.query, cwd);
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
            case 'opc_sessions_list': {
                const state = getCurrentTask(cwd);
                if (!state) {
                    return {
                        content: [{
                                type: 'text',
                                text: 'No active task. Use opc_state_init to start a new project.',
                            }],
                    };
                }
                const status = state.pipeline.stages[state.pipeline.current_stage]?.status;
                const icon = status === 'in_progress' ? '🔄' : status === 'completed' ? '✅' : '⏳';
                const stageStatus = Object.entries(state.pipeline.stages)
                    .map(([stage, data]) => {
                    const stageIcon = data.status === 'completed' ? '✅' :
                        data.status === 'in_progress' ? '🔄' :
                            data.status === 'blocked' ? '🚫' : '⏳';
                    return `${stageIcon} ${stage}: ${data.status}`;
                })
                    .join('\n');
                return {
                    content: [{
                            type: 'text',
                            text: `## Current Task

${icon} **${state.project.name}** - ${status}

### Pipeline Status

${stageStatus}
`,
                        }],
                };
            }
            // ============================================================
            case 'opc_task_group_create': {
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
                // Create task group
                const groupId = `tg-${Date.now().toString(36)}`;
                const now = new Date().toISOString();
                const taskGroup = {
                    group_id: groupId,
                    name: groupName,
                    tasks: tasks.map((t, i) => ({
                        task_id: `${groupId}-task-${i}`,
                        agent: t.agent,
                        description: t.description,
                        status: 'pending',
                        progress: 0,
                        dependencies: t.dependencies,
                    })),
                    parallel,
                    completion_condition: completionCondition,
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
                state.pipeline.stages[stage].task_groups.push(taskGroup);
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
                // Find and update task
                let found = false;
                for (const stageName of Object.keys(state.pipeline.stages)) {
                    const stage = state.pipeline.stages[stageName];
                    if (!stage.task_groups)
                        continue;
                    for (const group of stage.task_groups) {
                        const task = group.tasks.find(t => t.task_id === taskId);
                        if (task) {
                            task.status = status;
                            if (progress !== undefined)
                                task.progress = progress;
                            if (status === 'in_progress' && !task.started_at) {
                                task.started_at = new Date().toISOString();
                            }
                            if (status === 'completed' || status === 'failed') {
                                task.completed_at = new Date().toISOString();
                                task.progress = 100;
                            }
                            if (artifact) {
                                if (!task.artifacts)
                                    task.artifacts = [];
                                task.artifacts.push(artifact);
                            }
                            found = true;
                            // Check if group is complete
                            const completedCount = group.tasks.filter(t => t.status === 'completed').length;
                            const failedCount = group.tasks.filter(t => t.status === 'failed').length;
                            if (group.completion_condition === 'all' && completedCount === group.tasks.length) {
                                group.completed_at = new Date().toISOString();
                            }
                            else if (group.completion_condition === 'any' && completedCount > 0) {
                                group.completed_at = new Date().toISOString();
                            }
                            else if (group.completion_condition === 'threshold' && group.threshold && completedCount >= group.threshold) {
                                group.completed_at = new Date().toISOString();
                            }
                            break;
                        }
                    }
                    if (found)
                        break;
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
                const state = getCurrentTask(cwd);
                if (!state) {
                    return {
                        content: [{ type: 'text', text: 'No active task.' }],
                        isError: true,
                    };
                }
                const stage = args.stage;
                const groupId = args.group_id;
                const groups = [];
                for (const stageName of Object.keys(state.pipeline.stages)) {
                    if (stage && stageName !== stage)
                        continue;
                    const stageData = state.pipeline.stages[stageName];
                    if (!stageData.task_groups)
                        continue;
                    for (const group of stageData.task_groups) {
                        if (groupId && group.group_id !== groupId)
                            continue;
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
            case 'opc_workflows_path': {
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
            default:
                return {
                    content: [{
                            type: 'text',
                            text: `Unknown tool: ${name}`,
                        }],
                    isError: true,
                };
        }
    }
    catch (error) {
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
const server = new Server({ name: 'opc-state', version: '3.0.0' }, { capabilities: { tools: {} } });
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
