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
