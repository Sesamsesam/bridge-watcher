/**
 * Runner types - Interface for command execution backends
 */

export interface RunnerOpts {
    /** Path to workspace being operated on */
    wsPath: string;
    /** Environment variables to pass through (allowlisted) */
    env?: Record<string, string>;
    /** Timeout in milliseconds */
    timeoutMs?: number;
    /** Working directory inside the container/workspace */
    cwd?: string;
}

export interface RunResult {
    /** Exit code (0 = success) */
    exitCode: number;
    /** Standard output */
    stdout: string;
    /** Standard error */
    stderr: string;
    /** Whether the command timed out */
    timedOut: boolean;
    /** Duration in milliseconds */
    durationMs: number;
}

export interface Runner {
    /** Execute a command */
    run(cmd: string, args: string[], opts: RunnerOpts): Promise<RunResult>;

    /** Name of this runner for logging */
    readonly name: string;

    /** Whether this runner is secure (Docker) or not (Local) */
    readonly isSecure: boolean;
}

/** Default timeout for commands */
export const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/** Allowlisted environment variables that can be passed to runners */
export const ALLOWED_ENV_VARS = [
    'CI',
    'NODE_ENV',
    'HOME',
    'PATH',
    'TERM',
    'LANG',
    'LC_ALL',
    'TZ'
];

/**
 * Filter environment variables to only allowed ones
 */
export function filterEnv(env: Record<string, string | undefined>): Record<string, string> {
    const filtered: Record<string, string> = {};
    for (const key of ALLOWED_ENV_VARS) {
        if (env[key]) {
            filtered[key] = env[key] as string;
        }
    }
    return filtered;
}
