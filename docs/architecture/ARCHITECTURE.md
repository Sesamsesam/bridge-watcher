# System Architecture

> **How all the pieces connect.**

---

## High-Level Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                         YOUR MACHINE                              │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────┐                                                  │
│  │ Antigravity │  ◀── You chat here (planning)                    │
│  │   (Gemini)  │                                                  │
│  └──────┬──────┘                                                  │
│         │ Creates task.json                                       │
│         ▼                                                         │
│  ┌─────────────────────────────────────────────┐                  │
│  │              App Repo (my-app/)             │                  │
│  │  ┌─────────────────────────────────────┐    │                  │
│  │  │         .ai-handoff/                │    │                  │
│  │  │  tasks/ → running/ → results/       │    │                  │
│  │  │  patches/ | logs/ | locks/          │    │                  │
│  │  └─────────────────────────────────────┘    │                  │
│  └──────────────────▲──────────────────────────┘                  │
│                     │                                             │
│  ┌──────────────────┴──────────────────┐                          │
│  │         Bridge Watcher              │ ◀── Host process         │
│  │  (runs on host, orchestrates)       │                          │
│  └──────────────────┬──────────────────┘                          │
│                     │ Spawns Docker containers                    │
│                     ▼                                             │
│  ┌─────────────────────────────────────────────────────────┐      │
│  │                   Docker Sandbox                         │      │
│  │  ┌─────────────────┐    ┌─────────────────┐             │      │
│  │  │    OpenCode     │    │    Verify       │             │      │
│  │  │   (edits files) │    │   (bun test)    │             │      │
│  │  └─────────────────┘    └─────────────────┘             │      │
│  │                                                          │      │
│  │  • Network: NONE (cannot exfiltrate)                    │      │
│  │  • Mount: Only /workspace                               │      │
│  │  • Privileges: Minimal                                  │      │
│  └─────────────────────────────────────────────────────────┘      │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Component Responsibilities

### Antigravity (Planner)
- **Role**: Plan work, create tasks
- **Input**: Your natural language requests
- **Output**: Task JSON files in `.ai-handoff/tasks/`
- **Runs**: In Gemini/Claude UI (browser or Antigravity extension)

### Bridge Watcher (Orchestrator)
- **Role**: Execute tasks safely
- **Input**: Task JSON from `tasks/`
- **Output**: Result JSON in `results/`, patches, logs
- **Runs**: On your host machine (Node.js/Bun process)
- **Key Feature**: Never executes untrusted code directly

### OpenCode (Executor)
- **Role**: Edit files based on task prompt
- **Input**: Task prompt + file scope
- **Output**: Modified files in worktree
- **Runs**: Inside Docker container (isolated)

### Docker Sandbox (Isolation)
- **Role**: Execute OpenCode + verification safely
- **Features**:
  - No network access
  - Read-only container filesystem
  - Only worktree is writable
  - Minimal privileges

---

## Data Flow

```
1. PLANNING
   You → Antigravity → task.json → .ai-handoff/tasks/

2. CLAIM
   Bridge reads tasks/ → moves to running/ → creates worktree

3. EDIT
   Bridge → Docker → OpenCode → modifies files in worktree

4. VERIFY
   Bridge → Docker → bun test → captures output

5. SCAN
   Bridge scans all output for secrets (overlap scanner)

6. RESULT
   Bridge writes results/{id}.json → patches → logs

7. CLEANUP
   Bridge removes worktree → releases lock → next task
```

---

## Directory Layout

```
~/dev/
├── bridge-watcher/              # Bridge tool repo
│   ├── src/
│   │   ├── cli.ts               # bridge init/run/harness
│   │   ├── watcher/loop.ts      # Main orchestration loop
│   │   ├── safe/                # fsSafe, gitSafe, streamScanner
│   │   └── runner/              # DockerRunner implementation
│   ├── Dockerfile               # bridge-runner:dev image
│   └── docs/                    # This documentation
│
└── my-app/                      # Your app repo
    ├── src/                     # Your application code
    ├── .ai-handoff/             # Bridge state (gitignored)
    │   ├── tasks/               # Inbox
    │   ├── running/             # Currently executing
    │   ├── results/             # Outcomes
    │   ├── patches/             # Git diffs
    │   ├── logs/                # Full logs (redacted)
    │   ├── locks/               # Worker + task locks
    │   └── tmp/                 # Worktrees (ws-{id}/)
    └── .gitignore               # Includes .ai-handoff/
```

---

## Security Layers

| Layer | What It Protects | How |
|-------|------------------|-----|
| **Docker Network** | Exfiltration | `--network=none` |
| **Docker Mounts** | Host filesystem | Only worktree mounted |
| **fsSafe** | Symlink attacks | `O_NOFOLLOW` + path confinement |
| **gitSafe** | Hook execution | `core.hooksPath=/dev/null` |
| **StreamScanner** | Secret leakage | Overlap-aware pattern matching |
| **Worktree** | Main repo corruption | Isolated git worktree per task |

---

## Process Lifecycle

```
Host Process (bridge run)
    │
    ├── Acquire worker lock
    │
    ├── For each task:
    │   ├── Acquire task lock
    │   ├── Create worktree (git worktree add)
    │   ├── Spawn Docker → OpenCode
    │   ├── Spawn Docker → bun test
    │   ├── Scan outputs (StreamScanner)
    │   ├── Write result.json
    │   ├── Remove worktree
    │   └── Release task lock
    │
    └── Release worker lock (on Ctrl+C)
```

---

## External Dependencies

| Dependency | Purpose | Required? |
|------------|---------|-----------|
| **Bun** | JavaScript runtime | Yes |
| **Docker** | Container isolation | Yes |
| **Git** | Version control | Yes |
| **OpenCode** | AI file editing | Yes |
| **gitleaks** | Secondary secret scanner | CI only |
| **simple-git** | Git operations library | Yes (bundled) |
