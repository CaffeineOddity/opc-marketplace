/**
 * OPC File I/O Utilities
 *
 * Atomic file operations for state management.
 */
import { writeFileSync, readFileSync, existsSync, renameSync } from 'fs';
// ============================================================
// Atomic JSON Write
// ============================================================
export function atomicWriteJson(filePath, data) {
    const tempPath = `${filePath}.tmp-${process.pid}`;
    writeFileSync(tempPath, JSON.stringify(data, null, 2), { mode: 0o600 });
    renameSync(tempPath, filePath);
}
// ============================================================
// JSON File Read
// ============================================================
export function readJsonFile(filePath) {
    if (!existsSync(filePath))
        return null;
    try {
        const content = readFileSync(filePath, 'utf-8');
        return JSON.parse(content);
    }
    catch {
        return null;
    }
}
// ============================================================
// Gitignore Update
// ============================================================
import { join } from 'path';
import { getWorktreeRoot } from './paths.js';
export function updateGitignore(cwd) {
    const root = getWorktreeRoot(cwd);
    const gitignorePath = join(root, '.gitignore');
    const OPC_GITIGNORE_ENTRY = `
# OPC state - personal session data, don't commit
.opc/state/
`;
    if (!existsSync(gitignorePath)) {
        writeFileSync(gitignorePath, OPC_GITIGNORE_ENTRY);
        return true;
    }
    const content = readFileSync(gitignorePath, 'utf-8');
    if (content.includes('.opc/state/')) {
        return false;
    }
    writeFileSync(gitignorePath, content + OPC_GITIGNORE_ENTRY);
    return true;
}
