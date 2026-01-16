/**
 * Locking Utilities
 * 
 * Worker lock: Only one watcher runs at a time
 * Per-task lock: Prevents duplicate processing
 * 
 * Protocol-compliant: Uses __worker__.lock naming
 */

import { fsSafe } from '../safe/index.js';
import * as path from 'node:path';
import * as os from 'node:os';

/** Worker lock filename (protocol naming) */
export const WORKER_LOCK_FILE = '__worker__.lock';

/** Lock metadata stored in lock files */
export interface LockMetadata {
    /** Process ID of lock holder */
    pid: number;
    /** Hostname of lock holder */
    host: string;
    /** When lock was acquired (ISO-8601) */
    created_at: string;
    /** Task ID (for per-task locks only) */
    task_id?: string;
    /** Timeout in seconds (for TTL, primarily V1.5) */
    timeout_sec?: number;
}

/**
 * Acquire the worker lock
 * 
 * @param lockDir - Directory for lock files (.ai-handoff/locks/)
 * @param root - Root directory for safe file operations
 * @returns true if lock acquired, false if already locked
 */
export async function acquireWorkerLock(
    lockDir: string,
    root: string
): Promise<boolean> {
    const lockPath = path.join(lockDir, WORKER_LOCK_FILE);

    // Check if lock already exists
    if (await fsSafe.exists(root, lockPath)) {
        // Lock exists - check if valid (basic check, TTL in V1.5)
        try {
            const content = await fsSafe.read(root, lockPath);
            const metadata: LockMetadata = JSON.parse(content);

            // Check if process is still alive (same host only)
            if (metadata.host === os.hostname()) {
                try {
                    process.kill(metadata.pid, 0); // Check if process exists
                    return false; // Process still running, lock is valid
                } catch {
                    // Process doesn't exist, stale lock - remove it
                    await fsSafe.unlink(root, lockPath);
                }
            } else {
                // Different host - cannot verify, assume valid
                return false;
            }
        } catch {
            // Invalid lock file - remove it
            await fsSafe.unlink(root, lockPath);
        }
    }

    // Acquire lock
    const metadata: LockMetadata = {
        pid: process.pid,
        host: os.hostname(),
        created_at: new Date().toISOString(),
    };

    await fsSafe.mkdir(root, lockDir);
    await fsSafe.writeAtomic(root, lockPath, JSON.stringify(metadata, null, 2));

    return true;
}

/**
 * Release the worker lock
 */
export async function releaseWorkerLock(
    lockDir: string,
    root: string
): Promise<void> {
    const lockPath = path.join(lockDir, WORKER_LOCK_FILE);

    if (await fsSafe.exists(root, lockPath)) {
        await fsSafe.unlink(root, lockPath);
    }
}

/**
 * Acquire a per-task lock
 * 
 * @param lockDir - Directory for lock files
 * @param taskId - Task identifier
 * @param root - Root directory
 * @returns true if lock acquired, false if already locked
 */
export async function acquireTaskLock(
    lockDir: string,
    taskId: string,
    root: string
): Promise<boolean> {
    const lockPath = path.join(lockDir, `${taskId}.lock`);

    // Check if lock exists
    if (await fsSafe.exists(root, lockPath)) {
        return false; // Already locked (TTL handling in V1.5)
    }

    // Acquire lock
    const metadata: LockMetadata = {
        pid: process.pid,
        host: os.hostname(),
        created_at: new Date().toISOString(),
        task_id: taskId,
        timeout_sec: 1800, // 30 min default
    };

    await fsSafe.mkdir(root, lockDir);
    await fsSafe.writeAtomic(root, lockPath, JSON.stringify(metadata, null, 2));

    return true;
}

/**
 * Release a per-task lock
 */
export async function releaseTaskLock(
    lockDir: string,
    taskId: string,
    root: string
): Promise<void> {
    const lockPath = path.join(lockDir, `${taskId}.lock`);

    if (await fsSafe.exists(root, lockPath)) {
        await fsSafe.unlink(root, lockPath);
    }
}

/**
 * Check if a result already exists for a task (idempotency)
 */
export async function taskResultExists(
    resultsDir: string,
    taskId: string,
    root: string
): Promise<boolean> {
    const resultPath = path.join(resultsDir, `${taskId}.json`);
    return fsSafe.exists(root, resultPath);
}
