/**
 * Handoff Handler
 *
 * Handles opc_handoff tool calls.
 */
import type { ToolResult } from './index.js';
export declare function handleHandoff(args: Record<string, unknown>, cwd: string | undefined): ToolResult;
