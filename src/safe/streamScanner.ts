/**
 * StreamScanner - Overlap-aware secret pattern scanner
 * 
 * Security properties:
 * - 8KB overlap buffer to catch patterns spanning chunk boundaries
 * - Core secret patterns always active
 * - Returns pattern name only (never raw secrets) for safe incident reporting
 */

export interface ScanMatch {
    pattern: string;  // Pattern name (e.g., "BEARER_TOKEN"), NOT the secret itself
    line: number;
    column: number;
}

export interface ScanResult {
    matches: ScanMatch[];
    hasSecrets: boolean;
}

// Core secret patterns from BLUEPRINT.md
const CORE_PATTERNS: Array<{ name: string; regex: RegExp }> = [
    {
        name: 'BEARER_TOKEN',
        regex: /Bearer\s+[A-Za-z0-9\-_.]+/g
    },
    {
        name: 'OPENAI_KEY',
        regex: /sk-[A-Za-z0-9]{10,}/g
    },
    {
        name: 'GOOGLE_API_KEY',
        regex: /AIza[0-9A-Za-z\-_]{20,}/g
    },
    {
        name: 'GITHUB_PAT',
        regex: /ghp_[A-Za-z0-9]{36}/g
    },
    {
        name: 'GITHUB_PAT_FINE',
        regex: /github_pat_[A-Za-z0-9_]{22,}/g
    },
    {
        name: 'AWS_ACCESS_KEY',
        regex: /AKIA[A-Z0-9]{16}/g
    },
    {
        name: 'PRIVATE_KEY',
        regex: /-----BEGIN.*PRIVATE KEY-----/g
    },
    {
        name: 'URL_WITH_CREDS',
        regex: /https?:\/\/[^:\s]+:[^@\s]+@/g
    }
];

const OVERLAP_BUFFER_SIZE = 8 * 1024; // 8KB

export class StreamScanner {
    private overlapBuffer: string = '';
    private patterns: Array<{ name: string; regex: RegExp }>;
    private totalLines: number = 0;

    constructor(additionalPatterns: Array<{ name: string; pattern: string }> = []) {
        // Clone core patterns (need fresh regex objects for stateful matching)
        this.patterns = CORE_PATTERNS.map(p => ({
            name: p.name,
            regex: new RegExp(p.regex.source, p.regex.flags)
        }));

        // Add any additional patterns
        for (const p of additionalPatterns) {
            this.patterns.push({
                name: p.name,
                regex: new RegExp(p.pattern, 'g')
            });
        }
    }

    /**
     * Find all matches in a string, returning positions relative to the start
     */
    private findMatches(text: string, lineOffset: number): ScanMatch[] {
        const matches: ScanMatch[] = [];

        for (const pattern of this.patterns) {
            pattern.regex.lastIndex = 0;
            let match: RegExpExecArray | null;

            while ((match = pattern.regex.exec(text)) !== null) {
                // Calculate line and column from position
                const beforeMatch = text.slice(0, match.index);
                const lines = beforeMatch.split('\n');
                const lineInChunk = lines.length - 1;
                const column = lines[lines.length - 1].length;

                matches.push({
                    pattern: pattern.name,
                    line: lineOffset + lineInChunk + 1, // 1-indexed
                    column: column + 1 // 1-indexed
                });
            }
        }

        return matches;
    }

    /**
     * Count newlines in a string
     */
    private countNewlines(text: string): number {
        let count = 0;
        for (const char of text) {
            if (char === '\n') count++;
        }
        return count;
    }

    /**
     * Scan a chunk of text for secrets.
     * Maintains an overlap buffer to catch patterns spanning chunk boundaries.
     */
    scan(chunk: string): ScanResult {
        // Combine overlap buffer with new chunk
        const combined = this.overlapBuffer + chunk;

        // Calculate line offset based on what we've processed
        const lineOffset = this.totalLines;

        // Find all matches in combined text
        const matches = this.findMatches(combined, lineOffset);

        // Update line counter for next chunk
        // Only count lines in the new chunk (overlap buffer lines already counted)
        const newLinesInChunk = this.countNewlines(chunk);
        this.totalLines += newLinesInChunk;

        // Keep last OVERLAP_BUFFER_SIZE characters as overlap for next chunk
        if (combined.length > OVERLAP_BUFFER_SIZE) {
            this.overlapBuffer = combined.slice(-OVERLAP_BUFFER_SIZE);
        } else {
            this.overlapBuffer = combined;
        }

        // Filter matches to only those in the new content (not in overlap from previous scan)
        // This prevents duplicate reporting
        const overlapLines = this.countNewlines(this.overlapBuffer);
        const relevantMatches = matches.filter(m => m.line > lineOffset - overlapLines);

        return {
            matches: relevantMatches,
            hasSecrets: relevantMatches.length > 0
        };
    }

    /**
     * Finalize scanning - check any remaining content in overlap buffer.
     * Call this when done processing all chunks.
     */
    finalize(): ScanResult {
        if (this.overlapBuffer.length === 0) {
            return { matches: [], hasSecrets: false };
        }

        // Create a fresh scan with just the remaining buffer
        // This catches any patterns that might only appear at the very end
        const matches = this.findMatches(this.overlapBuffer, this.totalLines);

        // Clear the buffer
        this.overlapBuffer = '';

        return {
            matches,
            hasSecrets: matches.length > 0
        };
    }

    /**
     * Scan an entire string at once (convenience method).
     * Use this for small strings where streaming isn't needed.
     */
    static scanString(text: string): ScanResult {
        const scanner = new StreamScanner();
        const result = scanner.scan(text);
        const finalResult = scanner.finalize();

        return {
            matches: [...result.matches, ...finalResult.matches],
            hasSecrets: result.hasSecrets || finalResult.hasSecrets
        };
    }

    /**
     * Quick check if a string contains any secrets.
     * Use for fast boolean checks.
     */
    static containsSecrets(text: string): boolean {
        return StreamScanner.scanString(text).hasSecrets;
    }
}

export { CORE_PATTERNS };
