# Bridge Watcher: Master Blueprint

> **This document captures the complete specification from the planning session.**
> **Any agent can follow this to build the system from scratch.**

---

## Executive Summary: Diamond Bridge Vision

**Purpose**: Build a production-grade, OSS-ready Bridge Watcher that is safe by default and requires zero human memory to operate securely.

### Core Promise

If you only ever run `bridge run`, the system will not:
- open inbound access to your machine,
- execute untrusted code directly on your host,
- leak secrets to disk or console,
- or allow tasks to escape the workspace.

### Architecture in One Sentence

Bridge is a **standalone tooling repo** that runs against **any app repo**, executes tasks in a **Docker sandbox**, and stores state in `.ai-handoff/` (always gitignored).

---

## Part 1: Repository Structure

### Two Separate Repos

| Repo | Purpose | Deploys To |
|------|---------|------------|
| `bridge-watcher/` | The Bridge CLI + Docker runner + harness | Never deployed (dev tool only) |
| `ai-foundations/` (or any app) | Your application | Cloudflare |

### Bridge Repo Layout

```
bridge-watcher/
├── src/
│   ├── cli.ts                 # CLI entrypoint (bridge init/run/harness)
│   ├── watcher/
│   │   ├── loop.ts            # Main task processing loop
│   │   ├── task.ts            # Task schema + validation
│   │   └── result.ts          # Result schema + writing
│   ├── safe/
│   │   ├── fsSafe.ts          # Safe filesystem operations
│   │   ├── gitSafe.ts         # Safe git operations
│   │   └── streamScanner.ts   # Overlap-aware secret scanner
│   ├── runner/
│   │   ├── types.ts           # Runner interface
│   │   └── dockerRunner.ts    # Docker execution backend
│   └── harness/
│       ├── index.ts           # Harness runner
│       └── tests/             # Individual adversarial tests
├── Dockerfile                 # Runner image: bridge-runner:dev
├── docs/
│   ├── rules/                 # Agent-facing rules
│   ├── guides/                # User-facing guides
│   └── architecture/          # System understanding
├── package.json
└── tsconfig.json
```

---

## Part 2: Safety Architecture (Layers)

### Layer 1: Golden Wrappers (Code Level)

**`fsSafe`** - All filesystem operations go through this.
- `O_NOFOLLOW` for reads (atomic symlink protection)
- Parent-chain symlink validation for writes
- Path confinement: All paths must resolve inside `worktreeRoot`
- Atomic writes via temp + rename

**`gitSafe`** - All git operations go through this.
- Enforces `-c core.hooksPath=/dev/null` on every call
- Enforces timeouts on every call
- Enforces `cwd` confinement to worktree
- Uses `simple-git` library for structured output

**`StreamScanner`** - All output scanning goes through this.
- Overlap buffer (8KB) to catch patterns across chunk boundaries
- Applied to: files, diffs, logs, stdout, stderr
- Contains secret patterns (8 core + optional extended)

### Layer 2: Runner Interface (Process Level)

```typescript
interface Runner {
  run(cmd: string, args: string[], opts: RunnerOpts): Promise<RunResult>;
}
```

**`DockerRunner`** (Default, Required)
- Executes commands inside ephemeral container
- Network: `none` (no exfiltration possible)
- Mounts: Only worktree at `/workspace:rw`
- Privileges: Minimal (cap-drop, no-new-privileges, non-root)

**`LocalRunner`** (Disabled by Default)
- Only available with `--i-accept-risk` flag
- Records `insecure_runner_used: true` in results
- Not allowed in CI

### Layer 3: Docker Container (OS Level)

```bash
docker run --rm \
  --network=none \
  --read-only \
  --cap-drop=ALL \
  --security-opt=no-new-privileges:true \
  --pids-limit=256 \
  --memory=2g \
  --cpus=2 \
  --user "$(id -u):$(id -g)" \
  -v "$WSPATH:/workspace:rw" \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=512m \
  -w /workspace \
  -e CI="$CI" \
  -e NODE_ENV="$NODE_ENV" \
  bridge-runner:dev \
  <command>
```

---

## Part 3: Secret Handling

### The "Secretless Contract"

