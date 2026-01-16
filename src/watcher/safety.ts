/**
 * Safety Checks
 * 
 * Pre-flight and in-flight safety validations:
 * - Dirty repo detection
 * - Auto-branch off main
 * - Scope enforcement
 * - Secretless contract
 */

import { gitSafe } from '../safe/index.js';
import * as path from 'node:path';

/** Files that are never allowed to be created (secretless contract) */
const BLOCKED_FILE_PATTERNS = [
    /^\.env$/,
    /^\.env\..+$/, // .env.local, .env.production, etc.
    /\.pem$/,
    /\.key$/,
];

/** Exceptions to blocked patterns */
const ALLOWED_EXCEPTIONS = [
    '.env.example',
    '.env.template',
];

/**
 * Check if the repo has uncommitted changes
 */
export async function isRepoDirty(wsPath: string): Promise<boolean> {
    try {
        const git = await gitSafe.create(wsPath);
        const status = await git.status();
        return !status.isClean();
    } catch {
        // If we can't check, assume dirty to be safe
        return true;
    }
}

/**
 * Get current branch name
 */
export async function getCurrentBranch(wsPath: string): Promise<string | null> {
    try {
        const git = await gitSafe.create(wsPath);
        const status = await git.status();
        return status.current;
    } catch {
        return null;
    }
}

/**
 * Create and checkout a task branch if on main
 * 
 * @returns The branch name (either existing or newly created)
 */
export async function ensureTaskBranch(
    wsPath: string,
    taskId: string
): Promise<{ branch: string; created: boolean }> {
    const git = await gitSafe.create(wsPath);
    const status = await git.status();
    const currentBranch = status.current || 'main';

    // If not on main/master, keep current branch
    if (currentBranch !== 'main' && currentBranch !== 'master') {
        return { branch: currentBranch, created: false };
    }

    // Create task branch
    const branchName = `feat/ai/${taskId}`;
    await git.checkoutLocalBranch(branchName);

    return { branch: branchName, created: true };
}

/**
 * Check if a file path matches blocked patterns (secretless contract)
 */
export function isSecretFile(filePath: string): boolean {
    const fileName = path.basename(filePath);

    // Check exceptions first
    if (ALLOWED_EXCEPTIONS.includes(fileName)) {
        return false;
    }

    // Check blocked patterns
    for (const pattern of BLOCKED_FILE_PATTERNS) {
        if (pattern.test(fileName)) {
            return true;
        }
    }

    return false;
}

/**
 * Check for any secret files in the given paths
 */
export function findSecretFiles(filePaths: string[]): string[] {
    return filePaths.filter(isSecretFile);
}

/**
 * Validate that changes are within allowed scope
 * 
 * @param allowedScope - Files/directories allowed to be modified
 * @param actualChanges - Files that were actually changed
 * @returns Validation result with any violations
 */
export function validateScope(
    allowedScope: string[],
    actualChanges: string[]
): { passed: boolean; violations: string[] } {
    const violations: string[] = [];

    for (const changedFile of actualChanges) {
        const isAllowed = allowedScope.some(scopePath => {
            // Exact match
            if (changedFile === scopePath) return true;

            // Directory match (scope is a directory containing the file)
            if (changedFile.startsWith(scopePath + '/')) return true;

            // Glob-like match (scope ends with /*)
            if (scopePath.endsWith('/*')) {
                const dir = scopePath.slice(0, -2);
                if (changedFile.startsWith(dir + '/')) return true;
            }

            return false;
        });

        if (!isAllowed) {
            violations.push(changedFile);
        }
    }

    return {
        passed: violations.length === 0,
        violations,
    };
}

/**
 * Get list of changed files from git
 */
export async function getChangedFiles(wsPath: string): Promise<string[]> {
    try {
        const git = await gitSafe.create(wsPath);
        const status = await git.status();

        // Combine all changed files
        const files = new Set<string>();
        for (const f of status.modified) files.add(f);
        for (const f of status.created) files.add(f);
        for (const f of status.deleted) files.add(f);
        for (const f of status.renamed.map(r => r.to)) files.add(f);

        return Array.from(files);
    } catch {
        return [];
    }
}

/**
 * Full pre-flight check before processing a task
 */
export interface PreflightResult {
    passed: boolean;
    dirty: boolean;
    branch: string;
    issues: string[];
}

export async function runPreflightChecks(
    wsPath: string,
    taskId: string
): Promise<PreflightResult> {
    const issues: string[] = [];

    // Check if repo is dirty
    const dirty = await isRepoDirty(wsPath);
    if (dirty) {
        issues.push('Repository has uncommitted changes');
        return {
            passed: false,
            dirty: true,
            branch: 'unknown',
            issues,
        };
    }

    // Ensure we're on a task branch
    const { branch } = await ensureTaskBranch(wsPath, taskId);

    return {
        passed: true,
        dirty: false,
        branch,
        issues: [],
    };
}
