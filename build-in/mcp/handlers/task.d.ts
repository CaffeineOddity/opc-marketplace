/**
 * Task Group Handlers
 *
 * Handles opc_task_* tool calls.
 */
import type { ToolResult } from './index.js';
export declare function handleTaskGroupCreate(args: Record<string, unknown>, cwd: string | undefined): ToolResult;
export declare function handleTaskUpdate(args: Record<string, unknown>, cwd: string | undefined): ToolResult;
export declare function handleTaskGroupStatus(args: Record<string, unknown>, cwd: string | undefined): ToolResult;
