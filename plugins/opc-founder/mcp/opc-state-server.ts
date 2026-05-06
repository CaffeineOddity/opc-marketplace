/**
 * OPC State MCP Server (Multi-Task with History)
 *
 * Provides state management tools for OPC Founder agent.
 * Enables cross-session persistence, stage tracking, and agent handoffs.
 *
 * Multi-Task Model:
 * - Each requirement has its own state file (preserves history)
 * - One window = one active task (via session binding)
 * - Session index maps lock_id → requirement_id
 * - All task history is preserved in .opc/state/{requirement_id}/
 *
 * Window detection uses PID + O_CREAT|O_EXCL atomic file creation
 * (adopted from OMC's approach - no external dependencies).
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync, openSync, closeSync, writeSync, statSync } from 'fs';
import { join, resolve, relative, isAbsolute, dirname } from 'path';
import { createHash } from 'crypto';
import { constants as fsConstants } from 'fs';

// ============================================================
// Process Session ID (OMC-style: PID + timestamp)
// ============================================================

/**
 * Auto-generated session ID for the current process.
 * Uses PID + process start timestamp to be unique even if PIDs are reused.
 * Generated once at module load time and stable for the process lifetime.
 */
let processSessionId: string | null = null;

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
function getProcessSessionId(): string {
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
function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;

  try {
    process.kill(pid, 0);
    return true;
  } catch (e: unknown) {
    // EPERM means process exists but we lack permission to signal it
    if (e && typeof e === 'object' && 'code' in e &&
        (e as NodeJS.ErrnoException).code === 'EPERM') {
      return true;
    }
    return false;  // ESRCH = process doesn't exist
  }
}

// ============================================================
// File Lock with O_CREAT|O_EXCL (OMC-style atomic creation)
// ============================================================

const O_CREAT = fsConstants.O_CREAT;
const O_EXCL = fsConstants.O_EXCL;
const O_WRONLY = fsConstants.O_WRONLY;

const DEFAULT_STALE_LOCK_MS = 30_000;  // 30 seconds

let currentLockId: string | null = null;

/**
 * Get the lock file path for a given lock ID.
 */
function getLockPath(lockId: string, cwd?: string): string {
  const lockDir = ensureOpcDir('state/locks', cwd);
  return join(lockDir, `${lockId}.lock`);
}

/**
 * Check if an existing lock file is stale.
 * A lock is stale if older than staleLockMs AND the owning PID is dead.
 */
function isLockStale(lockPath: string, staleLockMs: number = DEFAULT_STALE_LOCK_MS): boolean {
  try {
    const stat = statSync(lockPath);
    const ageMs = Date.now() - stat.mtimeMs;
    if (ageMs < staleLockMs) return false;

    // Try to read PID from the lock payload
    try {
      const raw = readFileSync(lockPath, 'utf-8');
      const payload = JSON.parse(raw) as { pid?: number; timestamp?: number };
      if (payload.pid && isProcessAlive(payload.pid)) {
        return false;  // Process is still alive
      }
    } catch {
      // Malformed or unreadable -- treat as stale if old enough
    }
    return true;
  } catch {
    // Lock file disappeared -- not stale, just gone
    return false;
  }
}

/**
 * Acquire window lock using atomic file creation.
 * No external dependencies (fs-ext not required).
 */
