/**
 * OPC Window Lock
 *
 * Window detection using PID + O_CREAT|O_EXCL atomic file creation.
 * Adopted from OMC's approach - no external dependencies.
 */
import { existsSync, mkdirSync, readFileSync, openSync, closeSync, writeSync, unlinkSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { constants as fsConstants } from 'fs';
import { ensureOpcDir } from './paths.js';
// ============================================================
// Process Session ID
// ============================================================
let processSessionId = null;
/**
 * Get or generate a unique session ID for the current process.
 * Format: `pid-{PID}-{startTimestamp}`
 */
export function getProcessSessionId() {
    if (!processSessionId) {
        const pid = process.pid;
        const startTime = Date.now();
        processSessionId = `pid-${pid}-${startTime}`;
    }
    return processSessionId;
}
// ============================================================
// Process Alive Detection
// ============================================================
function isProcessAlive(pid) {
    if (!Number.isInteger(pid) || pid <= 0)
        return false;
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (e) {
        if (e && typeof e === 'object' && 'code' in e &&
            e.code === 'EPERM') {
            return true;
        }
        return false;
    }
}
// ============================================================
// File Lock
// ============================================================
const O_CREAT = fsConstants.O_CREAT;
const O_EXCL = fsConstants.O_EXCL;
const O_WRONLY = fsConstants.O_WRONLY;
const DEFAULT_STALE_LOCK_MS = 30_000;
let currentLockId = null;
function getLockPath(lockId, cwd) {
    const lockDir = ensureOpcDir('state/locks', cwd);
    return join(lockDir, `${lockId}.lock`);
}
function isLockStale(lockPath, staleLockMs = DEFAULT_STALE_LOCK_MS) {
    try {
        const stat = statSync(lockPath);
        const ageMs = Date.now() - stat.mtimeMs;
        if (ageMs < staleLockMs)
            return false;
        try {
            const raw = readFileSync(lockPath, 'utf-8');
            const payload = JSON.parse(raw);
            if (payload.pid && isProcessAlive(payload.pid)) {
                return false;
            }
        }
        catch {
            // Malformed or unreadable -- treat as stale if old enough
        }
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Acquire window lock using atomic file creation.
 */
function acquireWindowLock(cwd) {
    if (currentLockId) {
        return currentLockId;
    }
    const lockId = getProcessSessionId();
    const lockPath = getLockPath(lockId, cwd);
    const lockDir = dirname(lockPath);
    if (!existsSync(lockDir)) {
        mkdirSync(lockDir, { recursive: true });
    }
    try {
        const fd = openSync(lockPath, O_CREAT | O_EXCL | O_WRONLY, 0o600);
        const payload = JSON.stringify({
            lockId,
            pid: process.pid,
            timestamp: Date.now(),
        });
        writeSync(fd, payload, null, 'utf-8');
        closeSync(fd);
        currentLockId = lockId;
        return lockId;
    }
    catch (err) {
        if (err && typeof err === 'object' && 'code' in err &&
            err.code === 'EEXIST') {
            if (isLockStale(lockPath)) {
                try {
                    unlinkSync(lockPath);
                    return acquireWindowLock(cwd);
                }
                catch {
                    currentLockId = lockId;
                    return lockId;
                }
            }
            currentLockId = lockId;
            return lockId;
        }
        throw err;
    }
}
/**
 * Get current window's lock ID.
 */
export function getCurrentLockId(cwd) {
    if (!currentLockId) {
        currentLockId = acquireWindowLock(cwd);
    }
    return currentLockId;
}
