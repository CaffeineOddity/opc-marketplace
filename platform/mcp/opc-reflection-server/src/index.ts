export const SERVER_NAME = "opc-reflection-server" as const;

export {
  ReflectionServer,
  ReflectionServerError,
} from "./reflection-server.js";
export type {
  ReflectionServerOptions,
  ReflectPlanRequest,
  ReflectPlanResponse,
  ReflectCritiqueRequest,
  ReflectCritiqueResponse,
  ReflectCritiqueCompleteRequest,
  ReflectCritiqueCompleteResponse,
  ReflectRecordInterventionsRequest,
  ReflectRecordInterventionsResponse,
  ReflectExecuteRequest,
  ReflectExecuteResponse,
  ReflectCompleteRequest,
  ReflectCompleteResponse,
  ReflectAdminRequest,
  ReflectAdminResponse,
  DistillerDispatchContext,
  DistillerTaskSpec,
} from "./reflection-server.js";

export {
  saveReflectionArtifact,
  loadReflectionArtifact,
  listReflectionArtifacts,
  reflectionDir,
  reflectionArtifactPath,
  ReflectionArtifactNotFoundError,
  REFLECTION_LOGS_DIR,
} from "./store.js";
export type {
  StepId,
  ReflectionMethod,
  ReflectionVerdict,
  EvidenceArtifact,
  Objection,
  PendingReflectionContract,
  ReflectionArtifact,
} from "./store.js";

export {
  TELEMETRY_FILENAME,
  telemetryPath,
  appendTelemetry,
  readTelemetry,
} from "./telemetry.js";
export type { TelemetryEntry } from "./telemetry.js";

export { aggregateTelemetry, parseWindow } from "./query-stats.js";
export type {
  QueryStatsRequest,
  QueryStatsResponse,
  QueryStatsTotals,
  PerMethodStepStats,
  ExpiryMetrics,
} from "./query-stats.js";

export { explainReflection, ExplainNotFoundError } from "./explain.js";
export type { ExplainRequest, ExplainResponse } from "./explain.js";

export {
  validateAll,
  validateV1Schema,
  validateV2Referential,
  validateV3Presence,
  validateV4Coverage,
  validateV5Discrimination,
  checkCoverageGuard,
  checkRoundsGuard,
  checkFreshness,
} from "./validators.js";
export type { ValidatorId, ValidatorResult, ValidatorContext } from "./validators.js";

export { pickMethods, availableMethodsForStep } from "./methods.js";
export type { MethodPlan, PickMethodsInput } from "./methods.js";

export {
  CorrectionsServer,
  CorrectionsServerError,
  buildCorrection,
} from "./corrections-server.js";
export type {
  CorrectionsServerOptions,
  CorrectionsQueryRequest,
  CorrectionsQueryResponse,
  CorrectionUpsertItem,
  CorrectionsUpsertRequest,
  CorrectionsUpsertResponse,
  CorrectionsActionRequest,
  CorrectionsActionResponse,
} from "./corrections-server.js";

export {
  CORRECTIONS_DIR,
  CorrectionNotFoundError,
  correctionPath,
  correctionsRoot,
  listAllCorrections,
  listCorrectionsByStep,
  loadCorrection,
  loadCorrectionById,
  saveCorrection,
} from "./corrections-store.js";
export type {
  AppliesWhen,
  Correction,
  CorrectionLocation,
  CorrectionSource,
  CorrectionTrigger,
  LinkedIntervention,
} from "./corrections-store.js";

export {
  similarity,
  appliesWhenOverlap,
  SIM_MERGE_THRESHOLD,
  SIM_WARN_THRESHOLD,
} from "./similarity.js";
export type { SimilarityInput, SimilarityResult } from "./similarity.js";
