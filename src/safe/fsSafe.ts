/**
 * fsSafe - Safe filesystem operations
 * 
 * Security properties:
 * - O_NOFOLLOW for reads (atomic symlink protection)
 * - Parent-chain symlink validation for writes
 * - Path confinement: All paths must resolve inside allowed root
 * - Atomic writes via temp + rename
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';

const O_NOFOLLOW = 0x0100; // Linux/macOS

export class PathEscapeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PathEscapeError';
    }
}

export class SymlinkError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SymlinkError';
    }
}

export const fsSafe = {
    /**
     * Check if a path is contained within a root directory.
     * Resolves both paths and compares.
     */
    isContained(filePath: string, root: string): boolean {
        const resolvedPath = path.resolve(filePath);
        const resolvedRoot = path.resolve(root);
        return resolvedPath.startsWith(resolvedRoot + path.sep) || resolvedPath === resolvedRoot;
    },

    /**
     * Validate that no component in the parent chain is a symlink.
     * This prevents TOCTOU attacks where a directory is swapped with a symlink.
     */
    async validateParentChain(filePath: string, root: string): Promise<void> {
        const resolvedPath = path.resolve(filePath);
        const resolvedRoot = path.resolve(root);

        if (!fsSafe.isContained(resolvedPath, resolvedRoot)) {
            throw new PathEscapeError(`Path ${filePath} escapes root ${root}`);
        }

        // Check each component from root to target
        let current = resolvedRoot;
        const relativePath = path.relative(resolvedRoot, resolvedPath);
        const components = relativePath.split(path.sep).filter(Boolean);

        for (const component of components) {
            current = path.join(current, component);

            try {
                const stats = await fs.promises.lstat(current);
                if (stats.isSymbolicLink()) {
                    throw new SymlinkError(`Symlink detected in parent chain: ${current}`);
                }
            } catch (err) {
                // If file doesn't exist yet, that's fine (for writes)
                if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
                    throw err;
                }
                break;
            }
        }
    },

    /**
     * Read file with O_NOFOLLOW protection.
     * Throws if the path is a symlink.
     */
    async read(filePath: string, root: string): Promise<string> {
        const resolvedPath = path.resolve(filePath);

        if (!fsSafe.isContained(resolvedPath, root)) {
            throw new PathEscapeError(`Path ${filePath} escapes root ${root}`);
        }

        // First check if it's a symlink
        const stats = await fs.promises.lstat(resolvedPath);
        if (stats.isSymbolicLink()) {
            throw new SymlinkError(`Cannot read symlink: ${filePath}`);
        }

        // Open with O_NOFOLLOW for atomic symlink protection
        const fd = await fs.promises.open(resolvedPath, fs.constants.O_RDONLY | O_NOFOLLOW);
        try {
            const content = await fd.readFile({ encoding: 'utf-8' });
            return content;
        } finally {
            await fd.close();
        }
    },

    /**
     * Write file atomically with parent chain validation.
     * Uses temp file + rename pattern to ensure atomicity.
     */
    async writeAtomic(filePath: string, content: string, root: string): Promise<void> {
        const resolvedPath = path.resolve(filePath);

        if (!fsSafe.isContained(resolvedPath, root)) {
            throw new PathEscapeError(`Path ${filePath} escapes root ${root}`);
        }

        // Validate no symlinks in parent chain
        await fsSafe.validateParentChain(filePath, root);

        // Ensure parent directory exists
        const dir = path.dirname(resolvedPath);
        await fs.promises.mkdir(dir, { recursive: true });

        // Write to temp file, then rename atomically
        const tmpName = `${resolvedPath}.${randomBytes(8).toString('hex')}.tmp`;

        try {
            await fs.promises.writeFile(tmpName, content, { encoding: 'utf-8', mode: 0o644 });
            await fs.promises.rename(tmpName, resolvedPath);
        } catch (err) {
            // Clean up temp file if rename failed
            try {
                await fs.promises.unlink(tmpName);
            } catch {
                // Ignore cleanup errors
            }
            throw err;
        }
    },

    /**
     * Delete a file safely within the confined root.
     */
    async unlink(filePath: string, root: string): Promise<void> {
        const resolvedPath = path.resolve(filePath);

        if (!fsSafe.isContained(resolvedPath, root)) {
            throw new PathEscapeError(`Path ${filePath} escapes root ${root}`);
        }

        await fsSafe.validateParentChain(filePath, root);
        await fs.promises.unlink(resolvedPath);
    },

    /**
     * Create a directory safely within the confined root.
     */
    async mkdir(dirPath: string, root: string): Promise<void> {
        const resolvedPath = path.resolve(dirPath);

        if (!fsSafe.isContained(resolvedPath, root)) {
            throw new PathEscapeError(`Path ${dirPath} escapes root ${root}`);
        }

        await fsSafe.validateParentChain(dirPath, root);
        await fs.promises.mkdir(resolvedPath, { recursive: true });
    },

    /**
     * Remove a directory recursively, but only within the confined root.
     */
    async rmdir(dirPath: string, root: string): Promise<void> {
        const resolvedPath = path.resolve(dirPath);

        if (!fsSafe.isContained(resolvedPath, root)) {
            throw new PathEscapeError(`Path ${dirPath} escapes root ${root}`);
        }

        await fsSafe.validateParentChain(dirPath, root);
        await fs.promises.rm(resolvedPath, { recursive: true, force: true });
    },

    /**
     * Check if a path exists within the confined root.
     */
    async exists(filePath: string, root: string): Promise<boolean> {
        const resolvedPath = path.resolve(filePath);

        if (!fsSafe.isContained(resolvedPath, root)) {
            throw new PathEscapeError(`Path ${filePath} escapes root ${root}`);
        }

        try {
            await fs.promises.access(resolvedPath);
            return true;
        } catch {
            return false;
        }
    },

    /**
     * List directory contents safely.
     */
    async readdir(dirPath: string, root: string): Promise<string[]> {
        const resolvedPath = path.resolve(dirPath);

        if (!fsSafe.isContained(resolvedPath, root)) {
            throw new PathEscapeError(`Path ${dirPath} escapes root ${root}`);
        }

        return fs.promises.readdir(resolvedPath);
    }
};
