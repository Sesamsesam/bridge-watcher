# V0 Implementation - Core & Harness

**Status**: ✅ COMPLETE | **Verified**: 2026-01-17

> V0 establishes the security foundation with safe wrappers, Docker runner, and adversarial harness.

---

## Overview

| Metric | Value |
|--------|-------|
| **Lines of Code** | ~500 |
| **Files Created** | 12 |
| **Harness Tests** | 6/6 passing |

---

## Components Built

### 1. Safe Wrappers (`src/safe/`)

#### `fsSafe.ts` - Safe Filesystem Operations
```typescript
fsSafe.read(root, relativePath)      // O_NOFOLLOW read
fsSafe.writeAtomic(root, path, data) // Atomic write with parent validation
fsSafe.isContained(path, root)       // Path confinement check
fsSafe.validateParentChain(path)     // Symlink-in-parent detection
```

**Security Properties:**
- `O_NOFOLLOW` flag prevents following symlinks during read
- Parent chain validation catches symlinks in directory path
- Atomic writes via temp file + rename
- All paths must resolve inside allowed root

#### `gitSafe.ts` - Safe Git Operations
```typescript
gitSafe.create(wsPath)               // Create safe simple-git instance
gitSafe.status(wsPath)               // Get structured status
gitSafe.diff(wsPath)                 // Get diff (size-limited)
```

**Security Properties:**
- `core.hooksPath=/dev/null` on every command
- Timeouts enforced
- Working directory confinement

#### `StreamScanner.ts` - Secret Detection
```typescript
const scanner = new StreamScanner();
scanner.scan(chunk);                 // Scan with overlap buffer
scanner.finalize();                  // Check remaining buffer
```

**Security Properties:**
- 8KB overlap buffer catches secrets spanning chunk boundaries
- 8 core secret patterns (Bearer, API keys, private keys, etc.)
- Returns pattern name and position, NOT the secret itself

---

### 2. Docker Runner (`src/runner/`)

#### `dockerRunner.ts`
```typescript
const runner = new DockerRunner();
runner.run(cmd, args, { wsPath, timeoutMs });
```

**Docker Flags:**
```bash
--network=none              # No exfiltration
--read-only                 # Container FS immutable
--cap-drop=ALL              # Minimal capabilities
--security-opt=no-new-privileges:true
--pids-limit=256            # Fork bomb protection
--memory=2g                 # Memory limit
--cpus=2                    # CPU limit
--user $(id -u):$(id -g)    # Non-root
--tmpfs /tmp:rw,noexec      # Writable /tmp, no exec
```

#### `types.ts`
- `Runner` interface
- `RunnerOpts` and `RunResult` types
- `ALLOWED_ENV_VARS` whitelist

---

### 3. Harness Tests (`src/harness/`)

| Test | File | What It Proves |
|------|------|----------------|
| Symlink Race | `symlink-race.ts` | `O_NOFOLLOW` blocks TOCTOU attacks |
| Untracked Secret | `untracked-secret.ts` | `?? newfile` with secret is detected |
| Overlap Leak | `overlap-leak.ts` | Secrets spanning chunks are caught |
| Delete Escape | `delete-escape.ts` | Cannot delete outside allowed dir |
| Hook Trap | `hook-trap.ts` | Git hooks don't execute |
| Exfil Attempt | `exfil-attempt.ts` | `--network=none` blocks all network |

---

### 4. CLI (`src/cli.ts`)

```bash
bridge init [--repo <path>]   # Initialize .ai-handoff/ structure
bridge run [--repo <path>]    # Run watcher loop (stub in V0)
bridge harness [--repo <path>] # Run security harness
```

---

### 5. Dockerfile

```dockerfile
FROM oven/bun:latest
# Non-root user (bun user UID 1000)
WORKDIR /workspace
CMD ["bun", "--version"]
```

---

## File Structure

```
bridge-watcher/
├── src/
│   ├── cli.ts                      # CLI entrypoint
│   ├── safe/
│   │   ├── index.ts
│   │   ├── fsSafe.ts               # O_NOFOLLOW, atomic writes
│   │   ├── gitSafe.ts              # Hooks disabled, timeouts
│   │   └── StreamScanner.ts        # Overlap-aware secret scanner
│   ├── runner/
│   │   ├── index.ts
│   │   ├── types.ts                # Runner interface
│   │   └── dockerRunner.ts         # Docker execution
│   ├── harness/
│   │   ├── index.ts                # Harness runner
│   │   └── tests/
│   │       ├── symlink-race.ts
│   │       ├── untracked-secret.ts
│   │       ├── overlap-leak.ts
│   │       ├── delete-escape.ts
│   │       ├── hook-trap.ts
│   │       └── exfil-attempt.ts
│   └── watcher/
│       └── loop.ts                 # Stub (V1)
├── Dockerfile
├── package.json
└── tsconfig.json
```

---

## Verification Results

```
✅ TypeScript compiles (tsc --noEmit)
✅ Docker image builds (bridge-runner:dev)
✅ 6/6 harness tests pass
```

---

## Dependencies

```json
{
  "dependencies": {
    "simple-git": "^3.27.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.7",
    "typescript": "^5.0.0"
  }
}
```

---

## What V0 Does NOT Include

- [ ] Full watcher loop (stub only)
- [ ] Task processing
- [ ] Result writing
- [ ] Exception logic
- [ ] Crash recovery
- [ ] gitleaks integration

These are V1+ features.
