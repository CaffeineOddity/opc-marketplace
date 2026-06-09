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
