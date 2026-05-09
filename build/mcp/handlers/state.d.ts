/**
 * State Handlers
 *
 * Handles opc_state_* tool calls.
 */
import type { ToolResult } from './index.js';
export declare function handleStateRead(cwd: string | undefined): ToolResult;
export declare function handleStateInit(args: Record<string, unknown>, cwd: string | undefined): ToolResult;
export declare function handleStateClear(cwd: string | undefined): ToolResult;
export declare function handleStateWrite(args: Record<string, unknown>, cwd: string | undefined): ToolResult;
