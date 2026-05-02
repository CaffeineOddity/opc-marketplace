/**
 * OPC State MCP Server (Single-Task Model)
 *
 * Provides state management tools for OPC Founder agent.
 * Enables cross-session persistence, stage tracking, and agent handoffs.
 *
 * Single-Task Model:
 * - One window = one task
 * - Task must complete before starting next
 * - ESC interruption = task abandoned (start fresh)
 * - No task queue, no multi-session management
 *
 * Window detection uses PID + O_CREAT|O_EXCL atomic file creation
 * (adopted from OMC's approach - no external dependencies).
 */
export {};
