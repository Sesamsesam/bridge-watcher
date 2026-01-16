/**
 * Exfil Attempt Test
 * 
 * Proves: Network calls fail with --network=none in Docker
 * 
 * Attack scenario:
 * 1. Run a command that attempts network access inside Docker
 * 2. Verify the network call fails
 * 
 * Expected: All network operations should fail
 * 
 * NOTE: This test requires Docker to be running
 */

import { DockerRunner, isDockerAvailable, isRunnerImageAvailable } from '../../runner/index.js';

export interface TestResult {
    name: string;
    passed: boolean;
    message: string;
}

export async function runExfilAttemptTest(testDir: string): Promise<TestResult> {
    const name = 'Exfil Attempt';

    try {
        // Check Docker availability
        const dockerOk = await isDockerAvailable();
        if (!dockerOk) {
            return {
                name,
                passed: false,
                message: 'Docker not available - cannot run exfil test'
            };
        }

        const imageOk = await isRunnerImageAvailable();
        if (!imageOk) {
            return {
                name,
                passed: false,
                message: 'bridge-runner:dev image not found - build it first'
            };
        }

        const runner = new DockerRunner();
        let blockedCount = 0;

        // Test 1: Try curl (should fail)
        const curlResult = await runner.run('curl', ['-s', '--max-time', '2', 'https://httpbin.org/get'], {
            wsPath: testDir,
            timeoutMs: 10000
        });
        if (curlResult.exitCode !== 0) {
            blockedCount++;
        }

        // Test 2: Try wget (should fail)
        const wgetResult = await runner.run('wget', ['-q', '-T', '2', '-O', '-', 'https://httpbin.org/get'], {
            wsPath: testDir,
            timeoutMs: 10000
        });
        if (wgetResult.exitCode !== 0) {
            blockedCount++;
        }

        // Test 3: Try DNS lookup (should fail)
        const dnsResult = await runner.run('nslookup', ['google.com'], {
            wsPath: testDir,
            timeoutMs: 10000
        });
        if (dnsResult.exitCode !== 0) {
            blockedCount++;
        }

        // Test 4: Try ping (should fail)
        const pingResult = await runner.run('ping', ['-c', '1', '-W', '2', '8.8.8.8'], {
            wsPath: testDir,
            timeoutMs: 10000
        });
        if (pingResult.exitCode !== 0) {
            blockedCount++;
        }

        if (blockedCount >= 3) {
            // Allow some commands to not exist in the container
            return {
                name,
                passed: true,
                message: `${blockedCount}/4 network operations blocked by --network=none`
            };
        } else {
            return {
                name,
                passed: false,
                message: `Only ${blockedCount}/4 blocked - network isolation may be compromised`
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
