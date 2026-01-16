/**
 * Task schema and validation
 * 
 * Defines the structure of task JSON files that drive the watcher.
 */

import { fsSafe } from '../safe/index.js';
import * as path from 'node:path';

export interface Task {
    /** Unique task ID (usually UUID) */
    id: string;
    /** Task creation timestamp (ISO 8601) */
    created: string;
    /** Human-readable task title */
    title: string;
    /** Detailed prompt for the AI executor */
    prompt: string;
    /** Files/directories in scope for this task */
    scope: string[];
    /** Verification commands to run after editing */
    verify: VerifyCommand[];
    /** Optional metadata */
    meta?: Record<string, unknown>;
}

export interface VerifyCommand {
    /** Command to run */
    cmd: string;
    /** Arguments */
    args: string[];
    /** Expected exit code (default: 0) */
    expectedExit?: number;
    /** Timeout in seconds (default: 60) */
    timeoutSec?: number;
}

export class TaskValidationError extends Error {
    constructor(message: string, public readonly field?: string) {
        super(message);
        this.name = 'TaskValidationError';
    }
}

/**
 * Validate a task object
 */
export function validateTask(obj: unknown): Task {
    if (!obj || typeof obj !== 'object') {
        throw new TaskValidationError('Task must be an object');
    }

    const task = obj as Record<string, unknown>;

    // Required fields
    if (typeof task.id !== 'string' || !task.id) {
        throw new TaskValidationError('Task must have a non-empty string id', 'id');
    }
    if (typeof task.created !== 'string' || !task.created) {
        throw new TaskValidationError('Task must have a created timestamp', 'created');
    }
    if (typeof task.title !== 'string' || !task.title) {
        throw new TaskValidationError('Task must have a title', 'title');
    }
    if (typeof task.prompt !== 'string' || !task.prompt) {
        throw new TaskValidationError('Task must have a prompt', 'prompt');
    }
    if (!Array.isArray(task.scope)) {
        throw new TaskValidationError('Task must have a scope array', 'scope');
    }
    if (!Array.isArray(task.verify)) {
        throw new TaskValidationError('Task must have a verify array', 'verify');
    }

    // Validate scope items
    for (const s of task.scope) {
        if (typeof s !== 'string') {
            throw new TaskValidationError('Scope items must be strings', 'scope');
        }
    }

    // Validate verify commands
    for (const v of task.verify) {
        if (!v || typeof v !== 'object') {
            throw new TaskValidationError('Verify commands must be objects', 'verify');
        }
        const verify = v as Record<string, unknown>;
        if (typeof verify.cmd !== 'string') {
            throw new TaskValidationError('Verify command must have cmd string', 'verify.cmd');
        }
        if (!Array.isArray(verify.args)) {
            throw new TaskValidationError('Verify command must have args array', 'verify.args');
        }
    }

    return task as unknown as Task;
}

/**
 * Load a task from a JSON file
 */
export async function loadTask(filePath: string, root: string): Promise<Task> {
    const content = await fsSafe.read(filePath, root);
    const obj = JSON.parse(content);
    return validateTask(obj);
}

/**
 * Load all tasks from a directory
 */
export async function loadTasks(tasksDir: string, root: string): Promise<Task[]> {
    const files = await fsSafe.readdir(tasksDir, root);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    const tasks: Task[] = [];
    for (const file of jsonFiles) {
        const fullPath = path.join(tasksDir, file);
        try {
            const task = await loadTask(fullPath, root);
            tasks.push(task);
        } catch (err) {
            // Log but continue with other tasks
            console.error(`Failed to load task ${file}:`, err);
        }
    }

    // Sort by creation date (oldest first)
    tasks.sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime());

    return tasks;
}

/**
 * Generate a task ID
 */
export function generateTaskId(): string {
    return `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