1. `.env` is **gitignored** and **blocked from creation** by Bridge
2. `.env.example` is allowed (placeholders only)
3. Runtime secrets are injected via **environment variables only**
4. Environment variables are **allowlisted** (only pass what's needed)

### Secret Detection

**Core Patterns** (always active):
```
Bearer\s+[A-Za-z0-9\-_\.]+
sk-[A-Za-z0-9]{10,}
AIza[0-9A-Za-z\-_]{20,}
ghp_[A-Za-z0-9]{36}
github_pat_[A-Za-z0-9_]{22,}
AKIA[A-Z0-9]{16}
-----BEGIN.*PRIVATE KEY-----
https?://[^:]+:[^@]+@
```

### On Secret Detection

1. **Delete worktree immediately**
2. **Write safe incident record** (pattern name + file/line + hash, NO raw secret)
3. **Write NO logs, patches, or artifacts**

---

## Part 4: The Adversarial Harness

`bridge harness` must pass before the system is considered usable.

### Required Tests

| Test | What It Proves |
|------|----------------|
| **Symlink Race** | `O_NOFOLLOW` blocks file swap during read |
| **Untracked Secret** | `?? newfile` with secret is detected |
| **Overlap Leak** | Secret spanning chunk boundary is caught |
| **Delete Escape** | Cleanup cannot delete outside `.ai-handoff/tmp/` |
| **Hook Trap** | Git hooks do not run (core.hooksPath works) |
| **Exfil Attempt** | `curl`/`wget`/DNS fails with `--network=none` |

### Go/No-Go Criteria

- All 6 harness tests pass
- DockerRunner is the active runner
- No raw `fs`/`git` calls outside wrappers

---

## Part 5: CLI Commands

### `bridge init --repo <path>`

Creates `.ai-handoff/` skeleton in target repo:
```
.ai-handoff/
├── tasks/
├── running/
├── results/
├── patches/
├── logs/
├── locks/
├── tmp/
└── meta/
```

Updates target repo `.gitignore` to include:
```
.ai-handoff/
```

### `bridge run --repo <path>`

Runs the main watcher loop:
1. Acquire worker lock
2. For each task in `tasks/`:
   - Validate schema
   - Check idempotency
   - Create worktree
   - Run OpenCode (via Runner)
   - Run verification commands (via Runner)
   - Scan all outputs
   - Write result
   - Cleanup worktree
3. Release worker lock on shutdown

### `bridge harness --repo <path>`

Runs adversarial test suite. Fails if any test fails.

---

## Part 6: CI Policy

In CI environments (`CI=true`):

| Requirement | Enforcement |
|-------------|-------------|
| DockerRunner | Required |
| gitleaks | Required |
| Exceptions | Forbidden |
| Harness | Must pass on every PR |

---

## Part 7: Implementation Timeline

### V0: Core & Harness (~500 lines)

- [ ] `fsSafe` wrapper
- [ ] `gitSafe` wrapper
- [ ] `StreamScanner` with overlap
- [ ] `Runner` interface
- [ ] `DockerRunner` implementation
- [ ] Harness tests (1-6)
- [ ] CLI: `bridge init`, `bridge run`, `bridge harness`
- [ ] Dockerfile for `bridge-runner:dev`

### V1: The Guard (~800 lines)

- [ ] Exception logic (local only, audited)
- [ ] Secretless contract enforcement
- [ ] Full task loop with atomic moves
- [ ] Result writing with all metadata

### V1.5: Crash Recovery (~900 lines)

- [ ] Per-task locks with TTL
- [ ] Startup sweep for orphaned tasks
- [ ] Stale lock recovery

### V2: Polish (~1000 lines)

- [ ] Extended secret patterns
- [ ] gitleaks integration
- [ ] Module split for maintainability

---

## Part 8: Dependencies

```json
{
  "dependencies": {
    "simple-git": "^3.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "bun-types": "^1.0.0"
  }
}
```

**Docker Image Base**: `oven/bun:latest` or `node:20-alpine`

---

## Part 9: File-by-File Specification

### `src/safe/fsSafe.ts`

```typescript
export const fsSafe = {
  // Read file with O_NOFOLLOW
  async read(path: string): Promise<string>;
  
  // Write atomically with parent chain validation
  async writeAtomic(path: string, content: string): Promise<void>;
  
  // Check if path is inside allowed root
  isContained(path: string, root: string): boolean;
  
  // Validate no symlinks in parent chain
  async validateParentChain(path: string): Promise<void>;
};
```

### `src/safe/gitSafe.ts`

```typescript
export const gitSafe = {
  // Create simple-git instance with safety config
  create(wsPath: string): SimpleGit;
  
  // Get status (structured)
  async status(wsPath: string): Promise<StatusResult>;
  
  // Get diff (raw string, size-limited)
  async diff(wsPath: string): Promise<string>;
  
  // Create worktree
  async worktreeAdd(wsPath: string, branch: string): Promise<void>;
  
  // Remove worktree safely
  async worktreeRemove(wsPath: string): Promise<void>;
};
```

### `src/safe/streamScanner.ts`

```typescript
export class StreamScanner {
  private overlapBuffer: string = '';
  private readonly patterns: RegExp[];
  
  // Scan a chunk, maintaining overlap for boundary detection
  scan(chunk: string): ScanResult;
  
  // Finalize (scan remaining buffer)
  finalize(): ScanResult;
}
```

### `src/runner/dockerRunner.ts`

```typescript
export class DockerRunner implements Runner {
  async run(cmd: string, args: string[], opts: RunnerOpts): Promise<RunResult> {
    const dockerArgs = [
      'run', '--rm',
      '--network=none',
      '--read-only',
      '--cap-drop=ALL',
      '--security-opt=no-new-privileges:true',
      '-v', `${opts.wsPath}:/workspace:rw`,
      '--tmpfs', '/tmp:rw,noexec,nosuid,nodev',
      '-w', '/workspace',
      ...this.buildEnvArgs(opts.env),
      'bridge-runner:dev',
      cmd, ...args
    ];
    
    return this.spawn('docker', dockerArgs);
  }
}
```

---

## Part 10: Documentation Checklist

### Rules (Agent-Facing)

- [ ] `docs/rules/31_Secure_Watcher.md` - Canonical spec
- [ ] `docs/rules/32_Docker_Sandbox_Policy.md` - Docker flags
- [ ] `docs/rules/33_Repo_Separation.md` - Why separate repos
- [ ] `docs/rules/34_Diamond_Rules.md` - The 10 non-negotiables

### Guides (User-Facing)

- [ ] `docs/guides/00_GETTING_STARTED.md` - One-time setup
- [ ] `docs/guides/01_DAILY_WORKFLOW.md` - How to use daily
- [ ] `docs/guides/02_COMMANDS_REFERENCE.md` - All CLI commands
- [ ] `docs/guides/03_TROUBLESHOOTING.md` - Common errors

### Architecture (Understanding)

- [ ] `docs/architecture/ARCHITECTURE.md` - How parts connect
- [ ] `docs/architecture/GLOSSARY.md` - Term definitions
- [ ] `docs/architecture/DATA_FLOW.md` - What flows where

---

## Appendix A: The 10 Diamond Rules

1. **One command only**: `bridge run`
2. **No inbound exposure**: No servers, no ports
3. **Sandbox is mandatory**: Docker with `--network=none`
4. **Secrets never hit disk or console**: Buffer → Scan → Redact
5. **Secretless contract**: No `.env` in repo
6. **Worktree confinement**: All writes under `.ai-handoff/tmp/`
7. **No raw fs/git calls**: Only through wrappers
8. **Proof before progress**: Harness must pass
9. **CI is strict authority**: No exceptions allowed
10. **Separation of concerns**: Bridge repo ≠ App repo

---

## Appendix B: Glossary

| Term | Definition |
|------|------------|
| **Bridge** | The orchestration system that connects Antigravity (planner) to OpenCode (executor) |
| **Watcher** | The process that monitors `tasks/` and executes them |
| **Runner** | Abstraction for how commands are executed (Docker or Local) |
| **Worktree** | Isolated git working directory for a single task |
| **Harness** | Adversarial test suite that proves security properties |
| **fsSafe** | Wrapper for safe filesystem operations |
| **gitSafe** | Wrapper for safe git operations |
| **StreamScanner** | Overlap-aware secret pattern scanner |
| **Bead** | A unit of work tracked by the `bd` CLI |

---

*This document is the single source of truth for building Bridge Watcher.*
*Last updated: 2026-01-16*
