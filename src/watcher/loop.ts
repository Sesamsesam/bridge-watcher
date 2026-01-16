/**
 * Watcher loop - Main task processing orchestration
 * 
 * Handles:
 * - Worker lock acquisition
 * - Task claiming and processing
 * - Worktree creation and cleanup
 * - Docker execution
 * - Output scanning
 * - Result writing
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { fsSafe, gitSafe, StreamScanner } from '../safe/index.js';
import { DockerRunner, isDockerAvailable, isRunnerImageAvailable } from '../runner/index.js';
import { Task, loadTasks } from './task.js';
import {
    Result,
    VerifyResult,
    writeResult,
    createSuccessResult,
    createFailedResult,
    createErrorResult,
    createSecretDetectedResult,
    SecretIncident
} from './result.js';
import { createHash } from 'node:crypto';

const HANDOFF_DIR = '.ai-handoff';
const DIRS = {
    tasks: 'tasks',
    running: 'running',
    results: 'results',
    patches: 'patches',
    logs: 'logs',
    locks: 'locks',
    tmp: 'tmp',
    meta: 'meta'
};

const WORKER_LOCK = '__worker__.lock';
const LOCK_STALE_MS = 5 * 60 * 1000; // 5 minutes

export interface WatcherConfig {
    /** Path to the app repository */
    repoPath: string;
    /** Whether to run in single-pass mode (process once and exit) */
    singlePass?: boolean;
    /** Poll interval in ms (default: 2000) */
    pollIntervalMs?: number;
}

export class WatcherLoop {
    private readonly config: WatcherConfig;
    private readonly handoffPath: string;
    private readonly runner: DockerRunner;
    private running = false;
    private workerLockPath: string | null = null;

    constructor(config: WatcherConfig) {
        this.config = config;
        this.handoffPath = path.join(config.repoPath, HANDOFF_DIR);
        this.runner = new DockerRunner();
    }

    /**
     * Initialize the .ai-handoff directory structure
     */
    async init(): Promise<void> {
        for (const dir of Object.values(DIRS)) {
            const dirPath = path.join(this.handoffPath, dir);
            await fsSafe.mkdir(dirPath, this.config.repoPath);
        }

        // Update .gitignore to include .ai-handoff
        const gitignorePath = path.join(this.config.repoPath, '.gitignore');
        try {
            const content = await fsSafe.read(gitignorePath, this.config.repoPath);
            if (!content.includes(HANDOFF_DIR)) {
                await fsSafe.writeAtomic(
                    gitignorePath,
                    content + `\n# Bridge Watcher state\n${HANDOFF_DIR}/\n`,
                    this.config.repoPath
                );
            }
        } catch {
            // .gitignore doesn't exist, create it
            await fsSafe.writeAtomic(
                gitignorePath,
                `# Bridge Watcher state\n${HANDOFF_DIR}/\n`,
                this.config.repoPath
            );
        }
    }

    /**
     * Acquire worker lock
     */
    private async acquireWorkerLock(): Promise<boolean> {
        const lockPath = path.join(this.handoffPath, DIRS.locks, WORKER_LOCK);

        try {
            // Check if lock exists and is stale
            const exists = await fsSafe.exists(lockPath, this.config.repoPath);
            if (exists) {
                const content = await fsSafe.read(lockPath, this.config.repoPath);
                const lockData = JSON.parse(content);
                const lockTime = new Date(lockData.acquired).getTime();

                if (Date.now() - lockTime > LOCK_STALE_MS) {
                    // Stale lock, remove it
                    console.log('Removing stale worker lock');
                    await fsSafe.unlink(lockPath, this.config.repoPath);
                } else {
                    // Lock is held by another worker
                    return false;
                }
            }

            // Write our lock
            const lockData = {
                pid: process.pid,
                acquired: new Date().toISOString(),
                hostname: require('os').hostname()
            };
            await fsSafe.writeAtomic(lockPath, JSON.stringify(lockData, null, 2), this.config.repoPath);
            this.workerLockPath = lockPath;
            return true;
        } catch (err) {
            console.error('Failed to acquire worker lock:', err);
            return false;
        }
    }

    /**
     * Release worker lock
     */
    private async releaseWorkerLock(): Promise<void> {
        if (this.workerLockPath) {
            try {
                await fsSafe.unlink(this.workerLockPath, this.config.repoPath);
            } catch {
                // Ignore errors during cleanup
            }
            this.workerLockPath = null;
        }
    }

    /**
     * Move task from one directory to another
     */
    private async moveTask(taskId: string, from: string, to: string): Promise<void> {
        const fromPath = path.join(this.handoffPath, from, `${taskId}.json`);
        const toPath = path.join(this.handoffPath, to, `${taskId}.json`);

        const content = await fsSafe.read(fromPath, this.config.repoPath);
        await fsSafe.writeAtomic(toPath, content, this.config.repoPath);
        await fsSafe.unlink(fromPath, this.config.repoPath);
    }

