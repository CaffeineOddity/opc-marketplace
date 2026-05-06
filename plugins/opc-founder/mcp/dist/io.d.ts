/**
 * OPC File I/O Utilities
 *
 * Atomic file operations for state management.
 */
export declare function atomicWriteJson(filePath: string, data: unknown): void;
export declare function readJsonFile<T>(filePath: string): T | null;
export declare function updateGitignore(cwd?: string): boolean;
