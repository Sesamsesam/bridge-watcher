export { TaskValidationError, validateTask, loadTask, loadTasks, generateTaskId } from './task.js';
export type { Task, VerifyCommand } from './task.js';
export { writeResult, createSuccessResult, createFailedResult, createErrorResult, createSecretDetectedResult } from './result.js';
export type { Result, ResultStatus, VerifyResult, SecretIncident, ExitPath } from './result.js';
export { WatcherLoop } from './loop.js';
export type { WatcherConfig } from './loop.js';

// V1 additions
export { capOutput, formatOutputSummary, MAX_OUTPUT_BYTES } from './logcap.js';
export type { CappedOutput } from './logcap.js';
export { acquireWorkerLock, releaseWorkerLock, acquireTaskLock, releaseTaskLock, taskResultExists, WORKER_LOCK_FILE } from './lock.js';
export type { LockMetadata } from './lock.js';
export {
    isRepoDirty,
    getCurrentBranch,
    ensureTaskBranch,
    isSecretFile,
    findSecretFiles,
    validateScope,
    getChangedFiles,
    runPreflightChecks
} from './safety.js';
export type { PreflightResult } from './safety.js';
