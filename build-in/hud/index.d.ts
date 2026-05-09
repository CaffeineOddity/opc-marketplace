#!/usr/bin/env node
/**
 * OPC HUD - Statusline Script for opc-marketplace
 *
 * Displays: [OPC] | taskName 🔄stage | model | duration | ctx:% | counts
 *
 * Stage icons:
 * - ✅ = completed
 * - 🔄 = in_progress
 * - 🚫 = blocked
 * - ⏳ = pending
 *
 * This script receives stdin JSON from Claude Code and outputs a formatted statusline.
 */
export {};
