/**
 * Result schema and writing
 * 
 * Defines the structure of result JSON files after task execution.
 * Updated for protocol compliance with exit_path and task_snapshot.
 */

import { fsSafe } from '../safe/index.js';
// TODO: Use Task type for task_snapshot in results (V1 enhancement)
// import { Task } from './task.js';
import * as path from 'node:path';

/**
 * Exit paths - canonical reasons for task completion
 */
export type ExitPath =
    | 'completed_success'
    | 'completed_failed'
    | 'worker_locked'
    | 'schema_invalid'
    | 'idempotent_skip'
    | 'branch_checkout_failed'
    | 'repo_dirty'
    | 'opencode_timeout'
    | 'opencode_crashed'
    | 'verify_failed'
    | 'scope_violation'
    | 'secret_detected'
    | 'internal_error';

export type ResultStatus = 'success' | 'failed' | 'error' | 'secret_detected';

export interface VerifyResult {
    /** Command that was run */
    cmd: string;
    /** Arguments used */
    args: string[];
    /** Exit code */
    exitCode: number;
    /** Expected exit code */
    expectedExit: number;
    /** Whether this verification passed */
    passed: boolean;
    /** Duration in milliseconds */
    durationMs: number;
    /** Was output truncated? */
    outputTruncated: boolean;
}

export interface Result {
    /** Task ID this result is for */
    taskId: string;
    /** Overall status */
    status: ResultStatus;
    /** ISO timestamp when task started */
    startedAt: string;
    /** ISO timestamp when task completed */
    completedAt: string;
    /** Total duration in milliseconds */
    durationMs: number;
    /** Verification results */
    verifyResults: VerifyResult[];
    /** Reason for failure (if status is failed or error) */
    reason?: string;
    /** Branch name created for this task */
    branch?: string;
    /** Commit SHA if changes were committed */
    commitSha?: string;
    /** Whether insecure runner was used (should always be false in production) */
    insecureRunnerUsed: boolean;
    /** Secret detection info (if secrets were found) */
    secretIncident?: SecretIncident;
    /** Metadata */
    meta?: Record<string, unknown>;
}

export interface SecretIncident {
    /** Pattern names that matched (NOT the secrets themselves) */
    patterns: string[];
    /** Number of matches */
    matchCount: number;
    /** Hash of incident for deduplication */
    incidentHash: string;
}

/**
 * Write a result atomically to a JSON file
 */
export async function writeResult(result: Result, resultsDir: string, root: string): Promise<void> {
    const filePath = path.join(resultsDir, `${result.taskId}.json`);
    const content = JSON.stringify(result, null, 2);
    await fsSafe.writeAtomic(filePath, content, root);
}

/**
 * Create a success result
 */
export function createSuccessResult(
    taskId: string,
    startedAt: Date,
    verifyResults: VerifyResult[],
    branch?: string,
    commitSha?: string
): Result {
    const completedAt = new Date();
    return {
        taskId,
        status: 'success',
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        verifyResults,
        branch,
        commitSha,
        insecureRunnerUsed: false
    };
}

/**
 * Create a failed result (verification failed)
 */
export function createFailedResult(
    taskId: string,
    startedAt: Date,
    reason: string,
    verifyResults: VerifyResult[]
): Result {
    const completedAt = new Date();
    return {
        taskId,
        status: 'failed',
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        verifyResults,
        reason,
        insecureRunnerUsed: false
    };
}

/**
 * Create an error result (unexpected error)
 */
export function createErrorResult(
    taskId: string,
    startedAt: Date,
    reason: string
): Result {
    const completedAt = new Date();
    return {
        taskId,
        status: 'error',
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        verifyResults: [],
        reason,
        insecureRunnerUsed: false
    };
}

/**
 * Create a secret detected result
 */
export function createSecretDetectedResult(
    taskId: string,
    startedAt: Date,
    incident: SecretIncident
): Result {
    const completedAt = new Date();
    return {
        taskId,
        status: 'secret_detected',
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        verifyResults: [],
        reason: 'Secrets detected in output',
        insecureRunnerUsed: false,
        secretIncident: incident
    };
}
