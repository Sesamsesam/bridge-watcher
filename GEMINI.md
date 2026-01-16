# Bridge Watcher

> Production-grade orchestration engine connecting AI planners to AI executors via Docker sandboxing.

## Global Rules

@docs/rules/AGENTS_CORE.md
@docs/rules/AGENTS_BRIDGE.md

## Project Overview

Bridge Watcher is the infrastructure layer of the Antigravity Bridge Protocol. It:
- Watches `.ai-handoff/tasks/` for new tasks
- Executes tasks in isolated Docker containers
- Runs verification commands (tests)
- Writes results to `.ai-handoff/results/`

## Security Model

All untrusted code runs in Docker with:
- `--network=none` (no exfiltration)
- `--read-only` (container filesystem)
- `--cap-drop=ALL` (minimal privileges)

## Build & Test

```bash
# Install dependencies
bun install

# Build Docker image
docker build -t bridge-runner:dev .

# Run security harness
bun run src/cli.ts harness

# Run typecheck
bun run typecheck
```

## Key Files

- `src/safe/` - Safe wrappers (fsSafe, gitSafe, StreamScanner)
- `src/runner/` - Docker runner implementation
- `src/watcher/` - Main watcher loop
- `src/harness/` - Adversarial security tests
- `src/cli.ts` - CLI entrypoint
