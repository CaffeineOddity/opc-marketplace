export const PACKAGE_NAME = "@opc/memory-store" as const;

export * from "./types.js";
export { parse as parseFrontmatter, serialize as serializeFrontmatter } from "./frontmatter.js";
export { atomicWrite, withFileLock } from "./atomic.js";
export { MemoryStore, type MemoryStoreOptions } from "./store.js";
export {
  INDEX_FILENAME,
  indexPath,
  buildIndex,
  loadIndex,
  saveIndex,
  type IndexFile,
} from "./index-store.js";
