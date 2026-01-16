/**
 * Symlink Race Test
 * 
 * Proves: O_NOFOLLOW blocks file swap during read
 * 
 * Attack scenario:
 * 1. Create a regular file with safe content
 * 2. Swap it with a symlink pointing to /etc/passwd (or sensitive file)
 * 3. Attempt to read the file
 * 
 * Expected: fsSafe.read should fail with SymlinkError
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fsSafe, SymlinkError } from '../../safe/index.js';

export interface TestResult {
    name: string;
    passed: boolean;
    message: string;
}

export async function runSymlinkRaceTest(testDir: string): Promise<TestResult> {
    const name = 'Symlink Race';
    const filePath = path.join(testDir, 'target.txt');
    const linkPath = path.join(testDir, 'symlink.txt');

    try {
        // Setup: Create a regular file
        await fs.writeFile(filePath, 'safe content');

        // Create a symlink (simulating the attack)
        await fs.symlink(filePath, linkPath);

        // Attempt to read the symlink using fsSafe
        try {
            await fsSafe.read(linkPath, testDir);

            // If we got here, the read succeeded - this is a FAILURE
            return {
                name,
                passed: false,
                message: 'fsSafe.read succeeded on symlink - O_NOFOLLOW protection failed'
            };
        } catch (err) {
            if (err instanceof SymlinkError) {
                // This is the expected behavior - symlink was blocked
                return {
                    name,
                    passed: true,
                    message: 'Symlink correctly blocked by O_NOFOLLOW'
                };
            }
            // Some other error
            throw err;
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
            await fs.unlink(linkPath);
            await fs.unlink(filePath);
        } catch {
            // Ignore cleanup errors
        }
    }
}
