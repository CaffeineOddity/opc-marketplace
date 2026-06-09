export const SERVER_NAME = "opc-state-server" as const;

export { FlowServer } from "./flow-server.js";
export type {
  FlowServerOptions,
  FlowNext,
  QueryRequest,
  QueryResponse,
  LifecycleRequest,
  LifecycleResponse,
  StepCompleteRequest,
  StepCompleteResponse,
  ReflectRequest,
  ReflectResponse,
  UserReplyRequest,
  UserReplyResponse,
  QuickDispatchRequest,
  QuickDispatchResponse,
  CorrectRequest,
  CorrectResponse,
} from "./flow-server.js";
export {
  loadFlowState,
  saveFlowState,
  newFlowState,
  emptyAccumulated,
  flowStatePath,
  sessionDir,
  SESSIONS_SUBDIR,
  FLOW_STATE_FILENAME,
  SessionNotFoundError,
} from "./flow-state.js";
export type {
  FlowState,
  FlowStatus,
  FlowStep,
  FlowOwner,
  Intent,
  Accumulated,
  AnalysisResult,
  SubPipelineSpec,
  DecompositionResult,
  HistoryEntry,
  ReflectionLogEntry,
  PendingReflection,
  PendingUserQuestion,
  UserIntervention,
  PipelinePointer,
} from "./flow-state.js";

export {
  PipelineServer,
  PipelineConflictError,
  aggregatePipelineStatus,
} from "./pipeline-server.js";
export type {
  PipelineServerOptions,
  PipelineCreateRequest,
  PipelineCreateResponse,
  PipelineStatusRequest,
  PipelineStatusResponse,
  PipelineReplanRequest,
  PipelineReplanResponse,
  SubPipelineCreateSpec,
  AddSubPipelineSpec,
} from "./pipeline-server.js";
export {
  loadPipelinePlan,
  savePipelinePlan,
  pipelinesDir,
  pipelineDir,
  pipelinePlanPath,
  subPipelineDir,
  PipelineNotFoundError,
  PIPELINES_SUBDIR,
  PIPELINE_PLAN_FILENAME,
  SUB_PIPELINES_SUBDIR,
} from "./pipeline-plan.js";
export type {
  PipelinePlan,
  PipelineStatus,
  SubPipeline,
  SubPipelineStatus,
  ExecutionGroup,
  ExecutionPriority,
  ReplanEntry,
  PipelineComplexity,
  PipelineOwner,
  PausedAt,
} from "./pipeline-plan.js";
export {
  loadStateJson,
  saveStateJson,
  newStateJson,
  writeBrief,
  statePath,
  briefPath,
  STATE_FILENAME,
  BRIEF_FILENAME,
  SubPipelineStateNotFoundError,
} from "./state-json.js";
export type {
  StateJson,
  PhaseState,
  PhasePlan,
  PhaseSelectedBy,
  NodeState,
  NodeStatus,
  PhaseStatus,
  SubStateStatus,
  TaskMeta,
  IoArtifact,
} from "./state-json.js";
export {
  TopologyError,
  validateDag,
  validateExecutionOrder,
  generateExecutionOrder,
  computeNextSubPipeline,
  listBlockedSubs,
} from "./topology.js";

export { PhaseServer, PhaseValidationError } from "./phase-server.js";
export type {
  PhaseServerOptions,
  PhaseStartRequest,
  PhaseStartResponse,
  PhaseCompleteRequest,
  PhaseCompleteResponse,
  PhaseResetRequest,
  PhaseResetResponse,
} from "./phase-server.js";
