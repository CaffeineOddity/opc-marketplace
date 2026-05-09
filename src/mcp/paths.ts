/**
 * OPC Path Utilities
 *
 * Path management for OPC directories and files.
 */

import { join, resolve, isAbsolute, dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';

// ============================================================
// Path Constants
// ============================================================

export const OPC_PATHS = {
  ROOT: '.opc',
  STATE: '.opc/state',
  SESSIONS: '.opc/state/sessions',
  LOCKS: '.opc/state/locks',
  ARTIFACTS: '.opc/artifacts',
  LOGS: '.opc/logs',
  WORKFLOWS: '.opc/workflows',
  KNOWLEDGE: '.opc/knowledge',
} as const;

// ============================================================
// Git Root Detection
// ============================================================

export function getWorktreeRoot(cwd?: string): string {
  const effectiveCwd = cwd || process.cwd();
  try {
    const { execSync } = require('child_process');
    return execSync('git rev-parse --show-toplevel', {
      cwd: effectiveCwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return effectiveCwd;
  }
}

// ============================================================
// OPC Directory Management
// ============================================================

export function getOpcRoot(cwd?: string): string {
  const root = getWorktreeRoot(cwd);
  return join(root, OPC_PATHS.ROOT);
}

export function getWorkflowsPath(cwd?: string): string {
  const root = getWorktreeRoot(cwd);
  return join(root, OPC_PATHS.WORKFLOWS);
}

export function ensureWorkflowsDir(cwd?: string): string {
  const root = getWorktreeRoot(cwd);
  const dir = join(root, OPC_PATHS.WORKFLOWS);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function ensureOpcDir(subdir: string, cwd?: string): string {
  const root = getWorktreeRoot(cwd);
  const dir = join(root, OPC_PATHS.ROOT, subdir);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// ============================================================
// Path Validation
// ============================================================

export function validatePath(inputPath: string): void {
  if (inputPath.includes('..')) {
    throw new Error('Path traversal not allowed');
  }
  if (isAbsolute(inputPath)) {
    throw new Error('Absolute paths not allowed');
  }
}
