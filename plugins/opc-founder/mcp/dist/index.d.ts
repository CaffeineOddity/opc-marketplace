/**
 * OPC State MCP Server (Multi-Task with History)
 *
 * Provides state management tools for OPC Founder agent.
 * Enables cross-session persistence, stage tracking, and agent handoffs.
 *
 * Multi-Task Model:
 * - Each requirement has its own state file (preserves history)
 * - One window = one active task (via session binding)
 * - Session index maps lock_id → requirement_id
 * - All task history is preserved in .opc/state/{requirement_id}_{source}/
 */
export {};
