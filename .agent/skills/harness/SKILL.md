---
name: Security Harness
description: Run adversarial security tests to verify Bridge Watcher safety properties. Use when making changes to safe wrappers, Docker runner, or any security-critical code.
---

# Security Harness Skill

Run the 6 adversarial tests that prove Bridge Watcher security properties.

## When to Use

- After modifying `src/safe/` (fsSafe, gitSafe, streamScanner)
- After modifying `src/runner/` (DockerRunner)
- Before any PR that touches security logic
- When verifying a new installation

## Command

```bash
bun run src/cli.ts harness
```

## The 6 Tests

### 1. Symlink Race
**Property**: O_NOFOLLOW protects against file swap attacks
**Attack**: Swap file with symlink during read window
**Defense**: `fsSafe.read()` uses O_NOFOLLOW flag

### 2. Untracked Secret
**Property**: New files are scanned for secrets
**Attack**: Create new file with API key
**Defense**: `StreamScanner` with 8 core patterns

### 3. Overlap Leak
**Property**: Secrets spanning chunk boundaries are detected
**Attack**: Split secret across 8KB buffer boundary
**Defense**: 8KB overlap buffer in `StreamScanner`

### 4. Delete Escape
**Property**: Cleanup cannot delete outside root
**Attack**: Try to delete `../../../etc/passwd`
**Defense**: Path confinement in `fsSafe.unlink()`

### 5. Hook Trap
**Property**: Git hooks are disabled
**Attack**: Malicious `.git/hooks/pre-commit`
**Defense**: `core.hooksPath=/dev/null` in `gitSafe`

### 6. Exfil Attempt
**Property**: Network access is blocked
**Attack**: Try to curl external server
**Defense**: `--network=none` in Docker

## Expected Output

```
🔒 Running Bridge Watcher Security Harness

──────────────────────────────────────────────────
  Symlink Race... ✅ PASS
  Untracked Secret... ✅ PASS
  Overlap Leak... ✅ PASS
  Delete Escape... ✅ PASS
  Hook Trap... ✅ PASS
  Exfil Attempt... ✅ PASS
──────────────────────────────────────────────────

✅ 6/6 tests passed
```

## If a Test Fails

1. **DO NOT** commit or push
2. Check the test file in `src/harness/tests/`
3. Identify which safety property is broken
4. Fix the wrapper/runner code
5. Re-run harness until all pass