    /**
     * Process a single task
     */
    private async processTask(task: Task): Promise<Result> {
        const startedAt = new Date();
        const worktreePath = path.join(this.handoffPath, DIRS.tmp, `ws-${task.id}`);
        const branchName = `feat/ai/${task.id}`;

        try {
            // Move task to running
            await this.moveTask(task.id, DIRS.tasks, DIRS.running);

            // Create worktree for isolation
            await gitSafe.worktreeAdd(this.config.repoPath, worktreePath, branchName);

            // Run verification commands
            const verifyResults: VerifyResult[] = [];
            let allPassed = true;

            for (const verify of task.verify) {
                const expectedExit = verify.expectedExit ?? 0;
                const timeoutMs = (verify.timeoutSec ?? 60) * 1000;

                const result = await this.runner.run(verify.cmd, verify.args, {
                    wsPath: worktreePath,
                    timeoutMs
                });

                // Scan output for secrets
                const scanner = new StreamScanner();
                const stdoutScan = scanner.scan(result.stdout);
                const stderrScan = scanner.scan(result.stderr);
                const finalScan = scanner.finalize();

                if (stdoutScan.hasSecrets || stderrScan.hasSecrets || finalScan.hasSecrets) {
                    // Secret detected! Clean up immediately
                    await this.cleanupWorktree(worktreePath);
                    await fsSafe.unlink(
                        path.join(this.handoffPath, DIRS.running, `${task.id}.json`),
                        this.config.repoPath
                    );

                    const allMatches = [
                        ...stdoutScan.matches,
                        ...stderrScan.matches,
                        ...finalScan.matches
                    ];

                    const incident: SecretIncident = {
                        patterns: [...new Set(allMatches.map(m => m.pattern))],
                        matchCount: allMatches.length,
                        incidentHash: createHash('sha256')
                            .update(task.id + allMatches.map(m => m.pattern).join(','))
                            .digest('hex')
                            .slice(0, 16)
                    };

                    return createSecretDetectedResult(task.id, startedAt, incident);
                }

                const passed = result.exitCode === expectedExit;
                if (!passed) allPassed = false;

                verifyResults.push({
                    cmd: verify.cmd,
                    args: verify.args,
                    exitCode: result.exitCode,
                    expectedExit,
                    passed,
                    durationMs: result.durationMs,
                    outputTruncated: result.stdout.length > 100000 || result.stderr.length > 100000
                });
            }

            // Cleanup worktree
            await this.cleanupWorktree(worktreePath);

            // Remove from running
            await fsSafe.unlink(
                path.join(this.handoffPath, DIRS.running, `${task.id}.json`),
                this.config.repoPath
            );

            if (allPassed) {
                return createSuccessResult(task.id, startedAt, verifyResults, branchName);
            } else {
                const failedVerify = verifyResults.filter(v => !v.passed);
                return createFailedResult(
                    task.id,
                    startedAt,
                    `Verification failed: ${failedVerify.map(v => v.cmd).join(', ')}`,
                    verifyResults
                );
            }
        } catch (err) {
            // Cleanup on error
            await this.cleanupWorktree(worktreePath);

            try {
                await fsSafe.unlink(
                    path.join(this.handoffPath, DIRS.running, `${task.id}.json`),
                    this.config.repoPath
                );
            } catch {
                // Ignore cleanup errors
            }

            return createErrorResult(
                task.id,
                startedAt,
                err instanceof Error ? err.message : 'Unknown error'
            );
        }
    }

    /**
     * Clean up a worktree
     */
    private async cleanupWorktree(worktreePath: string): Promise<void> {
        try {
            // Only clean up within the tmp directory
            const tmpDir = path.join(this.handoffPath, DIRS.tmp);
            if (!fsSafe.isContained(worktreePath, tmpDir)) {
                throw new Error(`Refusing to clean up path outside tmp: ${worktreePath}`);
            }

            await gitSafe.worktreeRemove(this.config.repoPath, worktreePath);
        } catch {
            // If worktree remove fails, try manual cleanup
            try {
                const tmpDir = path.join(this.handoffPath, DIRS.tmp);
                if (fsSafe.isContained(worktreePath, tmpDir)) {
                    await fsSafe.rmdir(worktreePath, tmpDir);
                }
            } catch {
                // Ignore cleanup errors
            }
        }
    }

    /**
     * Run the main loop
     */
    async run(): Promise<void> {
        // Pre-flight checks
        const dockerOk = await isDockerAvailable();
        if (!dockerOk) {
            throw new Error('Docker is not available. Please install and start Docker.');
        }

        const imageOk = await isRunnerImageAvailable();
        if (!imageOk) {
            throw new Error('bridge-runner:dev image not found. Run: docker build -t bridge-runner:dev .');
        }

        // Acquire worker lock
        const gotLock = await this.acquireWorkerLock();
        if (!gotLock) {
            throw new Error('Another worker is already running. Remove stale lock or wait.');
        }

        this.running = true;
        console.log('Worker started, processing tasks...');

        try {
            while (this.running) {
                const tasksDir = path.join(this.handoffPath, DIRS.tasks);
                const tasks = await loadTasks(tasksDir, this.config.repoPath);

                for (const task of tasks) {
                    if (!this.running) break;

                    console.log(`Processing task: ${task.id} - ${task.title}`);
                    const result = await this.processTask(task);

                    // Write result
                    const resultsDir = path.join(this.handoffPath, DIRS.results);
                    await writeResult(result, resultsDir, this.config.repoPath);

                    console.log(`Task ${task.id} completed with status: ${result.status}`);
                }

                if (this.config.singlePass) {
                    break;
                }

                // Wait before next poll
                await new Promise(resolve =>
                    setTimeout(resolve, this.config.pollIntervalMs ?? 2000)
                );
            }
        } finally {
            await this.releaseWorkerLock();
            console.log('Worker stopped');
        }
    }

    /**
     * Stop the loop gracefully
     */
    stop(): void {
        this.running = false;
    }
}
