/**
 * OPC State Types
 *
 * Type definitions for OPC state management.
 */
export interface StageConfig {
    required?: boolean;
    outputs?: string[];
    optional_outputs?: string[];
    agents?: string[];
    agent_mode?: 'sequential' | 'parallel';
    skills?: string[];
    skip_conditions?: string[];
    constraints?: string[];
    description?: string;
    knowledge?: {
        domain?: string;
        doc?: string;
        read_before?: string[] | boolean;
        write_after?: boolean;
        content_template?: string;
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
export interface StageState {
    status: 'pending' | 'in_progress' | 'completed' | 'blocked';
    agents_used?: string[];
    artifacts?: string[];
    started_at?: string;
    completed_at?: string;
    verification_passed?: boolean;
    progress?: Record<string, number>;
    blockers?: string[];
    task_groups?: TaskGroup[];
    active_parallel_tasks?: string[];
    config?: StageConfig;
    gates_passed?: string[];
    gates_blocked?: string[];
}
export interface ParallelTask {
    task_id: string;
    agent: string;
    description: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    progress: number;
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
export interface ProjectState {
    project: {
        name: string;
        description: string;
        requirement_id?: string;
        knowledge_topic?: string;
        created_at: string;
        updated_at: string;
    };
    pipeline: {
        current_stage: string;
        stage_order?: string[];
        stages: Record<string, StageState>;
    };
    workflow?: {
        name: string;
        source: 'matched' | 'auto_assembled';
        matched_at?: string;
        confidence?: number;
    };
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
    context: {
        lock_id: string;
        worktree: string;
    };
    _meta: {
        version: string;
        updated_by: string;
    };
}
export interface SessionIndex {
    sessions: Record<string, {
        requirement_id: string;
        source: 'matched' | 'auto_assembled';
        workflow_name?: string;
        created_at: string;
        updated_at: string;
    }>;
}
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
export interface Checkpoint {
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
export interface MemoryEntry {
    id: string;
    created_at: string;
    category: 'decision' | 'pattern' | 'lesson' | 'constraint';
    content: string;
    metadata?: Record<string, unknown>;
}
export interface ProjectMemory {
    entries: MemoryEntry[];
    updated_at: string;
}
export declare const KNOWLEDGE_CATEGORIES: readonly ["requirement", "design", "backend", "ios", "android", "harmony", "web", "miniprogram", "qa", "ship", "growth"];
export type KnowledgeCategory = typeof KNOWLEDGE_CATEGORIES[number];
export interface KnowledgeIndex {
    topics: Record<string, {
        title: string;
        description?: string;
        status: 'in_progress' | 'completed' | 'paused';
        created_at: string;
        updated_at: string;
        domains: Record<string, string[]>;
    }>;
}
