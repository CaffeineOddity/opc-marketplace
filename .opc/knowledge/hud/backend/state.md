---
name: state
description: 生成 HUD 知识库 - 为 OPC Marketplace 的 HUD 组件创建完整的知识库文档
category: backend
topic: hud
created_at: 2026-05-07T04:30:24.788Z
updated_at: 2026-05-08T06:43:10.613Z
---
# HUD State Management

## State Types

### ProjectState

```typescript
interface ProjectState {
  project: {
    name: string;
    description: string;
    requirement_id?: string;
    knowledge_topic?: string;  // Links to knowledge topic (e.g., "hud")
    created_at: string;
    updated_at: string;
  };
  pipeline: {
    current_stage: string;
    stage_order?: string[];  // Preserved stage order from workflow
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
```

### StageState

```typescript
interface StageState {
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
```

### StageConfig

```typescript
interface StageConfig {
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
    frontend?: KnowledgeFlowConfig;
    backend?: KnowledgeFlowConfig;
  };
}
```

## State File Location

```
.opc/state/
├── REQ-001_matched/           # Matched workflow
│   └── project-state.json
├── REQ-002_auto_assembled/    # Auto-assembled pipeline
│   └── project-state.json
├── sessions.json              # Lock ID → Requirement ID mapping
└── checkpoints/               # Rollback points
    └── cp-*.json
```

## State Lifecycle

### 1. Initialization (opc_state_init)

```
User calls opc_state_init(project_name, description)
  ↓
findOrCreateTopic(project_name, description) → topic
  ↓
generateNextRequirementId() → REQ-XXX
  ↓
matchWorkflow(description, workflows) → workflow?
  ↓
initializeProjectState(name, description, lockId, requirementId, workflow)
  ↓
Set first stage to 'in_progress'
  ↓
writeProjectState(state)
  ↓
bindSessionToRequirement(lockId, requirementId, source)
```

### 2. Update (opc_state_write)

```
User calls opc_state_write(stage, stage_status, agent, artifact)
  ↓
getCurrentTask() → state
  ↓
Update stage status
  ↓
If completed: advance to next stage
  ↓
writeProjectState(state)
```

### 3. Read (opc_state_read)

```
User calls opc_state_read()
  ↓
getCurrentLockId() → lockId
  ↓
getCurrentSession(lockId) → session
  ↓
readProjectState(requirementId, source) → state
  ↓
Format and return state display
```

## Dynamic Stage Order

Stage order is preserved from workflow/auto-assembly:

```typescript
// In initializeProjectState
const stageOrder = Object.keys(stages);
const firstStage = stageOrder[0] || 'product';

return {
  pipeline: {
    current_stage: firstStage,
    stage_order: stageOrder,  // Preserved order
    stages,
  },
  // ...
};
```

When stage completes, next stage is determined by `stage_order`:

```typescript
// In handleStateWrite
const stageOrder = state.pipeline.stage_order || Object.keys(state.pipeline.stages);
const currentIndex = stageOrder.indexOf(stage);
if (currentIndex >= 0 && currentIndex < stageOrder.length - 1) {
  const nextStage = stageOrder[currentIndex + 1];
  // ...
}
```

## Checkpoint System

### Creating Checkpoint

```typescript
function createCheckpoint(state: ProjectState, description: string): Checkpoint {
  const checkpoint: Checkpoint = {
    checkpoint_id: generateCheckpointId(),
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
  
  atomicWriteJson(checkpointPath, checkpoint);
  return checkpoint;
}
```

### Rollback

```typescript
function rollbackToCheckpoint(checkpointId: string): ProjectState {
  const checkpoint = readCheckpoint(checkpointId);
  if (!checkpoint || !checkpoint.can_rollback) {
    throw new Error('Cannot rollback');
  }
  
  // Restore state from snapshot
  const restoredState = checkpoint.state_snapshot;
  writeProjectState(restoredState);
  return restoredState;
}
```

## Handoff System

### Recording Handoff

```typescript
function recordHandoff(
  fromAgent: string,
  toAgent: string,
  artifacts: string[],
  constraints: string[],
  context: string,
  lockId: string
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
  
  // Append to handoffs.json for this session
  const handoffs = readHandoffs(lockId) || [];
  handoffs.push(handoff);
  writeHandoffs(lockId, handoffs);
  
  return handoff;
}
```

## Memory System

### Memory Categories

| Category | Purpose |
|----------|---------|
| `decision` | Architecture decisions, technology choices |
| `pattern` | Code patterns, design patterns used |
| `lesson` | Lessons learned, things to avoid |
| `constraint` | Project constraints, limitations |

### Memory Entry

```typescript
interface MemoryEntry {
  id: string;
  created_at: string;
  category: 'decision' | 'pattern' | 'lesson' | 'constraint';
  content: string;
  metadata?: Record<string, unknown>;
}
```

## Session Binding

### Lock ID Format

```
pid-{PID}-{startTimestamp}
```

Example: `pid-46800-1778128224575`

### Session Index

```typescript
interface SessionIndex {
  sessions: Record<string, {
    requirement_id: string;
    source: 'matched' | 'auto_assembled';
    workflow_name?: string;
    created_at: string;
    updated_at: string;
  }>;
}
```

### One Task Per Window

Each window (identified by lock_id) can only have one active task:

```typescript
// In handleStateInit
const currentSession = getCurrentSession(lockId);
if (currentSession) {
  const existingTask = readProjectState(currentSession.requirement_id, currentSession.source);
  if (existingTask && existingTask.pipeline.stages[existingTask.pipeline.current_stage]?.status === 'in_progress') {
    return { error: 'One window can only have one active task' };
  }
}
```