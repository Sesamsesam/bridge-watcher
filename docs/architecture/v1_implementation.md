# V1 Implementation Plan - The Guard

**Status**: 📋 REVISED | **Target Lines**: ~450 additional (950 total)

> V1 implements the full watcher loop with task processing, result writing, and protocol compliance.

---

## Revision Notes

This plan was reviewed by a secondary model. Key changes:
- Lock naming aligned with protocol (`__worker__.lock`)
- Result schema matches protocol (exit_path, reason)
- Added per-task locks (basic, TTL recovery still V1.5)
- Added log caps (10KB per command output)
- Added dirty repo block + auto-branch
- Added scope enforcement via diff check

---

## Prerequisites

- [x] V0 complete and verified (6/6 harness tests pass)
- [x] Secondary review completed
- [ ] Read this plan before starting

---

## Goals

1. **Full watcher loop** - Process tasks from `.ai-handoff/tasks/`
2. **Protocol-compliant results** - Match BLUEPRINT result schema
3. **Safety checks** - Dirty block, auto-branch, scope enforcement
4. **Secretless contract** - Block `.env` creation, redact secrets
5. **Basic locking** - Worker lock + per-task locks

---

## Components to Build

### 1. Task Schema (`src/watcher/task.ts`)

**Purpose:** Validate incoming task JSON files

```typescript
interface Task {
  id: string;                    // e.g., "2026-01-17_01_fix-bug"
  prompt: string;                // Instructions for OpenCode
  scope: string[];               // Files allowed to modify
  commands_to_run: string[];     // Verification commands (allowlisted)
  priority?: number;             // Optional ordering
  timeout_sec?: number;          // Optional timeout override
  stop_on_failure?: boolean;     // Default: true (protocol default)
}

function validateTask(data: unknown): Task | null;
function loadTask(taskPath: string): Promise<Task | null>;
```

**File:** `src/watcher/task.ts` (~50 lines)

---

### 2. Result Schema (`src/watcher/result.ts`)

**Purpose:** Write protocol-compliant results

```typescript
// Aligned with 30_The_Bridge_Protocol.md
interface Result {
  // Core identity
  task_id: string;
  task_snapshot: Task;           // Full task for audit
  
  // Status (protocol enum)
  status: 'success' | 'failed' | 'error';
  exit_path: 
    | 'completed_success'
    | 'completed_failed'
    | 'worker_locked'
    | 'schema_invalid'
    | 'idempotent_skip'
    | 'branch_checkout_failed'
    | 'opencode_timeout'
    | 'opencode_crashed'
    | 'verify_failed'
    | 'secret_detected'
    | 'internal_error';
  reason: string;                // Human-readable explanation
  
  // Timing
  started_at: string;            // ISO-8601
  completed_at: string;
  duration_ms: number;
  
  // Verification
  verification: {
    commands: Array<{
      cmd: string;
      exit_code: number;
      stdout_truncated: boolean;
      stderr_truncated: boolean;
    }>;
    all_passed: boolean;
  };
  
  // Artifacts (pointers to log files)
  artifacts: {
    log_path: string | null;     // .ai-handoff/logs/{id}.log (redacted)
    patch_path: string | null;   // .ai-handoff/patches/{id}.patch
  };
  
  // Git state
  git: {
    branch: string;
    commit_before: string;
    commit_after: string | null;
    files_changed: string[];
  };
  
  // Secret handling
  secret_incident?: {
    pattern: string;
    location: string;            // file:line (no raw secret)
    action: 'worktree_deleted';
  };
}

function writeResult(resultDir: string, result: Result): Promise<void>;
```

**Log Cap Rule:** Each command's stdout/stderr capped at 10KB. If truncated, write full redacted log to `.ai-handoff/logs/{id}_{cmd_index}.log`.

**File:** `src/watcher/result.ts` (~80 lines)

---

### 3. Watcher Loop (`src/watcher/loop.ts`)

**Purpose:** Main orchestration loop (protocol-aligned)

```typescript
async function runWatcherLoop(config: WatcherConfig): Promise<void>;

interface WatcherConfig {
  repoPath: string;
  runner: Runner;
  pollIntervalMs: number;        // Default: 1000
  oneShot: boolean;              // Process once and exit
  stopOnFailure: boolean;        // Default: true (protocol)
}
```

**Loop Steps (Protocol-Aligned):**

```
1. Acquire worker lock (.ai-handoff/locks/__worker__.lock)
2. SAFETY CHECK: Is repo dirty? If yes, ABORT with result
3. List tasks in .ai-handoff/tasks/
4. For each task (sorted by priority, then age):
   a. Validate task schema → write result on failure
   b. Check idempotency (skip if result exists)
   c. Acquire per-task lock (.ai-handoff/locks/{id}.lock)
   d. Move task to .ai-handoff/running/ (atomic)
   e. SAFETY CHECK: If on main, checkout feat/ai/{id}
   f. Create worktree (git worktree add) → write result on failure
   g. Invoke OpenCode (placeholder in V1 - echo prompt)
   h. Run verification commands via Runner (with 10KB cap)
   i. SCOPE CHECK: Compare diff to allowed scope → fail if out-of-scope
   j. Scan all outputs with StreamScanner
   k. If secret detected: DELETE worktree, write incident result
   l. Write result to .ai-handoff/results/
   m. Write patch to .ai-handoff/patches/{id}.patch
   n. Cleanup worktree
   o. Delete task file + release per-task lock
   p. If stopOnFailure && !success: STOP loop
5. If oneShot, exit; else sleep and repeat
6. Release worker lock on shutdown
```

