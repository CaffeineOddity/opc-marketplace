/**
 * OPC State Types
 *
 * Type definitions for OPC state management.
 */

// ============================================================
// Process Session ID
// ============================================================

// Process session ID is generated at module load time
// Format: `pid-{PID}-{startTimestamp}`

// ============================================================
// Stage Configuration
// ============================================================

export interface StageConfig {
  // From workflow definition
  required?: boolean;
  outputs?: string[];
  optional_outputs?: string[];
  agents?: string[];
  agent_mode?: 'sequential' | 'parallel';
  skills?: string[];
  skip_conditions?: string[];
  constraints?: string[];
  description?: string;
  // Knowledge flow config
  knowledge?: {
    domain?: string;
    doc?: string;
    read_before?: string[] | boolean;
    write_after?: boolean;
    content_template?: string;
    // For multi-platform stages (like dev)
    frontend?: {
      domain: string;
      platform: string;
      doc: string;
      read_before: string[];
      write_after: boolean;
    };
    backend?: {
      domain: string;
      doc: string;
      read_before: string[];
      write_after: boolean;
    };
  };
}

// ============================================================
// Stage State
// ============================================================

export interface StageState {
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
  active_parallel_tasks?: string[];
  // Workflow-derived config (preserved from workflow spec)
  config?: StageConfig;
  // Gate check results
  gates_passed?: string[];
  gates_blocked?: string[];
}

// ============================================================
// Parallel Tasks
// ============================================================

export interface ParallelTask {
  task_id: string;
  agent: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress: number;  // 0-100
  started_at?: string;
  completed_at?: string;
  artifacts?: string[];
  dependencies?: string[];
}

export interface TaskGroup {
  group_id: string;
  name: string;
  tasks: ParallelTask[];
  parallel: boolean;
  completion_condition: 'all' | 'any' | 'threshold';
  threshold?: number;
  started_at?: string;
  completed_at?: string;
}

// ============================================================
// Project State
// ============================================================

export interface ProjectState {
  project: {
    name: string;
    description: string;
    requirement_id?: string;
    knowledge_topic?: string;  // Links to knowledge topic (e.g., "hud", "state-management")
    knowledge_category?: string;  // Primary knowledge category (e.g., "ios", "web", "backend")
    created_at: string;
    updated_at: string;
  };
  pipeline: {
    current_stage: string;
    stage_order?: string[];  // Preserved stage order from workflow/auto-assembly
    stages: Record<string, StageState>;
  };
  // Workflow metadata
  workflow?: {
    name: string;
    source: 'matched' | 'auto_assembled';
    matched_at?: string;
    confidence?: number;
  };
  // Gates defined by workflow
  gates?: Array<{
    name: string;
    description: string;
    check: string;
    blocker: string;
  }>;
  // Rules from workflow
  rules?: {
    tdd?: boolean;
    sdd?: boolean;
    parallel_allowed?: boolean;
    knowledge_enabled?: boolean;
  };
  context: {
    lock_id: string;
    worktree: string;
  };
  _meta: {
    version: string;
    updated_by: string;
  };
}

// ============================================================
// Session Index
// ============================================================

export interface SessionIndex {
  sessions: Record<string, {
    requirement_id: string;
    source: 'matched' | 'auto_assembled';
    workflow_name?: string;
    created_at: string;
    updated_at: string;
  }>;
}

// ============================================================
// Workflow Spec
// ============================================================

export interface WorkflowSpec {
  name: string;
  description: string;
  triggers: {
    keywords: string[];
    patterns: string[];
  };
  pipeline: Array<{
    stage: string;
    required?: boolean;
    outputs?: string[];
    optional_outputs?: string[];
    agents?: string[];
    agent_mode?: 'sequential' | 'parallel';
    skills?: string[];
    skip_conditions?: string[];
    constraints?: string[];
    description?: string;
    knowledge?: StageConfig['knowledge'];
  }>;
  gates?: Array<{
    name: string;
    description: string;
    check: string;
    blocker: string;
  }>;
  rules?: {
    tdd?: boolean;
    sdd?: boolean;
    parallel_allowed?: boolean;
    knowledge_enabled?: boolean;
  };
  execution_flow?: Record<string, {
    sequence: number;
    next: string[];
    optional?: boolean;
    tdd_cycle?: string[];
    knowledge_flow?: {
      init?: string;
      read?: string[];
      write?: string | string[];
    };
  }>;
}

// ============================================================
// Handoff Record
// ============================================================

export interface HandoffRecord {
  handoff_id: string;
  created_at: string;
  from_agent: string;
  to_agent: string;
  artifacts: string[];
  constraints: string[];
  context: string;
  lock_id: string;
}

// ============================================================
// Knowledge Library
// ============================================================

// Knowledge category is now a string type for flexibility
// Users can define custom categories beyond the recommended list
export type KnowledgeCategory = string;

// Recommended categories for reference (non-exhaustive)
export const RECOMMENDED_CATEGORIES = [
  'requirement', 'design', 'backend', 'ios', 'android',
  'harmony', 'web', 'miniprogram', 'qa', 'ship', 'growth',
  'bug-fix', 'issue', 'tech-doc', 'guide', 'api', 'architecture'
] as const;

// ============================================================
// Pipeline Stages
// ============================================================

// Task stages for pipeline tracking
export const TASK_STAGES = ['product', 'design', 'dev', 'qa', 'ship', 'growth'] as const;
export type TaskStage = typeof TASK_STAGES[number];

// Stage status values
export const STAGE_STATUSES = ['pending', 'in_progress', 'completed', 'blocked'] as const;
export type StageStatus = typeof STAGE_STATUSES[number];

// Knowledge is organized by topic (e.g., "hud", "state-management")
// Each topic can have multiple domain documents (e.g., backend.md, design.md)
export interface KnowledgeIndex {
  topics: Record<string, {
    title: string;
    description?: string;
    status: 'in_progress' | 'completed' | 'paused';
    created_at: string;
    updated_at: string;
    domains: Record<string, string[]>;  // domain -> [doc names]
  }>;
}

// ============================================================
// Knowledge Document Metadata (Frontmatter)
// ============================================================

/**
 * Frontmatter metadata embedded in knowledge documents.
 * Enables self-describing documents and progressive loading.
 */
export interface KnowledgeDocMeta {
  /** Document name (human-readable) */
  name: string;
  /** Brief description for list views and progressive loading */
  description: string;
  /** Knowledge category */
  category: KnowledgeCategory;
  /** Topic identifier (e.g., "hud", "state-management") */
  topic: string;
  /** Creation timestamp */
  created_at?: string;
  /** Last update timestamp */
  updated_at?: string;
  /** Optional tags for filtering */
  tags?: string[];
}

/**
 * Parsed knowledge document with metadata and content.
 */
export interface KnowledgeDocWithMeta {
  /** Parsed frontmatter metadata */
  meta: KnowledgeDocMeta;
  /** Document content without frontmatter */
  content: string;
}
