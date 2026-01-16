/**
 * Delete Escape Test
 * 
 * Proves: Cleanup cannot delete files outside .ai-handoff/tmp/
 * 
 * Attack scenario:
 * 1. Attempt to delete a file outside the allowed directory
 * 2. Use path traversal (../) to escape
 * 
 * Expected: fsSafe.unlink and fsSafe.rmdir throw PathEscapeError
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fsSafe, PathEscapeError } from '../../safe/index.js';

export interface TestResult {
    name: string;
    passed: boolean;
    message: string;
}

export async function runDeleteEscapeTest(testDir: string): Promise<TestResult> {
    const name = 'Delete Escape';

    // Create a file outside the allowed directory
    const outsideFile = path.join(testDir, '..', 'outside-file.txt');
    const allowedRoot = path.join(testDir, 'allowed');

    try {
        // Setup
        await fs.mkdir(allowedRoot, { recursive: true });
        await fs.writeFile(outsideFile, 'This should not be deleted');

        let blockedCount = 0;
        const attacks = [
            // Direct path outside root
            outsideFile,
            // Path traversal
            path.join(allowedRoot, '..', '..', 'outside-file.txt'),
            // Absolute path outside
            '/tmp/should-not-delete.txt'
        ];

        for (const attackPath of attacks) {
            try {
                await fsSafe.unlink(attackPath, allowedRoot);
                // If we got here, the delete succeeded - this is bad
            } catch (err) {
                if (err instanceof PathEscapeError) {
                    blockedCount++;
                }
            }
        }

        // Also test rmdir escape
        const outsideDir = path.join(testDir, '..', 'outside-dir');
        try {
            await fs.mkdir(outsideDir, { recursive: true });
            await fsSafe.rmdir(outsideDir, allowedRoot);
            // If we got here, the delete succeeded - this is bad
        } catch (err) {
            if (err instanceof PathEscapeError) {
                blockedCount++;
            }
        }

        // Verify the outside file still exists
        const fileStillExists = await fs.access(outsideFile).then(() => true).catch(() => false);

        if (blockedCount === attacks.length + 1 && fileStillExists) {
            return {
                name,
                passed: true,
                message: `All ${blockedCount} escape attempts blocked, file preserved`
            };
        } else {
            return {
                name,
                passed: false,
                message: `Only ${blockedCount}/${attacks.length + 1} blocked, file exists: ${fileStillExists}`
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
            await fs.unlink(outsideFile);
            await fs.rm(path.join(testDir, '..', 'outside-dir'), { recursive: true, force: true });
            await fs.rm(allowedRoot, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors
        }
    }
}
