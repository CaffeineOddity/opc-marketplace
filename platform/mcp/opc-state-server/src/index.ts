export const SERVER_NAME = "opc-state-server" as const;

export { FlowServer, OwnerStillAliveError } from "./flow-server.js";
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
  ReflectionUnavailableRequest,
  ReflectionUnavailableResponse,
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
  KitNotLoadedPreFlightError,
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
  PipelineLifecycleRequest,
  PipelineLifecycleResponse,
  PipelineCompleteResponse,
  PipelineAbortResponse,
  PipelineResumeResponse,
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
  PhaseConfirmRequest,
  PhaseConfirmResponse,
  PhaseConfirmNodeOverride,
  PhaseCompleteRequest,
  PhaseCompleteResponse,
  PhaseResetRequest,
  PhaseResetResponse,
} from "./phase-server.js";

export { NodeServer, NodeValidationError } from "./node-server.js";
export type {
  NodeServerOptions,
  NodeStartRequest,
  NodeStartResponse,
  NodeCompleteRequest,
  NodeCompleteResponse,
  NodeFailRequest,
  NodeFailResponse,
  NodeRetryRequest,
  NodeRetryResponse,
  NodeFinishRequest,
  NodeFinishResponse,
} from "./node-server.js";
export {
  resolve as resolveNodes,
  computeNextNode,
  computeUnblockedNodes,
  NodeResolverError,
} from "./node-resolver.js";
export type {
  ResolvedNode,
  ResolvedGroup,
  ResolvedPlan,
  ResolvedNodeStatus,
} from "./node-resolver.js";
export type {
  NodeDefinition,
  NodeMode,
  NodeAgents,
  NodeInputSpec,
  NodeOutputSpec,
  NodeEvidence,
  QualityGate,
} from "./state-json.js";
export {
  deriveSessionId,
  deriveSessionIdFromDate,
  parseSessionId,
  isStdioDerivedSessionId,
} from "./session-id.js";
export type { DerivedSessionParts } from "./session-id.js";
export {
  readTransportFromEnv,
  resolveClaudePid,
  TransportArgError,
  TransportConfigError,
} from "./transport.js";
export type {
  TransportMode,
  ResolvedClaudePid,
  ResolveClaudePidArgs,
} from "./transport.js";
export { scanForOrphans, defaultIsAlive } from "./orphan-scanner.js";
export type {
  OrphanScanArgs,
  OrphanScanResult,
  OrphanClassification,
  SessionScanEntry,
  SuggestedAction,
} from "./orphan-scanner.js";
export {
  checkKitHealth,
  notLoadedAgents,
  INSTALLED_KITS_FILENAME,
} from "./kit-health.js";
export type {
  InstalledKit,
  InstalledKitsFile,
  KitWarning,
  KitSuggestedAction,
  KitHealthResult,
  KitHealthArgs,
} from "./kit-health.js";

export {
  writeValidatorArtifact,
  validatorLogDir,
  VALIDATOR_LOGS_DIR,
} from "./validator-log.js";
export type {
  ValidatorArtifact,
  ValidatorResults,
  ValidatorOutcome,
  ValidatorStep,
  WriteValidatorArtifactInput,
} from "./validator-log.js";
