#!/usr/bin/env bun
/**
 * Bridge Watcher CLI
 * 
 * Commands:
 * - bridge init [--repo <path>]  - Initialize .ai-handoff in a repo
 * - bridge run [--repo <path>]   - Start the watcher loop
 * - bridge harness [--repo <path>] - Run security harness tests
 */

import * as path from 'node:path';
import { WatcherLoop } from './watcher/index.js';
import { runHarness } from './harness/index.js';

const VERSION = '0.1.0';

function printUsage(): void {
    console.log(`
Bridge Watcher v${VERSION}
Production-grade orchestration engine for AI-assisted development

USAGE:
  bridge <command> [options]

COMMANDS:
  init      Initialize .ai-handoff directory in a repository
  run       Start the watcher loop (processes tasks)
  harness   Run adversarial security tests

OPTIONS:
  --repo <path>    Path to target repository (default: current directory)
  --help           Show this help message
  --version        Show version

EXAMPLES:
  bridge init --repo ~/dev/my-app
  bridge run --repo ~/dev/my-app
  bridge harness

SECURITY:
  All untrusted code runs inside Docker with:
    --network=none    (no exfiltration)
    --read-only       (container filesystem)
    --cap-drop=ALL    (minimal privileges)
`);
}

function parseArgs(args: string[]): { command: string; repo: string } {
    let command = '';
    let repo = process.cwd();

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--help' || arg === '-h') {
            printUsage();
            process.exit(0);
        }

        if (arg === '--version' || arg === '-v') {
            console.log(`bridge-watcher v${VERSION}`);
            process.exit(0);
        }

        if (arg === '--repo' || arg === '-r') {
            repo = args[++i] || process.cwd();
            continue;
        }

        if (!arg.startsWith('-') && !command) {
            command = arg;
        }
    }

    return { command, repo: path.resolve(repo) };
}

async function main(): Promise<void> {
    const { command, repo } = parseArgs(process.argv.slice(2));

    if (!command) {
        printUsage();
        process.exit(1);
    }

    switch (command) {
        case 'init': {
            console.log(`Initializing Bridge Watcher in: ${repo}`);
            const watcher = new WatcherLoop({ repoPath: repo });
            await watcher.init();
            console.log('✅ .ai-handoff directory created');
            console.log('✅ .gitignore updated');
            console.log('\nNext steps:');
            console.log('  1. Build Docker image: docker build -t bridge-runner:dev .');
            console.log('  2. Run harness: bridge harness --repo ' + repo);
            console.log('  3. Start watcher: bridge run --repo ' + repo);
            break;
        }

        case 'run': {
            console.log(`Starting Bridge Watcher for: ${repo}`);
            const watcher = new WatcherLoop({ repoPath: repo });

            // Handle graceful shutdown
            process.on('SIGINT', () => {
                console.log('\nShutting down...');
                watcher.stop();
            });
            process.on('SIGTERM', () => {
                watcher.stop();
            });

            await watcher.run();
            break;
        }

        case 'harness': {
            const result = await runHarness(repo);
            process.exit(result.passed ? 0 : 1);
        }

        default:
            console.error(`Unknown command: ${command}`);
            printUsage();
            process.exit(1);
    }
}

main().catch((err) => {
    console.error('Fatal error:', err.message);
    process.exit(1);
});
