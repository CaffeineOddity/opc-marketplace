/**
 * OPC Window Lock
 *
 * Window detection using PID + O_CREAT|O_EXCL atomic file creation.
 * Adopted from OMC's approach - no external dependencies.
 */
/**
 * Get or generate a unique session ID for the current process.
 * Format: `pid-{PID}-{startTimestamp}`
 */
export declare function getProcessSessionId(): string;
/**
 * Get current window's lock ID.
 */
export declare function getCurrentLockId(cwd?: string): string;