**File:** `src/watcher/loop.ts` (~200 lines)

---

### 4. Locking (`src/watcher/lock.ts`)

**Purpose:** Worker lock + per-task locks

```typescript
// Worker lock (only one watcher runs)
const WORKER_LOCK = '__worker__.lock';  // Protocol naming

// Per-task lock (prevents duplicate processing)
const TASK_LOCK_PREFIX = '';  // locks/{id}.lock

interface LockMetadata {
  pid: number;
  host: string;
  created_at: string;
  task_id?: string;              // For per-task locks
  timeout_sec?: number;          // For TTL (V1.5 full implementation)
}

async function acquireWorkerLock(lockDir: string): Promise<boolean>;
async function releaseWorkerLock(lockDir: string): Promise<void>;
async function acquireTaskLock(lockDir: string, taskId: string): Promise<boolean>;
async function releaseTaskLock(lockDir: string, taskId: string): Promise<void>;
```

**File:** `src/watcher/lock.ts` (~70 lines)

---

### 5. Safety Checks (`src/watcher/safety.ts`)

**Purpose:** Pre-flight and in-flight safety checks

```typescript
// Dirty repo check
async function isRepoDirty(wsPath: string): Promise<boolean>;

// Auto-branch creation (if on main)
async function ensureTaskBranch(wsPath: string, taskId: string): Promise<string>;

// Scope enforcement
async function validateScope(
  wsPath: string, 
  allowedFiles: string[], 
  actualChanges: string[]
): Promise<{ passed: boolean; violations: string[] }>;

// Secretless contract
function isSecretFile(path: string): boolean;
async function validateNoSecretFiles(wsPath: string): Promise<string[]>;
```

**File:** `src/watcher/safety.ts` (~80 lines)

---

### 6. Log Capping (`src/watcher/logcap.ts`)

**Purpose:** Cap command output at 10KB, write overflow to files

```typescript
const MAX_OUTPUT_BYTES = 10 * 1024;  // 10KB

interface CappedOutput {
  content: string;               // First 10KB
  truncated: boolean;
  fullPath: string | null;       // Path to full log if truncated
}

async function capOutput(
  output: string,
  logDir: string,
  taskId: string,
  cmdIndex: number,
  stream: 'stdout' | 'stderr'
): Promise<CappedOutput>;
```

**File:** `src/watcher/logcap.ts` (~40 lines)

---

## Execution Order

| Step | Component | Dependencies | Lines |
|------|-----------|--------------|-------|
| 1 | `task.ts` | None | 50 |
| 2 | `logcap.ts` | None | 40 |
| 3 | `result.ts` | None | 80 |
| 4 | `lock.ts` | `fsSafe` | 70 |
| 5 | `safety.ts` | `gitSafe`, `fsSafe` | 80 |
| 6 | `loop.ts` | All above | 200 |
| 7 | CLI update | `loop.ts` | 20 |
| | **Total** | | **~540** |

---

## Files to Create/Modify

### New Files (6)

| File | Purpose | Lines |
|------|---------|-------|
| `src/watcher/task.ts` | Task schema + validation | ~50 |
| `src/watcher/result.ts` | Protocol-compliant results | ~80 |
| `src/watcher/lock.ts` | Worker + per-task locking | ~70 |
| `src/watcher/safety.ts` | Dirty check, scope, branch | ~80 |
| `src/watcher/logcap.ts` | 10KB output capping | ~40 |

### Modified Files (3)

| File | Changes |
|------|---------|
| `src/watcher/loop.ts` | Replace stub with full implementation |
| `src/watcher/index.ts` | Export new modules |
| `src/cli.ts` | Connect `bridge run` to real loop |

---

## Testing Strategy

### Harness Tests (Add 2 new)

| Test | What It Proves |
|------|----------------|
| **Task Lifecycle** | Full task → result flow works |
| **Scope Violation** | Out-of-scope changes blocked |

### Manual Verification

1. Dirty repo → result written with `exit_path: internal_error`
2. On main → auto-creates `feat/ai/{id}` branch
3. Secret in output → worktree deleted, incident result
4. Command output > 10KB → truncated, full log in file

---

## Verification Criteria

- [ ] `bridge run --one-shot` processes a task
- [ ] Result file matches protocol schema
- [ ] Lock files use protocol naming (`__worker__.lock`)
- [ ] Dirty repo blocked with result
- [ ] Auto-branch off main works
- [ ] Output capped at 10KB
- [ ] Scope violations detected
- [ ] 8/8 harness tests pass

---

## NOT in V1 (Deferred to V1.5)

- Lock TTL recovery (stale lock cleanup)
- Orphaned task recovery (startup sweep)
- Crash-in-progress recovery

---

## Estimated Effort

| Component | Lines | Complexity |
|-----------|-------|------------|
| task.ts | 50 | Low |
| logcap.ts | 40 | Low |
| result.ts | 80 | Medium |
| lock.ts | 70 | Medium |
| safety.ts | 80 | Medium |
| loop.ts | 200 | High |
| CLI updates | 20 | Low |
| **Total** | **~540** | |

---

## Ready to Begin?

Review this revised plan, then say "Proceed with V1" to start implementation.
