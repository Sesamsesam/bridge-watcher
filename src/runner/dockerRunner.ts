/**
 * DockerRunner - Secure command execution in Docker sandbox
 * 
 * Security properties:
 * - Network: none (prevents exfiltration)
 * - Read-only root filesystem
 * - cap-drop=ALL (minimal privileges)
 * - no-new-privileges
 * - Only workspace mounted at /workspace:rw
 * - Non-root user execution
 * - Resource limits (memory, CPU, PIDs)
 */

import { spawn } from 'node:child_process';
import { Runner, RunnerOpts, RunResult, DEFAULT_TIMEOUT_MS, filterEnv } from './types.js';

const DOCKER_IMAGE = 'bridge-runner:dev';

export class DockerRunner implements Runner {
    readonly name = 'DockerRunner';
    readonly isSecure = true;

    private readonly image: string;

    constructor(image: string = DOCKER_IMAGE) {
        this.image = image;
    }

    async run(cmd: string, args: string[], opts: RunnerOpts): Promise<RunResult> {
        const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        const startTime = Date.now();

        // Build Docker args according to BLUEPRINT.md Part 2
        const dockerArgs = [
            'run',
            '--rm',
            // Network isolation (prevents exfiltration)
            '--network=none',
            // Read-only container filesystem
            '--read-only',
            // Drop all capabilities
            '--cap-drop=ALL',
            // Prevent privilege escalation
            '--security-opt=no-new-privileges:true',
            // Resource limits
            '--pids-limit=256',
            '--memory=2g',
            '--cpus=2',
            // Run as current user
            '--user', `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
            // Mount workspace
            '-v', `${opts.wsPath}:/workspace:rw`,
            // Writable tmp with security restrictions
            '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=512m',
            // Working directory
            '-w', opts.cwd ? `/workspace/${opts.cwd}` : '/workspace',
            // Environment variables (filtered)
            ...this.buildEnvArgs(opts.env),
            // Image
            this.image,
            // Command and args
            cmd,
            ...args
        ];

        return this.spawn('docker', dockerArgs, timeoutMs, startTime);
    }

    private buildEnvArgs(env?: Record<string, string>): string[] {
        const envArgs: string[] = [];
        const filteredEnv = filterEnv(env ?? process.env);

        for (const [key, value] of Object.entries(filteredEnv)) {
            envArgs.push('-e', `${key}=${value}`);
        }

        return envArgs;
    }

    private spawn(
        command: string,
        args: string[],
        timeoutMs: number,
        startTime: number
    ): Promise<RunResult> {
        return new Promise((resolve) => {
            const stdout: Buffer[] = [];
            const stderr: Buffer[] = [];
            let timedOut = false;

            const proc = spawn(command, args, {
                stdio: ['ignore', 'pipe', 'pipe'],
                env: process.env
            });

            const timeout = setTimeout(() => {
                timedOut = true;
                proc.kill('SIGKILL');
            }, timeoutMs);

            proc.stdout?.on('data', (chunk: Buffer) => {
                stdout.push(chunk);
            });

            proc.stderr?.on('data', (chunk: Buffer) => {
                stderr.push(chunk);
            });

            proc.on('close', (code) => {
                clearTimeout(timeout);
                const durationMs = Date.now() - startTime;

                resolve({
                    exitCode: code ?? 1,
                    stdout: Buffer.concat(stdout).toString('utf-8'),
                    stderr: Buffer.concat(stderr).toString('utf-8'),
                    timedOut,
                    durationMs
                });
            });

            proc.on('error', (err) => {
                clearTimeout(timeout);
                const durationMs = Date.now() - startTime;

                resolve({
                    exitCode: 1,
                    stdout: '',
                    stderr: err.message,
                    timedOut: false,
                    durationMs
                });
            });
        });
    }
}

/**
 * Check if Docker is available on this system
 */
export async function isDockerAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
        const proc = spawn('docker', ['version'], {
            stdio: 'ignore'
        });

        proc.on('close', (code) => {
            resolve(code === 0);
        });

        proc.on('error', () => {
            resolve(false);
        });
    });
}

/**
 * Check if the bridge-runner image exists
 */
export async function isRunnerImageAvailable(image: string = DOCKER_IMAGE): Promise<boolean> {
    return new Promise((resolve) => {
        const proc = spawn('docker', ['image', 'inspect', image], {
            stdio: 'ignore'
        });

        proc.on('close', (code) => {
            resolve(code === 0);
        });

        proc.on('error', () => {
            resolve(false);
        });
    });
}
