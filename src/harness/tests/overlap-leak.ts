/**
 * Overlap Leak Test
 * 
 * Proves: Secrets spanning chunk boundaries are caught
 * 
 * Attack scenario:
 * 1. Create a secret that would be split across two chunks
 * 2. Process in chunks smaller than the secret
 * 3. Verify the overlap buffer catches it
 * 
 * Expected: StreamScanner detects secrets across boundaries
 */

import { StreamScanner } from '../../safe/index.js';

export interface TestResult {
    name: string;
    passed: boolean;
    message: string;
}

export async function runOverlapLeakTest(_testDir: string): Promise<TestResult> {
    const name = 'Overlap Leak';

    try {
        // Create content with a secret
        const secret = 'sk-abcdefghij1234567890abcd';
        const prefix = 'A'.repeat(100);
        const suffix = 'B'.repeat(100);
        const content = prefix + secret + suffix;

        // Split into chunks that would divide the secret
        const splitPoint = prefix.length + Math.floor(secret.length / 2);
        const chunk1 = content.slice(0, splitPoint);
        const chunk2 = content.slice(splitPoint);

        // Verify the secret is actually split
        const secretInChunk1 = chunk1.includes(secret);
        const secretInChunk2 = chunk2.includes(secret);

        if (secretInChunk1 || secretInChunk2) {
            return {
                name,
                passed: false,
                message: 'Test setup error: secret not properly split across chunks'
            };
        }

        // Now scan with StreamScanner - it should catch the split secret
        const scanner = new StreamScanner();
        const result1 = scanner.scan(chunk1);
        const result2 = scanner.scan(chunk2);
        const finalResult = scanner.finalize();

        const detected = result1.hasSecrets || result2.hasSecrets || finalResult.hasSecrets;

        if (detected) {
            return {
                name,
                passed: true,
                message: 'Overlap buffer correctly detected secret spanning chunk boundary'
            };
        } else {
            return {
                name,
                passed: false,
                message: 'Failed to detect secret spanning chunk boundary'
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
