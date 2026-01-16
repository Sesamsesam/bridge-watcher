---
name: Docker Runner
description: Execute commands in a secure Docker sandbox with network isolation, read-only filesystem, and minimal capabilities. Use when running untrusted code or verifying AI-generated changes.
---

# Docker Runner Skill

Execute commands securely inside the `bridge-runner:dev` Docker container.

## When to Use

- Running untrusted code
- Verifying AI-generated changes
- Executing build/test commands in isolation
- Any operation that should not have network access

## Security Flags (Always Applied)

```bash
docker run --rm \
  --network=none \
  --read-only \
  --cap-drop=ALL \
  --security-opt=no-new-privileges \
  --memory=512m \
  --cpus=1 \
  -v /path/to/worktree:/workspace:rw \
  bridge-runner:dev \
  <command>
```

## Flag Explanations

| Flag | Purpose |
|------|---------|
| `--network=none` | Blocks all network access (exfiltration prevention) |
| `--read-only` | Container filesystem is read-only |
| `--cap-drop=ALL` | Removes all Linux capabilities |
| `--no-new-privileges` | Prevents privilege escalation |
| `--memory=512m` | Limits memory usage |
| `--cpus=1` | Limits CPU usage |

## Example Usage

```typescript
import { DockerRunner } from './src/runner/dockerRunner.js';

const runner = new DockerRunner();
const result = await runner.run({
  workdir: '/path/to/worktree',
  command: ['bun', 'test'],
  timeoutMs: 30000,
  env: { NODE_ENV: 'test' }
});

if (result.exitCode === 0) {
  console.log('Tests passed');
} else {
  console.error('Tests failed:', result.stderr);
}
```

## Prerequisites

1. Docker Desktop must be running
2. Image must be built: `docker build -t bridge-runner:dev .`

## NEVER Do

- Add `--privileged` flag
- Use `--network=host`
- Mount sensitive directories (`/`, `/etc`, `~/.ssh`)
- Run as root user inside container
