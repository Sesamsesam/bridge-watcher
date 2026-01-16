/**
 * Untracked Secret Test
 * 
 * Proves: Secrets in new/untracked files (?? status) are detected
 * 
 * Attack scenario:
 * 1. Create a new file with a secret (e.g., API key)
 * 2. File shows as ?? (untracked) in git status
 * 3. Scan the file content
 * 
 * Expected: StreamScanner detects the secret
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { StreamScanner } from '../../safe/index.js';

export interface TestResult {
    name: string;
    passed: boolean;
    message: string;
}

const TEST_SECRETS = [
    { name: 'OpenAI Key', value: 'sk-abcdefghij1234567890abcdefghij12' },
    { name: 'GitHub PAT', value: 'ghp_1234567890abcdefghijklmnopqrstuvwxyz' },
    { name: 'AWS Key', value: 'AKIAIOSFODNN7EXAMPLE' },
    { name: 'Bearer Token', value: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' }
];

export async function runUntrackedSecretTest(testDir: string): Promise<TestResult> {
    const name = 'Untracked Secret';
    const filePath = path.join(testDir, 'config.txt');

    try {
        let allDetected = true;
        const failures: string[] = [];

        for (const secret of TEST_SECRETS) {
            // Create file with secret
            const content = `# Configuration\nAPI_KEY=${secret.value}\n`;
            await fs.writeFile(filePath, content);

            // Scan the content
            const result = StreamScanner.scanString(content);

            if (!result.hasSecrets) {
                allDetected = false;
                failures.push(secret.name);
            }

            // Cleanup
            await fs.unlink(filePath);
        }

        if (allDetected) {
            return {
                name,
                passed: true,
                message: `All ${TEST_SECRETS.length} secret patterns correctly detected`
            };
        } else {
            return {
                name,
                passed: false,
                message: `Failed to detect: ${failures.join(', ')}`
            };
        }
    } catch (err) {
        return {
            name,
            passed: false,
            message: `Test error: ${err instanceof Error ? err.message : String(err)}`
        };
    }
}
