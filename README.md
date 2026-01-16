# Bridge Watcher

> Production-grade orchestration engine connecting Antigravity (planner) to OpenCode (executor) with Docker-based sandboxing.

## Quick Start

```bash
# Install dependencies
bun install

# Build Docker runner image
docker build -t bridge-runner:dev .

# Run security harness
bun run src/cli.ts harness

# Initialize in your app repo
bun run src/cli.ts init --repo ~/dev/my-app

# Start the watcher
bun run src/cli.ts run --repo ~/dev/my-app
```

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Antigravity │ ──▶ │   Bridge    │ ──▶ │   OpenCode  │
│  (Planner)  │     │  (Watcher)  │     │  (Executor) │
└─────────────┘     └─────────────┘     └─────────────┘
      │                    │                    │
      ▼                    ▼                    ▼
  Creates             Orchestrates          Edits files
  task.json           in Docker             in worktree
```

## Security Features

- **Docker sandbox**: All code runs with `--network=none`
- **fsSafe**: O_NOFOLLOW, path confinement, atomic writes
- **gitSafe**: Hooks disabled via `core.hooksPath=/dev/null`
- **StreamScanner**: 8KB overlap buffer catches split secrets
- **Secretless**: No .env files, runtime env vars only

## Commands

| Command | Description |
|---------|-------------|
| `bridge init` | Create .ai-handoff directory |
| `bridge run` | Start task processing loop |
| `bridge harness` | Run 6 adversarial tests |

## Documentation

See `docs/` for detailed documentation:
- `docs/architecture/BLUEPRINT.md` - Master specification
- `docs/guides/00_GETTING_STARTED.md` - Setup guide
- `docs/guides/01_DAILY_WORKFLOW.md` - Daily usage
