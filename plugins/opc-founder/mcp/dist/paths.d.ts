/**
 * OPC Path Utilities
 *
 * Path management for OPC directories and files.
 */
export declare const OPC_PATHS: {
    readonly ROOT: ".opc";
    readonly STATE: ".opc/state";
    readonly CHECKPOINTS: ".opc/state/checkpoints";
    readonly LOCKS: ".opc/state/locks";
    readonly MEMORY: ".opc/memory";
    readonly ARTIFACTS: ".opc/artifacts";
    readonly LOGS: ".opc/logs";
    readonly WORKFLOWS: ".opc/workflows";
    readonly KNOWLEDGE: ".opc/knowledge";
};
export declare function getWorktreeRoot(cwd?: string): string;
export declare function getOpcRoot(cwd?: string): string;
export declare function getWorkflowsPath(cwd?: string): string;
export declare function ensureWorkflowsDir(cwd?: string): string;
export declare function ensureOpcDir(subdir: string, cwd?: string): string;
export declare function validatePath(inputPath: string): void;
export declare function generateCheckpointId(): string;