function acquireWindowLock(cwd?: string): string {
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
  } catch (err: unknown) {
    // EEXIST means lock file already exists
    if (err && typeof err === 'object' && 'code' in err &&
        (err as NodeJS.ErrnoException).code === 'EEXIST') {
      // Check if the existing lock is stale
      if (isLockStale(lockPath)) {
        try {
          unlinkSync(lockPath);
          // Retry after removing stale lock
          return acquireWindowLock(cwd);
        } catch {
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
function getCurrentLockId(cwd?: string): string {
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
  KNOWLEDGE: '.opc/knowledge',
} as const;

// Knowledge library structure definition
// Path format: .opc/knowledge/{requirement_id}/{category}/xxxx.md
// Categories align with OPC pipeline stages: product → design → dev → qa → ship → growth
const KNOWLEDGE_CATEGORIES = [
  // Product stage
  'requirement',    // Requirement specs, user stories, acceptance criteria
  // Design stage
  'design',         // UI/UX design, interaction, visual assets
  // Dev stage (platforms)
  'backend',        // Backend API, services, architecture
  'ios',            // iOS native development
  'android',        // Android native development
  'harmony',        // HarmonyOS development
  'web',            // Web frontend development
  'miniprogram',    // Mini program development (WeChat, etc.)
  // QA stage
  'qa',             // Test plans, test cases, quality assurance
  // Ship stage
  'ship',           // Deployment, CI/CD, infrastructure, operations
  // Growth stage
  'growth',         // Growth metrics, analytics, marketing
] as const;
type KnowledgeCategory = typeof KNOWLEDGE_CATEGORIES[number];

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

function getWorkflowsPath(cwd?: string): string {
  const root = getWorktreeRoot(cwd);
  return join(root, OPC_PATHS.WORKFLOWS);
}

function ensureWorkflowsDir(cwd?: string): string {
  const root = getWorktreeRoot(cwd);
  const dir = join(root, OPC_PATHS.WORKFLOWS);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
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

function updateGitignore(cwd?: string): boolean {
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
    return false;  // Already has the entry
  }

  // Append the entry
  writeFileSync(gitignorePath, content + OPC_GITIGNORE_ENTRY);
  return true;
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
// Project State (Single-Task Model)
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
    requirement_id?: string;  // Associated knowledge library requirement ID
    created_at: string;
    updated_at: string;
  };
  pipeline: {
    current_stage: string;
    stages: Record<string, StageState>;
  };
  context: {
    lock_id: string;           // Window lock ID (unique per process)
    worktree: string;
  };
  _meta: {
    version: string;
    updated_by: string;
  };
}

/**
 * Get project state path for a requirement ID.
 * Each requirement has its own state file for history tracking.
 */
function getProjectStatePath(requirementId: string, cwd?: string): string {
  const stateDir = ensureOpcDir('state', cwd);
  return join(stateDir, requirementId, 'project-state.json');
}

function readProjectState(requirementId: string, cwd?: string): ProjectState | null {
  const path = getProjectStatePath(requirementId, cwd);
  return readJsonFile<ProjectState>(path);
}

function writeProjectState(state: ProjectState, cwd?: string): void {
  const requirementId = state.project.requirement_id;
  if (!requirementId) {
    throw new Error('Cannot write project state without requirement_id');
  }
  const path = getProjectStatePath(requirementId, cwd);
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
  lockId: string,
  requirementId?: string,
  cwd?: string
): ProjectState {
  const now = new Date().toISOString();
  const stages = ['product', 'design', 'dev', 'qa', 'ship', 'growth'];

  return {
    project: {
      name,
      description,
      requirement_id: requirementId,
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
      lock_id: lockId,
      worktree: getWorktreeRoot(cwd),
    },
    _meta: {
      version: '3.0.0',  // Single-task model
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
  lock_id: string;
}

function getHandoffPath(lockId: string, cwd?: string): string {
  const stateDir = ensureOpcDir('state', cwd);
  return join(stateDir, lockId, 'handoffs.json');
}

function recordHandoff(
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

function getHandoffs(lockId: string, cwd?: string): HandoffRecord[] {
  const path = getHandoffPath(lockId, cwd);
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
// Knowledge Library
// ============================================================

interface KnowledgeIndex {
  requirements: Record<string, {
    title: string;
    status: 'in_progress' | 'completed' | 'paused';
    created_at: string;
    updated_at: string;
    domains: Record<string, string[]>;
  }>;
}

function getKnowledgePath(cwd?: string): string {
  return join(getOpcRoot(cwd), 'knowledge');
}

function getKnowledgeIndexPath(cwd?: string): string {
  return join(getKnowledgePath(cwd), 'index.json');
}

function getRequirementPath(requirementId: string, cwd?: string): string {
  return join(getKnowledgePath(cwd), requirementId);
}

function getKnowledgeDocPath(
  requirementId: string,
  category: KnowledgeCategory,
  doc: string,
  cwd?: string
): string {
  const reqPath = getRequirementPath(requirementId, cwd);
  return join(reqPath, category, `${doc}.md`);
}

function readKnowledgeIndex(cwd?: string): KnowledgeIndex {
  const path = getKnowledgeIndexPath(cwd);
  const index = readJsonFile<KnowledgeIndex>(path);
  return index || { requirements: {} };
}

function writeKnowledgeIndex(index: KnowledgeIndex, cwd?: string): void {
  const path = getKnowledgeIndexPath(cwd);
  const dir = join(path, '..');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  atomicWriteJson(path, index);
}

function initKnowledgeLibrary(
  requirementId: string,
  title: string,
  cwd?: string
): { isNew: boolean; title: string } {
  const index = readKnowledgeIndex(cwd);

  // If requirement already exists, update status and return (idempotent)
  if (index.requirements[requirementId]) {
    index.requirements[requirementId].status = 'in_progress';
    index.requirements[requirementId].updated_at = new Date().toISOString();
    writeKnowledgeIndex(index, cwd);
    return { isNew: false, title: index.requirements[requirementId].title };
  }

  // Create new requirement
  const now = new Date().toISOString();
  index.requirements[requirementId] = {
    title,
    status: 'in_progress',
    created_at: now,
    updated_at: now,
    domains: {},
  };

  writeKnowledgeIndex(index, cwd);

  // Create requirement directory
  const reqPath = getRequirementPath(requirementId, cwd);
  if (!existsSync(reqPath)) {
    mkdirSync(reqPath, { recursive: true });
  }

  return { isNew: true, title };
}

function readKnowledgeDoc(
  requirementId: string,
  category: KnowledgeCategory,
  doc: string,
  cwd?: string
): string | null {
  const path = getKnowledgeDocPath(requirementId, category, doc, cwd);
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf-8');
}

function readAllKnowledgeDocs(
  requirementId: string,
  category: KnowledgeCategory,
  cwd?: string
): string | null {
  const reqPath = getRequirementPath(requirementId, cwd);
  const categoryPath = join(reqPath, category);

  if (!existsSync(categoryPath)) return null;

  const results: string[] = [];
  for (const docFile of readdirSync(categoryPath)) {
    if (!docFile.endsWith('.md')) continue;
    const content = readFileSync(join(categoryPath, docFile), 'utf-8');
    results.push(`## ${docFile}\n\n${content}`);
  }

  return results.length > 0 ? results.join('\n\n---\n\n') : null;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function writeKnowledgeDoc(
  requirementId: string,
  category: KnowledgeCategory,
  doc: string,
  content: string,
  mode: 'append' | 'update' | 'overwrite' = 'append',
  section?: string,
  cwd?: string
): void {
  const path = getKnowledgeDocPath(requirementId, category, doc, cwd);
  const dir = join(path, '..');

  // Ensure directory exists
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  let finalContent = content;

  if (mode === 'append' && existsSync(path)) {
    const existing = readFileSync(path, 'utf-8');
    const timestamp = new Date().toISOString().split('T')[0];
    finalContent = `${existing}\n\n## ${timestamp}\n\n${content}`;
  } else if (mode === 'update' && section && existsSync(path)) {
    const existing = readFileSync(path, 'utf-8');
    // Update specific section (find ## section header and replace content)
    const sectionRegex = new RegExp(`(## ${section}[\\s]*\\n)([^#]*)(?=##|$)`, 'g');
    if (sectionRegex.test(existing)) {
      finalContent = existing.replace(sectionRegex, `$1${content}\n\n`);
    } else {
      // Section not found, append it
      finalContent = `${existing}\n\n## ${section}\n\n${content}`;
    }
  }

  writeFileSync(path, finalContent, 'utf-8');

  // Update index
  const index = readKnowledgeIndex(cwd);
  const req = index.requirements[requirementId];
  if (req) {
    req.updated_at = new Date().toISOString();

    // Track which categories/docs have been created
    if (!req.domains[category]) {
      req.domains[category] = [];
    }

    if (!req.domains[category].includes(doc)) {
      req.domains[category].push(doc);
    }

    writeKnowledgeIndex(index, cwd);
  }
}

function knowledgeExists(
  requirementId: string,
  category?: KnowledgeCategory,
  doc?: string,
  cwd?: string
): boolean {
  if (!category) {
    // Check if requirement exists
    const index = readKnowledgeIndex(cwd);
    return !!index.requirements[requirementId];
  }

  if (!doc) {
    // Check if category directory exists
    const reqPath = getRequirementPath(requirementId, cwd);
    const categoryPath = join(reqPath, category);
    return existsSync(categoryPath);
  }

  const path = getKnowledgeDocPath(requirementId, category, doc, cwd);
  return existsSync(path);
}

function listKnowledgeDocs(
  requirementId: string,
  category: KnowledgeCategory,
  cwd?: string
): string[] {
  const reqPath = getRequirementPath(requirementId, cwd);
  const categoryPath = join(reqPath, category);

  if (!existsSync(categoryPath)) return [];

  const docs: string[] = [];
  for (const docFile of readdirSync(categoryPath)) {
    if (docFile.endsWith('.md')) {
      docs.push(docFile.replace('.md', ''));
    }
  }

  return docs;
}

// ============================================================
// Requirement ID Helpers
// ============================================================

/**
 * Generate the next available requirement ID.
 * Format: REQ-XXX (zero-padded to 3 digits)
 */
function generateNextRequirementId(cwd?: string): string {
  const index = readKnowledgeIndex(cwd);
  const existingIds = Object.keys(index.requirements)
    .filter(id => id.startsWith('REQ-'))
    .map(id => {
      const num = parseInt(id.replace('REQ-', ''), 10);
      return isNaN(num) ? 0 : num;
    });

  const nextNum = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;
  return `REQ-${String(nextNum).padStart(3, '0')}`;
}

/**
 * Find candidate requirements that match the given query.
 * Returns candidates sorted by similarity score (highest first).
 */
function findCandidateRequirements(
  index: KnowledgeIndex,
  query: string,
  threshold: number = 0.3
): Array<{ id: string; title: string; status: string; score: number }> {
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  const candidates: Array<{ id: string; title: string; status: string; score: number }> = [];

  for (const [id, req] of Object.entries(index.requirements)) {
    const titleWords = req.title.toLowerCase().split(/\s+/).filter(w => w.length > 1);

    // Calculate word overlap score
    let matchCount = 0;
    for (const queryWord of queryWords) {
      for (const titleWord of titleWords) {
        if (queryWord === titleWord || queryWord.includes(titleWord) || titleWord.includes(queryWord)) {
          matchCount++;
          break;
        }
      }
    }

    const score = queryWords.length > 0 ? matchCount / queryWords.length : 0;

    if (score >= threshold) {
      candidates.push({
        id,
        title: req.title,
        status: req.status,
        score,
      });
    }
  }

  // Sort by score descending
  return candidates.sort((a, b) => b.score - a.score);
}

// ============================================================
// Session Management (Multi-Task with History)
// ============================================================

/**
 * Session index: maps lock_id to requirement_id
 * This allows each window to track its current task while
 * preserving history of all tasks.
 */
interface SessionIndex {
  sessions: Record<string, {
    requirement_id: string;
    created_at: string;
    updated_at: string;
  }>;
}

function getSessionIndexPath(cwd?: string): string {
  const stateDir = ensureOpcDir('state', cwd);
  return join(stateDir, 'sessions.json');
}

function readSessionIndex(cwd?: string): SessionIndex {
  const path = getSessionIndexPath(cwd);
  const index = readJsonFile<SessionIndex>(path);
  return index || { sessions: {} };
}

function writeSessionIndex(index: SessionIndex, cwd?: string): void {
  const path = getSessionIndexPath(cwd);
  atomicWriteJson(path, index);
}

/**
 * Bind current window to a requirement.
 */
function bindSessionToRequirement(lockId: string, requirementId: string, cwd?: string): void {
  const index = readSessionIndex(cwd);
  const now = new Date().toISOString();

  if (index.sessions[lockId]) {
    index.sessions[lockId].requirement_id = requirementId;
    index.sessions[lockId].updated_at = now;
  } else {
    index.sessions[lockId] = {
      requirement_id: requirementId,
      created_at: now,
      updated_at: now,
    };
  }

  writeSessionIndex(index, cwd);
}

/**
 * Get requirement_id for current window.
 */
function getCurrentRequirementId(lockId: string, cwd?: string): string | null {
  const index = readSessionIndex(cwd);
  return index.sessions[lockId]?.requirement_id || null;
}

/**
 * List all task directories (requirement IDs) in state.
 */
function listAllTasks(cwd?: string): string[] {
  const stateDir = ensureOpcDir('state', cwd);
  if (!existsSync(stateDir)) return [];
  return readdirSync(stateDir).filter(f => f.startsWith('REQ-'));
}

/**
 * Get current window's task state.
 */
function getCurrentTask(cwd?: string): ProjectState | null {
  const lockId = getCurrentLockId(cwd);
  const requirementId = getCurrentRequirementId(lockId, cwd);

  if (!requirementId) {
    return null;
  }

  return readProjectState(requirementId, cwd);
}

/**
 * Clear current window's task binding (abandon).
 * Note: This only unbinds the window from the requirement.
 * The requirement's state file is preserved for history.
 */
function clearCurrentTask(cwd?: string): boolean {
  const lockId = getCurrentLockId(cwd);
  const index = readSessionIndex(cwd);

  if (index.sessions[lockId]) {
    const requirementId = index.sessions[lockId].requirement_id;
    delete index.sessions[lockId];
    writeSessionIndex(index, cwd);

    // Also clear handoffs for this session
    const handoffPath = getHandoffPath(lockId, cwd);
    if (existsSync(handoffPath)) {
      unlinkSync(handoffPath);
    }

    return true;
  }

  return false;
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
  // opc_knowledge_init
  {
    name: 'opc_knowledge_init',
    description: 'Initialize knowledge library for a requirement. Creates directory structure and index entry.',
    inputSchema: {
      type: 'object',
      properties: {
        requirementId: { type: 'string', description: 'Requirement ID (e.g., REQ-001)' },
        title: { type: 'string', description: 'Requirement title' },
        workingDirectory: { type: 'string' },
      },
      required: ['requirementId', 'title'],
    },
  },
  // opc_knowledge_read
  {
    name: 'opc_knowledge_read',
    description: 'Read knowledge from knowledge library. Can read specific doc or all docs in a category.',
    inputSchema: {
      type: 'object',
      properties: {
        requirementId: { type: 'string', description: 'Requirement ID' },
        category: { type: 'string', enum: ['requirement', 'design', 'backend', 'ios', 'android', 'harmony', 'web', 'miniprogram', 'qa', 'ship', 'growth'], description: 'Knowledge category (pipeline stage)' },
        doc: { type: 'string', description: 'Document name (without .md extension)' },
        workingDirectory: { type: 'string' },
      },
      required: ['requirementId', 'category'],
    },
  },
  // opc_knowledge_write
  {
    name: 'opc_knowledge_write',
    description: 'Write or update knowledge document. Supports append, update section, or overwrite.',
    inputSchema: {
      type: 'object',
      properties: {
        requirementId: { type: 'string', description: 'Requirement ID' },
        category: { type: 'string', enum: ['requirement', 'design', 'backend', 'ios', 'android', 'harmony', 'web', 'miniprogram', 'qa', 'ship', 'growth'], description: 'Knowledge category (pipeline stage)' },
        doc: { type: 'string', description: 'Document name (without .md extension)' },
        content: { type: 'string', description: 'Content to write' },
        section: { type: 'string', description: 'Section header to update (optional)' },
        mode: { type: 'string', enum: ['append', 'update', 'overwrite'], description: 'Write mode (default: append)' },
        workingDirectory: { type: 'string' },
      },
      required: ['requirementId', 'category', 'doc', 'content'],
    },
  },
  // opc_knowledge_exists
  {
    name: 'opc_knowledge_exists',
    description: 'Check if knowledge document exists.',
    inputSchema: {
      type: 'object',
      properties: {
        requirementId: { type: 'string', description: 'Requirement ID' },
        category: { type: 'string', enum: ['requirement', 'design', 'backend', 'ios', 'android', 'harmony', 'web', 'miniprogram', 'qa', 'ship', 'growth'], description: 'Knowledge category (pipeline stage)' },
        doc: { type: 'string', description: 'Document name' },
        workingDirectory: { type: 'string' },
      },
      required: ['requirementId'],
    },
  },
  // opc_knowledge_list
  {
    name: 'opc_knowledge_list',
    description: 'List requirements in knowledge library.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['in_progress', 'completed', 'paused'], description: 'Filter by status' },
        category: { type: 'string', enum: ['requirement', 'design', 'backend', 'ios', 'android', 'harmony', 'web', 'miniprogram', 'qa', 'ship', 'growth'], description: 'Filter by category' },
        workingDirectory: { type: 'string' },
      },
    },
  },
  // opc_knowledge_docs
  {
    name: 'opc_knowledge_docs',
    description: 'List available documents in a category for a requirement.',
    inputSchema: {
      type: 'object',
      properties: {
        requirementId: { type: 'string', description: 'Requirement ID' },
        category: { type: 'string', enum: ['requirement', 'design', 'backend', 'ios', 'android', 'harmony', 'web', 'miniprogram', 'qa', 'ship', 'growth'], description: 'Knowledge category (pipeline stage)' },
        workingDirectory: { type: 'string' },
      },
      required: ['requirementId', 'category'],
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

        const requirementInfo = state.project.requirement_id
          ? `\n**Requirement ID:** ${state.project.requirement_id}`
          : '';

        return {
          content: [{
            type: 'text',
            text: `## OPC Project State

**Project:** ${state.project.name}${requirementInfo}
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
        const projectName = args.project_name as string;
        const projectDescription = (args.project_description as string) || '';
        const providedRequirementId = args.requirement_id as string | undefined;
        const lockId = getCurrentLockId(cwd);

        // Check if current window already has a task bound
        const currentRequirementId = getCurrentRequirementId(lockId, cwd);

        if (currentRequirementId) {
          const existingTask = readProjectState(currentRequirementId, cwd);
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
          // Try to match existing requirements
          const index = readKnowledgeIndex(cwd);
          const candidates = findCandidateRequirements(index, projectName);

          if (candidates.length > 0 && candidates[0].score >= 0.5) {
            // High confidence match - use it
            requirementId = candidates[0].id;
            requirementMatchInfo = `\n\n🔗 **Matched existing requirement:** ${requirementId} (similarity: ${Math.round(candidates[0].score * 100)}%)`;
          } else if (candidates.length > 0) {
            // Low confidence matches - show candidates for user to decide
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
            // No matches - auto-generate new ID
            requirementId = generateNextRequirementId(cwd);
            requirementMatchInfo = `\n\n🆕 **Generated new requirement ID:** ${requirementId}`;
          }
        } else if (requirementId === 'new') {
          // User explicitly wants new
          requirementId = generateNextRequirementId(cwd);
          requirementMatchInfo = `\n\n🆕 **Generated new requirement ID:** ${requirementId}`;
        }

        // Initialize knowledge library (idempotent)
        const knowledgeResult = initKnowledgeLibrary(requirementId, projectName, cwd);
        const knowledgeInfo = knowledgeResult.isNew
          ? 'Knowledge library initialized.'
          : `Resumed existing requirement: "${knowledgeResult.title}"`;

        // Bind current session to this requirement
        bindSessionToRequirement(lockId, requirementId, cwd);

        // Initialize new task
        const state = initializeProjectState(projectName, projectDescription, lockId, requirementId, cwd);
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
**Requirement ID:** ${requirementId}
**Current Stage:** product${requirementMatchInfo}

### Knowledge Library
${knowledgeInfo}

The pipeline is ready. Stage "product" is now in progress.
Use \`opc_state_write\` to update progress as you advance through stages.
Use \`opc_knowledge_read\` and \`opc_knowledge_write\` to manage knowledge.${gitignoreMsg}
`,
          }],
        };
      }

      // ============================================================
      case 'opc_state_clear': {
        const lockId = getCurrentLockId(cwd);
        const requirementId = getCurrentRequirementId(lockId, cwd);
        const cleared = clearCurrentTask(cwd);

        if (cleared) {
          return {
            content: [{
              type: 'text',
              text: `## Task Unbound

**Previous Requirement:** ${requirementId}

The current window has been unbound from this requirement.
You can start a new task with \`opc_state_init\`.

**Note:** The requirement's state file is preserved for history.
Use \`opc_state_init(requirement_id="${requirementId}")\` to resume.`,
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

            // Auto-advance to next stage when current stage completes
            // Use the actual stages from the pipeline (from workflow definition)
            const stageOrder = Object.keys(state.pipeline.stages);
            const currentIndex = stageOrder.indexOf(stage);
            if (currentIndex >= 0 && currentIndex < stageOrder.length - 1) {
              const nextStage = stageOrder[currentIndex + 1];
              // Only advance if next stage is pending (not already in progress or completed)
              if (state.pipeline.stages[nextStage]?.status === 'pending' || !state.pipeline.stages[nextStage]) {
                state.pipeline.current_stage = nextStage;
                state.pipeline.stages[nextStage] = { status: 'pending' };
              }
            }
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

        // Add artifact (use the stage parameter if provided, otherwise current_stage)
        if (args.artifact) {
          const stage = (args.stage as string) || state.pipeline.current_stage;
          if (!state.pipeline.stages[stage]) {
            state.pipeline.stages[stage] = { status: 'pending' };
          }
          if (!state.pipeline.stages[stage].artifacts) {
            state.pipeline.stages[stage].artifacts = [];
          }
          state.pipeline.stages[stage].artifacts.push(args.artifact as string);
        }

        // Update progress (use the stage parameter if provided, otherwise current_stage)
        if (args.progress) {
          const stage = (args.stage as string) || state.pipeline.current_stage;
          if (!state.pipeline.stages[stage]) {
            state.pipeline.stages[stage] = { status: 'pending' };
          }
          state.pipeline.stages[stage].progress = args.progress as Record<string, number>;
        }

        // Add blocker (use the stage parameter if provided, otherwise current_stage)
        if (args.blocker) {
          const stage = (args.stage as string) || state.pipeline.current_stage;
          if (!state.pipeline.stages[stage]) {
            state.pipeline.stages[stage] = { status: 'pending' };
          }
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
      case 'opc_sessions_list': {
        const lockId = getCurrentLockId(cwd);
        const currentRequirementId = getCurrentRequirementId(lockId, cwd);
        const stateDir = ensureOpcDir('state', cwd);

        // List all requirement state directories
        const allRequirements = existsSync(stateDir)
          ? readdirSync(stateDir).filter(f => f.startsWith('REQ-'))
          : [];

        if (allRequirements.length === 0) {
          return {
            content: [{
              type: 'text',
              text: 'No tasks found. Use opc_state_init to start a new project.',
            }],
          };
        }

        // Build task list with status
        const taskList = allRequirements
          .map(reqId => {
            const state = readProjectState(reqId, cwd);
            if (!state) return null;

            const isCurrent = reqId === currentRequirementId;
            const status = state.pipeline.stages[state.pipeline.current_stage]?.status || 'pending';
            const icon = status === 'in_progress' ? '🔄' :
                         status === 'completed' ? '✅' :
                         status === 'blocked' ? '🚫' : '⏳';
            const currentMarker = isCurrent ? ' ← **current**' : '';

            return `${icon} **${reqId}**: ${state.project.name} (${status})${currentMarker}`;
          })
          .filter(Boolean)
          .join('\n');

        return {
          content: [{
            type: 'text',
            text: `## All Tasks (${allRequirements.length})

${taskList}

Use \`opc_state_init(requirement_id="REQ-XXX")\` to resume a task.`,
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
        const state = getCurrentTask(cwd);

        if (!state) {
          return {
            content: [{ type: 'text', text: 'No active task.' }],
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
        const state = getCurrentTask(cwd);

        if (!state) {
          return {
            content: [{ type: 'text', text: 'No active task.' }],
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
      case 'opc_knowledge_init': {
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

      // ============================================================
      case 'opc_knowledge_read': {
        const requirementId = args.requirementId as string;
        const category = args.category as KnowledgeCategory;
        const doc = args.doc as string | undefined;

        // If doc specified, read specific doc
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

        // Read all docs in category
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

      // ============================================================
      case 'opc_knowledge_write': {
        const requirementId = args.requirementId as string;
        const category = args.category as KnowledgeCategory;
        const doc = args.doc as string;
        const content = args.content as string;
        const mode = (args.mode as 'append' | 'update' | 'overwrite') || 'append';
        const section = args.section as string | undefined;

        // Check if requirement exists
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

      // ============================================================
      case 'opc_knowledge_exists': {
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

      // ============================================================
      case 'opc_knowledge_list': {
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

      // ============================================================
      case 'opc_knowledge_docs': {
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
  { name: 'opc-state', version: '3.0.0' },
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
