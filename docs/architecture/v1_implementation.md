# V1 Implementation Plan - The Guard

**Status**: 📋 PLANNED | **Target Lines**: ~300 additional (800 total)

> V1 implements the full watcher loop with task processing, result writing, and secretless contract enforcement.

---

## Prerequisites

- [x] V0 complete and verified (6/6 harness tests pass)
- [ ] Read this plan before starting

---

## Goals

1. **Full watcher loop** - Process tasks from `.ai-handoff/tasks/`
2. **Result writing** - Write structured results with metadata
3. **Secretless contract** - Block `.env` creation, enforce patterns
4. **Exception logic** - Audited per-task exceptions (local only)

---

## Components to Build

### 1. Task Schema (`src/watcher/task.ts`)

**Purpose:** Validate incoming task JSON files

```typescript
interface Task {
  id: string;                    // e.g., "2026-01-17_01_fix-bug"
  prompt: string;                // Instructions for OpenCode
  scope: string[];               // Files allowed to modify
  commands_to_run: string[];     // Verification commands
  priority?: number;             // Optional ordering
  timeout_sec?: number;          // Optional timeout override
}

function validateTask(data: unknown): Task | null;
function loadTask(taskPath: string): Promise<Task | null>;
```

**File:** `src/watcher/task.ts` (~50 lines)

---

### 2. Result Schema (`src/watcher/result.ts`)

**Purpose:** Write structured results for each completed task

```typescript
interface Result {
  task_id: string;
  status: 'success' | 'failed' | 'error' | 'secret_detected';
  started_at: string;            // ISO-8601
  completed_at: string;
  duration_ms: number;
  verification: {
    commands: Array<{
      cmd: string;
      exit_code: number;
      stdout_lines: number;
      stderr_lines: number;
    }>;
    all_passed: boolean;
  };
  git: {
    branch: string;
    commit_before: string;
    commit_after: string | null;
    files_changed: string[];
  };
  error?: string;
  secret_incident?: {
    pattern: string;
    file: string;
    redacted: true;
  };
}

function writeResult(resultDir: string, result: Result): Promise<void>;
```

**File:** `src/watcher/result.ts` (~60 lines)

---

### 3. Watcher Loop (`src/watcher/loop.ts`)

**Purpose:** Main orchestration loop

```typescript
async function runWatcherLoop(config: WatcherConfig): Promise<void>;

interface WatcherConfig {
  repoPath: string;
  runner: Runner;
  pollIntervalMs: number;        // Default: 1000
  oneShot: boolean;              // Process once and exit
}
```

**Loop Steps:**

```
1. Acquire worker lock (.ai-handoff/locks/worker.lock)
2. List tasks in .ai-handoff/tasks/
3. For each task (sorted by priority, then age):
   a. Validate task schema
   b. Check idempotency (skip if result exists)
   c. Move task to .ai-handoff/running/
   d. Create worktree (git worktree add)
   e. Invoke OpenCode (placeholder in V1 - echo prompt)
   f. Run verification commands via Runner
   g. Scan all outputs with StreamScanner
   h. If secret detected: ABORT, write incident result
   i. Write result to .ai-handoff/results/
   j. Cleanup worktree
   k. Delete task file
4. If oneShot, exit; else sleep and repeat
5. Release worker lock on shutdown
```

**File:** `src/watcher/loop.ts` (~150 lines)

---

### 4. Secretless Contract (`src/safe/secretless.ts`)

**Purpose:** Block creation of `.env` files

```typescript
function isSecretFile(path: string): boolean;
function validateNoSecrets(wsPath: string): Promise<void>;
```

**Blocked patterns:**
- `.env`
- `.env.*` (except `.env.example`)
- `*.pem`, `*.key` (unless in allowed list)

**File:** `src/safe/secretless.ts` (~40 lines)

---

### 5. Worker Lock (`src/watcher/lock.ts`)

**Purpose:** Prevent multiple watchers from running

```typescript
interface LockMetadata {
  pid: number;
  host: string;
  created_at: string;
}

async function acquireWorkerLock(lockDir: string): Promise<boolean>;
async function releaseWorkerLock(lockDir: string): Promise<void>;
async function isLockValid(lockPath: string, maxAgeMs: number): Promise<boolean>;
```

**File:** `src/watcher/lock.ts` (~50 lines)

---

## Execution Order

| Step | Component | Dependencies |
|------|-----------|--------------|
| 1 | `task.ts` | None |
| 2 | `result.ts` | None |
| 3 | `lock.ts` | None |
| 4 | `secretless.ts` | `fsSafe` |
| 5 | `loop.ts` | All above + `Runner`, `StreamScanner` |
| 6 | CLI update | `loop.ts` |

---

## Files to Create/Modify

### New Files

| File | Purpose | Lines |
|------|---------|-------|
| `src/watcher/task.ts` | Task schema + validation | ~50 |
| `src/watcher/result.ts` | Result writing | ~60 |
| `src/watcher/lock.ts` | Worker locking | ~50 |
| `src/safe/secretless.ts` | Block .env creation | ~40 |

### Modified Files

| File | Changes |
|------|---------|
| `src/watcher/loop.ts` | Replace stub with full implementation |
| `src/watcher/index.ts` | Export new modules |
| `src/cli.ts` | Connect `bridge run` to real loop |

---

## Testing Strategy

### Unit Tests (Manual Verification)

1. **Task validation:**
   - Valid task loads correctly
   - Invalid task returns null

2. **Result writing:**
   - Result file created with correct structure
   - Timestamps are valid ISO-8601

3. **Secretless:**
   - `.env` creation blocked
   - `.env.example` allowed

### Integration Test (New Harness Test)

Add to harness: **Task Lifecycle Test**
- Create task file
- Run watcher in oneShot mode
- Verify result file created
- Verify task file deleted

---

## Verification Criteria

- [ ] `bridge run --one-shot` processes a task
- [ ] Result file written with correct schema
- [ ] `.env` creation blocked
- [ ] Secret in output triggers incident result
- [ ] 7/7 harness tests pass (existing 6 + lifecycle)

---

## NOT in V1 (Deferred to V1.5)

- Per-task locks with TTL
- Orphaned task recovery
- Stale lock recovery
- Crash cleanup

---

## Estimated Effort

| Component | Lines | Complexity |
|-----------|-------|------------|
| task.ts | 50 | Low |
| result.ts | 60 | Low |
| lock.ts | 50 | Medium |
| secretless.ts | 40 | Low |
| loop.ts | 150 | High |
| CLI updates | 20 | Low |
| **Total** | **~370** | |

---

## Ready to Begin?

Review this plan, then say "Proceed with V1" to start implementation.
