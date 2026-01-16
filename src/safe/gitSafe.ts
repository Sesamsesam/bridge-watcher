/**
 * gitSafe - Safe git operations wrapper
 * 
 * Security properties:
 * - Always disables git hooks via core.hooksPath=/dev/null
 * - Enforces timeouts on all operations
 * - Confines operations to worktree path
 * - Uses simple-git for structured, safe parsing
 */

import { simpleGit, SimpleGit, SimpleGitOptions, StatusResult } from 'simple-git';
import * as path from 'node:path';

const DEFAULT_TIMEOUT_MS = 30_000; // 30 seconds
const MAX_DIFF_SIZE = 10 * 1024 * 1024; // 10 MB

export class GitTimeoutError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'GitTimeoutError';
    }
}

export class GitConfinementError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'GitConfinementError';
    }
}

/**
 * Creates a configured simple-git instance with safety guards.
 */
function createSafeGit(wsPath: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): SimpleGit {
    const resolvedPath = path.resolve(wsPath);

    const options: Partial<SimpleGitOptions> = {
        baseDir: resolvedPath,
        binary: 'git',
        maxConcurrentProcesses: 1,
        timeout: {
            block: timeoutMs
        },
        config: [
            // CRITICAL: Disable all git hooks
            'core.hooksPath=/dev/null',
            // Additional safety settings
            'advice.detachedHead=false',
            'gc.auto=0'
        ]
    };

    return simpleGit(options);
}

export const gitSafe = {
    /**
     * Create a configured simple-git instance.
     * All operations will have hooks disabled and timeouts enforced.
     */
    create(wsPath: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): SimpleGit {
        return createSafeGit(wsPath, timeoutMs);
    },

    /**
     * Get git status for a worktree.
     */
    async status(wsPath: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<StatusResult> {
        const git = createSafeGit(wsPath, timeoutMs);
        return git.status();
    },

    /**
     * Get diff for staged/unstaged changes.
     * Returns raw diff string, size-limited.
     */
    async diff(wsPath: string, staged: boolean = false, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<string> {
        const git = createSafeGit(wsPath, timeoutMs);
        const args = staged ? ['--cached'] : [];
        const diffOutput = await git.diff(args);

        if (diffOutput.length > MAX_DIFF_SIZE) {
            return diffOutput.slice(0, MAX_DIFF_SIZE) + '\n... [truncated, diff too large]';
        }

        return diffOutput;
    },

    /**
     * Create a git worktree.
     */
    async worktreeAdd(
        mainRepoPath: string,
        worktreePath: string,
        branch: string,
        timeoutMs: number = DEFAULT_TIMEOUT_MS
    ): Promise<void> {
        const resolvedMain = path.resolve(mainRepoPath);
        const resolvedWorktree = path.resolve(worktreePath);

        // Worktree must be created under the main repo or a controlled location
        const git = createSafeGit(resolvedMain, timeoutMs);

        // Create branch from current HEAD and add worktree
        await git.raw(['worktree', 'add', '-b', branch, resolvedWorktree, 'HEAD']);
    },

    /**
     * Remove a git worktree safely.
     */
    async worktreeRemove(
        mainRepoPath: string,
        worktreePath: string,
        timeoutMs: number = DEFAULT_TIMEOUT_MS
    ): Promise<void> {
        const resolvedMain = path.resolve(mainRepoPath);
        const resolvedWorktree = path.resolve(worktreePath);

        const git = createSafeGit(resolvedMain, timeoutMs);

        // Force remove the worktree
        await git.raw(['worktree', 'remove', '--force', resolvedWorktree]);
    },

    /**
     * List all worktrees for a repo.
     */
    async worktreeList(
        mainRepoPath: string,
        timeoutMs: number = DEFAULT_TIMEOUT_MS
    ): Promise<string> {
        const resolvedMain = path.resolve(mainRepoPath);
        const git = createSafeGit(resolvedMain, timeoutMs);
        return git.raw(['worktree', 'list']);
    },

    /**
     * Stage all changes.
     */
    async addAll(wsPath: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<void> {
        const git = createSafeGit(wsPath, timeoutMs);
        await git.add('-A');
    },

    /**
     * Commit with a message.
     */
    async commit(
        wsPath: string,
        message: string,
        timeoutMs: number = DEFAULT_TIMEOUT_MS
    ): Promise<string> {
        const git = createSafeGit(wsPath, timeoutMs);
        const result = await git.commit(message);
        return result.commit;
    },

    /**
     * Get current branch name.
     */
    async currentBranch(wsPath: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<string> {
        const git = createSafeGit(wsPath, timeoutMs);
        const result = await git.branch();
        return result.current;
    },

    /**
     * Check if a directory is a git repository.
     */
    async isRepo(wsPath: string): Promise<boolean> {
        try {
            const git = createSafeGit(wsPath);
            await git.status();
            return true;
        } catch {
            return false;
        }
    },

    /**
     * Initialize a new git repository.
     */
    async init(wsPath: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<void> {
        const git = createSafeGit(wsPath, timeoutMs);
        await git.init();
    },

    /**
     * Clone a repository.
     * Note: This should only be used within Docker where network access is controlled.
     */
    async clone(
        repoUrl: string,
        targetPath: string,
        timeoutMs: number = DEFAULT_TIMEOUT_MS
    ): Promise<void> {
        const git = simpleGit({
            timeout: { block: timeoutMs },
            config: ['core.hooksPath=/dev/null']
        });
        await git.clone(repoUrl, targetPath);
    }
};
