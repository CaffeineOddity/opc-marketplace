export const SERVER_NAME = "opc-knowledge-server" as const;

export { KnowledgeServer } from "./server.js";
export type {
  KnowledgeServerOptions,
  OpenRequest,
  OpenResponse,
  ReadRequest,
  ReadResponse,
  WriteRequest,
  WriteResponse,
  AdminRequest,
  AdminResponse,
  UnitTree,
} from "./server.js";
export { ReindexWorker } from "./reindex-worker.js";
export type { ReindexWorkerOptions } from "./reindex-worker.js";
export { MemoryBaseVersionResolver } from "./base-version.js";
export type { BaseVersionResolver } from "./base-version.js";
export { diff3 } from "./diff3.js";
export type { Diff3Result, Hunk, MergeStatus } from "./diff3.js";
export { loadRefs, saveRefs, addRefs, relatedUnits, refsPath, REFS_FILENAME } from "./refs.js";
export type { RefsFile } from "./refs.js";
