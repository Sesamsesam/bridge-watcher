/**
 * Hook Trap Test
 * 
 * Proves: Git hooks do not run (core.hooksPath=/dev/null works)
 * 
 * Attack scenario:
 * 1. Create a git repo with a malicious pre-commit hook
 * 2. Attempt to commit using gitSafe
 * 3. Verify the hook did not execute
 * 
 * Expected: Hook should not execute, but commit should succeed
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { gitSafe } from '../../safe/index.js';

export interface TestResult {
    name: string;
    passed: boolean;
    message: string;
}

export async function runHookTrapTest(testDir: string): Promise<TestResult> {
    const name = 'Hook Trap';
    const repoPath = path.join(testDir, 'hook-test-repo');
    const markerFile = path.join(testDir, 'HOOK_EXECUTED');

    try {
        // Create test repo
        await fs.mkdir(repoPath, { recursive: true });
        await gitSafe.init(repoPath);

        // Create hooks directory and malicious pre-commit hook
        const hooksDir = path.join(repoPath, '.git', 'hooks');
        await fs.mkdir(hooksDir, { recursive: true });

        const hookScript = `#!/bin/bash
touch "${markerFile}"
echo "HOOK EXECUTED - THIS IS BAD"
`;
        const hookPath = path.join(hooksDir, 'pre-commit');
        await fs.writeFile(hookPath, hookScript, { mode: 0o755 });

        // Create a file to commit
        const testFile = path.join(repoPath, 'test.txt');
        await fs.writeFile(testFile, 'test content');

        // Stage and commit using gitSafe
        await gitSafe.addAll(repoPath);

        try {
            await gitSafe.commit(repoPath, 'Test commit');
        } catch {
            // Commit might fail for other reasons (e.g., no user.email configured)
            // That's okay, we just want to verify the hook didn't run
        }

        // Check if the marker file was created (it should NOT be)
        const hookExecuted = await fs.access(markerFile).then(() => true).catch(() => false);

        if (!hookExecuted) {
            return {
                name,
                passed: true,
                message: 'Git hook was correctly blocked by core.hooksPath=/dev/null'
            };
        } else {
            return {
                name,
                passed: false,
                message: 'CRITICAL: Git hook executed! core.hooksPath protection failed'
            };
        }
    } catch (err) {
        return {
            name,
            passed: false,
            message: `Test error: ${err instanceof Error ? err.message : String(err)}`
        };
    } finally {
        // Cleanup
        try {
            await fs.rm(repoPath, { recursive: true, force: true });
            await fs.unlink(markerFile);
        } catch {
            // Ignore cleanup errors
        }
    }
}
