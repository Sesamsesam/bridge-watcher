/**
 * Harness Runner
 * 
 * Executes all adversarial tests and reports results.
 * All 6 tests must pass for the system to be considered secure.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { runSymlinkRaceTest } from './tests/symlink-race.js';
import { runUntrackedSecretTest } from './tests/untracked-secret.js';
import { runOverlapLeakTest } from './tests/overlap-leak.js';
import { runDeleteEscapeTest } from './tests/delete-escape.js';
import { runHookTrapTest } from './tests/hook-trap.js';
import { runExfilAttemptTest } from './tests/exfil-attempt.js';

export interface TestResult {
    name: string;
    passed: boolean;
    message: string;
}

export interface HarnessResult {
    passed: boolean;
    total: number;
    passedCount: number;
    failedCount: number;
    results: TestResult[];
    durationMs: number;
}

/**
 * Run all harness tests
 */
export async function runHarness(repoPath: string): Promise<HarnessResult> {
    const startTime = Date.now();

    // Create temp directory for tests
    const testDir = path.join(repoPath, '.ai-handoff', 'harness-tests');
    await fs.mkdir(testDir, { recursive: true });

    const results: TestResult[] = [];

    console.log('\n🔒 Running Bridge Watcher Security Harness\n');
    console.log('─'.repeat(50));

    const tests = [
        { name: 'Symlink Race', run: runSymlinkRaceTest },
        { name: 'Untracked Secret', run: runUntrackedSecretTest },
        { name: 'Overlap Leak', run: runOverlapLeakTest },
        { name: 'Delete Escape', run: runDeleteEscapeTest },
        { name: 'Hook Trap', run: runHookTrapTest },
        { name: 'Exfil Attempt', run: runExfilAttemptTest }
    ];

    for (const test of tests) {
        process.stdout.write(`  ${test.name}... `);
        const result = await test.run(testDir);
        results.push(result);

        if (result.passed) {
            console.log(`✅ PASS`);
        } else {
            console.log(`❌ FAIL`);
            console.log(`     ${result.message}`);
        }
    }

    // Cleanup test directory
    try {
        await fs.rm(testDir, { recursive: true, force: true });
    } catch {
        // Ignore cleanup errors
    }

    const durationMs = Date.now() - startTime;
    const passedCount = results.filter(r => r.passed).length;
    const failedCount = results.length - passedCount;
    const allPassed = failedCount === 0;

    console.log('─'.repeat(50));
    console.log(`\n${allPassed ? '✅' : '❌'} ${passedCount}/${results.length} tests passed (${durationMs}ms)\n`);

    if (!allPassed) {
        console.log('⚠️  HARNESS FAILED - System is NOT secure\n');
    } else {
        console.log('🎉 All security tests passed!\n');
    }

    return {
        passed: allPassed,
        total: results.length,
        passedCount,
        failedCount,
        results,
        durationMs
    };
}
