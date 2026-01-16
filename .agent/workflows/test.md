---
description: Run security harness tests to verify all safety properties
---

# /test Workflow

Run the adversarial security harness to verify Bridge Watcher safety properties.

## Command

```bash
bun run src/cli.ts harness
```

## Expected Output

All 6 tests should pass:
- Symlink Race
- Untracked Secret
- Overlap Leak
- Delete Escape
- Hook Trap
- Exfil Attempt

## When to Run

- Before every commit to safe wrappers (`src/safe/`)
- Before every PR
- After any security-related changes
