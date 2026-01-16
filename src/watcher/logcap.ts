/**
 * Log Capping Utility
 * 
 * Caps command output at 10KB per stream.
 * If truncated, writes full log to file.
 */

import { fsSafe, StreamScanner } from '../safe/index.js';
import * as path from 'node:path';

/** Maximum bytes per output stream */
export const MAX_OUTPUT_BYTES = 10 * 1024; // 10KB

export interface CappedOutput {
    /** Content (first 10KB) */
    content: string;
    /** Whether content was truncated */
    truncated: boolean;
    /** Path to full log file if truncated (null otherwise) */
    fullLogPath: string | null;
    /** Whether secrets were detected */
    secretsDetected: boolean;
    /** Number of secrets found */
    secretCount: number;
}

/**
 * Cap output from a command
 * 
 * Note: We detect secrets but don't attempt inline redaction since
 * ScanMatch only provides pattern name and position, not the raw match.
 * If secrets are detected, the task should be aborted entirely.
 * 
 * @param output - Raw output string
 * @param logDir - Directory to write full logs (.ai-handoff/logs/)
 * @param taskId - Task identifier
 * @param cmdIndex - Command index (for multiple commands)
 * @param stream - 'stdout' or 'stderr'
 * @param root - Root directory for safe file operations
 * @returns Capped output info
 */
export async function capOutput(
    output: string,
    logDir: string,
    taskId: string,
    cmdIndex: number,
    stream: 'stdout' | 'stderr',
    root: string
): Promise<CappedOutput> {
    // Scan for secrets
    const scanResult = StreamScanner.scanString(output);
    const secretsDetected = scanResult.hasSecrets;
    const secretCount = scanResult.matches.length;

    const outputBytes = Buffer.byteLength(output, 'utf8');
    const needsTruncation = outputBytes > MAX_OUTPUT_BYTES;

    let fullLogPath: string | null = null;
    let content: string;

    if (needsTruncation) {
        // Write full log to file
        const logFileName = `${taskId}_${cmdIndex}_${stream}.log`;
        fullLogPath = path.join(logDir, logFileName);

        await fsSafe.mkdir(root, logDir);
        await fsSafe.writeAtomic(root, fullLogPath, output);

        // Truncate for result
        content = output.slice(0, MAX_OUTPUT_BYTES);
        content += `\n\n[TRUNCATED - Full log: ${logFileName}]`;
    } else {
        content = output;
    }

    return {
        content,
        truncated: needsTruncation,
        fullLogPath,
        secretsDetected,
        secretCount,
    };
}

/**
 * Format output summary for display
 */
export function formatOutputSummary(output: CappedOutput): string {
    const lines = output.content.split('\n').length;
    const parts: string[] = [`${lines} lines`];

    if (output.truncated) {
        parts.push('(truncated)');
    }
    if (output.secretsDetected) {
        parts.push(`(${output.secretCount} secrets detected)`);
    }

    return parts.join(' ');
}
